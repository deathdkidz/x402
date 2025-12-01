import logger from '../utils/logger.js';

/**
 * Simple in-memory transaction queue to prevent nonce conflicts
 * Ensures transactions from the same wallet are executed sequentially
 */
class TransactionQueue {
  private queues: Map<string, Promise<any>> = new Map();

  /**
   * Execute a transaction function with proper sequencing per wallet
   * @param walletAddress The wallet address sending the transaction
   * @param fn The async function that submits the transaction
   * @returns Promise that resolves when the transaction is submitted (not necessarily confirmed)
   */
  async execute<T>(walletAddress: string, fn: () => Promise<T>): Promise<T> {
    const normalizedAddress = walletAddress.toLowerCase();
    
    // Get the last pending operation for this wallet (if any)
    const lastOperation = this.queues.get(normalizedAddress) || Promise.resolve();
    
    // Create new operation that waits for the previous one
    const newOperation = lastOperation
      .then(() => fn())
      .catch((error) => {
        // If previous operation failed, still allow this one to proceed
        logger.warn(`Previous transaction failed for ${normalizedAddress}, proceeding with next`);
        return fn();
      });
    
    // Store this operation as the latest for this wallet
    this.queues.set(normalizedAddress, newOperation);
    
    // Clean up after completion to prevent memory leaks
    newOperation.finally(() => {
      // Only delete if this is still the latest operation
      if (this.queues.get(normalizedAddress) === newOperation) {
        this.queues.delete(normalizedAddress);
      }
    });
    
    return newOperation;
  }

  /**
   * Get queue size (for monitoring)
   */
  getQueueSize(): number {
    return this.queues.size;
  }

  /**
   * Clear all queues (for cleanup)
   */
  clear(): void {
    this.queues.clear();
  }
}

export const transactionQueue = new TransactionQueue();
