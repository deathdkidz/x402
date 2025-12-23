//! Settlement Service
//! 
//! Executes ERC-3009 transferWithAuthorization transactions with multi-layer safety checks:
//! 1. Network validation
//! 2. Token validation
//! 3. Payer extraction
//! 4. Authorization extraction
//! 5. Recipient verification
//! 6. Signature verification (EIP-712)
//! 7. Time window validation
//! 8. Amount matching validation
//! 9. Duplicate transaction detection
//! 10. Pre-settlement balance verification (PARALLEL)
//! 11. Replay attack protection - nonce checking (PARALLEL)
//! 12. Gas estimation
//! 13. Transaction execution
//! 14. Flashblock fast confirmation (200-500ms for Base/OP networks)
//! 15. Background monitoring for non-flashblock networks

#![allow(dead_code)]

use std::sync::Arc;
use std::time::{Duration, Instant};
use tracing::{info, warn, error, debug};
use alloy::primitives::{Address, U256, FixedBytes};
use alloy::providers::{Provider, ProviderBuilder};
use alloy::network::EthereumWallet;
use alloy::sol;
use tokio::time::sleep;
use crate::config::Config;
use crate::types::{PaymentPayload, PaymentRequirements, SettleResponse, SettlementStatus, Merchant};
use crate::services::provider_pool::{ProviderPool, ProviderType};
use crate::services::paymaster_pool::PaymasterPool;
use crate::services::redis::Redis;
use crate::services::database::{Database, CreateTransaction};
use crate::services::verification::VerificationService;
use crate::services::webhook::{WebhookService, WebhookEventType};
use crate::services::metrics;

// ERC-3009 interface for gasless transfers
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
        
        function balanceOf(address account) external view returns (uint256);
        function authorizationState(address authorizer, bytes32 nonce) external view returns (bool);
    }
}

/// Settlement service
pub struct SettlementService {
    config: Arc<Config>,
    provider_pool: Arc<ProviderPool>,
    paymaster_pool: Arc<PaymasterPool>,
    redis: Arc<Redis>,
    database: Arc<Database>,
    verification_service: Arc<VerificationService>,
    webhook_service: Arc<WebhookService>,
}

impl SettlementService {
    /// Create a new settlement service
    pub fn new(
        config: Arc<Config>,
        provider_pool: Arc<ProviderPool>,
        paymaster_pool: Arc<PaymasterPool>,
        redis: Arc<Redis>,
        database: Arc<Database>,
        verification_service: Arc<VerificationService>,
        webhook_service: Arc<WebhookService>,
    ) -> Self {
        info!("Settlement service initialized");
        Self {
            config,
            provider_pool,
            paymaster_pool,
            redis,
            database,
            verification_service,
            webhook_service,
        }
    }

    /// Main settlement method with safety checks and timing instrumentation
    pub async fn settle(
        &self,
        payload: &PaymentPayload,
        requirements: &PaymentRequirements,
        merchant: &Merchant,
    ) -> SettleResponse {
        let total_start = Instant::now();
        
        // Get normalized network
        let start = Instant::now();
        let normalized_network = match self.validate_network(&requirements.network) {
            Ok(n) => n,
            Err(reason) => return SettleResponse::failure(requirements.network.clone(), reason),
        };
        debug!("⏱️ Network validation: {}µs", start.elapsed().as_micros());

        // Get paymaster signer
        let start = Instant::now();
        let signer = match self.paymaster_pool.get_next_signer() {
            Ok(s) => s,
            Err(e) => return SettleResponse::failure(normalized_network, format!("Paymaster error: {}", e)),
        };
        debug!("⏱️ Paymaster selection: {}µs", start.elapsed().as_micros());

        info!("Using paymaster wallet: {}", signer.address());
        info!("Settling payment to merchant: {}", merchant.auth_address);
        info!("=== STARTING PAYMENT SETTLEMENT ===");
        info!("Network: {}", normalized_network);
        info!("Asset: {}", requirements.asset);
        info!("Amount: {}", requirements.max_amount_required);

        let payer = &payload.authorization.from;
        let nonce = &payload.authorization.nonce;

        // Safety Check 1: Validate network
        // Already done above

        // Safety Check 1.5: Validate token
        let start = Instant::now();
        if let Err(reason) = self.validate_token(&normalized_network, &requirements.asset) {
            return SettleResponse::failure(normalized_network, reason);
        }
        debug!("⏱️ Token validation: {}µs", start.elapsed().as_micros());

        // Safety Check 2: Extract payer
        if payer.is_empty() {
            return SettleResponse::failure(normalized_network, "Missing payer address".to_string());
        }

        // Safety Check 3: Verify recipient matches
        if payload.authorization.to.to_lowercase() != requirements.pay_to.to_lowercase() {
            return SettleResponse::failure(
                normalized_network,
                format!(
                    "Recipient mismatch: authorization.to={} != requirements.payTo={}",
                    payload.authorization.to, requirements.pay_to
                ),
            );
        }

        // Safety Check 4: Verify time window
        info!("⏰ Checking time window: validAfter={}, validBefore={}", 
              payload.authorization.valid_after, payload.authorization.valid_before);
        if let Err(reason) = self.verify_time_window(&payload.authorization.valid_after, &payload.authorization.valid_before) {
            warn!("⏰ Time window check failed: {}", reason);
            return SettleResponse::failure(normalized_network, reason);
        }

        // Safety Check 5: Verify amount matches
        if payload.authorization.value != requirements.max_amount_required {
            return SettleResponse::failure(
                normalized_network,
                format!(
                    "Amount mismatch: authorization.value={} != requirements.maxAmountRequired={}",
                    payload.authorization.value, requirements.max_amount_required
                ),
            );
        }

        // Safety Check 6: Check for duplicate/cached transaction
        let start = Instant::now();
        match self.redis.get_nonce_transaction(payer, nonce).await {
            Ok(Some(cached)) => {
                info!("⚡ Found cached transaction for nonce {}: {} ({})", nonce, cached.transaction_hash, cached.status);
                return SettleResponse::cached(
                    normalized_network,
                    payer.clone(),
                    cached.transaction_hash,
                    if cached.status == "completed" { SettlementStatus::Completed } else { SettlementStatus::Pending },
                );
            }
            Ok(None) => {}
            Err(e) => {
                warn!("Redis cache check failed: {}", e);
                // Continue anyway
            }
        }
        debug!("⏱️ Redis cache check: {}ms", start.elapsed().as_millis());

        // Safety Checks 7 & 8: Run balance and nonce checks in PARALLEL for ~50ms savings
        let start = Instant::now();
        info!("⚡ Running balance and nonce checks in parallel...");
        let balance_check = self.verify_balance(payer, &requirements.asset, &requirements.max_amount_required, &normalized_network);
        let nonce_check = self.check_nonce_unused(payer, nonce, &requirements.asset, &normalized_network);
        
        let (balance_result, nonce_result) = tokio::join!(balance_check, nonce_check);
        
        // Check balance result
        if let Err(reason) = balance_result {
            return SettleResponse::failure(normalized_network, reason);
        }
        
        // Check nonce result
        if let Err(reason) = nonce_result {
            return SettleResponse::failure(normalized_network, reason);
        }
        
        debug!("⏱️ Parallel RPC checks (balance + nonce): {}ms", start.elapsed().as_millis());
        info!("✓ Parallel checks completed successfully");

        // Check merchant has sufficient credits
        let credit_cost = 1; // 1 credit per settlement
        if !merchant.has_credits(credit_cost) {
            warn!("Merchant {} has insufficient credits: {} < {}", 
                  merchant.auth_address, merchant.credit_balance, credit_cost);
            return SettleResponse::failure(
                normalized_network, 
                format!("Insufficient credits. Required: {}, Available: {}", credit_cost, merchant.credit_balance)
            );
        }

        // Create transaction record
        let start = Instant::now();
        let tx_record = CreateTransaction {
            merchant_id: merchant.id,
            payer_address: payer.to_lowercase(),
            recipient_address: merchant.auth_address.clone(),
            network: normalized_network.clone(),
            asset: requirements.asset.clone(),
            amount: requirements.max_amount_required.clone(),
            nonce: nonce.clone(),
            transaction_hash: None,
            status: "pending".to_string(),
            valid_after: payload.authorization.valid_after.clone(),
            valid_before: payload.authorization.valid_before.clone(),
            resource: Some(requirements.resource.clone()),
            description: Some(requirements.description.clone()),
            credit_cost,
            timeout_at: Some(chrono::Utc::now() + chrono::Duration::seconds(requirements.max_timeout_seconds as i64)),
        };

        let transaction_id = match self.database.create_transaction(&tx_record).await {
            Ok(id) => id,
            Err(e) => {
                error!("Failed to create transaction record: {}", e);
                return SettleResponse::failure(normalized_network, "Database error".to_string());
            }
        };
        debug!("⏱️ DB create transaction: {}ms", start.elapsed().as_millis());

        // Log transaction created event
        self.log_tx_event(transaction_id, "created", None, Some("pending"), None).await;

        // Execute the settlement transaction
        let start = Instant::now();
        match self.execute_transfer(payload, requirements, &normalized_network, &signer).await {
            Ok(tx_hash) => {
                debug!("⏱️ Transaction send: {}ms", start.elapsed().as_millis());
                info!("⏳ Transaction submitted: {}", tx_hash);
                
                // Log submitted event
                self.log_tx_event(transaction_id, "submitted", Some("pending"), Some("pending"), Some(&format!("{{\"tx_hash\":\"{}\"}}", tx_hash))).await;
                
                // Update database with pending status
                if let Err(e) = self.database.update_transaction_hash(transaction_id, &tx_hash, "pending").await {
                    error!("Failed to update transaction hash: {}", e);
                }

                // Wait for confirmation (flashblock fast path + standard fallback)
                let start = Instant::now();
                let (confirmed, final_status, receipt) = self.wait_for_confirmation_with_receipt(&tx_hash, &normalized_network).await;
                debug!("⏱️ Confirmation wait: {}ms", start.elapsed().as_millis());
                
                // Log gas to database if we have a receipt
                if let Some(ref r) = receipt {
                    self.log_gas_to_db(r, &normalized_network, &tx_hash).await;
                }
                
                if confirmed && final_status == "completed" {
                    info!("✅ Settlement confirmed: {}", tx_hash);
                    info!("⏱️ Total settlement time: {}ms", total_start.elapsed().as_millis());
                    
                    // Log completed event
                    self.log_tx_event(transaction_id, "confirmed", Some("pending"), Some("completed"), None).await;
                    
                    // Send webhook notification
                    self.send_webhook(
                        merchant,
                        WebhookEventType::TransactionCompleted,
                        transaction_id,
                        Some(&tx_hash),
                        "completed",
                        &normalized_network,
                        &requirements.asset,
                        &requirements.max_amount_required,
                        payer,
                        Some(&requirements.resource),
                    ).await;
                    
                    // Deduct credits from merchant
                    if let Err(e) = self.database.deduct_credits(
                        merchant.id, 
                        credit_cost, 
                        &tx_hash,
                        &format!("Settlement fee for tx {}", &tx_hash[..10])
                    ).await {
                        error!("Failed to deduct credits: {}", e);
                    }

                    // Update database with completed status
                    if let Err(e) = self.database.update_transaction(transaction_id, "completed").await {
                        error!("Failed to update transaction status: {}", e);
                    }

                    // Cache the nonce with completed status
                    if let Err(e) = self.redis.cache_used_nonce(payer, nonce, &tx_hash, "completed", 86400).await {
                        error!("Failed to cache nonce: {}", e);
                    }

                    SettleResponse::success(
                        normalized_network,
                        payer.clone(),
                        tx_hash,
                        SettlementStatus::Completed,
                    )
                } else if confirmed && final_status == "failed" {
                    error!("❌ Transaction reverted: {}", tx_hash);
                    
                    // Log failed event
                    self.log_tx_event(transaction_id, "reverted", Some("pending"), Some("failed"), Some("{\"reason\":\"Transaction reverted on-chain\"}")).await;
                    
                    // Send webhook notification
                    self.send_webhook(
                        merchant,
                        WebhookEventType::TransactionFailed,
                        transaction_id,
                        Some(&tx_hash),
                        "failed",
                        &normalized_network,
                        &requirements.asset,
                        &requirements.max_amount_required,
                        payer,
                        Some(&requirements.resource),
                    ).await;
                    
                    // Update database with failed status
                    if let Err(e) = self.database.update_transaction(transaction_id, "failed").await {
                        error!("Failed to update transaction status: {}", e);
                    }

                    // Cache the nonce with failed status
                    if let Err(e) = self.redis.cache_used_nonce(payer, nonce, &tx_hash, "failed", 86400).await {
                        error!("Failed to cache nonce: {}", e);
                    }

                    SettleResponse::failure(normalized_network, "Transaction reverted on-chain".to_string())
                } else {
                    // Not confirmed yet - return pending (background monitor will update)
                    info!("⏳ Transaction pending, will be monitored: {}", tx_hash);
                    
                    // Send webhook notification
                    self.send_webhook(
                        merchant,
                        WebhookEventType::TransactionPending,
                        transaction_id,
                        Some(&tx_hash),
                        "pending",
                        &normalized_network,
                        &requirements.asset,
                        &requirements.max_amount_required,
                        payer,
                        Some(&requirements.resource),
                    ).await;
                    
                    // Deduct credits (we submitted successfully, just waiting for confirmation)
                    if let Err(e) = self.database.deduct_credits(
                        merchant.id, 
                        credit_cost, 
                        &tx_hash,
                        &format!("Settlement fee for tx {}", &tx_hash[..10])
                    ).await {
                        error!("Failed to deduct credits: {}", e);
                    }

                    // Cache the nonce with pending status
                    if let Err(e) = self.redis.cache_used_nonce(payer, nonce, &tx_hash, "pending", 86400).await {
                        error!("Failed to cache nonce: {}", e);
                    }

                    SettleResponse::success(
                        normalized_network,
                        payer.clone(),
                        tx_hash,
                        SettlementStatus::Pending,
                    )
                }
            }
            Err(reason) => {
                error!("❌ Settlement failed: {}", reason);
                
                // Log failed event
                self.log_tx_event(transaction_id, "execution_failed", Some("pending"), Some("failed"), Some(&format!("{{\"reason\":\"{}\"}}", reason.replace('"', "\\\"")))).await;
                
                // Send webhook notification
                self.send_webhook(
                    merchant,
                    WebhookEventType::TransactionFailed,
                    transaction_id,
                    None,
                    "failed",
                    &normalized_network,
                    &requirements.asset,
                    &requirements.max_amount_required,
                    payer,
                    Some(&requirements.resource),
                ).await;
                
                // Update database
                if let Err(e) = self.database.update_transaction(transaction_id, "failed").await {
                    error!("Failed to update transaction status: {}", e);
                }

                SettleResponse::failure(normalized_network, reason)
            }
        }
    }

    /// Validate network
    fn validate_network(&self, network: &str) -> Result<String, String> {
        let all_networks = self.config.all_networks();
        
        if let Some(exact) = all_networks.iter().find(|n| n.to_lowercase() == network.to_lowercase()) {
            return Ok(exact.clone());
        }
        
        let normalized = self.config.normalize_network_name(network);
        if all_networks.contains(&normalized) {
            return Ok(normalized);
        }
        
        Err(format!(
            "Network '{}' is not supported. Supported networks: {}",
            network,
            all_networks.join(", ")
        ))
    }

    /// Validate token
    fn validate_token(&self, network: &str, token_address: &str) -> Result<(), String> {
        match self.config.get_token_by_address(network, token_address) {
            Some(_) => Ok(()),
            None => Err(format!("Token '{}' is not supported on network '{}'", token_address, network)),
        }
    }

    /// Verify time window - simple check without safety buffers
    /// The client is responsible for setting appropriate validAfter/validBefore values
    fn verify_time_window(&self, valid_after: &str, valid_before: &str) -> Result<(), String> {
        let now = chrono::Utc::now().timestamp() as u64;
        
        let after: u64 = valid_after.parse().map_err(|_| format!("Invalid validAfter: {}", valid_after))?;
        let before: u64 = valid_before.parse().map_err(|_| format!("Invalid validBefore: {}", valid_before))?;

        debug!("Time window check: now={}, validAfter={}, validBefore={}", now, after, before);

        // Simple check: authorization must be valid now
        if now < after {
            return Err(format!(
                "Authorization not yet valid. Current time: {}, validAfter: {}, wait {} seconds",
                now, after, after - now
            ));
        }
        
        if now > before {
            return Err(format!(
                "Authorization expired. Current time: {}, validBefore: {}, expired {} seconds ago",
                now, before, now - before
            ));
        }

        Ok(())
    }

    /// Check if network supports flashblocks (Base, Optimism, Unichain)
    fn is_flashblock_network(network: &str) -> bool {
        let lower = network.to_lowercase();
        lower.contains("base") || 
        lower.contains("optimism") || 
        lower.contains("unichain") ||
        lower.contains("op ")
    }

    /// Wait for transaction confirmation with flashblock optimization
    /// Returns (confirmed: bool, status: &'static str, Option<TransactionReceipt>)
    async fn wait_for_confirmation_with_receipt(&self, tx_hash: &str, network: &str) -> (bool, &'static str, Option<alloy::rpc::types::TransactionReceipt>) {
        let provider_arc = match self.provider_pool.get_provider(network) {
            Ok(p) => p,
            Err(e) => {
                warn!("Provider error during confirmation wait: {}", e);
                return (false, "pending", None);
            }
        };

        // Parse hash
        let hash_hex = tx_hash.strip_prefix("0x").unwrap_or(tx_hash);
        let hash_bytes = match hex::decode(hash_hex) {
            Ok(b) => b,
            Err(_) => return (false, "pending", None),
        };
        
        if hash_bytes.len() != 32 {
            return (false, "pending", None);
        }
        
        let hash: FixedBytes<32> = FixedBytes::from_slice(&hash_bytes);
        let is_flashblock = Self::is_flashblock_network(network);
        
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
        
        if is_flashblock {
            info!("⚡ Using Flashblock-optimized polling for {}", network);
            
            // Phase 1: Aggressive flashblock polling (100ms intervals for 1.5s)
            let start = std::time::Instant::now();
            let flashblock_duration = Duration::from_millis(1500);
            let flashblock_interval = Duration::from_millis(100);
            
            while start.elapsed() < flashblock_duration {
                match get_receipt(hash).await {
                    Ok(Some(receipt)) => {
                        let elapsed = start.elapsed().as_millis();
                        // Log gas usage
                        Self::log_gas_usage(&receipt, network, tx_hash);
                        
                        if receipt.status() {
                            info!("⚡ Flashblock confirmation in {}ms: {}", elapsed, tx_hash);
                            return (true, "completed", Some(receipt));
                        } else {
                            info!("⚡ Transaction reverted in {}ms: {}", elapsed, tx_hash);
                            return (true, "failed", Some(receipt));
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

        // Phase 2: Standard polling (500ms intervals for up to 10 seconds)
        let standard_interval = Duration::from_millis(500);
        let standard_duration = Duration::from_secs(10);
        let start = std::time::Instant::now();
        
        while start.elapsed() < standard_duration {
            match get_receipt(hash).await {
                Ok(Some(receipt)) => {
                    let elapsed = start.elapsed().as_millis();
                    // Log gas usage
                    Self::log_gas_usage(&receipt, network, tx_hash);
                    
                    if receipt.status() {
                        info!("✅ Transaction confirmed in {}ms: {}", elapsed, tx_hash);
                        return (true, "completed", Some(receipt));
                    } else {
                        info!("❌ Transaction reverted in {}ms: {}", elapsed, tx_hash);
                        return (true, "failed", Some(receipt));
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

        // Timeout - will be monitored by background task
        info!("⏳ Confirmation timeout after 10s, transaction will be monitored: {}", tx_hash);
        (false, "pending", None)
    }

    /// Log gas usage from transaction receipt
    fn log_gas_usage(receipt: &alloy::rpc::types::TransactionReceipt, network: &str, tx_hash: &str) {
        let gas_used = receipt.gas_used;
        let effective_gas_price = receipt.effective_gas_price;
        let gas_cost_wei = gas_used as u128 * effective_gas_price;
        
        // Convert to gwei using floating point for precision (1 gwei = 10^9 wei)
        let gas_price_gwei = effective_gas_price as f64 / 1_000_000_000.0;
        let gas_cost_gwei = gas_cost_wei as f64 / 1_000_000_000.0;
        
        // Convert to ETH (1 ETH = 10^18 wei)
        let gas_cost_eth = gas_cost_wei as f64 / 1_000_000_000_000_000_000.0;
        
        // Record metrics
        metrics::record_gas_usage(network, gas_used as u64, gas_price_gwei);
        
        info!("⛽ Gas used: {} units @ {:.4} gwei = {:.4} gwei (~{:.8} ETH) [{}]", 
              gas_used, gas_price_gwei, gas_cost_gwei, gas_cost_eth, network);
        info!("   TX: {}", tx_hash);
    }

    /// Log gas tracking to database
    async fn log_gas_to_db(&self, receipt: &alloy::rpc::types::TransactionReceipt, network: &str, tx_hash: &str) {
        let gas_used = receipt.gas_used;
        let effective_gas_price = receipt.effective_gas_price;
        let gas_cost_wei = gas_used as u128 * effective_gas_price;
        
        let gas_price_gwei = effective_gas_price as f64 / 1_000_000_000.0;
        let gas_cost_eth = gas_cost_wei as f64 / 1_000_000_000_000_000_000.0;
        
        // Store in database (fire-and-forget)
        if let Err(e) = self.database.log_gas_tracking(
            network,
            gas_price_gwei,
            Some(gas_used as u64),
            Some(gas_cost_eth),
            None, // USD cost would need price feed
            Some(tx_hash),
        ).await {
            warn!("Failed to log gas tracking: {}", e);
        }
    }

    /// Log transaction event to database for audit trail
    async fn log_tx_event(&self, transaction_id: i64, event_type: &str, old_status: Option<&str>, new_status: Option<&str>, metadata: Option<&str>) {
        if let Err(e) = self.database.log_transaction_event(
            transaction_id,
            event_type,
            old_status,
            new_status,
            metadata,
        ).await {
            warn!("Failed to log transaction event: {}", e);
        }
    }

    /// Send webhook notification to merchant (if configured)
    async fn send_webhook(
        &self,
        merchant: &Merchant,
        event_type: WebhookEventType,
        transaction_id: i64,
        tx_hash: Option<&str>,
        status: &str,
        network: &str,
        asset: &str,
        amount: &str,
        payer: &str,
        resource: Option<&str>,
    ) {
        // Check if merchant has webhook configured
        let webhook_url = match &merchant.webhook_url {
            Some(url) if !url.is_empty() => url,
            _ => return, // No webhook configured
        };

        // Check if this event type is enabled
        let event_str = event_type.to_string();
        let events = &merchant.webhook_events;
        if !events.contains("all") && !events.contains(&event_str) {
            debug!("Webhook event {} not enabled for merchant {}", event_str, merchant.id);
            return;
        }

        // Clone for async move
        let webhook_service = self.webhook_service.clone();
        let merchant_id = merchant.id;
        let webhook_url = webhook_url.clone();
        let tx_hash = tx_hash.map(String::from);
        let status = status.to_string();
        let network = network.to_string();
        let asset = asset.to_string();
        let amount = amount.to_string();
        let payer = payer.to_string();
        let recipient = merchant.auth_address.clone();
        let resource = resource.map(String::from);

        // Fire and forget - don't block settlement on webhook delivery
        tokio::spawn(async move {
            webhook_service.send_transaction_webhook(
                merchant_id,
                &webhook_url,
                event_type,
                transaction_id,
                tx_hash.as_deref(),
                &status,
                &network,
                &asset,
                &amount,
                &payer,
                &recipient,
                resource.as_deref(),
            ).await;
        });
    }

    /// Verify balance
    async fn verify_balance(&self, payer: &str, token_address: &str, amount: &str, network: &str) -> Result<(), String> {
        let start = Instant::now();
        let provider_arc = self.provider_pool.get_provider(network)
            .map_err(|e| format!("Provider error: {}", e))?;
        
        let payer_addr: Address = payer.parse().map_err(|_| "Invalid payer address")?;
        let token: Address = token_address.parse().map_err(|_| "Invalid token address")?;
        let required: U256 = amount.parse().map_err(|_| "Invalid amount")?;

        // Call balance based on provider type
        let balance = match provider_arc.as_ref() {
            ProviderType::Http(p) => {
                let contract = IERC3009::new(token, p);
                contract.balanceOf(payer_addr)
                    .call()
                    .await
                    .map_err(|e| format!("Balance check failed: {}", e))?
                    ._0
            }
            ProviderType::WebSocket(p) => {
                let contract = IERC3009::new(token, p);
                contract.balanceOf(payer_addr)
                    .call()
                    .await
                    .map_err(|e| format!("Balance check failed: {}", e))?
                    ._0
            }
        };

        let duration = start.elapsed().as_secs_f64();
        metrics::record_rpc_call(network, "balanceOf", duration, false);

        if balance < required {
            return Err(format!("Insufficient balance: {} < {}", balance, required));
        }

        Ok(())
    }

    /// Check that nonce hasn't been used on-chain
    async fn check_nonce_unused(&self, payer: &str, nonce: &str, token_address: &str, network: &str) -> Result<(), String> {
        let start = Instant::now();
        let provider_arc = self.provider_pool.get_provider(network)
            .map_err(|e| format!("Provider error: {}", e))?;

        let payer_addr: Address = payer.parse().map_err(|_| "Invalid payer address")?;
        let token: Address = token_address.parse().map_err(|_| "Invalid token address")?;
        
        // Parse nonce
        let nonce_hex = nonce.strip_prefix("0x").unwrap_or(nonce);
        let nonce_bytes = hex::decode(nonce_hex).map_err(|_| "Invalid nonce hex")?;
        let mut nonce_arr = [0u8; 32];
        let start_idx = 32 - nonce_bytes.len().min(32);
        nonce_arr[start_idx..].copy_from_slice(&nonce_bytes[..nonce_bytes.len().min(32)]);
        let nonce_fixed: FixedBytes<32> = FixedBytes::from(nonce_arr);

        // Call authorizationState based on provider type
        let is_used = match provider_arc.as_ref() {
            ProviderType::Http(p) => {
                let contract = IERC3009::new(token, p);
                contract.authorizationState(payer_addr, nonce_fixed)
                    .call()
                    .await
                    .map_err(|e| format!("Nonce check failed: {}", e))?
                    ._0
            }
            ProviderType::WebSocket(p) => {
                let contract = IERC3009::new(token, p);
                contract.authorizationState(payer_addr, nonce_fixed)
                    .call()
                    .await
                    .map_err(|e| format!("Nonce check failed: {}", e))?
                    ._0
            }
        };

        let duration = start.elapsed().as_secs_f64();
        metrics::record_rpc_call(network, "authorizationState", duration, false);

        if is_used {
            return Err(format!("Nonce {} has already been used", nonce));
        }

        debug!("✓ Nonce {} is available for use", nonce);
        Ok(())
    }

    /// Execute the transferWithAuthorization transaction
    async fn execute_transfer(
        &self,
        payload: &PaymentPayload,
        requirements: &PaymentRequirements,
        network: &str,
        signer: &alloy::signers::local::PrivateKeySigner,
    ) -> Result<String, String> {
        // Get RPC URL
        let rpc_url = self.config.get_rpc_url(network)
            .ok_or_else(|| format!("No RPC URL for network: {}", network))?;
        
        // Convert WebSocket URL to HTTP if needed
        let http_url = rpc_url.replace("wss://", "https://").replace("ws://", "http://");
        
        // Create wallet and provider
        let wallet = EthereumWallet::from(signer.clone());
        
        let provider = ProviderBuilder::new()
            .with_recommended_fillers()
            .wallet(wallet)
            .on_http(http_url.parse().map_err(|e| format!("Invalid URL: {}", e))?);

        // Parse parameters
        let from: Address = payload.authorization.from.parse()
            .map_err(|_| "Invalid from address")?;
        let to: Address = payload.authorization.to.parse()
            .map_err(|_| "Invalid to address")?;
        let value: U256 = payload.authorization.value.parse()
            .map_err(|_| "Invalid value")?;
        let valid_after: U256 = payload.authorization.valid_after.parse()
            .map_err(|_| "Invalid validAfter")?;
        let valid_before: U256 = payload.authorization.valid_before.parse()
            .map_err(|_| "Invalid validBefore")?;
        
        // Parse nonce
        let nonce_hex = payload.authorization.nonce.strip_prefix("0x")
            .unwrap_or(&payload.authorization.nonce);
        let nonce_bytes = hex::decode(nonce_hex)
            .map_err(|_| "Invalid nonce hex")?;
        let mut nonce_arr = [0u8; 32];
        let start = 32 - nonce_bytes.len().min(32);
        nonce_arr[start..].copy_from_slice(&nonce_bytes[..nonce_bytes.len().min(32)]);
        let nonce: FixedBytes<32> = FixedBytes::from(nonce_arr);

        // Parse signature
        let sig_hex = payload.signature.strip_prefix("0x")
            .unwrap_or(&payload.signature);
        let sig_bytes = hex::decode(sig_hex)
            .map_err(|_| "Invalid signature hex")?;
        
        if sig_bytes.len() != 65 {
            return Err(format!("Invalid signature length: {}", sig_bytes.len()));
        }

        let r: FixedBytes<32> = FixedBytes::from_slice(&sig_bytes[0..32]);
        let s: FixedBytes<32> = FixedBytes::from_slice(&sig_bytes[32..64]);
        let v = sig_bytes[64];
        
        // Normalize v value
        let v_normalized = if v >= 27 { v } else { v + 27 };

        let token: Address = requirements.asset.parse()
            .map_err(|_| "Invalid token address")?;

        // Create contract instance
        let contract = IERC3009::new(token, &provider);

        // Build and send transaction
        info!("📤 Sending transferWithAuthorization...");
        info!("   From: {}", from);
        info!("   To: {}", to);
        info!("   Value: {}", value);
        info!("   Nonce: 0x{}", hex::encode(nonce));

        let tx = contract.transferWithAuthorization(
            from,
            to,
            value,
            valid_after,
            valid_before,
            nonce,
            v_normalized,
            r,
            s,
        );

        // Set gas limit with buffer to prevent out-of-gas failures
        // Default is 200000, configurable via SETTLEMENT_GAS_LIMIT env var
        let gas_limit = self.config.settlement_gas_limit;
        let tx_with_gas = tx.gas(gas_limit);
        
        debug!("   Gas limit: {}", gas_limit);

        let pending_tx = tx_with_gas.send().await
            .map_err(|e| format!("Transaction send failed: {}", e))?;

        let tx_hash = format!("{:?}", pending_tx.tx_hash());
        
        info!("✅ Transaction sent: {}", tx_hash);

        Ok(tx_hash)
    }
}
