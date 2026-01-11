//! x402 Facilitator Configuration Module
//! 
//! Handles loading and managing configuration from environment variables
//! and external TOML files for networks/tokens.
//! 
//! Configuration sources:
//! - Environment variables: Core service settings
//! - config/networks.toml: Network and token definitions (optional, overrides hardcoded)
//! - config/fees.toml: Credit system and fee settings

pub mod external;
pub mod network_resolver;

use std::collections::HashMap;
use std::env;
use std::sync::Arc;
use once_cell::sync::Lazy;
use parking_lot::RwLock;
use tracing::{info, warn};

pub use external::{
    ExternalConfig, TransferType, NetworkType,
    ConfigLoaderError,
};

/// Token configuration for supported tokens on each network
#[derive(Debug, Clone)]
pub struct TokenConfig {
    pub symbol: String,
    pub name: String,
    pub address: String,
    pub decimals: u8,
    pub transfer_type: TransferType,
    pub eip712: Option<Eip712Config>,
    pub forwarder_address: Option<String>,
}

/// EIP-712 domain configuration for typed data signing
#[derive(Debug, Clone)]
pub struct Eip712Config {
    pub name: String,
    pub version: String,
}

/// Native token configuration
#[derive(Debug, Clone)]
pub struct NativeTokenConfig {
    pub symbol: String,
    pub name: String,
    pub decimals: u8,
    pub cmc_slug: String,
}

/// Network configuration including RPC and supported tokens
#[derive(Debug, Clone)]
pub struct NetworkConfig {
    pub chain_id: u64,
    pub network_type: NetworkType,
    pub rpc_url: String,
    pub flashblock_enabled: bool,
    pub gas_limit: u64,
    pub gas_buffer_percent: u32,
    pub native_token: NativeTokenConfig,
    pub tokens: Vec<TokenConfig>,
}

/// Database configuration
#[derive(Debug, Clone)]
pub struct DatabaseConfig {
    pub host: String,
    pub port: u16,
    pub database: String,
    pub user: String,
    pub password: String,
    pub connection_limit: u32,
}

/// Main application configuration
#[derive(Debug, Clone)]
pub struct Config {
    // Service settings
    pub service_name: String,
    pub service_description: String,
    pub port: u16,
    pub https_port: u16,
    pub use_https: bool,
    pub node_env: String,
    
    // Paymaster
    pub paymaster_private_keys: Vec<String>,
    
    // Vault for credit purchases
    pub vault_address: Option<String>,
    pub vault_private_key: Option<String>,
    
    // Networks (from external config or hardcoded fallback)
    pub mainnet_networks: Vec<String>,
    pub testnet_networks: Vec<String>,
    pub networks: HashMap<String, NetworkConfig>,
    
    // Rate limiting
    pub rate_limit_window_ms: u64,
    pub rate_limit_max_requests: u32,
    pub verify_rate_limit_window_ms: u64,
    pub verify_rate_limit_max: u32,
    pub settle_rate_limit_window_ms: u64,
    pub settle_rate_limit_max: u32,
    
    // Logging
    pub log_level: String,
    
    // External services
    pub redis_url: String,
    pub coinmarketcap_api_key: String,
    pub database: DatabaseConfig,
    
    // Transaction settings
    pub transaction_monitor_interval_ms: u64,
    pub transaction_timeout_ms: u64,
    pub settlement_gas_limit: u64,
    pub settlement_timeout_ms: u64,
    
    // Webhooks
    pub webhook_timeout_ms: u64,
    pub webhook_retry_attempts: u32,
    pub webhook_retry_delays: Vec<u64>,
    
    // Security
    pub security_ban_threshold: u32,
    pub security_ban_duration_ms: u64,
    pub security_cleanup_interval_ms: u64,
    pub gas_buffer_percentage: u32,
    pub internal_api_secret: Option<String>,
    
    /// External configuration (networks, tokens, fees from TOML files)
    pub external: Option<Arc<ExternalConfig>>,
}

impl Config {
    /// Load configuration from environment variables and external files
    pub fn from_env() -> Result<Self, ConfigError> {
        dotenvy::dotenv().ok();

        // Try to load external configuration first
        let external_config = match ExternalConfig::load() {
            Ok(ext) => {
                info!("✅ External configuration loaded successfully");
                Some(Arc::new(ext))
            }
            Err(e) => {
                warn!("⚠️ External config not loaded ({}), using defaults", e);
                None
            }
        };

        // Load paymaster private keys (comma-separated)
        let paymaster_keys = env::var("PAYMASTER_PRIVATE_KEYS")
            .map_err(|_| ConfigError::MissingEnvVar("PAYMASTER_PRIVATE_KEYS".to_string()))?;
        
        let paymaster_private_keys: Vec<String> = paymaster_keys
            .split(',')
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .collect();

        if paymaster_private_keys.is_empty() {
            return Err(ConfigError::InvalidConfig("PAYMASTER_PRIVATE_KEYS contains no valid keys".to_string()));
        }

        // Load vault configuration (for credit purchases)
        let vault_address = env::var("VAULT_ADDRESS").ok();
        let vault_private_key = env::var("VAULT_PRIVATE_KEY").ok();
        
        if vault_address.is_some() {
            info!("✓ Vault address configured for credit purchases");
        }

        // Build networks - prefer external config, fallback to hardcoded
        let (mainnet_networks, testnet_networks, networks) = if let Some(ref ext) = external_config {
            let mainnet = ext.mainnet_networks();
            let testnet = ext.testnet_networks();
            let networks = Self::build_networks_from_external(ext);
            (mainnet, testnet, networks)
        } else {
            // Fallback to env vars and hardcoded networks
            let mainnet: Vec<String> = env::var("MAINNET_NETWORKS")
                .unwrap_or_default()
                .split(',')
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty())
                .collect();

            let testnet: Vec<String> = env::var("TESTNET_NETWORKS")
                .unwrap_or_default()
                .split(',')
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty())
                .collect();

            let networks = Self::build_default_networks();
            (mainnet, testnet, networks)
        };

        Ok(Config {
            service_name: env::var("SERVICE_NAME").unwrap_or_else(|_| "x402 Facilitator".to_string()),
            service_description: env::var("SERVICE_DESCRIPTION").unwrap_or_else(|_| "Secure x402 payment facilitator".to_string()),
            port: env::var("PORT").unwrap_or_else(|_| "8080".to_string()).parse().unwrap_or(8080),
            https_port: env::var("HTTPS_PORT").unwrap_or_else(|_| "8443".to_string()).parse().unwrap_or(8443),
            use_https: env::var("USE_HTTPS").unwrap_or_else(|_| "false".to_string()).parse().unwrap_or(false),
            node_env: env::var("NODE_ENV").unwrap_or_else(|_| "production".to_string()),
            paymaster_private_keys,
            vault_address,
            vault_private_key,
            mainnet_networks,
            testnet_networks,
            networks,
            rate_limit_window_ms: env::var("RATE_LIMIT_WINDOW_MS").unwrap_or_else(|_| "60000".to_string()).parse().unwrap_or(60000),
            rate_limit_max_requests: env::var("RATE_LIMIT_MAX_REQUESTS").unwrap_or_else(|_| "100".to_string()).parse().unwrap_or(100),
            log_level: env::var("LOG_LEVEL").unwrap_or_else(|_| "info".to_string()),
            redis_url: env::var("REDIS_URL").unwrap_or_else(|_| "redis://127.0.0.1:6379".to_string()),
            coinmarketcap_api_key: env::var("COINMARKETCAP_API_KEY").unwrap_or_default(),
            database: DatabaseConfig {
                host: env::var("DB_HOST").unwrap_or_else(|_| "localhost".to_string()),
                port: env::var("DB_PORT").unwrap_or_else(|_| "3306".to_string()).parse().unwrap_or(3306),
                database: env::var("DB_DATABASE").unwrap_or_else(|_| "x402".to_string()),
                user: env::var("DB_USER").unwrap_or_else(|_| "root".to_string()),
                password: env::var("DB_PASSWORD").unwrap_or_default(),
                connection_limit: env::var("DB_CONNECTION_LIMIT").unwrap_or_else(|_| "10".to_string()).parse().unwrap_or(10),
            },
            transaction_monitor_interval_ms: env::var("TRANSACTION_MONITOR_INTERVAL_MS").unwrap_or_else(|_| "5000".to_string()).parse().unwrap_or(5000),
            transaction_timeout_ms: env::var("TRANSACTION_TIMEOUT_MS").unwrap_or_else(|_| "300000".to_string()).parse().unwrap_or(300000),
            settlement_gas_limit: env::var("SETTLEMENT_GAS_LIMIT").unwrap_or_else(|_| "200000".to_string()).parse().unwrap_or(200000),
            settlement_timeout_ms: env::var("SETTLEMENT_TIMEOUT_MS").unwrap_or_else(|_| "60000".to_string()).parse().unwrap_or(60000),
            webhook_timeout_ms: env::var("WEBHOOK_TIMEOUT_MS").unwrap_or_else(|_| "10000".to_string()).parse().unwrap_or(10000),
            webhook_retry_attempts: env::var("WEBHOOK_RETRY_ATTEMPTS").unwrap_or_else(|_| "3".to_string()).parse().unwrap_or(3),
            webhook_retry_delays: vec![1000, 5000, 15000],
            security_ban_threshold: env::var("SECURITY_BAN_THRESHOLD").unwrap_or_else(|_| "10".to_string()).parse().unwrap_or(10),
            security_ban_duration_ms: env::var("SECURITY_BAN_DURATION_MS").unwrap_or_else(|_| "3600000".to_string()).parse().unwrap_or(3600000),
            security_cleanup_interval_ms: env::var("SECURITY_CLEANUP_INTERVAL_MS").unwrap_or_else(|_| "60000".to_string()).parse().unwrap_or(60000),
            gas_buffer_percentage: env::var("GAS_BUFFER_PERCENTAGE").unwrap_or_else(|_| "20".to_string()).parse().unwrap_or(20),
            verify_rate_limit_window_ms: env::var("VERIFY_RATE_LIMIT_WINDOW_MS").unwrap_or_else(|_| "60000".to_string()).parse().unwrap_or(60000),
            verify_rate_limit_max: env::var("VERIFY_RATE_LIMIT_MAX").unwrap_or_else(|_| "60".to_string()).parse().unwrap_or(60),
            settle_rate_limit_window_ms: env::var("SETTLE_RATE_LIMIT_WINDOW_MS").unwrap_or_else(|_| "60000".to_string()).parse().unwrap_or(60000),
            settle_rate_limit_max: env::var("SETTLE_RATE_LIMIT_MAX").unwrap_or_else(|_| "20".to_string()).parse().unwrap_or(20),
            internal_api_secret: env::var("INTERNAL_API_SECRET").ok().filter(|s| !s.is_empty()),
            external: external_config,
        })
    }

    /// Build networks from external configuration
    fn build_networks_from_external(ext: &Arc<ExternalConfig>) -> HashMap<String, NetworkConfig> {
        let mut networks = HashMap::new();
        
        // Only include enabled networks
        for net in ext.networks.networks.iter().filter(|n| n.enabled) {
            let rpc_url = ext.get_rpc_url(&net.name)
                .unwrap_or_else(|| net.rpc_url_default.clone().unwrap_or_default());
            
            let tokens: Vec<TokenConfig> = net.tokens.iter()
                .filter(|t| t.enabled)
                .map(|t| TokenConfig {
                    symbol: t.symbol.clone(),
                    name: t.name.clone(),
                    address: t.address.clone(),
                    decimals: t.decimals,
                    transfer_type: t.transfer_type.clone(),
                    eip712: t.eip712_name.as_ref().map(|name| Eip712Config {
                        name: name.clone(),
                        version: t.eip712_version.clone().unwrap_or_else(|| "1".to_string()),
                    }),
                    forwarder_address: t.forwarder_address.clone().filter(|s| !s.is_empty()),
                })
                .collect();
            
            networks.insert(net.name.clone(), NetworkConfig {
                chain_id: net.chain_id,
                network_type: net.network_type.clone(),
                rpc_url,
                flashblock_enabled: net.flashblock_enabled,
                gas_limit: net.gas_limit,
                gas_buffer_percent: net.gas_buffer_percent,
                native_token: NativeTokenConfig {
                    symbol: net.native_symbol.clone(),
                    name: net.native_name.clone(),
                    decimals: net.native_decimals,
                    cmc_slug: net.native_cmc_slug.clone().unwrap_or_default(),
                },
                tokens,
            });
        }
        
        networks
    }

    /// Build default hardcoded networks (fallback when no external config)
    fn build_default_networks() -> HashMap<String, NetworkConfig> {
        let mut networks = HashMap::new();
        
        // Helper to create default token config
        let usdc_token = |address: &str, eip712_name: &str, version: &str| -> TokenConfig {
            TokenConfig {
                symbol: "USDC".to_string(),
                name: "USD Coin".to_string(),
                address: address.to_string(),
                decimals: 6,
                transfer_type: TransferType::Erc3009,
                eip712: Some(Eip712Config {
                    name: eip712_name.to_string(),
                    version: version.to_string(),
                }),
                forwarder_address: None,
            }
        };
        
        let eth_native = || NativeTokenConfig {
            symbol: "ETH".to_string(),
            name: "Ethereum".to_string(),
            decimals: 18,
            cmc_slug: "ethereum".to_string(),
        };
        
        // Base Mainnet
        networks.insert("Base".to_string(), NetworkConfig {
            chain_id: 8453,
            network_type: NetworkType::Evm,
            rpc_url: env::var("BASE_RPC").unwrap_or_else(|_| "wss://base-mainnet.g.alchemy.com/v2/demo".to_string()),
            flashblock_enabled: true,
            gas_limit: 200000,
            gas_buffer_percent: 20,
            native_token: eth_native(),
            tokens: vec![usdc_token("0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", "USD Coin", "2")],
        });
        
        // Ethereum Mainnet
        networks.insert("Ethereum".to_string(), NetworkConfig {
            chain_id: 1,
            network_type: NetworkType::Evm,
            rpc_url: env::var("ETHEREUM_RPC").unwrap_or_else(|_| "https://eth-mainnet.g.alchemy.com/v2/demo".to_string()),
            flashblock_enabled: false,
            gas_limit: 200000,
            gas_buffer_percent: 25,
            native_token: eth_native(),
            tokens: vec![usdc_token("0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", "USD Coin", "2")],
        });
        
        // OP Mainnet
        networks.insert("OP Mainnet".to_string(), NetworkConfig {
            chain_id: 10,
            network_type: NetworkType::Evm,
            rpc_url: env::var("OP_MAINNET_RPC").unwrap_or_else(|_| "wss://opt-mainnet.g.alchemy.com/v2/demo".to_string()),
            flashblock_enabled: true,
            gas_limit: 200000,
            gas_buffer_percent: 20,
            native_token: eth_native(),
            tokens: vec![usdc_token("0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85", "USDC", "2")],
        });
        
        // HyperEVM
        networks.insert("HyperEVM".to_string(), NetworkConfig {
            chain_id: 999,
            network_type: NetworkType::Evm,
            rpc_url: env::var("HYPEREVM_RPC").unwrap_or_else(|_| "wss://hyperliquid-mainnet.g.alchemy.com/v2/demo".to_string()),
            flashblock_enabled: false,
            gas_limit: 200000,
            gas_buffer_percent: 20,
            native_token: NativeTokenConfig {
                symbol: "HYPE".to_string(),
                name: "Hyperliquid".to_string(),
                decimals: 18,
                cmc_slug: "hyperliquid".to_string(),
            },
            tokens: vec![usdc_token("0xb88339CB7199b77E23DB6E890353E22632Ba630f", "USDC", "1")],
        });
        
        // Base Sepolia (Testnet)
        networks.insert("Base Sepolia".to_string(), NetworkConfig {
            chain_id: 84532,
            network_type: NetworkType::Evm,
            rpc_url: env::var("BASE_SEPOLIA_RPC").unwrap_or_else(|_| "wss://base-sepolia.g.alchemy.com/v2/demo".to_string()),
            flashblock_enabled: true,
            gas_limit: 200000,
            gas_buffer_percent: 20,
            native_token: eth_native(),
            tokens: vec![usdc_token("0x036CbD53842c5426634e7929541eC2318f3dCF7e", "USDC", "2")],
        });
        
        // Ethereum Sepolia (Testnet)
        networks.insert("Ethereum Sepolia".to_string(), NetworkConfig {
            chain_id: 11155111,
            network_type: NetworkType::Evm,
            rpc_url: env::var("ETHEREUM_SEPOLIA_RPC").unwrap_or_else(|_| "https://eth-sepolia.g.alchemy.com/v2/demo".to_string()),
            flashblock_enabled: false,
            gas_limit: 200000,
            gas_buffer_percent: 25,
            native_token: eth_native(),
            tokens: vec![usdc_token("0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238", "USDC", "2")],
        });
        
        // OP Sepolia (Testnet)
        networks.insert("OP Sepolia".to_string(), NetworkConfig {
            chain_id: 11155420,
            network_type: NetworkType::Evm,
            rpc_url: env::var("OP_SEPOLIA_RPC").unwrap_or_else(|_| "https://opt-sepolia.g.alchemy.com/v2/demo".to_string()),
            flashblock_enabled: true,
            gas_limit: 200000,
            gas_buffer_percent: 20,
            native_token: eth_native(),
            tokens: vec![usdc_token("0x5fd84259d66Cd46123540766Be93DFE6D43130D7", "USDC", "2")],
        });
        
        // HyperEVM Testnet
        networks.insert("HyperEVM Testnet".to_string(), NetworkConfig {
            chain_id: 998,
            network_type: NetworkType::Evm,
            rpc_url: env::var("HYPEREVM_TESTNET_RPC").unwrap_or_else(|_| "wss://hyperliquid-testnet.g.alchemy.com/v2/demo".to_string()),
            flashblock_enabled: false,
            gas_limit: 200000,
            gas_buffer_percent: 20,
            native_token: NativeTokenConfig {
                symbol: "HYPE".to_string(),
                name: "Hyperliquid".to_string(),
                decimals: 18,
                cmc_slug: "hyperliquid".to_string(),
            },
            tokens: vec![usdc_token("0x2B3370eE501B4a559b57D449569354196457D8Ab", "USDC", "2")],
        });
        
        networks
    }

    /// Get all supported networks (mainnet + testnet)
    pub fn all_networks(&self) -> Vec<String> {
        let mut all = self.mainnet_networks.clone();
        all.extend(self.testnet_networks.clone());
        
        // If empty, use keys from networks map
        if all.is_empty() {
            all = self.networks.keys().cloned().collect();
        }
        
        all
    }

    /// Get RPC URL for a network
    pub fn get_rpc_url(&self, network: &str) -> Option<&str> {
        self.networks.get(network).map(|n| n.rpc_url.as_str())
    }

    /// Get token by address on a network
    pub fn get_token_by_address(&self, network: &str, address: &str) -> Option<&TokenConfig> {
        self.networks.get(network).and_then(|n| {
            n.tokens.iter().find(|t| t.address.to_lowercase() == address.to_lowercase())
        })
    }

    /// Get EIP-712 domain for a token
    pub fn get_eip712_domain(&self, network: &str, token_address: &str) -> Option<Eip712Domain> {
        let network_config = self.networks.get(network)?;
        let token = network_config.tokens.iter().find(|t| t.address.to_lowercase() == token_address.to_lowercase())?;
        let eip712 = token.eip712.as_ref()?;
        
        Some(Eip712Domain {
            name: eip712.name.clone(),
            version: eip712.version.clone(),
            chain_id: network_config.chain_id,
            verifying_contract: token.address.clone(),
        })
    }

    /// Get transfer type for a token
    pub fn get_transfer_type(&self, network: &str, token_address: &str) -> Option<TransferType> {
        self.get_token_by_address(network, token_address)
            .map(|t| t.transfer_type.clone())
    }

    /// Get forwarder address for a token
    pub fn get_forwarder_address(&self, network: &str, token_address: &str) -> Option<String> {
        self.get_token_by_address(network, token_address)
            .and_then(|t| t.forwarder_address.clone())
    }

    /// Check if network supports flashblocks
    pub fn is_flashblock_network(&self, network: &str) -> bool {
        self.networks.get(network)
            .map(|n| n.flashblock_enabled)
            .unwrap_or(false)
    }

    /// Normalize network name - supports CAIP-2, chain IDs, and name variations.
    /// 
    /// Supported formats:
    /// - Chain ID: "8453", "84532"
    /// - CAIP-2: "eip155:8453", "eip155:84532"
    /// - Names: "Base Sepolia", "base sepolia", "base-sepolia", "BASE_SEPOLIA"
    /// 
    /// Returns the canonical network name that matches config keys.
    pub fn normalize_network_name(&self, network: &str) -> String {
        // Try exact match first (most common case)
        if self.networks.contains_key(network) {
            return network.to_string();
        }

        // Use the CAIP-2 aware resolver
        if let Some(canonical) = network_resolver::resolve_network(network) {
            // Check if the resolved name exists in our config
            if self.networks.contains_key(&canonical) {
                return canonical;
            }
            // Try case-insensitive match against config keys
            for key in self.networks.keys() {
                if key.to_lowercase() == canonical.to_lowercase() {
                    return key.clone();
                }
            }
        }

        // Legacy: Case-insensitive search against config keys
        for key in self.networks.keys() {
            if key.to_lowercase() == network.to_lowercase() {
                return key.clone();
            }
        }

        // Title case conversion as last resort fallback
        network
            .split(|c: char| c == '-' || c == '_' || c == ' ')
            .map(|word| {
                let mut chars = word.chars();
                match chars.next() {
                    None => String::new(),
                    Some(first) => first.to_uppercase().collect::<String>() + chars.as_str().to_lowercase().as_str(),
                }
            })
            .collect::<Vec<_>>()
            .join(" ")
    }
}

/// EIP-712 domain for typed data signing
#[derive(Debug, Clone)]
pub struct Eip712Domain {
    pub name: String,
    pub version: String,
    pub chain_id: u64,
    pub verifying_contract: String,
}

/// Configuration error types
#[derive(Debug, thiserror::Error)]
pub enum ConfigError {
    #[error("Missing required environment variable: {0}")]
    MissingEnvVar(String),
    
    #[error("Invalid configuration: {0}")]
    InvalidConfig(String),
    
    #[error("External config error: {0}")]
    ExternalConfig(#[from] ConfigLoaderError),
}

/// Global configuration instance
pub static CONFIG: Lazy<RwLock<Option<Config>>> = Lazy::new(|| RwLock::new(None));

/// Initialize global configuration
pub fn init_config() -> Result<(), ConfigError> {
    let config = Config::from_env()?;
    *CONFIG.write() = Some(config);
    Ok(())
}

/// Get reference to global configuration
pub fn get_config() -> parking_lot::RwLockReadGuard<'static, Option<Config>> {
    CONFIG.read()
}

impl Default for Config {
    fn default() -> Self {
        Config {
            service_name: "NetPay x402 Facilitator".to_string(),
            service_description: "Secure & fast x402 payment facilitator".to_string(),
            port: 8080,
            https_port: 8443,
            use_https: false,
            node_env: "development".to_string(),
            paymaster_private_keys: vec![],
            vault_address: None,
            vault_private_key: None,
            mainnet_networks: vec![],
            testnet_networks: vec![],
            networks: HashMap::new(),
            rate_limit_window_ms: 60000,
            rate_limit_max_requests: 100,
            log_level: "info".to_string(),
            redis_url: "redis://127.0.0.1:6379".to_string(),
            coinmarketcap_api_key: String::new(),
            database: DatabaseConfig {
                host: "localhost".to_string(),
                port: 3306,
                database: "x402".to_string(),
                user: "root".to_string(),
                password: String::new(),
                connection_limit: 10,
            },
            transaction_monitor_interval_ms: 5000,
            transaction_timeout_ms: 300000,
            settlement_gas_limit: 200000,
            settlement_timeout_ms: 60000,
            webhook_timeout_ms: 10000,
            webhook_retry_attempts: 3,
            webhook_retry_delays: vec![1000, 5000, 15000],
            security_ban_threshold: 10,
            security_ban_duration_ms: 3600000,
            security_cleanup_interval_ms: 60000,
            gas_buffer_percentage: 20,
            verify_rate_limit_window_ms: 60000,
            verify_rate_limit_max: 60,
            settle_rate_limit_window_ms: 60000,
            settle_rate_limit_max: 20,
            internal_api_secret: None,
            external: None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn create_test_config() -> Config {
        Config {
            networks: HashMap::from([
                ("Base".to_string(), NetworkConfig {
                    chain_id: 8453,
                    network_type: NetworkType::Evm,
                    rpc_url: "https://example.com".to_string(),
                    flashblock_enabled: true,
                    gas_limit: 200000,
                    gas_buffer_percent: 20,
                    native_token: NativeTokenConfig {
                        symbol: "ETH".to_string(),
                        name: "Ethereum".to_string(),
                        decimals: 18,
                        cmc_slug: "ethereum".to_string(),
                    },
                    tokens: vec![],
                }),
                ("Base Sepolia".to_string(), NetworkConfig {
                    chain_id: 84532,
                    network_type: NetworkType::Evm,
                    rpc_url: "https://example.com".to_string(),
                    flashblock_enabled: false,
                    gas_limit: 200000,
                    gas_buffer_percent: 20,
                    native_token: NativeTokenConfig {
                        symbol: "ETH".to_string(),
                        name: "Ethereum".to_string(),
                        decimals: 18,
                        cmc_slug: "ethereum".to_string(),
                    },
                    tokens: vec![],
                }),
            ]),
            ..Default::default()
        }
    }

    #[test]
    fn test_normalize_network_name() {
        let config = create_test_config();

        // Exact match
        assert_eq!(config.normalize_network_name("Base"), "Base");
        assert_eq!(config.normalize_network_name("Base Sepolia"), "Base Sepolia");
        
        // Case variations
        assert_eq!(config.normalize_network_name("base"), "Base");
        assert_eq!(config.normalize_network_name("BASE"), "Base");
        assert_eq!(config.normalize_network_name("base sepolia"), "Base Sepolia");
        assert_eq!(config.normalize_network_name("BASE SEPOLIA"), "Base Sepolia");
    }

    #[test]
    fn test_normalize_with_chain_id() {
        let config = create_test_config();

        // Chain IDs
        assert_eq!(config.normalize_network_name("8453"), "Base");
        assert_eq!(config.normalize_network_name("84532"), "Base Sepolia");
    }

    #[test]
    fn test_normalize_with_caip2() {
        let config = create_test_config();

        // CAIP-2 format
        assert_eq!(config.normalize_network_name("eip155:8453"), "Base");
        assert_eq!(config.normalize_network_name("eip155:84532"), "Base Sepolia");
        assert_eq!(config.normalize_network_name("EIP155:8453"), "Base"); // Case insensitive
    }

    #[test]
    fn test_normalize_with_name_variations() {
        let config = create_test_config();

        // Dash/underscore variations
        assert_eq!(config.normalize_network_name("base-sepolia"), "Base Sepolia");
        assert_eq!(config.normalize_network_name("base_sepolia"), "Base Sepolia");
        assert_eq!(config.normalize_network_name("BASE-SEPOLIA"), "Base Sepolia");
        assert_eq!(config.normalize_network_name("BASE_SEPOLIA"), "Base Sepolia");
    }
}

