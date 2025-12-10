import { ethers } from 'ethers';
import logger from '../utils/logger.js';
import config from '../config/index.js';

/**
 * Paymaster wallet pool for load balancing settlement transactions
 * Implements round-robin selection to parallelize blockchain submissions
 * Wallets are loaded from environment variables (no database dependency)
 * Stores base wallets (no provider) and connects to specific network providers on-demand
 */
class PaymasterPool {
  private baseWallets: ethers.Wallet[] = []; // Wallets without provider
  private addresses: string[] = [];
  private currentIndex: number = 0;
  private isInitialized: boolean = false;

  /**
   * Initialize paymaster wallets from configuration
   * No provider needed - wallets are connected to network providers on-demand
   */
  async initialize(): Promise<void> {
    try {
      if (this.isInitialized) {
        logger.warn('Paymaster pool already initialized');
        return;
      }

      const privateKeys = config.paymasterPrivateKeys;
      
      if (privateKeys.length === 0) {
        throw new Error('No paymaster private keys configured');
      }

      // Load all paymaster wallets (without provider)
      this.baseWallets = [];
      this.addresses = [];
      const addressSet = new Set<string>();

      for (let i = 0; i < privateKeys.length; i++) {
        try {
          const wallet = new ethers.Wallet(privateKeys[i]);
          const address = wallet.address;
          
          // Check for duplicate addresses
          if (addressSet.has(address.toLowerCase())) {
            logger.warn(`⚠️ Duplicate paymaster wallet address detected: ${address} (skipping)`);
            continue;
          }

          addressSet.add(address.toLowerCase());
          this.baseWallets.push(wallet);
          this.addresses.push(address);
          
          logger.info(`✅ Loaded paymaster wallet ${i + 1}: ${address}`);
        } catch (error) {
          logger.error(`Failed to load paymaster wallet ${i + 1}:`, error);
          throw new Error(`Invalid paymaster private key at index ${i}`);
        }
      }

      if (this.baseWallets.length === 0) {
        throw new Error('Failed to load any paymaster wallets');
      }

      this.isInitialized = true;
      logger.info(`📦 Paymaster pool initialized: ${this.baseWallets.length} wallet(s) ready for parallel settlement`);
      
      if (this.baseWallets.length > 1) {
        logger.info(`⚡ Multi-wallet mode: Can process ${this.baseWallets.length} settlements in parallel`);
      } else {
        logger.info(`⚠️ Single-wallet mode: Settlements will be sequential. Add more wallets to PAYMASTER_PRIVATE_KEYS for parallelization`);
      }
    } catch (error) {
      logger.error('Failed to initialize paymaster pool:', error);
      throw error;
    }
  }

  /**
   * Get next wallet connected to specific provider using round-robin selection
   * This is efficient because ethers.js internally reuses the signer
   */
  getNextWallet(provider: ethers.Provider): ethers.Wallet {
    if (!this.isInitialized || this.baseWallets.length === 0) {
      throw new Error('Paymaster pool not initialized. Call initialize() first.');
    }

    // Round-robin selection
    const baseWallet = this.baseWallets[this.currentIndex];
    this.currentIndex = (this.currentIndex + 1) % this.baseWallets.length;

    // Connect to the specific provider
    return baseWallet.connect(provider);
  }

  /**
   * Get specific wallet by address, connected to the given provider
   */
  getWalletByAddress(address: string, provider: ethers.Provider): ethers.Wallet | undefined {
    const baseWallet = this.baseWallets.find(w => w.address.toLowerCase() === address.toLowerCase());
    return baseWallet ? baseWallet.connect(provider) : undefined;
  }

  /**
   * Get all wallet addresses
   */
  getAllAddresses(): string[] {
    return [...this.addresses];
  }

  /**
   * Get pool statistics
   */
  getPoolStats(): { total: number; addresses: string[]; currentIndex: number } {
    return {
      total: this.baseWallets.length,
      addresses: [...this.addresses],
      currentIndex: this.currentIndex,
    };
  }

  /**
   * Check if pool is initialized
   */
  isReady(): boolean {
    return this.isInitialized && this.baseWallets.length > 0;
  }
}

// Singleton instance
const paymasterPool = new PaymasterPool();
export default paymasterPool;
