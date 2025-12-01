import { ethers } from 'ethers';
import { PaymentPayload, PaymentRequirements, SettleResponse, ExactPaymentPayload } from '../types/index.js';
import config, { getRpcUrl } from '../config/index.js';
import logger from '../utils/logger.js';
import db from './database.js';
import redis from './redis.js';
import { transactionQueue } from './transactionQueue.js';

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
 * 1. Pre-settlement validation
 * 2. Gas estimation
 * 3. Transaction simulation (where possible)
 * 4. Nonce management
 * 5. Transaction monitoring
 * 6. Retry logic with exponential backoff
 */
export class SettlementService {
  private pendingTransactions: Map<string, string> = new Map();

  /**
   * Get provider for specific network
   */
  private getProvider(network: string): ethers.JsonRpcProvider {
    const rpcUrl = getRpcUrl(network);
    return new ethers.JsonRpcProvider(rpcUrl);
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
    // Get provider for the specified network
    const provider = this.getProvider(requirements.network);
    
    // Use facilitator's private key as paymaster
    const paymasterWallet = new ethers.Wallet(config.facilitatorPrivateKey, provider);
    logger.info(`Using facilitator wallet as paymaster: ${paymasterWallet.address}`);
    logger.info(`Settling payment to merchant: ${merchantAddress}`);
    logger.info('=== STARTING PAYMENT SETTLEMENT ===');
    logger.info(`Network: ${requirements.network}`);
    logger.info(`Asset: ${requirements.asset}`);
    logger.info(`Amount: ${requirements.maxAmountRequired}`);

    // Track transaction ID for error handling
    let transactionId: number | null = null;

    try {
      // Safety Check 1: Extract payer information
      const payerResult = this.extractPayer(payload);
      if (!payerResult.success) {
        return payerResult.response;
      }
      const payer = payerResult.payer!;

      // Safety Check 2: Validate merchant is authorized
      const authCheck = this.validateMerchantAuth(requirements.payTo, merchantAddress);
      if (!authCheck.success) {
        return authCheck.response;
      }

      // Safety Check 3: Extract authorization and signature
      const authResult = this.extractAuthorization(payload);
      if (!authResult.success) {
        return authResult.response;
      }
      const { authorization, signature } = authResult;

      // Safety Check 4: Check for duplicate transactions
      const dupCheck = this.checkDuplicateTransaction(payload, requirements);
      if (!dupCheck.success) {
        return dupCheck.response;
      }

      // Safety Check 5: Pre-settlement balance verification
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

      // Safety Check 6: Replay attack protection - check cache first, then on-chain
      // Check Redis cache for used nonce (fast path)
      const cachedTx = await redis.getNonceTransaction(payer, nonce);
      if (cachedTx) {
        logger.warn(`⛔ Nonce found in cache (already used): ${nonce} for payer: ${payer}`);
        logger.info(`   Cached transaction: ${cachedTx.transactionHash} (${cachedTx.status})`);
        return {
          success: false,
          network: requirements.network,
          errorReason: 'Nonce already used - transaction previously executed',
          transactionHash: cachedTx.transactionHash,
          transactionStatus: cachedTx.status,
          cached: true,
        };
      }

      // Check on-chain if not in cache (fallback for cache misses or restarts)
      try {
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
        logger.info(`✓ Nonce ${nonce} not yet used (cache miss, checked on-chain)`);
      } catch (error) {
        logger.error('Failed to check nonce state:', error);
        return {
          success: false,
          network: requirements.network,
          errorReason: 'Failed to verify nonce state',
        };
      }

      // Split signature into v, r, s components for ERC-3009
      const sig = ethers.Signature.from(signature!.trim());

      logger.info(`📤 Executing transferWithAuthorization: ${payer} -> ${payTo}, amount: ${amount.toString()}`);
      logger.info(`   ValidAfter: ${validAfter}, ValidBefore: ${validBefore}`);
      logger.info(`   Nonce: ${nonce}`);
      logger.info(`   Signature v=${sig.v}, r=${sig.r}, s=${sig.s}`);

      // Save transaction to database as pending
      try {
        // Check if transaction with this nonce already exists in database
        const existingTx = await db.getTransactionByNonce(payer, nonce);
        if (existingTx) {
          logger.warn(`⛔ Transaction with nonce ${nonce} already exists in database (ID: ${existingTx.id}, Status: ${existingTx.status})`);
          return {
            success: existingTx.status === 'completed',
            network: requirements.network,
            errorReason: existingTx.status === 'pending' 
              ? 'Transaction with this nonce is still pending'
              : 'Nonce already used - transaction previously executed',
            transactionHash: existingTx.transaction_hash,
            transactionStatus: existingTx.status,
            cached: false,
          };
        }

        transactionId = await db.saveTransaction({
          merchantAddress: merchantAddress,
          payerAddress: payer,
          nonce: nonce,
          validAfter: validAfter.toString(),
          validBefore: validBefore.toString(),
          signature: signature!.trim(),
          amount: requirements.maxAmountRequired,
          asset: requirements.asset,
          network: requirements.network,
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
            gasLimit: 200000, // Standard gas limit for ERC-3009 transfers
          }
        );
      });

      // Track pending transaction
      const txKey = this.getTransactionKey(payload, requirements);
      this.pendingTransactions.set(txKey, tx.hash);

      // Cache the nonce as used immediately with pending status
      await redis.cacheUsedNonce(payer, nonce, tx.hash, 'pending');

      logger.info(`⏳ Transaction sent: ${tx.hash}`);
      logger.info('   Waiting for confirmation (30s timeout)...');

      // HYBRID APPROACH: Wait up to 30 seconds for confirmation
      // This gives instant feedback for most transactions (which confirm in 5-15 seconds)
      // while still being non-blocking for slow/stuck transactions
      
      const receipt = await this.waitForTransaction(tx.hash, 30000, requirements.network); // 30 second timeout
      
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
          
          logger.info(`⛽ Gas used: ${gasUsed.toString()} units @ ${ethers.formatUnits(effectiveGasPrice, 'gwei')} gwei, Cost: ${gasCostGwei} gwei (${gasCostNative} ${this.getGasToken(requirements.network)})`);
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
    let payer: string | undefined;

    if (payload.payload && typeof payload.payload === 'object' && 'authorization' in payload.payload) {
      const exactPayload = payload.payload as ExactPaymentPayload;
      payer = exactPayload.authorization.from?.trim();
    }

    if (!payer) {
      logger.warn('Could not extract payer address from payload');
      return {
        success: false,
        response: {
          success: false,
          network: 'unknown',
          errorReason: 'Could not extract payer address from payload',
        },
      };
    }

    logger.info(`✓ Payer extracted: ${payer}`);
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
    let authorization: any;
    let signature: string | undefined;

    if (payload.payload && typeof payload.payload === 'object') {
      const exactPayload = payload.payload as ExactPaymentPayload;
      authorization = exactPayload.authorization;
      signature = exactPayload.signature;
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

    logger.info(`✓ Authorization extracted with signature`);
    return { success: true, authorization, signature, response: { success: true, network: 'unknown' } };
  }

  /**
   * Validate merchant is authorized to receive payment
   */
  private validateMerchantAuth(payTo: string, merchantAddress: string): { success: boolean; response: SettleResponse } {
    if (payTo.toLowerCase() !== merchantAddress.toLowerCase()) {
      logger.warn(`Merchant address mismatch. Expected: ${merchantAddress}, Got: ${payTo}`);
      return {
        success: false,
        response: {
          success: false,
          network: 'unknown',
          errorReason: 'Merchant address mismatch. This facilitator is not authorized for this payment.',
        },
      };
    }

    logger.info(`✓ Merchant authorization validated`);
    return { success: true, response: { success: true, network: 'unknown' } };
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

    logger.info(`✓ No duplicate transaction found`);
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

      logger.info(`✓ Pre-settlement balance check passed: ${balance.toString()}`);
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
   * Wait for transaction with timeout
   */
  private async waitForTransaction(
    txHash: string,
    timeoutMs: number,
    network: string
  ): Promise<ethers.TransactionReceipt | null> {
    let timeoutId: NodeJS.Timeout;
    
    const timeout = new Promise<null>((resolve) => {
      timeoutId = setTimeout(() => {
        logger.info(`⏱️ Transaction ${txHash} still pending after ${timeoutMs/1000}s, will be monitored in background`);
        resolve(null);
      }, timeoutMs);
    });

    const provider = this.getProvider(network);
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
    const exactPayload = payload.payload as ExactPaymentPayload;
    return `${exactPayload.authorization.from}-${requirements.asset}-${exactPayload.authorization.nonce}`;
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
}

export default new SettlementService();
