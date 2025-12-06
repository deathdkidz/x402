import { ethers } from 'ethers';
import logger from '../utils/logger.js';
import config from '../config/index.js';

/**
 * Paymaster wallet pool for load balancing settlement transactions
 * Implements round-robin selection to parallelize blockchain submissions
 * Wallets are loaded from environment variables (no database dependency)
 */
class PaymasterPool {
  private wallets: ethers.Wallet[] = [];
  private currentIndex: number = 0;
  private isInitialized: boolean = false;

  /**
   * Initialize paymaster wallets from configuration
   */
  async initialize(provider: ethers.Provider): Promise<void> {
    try {
      if (this.isInitialized) {
        logger.warn('Paymaster pool already initialized');
        return;
      }

      const privateKeys = config.paymasterPrivateKeys;
      
      if (privateKeys.length === 0) {
        throw new Error('No paymaster private keys configured');
      }

      // Load all paymaster wallets
      this.wallets = [];
      const addresses = new Set<string>();

      for (let i = 0; i < privateKeys.length; i++) {
        try {
          const wallet = new ethers.Wallet(privateKeys[i], provider);
          const address = await wallet.getAddress();
          
          // Check for duplicate addresses
          if (addresses.has(address.toLowerCase())) {
            logger.warn(`⚠️ Duplicate paymaster wallet address detected: ${address} (skipping)`);
            continue;
          }

          addresses.add(address.toLowerCase());
          this.wallets.push(wallet);
          
          logger.info(`✅ Loaded paymaster wallet ${i + 1}: ${address}`);
        } catch (error) {
          logger.error(`Failed to load paymaster wallet ${i + 1}:`, error);
          throw new Error(`Invalid paymaster private key at index ${i}`);
        }
      }

      if (this.wallets.length === 0) {
        throw new Error('Failed to load any paymaster wallets');
      }

      this.isInitialized = true;
      logger.info(`📦 Paymaster pool initialized: ${this.wallets.length} wallet(s) ready for parallel settlement`);
      
      if (this.wallets.length > 1) {
        logger.info(`⚡ Multi-wallet mode: Can process ${this.wallets.length} settlements in parallel`);
      } else {
        logger.info(`⚠️ Single-wallet mode: Settlements will be sequential. Add more wallets to PAYMASTER_PRIVATE_KEYS for parallelization`);
      }
    } catch (error) {
      logger.error('Failed to initialize paymaster pool:', error);
      throw error;
    }
  }

  /**
   * Get next wallet using round-robin selection
   */
  getNextWallet(): ethers.Wallet {
    if (!this.isInitialized || this.wallets.length === 0) {
      throw new Error('Paymaster pool not initialized. Call initialize() first.');
    }

    // Round-robin selection
    const wallet = this.wallets[this.currentIndex];
    this.currentIndex = (this.currentIndex + 1) % this.wallets.length;

    return wallet;
  }

  /**
   * Get specific wallet by address
   */
  getWalletByAddress(address: string): ethers.Wallet | undefined {
    return this.wallets.find(w => w.address.toLowerCase() === address.toLowerCase());
  }

  /**
   * Get all wallet addresses
   */
  getAllAddresses(): string[] {
    return this.wallets.map(w => w.address);
  }

  /**
   * Get pool statistics
   */
  getPoolStats(): { total: number; addresses: string[]; currentIndex: number } {
    return {
      total: this.wallets.length,
      addresses: this.wallets.map(w => w.address),
      currentIndex: this.currentIndex,
    };
  }

  /**
   * Check if pool is initialized
   */
  isReady(): boolean {
    return this.isInitialized && this.wallets.length > 0;
  }
}

// Singleton instance
const paymasterPool = new PaymasterPool();
export default paymasterPool;
