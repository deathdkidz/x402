import axios from 'axios';
import config from '../config/index.js';
import logger from '../utils/logger.js';

interface PriceData {
  [symbol: string]: {
    usd: number;
    lastUpdated: number;
  };
}

class PriceService {
  private prices: PriceData = {};
  private updateInterval: NodeJS.Timeout | null = null;
  private readonly CMC_API_URL = 'https://pro-api.coinmarketcap.com/v2/cryptocurrency/quotes/latest';
  private readonly UPDATE_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes

  async start() {
    logger.info('💰 Starting price service...');
    
    // Initial fetch
    await this.updatePrices();
    
    // Set up periodic updates
    this.updateInterval = setInterval(() => {
      this.updatePrices().catch(err => {
        logger.error('❌ Price update failed:', err.message);
      });
    }, this.UPDATE_INTERVAL_MS);
    
    logger.info('✅ Price service started (updates every 15 minutes)');
  }

  stop() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
      logger.info('🛑 Price service stopped');
    }
  }

  private async updatePrices() {
    try {
      // Get unique CMC slugs from all networks
      const slugs = new Set<string>();
      Object.values(config.networks).forEach(network => {
        if (network.nativeToken?.cmcSlug) {
          slugs.add(network.nativeToken.cmcSlug);
        }
      });

      if (slugs.size === 0) {
        logger.warn('⚠️  No CMC slugs configured for networks');
        return;
      }

      const slugArray = Array.from(slugs);
      logger.debug(`Fetching prices for: ${slugArray.join(', ')}`);

      const response = await axios.get(this.CMC_API_URL, {
        params: {
          slug: slugArray.join(','),
          convert: 'USD'
        },
        headers: {
          'X-CMC_PRO_API_KEY': config.coinmarketcapApiKey,
          'Accept': 'application/json'
        },
        timeout: 10000
      });

      if (response.data && response.data.data) {
        const now = Date.now();
        
        // Process response data
        Object.values(response.data.data as any[]).forEach((coin: any) => {
          const symbol = coin.symbol;
          const price = coin.quote?.USD?.price;
          
          if (symbol && price) {
            this.prices[symbol] = {
              usd: price,
              lastUpdated: now
            };
            logger.debug(`💰 ${symbol}: $${price.toFixed(4)}`);
          }
        });

        logger.info(`✅ Updated prices for ${Object.keys(this.prices).length} token(s)`);
      }
    } catch (error: any) {
      if (axios.isAxiosError(error)) {
        logger.error(`❌ CoinMarketCap API error: ${error.response?.status} ${error.response?.statusText}`);
        if (error.response?.data) {
          logger.error(`   Details: ${JSON.stringify(error.response.data)}`);
        }
      } else {
        logger.error(`❌ Price update failed: ${error.message}`);
      }
    }
  }

  /**
   * Get USD price for a token symbol
   */
  getPrice(symbol: string): number | null {
    const priceData = this.prices[symbol];
    
    if (!priceData) {
      logger.debug(`⚠️  No price data for ${symbol}`);
      return null;
    }

    // Check if price is stale (older than 1 hour)
    const age = Date.now() - priceData.lastUpdated;
    if (age > 60 * 60 * 1000) {
      logger.warn(`⚠️  Price for ${symbol} is stale (${Math.floor(age / 60000)} minutes old)`);
    }

    return priceData.usd;
  }

  /**
   * Format native token amount with USD price
   * @param network Network name
   * @param amountWei Amount in wei
   * @returns Formatted string like "0.0000085768 HYPE ($0.25)"
   */
  formatWithPrice(network: string, amountWei: bigint): string {
    const networkConfig = config.networks[network];
    
    if (!networkConfig?.nativeToken) {
      // Fallback to ETH
      const ethAmount = Number(amountWei) / 1e18;
      return `${ethAmount.toFixed(10)} ETH`;
    }

    const { symbol } = networkConfig.nativeToken;
    const amount = Number(amountWei) / 1e18;
    const price = this.getPrice(symbol);

    let result = `${amount.toFixed(10)} ${symbol}`;
    
    if (price) {
      const usdValue = amount * price;
      result += ` ($${usdValue.toFixed(4)})`;
    }

    return result;
  }

  /**
   * Get all current prices
   */
  getAllPrices(): PriceData {
    return { ...this.prices };
  }
}

// Singleton instance
const priceService = new PriceService();
export default priceService;
