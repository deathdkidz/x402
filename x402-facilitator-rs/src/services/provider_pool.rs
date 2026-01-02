//! Provider Pool with WebSocket Support
//! 
//! Manages persistent RPC provider connections for all configured networks.
//! Supports both HTTP and WebSocket connections with automatic fallback.
//! 
//! WebSocket benefits:
//! - Instant block notifications (no polling)
//! - Lower latency for transaction confirmations
//! - Reduced RPC call volume
//! 
//! Falls back to HTTP if WebSocket connection fails.

#![allow(dead_code)]

use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};
use parking_lot::RwLock;

use tracing::{info, warn, error, debug};
use alloy::providers::{Provider, ProviderBuilder, RootProvider, WsConnect};
use alloy::transports::http::Http;
use alloy::pubsub::PubSubFrontend;

use reqwest::Client;
use tokio::time::timeout;

use crate::config::Config;
use crate::services::metrics;

/// Provider type enum to handle both HTTP and WebSocket
pub enum ProviderType {
    Http(RootProvider<Http<Client>>),
    WebSocket(RootProvider<PubSubFrontend>),
}

impl ProviderType {
    /// Get the underlying HTTP provider (returns None for WebSocket)
    pub fn as_http(&self) -> Option<&RootProvider<Http<Client>>> {
        match self {
            ProviderType::Http(p) => Some(p),
            ProviderType::WebSocket(_) => None,
        }
    }

    /// Check if this is a WebSocket provider
    pub fn is_websocket(&self) -> bool {
        matches!(self, ProviderType::WebSocket(_))
    }

    /// Get chain ID (works for both types)
    pub async fn get_chain_id(&self) -> Result<u64, String> {
        match self {
            ProviderType::Http(p) => p.get_chain_id().await.map_err(|e| e.to_string()),
            ProviderType::WebSocket(p) => p.get_chain_id().await.map_err(|e| e.to_string()),
        }
    }

    /// Get block number (works for both types)
    pub async fn get_block_number(&self) -> Result<u64, String> {
        match self {
            ProviderType::Http(p) => p.get_block_number().await.map_err(|e| e.to_string()),
            ProviderType::WebSocket(p) => p.get_block_number().await.map_err(|e| e.to_string()),
        }
    }
}

/// Provider pool managing connections for all networks
pub struct ProviderPool {
    providers: RwLock<HashMap<String, Arc<ProviderType>>>,
    config: Arc<Config>,
    reconnect_attempts: RwLock<HashMap<String, u32>>,
    max_reconnect_attempts: u32,
    ws_connect_timeout: Duration,
}

impl ProviderPool {
    /// Create a new provider pool
    pub fn new(config: Arc<Config>) -> Self {
        Self {
            providers: RwLock::new(HashMap::new()),
            config,
            reconnect_attempts: RwLock::new(HashMap::new()),
            max_reconnect_attempts: 5,
            ws_connect_timeout: Duration::from_secs(10),
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
            info!("   🔌 Connected {} WebSocket provider(s)", ws_count);
        }
        
        // Record provider stats
        metrics::record_provider_stats(http_count + ws_count, http_count, ws_count);
        
        Ok(())
    }

    /// Create a provider for a specific network
    /// Tries WebSocket first if URL starts with wss://, falls back to HTTP
    async fn create_provider(&self, network: &str) -> Result<bool, ProviderPoolError> {
        let normalized = self.config.normalize_network_name(network);
        
        // Check if already exists
        if self.providers.read().contains_key(&normalized) {
            return Ok(false);
        }
        
        let rpc_url = self.config.get_rpc_url(&normalized)
            .ok_or_else(|| ProviderPoolError::NetworkNotFound(normalized.clone()))?;
        
        let is_websocket_url = rpc_url.starts_with("wss://") || rpc_url.starts_with("ws://");
        
        // Try WebSocket first if URL supports it
        if is_websocket_url {
            match self.try_create_ws_provider(&normalized, &rpc_url).await {
                Ok(provider) => {
                    self.providers.write().insert(normalized.clone(), Arc::new(provider));
                    self.reconnect_attempts.write().insert(normalized.clone(), 0);
                    return Ok(true); // true = WebSocket
                }
                Err(e) => {
                    warn!("   ⚠️ {}: WebSocket connection failed ({}), falling back to HTTP", normalized, e);
                }
            }
        }
        
        // Create HTTP provider (either as primary or fallback)
        let http_url = if is_websocket_url {
            rpc_url.replace("wss://", "https://").replace("ws://", "http://")
        } else {
            rpc_url.to_string()
        };
        
        let provider = self.create_http_provider(&normalized, &http_url).await?;
        self.providers.write().insert(normalized.clone(), Arc::new(provider));
        self.reconnect_attempts.write().insert(normalized.clone(), 0);
        
        Ok(false) // false = HTTP
    }

    /// Try to create a WebSocket provider
    async fn try_create_ws_provider(&self, network: &str, ws_url: &str) -> Result<ProviderType, ProviderPoolError> {
        let start = Instant::now();
        
        // Create WebSocket connection with timeout
        let ws_connect = WsConnect::new(ws_url);
        
        let provider = match timeout(self.ws_connect_timeout, ProviderBuilder::new().on_ws(ws_connect)).await {
            Ok(Ok(p)) => p,
            Ok(Err(e)) => {
                return Err(ProviderPoolError::ConnectionError(format!("WebSocket connect failed: {}", e)));
            }
            Err(_) => {
                return Err(ProviderPoolError::ConnectionError("WebSocket connection timeout".to_string()));
            }
        };
        
        // Test connection by getting chain ID
        match provider.get_chain_id().await {
            Ok(chain_id) => {
                let duration = start.elapsed();
                info!("   🔌 {}: WebSocket connected (chain_id: {}, {}ms)", network, chain_id, duration.as_millis());
                Ok(ProviderType::WebSocket(provider))
            }
            Err(e) => {
                Err(ProviderPoolError::ConnectionError(format!("WebSocket test failed: {}", e)))
            }
        }
    }

    /// Create an HTTP provider
    async fn create_http_provider(&self, network: &str, http_url: &str) -> Result<ProviderType, ProviderPoolError> {
        let provider = ProviderBuilder::new()
            .on_http(http_url.parse().map_err(|e| ProviderPoolError::ConnectionError(format!("Invalid URL: {}", e)))?);
        
        // Test connection by getting chain ID
        match provider.get_chain_id().await {
            Ok(chain_id) => {
                debug!("   ✓ {}: HTTP connected (chain_id: {})", network, chain_id);
                Ok(ProviderType::Http(provider))
            }
            Err(e) => {
                warn!("   ⚠️ {}: HTTP connection test failed - {}", network, e);
                // Still add the provider, it might work later
                Ok(ProviderType::Http(provider))
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
        let mut http_count = 0;
        let mut ws_count = 0;
        
        for provider in providers.values() {
            if provider.is_websocket() {
                ws_count += 1;
            } else {
                http_count += 1;
            }
        }
        
        ProviderPoolStats {
            total: providers.len(),
            http: http_count,
            websocket: ws_count,
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
        let is_ws = self.create_provider(&normalized).await?;
        
        // Reset attempts on success
        self.reconnect_attempts.write().insert(normalized.clone(), 0);
        
        info!("✅ {}: Reconnection successful ({})", normalized, if is_ws { "WebSocket" } else { "HTTP" });
        
        // Update metrics
        let stats = self.get_stats();
        metrics::record_provider_stats(stats.total, stats.http, stats.websocket);
        
        Ok(())
    }

    /// Check if network uses WebSocket provider
    pub fn is_websocket(&self, network: &str) -> bool {
        let normalized = self.config.normalize_network_name(network);
        self.providers.read()
            .get(&normalized)
            .map(|p| p.is_websocket())
            .unwrap_or(false)
    }

    /// Get RPC URL for a network
    pub fn get_rpc_url(&self, network: &str) -> Option<String> {
        let normalized = self.config.normalize_network_name(network);
        self.config.get_rpc_url(&normalized).map(|s| s.to_string())
    }

    /// Get WebSocket connect timeout
    pub fn get_ws_timeout(&self) -> Duration {
        self.ws_connect_timeout
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
