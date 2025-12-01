import Redis from 'ioredis';
import logger from '../utils/logger.js';
import config from '../config/index.js';

class RedisService {
  private client: Redis | null = null;
  private isConnected: boolean = false;

  /**
   * Initialize Redis connection
   */
  async connect(): Promise<void> {
    if (this.client) {
      return;
    }

    try {
      this.client = new Redis(config.redisUrl, {
        maxRetriesPerRequest: 3,
        retryStrategy: (times) => {
          const delay = Math.min(times * 50, 2000);
          return delay;
        },
        lazyConnect: true,
      });

      // Event handlers
      this.client.on('connect', () => {
        logger.info('🔴 Redis connecting...');
      });

      this.client.on('ready', () => {
        this.isConnected = true;
        logger.info('✅ Redis connected and ready');
      });

      this.client.on('error', (error) => {
        logger.error('❌ Redis error:', error);
        this.isConnected = false;
      });

      this.client.on('close', () => {
        this.isConnected = false;
        logger.warn('⚠️ Redis connection closed');
      });

      await this.client.connect();
    } catch (error) {
      logger.error('Failed to initialize Redis:', error);
      this.client = null;
      throw error;
    }
  }

  /**
   * Get Redis client instance
   */
  getClient(): Redis | null {
    return this.client;
  }

  /**
   * Check if Redis is connected
   */
  isReady(): boolean {
    return this.isConnected && this.client !== null;
  }

  /**
   * Cache a used nonce with transaction details (24 hours default)
   */
  async cacheUsedNonce(
    payer: string,
    nonce: string,
    transactionHash: string,
    status: 'pending' | 'completed' | 'failed',
    ttl: number = 86400
  ): Promise<void> {
    if (!this.isReady() || !this.client) {
      logger.warn('Redis not ready, skipping nonce cache');
      return;
    }

    try {
      const key = `nonce:${payer}:${nonce}`;
      const data = JSON.stringify({
        transactionHash,
        status,
        timestamp: Date.now(),
      });
      await this.client.setex(key, ttl, data);
      logger.debug(`Cached used nonce: ${key} with tx: ${transactionHash}`);
    } catch (error) {
      logger.error('Failed to cache nonce:', error);
    }
  }

  /**
   * Check if a nonce has been cached and get transaction details
   */
  async getNonceTransaction(
    payer: string,
    nonce: string
  ): Promise<{ transactionHash: string; status: string; timestamp: number } | null> {
    if (!this.isReady() || !this.client) {
      logger.warn('Redis not ready, cannot check cached nonce');
      return null;
    }

    try {
      const key = `nonce:${payer}:${nonce}`;
      const result = await this.client.get(key);
      if (!result) {
        return null;
      }
      return JSON.parse(result);
    } catch (error) {
      logger.error('Failed to check cached nonce:', error);
      return null;
    }
  }

  /**
   * Cache merchant API key lookup (for auth middleware)
   */
  async cacheMerchant(apiKey: string, merchantData: any, ttl: number = 3600): Promise<void> {
    if (!this.isReady() || !this.client) {
      return;
    }

    try {
      const key = `merchant:${apiKey}`;
      await this.client.setex(key, ttl, JSON.stringify(merchantData));
      logger.debug(`Cached merchant: ${merchantData.merchant_address}`);
    } catch (error) {
      logger.error('Failed to cache merchant:', error);
    }
  }

  /**
   * Get cached merchant data
   */
  async getCachedMerchant(apiKey: string): Promise<any | null> {
    if (!this.isReady() || !this.client) {
      return null;
    }

    try {
      const key = `merchant:${apiKey}`;
      const result = await this.client.get(key);
      return result ? JSON.parse(result) : null;
    } catch (error) {
      logger.error('Failed to get cached merchant:', error);
      return null;
    }
  }

  /**
   * Invalidate merchant cache
   */
  async invalidateMerchant(apiKey: string): Promise<void> {
    if (!this.isReady() || !this.client) {
      return;
    }

    try {
      const key = `merchant:${apiKey}`;
      await this.client.del(key);
      logger.debug(`Invalidated merchant cache: ${apiKey}`);
    } catch (error) {
      logger.error('Failed to invalidate merchant cache:', error);
    }
  }

  /**
   * Cache merchant rate limits
   */
  async cacheMerchantRateLimits(
    merchantAddress: string,
    limits: { verifyLimit: number; settleLimit: number; window: number; tier: string },
    ttl: number = 3600
  ): Promise<void> {
    if (!this.isReady() || !this.client) {
      return;
    }

    try {
      const key = `ratelimits:${merchantAddress}`;
      await this.client.setex(key, ttl, JSON.stringify(limits));
      logger.debug(`Cached rate limits for merchant: ${merchantAddress}`);
    } catch (error) {
      logger.error('Failed to cache merchant rate limits:', error);
    }
  }

  /**
   * Get cached merchant rate limits
   */
  async getCachedMerchantRateLimits(
    merchantAddress: string
  ): Promise<{ verifyLimit: number; settleLimit: number; window: number; tier: string } | null> {
    if (!this.isReady() || !this.client) {
      return null;
    }

    try {
      const key = `ratelimits:${merchantAddress}`;
      const result = await this.client.get(key);
      return result ? JSON.parse(result) : null;
    } catch (error) {
      logger.error('Failed to get cached merchant rate limits:', error);
      return null;
    }
  }

  /**
   * Invalidate merchant rate limits cache
   */
  async invalidateMerchantRateLimits(merchantAddress: string): Promise<void> {
    if (!this.isReady() || !this.client) {
      return;
    }

    try {
      const key = `ratelimits:${merchantAddress}`;
      await this.client.del(key);
      logger.debug(`Invalidated rate limits cache for merchant: ${merchantAddress}`);
    } catch (error) {
      logger.error('Failed to invalidate merchant rate limits cache:', error);
    }
  }

  /**
   * Close Redis connection
   */
  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.quit();
      this.client = null;
      this.isConnected = false;
      logger.info('Redis disconnected');
    }
  }
}

export default new RedisService();
