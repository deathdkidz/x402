//! Settlement Service
//! 
//! Executes token transfers using the Strategy pattern for multi-token support.
//! Supports ERC-3009 (transferWithAuthorization) and ERC-2612 (permit + transferFrom).
//! 
//! Safety checks performed:
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
//! 13. Transaction execution (via Strategy pattern)
//! 14. Flashblock fast confirmation (200-500ms for Base/OP networks)
//! 15. Background monitoring for non-flashblock networks

#![allow(dead_code)]

use std::sync::Arc;
use std::time::{Duration, Instant};
use tracing::{info, warn, error, debug};
use alloy::primitives::{Address, U256, FixedBytes};
use alloy::providers::{Provider, ProviderBuilder, WsConnect};
use alloy::network::EthereumWallet;
use alloy::sol;
use tokio::time::{sleep, timeout};
use crate::config::{Config, TransferType};
use crate::types::{PaymentPayload, PaymentRequirements, SettleResponse, SettlementStatus, ApiKey};
use crate::services::provider_pool::{ProviderPool, ProviderType};
use crate::services::paymaster_pool::PaymasterPool;
use crate::services::redis::Redis;
use crate::services::database::{Database, CreateTransaction};
use crate::services::verification::VerificationService;
use crate::services::webhook::WebhookService;
use crate::services::metrics;
use crate::strategies::{StrategyFactory, UnifiedPayload};

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

/// Result of credit deduction containing fee breakdown
#[derive(Debug, Clone)]
pub struct DeductionResult {
    pub service_fee_usd: rust_decimal::Decimal,
    pub gas_cost_usd: rust_decimal::Decimal,
    pub total_fees_usd: rust_decimal::Decimal,
    pub balance_after: rust_decimal::Decimal,
    pub balance_type: String,
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
    /// Strategy factory for multi-token transfer support
    strategy_factory: Option<Arc<StrategyFactory>>,
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
        // Initialize strategy factory if external config is available
        let strategy_factory = config.external.as_ref().map(|ext| {
            Arc::new(StrategyFactory::new(
                ext.clone(),
                provider_pool.clone(),
                paymaster_pool.clone(),
            ))
        });

        if strategy_factory.is_some() {
            info!("✅ Settlement service initialized with Strategy pattern (multi-token support)");
        } else {
            info!("⚠️ Settlement service initialized with legacy ERC-3009 only mode");
        }

        Self {
            config,
            provider_pool,
            paymaster_pool,
            redis,
            database,
            verification_service,
            webhook_service,
            strategy_factory,
        }
    }

    /// Invalidate API key cache (public wrapper for redis invalidation)
    pub async fn invalidate_api_key_cache(&self, api_key: &str) -> Result<(), crate::services::redis::RedisError> {
        self.redis.invalidate_api_key(api_key).await
    }

    /// Main settlement method with safety checks and timing instrumentation
    pub async fn settle(
        &self,
        payload: &PaymentPayload,
        requirements: &PaymentRequirements,
        api_key: &ApiKey,
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
        info!("Settling payment for API key: {}...{}", &api_key.api_key[..8], &api_key.api_key[api_key.api_key.len()-4..]);
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

        // Check API key has sufficient USD credits for estimated settlement cost
        // This is a pre-flight check to ensure merchant can afford the transaction
        use crate::services::price_feed::SERVICE_FEE_USD;
        use crate::config::network_resolver;
        
        let is_testnet = network_resolver::is_testnet(&normalized_network).unwrap_or(false);
        let relevant_balance = if is_testnet { api_key.testnet_balance } else { api_key.mainnet_balance };
        
        // Estimate settlement cost: service fee + estimated gas cost
        // Use conservative estimate: 100,000 gas at current price + 50% buffer
        let estimated_cost = self.estimate_settlement_cost(&normalized_network).await;
        
        let balance_type = if is_testnet { "testnet" } else { "mainnet" };
        info!("💳 Pre-settlement credit check: {} balance ${:.6} vs estimated cost ${:.6}", 
              balance_type, relevant_balance, estimated_cost);
        
        if relevant_balance < estimated_cost {
            warn!("❌ API key {}... has insufficient {} credits: ${:.6} < ${:.6}", 
                  &api_key.api_key[..8], balance_type, relevant_balance, estimated_cost);
            return SettleResponse::failure(
                normalized_network, 
                format!("Insufficient {} credits. Balance: ${:.6}, Estimated cost: ${:.6}. Please top up your account.",
                    balance_type, relevant_balance, estimated_cost)
            );
        }

        // Create transaction record
        let start = Instant::now();
        let tx_record = CreateTransaction {
            api_key: api_key.api_key.clone(),
            payer_address: payer.to_lowercase(),
            recipient_address: requirements.pay_to.clone(),
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
                    
                    // Atomic USD credit deduction (gas cost + service fee)
                    // This happens synchronously to ensure balance is deducted before response
                    let fees_info = if let Some(ref receipt) = receipt {
                        match self.deduct_credits_for_settlement(
                            &api_key.api_key,
                            transaction_id,
                            receipt,
                            &normalized_network,
                        ).await {
                            Ok(deduction) => {
                                // Invalidate API key cache so next request sees updated balance
                                let _ = self.redis.invalidate_api_key(&api_key.api_key).await;
                                
                                Some(crate::types::SettlementFees {
                                    service_fee: format!("{:.6}", deduction.service_fee_usd),
                                    gas_cost: format!("{:.6}", deduction.gas_cost_usd),
                                    total_fees: format!("{:.6}", deduction.total_fees_usd),
                                    balance_after: format!("{:.6}", deduction.balance_after),
                                    balance_type: deduction.balance_type,
                                })
                            },
                            Err(e) => {
                                warn!("Failed to deduct USD credits: {} (non-fatal)", e);
                                None
                            }
                        }
                    } else {
                        None
                    };

                    // Update database with completed status
                    if let Err(e) = self.database.update_transaction(transaction_id, "completed").await {
                        error!("Failed to update transaction status: {}", e);
                    }

                    // Cache the nonce with completed status
                    if let Err(e) = self.redis.cache_used_nonce(payer, nonce, &tx_hash, "completed", 86400).await {
                        error!("Failed to cache nonce: {}", e);
                    }

                    // Return response with fee breakdown if available
                    if let Some(fees) = fees_info {
                        SettleResponse::success_with_fees(
                            normalized_network,
                            payer.clone(),
                            tx_hash,
                            SettlementStatus::Completed,
                            fees,
                        )
                    } else {
                        SettleResponse::success(
                            normalized_network,
                            payer.clone(),
                            tx_hash,
                            SettlementStatus::Completed,
                        )
                    }
                } else if confirmed && final_status == "failed" {
                    error!("❌ Transaction reverted: {}", tx_hash);
                    
                    // Log failed event
                    self.log_tx_event(transaction_id, "reverted", Some("pending"), Some("failed"), Some("{\"reason\":\"Transaction reverted on-chain\"}")).await;
                    
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
                    // Not confirmed yet - return pending with preconfirmed status
                    // Note: We don't deduct until confirmation (atomic deduction model)
                    info!("⏳ Transaction pending, will be monitored: {}", tx_hash);

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
                // Update database
                if let Err(e) = self.database.update_transaction(transaction_id, "failed").await {
                    error!("Failed to update transaction status: {}", e);
                }

                SettleResponse::failure(normalized_network, reason)
            }
        }
    }

    /// Settle payment to vault address for credit purchase
    /// Similar to settle() but:
    /// 1. Pay_to is the vault address (not merchant)
    /// 2. Does NOT deduct credits (this is a purchase, not a use)
    /// 3. Returns the USD value of the payment for crediting
    pub async fn settle_to_vault(
        &self,
        payload: &PaymentPayload,
        requirements: &PaymentRequirements,
        vault_address: &str,
    ) -> Result<(String, rust_decimal::Decimal), String> {
        // Validate vault address matches requirements
        if payload.authorization.to.to_lowercase() != vault_address.to_lowercase() {
            return Err(format!(
                "Payment recipient {} does not match vault {}",
                payload.authorization.to, vault_address
            ));
        }
        
        // Get normalized network
        let normalized_network = self.validate_network(&requirements.network)?;

        // Get paymaster signer
        let signer = match self.paymaster_pool.get_next_signer() {
            Ok(s) => s,
            Err(e) => return Err(format!("Paymaster error: {}", e)),
        };

        info!("💰 Processing credit purchase to vault");
        info!("Network: {}", normalized_network);
        info!("Asset: {}", requirements.asset);
        info!("Amount: {}", requirements.max_amount_required);

        let payer = &payload.authorization.from;
        let nonce = &payload.authorization.nonce;

        // Validate token
        self.validate_token(&normalized_network, &requirements.asset)?;

        // Verify time window
        self.verify_time_window(&payload.authorization.valid_after, &payload.authorization.valid_before)?;

        // Check for duplicate
        if let Ok(Some(cached)) = self.redis.get_nonce_transaction(payer, nonce).await {
            if cached.status == "completed" {
                return Err("This payment has already been processed".to_string());
            }
        }

        // Verify balance
        self.verify_balance(payer, &requirements.asset, &requirements.max_amount_required, &normalized_network).await?;

        // Verify nonce unused
        self.check_nonce_unused(payer, nonce, &requirements.asset, &normalized_network).await?;

        // Execute the transfer
        let tx_hash = self.execute_transfer(payload, requirements, &normalized_network, &signer).await?;
        
        info!("⏳ Credit purchase transaction submitted: {}", tx_hash);

        // Wait for confirmation
        let (confirmed, final_status, _receipt) = self.wait_for_confirmation_with_receipt(&tx_hash, &normalized_network).await;

        if !confirmed || final_status != "completed" {
            // Cache failed nonce
            let _ = self.redis.cache_used_nonce(payer, nonce, &tx_hash, &final_status, 86400).await;
            return Err(format!("Transaction failed with status: {}", final_status));
        }

        info!("✅ Credit purchase confirmed: {}", tx_hash);

        // Cache successful nonce
        let _ = self.redis.cache_used_nonce(payer, nonce, &tx_hash, "completed", 86400).await;

        // Calculate USD value (USDC has 6 decimals)
        let amount_str = &requirements.max_amount_required;
        let amount = amount_str.parse::<u128>().map_err(|e| format!("Invalid amount: {}", e))?;
        
        // Get token decimals (default to 6 for USDC)
        let decimals = self.config.get_token_by_address(&normalized_network, &requirements.asset)
            .map(|t| t.decimals)
            .unwrap_or(6);
        
        let divisor = 10u128.pow(decimals as u32);
        let usd_value = rust_decimal::Decimal::from(amount) / rust_decimal::Decimal::from(divisor);

        info!("💵 Credit purchase value: ${:.2}", usd_value);

        Ok((tx_hash, usd_value))
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
    /// Uses WebSocket transport for RPC calls when available (low latency)
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
        let transport_type = if provider_arc.is_websocket() { "WebSocket" } else { "HTTP" };
        
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
            info!("⚡ Flashblock fast polling via {} for {}", transport_type, network);
            
            // Phase 1: Aggressive flashblock polling (100ms intervals for 2s)
            // WebSocket transport provides lowest latency for each RPC call
            let start = std::time::Instant::now();
            let flashblock_duration = Duration::from_millis(2000);
            let flashblock_interval = Duration::from_millis(100);
            
            while start.elapsed() < flashblock_duration {
                match get_receipt(hash).await {
                    Ok(Some(receipt)) => {
                        let elapsed = start.elapsed().as_millis();
                        Self::log_gas_usage(&receipt, network, tx_hash);
                        
                        if receipt.status() {
                            info!("⚡ Flashblock confirmation in {}ms via {}: {}", elapsed, transport_type, tx_hash);
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
                    Self::log_gas_usage(&receipt, network, tx_hash);
                    
                    if receipt.status() {
                        info!("✅ Transaction confirmed in {}ms via {}: {}", elapsed, transport_type, tx_hash);
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

    /// Atomic USD credit deduction after settlement confirmation
    /// Calculates actual gas cost and service fee, then deducts from API key balance
    async fn deduct_credits_for_settlement(
        &self,
        api_key_str: &str,
        transaction_id: i64,
        receipt: &alloy::rpc::types::TransactionReceipt,
        network: &str,
    ) -> Result<DeductionResult, String> {
        use crate::services::{ApiKeyDb, PriceFeedService, price_feed::SERVICE_FEE_USD};
        use crate::services::api_key_db::GasDeductionData;
        use crate::types::api_key::BalanceType;
        use crate::config::network_resolver;
        
        // Get gas data from receipt
        let gas_used: u64 = receipt.gas_used.try_into()
            .map_err(|_| "Gas used overflow")?;
        let gas_price = receipt.effective_gas_price;
        
        // Calculate gas cost in USD using price feed
        let gas_cost_usd = PriceFeedService::calculate_gas_cost_from_receipt(
            receipt,
            network,
            &self.database,
        ).await.map_err(|e| format!("Price calculation failed: {}", e))?;
        
        let total_usd = gas_cost_usd + SERVICE_FEE_USD;
        
        // Determine balance type based on network
        let is_testnet = network_resolver::is_testnet(network).unwrap_or(false);
        let balance_type = if is_testnet { BalanceType::Testnet } else { BalanceType::Mainnet };
        
        info!(
            "💰 Deducting ${:.6} from {} balance (gas: ${:.6} + fee: ${:.6})",
            total_usd, balance_type.as_str(), gas_cost_usd, SERVICE_FEE_USD
        );
        
        // Get API key info to get the ID
        let api_key = ApiKeyDb::get_api_key(self.database.pool(), api_key_str)
            .await
            .map_err(|e| format!("API key lookup failed: {}", e))?;
        
        // Prepare gas data for ledger
        let gas_data = GasDeductionData {
            gas_used,
            gas_price_wei: gas_price,
            gas_cost_native: rust_decimal::Decimal::new(gas_used as i64, 0) 
                * rust_decimal::Decimal::new(gas_price as i64, 18),
            gas_cost_usd,
            native_usd_price: rust_decimal::Decimal::ZERO, // Will be looked up
            service_fee_usd: SERVICE_FEE_USD,
            network: network.to_string(),
        };
        
        // Atomic deduction from appropriate balance
        let balance_after = ApiKeyDb::deduct_settlement_costs(
            self.database.pool(),
            api_key.id,
            transaction_id,
            balance_type.clone(),
            SERVICE_FEE_USD,
            gas_cost_usd,
            &gas_data,
        ).await.map_err(|e| format!("Credit deduction failed: {}", e))?;
        
        Ok(DeductionResult {
            service_fee_usd: SERVICE_FEE_USD,
            gas_cost_usd,
            total_fees_usd: total_usd,
            balance_after,
            balance_type: balance_type.as_str().to_string(),
        })
    }

    /// Estimate settlement cost (gas + service fee) in USD
    /// Uses conservative estimate: 100,000 gas at current network gas price
    /// with a 50% buffer to ensure merchant won't run out mid-transaction
    async fn estimate_settlement_cost(&self, network: &str) -> rust_decimal::Decimal {
        use rust_decimal::Decimal;
        use rust_decimal_macros::dec;
        use crate::services::{ApiKeyDb, price_feed::SERVICE_FEE_USD};
        
        // Conservative gas estimate for ERC-3009 transferWithAuthorization
        let estimated_gas: u64 = 100_000;
        
        // Try to get current gas price from provider (returns wei as u128)
        let gas_price_wei = match self.provider_pool.get_provider(network) {
            Ok(provider_arc) => {
                let result = match provider_arc.as_ref() {
                    ProviderType::Http(p) => p.get_gas_price().await,
                    ProviderType::WebSocket(p) => p.get_gas_price().await,
                };
                match result {
                    Ok(price) => price as f64,
                    Err(_) => 1_000_000_000.0, // Fallback to 1 gwei in wei
                }
            }
            Err(_) => 1_000_000_000.0, // Fallback to 1 gwei in wei
        };
        
        // Get native token price from database cache
        let native_symbol = self.config.networks.get(network)
            .map(|n| n.native_token.symbol.as_str())
            .unwrap_or("ETH");
        
        let native_price_usd = match ApiKeyDb::get_native_token_price(
            self.database.pool(),
            native_symbol,
        ).await {
            Ok(Some(price)) => price,
            _ => dec!(2000), // Fallback to $2000 (conservative ETH estimate)
        };
        
        // Calculate gas cost: gas_used * gas_price_wei * 1e-18 * native_price
        // gas_price_wei is in wei, so multiply by 1e-18 to get ETH
        let gas_cost_native = Decimal::try_from(
            (estimated_gas as f64) * gas_price_wei * 1e-18
        ).unwrap_or(dec!(0.0001));
        
        let gas_cost_usd = gas_cost_native * native_price_usd;
        
        // Total cost = gas + service fee, with 50% buffer for price fluctuations
        let total = (gas_cost_usd + SERVICE_FEE_USD) * dec!(1.5);
        
        // Convert wei to gwei for logging
        let gas_price_gwei = gas_price_wei / 1e9;
        
        info!(
            "💰 Pre-flight cost estimate for {}: {}gas @ {:.4}gwei × ${:.2}/ETH = ${:.6} (fee: ${:.3}, total with 50% buffer: ${:.6})",
            network, estimated_gas, gas_price_gwei, native_price_usd, gas_cost_usd, SERVICE_FEE_USD, total
        );
        
        total
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
        // Check if we should use strategy pattern
        if let Some(ref factory) = self.strategy_factory {
            // Get transfer type for this token
            let transfer_type = self.config.get_transfer_type(network, &requirements.asset)
                .unwrap_or(TransferType::Erc3009);
            
            // Get the appropriate strategy
            let strategy = factory.get_strategy(network, &requirements.asset)
                .map_err(|e| format!("Strategy error: {}", e))?;
            
            // Convert payload to unified format using the constructor
            let unified = UnifiedPayload::erc3009(
                payload.authorization.from.clone(),
                payload.authorization.to.clone(),
                payload.authorization.value.clone(),
                payload.authorization.valid_after.clone(),
                payload.authorization.valid_before.clone(),
                payload.authorization.nonce.clone(),
                payload.signature.clone(),
            );
            
            // Verify signature locally BEFORE spending gas on transaction
            // This catches invalid signatures at zero cost
            info!("🔐 Verifying signature locally before settlement...");
            strategy.verify_signature(&unified, network, &requirements.asset)
                .await
                .map_err(|e| format!("Signature verification failed: {:?}", e))?;
            info!("✅ Local signature verification passed");
            
            info!("📤 Executing transfer via {:?} strategy...", transfer_type);
            
            // Execute via strategy
            let result = strategy.execute(&unified, network, &requirements.asset, &requirements.pay_to)
                .await
                .map_err(|e| format!("Strategy execution failed: {:?}", e))?;
            
            return Ok(result.tx_hash.unwrap_or_default());
        }
        
        // Legacy ERC-3009 direct execution (fallback)
        self.execute_transfer_erc3009_legacy(payload, requirements, network, signer).await
    }
    
    /// Legacy ERC-3009 direct execution (when no external config/strategies)
    async fn execute_transfer_erc3009_legacy(
        &self,
        payload: &PaymentPayload,
        requirements: &PaymentRequirements,
        network: &str,
        signer: &alloy::signers::local::PrivateKeySigner,
    ) -> Result<String, String> {
        // Get RPC URL
        let rpc_url = self.config.get_rpc_url(network)
            .ok_or_else(|| format!("No RPC URL for network: {}", network))?;
        
        // Create wallet
        let wallet = EthereumWallet::from(signer.clone());
        
        // Parse all transaction parameters upfront
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
        let v_normalized = if v >= 27 { v } else { v + 27 };

        let token: Address = requirements.asset.parse()
            .map_err(|_| "Invalid token address")?;
        
        let gas_limit = self.config.settlement_gas_limit;
        
        info!("📤 Sending transferWithAuthorization...");
        info!("   From: {}", from);
        info!("   To: {}", to);
        info!("   Value: {}", value);
        info!("   Nonce: 0x{}", hex::encode(nonce));
        
        // Determine connection type and execute
        let is_ws_url = rpc_url.starts_with("wss://") || rpc_url.starts_with("ws://");
        let mut used_websocket = false;
        
        let tx_hash = if is_ws_url {
            // Try WebSocket first
            let ws_result: Result<String, String> = async {
                let ws_connect = WsConnect::new(rpc_url.clone());
                let provider = timeout(
                    Duration::from_secs(10),
                    ProviderBuilder::new()
                        .with_recommended_fillers()
                        .wallet(wallet.clone())
                        .on_ws(ws_connect)
                ).await
                    .map_err(|_| "WebSocket connection timeout".to_string())?
                    .map_err(|e| format!("WebSocket connect failed: {}", e))?;
                
                let contract = IERC3009::new(token, &provider);
                let tx = contract.transferWithAuthorization(
                    from, to, value, valid_after, valid_before, nonce,
                    v_normalized, r, s,
                ).gas(gas_limit);
                
                let pending = tx.send().await
                    .map_err(|e| format!("Transaction send failed: {}", e))?;
                Ok(format!("{:?}", pending.tx_hash()))
            }.await;
            
            match ws_result {
                Ok(hash) => {
                    used_websocket = true;
                    hash
                }
                Err(ws_err) => {
                    warn!("⚠️ WebSocket failed ({}), falling back to HTTP", ws_err);
                    let http_url = rpc_url.replace("wss://", "https://").replace("ws://", "http://");
                    let provider = ProviderBuilder::new()
                        .with_recommended_fillers()
                        .wallet(wallet.clone())
                        .on_http(http_url.parse().map_err(|e| format!("Invalid URL: {}", e))?);
                    
                    let contract = IERC3009::new(token, &provider);
                    let tx = contract.transferWithAuthorization(
                        from, to, value, valid_after, valid_before, nonce,
                        v_normalized, r, s,
                    ).gas(gas_limit);
                    
                    let pending = tx.send().await
                        .map_err(|e| format!("Transaction send failed: {}", e))?;
                    format!("{:?}", pending.tx_hash())
                }
            }
        } else {
            // HTTP only
            let provider = ProviderBuilder::new()
                .with_recommended_fillers()
                .wallet(wallet.clone())
                .on_http(rpc_url.parse().map_err(|e| format!("Invalid URL: {}", e))?);
            
            let contract = IERC3009::new(token, &provider);
            let tx = contract.transferWithAuthorization(
                from, to, value, valid_after, valid_before, nonce,
                v_normalized, r, s,
            ).gas(gas_limit);
            
            let pending = tx.send().await
                .map_err(|e| format!("Transaction send failed: {}", e))?;
            format!("{:?}", pending.tx_hash())
        };
        
        info!("✅ Transaction sent via {}: {}", if used_websocket { "WebSocket" } else { "HTTP" }, tx_hash);
        
        Ok(tx_hash)
    }
}
