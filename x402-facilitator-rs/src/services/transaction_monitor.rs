//! Transaction Monitor Service
//! 
//! Background service that monitors pending transactions and updates their status.
//! Implements flashblock optimization for Base/Optimism networks.

use std::sync::Arc;
use std::time::Duration;
use tracing::{info, warn, error, debug};
use alloy::primitives::FixedBytes;
use alloy::providers::Provider;
use tokio::time::sleep;

use crate::config::Config;
use crate::services::provider_pool::{ProviderPool, ProviderType};
use crate::services::redis::Redis;
use crate::services::database::Database;
use crate::types::Transaction;

/// Transaction monitor service
pub struct TransactionMonitor {
    config: Arc<Config>,
    provider_pool: Arc<ProviderPool>,
    redis: Arc<Redis>,
    database: Arc<Database>,
}

impl TransactionMonitor {
    /// Create a new transaction monitor
    pub fn new(
        config: Arc<Config>,
        provider_pool: Arc<ProviderPool>,
        redis: Arc<Redis>,
        database: Arc<Database>,
    ) -> Self {
        Self {
            config,
            provider_pool,
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
        info!("🔍 Transaction monitor started");
    }

    /// Main monitoring loop
    async fn run_monitoring_loop(&self) {
        let interval_ms = self.config.transaction_monitor_interval_ms;
        let interval = Duration::from_millis(interval_ms);
        
        info!("📊 Transaction monitor polling every {}ms", interval_ms);
        
        loop {
            if let Err(e) = self.check_pending_transactions().await {
                error!("Transaction monitor error: {}", e);
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

        debug!("Checking {} pending transaction(s)", pending.len());

        for tx in pending {
            if let Some(tx_hash) = &tx.transaction_hash {
                if let Err(e) = self.check_transaction(&tx, tx_hash).await {
                    warn!("Error checking tx {}: {}", tx_hash, e);
                }
            }
        }

        Ok(())
    }

    /// Check a single transaction's status
    async fn check_transaction(&self, tx: &Transaction, tx_hash: &str) -> Result<(), String> {
        let provider_arc = self.provider_pool.get_provider(&tx.network)
            .map_err(|e| format!("Provider error: {}", e))?;

        // Parse transaction hash
        let hash_hex = tx_hash.strip_prefix("0x").unwrap_or(tx_hash);
        let hash_bytes = hex::decode(hash_hex)
            .map_err(|_| "Invalid transaction hash")?;
        
        if hash_bytes.len() != 32 {
            return Err(format!("Invalid hash length: {}", hash_bytes.len()));
        }
        
        let hash: FixedBytes<32> = FixedBytes::from_slice(&hash_bytes);

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
        let hash_hex = tx_hash.strip_prefix("0x").unwrap_or(tx_hash);
        let hash_bytes = hex::decode(hash_hex)
            .map_err(|_| "Invalid transaction hash")?;
        let hash: FixedBytes<32> = FixedBytes::from_slice(&hash_bytes);

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
                            return Ok((true, "completed"));
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
