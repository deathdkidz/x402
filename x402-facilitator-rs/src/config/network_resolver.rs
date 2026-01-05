//! Network Resolution with CAIP-2 Support
//!
//! This module provides flexible network identification supporting:
//! - Chain IDs: "8453", "84532"
//! - CAIP-2 format: "eip155:8453", "eip155:84532"
//! - Human-readable names: "Base Sepolia", "base sepolia", "base-sepolia", "BASE_SEPOLIA"
//!
//! All lookups are case-insensitive.
//!
//! Note: The static registry serves as a fallback. When external config (networks.toml)
//! is loaded, it should be used as the primary source. The static registry ensures
//! basic functionality even without external config.

use std::collections::HashMap;
use once_cell::sync::Lazy;
use parking_lot::RwLock;

/// Network information struct
#[derive(Debug, Clone)]
pub struct NetworkInfo {
    /// Canonical name (e.g., "Base Sepolia")
    pub canonical_name: String,
    /// Chain ID (e.g., 84532)
    pub chain_id: u64,
    /// CAIP-2 identifier (e.g., "eip155:84532")
    pub caip2: String,
    /// Whether it's a testnet
    pub is_testnet: bool,
    /// Native token symbol
    pub native_token: String,
}

impl NetworkInfo {
    pub fn new(canonical_name: &str, chain_id: u64, is_testnet: bool, native_token: &str) -> Self {
        Self {
            canonical_name: canonical_name.to_string(),
            chain_id,
            caip2: format!("eip155:{}", chain_id),
            is_testnet,
            native_token: native_token.to_string(),
        }
    }
}

/// Dynamic network registry that can be updated from external config
/// Falls back to DEFAULT_NETWORKS if not initialized
static DYNAMIC_REGISTRY: Lazy<RwLock<Option<Vec<NetworkInfo>>>> = Lazy::new(|| RwLock::new(None));
static DYNAMIC_ALIASES: Lazy<RwLock<Option<HashMap<String, String>>>> = Lazy::new(|| RwLock::new(None));

/// Default static registry of networks (fallback when no external config)
static DEFAULT_NETWORKS: Lazy<Vec<NetworkInfo>> = Lazy::new(|| {
    vec![
        // Mainnets
        NetworkInfo::new("Base", 8453, false, "ETH"),
        NetworkInfo::new("Ethereum", 1, false, "ETH"),
        NetworkInfo::new("OP Mainnet", 10, false, "ETH"),
        NetworkInfo::new("HyperEVM", 999, false, "HYPE"),
        NetworkInfo::new("Arbitrum", 42161, false, "ETH"),
        NetworkInfo::new("Polygon", 137, false, "MATIC"),
        NetworkInfo::new("Avalanche", 43114, false, "AVAX"),
        NetworkInfo::new("BSC", 56, false, "BNB"),
        
        // Testnets
        NetworkInfo::new("Base Sepolia", 84532, true, "ETH"),
        NetworkInfo::new("Ethereum Sepolia", 11155111, true, "ETH"),
        NetworkInfo::new("OP Sepolia", 11155420, true, "ETH"),
        NetworkInfo::new("HyperEVM Testnet", 998, true, "HYPE"),
        NetworkInfo::new("Arbitrum Sepolia", 421614, true, "ETH"),
        NetworkInfo::new("Polygon Amoy", 80002, true, "MATIC"),
    ]
});

/// Initialize the network registry from external config
/// Call this once during application startup after loading ExternalConfig
pub fn init_from_external_config(networks: Vec<NetworkInfo>, aliases: HashMap<String, String>) {
    let mut reg = DYNAMIC_REGISTRY.write();
    *reg = Some(networks);
    
    let mut al = DYNAMIC_ALIASES.write();
    *al = Some(aliases);
    
    tracing::info!("Network resolver initialized with external config");
}

/// Get the active network registry (dynamic or fallback)
fn get_network_registry() -> Vec<NetworkInfo> {
    let reg = DYNAMIC_REGISTRY.read();
    match &*reg {
        Some(networks) => networks.clone(),
        None => DEFAULT_NETWORKS.clone(),
    }
}

/// Default alias mapping for name variations (lowercase -> canonical name)
/// This serves as fallback when no external config aliases are loaded
fn get_default_aliases() -> HashMap<String, String> {
    let mut m = HashMap::new();
    
    // Base
    m.insert("base".to_string(), "Base".to_string());
    m.insert("base mainnet".to_string(), "Base".to_string());
    m.insert("base-mainnet".to_string(), "Base".to_string());
    m.insert("base_mainnet".to_string(), "Base".to_string());
    
    // Ethereum
    m.insert("ethereum".to_string(), "Ethereum".to_string());
    m.insert("eth".to_string(), "Ethereum".to_string());
    m.insert("mainnet".to_string(), "Ethereum".to_string());
    m.insert("ethereum mainnet".to_string(), "Ethereum".to_string());
    m.insert("eth mainnet".to_string(), "Ethereum".to_string());
    m.insert("ethereum-mainnet".to_string(), "Ethereum".to_string());
    m.insert("eth-mainnet".to_string(), "Ethereum".to_string());
    
    // OP Mainnet
    m.insert("op mainnet".to_string(), "OP Mainnet".to_string());
    m.insert("op-mainnet".to_string(), "OP Mainnet".to_string());
    m.insert("op_mainnet".to_string(), "OP Mainnet".to_string());
    m.insert("optimism".to_string(), "OP Mainnet".to_string());
    m.insert("optimism mainnet".to_string(), "OP Mainnet".to_string());
    m.insert("optimism-mainnet".to_string(), "OP Mainnet".to_string());
    m.insert("op".to_string(), "OP Mainnet".to_string());
    
    // HyperEVM
    m.insert("hyperevm".to_string(), "HyperEVM".to_string());
    m.insert("hyper evm".to_string(), "HyperEVM".to_string());
    m.insert("hyper-evm".to_string(), "HyperEVM".to_string());
    m.insert("hyperliquid".to_string(), "HyperEVM".to_string());
    m.insert("hyperliquid evm".to_string(), "HyperEVM".to_string());
    m.insert("hyperliquid-evm".to_string(), "HyperEVM".to_string());
    
    // Arbitrum
    m.insert("arbitrum".to_string(), "Arbitrum".to_string());
    m.insert("arb".to_string(), "Arbitrum".to_string());
    m.insert("arbitrum one".to_string(), "Arbitrum".to_string());
    m.insert("arbitrum-one".to_string(), "Arbitrum".to_string());
    m.insert("arbitrum mainnet".to_string(), "Arbitrum".to_string());
    
    // Polygon
    m.insert("polygon".to_string(), "Polygon".to_string());
    m.insert("matic".to_string(), "Polygon".to_string());
    m.insert("polygon mainnet".to_string(), "Polygon".to_string());
    m.insert("polygon-mainnet".to_string(), "Polygon".to_string());
    
    // Avalanche
    m.insert("avalanche".to_string(), "Avalanche".to_string());
    m.insert("avax".to_string(), "Avalanche".to_string());
    m.insert("avalanche c-chain".to_string(), "Avalanche".to_string());
    m.insert("avalanche-c-chain".to_string(), "Avalanche".to_string());
    
    // BSC
    m.insert("bsc".to_string(), "BSC".to_string());
    m.insert("bnb".to_string(), "BSC".to_string());
    m.insert("bnb chain".to_string(), "BSC".to_string());
    m.insert("bnb-chain".to_string(), "BSC".to_string());
    m.insert("binance".to_string(), "BSC".to_string());
    m.insert("binance smart chain".to_string(), "BSC".to_string());
    
    // Base Sepolia
    m.insert("base sepolia".to_string(), "Base Sepolia".to_string());
    m.insert("base-sepolia".to_string(), "Base Sepolia".to_string());
    m.insert("base_sepolia".to_string(), "Base Sepolia".to_string());
    m.insert("basesepolia".to_string(), "Base Sepolia".to_string());
    
    // Ethereum Sepolia
    m.insert("ethereum sepolia".to_string(), "Ethereum Sepolia".to_string());
    m.insert("ethereum-sepolia".to_string(), "Ethereum Sepolia".to_string());
    m.insert("ethereum_sepolia".to_string(), "Ethereum Sepolia".to_string());
    m.insert("eth sepolia".to_string(), "Ethereum Sepolia".to_string());
    m.insert("eth-sepolia".to_string(), "Ethereum Sepolia".to_string());
    m.insert("sepolia".to_string(), "Ethereum Sepolia".to_string());
    
    // OP Sepolia
    m.insert("op sepolia".to_string(), "OP Sepolia".to_string());
    m.insert("op-sepolia".to_string(), "OP Sepolia".to_string());
    m.insert("op_sepolia".to_string(), "OP Sepolia".to_string());
    m.insert("optimism sepolia".to_string(), "OP Sepolia".to_string());
    m.insert("optimism-sepolia".to_string(), "OP Sepolia".to_string());
    
    // HyperEVM Testnet
    m.insert("hyperevm testnet".to_string(), "HyperEVM Testnet".to_string());
    m.insert("hyperevm-testnet".to_string(), "HyperEVM Testnet".to_string());
    m.insert("hyperevm_testnet".to_string(), "HyperEVM Testnet".to_string());
    m.insert("hyperliquid testnet".to_string(), "HyperEVM Testnet".to_string());
    m.insert("hyperliquid-testnet".to_string(), "HyperEVM Testnet".to_string());
    
    // Arbitrum Sepolia
    m.insert("arbitrum sepolia".to_string(), "Arbitrum Sepolia".to_string());
    m.insert("arbitrum-sepolia".to_string(), "Arbitrum Sepolia".to_string());
    m.insert("arb sepolia".to_string(), "Arbitrum Sepolia".to_string());
    m.insert("arb-sepolia".to_string(), "Arbitrum Sepolia".to_string());
    
    // Polygon Amoy
    m.insert("polygon amoy".to_string(), "Polygon Amoy".to_string());
    m.insert("polygon-amoy".to_string(), "Polygon Amoy".to_string());
    m.insert("matic amoy".to_string(), "Polygon Amoy".to_string());
    m.insert("amoy".to_string(), "Polygon Amoy".to_string());
    
    m
}

/// Get the active alias mapping (dynamic or fallback)
fn get_name_aliases() -> HashMap<String, String> {
    let al = DYNAMIC_ALIASES.read();
    match &*al {
        Some(aliases) => aliases.clone(),
        None => get_default_aliases(),
    }
}

/// Build chain ID to canonical name mapping from current registry
fn get_chain_id_map() -> HashMap<u64, String> {
    get_network_registry()
        .iter()
        .map(|n| (n.chain_id, n.canonical_name.clone()))
        .collect()
}

/// Resolve a network identifier to its canonical name.
///
/// Supports:
/// - Chain ID as string: "8453", "84532"
/// - CAIP-2 format: "eip155:8453", "eip155:84532"
/// - Human-readable names (case-insensitive): "Base Sepolia", "base-sepolia", "BASE_SEPOLIA"
///
/// # Arguments
/// * `input` - The network identifier to resolve
///
/// # Returns
/// * `Some(String)` - The canonical network name if found
/// * `None` - If the network could not be resolved
pub fn resolve_network(input: &str) -> Option<String> {
    let input = input.trim();
    
    if input.is_empty() {
        return None;
    }
    
    let chain_id_map = get_chain_id_map();
    let name_aliases = get_name_aliases();
    let registry = get_network_registry();
    
    // 1. Try parsing as chain ID (pure numeric)
    if let Ok(chain_id) = input.parse::<u64>() {
        if let Some(name) = chain_id_map.get(&chain_id) {
            tracing::debug!(chain_id = chain_id, canonical = %name, "Resolved network from chain ID");
            return Some(name.clone());
        }
    }
    
    // 2. Try CAIP-2 format (eip155:<chainId>)
    if let Some(chain_id_str) = input.to_lowercase().strip_prefix("eip155:") {
        if let Ok(chain_id) = chain_id_str.parse::<u64>() {
            if let Some(name) = chain_id_map.get(&chain_id) {
                tracing::debug!(caip2 = %input, canonical = %name, "Resolved network from CAIP-2");
                return Some(name.clone());
            }
        }
    }
    
    // 3. Normalize input for name matching
    let normalized = normalize_for_matching(input);
    
    // 4. Check name aliases
    if let Some(name) = name_aliases.get(&normalized) {
        tracing::debug!(input = %input, canonical = %name, "Resolved network from alias");
        return Some(name.clone());
    }
    
    // 5. Try direct canonical name match (case-insensitive)
    for network in registry.iter() {
        if network.canonical_name.to_lowercase() == normalized {
            tracing::debug!(input = %input, canonical = %network.canonical_name, "Resolved network from canonical name");
            return Some(network.canonical_name.clone());
        }
    }
    
    // 6. Fuzzy match - try removing common suffixes/prefixes
    let without_network = normalized
        .replace(" network", "")
        .replace("-network", "")
        .replace("_network", "")
        .replace(" chain", "")
        .replace("-chain", "")
        .replace("_chain", "");
    
    if without_network != normalized {
        if let Some(name) = name_aliases.get(&without_network) {
            tracing::debug!(input = %input, canonical = %name, "Resolved network after removing suffix");
            return Some(name.clone());
        }
    }
    
    tracing::warn!(input = %input, "Failed to resolve network");
    None
}

/// Normalize a string for matching:
/// - Convert to lowercase
/// - Replace underscores with spaces
/// - Trim whitespace
fn normalize_for_matching(s: &str) -> String {
    s.to_lowercase()
        .replace('_', " ")
        .replace('-', " ")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

/// Get full network info by any identifier
/// Note: Returns cloned NetworkInfo since registry may be dynamic
pub fn get_network_info(input: &str) -> Option<NetworkInfo> {
    let canonical = resolve_network(input)?;
    let registry = get_network_registry();
    registry
        .into_iter()
        .find(|n| n.canonical_name == canonical)
}

/// Get chain ID from any network identifier
pub fn get_chain_id(input: &str) -> Option<u64> {
    get_network_info(input).map(|n| n.chain_id)
}

/// Get CAIP-2 identifier from any network identifier
pub fn get_caip2(input: &str) -> Option<String> {
    get_network_info(input).map(|n| n.caip2.clone())
}

/// Check if a network is a testnet
pub fn is_testnet(input: &str) -> Option<bool> {
    get_network_info(input).map(|n| n.is_testnet)
}

/// List all supported networks
pub fn list_networks() -> Vec<NetworkInfo> {
    get_network_registry()
}

/// List all supported chain IDs
pub fn list_chain_ids() -> Vec<u64> {
    get_network_registry().iter().map(|n| n.chain_id).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_chain_id_resolution() {
        assert_eq!(resolve_network("8453"), Some("Base".to_string()));
        assert_eq!(resolve_network("84532"), Some("Base Sepolia".to_string()));
        assert_eq!(resolve_network("1"), Some("Ethereum".to_string()));
        assert_eq!(resolve_network("10"), Some("OP Mainnet".to_string()));
        assert_eq!(resolve_network("999"), Some("HyperEVM".to_string()));
        assert_eq!(resolve_network("998"), Some("HyperEVM Testnet".to_string()));
    }

    #[test]
    fn test_caip2_resolution() {
        assert_eq!(resolve_network("eip155:8453"), Some("Base".to_string()));
        assert_eq!(resolve_network("eip155:84532"), Some("Base Sepolia".to_string()));
        assert_eq!(resolve_network("EIP155:8453"), Some("Base".to_string())); // Case insensitive
        assert_eq!(resolve_network("eip155:1"), Some("Ethereum".to_string()));
    }

    #[test]
    fn test_name_variations() {
        // Base Sepolia variations
        assert_eq!(resolve_network("Base Sepolia"), Some("Base Sepolia".to_string()));
        assert_eq!(resolve_network("base sepolia"), Some("Base Sepolia".to_string()));
        assert_eq!(resolve_network("base-sepolia"), Some("Base Sepolia".to_string()));
        assert_eq!(resolve_network("base_sepolia"), Some("Base Sepolia".to_string()));
        assert_eq!(resolve_network("BASE SEPOLIA"), Some("Base Sepolia".to_string()));
        assert_eq!(resolve_network("BASE_SEPOLIA"), Some("Base Sepolia".to_string()));
        assert_eq!(resolve_network("basesepolia"), Some("Base Sepolia".to_string()));
        
        // OP Mainnet variations
        assert_eq!(resolve_network("OP Mainnet"), Some("OP Mainnet".to_string()));
        assert_eq!(resolve_network("optimism"), Some("OP Mainnet".to_string()));
        assert_eq!(resolve_network("op"), Some("OP Mainnet".to_string()));
        
        // Ethereum variations
        assert_eq!(resolve_network("ethereum"), Some("Ethereum".to_string()));
        assert_eq!(resolve_network("eth"), Some("Ethereum".to_string()));
        assert_eq!(resolve_network("mainnet"), Some("Ethereum".to_string()));
    }

    #[test]
    fn test_unknown_network() {
        assert_eq!(resolve_network("unknown"), None);
        assert_eq!(resolve_network("12345678"), None);
        assert_eq!(resolve_network("eip155:12345678"), None);
        assert_eq!(resolve_network(""), None);
    }

    #[test]
    fn test_get_network_info() {
        let info = get_network_info("base-sepolia").unwrap();
        assert_eq!(info.canonical_name, "Base Sepolia");
        assert_eq!(info.chain_id, 84532);
        assert_eq!(info.caip2, "eip155:84532");
        assert!(info.is_testnet);
        assert_eq!(info.native_token, "ETH");
    }

    #[test]
    fn test_get_chain_id() {
        assert_eq!(get_chain_id("base-sepolia"), Some(84532));
        assert_eq!(get_chain_id("eip155:8453"), Some(8453));
        assert_eq!(get_chain_id("unknown"), None);
    }

    #[test]
    fn test_whitespace_handling() {
        assert_eq!(resolve_network("  base sepolia  "), Some("Base Sepolia".to_string()));
        assert_eq!(resolve_network("base  sepolia"), Some("Base Sepolia".to_string()));
    }
}
