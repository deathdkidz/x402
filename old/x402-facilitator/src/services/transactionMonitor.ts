import { ethers } from 'ethers';
import db from './database.js';
import redis from './redis.js';
import webhookService from './webhook.js';
import logger from '../utils/logger.js';
import config, { getRpcUrl } from '../config/index.js';
import providerPool from './providerPool.js';

/**
 * Background job to check status of pending transactions
 * and update their status in the database
 */
export class TransactionMonitor {
  private intervalId: NodeJS.Timeout | null = null;
  private checkIntervalMs = config.transactionMonitorIntervalMs;

  /**
   * Start monitoring pending transactions
   */
  start(): void {
    if (this.intervalId) {
      logger.warn('Transaction monitor already running');
      return;
    }

    logger.info('Starting transaction monitor...');
    
    // Run immediately on start
    this.checkPendingTransactions();

    // Then run periodically
    this.intervalId = setInterval(() => {
      this.checkPendingTransactions();
    }, this.checkIntervalMs);

    logger.info(`Transaction monitor started (checking every ${this.checkIntervalMs / 1000}s)`);
  }

  /**
   * Stop monitoring
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      logger.info('Transaction monitor stopped');
    }
  }

  /**
   * Check all pending transactions and update their status
   */
  private async checkPendingTransactions(): Promise<void> {
    try {
      const pendingTxs = await db.getPendingTransactions(100);
      
      if (pendingTxs.length === 0) {
        return;
      }

      logger.info(`🔍 Checking ${pendingTxs.length} pending transactions...`);

      for (const tx of pendingTxs) {
        await this.checkTransaction(tx);
      }
    } catch (error) {
      logger.error('Error checking pending transactions:', error);
    }
  }

  /**
   * Check a single transaction status
   */
  private async checkTransaction(tx: any): Promise<void> {
    try {
      // Skip if no transaction hash (hasn't been submitted yet)
      if (!tx.transaction_hash) {
        // Check if it has timed out
        if (tx.timeout_at && new Date(tx.timeout_at) < new Date()) {
          logger.info(`⏰ Transaction ${tx.id} timed out (no tx hash), marking as failed`);
          await db.updateTransaction(tx.id, 'failed');
          await redis.cacheUsedNonce(tx.payer_address, tx.nonce, 'no-hash', 'failed');
        }
        return;
      }

      // Handle preconfirmed transactions (flashblock received, waiting for canonical block)
      // Settlement service monitors for 10s, but if it fails/times out, monitor takes over
      if (tx.status === 'preconfirmed') {
        const createdAt = new Date(tx.created_at);
        const ageSeconds = (Date.now() - createdAt.getTime()) / 1000;
        
        // Give settlement service 30 seconds to complete canonical monitoring
        // After that, monitor takes over to prevent stuck preconfirmed status
        if (ageSeconds < 30) {
          logger.debug(`Transaction ${tx.id} is preconfirmed (${ageSeconds.toFixed(1)}s old), waiting for canonical finality monitoring`);
          return;
        }
        
        logger.info(`⏰ Preconfirmed transaction ${tx.id} is ${ageSeconds.toFixed(1)}s old, monitor taking over canonical finality check`);
        // Continue to check transaction status below
      }

      // Get provider for this network
      const rpcUrl = getRpcUrl(tx.network);
      if (!rpcUrl) {
        logger.error(`No RPC URL for network: ${tx.network}`);
        return;
      }

      const provider = providerPool.getProvider(tx.network);
      const receipt = await provider.getTransactionReceipt(tx.transaction_hash);

      if (!receipt) {
        // No receipt - could be pending OR dropped from mempool
        // Check if transaction is still in mempool
        const pendingTx = await provider.getTransaction(tx.transaction_hash);
        
        if (!pendingTx) {
          // Transaction NOT in mempool and NOT mined = DROPPED!
          logger.warn(`⚠️  Transaction ${tx.id} (${tx.transaction_hash}) DROPPED from mempool!`);
          
          // Check if we can rebroadcast (nonce unused + signature not expired)
          let canRebroadcast = false;
          let nonceStillAvailable = false;
          
          try {
            const tokenAddress = tx.asset;
            const tokenContract = new (await import('ethers')).ethers.Contract(
              tokenAddress,
              ['function authorizationState(address authorizer, bytes32 nonce) view returns (bool)'],
              provider
            );
            const isNonceUsed = await tokenContract.authorizationState(tx.payer_address, tx.nonce);
            nonceStillAvailable = !isNonceUsed;
            
            // Check if signature is still valid (not expired)
            const currentTime = Math.floor(Date.now() / 1000);
            const signatureValid = 
              BigInt(tx.valid_after) <= currentTime && 
              currentTime <= BigInt(tx.valid_before);
            
            canRebroadcast = nonceStillAvailable && signatureValid;
            
            if (canRebroadcast) {
              logger.info(`✓ Transaction ${tx.id} can be rebroadcast: nonce unused + signature valid until ${new Date(Number(tx.valid_before) * 1000).toISOString()}`);
            } else if (nonceStillAvailable && !signatureValid) {
              logger.warn(`⏰ Signature expired for transaction ${tx.id} - merchant must request new payment from user`);
            }
          } catch (error) {
            logger.warn('Failed to check rebroadcast eligibility:', error);
          }
          
          // Attempt automatic rebroadcast if possible
          if (canRebroadcast && tx.signature && tx.valid_after && tx.valid_before) {
            try {
              logger.info(`🔄 Attempting to rebroadcast transaction ${tx.id}...`);
              
              // Import required modules
              const { ethers } = await import('ethers');
              const paymasterPool = (await import('./paymasterPool.js')).default;
              const transactionQueue = (await import('./transactionQueue.js')).transactionQueue;
              
              // Get token contract with proper typing
              const ERC3009_ABI = [
                'function transferWithAuthorization(address from, address to, uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce, uint8 v, bytes32 r, bytes32 s)'
              ];
              const tokenContract = new ethers.Contract(tx.asset, ERC3009_ABI, provider);
              
              // Get paymaster wallet
              const paymasterWallet = paymasterPool.getNextWallet(provider);
              const tokenWithSigner = tokenContract.connect(paymasterWallet) as any;
              
              // Parse signature
              const sig = ethers.Signature.from(tx.signature.trim());
              
              // Rebroadcast transaction with same parameters
              const rebroadcastTx = await transactionQueue.execute(paymasterWallet.address, async () => {
                return await tokenWithSigner.transferWithAuthorization(
                  tx.payer_address,
                  tx.recipient_address,
                  tx.amount,
                  tx.valid_after,
                  tx.valid_before,
                  tx.nonce,
                  sig.v,
                  sig.r,
                  sig.s,
                  {
                    gasLimit: (await import('../config/index.js')).default.settlementGasLimit,
                  }
                );
              });
              
              logger.info(`✅ Transaction ${tx.id} rebroadcast successfully! New hash: ${rebroadcastTx.hash}`);
              
              // Update database with new transaction hash
              await db.updateTransaction(tx.id, 'pending', rebroadcastTx.hash);
              await redis.cacheUsedNonce(tx.payer_address, tx.nonce, rebroadcastTx.hash, 'pending');
              
              // Log rebroadcast event
              await db.logTransactionEvent({
                transactionId: tx.id,
                transactionHash: rebroadcastTx.hash,
                eventType: 'rebroadcast',
                fromStatus: 'dropped',
                toStatus: 'pending',
                errorMessage: `Original tx ${tx.transaction_hash} dropped, rebroadcast with same signature`,
                eventData: { 
                  originalTxHash: tx.transaction_hash,
                  newTxHash: rebroadcastTx.hash,
                },
              });
              
              // Don't mark as failed - now pending again
              return;
              
            } catch (rebroadcastError) {
              logger.error(`Failed to rebroadcast transaction ${tx.id}:`, rebroadcastError);
              // Continue to mark as failed below
            }
          }
          
          // Log dropped event (if rebroadcast failed or not possible)
          try {
            await db.logTransactionEvent({
              transactionId: tx.id,
              transactionHash: tx.transaction_hash,
              eventType: 'dropped',
              fromStatus: tx.status,
              toStatus: 'failed',
              errorMessage: `Transaction dropped from mempool. ${
                canRebroadcast 
                  ? 'Rebroadcast attempted but failed' 
                  : nonceStillAvailable 
                    ? 'Signature expired - merchant must request new payment' 
                    : 'Nonce already used on-chain'
              }`,
              eventData: { nonceStillAvailable, canRebroadcast },
            });
          } catch (error) {
            logger.warn('Failed to log dropped transaction event:', error);
          }
          
          // Mark as failed (only if rebroadcast didn't succeed)
          await db.updateTransaction(tx.id, 'failed', tx.transaction_hash);
          await redis.cacheUsedNonce(tx.payer_address, tx.nonce, tx.transaction_hash, 'failed');
          
          // Send webhook notification
          await this.sendWebhookNotification(tx, 'failed');
          return;
        }
        
        // Transaction still in mempool - check age
        const createdAt = new Date(tx.created_at);
        const ageMinutes = (Date.now() - createdAt.getTime()) / 60000;

        // Mark as failed if pending for more than 60 minutes
        if (ageMinutes > 60) {
          logger.warn(`⏰ Transaction ${tx.id} (${tx.transaction_hash}) timed out after ${ageMinutes.toFixed(1)} minutes, marking as failed`);
          await db.updateTransaction(tx.id, 'failed', tx.transaction_hash);
          await redis.cacheUsedNonce(tx.payer_address, tx.nonce, tx.transaction_hash, 'failed');
          
          // Send webhook notification
          await this.sendWebhookNotification(tx, 'failed');
          return;
        }

        // Just warn if pending for more than 30 minutes
        if (ageMinutes > 30) {
          logger.warn(`⚠️ Transaction ${tx.id} (${tx.transaction_hash}) still pending in mempool after ${ageMinutes.toFixed(1)} minutes`);
        }
        return;
      }

      // Transaction mined - update status
      if (receipt.status === 1) {
        const wasPreconfirmed = tx.status === 'preconfirmed';
        logger.info(`✅ Transaction ${tx.id} confirmed: ${tx.transaction_hash}${wasPreconfirmed ? ' (canonical finality reached)' : ''}`);
        
        await db.updateTransaction(tx.id, 'completed', tx.transaction_hash);
        await redis.cacheUsedNonce(tx.payer_address, tx.nonce, tx.transaction_hash, 'completed');
        
        // Log canonical confirmation if it was preconfirmed
        if (wasPreconfirmed) {
          try {
            await db.logTransactionEvent({
              transactionId: tx.id,
              transactionHash: tx.transaction_hash,
              eventType: 'canonical_confirmed',
              fromStatus: 'preconfirmed',
              toStatus: 'completed',
              blockNumber: receipt.blockNumber ? BigInt(receipt.blockNumber) : undefined,
              confirmations: await receipt.confirmations(),
            });
          } catch (error) {
            logger.warn('Failed to log canonical confirmation:', error);
          }
        }
        
        // Send webhook notification
        await this.sendWebhookNotification(tx, 'completed');
      } else {
        const wasPreconfirmed = tx.status === 'preconfirmed';
        logger.info(`❌ Transaction ${tx.id} failed: ${tx.transaction_hash}${wasPreconfirmed ? ' (reorg or flashblock failed)' : ''}`);
        
        await db.updateTransaction(tx.id, 'failed', tx.transaction_hash);
        await redis.cacheUsedNonce(tx.payer_address, tx.nonce, tx.transaction_hash, 'failed');
        
        // Log reorg if it was preconfirmed (0.2% chance)
        if (wasPreconfirmed) {
          try {
            await db.logTransactionEvent({
              transactionId: tx.id,
              transactionHash: tx.transaction_hash,
              eventType: 'reorg_detected',
              fromStatus: 'preconfirmed',
              toStatus: 'failed',
              errorMessage: 'Transaction failed after flashblock preconfirmation - likely reorg',
            });
            logger.warn(`🔄 REORG DETECTED: Transaction ${tx.id} was preconfirmed but canonical block shows failure`);
          } catch (error) {
            logger.warn('Failed to log reorg event:', error);
          }
        }
        
        // Send webhook notification
        await this.sendWebhookNotification(tx, 'failed');
      }
    } catch (error) {
      logger.error(`Error checking transaction ${tx.id}:`, error);
    }
  }

  /**
   * Send webhook notification to merchant
   */
  private async sendWebhookNotification(
    tx: any,
    status: 'completed' | 'failed'
  ): Promise<void> {
    try {
      // Get merchant webhook configuration (recipient_address is the merchant's auth address)
      const merchant = await db.getMerchantByAddress(tx.recipient_address);
      if (!merchant || !merchant.webhook_url) {
        return; // No webhook configured
      }

      // Check if merchant wants this event type
      const wantedEvents = merchant.webhook_events.split(',');
      const event = status === 'completed' 
        ? 'transaction.completed' 
        : 'transaction.failed';
      
      if (!wantedEvents.includes(event)) {
        logger.debug(`Merchant does not subscribe to ${event} events`);
        return;
      }

      await webhookService.sendWebhook(
        merchant.webhook_url,
        merchant.webhook_secret,
        {
          event: event as 'transaction.completed' | 'transaction.failed',
          transactionId: tx.id,
          transactionHash: tx.transaction_hash,
          merchantAddress: tx.recipient_address,
          payerAddress: tx.payer_address,
          amount: tx.amount,
          asset: tx.asset,
          network: tx.network,
          resource: tx.resource,
          description: tx.description,
          mimeType: tx.mime_type,
          status,
          timestamp: Math.floor(Date.now() / 1000),
        }
      );
    } catch (error) {
      logger.error('Failed to send webhook notification:', error);
    }
  }
}

// Singleton instance
const transactionMonitor = new TransactionMonitor();

export default transactionMonitor;
