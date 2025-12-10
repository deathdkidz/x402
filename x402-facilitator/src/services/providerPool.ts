import { ethers } from 'ethers';
import { getRpcUrl, getAllSupportedNetworks } from '../config/index.js';
import logger from '../utils/logger.js';

/**
 * Provider pool that maintains persistent WebSocket connections
 * Prevents creating new connections for every request
 */
class ProviderPool {
  private providers: Map<string, ethers.JsonRpcProvider | ethers.WebSocketProvider> = new Map();
  private reconnectAttempts: Map<string, number> = new Map();
  private maxReconnectAttempts = 5;
  private reconnectDelay = 5000; // 5 seconds

  /**
   * Initialize provider pool for all configured networks
   */
  async initialize(): Promise<void> {
    const networks = getAllSupportedNetworks();
    
    logger.info(`📡 Initializing provider pool for ${networks.length} networks...`);
    
    for (const network of networks) {
      await this.createProvider(network);
    }
    
    // Log summary after all connections established
    const stats = this.getStats();
    if (stats.websocket > 0) {
      logger.info(`   ✅ Connected ${stats.websocket} WebSocket connection(s)`);
    }
    if (stats.http > 0) {
      logger.info(`   ✅ Initialized ${stats.http} HTTP provider(s)`);
    }
  }

  /**
   * Create and cache a provider for a network
   */
  private async createProvider(network: string): Promise<void> {
    try {
      const rpcUrl = getRpcUrl(network);
      const isWebSocket = rpcUrl.startsWith('wss://') || rpcUrl.startsWith('ws://');
      
      if (isWebSocket) {
        const wsProvider = new ethers.WebSocketProvider(rpcUrl);
        
        // Set up error handlers for WebSocket
        // @ts-ignore - WebSocket event handlers
        wsProvider.websocket.on?.('error', (error: Error) => {
          logger.error(`WebSocket error for ${network}:`, error.message);
        });
        
        // @ts-ignore - WebSocket event handlers
        wsProvider.websocket.on?.('close', (code: number, reason: string) => {
          logger.warn(`WebSocket closed for ${network} (code: ${code}, reason: ${reason})`);
          this.handleDisconnection(network);
        });
        
        this.providers.set(network, wsProvider);
        this.reconnectAttempts.set(network, 0);
      } else {
        // HTTP provider - stateless, no connection management needed
        const httpProvider = new ethers.JsonRpcProvider(rpcUrl);
        this.providers.set(network, httpProvider);
      }
    } catch (error: any) {
      logger.error(`   ❌ ${network}: Failed to initialize provider - ${error.message}`);
      this.reconnectAttempts.set(network, 0);
    }
  }

  /**
   * Handle WebSocket disconnection and attempt reconnection
   */
  private async handleDisconnection(network: string): Promise<void> {
    const attempts = this.reconnectAttempts.get(network) || 0;
    
    if (attempts >= this.maxReconnectAttempts) {
      logger.error(`❌ ${network}: Max reconnection attempts reached. Manual restart required.`);
      this.providers.delete(network);
      return;
    }

    this.reconnectAttempts.set(network, attempts + 1);
    
    logger.info(`🔄 ${network}: Attempting reconnection (${attempts + 1}/${this.maxReconnectAttempts})...`);
    
    setTimeout(async () => {
      try {
        // Remove old provider
        const oldProvider = this.providers.get(network);
        if (oldProvider instanceof ethers.WebSocketProvider) {
          await oldProvider.destroy();
        }
        this.providers.delete(network);
        
        // Create new provider
        await this.createProvider(network);
        logger.info(`✅ ${network}: Reconnection successful`);
      } catch (error: any) {
        logger.error(`❌ ${network}: Reconnection failed - ${error.message}`);
      }
    }, this.reconnectDelay * (attempts + 1)); // Exponential backoff
  }

  /**
   * Get provider for a network (from pool)
   */
  getProvider(network: string): ethers.JsonRpcProvider | ethers.WebSocketProvider {
    const provider = this.providers.get(network);
    
    if (!provider) {
      // Fallback: create a new HTTP provider on-the-fly
      logger.warn(`⚠️ ${network}: Provider not in pool, creating temporary HTTP provider`);
      const rpcUrl = getRpcUrl(network);
      return new ethers.JsonRpcProvider(rpcUrl);
    }
    
    return provider;
  }

  /**
   * Check if a network has an active provider
   */
  hasProvider(network: string): boolean {
    return this.providers.has(network);
  }

  /**
   * Get pool statistics
   */
  getStats() {
    const stats = {
      total: this.providers.size,
      websocket: 0,
      http: 0,
      networks: Array.from(this.providers.keys()),
    };

    for (const [network, provider] of this.providers.entries()) {
      if (provider instanceof ethers.WebSocketProvider) {
        stats.websocket++;
      } else {
        stats.http++;
      }
    }

    return stats;
  }

  /**
   * Gracefully close all connections
   */
  async destroy(): Promise<void> {
    logger.info('Closing provider pool connections...');
    
    for (const [network, provider] of this.providers.entries()) {
      try {
        if (provider instanceof ethers.WebSocketProvider) {
          await provider.destroy();
          logger.info(`   Closed WebSocket: ${network}`);
        }
      } catch (error: any) {
        logger.warn(`   Failed to close ${network}:`, error.message);
      }
    }
    
    this.providers.clear();
    this.reconnectAttempts.clear();
    logger.info('✅ Provider pool destroyed');
  }
}

// Singleton instance
const providerPool = new ProviderPool();
export default providerPool;
