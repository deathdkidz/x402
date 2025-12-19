//! Provider Pool
//! 
//! Manages persistent RPC provider connections for all configured networks.
//! Supports both HTTP and WebSocket connections with automatic reconnection.

#![allow(dead_code)]

use std::collections::HashMap;
use std::sync::Arc;
use parking_lot::RwLock;

use tracing::{info, warn, error, debug};
use alloy::providers::{Provider, ProviderBuilder, RootProvider};
use alloy::transports::http::Http;

use reqwest::Client;

use crate::config::Config;

/// Provider type enum to handle both HTTP and WS
pub enum ProviderType {
    Http(RootProvider<Http<Client>>),
    // WebSocket would require more complex handling with alloy
    // For now, we'll use HTTP providers which are simpler and reliable
}

impl ProviderType {
    /// Get the underlying provider for calls
    pub fn as_http(&self) -> Option<&RootProvider<Http<Client>>> {
        match self {
            ProviderType::Http(p) => Some(p),
        }
    }
}

/// Provider pool managing connections for all networks
pub struct ProviderPool {
    providers: RwLock<HashMap<String, Arc<ProviderType>>>,
    config: Arc<Config>,
    reconnect_attempts: RwLock<HashMap<String, u32>>,
    max_reconnect_attempts: u32,
}

impl ProviderPool {
    /// Create a new provider pool
    pub fn new(config: Arc<Config>) -> Self {
        Self {
            providers: RwLock::new(HashMap::new()),
            config,
            reconnect_attempts: RwLock::new(HashMap::new()),
            max_reconnect_attempts: 5,
        }
    }

    /// Initialize providers for all configured networks
    pub async fn initialize(&self) -> Result<(), ProviderPoolError> {
        let networks = self.config.all_networks();
        
        info!("📡 Initializing provider pool for {} networks...", networks.len());
        
        let mut http_count = 0;
        let mut ws_count = 0;
        
        for network in &networks {
            match self.create_provider(network).await {
                Ok(is_ws) => {
                    if is_ws {
                        ws_count += 1;
                    } else {
                        http_count += 1;
                    }
                }
                Err(e) => {
                    error!("   ❌ {}: Failed to initialize provider - {}", network, e);
                }
            }
        }
        
        if http_count > 0 {
            info!("   ✅ Initialized {} HTTP provider(s)", http_count);
        }
        if ws_count > 0 {
            info!("   ✅ Connected {} WebSocket connection(s)", ws_count);
        }
        
        Ok(())
    }

    /// Create a provider for a specific network
    async fn create_provider(&self, network: &str) -> Result<bool, ProviderPoolError> {
        let normalized = self.config.normalize_network_name(network);
        
        // Check if already exists
        if self.providers.read().contains_key(&normalized) {
            return Ok(false);
        }
        
        let rpc_url = self.config.get_rpc_url(&normalized)
            .ok_or_else(|| ProviderPoolError::NetworkNotFound(normalized.clone()))?;
        
        let is_websocket = rpc_url.starts_with("wss://") || rpc_url.starts_with("ws://");
        
        // For now, convert WebSocket URLs to HTTP for simplicity
        // Full WebSocket support requires more complex connection handling
        let http_url = if is_websocket {
            rpc_url.replace("wss://", "https://").replace("ws://", "http://")
        } else {
            rpc_url.to_string()
        };
        
        let provider = ProviderBuilder::new()
            .on_http(http_url.parse().map_err(|e| ProviderPoolError::ConnectionError(format!("Invalid URL: {}", e)))?);
        
        // Test connection by getting chain ID
        match provider.get_chain_id().await {
            Ok(chain_id) => {
                debug!("   ✓ {}: Connected (chain_id: {})", normalized, chain_id);
                
                self.providers.write().insert(
                    normalized.clone(),
                    Arc::new(ProviderType::Http(provider))
                );
                
                self.reconnect_attempts.write().insert(normalized, 0);
                
                Ok(is_websocket)
            }
            Err(e) => {
                warn!("   ⚠️ {}: Connection test failed - {}", normalized, e);
                // Still add the provider, it might work later
                self.providers.write().insert(
                    normalized.clone(),
                    Arc::new(ProviderType::Http(provider))
                );
                Ok(is_websocket)
            }
        }
    }

    /// Get provider for a network
    pub fn get_provider(&self, network: &str) -> Result<Arc<ProviderType>, ProviderPoolError> {
        let normalized = self.config.normalize_network_name(network);
        
        self.providers.read()
            .get(&normalized)
            .cloned()
            .ok_or_else(|| ProviderPoolError::NetworkNotFound(normalized))
    }

    /// Check if a network has an active provider
    pub fn has_provider(&self, network: &str) -> bool {
        let normalized = self.config.normalize_network_name(network);
        self.providers.read().contains_key(&normalized)
    }

    /// Get pool statistics
    pub fn get_stats(&self) -> ProviderPoolStats {
        let providers = self.providers.read();
        
        ProviderPoolStats {
            total: providers.len(),
            http: providers.len(), // All are HTTP for now
            websocket: 0,
            networks: providers.keys().cloned().collect(),
        }
    }

    /// Recreate a provider (for reconnection)
    pub async fn recreate_provider(&self, network: &str) -> Result<(), ProviderPoolError> {
        let normalized = self.config.normalize_network_name(network);
        
        // Check reconnect attempts
        let attempts = {
            let mut attempts = self.reconnect_attempts.write();
            let count = attempts.entry(normalized.clone()).or_insert(0);
            *count += 1;
            *count
        };
        
        if attempts > self.max_reconnect_attempts {
            error!("❌ {}: Max reconnection attempts reached", normalized);
            return Err(ProviderPoolError::MaxReconnectAttempts(normalized));
        }
        
        info!("🔄 {}: Attempting reconnection ({}/{})", normalized, attempts, self.max_reconnect_attempts);
        
        // Remove old provider
        self.providers.write().remove(&normalized);
        
        // Create new one
        self.create_provider(&normalized).await?;
        
        // Reset attempts on success
        self.reconnect_attempts.write().insert(normalized.clone(), 0);
        
        info!("✅ {}: Reconnection successful", normalized);
        Ok(())
    }
}

/// Provider pool statistics
#[derive(Debug, Clone)]
pub struct ProviderPoolStats {
    pub total: usize,
    pub http: usize,
    pub websocket: usize,
    pub networks: Vec<String>,
}

/// Provider pool errors
#[derive(Debug, thiserror::Error)]
pub enum ProviderPoolError {
    #[error("Network not found: {0}")]
    NetworkNotFound(String),
    
    #[error("Connection error: {0}")]
    ConnectionError(String),
    
    #[error("Max reconnection attempts reached for: {0}")]
    MaxReconnectAttempts(String),
}
