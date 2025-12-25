//! External Configuration Loader
//!
//! Loads network and token configurations from external TOML files
//! allowing dynamic configuration without code changes.

use std::collections::HashMap;
use std::env;
use std::fs;
use std::path::Path;
use serde::Deserialize;
use tracing::{info, warn};

/// Transfer type for tokens
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TransferType {
    /// ERC-3009 transferWithAuthorization
    Erc3009,
    /// ERC-2612 permit + transferFrom
    Erc2612,
    /// Solana SPL Token (future)
    SplToken,
    /// Native transfer (future)
    Native,
}

impl Default for TransferType {
    fn default() -> Self {
        Self::Erc3009
    }
}

impl std::fmt::Display for TransferType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Erc3009 => write!(f, "erc3009"),
            Self::Erc2612 => write!(f, "erc2612"),
            Self::SplToken => write!(f, "spl_token"),
            Self::Native => write!(f, "native"),
        }
    }
}

/// Network type
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum NetworkType {
    Evm,
    Solana,
    Aptos,
}

impl Default for NetworkType {
    fn default() -> Self {
        Self::Evm
    }
}

/// Network environment
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum NetworkEnvironment {
    Mainnet,
    Testnet,
}

impl Default for NetworkEnvironment {
    fn default() -> Self {
        Self::Testnet
    }
}

/// Token configuration from TOML
#[derive(Debug, Clone, Deserialize)]
pub struct TokenConfigExternal {
    pub symbol: String,
    pub name: String,
    pub address: String,
    pub decimals: u8,
    #[serde(default)]
    pub transfer_type: TransferType,
    pub eip712_name: Option<String>,
    pub eip712_version: Option<String>,
    pub forwarder_address: Option<String>,
    #[serde(default = "default_true")]
    pub enabled: bool,
}

fn default_true() -> bool {
    true
}

/// Network configuration from TOML
#[derive(Debug, Clone, Deserialize)]
pub struct NetworkConfigExternal {
    pub name: String,
    pub chain_id: u64,
    #[serde(default)]
    pub network_type: NetworkType,
    #[serde(default)]
    pub environment: NetworkEnvironment,
    pub rpc_url_env: Option<String>,
    pub rpc_url_default: Option<String>,
    pub explorer_url: Option<String>,
    #[serde(default)]
    pub flashblock_enabled: bool,
    #[serde(default = "default_credit_cost")]
    pub credit_cost: i32,
    #[serde(default = "default_gas_limit")]
    pub gas_limit: u64,
    #[serde(default = "default_gas_buffer")]
    pub gas_buffer_percent: u32,
    pub native_symbol: String,
    pub native_name: String,
    #[serde(default = "default_native_decimals")]
    pub native_decimals: u8,
    pub native_cmc_slug: Option<String>,
    #[serde(default)]
    pub tokens: Vec<TokenConfigExternal>,
}

fn default_credit_cost() -> i32 {
    1
}

fn default_gas_limit() -> u64 {
    200000
}

fn default_gas_buffer() -> u32 {
    20
}

fn default_native_decimals() -> u8 {
    18
}

/// Global settings from TOML
#[derive(Debug, Clone, Deserialize, Default)]
pub struct GlobalSettings {
    #[serde(default = "default_gas_buffer")]
    pub default_gas_buffer_percent: u32,
    #[serde(default = "default_settlement_timeout")]
    pub default_settlement_timeout_ms: u64,
    #[serde(default = "default_transaction_timeout")]
    pub default_transaction_timeout_ms: u64,
}

fn default_settlement_timeout() -> u64 {
    60000
}

fn default_transaction_timeout() -> u64 {
    300000
}

/// Root structure for networks.toml
#[derive(Debug, Clone, Deserialize)]
pub struct NetworksConfig {
    #[serde(default)]
    pub settings: GlobalSettings,
    #[serde(default)]
    pub networks: Vec<NetworkConfigExternal>,
}

/// Credit bonus tier
#[derive(Debug, Clone, Deserialize)]
pub struct BonusTier {
    pub min_usd: f64,
    pub max_usd: f64,
    pub bonus_percent: u32,
}

/// Credit package
#[derive(Debug, Clone, Deserialize)]
pub struct CreditPackage {
    pub id: String,
    pub name: String,
    pub credits: i32,
    pub price_usd: f64,
    #[serde(default)]
    pub bonus_credits: i32,
    #[serde(default)]
    pub popular: bool,
}

/// Credit system config
#[derive(Debug, Clone, Deserialize, Default)]
pub struct CreditSystemConfig {
    #[serde(default = "default_credit_cost")]
    pub mainnet_base_credit_cost: i32,
    #[serde(default)]
    pub testnet_base_credit_cost: i32,
    #[serde(default)]
    pub bonus_tiers: Vec<BonusTier>,
}

/// Credit packages config
#[derive(Debug, Clone, Deserialize, Default)]
pub struct CreditPackagesConfig {
    #[serde(default)]
    pub packages: Vec<CreditPackage>,
}

/// Testnet credits config
#[derive(Debug, Clone, Deserialize)]
pub struct TestnetCreditsConfig {
    #[serde(default = "default_testnet_allocation")]
    pub initial_allocation: i32,
    #[serde(default)]
    pub monthly_reset: i32,
    #[serde(default = "default_max_testnet")]
    pub max_balance: i32,
}

fn default_testnet_allocation() -> i32 {
    1000
}

fn default_max_testnet() -> i32 {
    10000
}

impl Default for TestnetCreditsConfig {
    fn default() -> Self {
        Self {
            initial_allocation: 1000,
            monthly_reset: 0,
            max_balance: 10000,
        }
    }
}

/// Rate limits config
#[derive(Debug, Clone, Deserialize)]
pub struct RateLimitsConfig {
    #[serde(default = "default_verify_limit")]
    pub verify_requests_per_minute: u32,
    #[serde(default = "default_settle_limit")]
    pub settle_requests_per_minute: u32,
    #[serde(default = "default_api_limit")]
    pub api_requests_per_minute: u32,
    #[serde(default = "default_global_verify")]
    pub global_verify_per_minute: u32,
    #[serde(default = "default_global_settle")]
    pub global_settle_per_minute: u32,
}

fn default_verify_limit() -> u32 {
    60
}

fn default_settle_limit() -> u32 {
    20
}

fn default_api_limit() -> u32 {
    100
}

fn default_global_verify() -> u32 {
    1000
}

fn default_global_settle() -> u32 {
    500
}

impl Default for RateLimitsConfig {
    fn default() -> Self {
        Self {
            verify_requests_per_minute: 60,
            settle_requests_per_minute: 20,
            api_requests_per_minute: 100,
            global_verify_per_minute: 1000,
            global_settle_per_minute: 500,
        }
    }
}

/// Webhook config
#[derive(Debug, Clone, Deserialize)]
pub struct WebhooksConfig {
    #[serde(default = "default_webhook_timeout")]
    pub timeout_ms: u64,
    #[serde(default = "default_webhook_retries")]
    pub max_retries: u32,
    #[serde(default = "default_webhook_delays")]
    pub retry_delays_ms: Vec<u64>,
    #[serde(default = "default_signature_algo")]
    pub signature_algorithm: String,
}

fn default_webhook_timeout() -> u64 {
    10000
}

fn default_webhook_retries() -> u32 {
    3
}

fn default_webhook_delays() -> Vec<u64> {
    vec![1000, 5000, 15000]
}

fn default_signature_algo() -> String {
    "hmac-sha256".to_string()
}

impl Default for WebhooksConfig {
    fn default() -> Self {
        Self {
            timeout_ms: 10000,
            max_retries: 3,
            retry_delays_ms: vec![1000, 5000, 15000],
            signature_algorithm: "hmac-sha256".to_string(),
        }
    }
}

/// Root structure for fees.toml
#[derive(Debug, Clone, Deserialize, Default)]
pub struct FeesConfig {
    #[serde(default)]
    pub credit_system: CreditSystemConfig,
    #[serde(default)]
    pub credit_packages: CreditPackagesConfig,
    #[serde(default)]
    pub testnet_credits: TestnetCreditsConfig,
    #[serde(default)]
    pub rate_limits: RateLimitsConfig,
    #[serde(default)]
    pub webhooks: WebhooksConfig,
}

/// Combined external configuration
#[derive(Debug, Clone)]
pub struct ExternalConfig {
    pub networks: NetworksConfig,
    pub fees: FeesConfig,
}

impl ExternalConfig {
    /// Load configuration from TOML files
    pub fn load() -> Result<Self, ConfigLoaderError> {
        let config_dir = Self::get_config_dir();
        
        // Load networks.toml
        let networks_path = config_dir.join("networks.toml");
        let networks = Self::load_networks(&networks_path)?;
        
        // Load fees.toml
        let fees_path = config_dir.join("fees.toml");
        let fees = Self::load_fees(&fees_path)?;
        
        let config = Self { networks, fees };
        
        // Validate configuration
        config.validate()?;
        
        Ok(config)
    }
    
    /// Get configuration directory
    fn get_config_dir() -> std::path::PathBuf {
        // Check CONFIG_DIR env var first
        if let Ok(dir) = env::var("CONFIG_DIR") {
            return Path::new(&dir).to_path_buf();
        }
        
        // Default to ./config relative to executable
        let exe_dir = env::current_exe()
            .ok()
            .and_then(|p| p.parent().map(|p| p.to_path_buf()))
            .unwrap_or_else(|| Path::new(".").to_path_buf());
        
        // Try ./config first, then ../config (for development)
        let config_dir = exe_dir.join("config");
        if config_dir.exists() {
            return config_dir;
        }
        
        let config_dir = exe_dir.join("../config");
        if config_dir.exists() {
            return config_dir;
        }
        
        // Try current working directory
        let cwd_config = Path::new("./config");
        if cwd_config.exists() {
            return cwd_config.to_path_buf();
        }
        
        // Fallback to ./config
        Path::new("./config").to_path_buf()
    }
    
    /// Load networks configuration
    fn load_networks(path: &Path) -> Result<NetworksConfig, ConfigLoaderError> {
        if !path.exists() {
            warn!("Networks config not found at {:?}, using defaults", path);
            return Ok(NetworksConfig {
                settings: GlobalSettings::default(),
                networks: Vec::new(),
            });
        }
        
        let content = fs::read_to_string(path)
            .map_err(|e| ConfigLoaderError::IoError(format!("Failed to read {:?}: {}", path, e)))?;
        
        let config: NetworksConfig = toml::from_str(&content)
            .map_err(|e| ConfigLoaderError::ParseError(format!("Failed to parse networks.toml: {}", e)))?;
        
        info!("✅ Loaded {} networks from {:?}", config.networks.len(), path);
        
        Ok(config)
    }
    
    /// Load fees configuration
    fn load_fees(path: &Path) -> Result<FeesConfig, ConfigLoaderError> {
        if !path.exists() {
            warn!("Fees config not found at {:?}, using defaults", path);
            return Ok(FeesConfig::default());
        }
        
        let content = fs::read_to_string(path)
            .map_err(|e| ConfigLoaderError::IoError(format!("Failed to read {:?}: {}", path, e)))?;
        
        let config: FeesConfig = toml::from_str(&content)
            .map_err(|e| ConfigLoaderError::ParseError(format!("Failed to parse fees.toml: {}", e)))?;
        
        info!("✅ Loaded fees config from {:?}", path);
        
        Ok(config)
    }
    
    /// Validate the configuration
    fn validate(&self) -> Result<(), ConfigLoaderError> {
        // Check for duplicate network names
        let mut seen_networks = std::collections::HashSet::new();
        for network in &self.networks.networks {
            if !seen_networks.insert(&network.name) {
                return Err(ConfigLoaderError::ValidationError(
                    format!("Duplicate network name: {}", network.name)
                ));
            }
            
            // Validate each network
            self.validate_network(network)?;
        }
        
        Ok(())
    }
    
    /// Validate a single network configuration
    fn validate_network(&self, network: &NetworkConfigExternal) -> Result<(), ConfigLoaderError> {
        // Check for duplicate token addresses
        let mut seen_tokens = std::collections::HashSet::new();
        for token in &network.tokens {
            let key = token.address.to_lowercase();
            if !seen_tokens.insert(key) {
                return Err(ConfigLoaderError::ValidationError(
                    format!("Duplicate token address {} on network {}", token.address, network.name)
                ));
            }
            
            // Validate EIP-712 config for ERC-3009/2612
            if matches!(token.transfer_type, TransferType::Erc3009 | TransferType::Erc2612) {
                if token.eip712_name.is_none() {
                    return Err(ConfigLoaderError::ValidationError(
                        format!("Token {} on {} requires eip712_name for transfer_type {:?}", 
                                token.symbol, network.name, token.transfer_type)
                    ));
                }
            }
        }
        
        Ok(())
    }
    
    /// Get RPC URL for a network (resolves env var)
    pub fn get_rpc_url(&self, network_name: &str) -> Option<String> {
        self.networks.networks.iter()
            .find(|n| n.name.to_lowercase() == network_name.to_lowercase())
            .and_then(|n| {
                // Try env var first
                if let Some(env_var) = &n.rpc_url_env {
                    if let Ok(url) = env::var(env_var) {
                        if !url.is_empty() {
                            return Some(url);
                        }
                    }
                }
                // Fall back to default
                n.rpc_url_default.clone()
            })
    }
    
    /// Get network by name
    pub fn get_network(&self, name: &str) -> Option<&NetworkConfigExternal> {
        self.networks.networks.iter()
            .find(|n| n.name.to_lowercase() == name.to_lowercase())
    }
    
    /// Get token by address on a network
    pub fn get_token(&self, network: &str, address: &str) -> Option<&TokenConfigExternal> {
        self.get_network(network)
            .and_then(|n| {
                n.tokens.iter()
                    .find(|t| t.enabled && t.address.to_lowercase() == address.to_lowercase())
            })
    }
    
    /// Get all enabled mainnet network names
    pub fn mainnet_networks(&self) -> Vec<String> {
        self.networks.networks.iter()
            .filter(|n| matches!(n.environment, NetworkEnvironment::Mainnet))
            .map(|n| n.name.clone())
            .collect()
    }
    
    /// Get all enabled testnet network names
    pub fn testnet_networks(&self) -> Vec<String> {
        self.networks.networks.iter()
            .filter(|n| matches!(n.environment, NetworkEnvironment::Testnet))
            .map(|n| n.name.clone())
            .collect()
    }
    
    /// Get all network names
    pub fn all_networks(&self) -> Vec<String> {
        self.networks.networks.iter()
            .map(|n| n.name.clone())
            .collect()
    }
    
    /// Get credit cost for a network
    pub fn get_credit_cost(&self, network: &str) -> i32 {
        self.get_network(network)
            .map(|n| n.credit_cost)
            .unwrap_or(self.fees.credit_system.mainnet_base_credit_cost)
    }
    
    /// Calculate bonus credits for a USD amount
    pub fn calculate_bonus(&self, usd_amount: f64) -> u32 {
        for tier in &self.fees.credit_system.bonus_tiers {
            if usd_amount >= tier.min_usd && usd_amount <= tier.max_usd {
                return tier.bonus_percent;
            }
        }
        0
    }
    
    /// Convert to legacy Config format for backward compatibility
    pub fn to_legacy_config(&self) -> HashMap<String, LegacyNetworkConfig> {
        let mut networks = HashMap::new();
        
        for network in &self.networks.networks {
            let tokens: Vec<LegacyTokenConfig> = network.tokens.iter()
                .filter(|t| t.enabled)
                .map(|t| LegacyTokenConfig {
                    symbol: t.symbol.clone(),
                    name: t.name.clone(),
                    address: t.address.clone(),
                    decimals: t.decimals,
                    transfer_type: t.transfer_type.clone(),
                    eip712: t.eip712_name.as_ref().map(|name| LegacyEip712Config {
                        name: name.clone(),
                        version: t.eip712_version.clone().unwrap_or_else(|| "1".to_string()),
                    }),
                    forwarder_address: t.forwarder_address.clone().filter(|s| !s.is_empty()),
                })
                .collect();
            
            let rpc_url = self.get_rpc_url(&network.name)
                .unwrap_or_else(|| network.rpc_url_default.clone().unwrap_or_default());
            
            networks.insert(network.name.clone(), LegacyNetworkConfig {
                chain_id: network.chain_id,
                network_type: network.network_type.clone(),
                rpc_url,
                flashblock_enabled: network.flashblock_enabled,
                credit_cost: network.credit_cost,
                gas_limit: network.gas_limit,
                gas_buffer_percent: network.gas_buffer_percent,
                native_token: LegacyNativeToken {
                    symbol: network.native_symbol.clone(),
                    name: network.native_name.clone(),
                    decimals: network.native_decimals,
                    cmc_slug: network.native_cmc_slug.clone().unwrap_or_default(),
                },
                tokens,
            });
        }
        
        networks
    }
}

/// Legacy token config for backward compatibility
#[derive(Debug, Clone)]
pub struct LegacyTokenConfig {
    pub symbol: String,
    pub name: String,
    pub address: String,
    pub decimals: u8,
    pub transfer_type: TransferType,
    pub eip712: Option<LegacyEip712Config>,
    pub forwarder_address: Option<String>,
}

/// Legacy EIP-712 config
#[derive(Debug, Clone)]
pub struct LegacyEip712Config {
    pub name: String,
    pub version: String,
}

/// Legacy native token config
#[derive(Debug, Clone)]
pub struct LegacyNativeToken {
    pub symbol: String,
    pub name: String,
    pub decimals: u8,
    pub cmc_slug: String,
}

/// Legacy network config for backward compatibility
#[derive(Debug, Clone)]
pub struct LegacyNetworkConfig {
    pub chain_id: u64,
    pub network_type: NetworkType,
    pub rpc_url: String,
    pub flashblock_enabled: bool,
    pub credit_cost: i32,
    pub gas_limit: u64,
    pub gas_buffer_percent: u32,
    pub native_token: LegacyNativeToken,
    pub tokens: Vec<LegacyTokenConfig>,
}

/// Configuration loader errors
#[derive(Debug, thiserror::Error)]
pub enum ConfigLoaderError {
    #[error("IO error: {0}")]
    IoError(String),
    
    #[error("Parse error: {0}")]
    ParseError(String),
    
    #[error("Validation error: {0}")]
    ValidationError(String),
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_transfer_type_display() {
        assert_eq!(TransferType::Erc3009.to_string(), "erc3009");
        assert_eq!(TransferType::Erc2612.to_string(), "erc2612");
    }
    
    #[test]
    fn test_default_configs() {
        let settings = GlobalSettings::default();
        assert_eq!(settings.default_gas_buffer_percent, 20);
        
        let rate_limits = RateLimitsConfig::default();
        assert_eq!(rate_limits.verify_requests_per_minute, 60);
    }
}
