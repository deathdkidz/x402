//! Price Feed Service
//!
//! Fetches and caches native token prices (ETH, HYPE, MATIC, etc.)
//! for accurate gas cost calculations across different networks.

use rust_decimal::prelude::*;
use rust_decimal_macros::dec;
use std::sync::Arc;
use std::time::Duration;
use tracing::{info, warn, debug};
use tokio::time::sleep;

use crate::config::Config;
use crate::services::{ApiKeyDb, Database};

/// Service fee per settlement (USD)
/// This covers infrastructure costs regardless of gas
pub const SERVICE_FEE_USD: Decimal = dec!(0.001);

/// Price feed service for native tokens
pub struct PriceFeedService {
    config: Arc<Config>,
    database: Arc<Database>,
    
    /// In-memory cache for quick lookups
    price_cache: parking_lot::RwLock<std::collections::HashMap<String, CachedPrice>>,
}

/// Cached price with expiry
#[derive(Debug, Clone)]
struct CachedPrice {
    price: Decimal,
    expires_at: std::time::Instant,
}

impl PriceFeedService {
    pub fn new(config: Arc<Config>, database: Arc<Database>) -> Self {
        Self {
            config,
            database,
            price_cache: parking_lot::RwLock::new(std::collections::HashMap::new()),
        }
    }
    
    /// Start the background price update loop
    pub fn start(self: Arc<Self>) {
        tokio::spawn(async move {
            self.run_price_update_loop().await;
        });
        info!("💱 Price feed service started");
    }
    
    /// Main price update loop (every 5 minutes)
    async fn run_price_update_loop(&self) {
        let interval = Duration::from_secs(300); // 5 minutes
        
        loop {
            // Collect unique native tokens to avoid duplicate price fetches
            // (e.g., multiple networks use ETH as native token)
            let mut seen_symbols: std::collections::HashSet<String> = std::collections::HashSet::new();
            
            for network in self.config.networks.values() {
                let symbol = &network.native_token.symbol;
                let cmc_slug = &network.native_token.cmc_slug;
                
                // Skip if we've already fetched this token's price
                if seen_symbols.contains(symbol) {
                    continue;
                }
                seen_symbols.insert(symbol.clone());
                
                if let Err(e) = self.update_token_price(symbol, cmc_slug).await {
                    warn!("Failed to update {} price: {}", symbol, e);
                }
            }
            sleep(interval).await;
        }
    }
    
    /// Update price for a specific token
    async fn update_token_price(&self, symbol: &str, cmc_slug: &str) -> Result<(), String> {
        // Try CoinMarketCap first
        if !self.config.coinmarketcap_api_key.is_empty() && !cmc_slug.is_empty() {
            match self.fetch_price_from_cmc(cmc_slug).await {
                Ok(price) => {
                    self.cache_price(symbol, price, "coinmarketcap");
                    
                    // Also cache in database
                    if let Err(e) = ApiKeyDb::cache_native_token_price(
                        self.database.pool(),
                        symbol,
                        price,
                        "coinmarketcap",
                        15, // 15 minute TTL
                    ).await {
                        warn!("Failed to cache {} price in DB: {}", symbol, e);
                    }
                    
                    info!("📈 {} price: ${:.4}", symbol, price);
                    return Ok(());
                }
                Err(e) => {
                    debug!("CMC price fetch failed for {}: {}", symbol, e);
                }
            }
        }
        
        // Try database cache
        if let Ok(Some(price)) = ApiKeyDb::get_native_token_price(
            self.database.pool(),
            symbol,
        ).await {
            self.cache_price(symbol, price, "database");
            debug!("Using cached {} price: ${:.4}", symbol, price);
            return Ok(());
        }
        
        // Use fallback
        if let Ok(price) = ApiKeyDb::get_fallback_price(self.database.pool(), symbol).await {
            self.cache_price(symbol, price, "fallback");
            warn!("Using fallback {} price: ${:.4}", symbol, price);
        }
        
        Ok(())
    }
    
    /// Fetch price from CoinMarketCap
    async fn fetch_price_from_cmc(&self, slug: &str) -> Result<Decimal, String> {
        let client = reqwest::Client::new();
        let response = client
            .get("https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest")
            .query(&[("slug", slug), ("convert", "USD")])
            .header("X-CMC_PRO_API_KEY", &self.config.coinmarketcap_api_key)
            .timeout(Duration::from_secs(10))
            .send()
            .await
            .map_err(|e| format!("HTTP error: {}", e))?;

        if !response.status().is_success() {
            return Err(format!("CMC API error: {}", response.status()));
        }

        let json: serde_json::Value = response.json().await
            .map_err(|e| format!("JSON parse error: {}", e))?;

        // CMC response structure: data -> <id> -> quote -> USD -> price
        let data = json.get("data")
            .ok_or("No data in response")?
            .as_object()
            .ok_or("Data is not an object")?;
        
        // Get first (and only) entry
        let entry = data.values().next()
            .ok_or("No entries in data")?;
        
        let price = entry["quote"]["USD"]["price"]
            .as_f64()
            .ok_or("Price not found in response")?;

        Decimal::from_f64(price).ok_or_else(|| "Invalid price value".to_string())
    }
    
    /// Cache price in memory
    fn cache_price(&self, symbol: &str, price: Decimal, _source: &str) {
        let mut cache = self.price_cache.write();
        cache.insert(symbol.to_string(), CachedPrice {
            price,
            expires_at: std::time::Instant::now() + Duration::from_secs(600), // 10 min
        });
    }
    
    /// Get price for a native token
    pub async fn get_price(&self, symbol: &str) -> Decimal {
        // Check memory cache first
        {
            let cache = self.price_cache.read();
            if let Some(cached) = cache.get(symbol) {
                if cached.expires_at > std::time::Instant::now() {
                    return cached.price;
                }
            }
        }
        
        // Try database
        if let Ok(Some(price)) = ApiKeyDb::get_native_token_price(
            self.database.pool(),
            symbol,
        ).await {
            return price;
        }
        
        // Fallback
        ApiKeyDb::get_fallback_price(self.database.pool(), symbol)
            .await
            .unwrap_or_else(|_| {
                warn!("No price available for {}, using $1", symbol);
                dec!(1)
            })
    }
    
    /// Get price for a network's native token
    pub async fn get_price_for_network(&self, network: &str) -> Decimal {
        if let Some(net_config) = self.config.networks.get(network) {
            self.get_price(&net_config.native_token.symbol).await
        } else {
            warn!("Unknown network {}, using ETH price", network);
            self.get_price("ETH").await
        }
    }
    
    /// Calculate gas cost in USD
    pub async fn calculate_gas_cost_usd(
        &self,
        network: &str,
        gas_used: u64,
        gas_price_wei: u128,
    ) -> GasCostResult {
        let net_config = self.config.networks.get(network);
        let (symbol, decimals) = match net_config {
            Some(nc) => (nc.native_token.symbol.clone(), nc.native_token.decimals),
            None => ("ETH".to_string(), 18),
        };
        
        // Calculate gas cost in native token
        let gas_cost_wei = gas_used as u128 * gas_price_wei;
        let divisor = 10u128.pow(decimals as u32);
        let gas_cost_native = Decimal::from(gas_cost_wei) / Decimal::from(divisor);
        
        // Get native token price
        let native_price_usd = self.get_price(&symbol).await;
        
        // Calculate USD cost
        let gas_cost_usd = gas_cost_native * native_price_usd;
        
        debug!(
            "⛽ Gas cost: {} gas @ {} gwei = {} {} @ ${:.2}/{} = ${:.8}",
            gas_used,
            gas_price_wei / 1_000_000_000,
            gas_cost_native,
            symbol,
            native_price_usd,
            symbol,
            gas_cost_usd
        );
        
        GasCostResult {
            gas_used,
            gas_price_wei,
            gas_cost_native,
            native_symbol: symbol,
            native_price_usd,
            gas_cost_usd,
        }
    }
}

/// Result of gas cost calculation
#[derive(Debug, Clone)]
pub struct GasCostResult {
    pub gas_used: u64,
    pub gas_price_wei: u128,
    pub gas_cost_native: Decimal,
    pub native_symbol: String,
    pub native_price_usd: Decimal,
    pub gas_cost_usd: Decimal,
}

impl GasCostResult {
    /// Convert to GasDeductionData for database operations
    pub fn to_deduction_data(&self, network: &str) -> crate::services::GasDeductionData {
        crate::services::GasDeductionData {
            gas_used: self.gas_used,
            gas_price_wei: self.gas_price_wei,
            gas_cost_native: self.gas_cost_native,
            gas_cost_usd: self.gas_cost_usd,
            native_usd_price: self.native_price_usd,
            service_fee_usd: SERVICE_FEE_USD,
            network: network.to_string(),
        }
    }
}

impl PriceFeedService {
    /// Static method to calculate gas cost from a transaction receipt
    /// Used when we don't have access to the full service instance
    pub async fn calculate_gas_cost_from_receipt(
        receipt: &alloy::rpc::types::TransactionReceipt,
        network: &str,
        database: &Database,
    ) -> Result<Decimal, String> {
        let gas_used = receipt.gas_used;
        let gas_price = receipt.effective_gas_price;
        
        // Get native token symbol for network (default to ETH)
        let symbol = Self::get_native_symbol(network);
        let decimals = Self::get_native_decimals(network);
        
        // Calculate gas cost in native token
        let gas_cost_wei = gas_used as u128 * gas_price;
        let divisor = 10u128.pow(decimals as u32);
        let gas_cost_native = Decimal::from(gas_cost_wei) / Decimal::from(divisor);
        
        // Get native token price from database
        let native_price_usd = match ApiKeyDb::get_native_token_price(database.pool(), &symbol).await {
            Ok(Some(price)) => price,
            Ok(None) => {
                // Try fallback
                ApiKeyDb::get_fallback_price(database.pool(), &symbol).await.unwrap_or(dec!(1))
            }
            Err(e) => {
                warn!("Failed to get {} price: {}, using fallback", symbol, e);
                ApiKeyDb::get_fallback_price(database.pool(), &symbol).await.unwrap_or(dec!(1))
            }
        };
        
        let gas_cost_usd = gas_cost_native * native_price_usd;
        
        debug!(
            "⛽ Gas cost from receipt: {} gas @ {} gwei = {} {} @ ${:.2} = ${:.8}",
            gas_used,
            gas_price / 1_000_000_000,
            gas_cost_native,
            symbol,
            native_price_usd,
            gas_cost_usd
        );
        
        Ok(gas_cost_usd)
    }
    
    /// Get native token symbol for a network
    fn get_native_symbol(network: &str) -> String {
        match network.to_lowercase().as_str() {
            "hyperevm" | "hyperevm testnet" => "HYPE".to_string(),
            "polygon" | "polygon mumbai" => "MATIC".to_string(),
            "avalanche" | "avalanche fuji" => "AVAX".to_string(),
            "bnb smart chain" | "bnb testnet" => "BNB".to_string(),
            _ => "ETH".to_string(), // Default to ETH for Ethereum, Base, OP, etc.
        }
    }
    
    /// Get native token decimals for a network
    fn get_native_decimals(network: &str) -> u8 {
        // All EVM native tokens use 18 decimals
        match network.to_lowercase().as_str() {
            _ => 18,
        }
    }
}
