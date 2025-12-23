//! x402 Facilitator Configuration Module
//! 
//! Handles loading and managing configuration from environment variables
//! Supports multiple networks and tokens with EIP-712 domains

use std::collections::HashMap;
use std::env;
use once_cell::sync::Lazy;
use parking_lot::RwLock;

/// Token configuration for supported tokens on each network
#[derive(Debug, Clone)]
pub struct TokenConfig {
    pub symbol: String,
    pub name: String,
    pub address: String,
    pub decimals: u8,
    pub eip712: Option<Eip712Config>,
}

/// EIP-712 domain configuration for typed data signing
#[derive(Debug, Clone)]
pub struct Eip712Config {
    pub name: String,
    pub version: String,
}

/// Native token configuration
#[derive(Debug, Clone)]
#[allow(dead_code)]
pub struct NativeTokenConfig {
    pub symbol: String,
    pub name: String,
    pub cmc_slug: String,
}

/// Network configuration including RPC and supported tokens
#[derive(Debug, Clone)]
#[allow(dead_code)]
pub struct NetworkConfig {
    pub chain_id: u64,
    pub rpc_url: String,
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
#[allow(dead_code)]
pub struct Config {
    pub service_name: String,
    pub service_description: String,
    pub port: u16,
    pub https_port: u16,
    pub use_https: bool,
    pub node_env: String,
    pub paymaster_private_keys: Vec<String>,
    pub mainnet_networks: Vec<String>,
    pub testnet_networks: Vec<String>,
    pub networks: HashMap<String, NetworkConfig>,
    pub rate_limit_window_ms: u64,
    pub rate_limit_max_requests: u32,
    pub log_level: String,
    pub redis_url: String,
    pub coinmarketcap_api_key: String,
    pub database: DatabaseConfig,
    pub transaction_monitor_interval_ms: u64,
    pub transaction_timeout_ms: u64,
    pub settlement_gas_limit: u64,
    pub settlement_timeout_ms: u64,
    pub webhook_timeout_ms: u64,
    pub webhook_retry_attempts: u32,
    pub webhook_retry_delays: Vec<u64>,
    pub security_ban_threshold: u32,
    pub security_ban_duration_ms: u64,
    pub security_cleanup_interval_ms: u64,
    pub gas_buffer_percentage: u32,
    pub verify_rate_limit_window_ms: u64,
    pub verify_rate_limit_max: u32,
    pub settle_rate_limit_window_ms: u64,
    pub settle_rate_limit_max: u32,
    pub internal_api_secret: Option<String>,
}

impl Config {
    /// Load configuration from environment variables
    pub fn from_env() -> Result<Self, ConfigError> {
        dotenvy::dotenv().ok();

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

        // Load network lists
        let mainnet_networks: Vec<String> = env::var("MAINNET_NETWORKS")
            .unwrap_or_default()
            .split(',')
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .collect();

        let testnet_networks: Vec<String> = env::var("TESTNET_NETWORKS")
            .unwrap_or_default()
            .split(',')
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .collect();

        // Build network configurations
        let mut networks = HashMap::new();

        // Base Mainnet
        networks.insert("Base".to_string(), NetworkConfig {
            chain_id: 8453,
            rpc_url: env::var("BASE_RPC").unwrap_or_else(|_| "wss://base-mainnet.g.alchemy.com/v2/demo".to_string()),
            native_token: NativeTokenConfig {
                symbol: "ETH".to_string(),
                name: "Ethereum".to_string(),
                cmc_slug: "ethereum".to_string(),
            },
            tokens: vec![TokenConfig {
                symbol: "USDC".to_string(),
                name: "USD Coin".to_string(),
                address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913".to_string(),
                decimals: 6,
                eip712: Some(Eip712Config {
                    name: "USD Coin".to_string(),
                    version: "2".to_string(),
                }),
            }],
        });

        // Ethereum Mainnet
        networks.insert("Ethereum".to_string(), NetworkConfig {
            chain_id: 1,
            rpc_url: env::var("ETHEREUM_RPC").unwrap_or_else(|_| "https://eth-mainnet.g.alchemy.com/v2/demo".to_string()),
            native_token: NativeTokenConfig {
                symbol: "ETH".to_string(),
                name: "Ethereum".to_string(),
                cmc_slug: "ethereum".to_string(),
            },
            tokens: vec![TokenConfig {
                symbol: "USDC".to_string(),
                name: "USD Coin".to_string(),
                address: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48".to_string(),
                decimals: 6,
                eip712: Some(Eip712Config {
                    name: "USD Coin".to_string(),
                    version: "2".to_string(),
                }),
            }],
        });

        // HyperEVM
        networks.insert("HyperEVM".to_string(), NetworkConfig {
            chain_id: 999,
            rpc_url: env::var("HYPEREVM_RPC").unwrap_or_else(|_| "wss://hyperliquid-mainnet.g.alchemy.com/v2/demo".to_string()),
            native_token: NativeTokenConfig {
                symbol: "HYPE".to_string(),
                name: "Hyperliquid".to_string(),
                cmc_slug: "hyperliquid".to_string(),
            },
            tokens: vec![TokenConfig {
                symbol: "USDC".to_string(),
                name: "USDC".to_string(),
                address: "0xb88339CB7199b77E23DB6E890353E22632Ba630f".to_string(),
                decimals: 6,
                eip712: Some(Eip712Config {
                    name: "USDC".to_string(),
                    version: "1".to_string(),
                }),
            }],
        });

        // OP Mainnet
        networks.insert("OP Mainnet".to_string(), NetworkConfig {
            chain_id: 10,
            rpc_url: env::var("OP_MAINNET_RPC").unwrap_or_else(|_| "wss://opt-mainnet.g.alchemy.com/v2/demo".to_string()),
            native_token: NativeTokenConfig {
                symbol: "ETH".to_string(),
                name: "Ethereum".to_string(),
                cmc_slug: "ethereum".to_string(),
            },
            tokens: vec![TokenConfig {
                symbol: "USDC".to_string(),
                name: "USD Coin".to_string(),
                address: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85".to_string(),
                decimals: 6,
                eip712: Some(Eip712Config {
                    name: "USDC".to_string(),
                    version: "2".to_string(),
                }),
            }],
        });

        // Base Sepolia (Testnet)
        networks.insert("Base Sepolia".to_string(), NetworkConfig {
            chain_id: 84532,
            rpc_url: env::var("BASE_SEPOLIA_RPC").unwrap_or_else(|_| "wss://base-sepolia.g.alchemy.com/v2/demo".to_string()),
            native_token: NativeTokenConfig {
                symbol: "ETH".to_string(),
                name: "Ethereum".to_string(),
                cmc_slug: "ethereum".to_string(),
            },
            tokens: vec![TokenConfig {
                symbol: "USDC".to_string(),
                name: "USD Coin".to_string(),
                address: "0x036CbD53842c5426634e7929541eC2318f3dCF7e".to_string(),
                decimals: 6,
                eip712: Some(Eip712Config {
                    name: "USDC".to_string(),
                    version: "2".to_string(),
                }),
            }],
        });

        // Ethereum Sepolia (Testnet)
        networks.insert("Ethereum Sepolia".to_string(), NetworkConfig {
            chain_id: 11155111,
            rpc_url: env::var("ETHEREUM_SEPOLIA_RPC").unwrap_or_else(|_| "https://eth-sepolia.g.alchemy.com/v2/demo".to_string()),
            native_token: NativeTokenConfig {
                symbol: "ETH".to_string(),
                name: "Ethereum".to_string(),
                cmc_slug: "ethereum".to_string(),
            },
            tokens: vec![TokenConfig {
                symbol: "USDC".to_string(),
                name: "USD Coin".to_string(),
                address: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238".to_string(),
                decimals: 6,
                eip712: Some(Eip712Config {
                    name: "USDC".to_string(),
                    version: "2".to_string(),
                }),
            }],
        });

        // HyperEVM Testnet
        networks.insert("HyperEVM Testnet".to_string(), NetworkConfig {
            chain_id: 998,
            rpc_url: env::var("HYPEREVM_TESTNET_RPC").unwrap_or_else(|_| "wss://hyperliquid-testnet.g.alchemy.com/v2/demo".to_string()),
            native_token: NativeTokenConfig {
                symbol: "HYPE".to_string(),
                name: "Hyperliquid".to_string(),
                cmc_slug: "hyperliquid".to_string(),
            },
            tokens: vec![TokenConfig {
                symbol: "USDC".to_string(),
                name: "USDC".to_string(),
                address: "0x2B3370eE501B4a559b57D449569354196457D8Ab".to_string(),
                decimals: 6,
                eip712: Some(Eip712Config {
                    name: "USDC".to_string(),
                    version: "2".to_string(),
                }),
            }],
        });

        // OP Sepolia (Testnet)
        networks.insert("OP Sepolia".to_string(), NetworkConfig {
            chain_id: 11155420,
            rpc_url: env::var("OP_SEPOLIA_RPC").unwrap_or_else(|_| "https://opt-sepolia.g.alchemy.com/v2/demo".to_string()),
            native_token: NativeTokenConfig {
                symbol: "ETH".to_string(),
                name: "Ethereum".to_string(),
                cmc_slug: "ethereum".to_string(),
            },
            tokens: vec![TokenConfig {
                symbol: "USDC".to_string(),
                name: "USDC".to_string(),
                address: "0x5fd84259d66Cd46123540766Be93DFE6D43130D7".to_string(),
                decimals: 6,
                eip712: Some(Eip712Config {
                    name: "USDC".to_string(),
                    version: "2".to_string(),
                }),
            }],
        });

        Ok(Config {
            service_name: env::var("SERVICE_NAME").unwrap_or_else(|_| "x402 Facilitator".to_string()),
            service_description: env::var("SERVICE_DESCRIPTION").unwrap_or_else(|_| "Secure x402 payment facilitator".to_string()),
            port: env::var("PORT").unwrap_or_else(|_| "8080".to_string()).parse().unwrap_or(8080),
            https_port: env::var("HTTPS_PORT").unwrap_or_else(|_| "8443".to_string()).parse().unwrap_or(8443),
            use_https: env::var("USE_HTTPS").unwrap_or_else(|_| "false".to_string()).parse().unwrap_or(false),
            node_env: env::var("NODE_ENV").unwrap_or_else(|_| "production".to_string()),
            paymaster_private_keys,
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
        })
    }

    /// Get all supported networks (mainnet + testnet)
    pub fn all_networks(&self) -> Vec<String> {
        let mut all = self.mainnet_networks.clone();
        all.extend(self.testnet_networks.clone());
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

    /// Normalize network name (handle case variations)
    pub fn normalize_network_name(&self, network: &str) -> String {
        // Try exact match first
        if self.networks.contains_key(network) {
            return network.to_string();
        }

        // Case-insensitive search
        for key in self.networks.keys() {
            if key.to_lowercase() == network.to_lowercase() {
                return key.clone();
            }
        }

        // Title case conversion as fallback
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
#[allow(dead_code)]
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
}

/// Global configuration instance
#[allow(dead_code)]
pub static CONFIG: Lazy<RwLock<Option<Config>>> = Lazy::new(|| RwLock::new(None));

/// Initialize global configuration
#[allow(dead_code)]
pub fn init_config() -> Result<(), ConfigError> {
    let config = Config::from_env()?;
    *CONFIG.write() = Some(config);
    Ok(())
}

/// Get reference to global configuration
#[allow(dead_code)]
pub fn get_config() -> parking_lot::RwLockReadGuard<'static, Option<Config>> {
    CONFIG.read()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_normalize_network_name() {
        let config = Config {
            networks: HashMap::from([
                ("Base".to_string(), NetworkConfig {
                    chain_id: 8453,
                    rpc_url: "https://example.com".to_string(),
                    native_token: NativeTokenConfig {
                        symbol: "ETH".to_string(),
                        name: "Ethereum".to_string(),
                        cmc_slug: "ethereum".to_string(),
                    },
                    tokens: vec![],
                }),
            ]),
            ..Default::default()
        };

        assert_eq!(config.normalize_network_name("base"), "Base");
        assert_eq!(config.normalize_network_name("BASE"), "Base");
    }
}

impl Default for Config {
    fn default() -> Self {
        Config {
            service_name: "x402 Facilitator".to_string(),
            service_description: "Secure x402 payment facilitator".to_string(),
            port: 8080,
            https_port: 8443,
            use_https: false,
            node_env: "development".to_string(),
            paymaster_private_keys: vec![],
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
        }
    }
}
