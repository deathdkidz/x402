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

      // Get provider for this network
      const rpcUrl = getRpcUrl(tx.network);
      if (!rpcUrl) {
        logger.error(`No RPC URL for network: ${tx.network}`);
        return;
      }

      const provider = providerPool.getProvider(tx.network);
      const receipt = await provider.getTransactionReceipt(tx.transaction_hash);

      if (!receipt) {
        // Transaction not yet mined
        // Check if it has been pending too long
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
          logger.warn(`⚠️ Transaction ${tx.id} (${tx.transaction_hash}) still pending after ${ageMinutes.toFixed(1)} minutes`);
        }
        return;
      }

      // Transaction mined - update status
      if (receipt.status === 1) {
        logger.info(`✅ Transaction ${tx.id} confirmed: ${tx.transaction_hash}`);
        await db.updateTransaction(tx.id, 'completed', tx.transaction_hash);
        await redis.cacheUsedNonce(tx.payer_address, tx.nonce, tx.transaction_hash, 'completed');
        
        // Send webhook notification
        await this.sendWebhookNotification(tx, 'completed');
      } else {
        logger.info(`❌ Transaction ${tx.id} failed: ${tx.transaction_hash}`);
        await db.updateTransaction(tx.id, 'failed', tx.transaction_hash);
        await redis.cacheUsedNonce(tx.payer_address, tx.nonce, tx.transaction_hash, 'failed');
        
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
