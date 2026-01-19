//! Transaction Monitor Service
//! 
//! Background service that monitors pending and preconfirmed transactions.
//! - Pending: Waiting for any confirmation
//! - Preconfirmed: Flashblock confirmed, waiting for finality (regular block inclusion)
//! 
//! Implements reorg detection and rebroadcast capability for preconfirmed transactions.

use std::sync::Arc;
use std::time::Duration;
use tracing::{info, warn, error, debug};
use alloy::primitives::{Address, U256, FixedBytes};
use alloy::providers::{Provider, ProviderBuilder, WsConnect};
use alloy::network::EthereumWallet;
use alloy::signers::local::PrivateKeySigner;
use alloy::sol;
use tokio::time::sleep;

use crate::config::Config;
use crate::services::provider_pool::{ProviderPool, ProviderType};
use crate::services::paymaster_pool::PaymasterPool;
use crate::services::redis::{Redis, PreconfirmedTxData};
use crate::services::database::Database;
use crate::types::Transaction;

// ERC-3009 interface for rebroadcast
sol! {
    #[sol(rpc)]
    interface IERC3009 {
        function transferWithAuthorization(
            address from,
            address to,
            uint256 value,
            uint256 validAfter,
            uint256 validBefore,
            bytes32 nonce,
            uint8 v,
            bytes32 r,
            bytes32 s
        ) external;
    }
}

/// Number of consecutive confirmations required for finality
const REQUIRED_CONFIRMATIONS: u32 = 3;

/// Maximum rebroadcast attempts before giving up
const MAX_REBROADCAST_ATTEMPTS: u32 = 3;

/// Transaction monitor service
pub struct TransactionMonitor {
    config: Arc<Config>,
    provider_pool: Arc<ProviderPool>,
    paymaster_pool: Arc<PaymasterPool>,
    redis: Arc<Redis>,
    database: Arc<Database>,
}

impl TransactionMonitor {
    /// Create a new transaction monitor
    pub fn new(
        config: Arc<Config>,
        provider_pool: Arc<ProviderPool>,
        paymaster_pool: Arc<PaymasterPool>,
        redis: Arc<Redis>,
        database: Arc<Database>,
    ) -> Self {
        Self {
            config,
            provider_pool,
            paymaster_pool,
            redis,
            database,
        }
    }

    /// Start the background monitoring task
    pub fn start(self: Arc<Self>) {
        let monitor = self.clone();
        tokio::spawn(async move {
            monitor.run_monitoring_loop().await;
        });
        info!("🔍 Transaction monitor started (with reorg detection)");
    }

    /// Main monitoring loop
    async fn run_monitoring_loop(&self) {
        let interval_ms = self.config.transaction_monitor_interval_ms;
        let interval = Duration::from_millis(interval_ms);
        
        info!("📊 Transaction monitor polling every {}ms", interval_ms);
        
        loop {
            // Check pending transactions (waiting for first confirmation)
            if let Err(e) = self.check_pending_transactions().await {
                error!("Transaction monitor error (pending): {}", e);
            }
            
            // Check preconfirmed transactions (waiting for finality)
            if let Err(e) = self.check_preconfirmed_transactions().await {
                error!("Transaction monitor error (preconfirmed): {}", e);
            }
            
            sleep(interval).await;
        }
    }

    /// Check all pending transactions
    async fn check_pending_transactions(&self) -> Result<(), String> {
        // Get pending transactions from database
        let pending = self.database.get_pending_transactions(100).await
            .map_err(|e| format!("Database error: {}", e))?;
        
        if pending.is_empty() {
            return Ok(());
        }

        debug!("Checking {} pending/preconfirmed transaction(s)", pending.len());

        for tx in pending {
            if let Some(tx_hash) = &tx.transaction_hash {
                // Validate hash format before processing
                if !self.is_valid_tx_hash(tx_hash) {
                    warn!("⚠️ Invalid transaction hash format for tx #{}: '{}' - marking as failed", tx.id, tx_hash);
                    if let Err(e) = self.database.update_transaction(tx.id, "failed").await {
                        error!("Failed to mark invalid tx as failed: {}", e);
                    }
                    continue;
                }
                
                // Only check truly pending transactions here
                // Preconfirmed are handled separately
                if tx.status == "pending" {
                    if let Err(e) = self.check_transaction(&tx, tx_hash).await {
                        warn!("Error checking tx {}: {}", tx_hash, e);
                    }
                }
            }
        }

        Ok(())
    }

    /// Check preconfirmed transactions for finality
    async fn check_preconfirmed_transactions(&self) -> Result<(), String> {
        // Get preconfirmed transactions from database
        let preconfirmed = self.database.get_pending_transactions(100).await
            .map_err(|e| format!("Database error: {}", e))?;
        
        for tx in preconfirmed.iter().filter(|t| t.status == "preconfirmed") {
            if let Some(tx_hash) = &tx.transaction_hash {
                // Validate hash format before processing
                if !self.is_valid_tx_hash(tx_hash) {
                    warn!("⚠️ Invalid preconfirmed tx hash format for tx #{}: '{}' - marking as failed", tx.id, tx_hash);
                    if let Err(e) = self.database.update_transaction(tx.id, "failed").await {
                        error!("Failed to mark invalid tx as failed: {}", e);
                    }
                    continue;
                }
                
                if let Err(e) = self.check_preconfirmed_transaction(&tx, tx_hash).await {
                    warn!("Error checking preconfirmed tx {}: {}", tx_hash, e);
                }
            }
        }

        Ok(())
    }

    /// Validate transaction hash format (must be 0x-prefixed 64 hex chars)
    fn is_valid_tx_hash(&self, tx_hash: &str) -> bool {
        let hash = tx_hash.strip_prefix("0x").unwrap_or(tx_hash);
        hash.len() == 64 && hash.chars().all(|c| c.is_ascii_hexdigit())
    }

    /// Check a single pending transaction's status
    async fn check_transaction(&self, tx: &Transaction, tx_hash: &str) -> Result<(), String> {
        let provider_arc = self.provider_pool.get_provider(&tx.network)
            .map_err(|e| format!("Provider error: {}", e))?;

        let hash = self.parse_tx_hash(tx_hash)?;

        // Check receipt based on provider type
        let receipt_result = match provider_arc.as_ref() {
            ProviderType::Http(p) => p.get_transaction_receipt(hash).await,
            ProviderType::WebSocket(p) => p.get_transaction_receipt(hash).await,
        };

        match receipt_result {
            Ok(Some(receipt)) => {
                let status = if receipt.status() {
                    "completed"
                } else {
                    "failed"
                };
                
                info!("✅ Transaction {} confirmed: {}", tx_hash, status);
                
                // Update database
                self.database.update_transaction(tx.id, status).await
                    .map_err(|e| format!("DB update error: {}", e))?;
                
                // Update Redis cache
                if let Err(e) = self.redis.cache_used_nonce(
                    &tx.payer_address, 
                    &tx.nonce, 
                    tx_hash, 
                    status, 
                    86400
                ).await {
                    warn!("Failed to update Redis cache: {}", e);
                }
            }
            Ok(None) => {
                // Transaction still pending
                debug!("Transaction {} still pending", tx_hash);
                
                // Check if transaction is too old (timeout)
                if let Some(timeout_at) = &tx.timeout_at {
                    let now = chrono::Utc::now();
                    if now > *timeout_at {
                        warn!("Transaction {} timed out", tx_hash);
                        self.database.update_transaction(tx.id, "failed").await
                            .map_err(|e| format!("DB update error: {}", e))?;
                    }
                }
            }
            Err(e) => {
                warn!("Error fetching receipt for {}: {}", tx_hash, e);
            }
        }

        Ok(())
    }

    /// Check a preconfirmed transaction for finality or reorg
    async fn check_preconfirmed_transaction(&self, tx: &Transaction, tx_hash: &str) -> Result<(), String> {
        let provider_arc = self.provider_pool.get_provider(&tx.network)
            .map_err(|e| format!("Provider error: {}", e))?;

        let hash = self.parse_tx_hash(tx_hash)?;

        // Check receipt
        let receipt_result = match provider_arc.as_ref() {
            ProviderType::Http(p) => p.get_transaction_receipt(hash).await,
            ProviderType::WebSocket(p) => p.get_transaction_receipt(hash).await,
        };

        match receipt_result {
            Ok(Some(receipt)) => {
                if receipt.status() {
                    // Transaction still confirmed - increment confirmation count
                    let count = self.redis.increment_preconfirmed_confirmations(tx_hash).await
                        .unwrap_or(0);
                    
                    if count >= REQUIRED_CONFIRMATIONS {
                        // Finalized! Update to completed
                        info!("✅ Transaction {} finalized after {} confirmations", tx_hash, count);
                        
                        self.database.update_transaction(tx.id, "completed").await
                            .map_err(|e| format!("DB update error: {}", e))?;
                        
                        // Update Redis cache
                        if let Err(e) = self.redis.cache_used_nonce(
                            &tx.payer_address,
                            &tx.nonce,
                            tx_hash,
                            "completed",
                            86400
                        ).await {
                            warn!("Failed to update Redis cache: {}", e);
                        }
                        
                        // Clean up preconfirmed data
                        let _ = self.redis.delete_preconfirmed_tx(tx_hash, &tx.network).await;
                    } else {
                        debug!("Transaction {} confirmation count: {}/{}", tx_hash, count, REQUIRED_CONFIRMATIONS);
                    }
                } else {
                    // Transaction reverted
                    warn!("⚠️ Preconfirmed transaction {} reverted!", tx_hash);
                    
                    self.database.update_transaction(tx.id, "failed").await
                        .map_err(|e| format!("DB update error: {}", e))?;
                    
                    if let Err(e) = self.redis.cache_used_nonce(
                        &tx.payer_address,
                        &tx.nonce,
                        tx_hash,
                        "failed",
                        86400
                    ).await {
                        warn!("Failed to update Redis cache: {}", e);
                    }
                    
                    let _ = self.redis.delete_preconfirmed_tx(tx_hash, &tx.network).await;
                }
            }
            Ok(None) => {
                // Receipt disappeared - possible reorg!
                warn!("⚠️ REORG DETECTED: Receipt missing for preconfirmed tx {}", tx_hash);
                
                // Get preconfirmed data for rebroadcast
                if let Ok(Some(preconf_data)) = self.redis.get_preconfirmed_tx(tx_hash).await {
                    // Check if authorization is still valid
                    let now = chrono::Utc::now().timestamp() as u64;
                    let valid_before: u64 = preconf_data.valid_before.parse().unwrap_or(0);
                    
                    if now < valid_before {
                        // Still within validity window - attempt rebroadcast
                        info!("🔄 Attempting rebroadcast for reorged transaction {}", tx_hash);
                        
                        match self.rebroadcast_transaction(&preconf_data, &tx.network).await {
                            Ok(new_tx_hash) => {
                                info!("✅ Rebroadcast successful: {} -> {}", tx_hash, new_tx_hash);
                                
                                // Update database with new hash
                                if let Err(e) = self.database.update_transaction_hash(tx.id, &new_tx_hash, "preconfirmed").await {
                                    error!("Failed to update transaction hash: {}", e);
                                }
                                
                                // Update preconfirmed data with new hash
                                let mut new_data = preconf_data.clone();
                                new_data.transaction_hash = new_tx_hash.clone();
                                new_data.confirmation_count = 0;
                                let _ = self.redis.store_preconfirmed_tx(&new_tx_hash, &new_data, 3600).await;
                                
                                // Delete old preconfirmed data
                                let _ = self.redis.delete_preconfirmed_tx(tx_hash, &tx.network).await;
                            }
                            Err(e) => {
                                error!("❌ Rebroadcast failed: {}", e);
                                // Don't mark as failed yet - might be mempool issue
                                // Will retry on next monitor cycle
                            }
                        }
                    } else {
                        // Authorization expired - cannot rebroadcast
                        error!("❌ Cannot rebroadcast {}: authorization expired", tx_hash);
                        
                        self.database.update_transaction(tx.id, "failed").await
                            .map_err(|e| format!("DB update error: {}", e))?;
                        
                        if let Err(e) = self.redis.cache_used_nonce(
                            &tx.payer_address,
                            &tx.nonce,
                            tx_hash,
                            "failed",
                            86400
                        ).await {
                            warn!("Failed to update Redis cache: {}", e);
                        }
                        
                        let _ = self.redis.delete_preconfirmed_tx(tx_hash, &tx.network).await;
                    }
                } else {
                    warn!("No preconfirmed data found for {} - cannot rebroadcast", tx_hash);
                }
            }
            Err(e) => {
                warn!("Error checking preconfirmed tx {}: {}", tx_hash, e);
            }
        }

        Ok(())
    }

    /// Rebroadcast a transaction using stored authorization data
    async fn rebroadcast_transaction(&self, data: &PreconfirmedTxData, network: &str) -> Result<String, String> {
        // Get signer from paymaster pool
        let signer = self.paymaster_pool.get_next_signer()
            .map_err(|e| format!("Paymaster error: {}", e))?;
        
        // Get RPC URL
        let rpc_url = self.config.get_rpc_url(network)
            .ok_or_else(|| format!("No RPC URL for network: {}", network))?;
        
        // Parse addresses and values
        let from: Address = data.from.parse()
            .map_err(|_| "Invalid from address")?;
        let to: Address = data.to.parse()
            .map_err(|_| "Invalid to address")?;
        let token: Address = data.token_address.parse()
            .map_err(|_| "Invalid token address")?;
        let value = U256::from_str_radix(&data.value, 10)
            .map_err(|_| "Invalid value")?;
        let valid_after = U256::from_str_radix(&data.valid_after, 10)
            .map_err(|_| "Invalid valid_after")?;
        let valid_before = U256::from_str_radix(&data.valid_before, 10)
            .map_err(|_| "Invalid valid_before")?;
        
        // Parse nonce
        let nonce_hex = data.nonce.strip_prefix("0x").unwrap_or(&data.nonce);
        let nonce_bytes = hex::decode(nonce_hex)
            .map_err(|_| "Invalid nonce hex")?;
        let nonce: FixedBytes<32> = FixedBytes::from_slice(&nonce_bytes);
        
        // Parse signature
        let sig_hex = data.signature.strip_prefix("0x").unwrap_or(&data.signature);
        let sig_bytes = hex::decode(sig_hex)
            .map_err(|_| "Invalid signature hex")?;
        
        if sig_bytes.len() != 65 {
            return Err(format!("Invalid signature length: {}", sig_bytes.len()));
        }
        
        let v = sig_bytes[64];
        let r: FixedBytes<32> = FixedBytes::from_slice(&sig_bytes[0..32]);
        let s: FixedBytes<32> = FixedBytes::from_slice(&sig_bytes[32..64]);
        
        // Create wallet and provider
        let wallet = EthereumWallet::from(signer);
        
        // Use WebSocket if available
        let is_ws = rpc_url.starts_with("wss://") || rpc_url.starts_with("ws://");
        
        let tx_hash = if is_ws {
            let ws_connect = WsConnect::new(rpc_url);
            let provider = tokio::time::timeout(
                Duration::from_secs(10),
                ProviderBuilder::new()
                    .with_recommended_fillers()
                    .wallet(wallet)
                    .on_ws(ws_connect)
            ).await
                .map_err(|_| "WebSocket connection timeout")?
                .map_err(|e| format!("WebSocket connect failed: {}", e))?;
            
            let contract = IERC3009::new(token, &provider);
            let tx = contract.transferWithAuthorization(
                from, to, value, valid_after, valid_before, nonce, v, r, s
            ).gas(200000);
            
            let pending = tx.send().await
                .map_err(|e| format!("Rebroadcast send failed: {}", e))?;
            format!("{:?}", pending.tx_hash())
        } else {
            let http_url = rpc_url.replace("wss://", "https://").replace("ws://", "http://");
            let provider = ProviderBuilder::new()
                .with_recommended_fillers()
                .wallet(wallet)
                .on_http(http_url.parse().map_err(|e| format!("Invalid URL: {}", e))?);
            
            let contract = IERC3009::new(token, &provider);
            let tx = contract.transferWithAuthorization(
                from, to, value, valid_after, valid_before, nonce, v, r, s
            ).gas(200000);
            
            let pending = tx.send().await
                .map_err(|e| format!("Rebroadcast send failed: {}", e))?;
            format!("{:?}", pending.tx_hash())
        };
        
        Ok(tx_hash)
    }

    /// Parse transaction hash to FixedBytes
    fn parse_tx_hash(&self, tx_hash: &str) -> Result<FixedBytes<32>, String> {
        let hash_hex = tx_hash.strip_prefix("0x").unwrap_or(tx_hash);
        let hash_bytes = hex::decode(hash_hex)
            .map_err(|_| "Invalid transaction hash")?;
        
        if hash_bytes.len() != 32 {
            return Err(format!("Invalid hash length: {}", hash_bytes.len()));
        }
        
        Ok(FixedBytes::from_slice(&hash_bytes))
    }

    /// Check if network supports flashblocks
    pub fn is_flashblock_network(network: &str) -> bool {
        let lower = network.to_lowercase();
        lower.contains("base") || 
        lower.contains("optimism") || 
        lower.contains("unichain") ||
        lower.contains("op ")
    }

    /// Wait for transaction with flashblock optimization
    /// Returns (confirmed: bool, status: &'static str)
    pub async fn wait_for_confirmation(
        &self,
        tx_hash: &str,
        network: &str,
        timeout_secs: u64,
    ) -> Result<(bool, &'static str), String> {
        let provider_arc = self.provider_pool.get_provider(network)
            .map_err(|e| format!("Provider error: {}", e))?;

        // Parse hash
        let hash = self.parse_tx_hash(tx_hash)?;

        // Helper to get receipt based on provider type
        let get_receipt = |hash: FixedBytes<32>| {
            let provider = provider_arc.clone();
            async move {
                match provider.as_ref() {
                    ProviderType::Http(p) => p.get_transaction_receipt(hash).await,
                    ProviderType::WebSocket(p) => p.get_transaction_receipt(hash).await,
                }
            }
        };

        let is_flashblock = Self::is_flashblock_network(network);
        
        if is_flashblock {
            info!("⚡ Using Flashblock-optimized polling for {}", network);
            
            // Phase 1: Aggressive flashblock polling (100ms intervals for 1.5s)
            let flashblock_duration = Duration::from_millis(1500);
            let flashblock_interval = Duration::from_millis(100);
            let start = std::time::Instant::now();
            
            while start.elapsed() < flashblock_duration {
                match get_receipt(hash).await {
                    Ok(Some(receipt)) => {
                        let elapsed = start.elapsed().as_millis();
                        if receipt.status() {
                            info!("⚡ Flashblock confirmation in {}ms: {}", elapsed, tx_hash);
                            return Ok((true, "preconfirmed"));
                        } else {
                            info!("⚡ Transaction reverted in {}ms: {}", elapsed, tx_hash);
                            return Ok((true, "failed"));
                        }
                    }
                    Ok(None) => {
                        sleep(flashblock_interval).await;
                    }
                    Err(e) => {
                        debug!("Flashblock poll error: {}", e);
                        sleep(flashblock_interval).await;
                    }
                }
            }
        }

        // Phase 2: Standard polling (1s intervals)
        let standard_interval = Duration::from_secs(1);
        let deadline = std::time::Instant::now() + Duration::from_secs(timeout_secs);
        
        while std::time::Instant::now() < deadline {
            match get_receipt(hash).await {
                Ok(Some(receipt)) => {
                    if receipt.status() {
                        info!("✅ Transaction confirmed: {}", tx_hash);
                        return Ok((true, "completed"));
                    } else {
                        info!("❌ Transaction reverted: {}", tx_hash);
                        return Ok((true, "failed"));
                    }
                }
                Ok(None) => {
                    sleep(standard_interval).await;
                }
                Err(e) => {
                    warn!("Receipt poll error: {}", e);
                    sleep(standard_interval).await;
                }
            }
        }

        // Timeout - return pending for background monitoring
        Ok((false, "pending"))
    }
}
