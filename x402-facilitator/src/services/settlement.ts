import { ethers } from 'ethers';
import { PaymentPayload, PaymentRequirements, SettleResponse } from '../types/index.js';
import config, { getRpcUrl, getEIP712Domain, getTokenByAddress } from '../config/index.js';
import logger from '../utils/logger.js';
import db from './database.js';
import redis from './redis.js';
import { transactionQueue } from './transactionQueue.js';
import webhookService from './webhook.js';
import paymasterPool from './paymasterPool.js';
import providerPool from './providerPool.js';
import priceService from './priceService.js';

// ERC-3009 ABI for gasless transfers with authorization
const ERC3009_ABI = [
  'function transferWithAuthorization(address from, address to, uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce, uint8 v, bytes32 r, bytes32 s)',
  'function balanceOf(address account) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function authorizationState(address authorizer, bytes32 nonce) view returns (bool)',
];

/**
 * Settlement service with multi-layer safety checks
 * Implements:
 * 1. Network validation (supported networks)
 * 2. Payer extraction
 * 3. Authorization and signature extraction
 * 4. Recipient verification (authorization.to === requirements.payTo)
 * 5. Signature verification (EIP-712)
 * 6. Time window validation (validAfter/validBefore)
 * 7. Amount matching validation
 * 8. Duplicate transaction detection
 * 9. Pre-settlement balance verification
 * 10. Replay attack protection (nonce checking)
 * 11. Gas estimation
 * 12. Transaction execution
 * 13. Transaction monitoring
 * 
 * Note: API key authentication (merchantAddress) is only used for:
 * - Rate limiting
 * - Webhook configuration
 * - Transaction history tracking
 * It does NOT restrict which addresses can receive payments.
 */
export class SettlementService {
  private pendingTransactions: Map<string, string> = new Map();

  /**
   * Get provider for specific network (from persistent pool)
   */
  private getProvider(network: string): ethers.JsonRpcProvider | ethers.WebSocketProvider {
    return providerPool.getProvider(network);
  }

  /**
   * Get native gas token for network
   */
  private getGasToken(network: string): string {
    const tokens: Record<string, string> = {
      'base-sepolia': 'ETH',
      'Base Sepolia': 'ETH',
      'eth-sepolia': 'ETH',
      'Ethereum Sepolia': 'ETH',
      'bsc-testnet': 'BNB',
      'BSC Testnet': 'BNB',
    };
    return tokens[network] || 'ETH';
  }

  constructor() {
    logger.info('Settlement service initialized');
  }

  /**
   * Main settlement method with safety checks
   * Uses facilitator's wallet as paymaster (pays gas fees)
   */
  async settle(
    payload: PaymentPayload,
    requirements: PaymentRequirements,
    merchantAddress: string
  ): Promise<SettleResponse> {
    // Normalize network name first for proper provider lookup
    const normalizedNetworkCheck = this.validateNetwork(requirements.network);
    const networkForProvider = normalizedNetworkCheck.normalizedNetwork || requirements.network;
    
    // Get provider for the specified network
    const provider = this.getProvider(networkForProvider);
    
    // Get next available paymaster wallet from pool (round-robin), connected to network provider
    const paymasterWallet = paymasterPool.getNextWallet(provider);
    
    logger.info(`Using paymaster wallet: ${paymasterWallet.address}`);
    logger.info(`Settling payment to merchant: ${merchantAddress}`);
    logger.info('=== STARTING PAYMENT SETTLEMENT ===');
    logger.info(`Network: ${requirements.network}`);
    logger.info(`Asset: ${requirements.asset}`);
    logger.info(`Amount: ${requirements.maxAmountRequired}`);

    // Track transaction ID for error handling
    let transactionId: number | null = null;

    try {
      // Safety Check 1: Validate network is supported
      const networkCheck = this.validateNetwork(requirements.network);
      if (!networkCheck.success) {
        return networkCheck.response;
      }
      const normalizedNetwork = networkCheck.normalizedNetwork!;

      // Safety Check 1.5: Validate token is supported on the network
      const tokenCheck = this.validateToken(normalizedNetwork, requirements.asset);
      if (!tokenCheck.success) {
        return tokenCheck.response;
      }

      // Safety Check 2: Extract payer information
      const payerResult = this.extractPayer(payload);
      if (!payerResult.success) {
        return payerResult.response;
      }
      const payer = payerResult.payer!;

      // Safety Check 3: Extract authorization and signature
      const authResult = this.extractAuthorization(payload);
      if (!authResult.success) {
        return authResult.response;
      }
      const { authorization, signature } = authResult;

      // Safety Check 4: Verify recipient matches (CRITICAL SECURITY)
      // This prevents authorization reuse - ensures payload.to matches requirements.payTo
      const recipientCheck = this.verifyRecipient(authorization!, requirements);
      if (!recipientCheck.success) {
        return recipientCheck.response;
      }

      // Safety Check 5: Verify signature matches payer
      // Use normalized network for domain lookup
      const normalizedRequirements = { ...requirements, network: normalizedNetwork };
      const sigCheck = await this.verifySignature(
        payer,
        signature!,
        authorization!,
        normalizedRequirements
      );
      if (!sigCheck.success) {
        return sigCheck.response;
      }

      // Safety Check 6: Verify time window (validAfter/validBefore)
      const timeCheck = this.verifyTimeWindow(authorization!);
      if (!timeCheck.success) {
        return timeCheck.response;
      }

      // Safety Check 7: Verify amount matches
      const amountCheck = this.verifyAmountMatch(
        authorization!.value,
        requirements.maxAmountRequired
      );
      if (!amountCheck.success) {
        return amountCheck.response;
      }

      // Safety Check 8: Check for duplicate transactions
      const dupCheck = this.checkDuplicateTransaction(payload, requirements);
      if (!dupCheck.success) {
        return dupCheck.response;
      }

      // Safety Check 9: Pre-settlement balance verification
      const preCheck = await this.preSettlementBalanceCheck(
        payer,
        requirements.asset,
        requirements.maxAmountRequired,
        requirements.network
      );
      if (!preCheck.success) {
        return preCheck.response;
      }

      // Setup token contract with ERC-3009 using facilitator as paymaster
      const tokenContract = new ethers.Contract(
        requirements.asset,
        ERC3009_ABI,
        paymasterWallet
      );

      const amount = BigInt(requirements.maxAmountRequired);
      const validAfter = BigInt(authorization!.validAfter);
      const validBefore = BigInt(authorization!.validBefore);
      const nonce = authorization!.nonce.trim();
      const payTo = requirements.payTo.trim();

      // Safety Check 10: Replay attack protection - check cache first, then on-chain
      // Check Redis cache for used nonce (fast path)
      const cachedTx = await redis.getNonceTransaction(payer, nonce);
      if (cachedTx) {
        logger.warn(`⛔ Nonce found in cache (already used): ${nonce} for payer: ${payer}`);
        logger.info(`   Cached transaction: ${cachedTx.transactionHash} (${cachedTx.status})`);
        
        // If transaction was completed, return success
        if (cachedTx.status === 'completed') {
          return {
            success: true,
            transaction: cachedTx.transactionHash,
            transactionHash: cachedTx.transactionHash,
            network: requirements.network,
            payer,
            status: 'completed',
            message: 'This payment was already settled successfully',
          };
        }
        
        // If preconfirmed (flashblock received, canonical finality pending)
        if (cachedTx.status === 'preconfirmed') {
          return {
            success: true,
            transaction: cachedTx.transactionHash,
            transactionHash: cachedTx.transactionHash,
            network: requirements.network,
            payer,
            status: 'preconfirmed',
            message: 'Payment confirmed via flashblock (canonical finality pending)',
          };
        }
        
        // If pending or failed, return error
        return {
          success: false,
          network: requirements.network,
          errorReason: cachedTx.status === 'pending'
            ? 'Transaction with this nonce is still pending'
            : 'Nonce already used - transaction previously failed',
          transactionHash: cachedTx.transactionHash,
          transactionStatus: cachedTx.status,
          status: cachedTx.status as 'pending' | 'failed',
          payer,
        };
      }

      // Check on-chain if not in cache (fallback for cache misses or restarts)
      try {
        // Debug logging for troubleshooting
        logger.debug(`🔍 Checking nonce state on-chain...`);
        logger.debug(`   Payer: ${payer} (type: ${typeof payer}, length: ${payer.length})`);
        logger.debug(`   Nonce: ${nonce} (type: ${typeof nonce}, length: ${nonce.length})`);
        logger.debug(`   Token Contract: ${requirements.asset}`);
        logger.debug(`   Network: ${requirements.network}`);
        
        const isNonceUsed = await tokenContract.authorizationState(payer, nonce);
        if (isNonceUsed) {
          logger.warn(`⛔ Nonce already used on-chain: ${nonce} for payer: ${payer}`);
          // We don't have the tx hash from on-chain check, just mark as used
          return {
            success: false,
            network: requirements.network,
            errorReason: 'Nonce already used - transaction previously executed (found on-chain)',
          };
        }
        logger.debug(`✓ Nonce ${nonce} not yet used (cache miss, checked on-chain)`);
      } catch (error) {
        logger.error('Failed to check nonce state:', error);
        if (error instanceof Error) {
          logger.error('Error details:', {
            message: error.message,
            code: (error as any).code,
            data: (error as any).data,
            info: (error as any).info,
          });
        }
        return {
          success: false,
          network: requirements.network,
          errorReason: 'Failed to verify nonce state',
        };
      }

      // Split signature into v, r, s components for ERC-3009
      const sig = ethers.Signature.from(signature!.trim());

      logger.info(`📤 Executing transferWithAuthorization: ${payer} -> ${payTo}, amount: ${amount.toString()}`);
      logger.info(`   Paymaster: ${paymasterWallet.address} (paying gas fees)`);
      logger.info(`   ValidAfter: ${validAfter}, ValidBefore: ${validBefore}`);
      logger.info(`   Nonce: ${nonce}`);
      logger.info(`   Signature v=${sig.v}, r=${sig.r}, s=${sig.s}`);

      // Save transaction to database as pending
      try {
        // Check if transaction with this nonce already exists in database
        const existingTx = await db.getTransactionByNonce(payer, nonce);
        if (existingTx) {
          logger.warn(`⛔ Transaction with nonce ${nonce} already exists in database (ID: ${existingTx.id}, Status: ${existingTx.status})`);
          
          // If transaction was completed successfully, return success with transaction hash
          if (existingTx.status === 'completed') {
            return {
              success: true,
              transaction: existingTx.transaction_hash,
              transactionHash: existingTx.transaction_hash,
              network: requirements.network,
              payer,
              status: 'completed',
              message: 'This payment was already settled successfully',
            };
          }
          
          // If transaction is pending or failed, return error
          return {
            success: false,
            network: requirements.network,
            errorReason: existingTx.status === 'pending' 
              ? 'Transaction with this nonce is still pending'
              : 'Nonce already used - transaction previously failed',
            transactionHash: existingTx.transaction_hash,
            transactionStatus: existingTx.status,
            status: existingTx.status,
            payer,
          };
        }

        transactionId = await db.saveTransaction({
          recipientAddress: merchantAddress,
          payerAddress: payer,
          nonce: nonce,
          validAfter: validAfter.toString(),
          validBefore: validBefore.toString(),
          signature: signature!.trim(),
          amount: requirements.maxAmountRequired,
          asset: requirements.asset,
          network: requirements.network,
          resource: requirements.resource,
          description: requirements.description,
          mimeType: requirements.mimeType,
          status: 'pending',
          timeoutSeconds: requirements.maxTimeoutSeconds || 3600,
        });
        logger.info(`💾 Transaction saved to database with ID: ${transactionId}`);
      } catch (dbError) {
        logger.warn('Failed to save transaction to database:', dbError);
      }

      // Execute the transaction using ERC-3009 transferWithAuthorization
      // Using the v, r, s split signature version
      // Queue transactions per wallet to prevent nonce conflicts
      const paymasterAddress = await paymasterWallet.getAddress();
      
      // Get merchant ID for gas tracking
      let merchantId: number | undefined;
      try {
        const merchant = await db.getMerchantByAddress(merchantAddress);
        merchantId = merchant?.id;
      } catch (e) {
        logger.warn('Could not get merchant ID for gas tracking');
      }
      
      // Track balance before transaction
      const balanceBefore = await provider.getBalance(paymasterAddress);
      
      const tx = await transactionQueue.execute(paymasterAddress, async () => {
        logger.info(`📤 [Queue] Executing transaction for wallet ${paymasterAddress}`);
        return await tokenContract.transferWithAuthorization(
          payer,
          payTo,
          amount,
          validAfter,
          validBefore,
          nonce,
          sig.v,
          sig.r,
          sig.s,
          {
            gasLimit: config.settlementGasLimit,
          }
        );
      });

      // Track pending transaction
      const txKey = this.getTransactionKey(payload, requirements);
      this.pendingTransactions.set(txKey, tx.hash);

      // Update database with transaction hash immediately after submission
      if (transactionId) {
        try {
          await db.updateTransaction(transactionId, 'pending', tx.hash);
          logger.info(`💾 Transaction ${transactionId} updated with hash: ${tx.hash}`);
        } catch (dbError) {
          logger.warn('Failed to update transaction with hash:', dbError);
        }
      }

      // Cache the nonce as used immediately with pending status
      await redis.cacheUsedNonce(payer, nonce, tx.hash, 'pending');
      
      // Log submission event
      if (transactionId) {
        try {
          await db.logTransactionEvent({
            transactionId,
            transactionHash: tx.hash,
            eventType: 'submitted',
            toStatus: 'pending',
          });
        } catch (error) {
          logger.warn('Failed to log submission event:', error);
        }
      }

      logger.info(`⏳ Transaction sent: ${tx.hash}`);
      logger.info(`   Paymaster: ${paymasterWallet.address}`);

      // FLASHBLOCK FAST PATH: Try to get flashblock preconfirmation (~200-500ms)
      // This allows immediate merchant response for better UX
      const flashblockReceipt = await this.waitForFlashblock(tx.hash, requirements.network);
      
      if (flashblockReceipt && flashblockReceipt.status === 1) {
        // ⚡ FLASHBLOCK PRECONFIRMATION RECEIVED - Return immediately to merchant!
        logger.info(`⚡ Flashblock preconfirmation successful. Returning immediately to merchant.`);
        logger.info(`   Post-transaction processing will continue in background.`);
        
        // Process everything else asynchronously (don't block merchant response)
        setImmediate(() => {
          this.processPostTransactionAsync(
            tx,
            flashblockReceipt,
            transactionId,
            merchantAddress,
            payer,
            requirements,
            nonce,
            paymasterAddress,
            balanceBefore,
            txKey
          ).catch(error => {
            logger.error('Async post-processing error:', error);
          });
        });
        
        return {
          success: true,
          transaction: tx.hash,
          network: requirements.network,
          payer,
          status: 'preconfirmed', // Soft confirmation via flashblock
          message: 'Payment confirmed via flashblock (canonical finality pending)',
        };
      }
      
      // FALLBACK: No flashblock available, use standard confirmation flow
      logger.info(`   No flashblock available, waiting for standard confirmation (${config.settlementTimeoutMs/1000}s timeout)...`);
      
      const receipt = await this.waitForTransaction(tx.hash, config.settlementTimeoutMs, requirements.network);
      
      if (receipt && receipt.status === 1) {
        // Transaction confirmed quickly!
        logger.info(`✅ Settlement successful. TX: ${tx.hash}`);
        
        // Track gas usage
        try {
          const balanceAfter = await provider.getBalance(paymasterAddress);
          const gasUsed = receipt.gasUsed;
          const effectiveGasPrice = receipt.gasPrice || 0n;
          const gasCostWei = gasUsed * effectiveGasPrice;
          const gasCostNative = ethers.formatEther(gasCostWei);
          const gasCostGwei = ethers.formatUnits(gasCostWei, 'gwei');
          
          await db.saveGasTracking({
            transactionId: transactionId || undefined,
            merchantId,
            operationType: 'settlement',
            network: requirements.network,
            transactionHash: tx.hash,
            gasToken: this.getGasToken(requirements.network),
            gasUsed,
            gasPrice: effectiveGasPrice.toString(),
            gasCostWei: gasCostWei.toString(),
            gasCostNative,
            balanceBefore: balanceBefore.toString(),
            balanceAfter: balanceAfter.toString(),
            status: 'success',
            blockNumber: receipt.blockNumber ? BigInt(receipt.blockNumber) : undefined,
          });
          
          const gasCostFormatted = priceService.formatWithPrice(requirements.network, gasCostWei);
          logger.info(`⛽ Gas used: ${gasUsed.toString()} units @ ${ethers.formatUnits(effectiveGasPrice, 'gwei')} gwei, Cost: ${gasCostGwei} gwei (${gasCostFormatted})`);
          logger.info(`   Paid by paymaster: ${paymasterWallet.address}`);
        } catch (gasError) {
          logger.warn('Failed to track gas usage:', gasError);
        }
        
        // Update cache with completed status
        await redis.cacheUsedNonce(payer, nonce, tx.hash, 'completed');
        
        // Update transaction status in database
        if (transactionId) {
          try {
            await db.updateTransaction(transactionId, 'completed', tx.hash);
            logger.info(`💾 Transaction ${transactionId} marked as completed`);
          } catch (dbError) {
            logger.warn('Failed to update transaction status:', dbError);
          }
        }
        
        // Send webhook notification immediately
        if (transactionId) {
          await this.sendWebhookNotification(transactionId, merchantAddress, payer, requirements, tx.hash, 'completed');
        }
        
        // Remove from pending
        this.pendingTransactions.delete(txKey);

        return {
          success: true,
          transaction: tx.hash,
          network: requirements.network,
          payer,
          status: 'completed',
        };
      } else if (receipt && receipt.status === 0) {
        // Transaction failed
        logger.error(`❌ Transaction failed or reverted. TX: ${tx.hash}`);
        
        // Track gas usage even for failed transactions (gas is still consumed)
        try {
          const balanceAfter = await provider.getBalance(paymasterAddress);
          const gasUsed = receipt.gasUsed;
          const effectiveGasPrice = receipt.gasPrice || 0n;
          const gasCostWei = gasUsed * effectiveGasPrice;
          const gasCostNative = ethers.formatEther(gasCostWei);
          const gasCostGwei = ethers.formatUnits(gasCostWei, 'gwei');
          
          await db.saveGasTracking({
            transactionId: transactionId || undefined,
            merchantId,
            operationType: 'settlement',
            network: requirements.network,
            transactionHash: tx.hash,
            gasToken: this.getGasToken(requirements.network),
            gasUsed,
            gasPrice: effectiveGasPrice.toString(),
            gasCostWei: gasCostWei.toString(),
            gasCostNative,
            balanceBefore: balanceBefore.toString(),
            balanceAfter: balanceAfter.toString(),
            status: 'reverted',
            errorMessage: 'Transaction reverted on-chain',
            blockNumber: receipt.blockNumber ? BigInt(receipt.blockNumber) : undefined,
          });
          
          logger.warn(`⛽ Gas wasted on failed tx: ${gasUsed.toString()} units @ ${ethers.formatUnits(effectiveGasPrice, 'gwei')} gwei, Cost: ${gasCostGwei} gwei (${gasCostNative} ${this.getGasToken(requirements.network)})`);
        } catch (gasError) {
          logger.warn('Failed to track gas usage for failed transaction:', gasError);
        }
        
        // Update cache with failed status
        await redis.cacheUsedNonce(payer, nonce, tx.hash, 'failed');
        
        // Update transaction status as failed
        if (transactionId) {
          try {
            await db.updateTransaction(transactionId, 'failed', tx.hash);
            logger.info(`💾 Transaction ${transactionId} marked as failed`);
          } catch (dbError) {
            logger.warn('Failed to update transaction status:', dbError);
          }
        }
        
        // Send webhook notification
        if (transactionId) {
          await this.sendWebhookNotification(transactionId, merchantAddress, payer, requirements, tx.hash, 'failed');
        }
        
        return {
          success: false,
          network: requirements.network,
          errorReason: 'Transaction failed or reverted',
          payer,
          status: 'failed',
        };
      } else {
        // Timeout - transaction still pending
        // Let background monitor handle confirmation
        logger.info(`⏱️ Transaction pending (30s timeout). Monitor will check status. TX: ${tx.hash}`);
        
        // Send webhook notification for pending status
        if (transactionId) {
          await this.sendWebhookNotification(transactionId, merchantAddress, payer, requirements, tx.hash, 'pending');
        }
        
        return {
          success: true,
          transaction: tx.hash,
          network: requirements.network,
          payer,
          status: 'pending',
          message: 'Transaction submitted and pending confirmation. This may take 1-2 minutes.',
        };
      }

    } catch (error) {
      logger.error('❌ Settlement error:', error);
      
      // Track failed operation (no gas consumed if tx didn't submit)
      try {
        let merchantId: number | undefined;
        try {
          const merchant = await db.getMerchantByAddress(merchantAddress);
          merchantId = merchant?.id;
        } catch (e) {
          // Ignore if merchant lookup fails
        }
        
        await db.saveGasTracking({
          transactionId: transactionId || undefined,
          merchantId,
          operationType: 'settlement',
          network: requirements.network,
          gasToken: this.getGasToken(requirements.network),
          status: 'failed',
          errorMessage: error instanceof Error ? error.message : 'Unknown error',
        });
      } catch (gasError) {
        logger.warn('Failed to track failed gas operation:', gasError);
      }
      
      // Update transaction status to failed if we saved it as pending
      if (transactionId) {
        try {
          await db.updateTransaction(transactionId, 'failed', undefined);
          logger.info(`💾 Transaction ${transactionId} marked as failed (error during submission)`);
        } catch (dbError) {
          logger.warn('Failed to update transaction status:', dbError);
        }
      }
      
      let errorReason = 'Settlement failed';
      if (error instanceof Error) {
        errorReason = error.message;
        
        // Parse common errors
        if (error.message.includes('insufficient funds')) {
          errorReason = 'Merchant has insufficient funds for gas';
        } else if (error.message.includes('nonce')) {
          errorReason = 'Transaction nonce error. Please retry';
        } else if (error.message.includes('gas')) {
          errorReason = 'Gas estimation or execution failed';
        } else if (error.message.includes('replacement transaction underpriced') || error.message.includes('REPLACEMENT_UNDERPRICED')) {
          errorReason = 'Transaction nonce conflict. System is processing previous transaction.';
        }
      }

      return {
        success: false,
        network: requirements.network,
        errorReason,
        status: 'failed',
      };
    }
  }

  /**
   * Extract payer from payload
   */
  private extractPayer(payload: PaymentPayload): { success: boolean; payer?: string; response: SettleResponse } {
    const payer = payload.authorization?.from?.trim();
    
    // Debug logging
    if (payload.authorization?.from) {
      logger.debug(`🔍 Raw payer from payload: "${payload.authorization.from}" (type: ${typeof payload.authorization.from})`);
      logger.debug(`   Trimmed payer: "${payer}"`);
    }

    if (!payer) {
      logger.warn('Could not extract payer address from payload');
      logger.warn('Payload structure:', JSON.stringify(payload, null, 2));
      return {
        success: false,
        response: {
          success: false,
          network: 'unknown',
          errorReason: 'Could not extract payer address from payload',
        },
      };
    }

    logger.debug(`✓ Payer extracted: ${payer}`);
    return { success: true, payer, response: { success: true, network: 'unknown' } };
  }

  /**
   * Extract authorization and signature from payload
   */
  private extractAuthorization(payload: PaymentPayload): { 
    success: boolean; 
    authorization?: any; 
    signature?: string;
    response: SettleResponse 
  } {
    const authorization = payload.authorization;
    const signature = payload.signature;
    
    // Debug logging
    if (authorization) {
      logger.debug(`🔍 Authorization extracted:`, {
        from: authorization?.from,
        to: authorization?.to,
        value: authorization?.value,
        validAfter: authorization?.validAfter,
        validBefore: authorization?.validBefore,
        nonce: authorization?.nonce,
        nonceType: typeof authorization?.nonce,
        nonceLength: authorization?.nonce?.length,
      });
      logger.debug(`   Signature: ${signature?.substring(0, 20)}...${signature?.substring(signature.length - 10)}`);
    }

    if (!authorization || !signature) {
      logger.warn('Could not extract authorization or signature from payload');
      return {
        success: false,
        response: {
          success: false,
          network: 'unknown',
          errorReason: 'Could not extract authorization or signature from payload',
        },
      };
    }

    logger.debug(`✓ Authorization extracted with signature`);
    return { success: true, authorization, signature, response: { success: true, network: 'unknown' } };
  }

  /**
   * Check for duplicate transactions
   */
  private checkDuplicateTransaction(
    payload: PaymentPayload,
    requirements: PaymentRequirements
  ): { success: boolean; response: SettleResponse } {
    const txKey = this.getTransactionKey(payload, requirements);
    const existingTx = this.pendingTransactions.get(txKey);

    if (existingTx) {
      logger.warn(`Duplicate transaction detected. Existing TX: ${existingTx}`);
      return {
        success: false,
        response: {
          success: false,
          network: requirements.network,
          errorReason: `Transaction already pending: ${existingTx}`,
        },
      };
    }

    logger.debug(`✓ No duplicate transaction found`);
    return { success: true, response: { success: true, network: requirements.network } };
  }

  /**
   * Pre-settlement balance validation (no allowance needed for ERC-3009)
   */
  private async preSettlementBalanceCheck(
    payer: string,
    asset: string,
    amount: string,
    network: string
  ): Promise<{ success: boolean; response: SettleResponse }> {
    try {
      const provider = this.getProvider(network);
      const tokenContract = new ethers.Contract(asset, ERC3009_ABI, provider);
      const required = BigInt(amount);

      // Check balance only - no allowance needed for transferWithAuthorization
      const balance = await tokenContract.balanceOf(payer);
      if (balance < required) {
        logger.warn(`Pre-settlement check failed: Insufficient balance`);
        return {
          success: false,
          response: {
            success: false,
            network: 'unknown',
            errorReason: `Insufficient balance at settlement time. Has ${balance.toString()}, needs ${required.toString()}`,
          },
        };
      }

      logger.debug(`✓ Pre-settlement balance check passed: ${balance.toString()}`);
      return { success: true, response: { success: true, network: 'unknown' } };

    } catch (error) {
      logger.error('Pre-settlement balance check error:', error);
      return {
        success: false,
        response: {
          success: false,
          network: 'unknown',
          errorReason: `Pre-settlement check failed: ${error instanceof Error ? error.message : String(error)}`,
        },
      };
    }
  }

  /**
   * Wait for flashblock preconfirmation ONLY (fast path for immediate merchant response)
   * Returns receipt within ~200-500ms or null if not available
   */
  private async waitForFlashblock(
    txHash: string,
    network: string
  ): Promise<ethers.TransactionReceipt | null> {
    const networkLower = network.toLowerCase();
    // Flashblock-enabled networks: Base, Optimism (including testnets), Unichain
    // Note: Alchemy WebSocket RPC automatically includes flashblock data in responses
    const isFlashblockNetwork = 
      networkLower.includes('base') ||           // Base Sepolia, Base Mainnet
      networkLower.includes('optimism') ||      // Optimism Mainnet
      networkLower.includes('op sepolia') ||    // OP Sepolia testnet
      networkLower.includes('op ') ||           // Other OP chains
      networkLower.includes('unichain');        // Unichain Sepolia, Mainnet
    
    if (!isFlashblockNetwork) {
      logger.debug(`Network ${network} does not support flashblocks, skipping fast path`);
      return null;
    }
    
    const provider = this.getProvider(network);
    const startTime = Date.now();
    const maxWait = 500; // 500ms max for flashblock preconfirmation
    const pollInterval = 50; // Poll every 50ms for instant response
    
    logger.debug(`⚡ Waiting for flashblock preconfirmation (max ${maxWait}ms)...`);
    
    while (Date.now() - startTime < maxWait) {
      try {
        const receipt = await provider.getTransactionReceipt(txHash);
        if (receipt) {
          const elapsed = Date.now() - startTime;
          logger.info(`⚡ Flashblock preconfirmation received in ${elapsed}ms`);
          return receipt;
        }
      } catch (error) {
        // Ignore errors during aggressive polling
      }
      
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }
    
    logger.debug(`No flashblock received within ${maxWait}ms, falling back to standard confirmation`);
    return null;
  }

  /**
   * Wait for transaction with timeout
   * Optimized for Flashblock-enabled networks (Base, Optimism, Unichain):
   * Polls aggressively in first 1.5s for ~200ms preconfirmations
   */
  private async waitForTransaction(
    txHash: string,
    timeoutMs: number,
    network: string
  ): Promise<ethers.TransactionReceipt | null> {
    const provider = this.getProvider(network);
    const startTime = Date.now();
    
    // For networks with flashblock/fast preconfirmation support (Base, Optimism, Unichain)
    const networkLower = network.toLowerCase();
    const isFlashblockSupportedNetwork = 
      networkLower.includes('base') || 
      networkLower.includes('optimism') || 
      networkLower.includes('unichain');
    
    if (isFlashblockSupportedNetwork) {
      logger.debug(`⚡ Using Flashblock-optimized polling for ${network}`);
      
      // Phase 1: Aggressive polling for flashblock preconfirmation (first 1.5 seconds)
      // Flashblock-enabled networks (Base, Optimism, Unichain) confirm in ~200-400ms typically
      const flashblockPhaseMs = 1500;
      const flashblockPollInterval = 100; // Poll every 100ms
      
      while (Date.now() - startTime < flashblockPhaseMs) {
        try {
          const receipt = await provider.getTransactionReceipt(txHash);
          if (receipt) {
            const elapsed = Date.now() - startTime;
            logger.info(`⚡ Flashblock preconfirmation received in ${elapsed}ms`);
            return receipt;
          }
        } catch (error) {
          // Ignore errors during polling, continue
        }
        
        // Wait before next poll
        await new Promise(resolve => setTimeout(resolve, flashblockPollInterval));
      }
      
      logger.debug(`Phase 1 complete (1.5s). Switching to standard polling...`);
    }
    
    // Phase 2: Standard wait with timeout (for non-Base or after flashblock phase)
    let timeoutId: NodeJS.Timeout;
    
    const remainingTimeout = timeoutMs - (Date.now() - startTime);
    if (remainingTimeout <= 0) {
      logger.info(`⏱️ Transaction ${txHash} still pending, will be monitored in background`);
      return null;
    }
    
    const timeout = new Promise<null>((resolve) => {
      timeoutId = setTimeout(() => {
        logger.info(`⏱️ Transaction ${txHash} still pending after ${timeoutMs/1000}s, will be monitored in background`);
        resolve(null);
      }, remainingTimeout);
    });

    const receiptPromise = provider.waitForTransaction(txHash);

    const result = await Promise.race([receiptPromise, timeout]);
    
    // Cancel timeout if receipt arrived first
    if (result !== null) {
      clearTimeout(timeoutId!);
    }
    
    return result;
  }

  /**
   * Generate unique key for transaction tracking
   */
  private getTransactionKey(payload: PaymentPayload, requirements: PaymentRequirements): string {
    return `${payload.authorization.from}-${requirements.asset}-${payload.authorization.nonce}`;
  }

  /**
   * Get pending transaction status
   */
  async getPendingTransaction(
    payload: PaymentPayload,
    requirements: PaymentRequirements
  ): Promise<string | undefined> {
    const txKey = this.getTransactionKey(payload, requirements);
    return this.pendingTransactions.get(txKey);
  }

  /**
   * Validate network is supported
   */
  private validateNetwork(network: string): { success: boolean; response: SettleResponse; normalizedNetwork?: string } {
    const allNetworks = [...config.mainnetNetworks, ...config.testnetNetworks];
    
    // Try exact match first (case-insensitive)
    const exactMatch = allNetworks.find(n => n.toLowerCase() === network.toLowerCase());
    if (exactMatch) {
      logger.debug(`✓ Network validation passed (exact match): ${exactMatch}`);
      return { success: true, response: { success: true, network: exactMatch }, normalizedNetwork: exactMatch };
    }
    
    // Fallback: Normalize network name to title case for case-insensitive comparison
    const normalizedNetwork = network.split(/[-_\s]+/).map(word => 
      word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    ).join(' ');
    
    if (!allNetworks.includes(normalizedNetwork)) {
      logger.warn(`❌ Unsupported network in settlement: ${network}`);
      return {
        success: false,
        response: {
          success: false,
          network: normalizedNetwork,
          errorReason: `Network '${network}' is not supported. Supported networks: ${allNetworks.join(', ')}`,
        },
      };
    }
    logger.debug(`✓ Network validation passed: ${normalizedNetwork}`);
    return { success: true, response: { success: true, network: normalizedNetwork }, normalizedNetwork };
  }

  /**
   * Validate token is supported on the network
   */
  private validateToken(network: string, tokenAddress: string): { success: boolean; response: SettleResponse } {
    const token = getTokenByAddress(network, tokenAddress);
    if (!token) {
      logger.warn(`❌ Unsupported token in settlement: ${tokenAddress} on network: ${network}`);
      const networkConfig = config.networks[network];
      const supportedTokens = networkConfig?.tokens.map(t => `${t.symbol} (${t.address})`).join(', ') || 'none';
      return {
        success: false,
        response: {
          success: false,
          network,
          errorReason: `Token '${tokenAddress}' is not supported on network '${network}'. Supported tokens: ${supportedTokens}`,
        },
      };
    }
    logger.debug(`✓ Token validation passed: ${token.symbol} (${token.address})`);
    return { success: true, response: { success: true, network } };
  }

  /**
   * Verify signature matches payer (EIP-712 for ERC-3009)
   */
  private async verifySignature(
    payer: string,
    signature: string,
    authorization: any,
    requirements: PaymentRequirements
  ): Promise<{ success: boolean; response: SettleResponse }> {
    try {
      // Get EIP-712 domain for this network and token
      const domain = getEIP712Domain(requirements.network, requirements.asset);
      
      if (!domain) {
        logger.warn(`No EIP-712 domain config for ${requirements.network}/${requirements.asset}`);
        return {
          success: false,
          response: {
            success: false,
            network: requirements.network,
            errorReason: 'Token does not support ERC-3009 transferWithAuthorization',
          },
        };
      }

      // Verify EIP-712 typed data signature
      const types = {
        TransferWithAuthorization: [
          { name: 'from', type: 'address' },
          { name: 'to', type: 'address' },
          { name: 'value', type: 'uint256' },
          { name: 'validAfter', type: 'uint256' },
          { name: 'validBefore', type: 'uint256' },
          { name: 'nonce', type: 'bytes32' },
        ],
      };

      const value = {
        from: authorization.from,
        to: authorization.to,
        value: authorization.value,
        validAfter: parseInt(authorization.validAfter),
        validBefore: parseInt(authorization.validBefore),
        nonce: authorization.nonce,
      };

      const recoveredAddress = ethers.verifyTypedData(domain, types, value, signature);

      if (recoveredAddress.toLowerCase() !== payer.toLowerCase()) {
        logger.warn(`Signature verification failed. Expected ${payer}, got ${recoveredAddress}`);
        return {
          success: false,
          response: {
            success: false,
            network: requirements.network,
            errorReason: `Invalid signature. Expected signer: ${payer}, got: ${recoveredAddress}`,
          },
        };
      }

      logger.debug(`✓ Signature verification passed`);
      return { success: true, response: { success: true, network: requirements.network } };

    } catch (error) {
      logger.error('Signature verification error:', error);
      return {
        success: false,
        response: {
          success: false,
          network: requirements.network,
          errorReason: `Signature verification failed: ${error instanceof Error ? error.message : String(error)}`,
        },
      };
    }
  }

  /**
   * Verify recipient matches (CRITICAL SECURITY CHECK)
   */
  private verifyRecipient(authorization: any, requirements: PaymentRequirements): { success: boolean; response: SettleResponse } {
    const authTo = authorization.to.toLowerCase();
    const reqTo = requirements.payTo.toLowerCase();
    
    if (authTo !== reqTo) {
      logger.warn(`⚠️ SECURITY: Recipient mismatch! Signed for: ${authTo}, Required: ${reqTo}`);
      return {
        success: false,
        response: {
          success: false,
          network: requirements.network,
          errorReason: `Recipient mismatch. Payment authorized for ${authTo}, but requirements specify ${reqTo}. Possible attack attempt.`,
        },
      };
    }
    
    logger.debug(`✓ Recipient verification passed: ${reqTo}`);
    return { success: true, response: { success: true, network: requirements.network } };
  }

  /**
   * Verify time window (validAfter/validBefore)
   */
  private verifyTimeWindow(authorization: any): { success: boolean; response: SettleResponse } {
    const now = Math.floor(Date.now() / 1000);
    const validAfter = parseInt(authorization.validAfter, 10);
    const validBefore = parseInt(authorization.validBefore, 10);

    if (now < validAfter) {
      logger.warn(`Payment not yet valid. Current: ${now}, Valid after: ${validAfter}`);
      return {
        success: false,
        response: {
          success: false,
          network: 'unknown',
          errorReason: 'Payment authorization not yet valid',
        },
      };
    }

    if (now > validBefore) {
      logger.warn(`Payment expired. Current: ${now}, Valid before: ${validBefore}`);
      return {
        success: false,
        response: {
          success: false,
          network: 'unknown',
          errorReason: 'Payment authorization expired',
        },
      };
    }

    logger.debug(`✓ Time window validation passed`);
    return { success: true, response: { success: true, network: 'unknown' } };
  }

  /**
   * Verify amount matches between authorization and requirements
   */
  private verifyAmountMatch(authAmount: string, requiredAmount: string): { success: boolean; response: SettleResponse } {
    const auth = BigInt(authAmount);
    const required = BigInt(requiredAmount);

    if (auth !== required) {
      logger.warn(`Amount mismatch. Authorization: ${auth.toString()}, Required: ${required.toString()}`);
      return {
        success: false,
        response: {
          success: false,
          network: 'unknown',
          errorReason: `Amount mismatch. Authorization amount (${auth.toString()}) doesn't match required amount (${required.toString()})`,
        },
      };
    }

    logger.debug(`✓ Amount verification passed`);
    return { success: true, response: { success: true, network: 'unknown' } };
  }

  /**
   * Process post-transaction tasks asynchronously (after merchant response sent)
   * Handles: gas tracking, database updates, webhooks, canonical finality monitoring
   */
  private async processPostTransactionAsync(
    tx: ethers.ContractTransactionResponse,
    receipt: ethers.TransactionReceipt,
    transactionId: number | null,
    merchantAddress: string,
    payer: string,
    requirements: PaymentRequirements,
    nonce: string,
    paymasterAddress: string,
    balanceBefore: bigint,
    txKey: string
  ): Promise<void> {
    try {
      logger.debug(`🔄 Starting async post-transaction processing for TX: ${tx.hash}`);
      
      const provider = this.getProvider(requirements.network);
      let merchantId: number | undefined;
      
      // Get merchant ID for gas tracking
      try {
        const merchant = await db.getMerchantByAddress(merchantAddress);
        merchantId = merchant?.id;
      } catch (e) {
        logger.warn('Could not get merchant ID for gas tracking');
      }
      
      // Track gas usage
      if (receipt && receipt.status === 1) {
        try {
          const balanceAfter = await provider.getBalance(paymasterAddress);
          const gasUsed = receipt.gasUsed;
          const effectiveGasPrice = receipt.gasPrice || 0n;
          const gasCostWei = gasUsed * effectiveGasPrice;
          const gasCostNative = ethers.formatEther(gasCostWei);
          const gasCostGwei = ethers.formatUnits(gasCostWei, 'gwei');
          const gasCostFormatted = priceService.formatWithPrice(requirements.network, gasCostWei);
          
          await db.saveGasTracking({
            transactionId: transactionId || undefined,
            merchantId,
            operationType: 'settlement',
            network: requirements.network,
            transactionHash: tx.hash,
            gasToken: this.getGasToken(requirements.network),
            gasUsed,
            gasPrice: effectiveGasPrice.toString(),
            gasCostWei: gasCostWei.toString(),
            gasCostNative,
            balanceBefore: balanceBefore.toString(),
            balanceAfter: balanceAfter.toString(),
            status: 'success',
            blockNumber: receipt.blockNumber ? BigInt(receipt.blockNumber) : undefined,
          });
          
          logger.info(`⛽ Gas used: ${gasUsed.toString()} units @ ${ethers.formatUnits(effectiveGasPrice, 'gwei')} gwei, Cost: ${gasCostGwei} gwei (${gasCostFormatted})`);
        } catch (gasError) {
          logger.warn('Failed to track gas usage:', gasError);
        }
      }
      
      // Update cache with completed status
      await redis.cacheUsedNonce(payer, nonce, tx.hash, 'completed');
      
      // Log preconfirmation event (flashblock received)
      if (transactionId) {
        try {
          await db.logTransactionEvent({
            transactionId,
            transactionHash: tx.hash,
            eventType: 'preconfirmed',
            fromStatus: 'pending',
            toStatus: 'preconfirmed',
            blockNumber: receipt.blockNumber ? BigInt(receipt.blockNumber) : undefined,
          });
        } catch (error) {
          logger.warn('Failed to log preconfirmation event:', error);
        }
      }
      
      // Update transaction status in database
      if (transactionId) {
        try {
          await db.updateTransaction(transactionId, 'completed', tx.hash);
          logger.info(`💾 Transaction ${transactionId} marked as completed`);
        } catch (dbError) {
          logger.warn('Failed to update transaction status:', dbError);
        }
      }
      
      // Send webhook notification
      if (transactionId) {
        await this.sendWebhookNotification(transactionId, merchantAddress, payer, requirements, tx.hash, 'completed');
      }
      
      // Monitor for canonical finality (2s block on flashblock networks)
      await this.monitorCanonicalFinality(tx.hash, transactionId, requirements.network, txKey);
      
      logger.debug(`✅ Async post-transaction processing complete for TX: ${tx.hash}`);
      
    } catch (error) {
      logger.error('❌ Post-transaction processing error:', error);
      // Don't fail - payment already confirmed to merchant via flashblock
      // Background monitor will catch any issues
    }
  }

  /**
   * Monitor transaction for canonical finality (2s block confirmation)
   * Handles reorgs if they occur (0.2% chance on flashblock networks)
   */
  private async monitorCanonicalFinality(
    txHash: string,
    transactionId: number | null,
    network: string,
    txKey: string
  ): Promise<void> {
    try {
      logger.debug(`🔍 Monitoring canonical finality for TX: ${txHash}`);
      
      const provider = this.getProvider(network);
      const maxWait = 10000; // 10 seconds max wait for canonical block
      const startTime = Date.now();
      
      while (Date.now() - startTime < maxWait) {
        const tx = await provider.getTransaction(txHash);
        const receipt = await provider.getTransactionReceipt(txHash);
        
        // Check if transaction is dropped from mempool
        if (!tx && !receipt) {
          logger.warn(`⚠️  Transaction ${txHash} dropped from mempool after flashblock preconfirmation!`);
          
          // Log dropped event
          if (transactionId) {
            try {
              await db.logTransactionEvent({
                transactionId,
                transactionHash: txHash,
                eventType: 'dropped',
                fromStatus: 'preconfirmed',
                toStatus: 'dropped',
                errorMessage: 'Transaction dropped from mempool after flashblock preconfirmation (0.2% reorg chance). Transaction monitor will verify nonce state.',
              });
            } catch (error) {
              logger.warn('Failed to log dropped transaction event:', error);
            }
          }
          
          // NOTE: Cannot automatically resubmit ERC-3009 transactions - signature is user-generated
          // Transaction monitor will detect drop, check nonce availability, and mark as failed
          // Merchant must request user to retry payment if nonce still unused
          return;
        }
        
        // Check if transaction is in canonical block (has confirmations)
        if (receipt && receipt.blockNumber) {
          const confirmations = await receipt.confirmations();
          if (confirmations >= 1) {
            logger.info(`✅ Canonical finality confirmed for TX: ${txHash} (${confirmations} confirmations)`);
            
            // Log canonical confirmation event
            if (transactionId) {
              try {
                await db.logTransactionEvent({
                  transactionId,
                  transactionHash: txHash,
                  eventType: 'canonical_confirmed',
                  fromStatus: 'preconfirmed',
                  toStatus: 'completed',
                  blockNumber: BigInt(receipt.blockNumber),
                  confirmations,
                });
              } catch (error) {
                logger.warn('Failed to log canonical confirmation event:', error);
              }
            }
            
            this.pendingTransactions.delete(txKey);
            return;
          }
        }
        
        // Still in mempool or flashblock, wait
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
      logger.debug(`Transaction ${txHash} still pending canonical confirmation after ${maxWait}ms. Background monitor will continue tracking.`);
      
    } catch (error) {
      logger.error(`Error monitoring canonical finality for ${txHash}:`, error);
    }
  }

  /**
   * Check if transaction is still in mempool or dropped
   * Returns: 'confirmed' | 'pending' | 'dropped'
   */
  private async getTransactionStatus(
    txHash: string,
    network: string
  ): Promise<'confirmed' | 'pending' | 'dropped'> {
    try {
      const provider = this.getProvider(network);
      const tx = await provider.getTransaction(txHash);
      const receipt = await provider.getTransactionReceipt(txHash);
      
      if (receipt) {
        return 'confirmed';
      } else if (tx) {
        return 'pending'; // In mempool
      } else {
        return 'dropped'; // Not found anywhere
      }
    } catch (error) {
      logger.error(`Error checking transaction status for ${txHash}:`, error);
      return 'pending'; // Assume pending if error
    }
  }

  /**
   * Send webhook notification to merchant
   */
  private async sendWebhookNotification(
    transactionId: number,
    merchantAddress: string,
    payerAddress: string,
    requirements: PaymentRequirements,
    transactionHash: string,
    status: 'pending' | 'completed' | 'failed'
  ): Promise<void> {
    try {
      // Get merchant webhook configuration
      const merchant = await db.getMerchantByAddress(merchantAddress);
      if (!merchant || !merchant.webhook_url) {
        return; // No webhook configured
      }

      // Check if merchant wants this event type
      const wantedEvents = merchant.webhook_events.split(',');
      const eventName = `transaction.${status}` as const;
      if (!wantedEvents.includes(eventName)) {
        logger.debug(`Merchant does not subscribe to ${eventName} events`);
        return;
      }

      // Send webhook
      await webhookService.sendWebhook(
        merchant.webhook_url,
        merchant.webhook_secret,
        {
          event: eventName,
          transactionId,
          transactionHash,
          merchantAddress,
          payerAddress,
          amount: requirements.maxAmountRequired,
          asset: requirements.asset,
          network: requirements.network,
          resource: requirements.resource,
          description: requirements.description,
          mimeType: requirements.mimeType,
          status,
          timestamp: Math.floor(Date.now() / 1000),
        }
      );
    } catch (error) {
      logger.error('Failed to send webhook notification from settlement:', error);
    }
  }
}

export default new SettlementService();
