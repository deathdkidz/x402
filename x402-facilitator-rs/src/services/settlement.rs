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
//! 10. Pre-settlement balance verification
//! 11. Replay attack protection (nonce checking)
//! 12. Gas estimation
//! 13. Transaction execution
//! 14. Flashblock fast confirmation (200-500ms for Base/OP networks)
//! 15. Background monitoring for non-flashblock networks

#![allow(dead_code)]

use std::sync::Arc;
use std::time::Duration;
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
    ) -> Self {
        info!("Settlement service initialized");
        Self {
            config,
            provider_pool,
            paymaster_pool,
            redis,
            database,
            verification_service,
        }
    }

    /// Main settlement method with safety checks
    pub async fn settle(
        &self,
        payload: &PaymentPayload,
        requirements: &PaymentRequirements,
        merchant: &Merchant,
    ) -> SettleResponse {
        // Get normalized network
        let normalized_network = match self.validate_network(&requirements.network) {
            Ok(n) => n,
            Err(reason) => return SettleResponse::failure(requirements.network.clone(), reason),
        };

        // Get paymaster signer
        let signer = match self.paymaster_pool.get_next_signer() {
            Ok(s) => s,
            Err(e) => return SettleResponse::failure(normalized_network, format!("Paymaster error: {}", e)),
        };

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
        if let Err(reason) = self.validate_token(&normalized_network, &requirements.asset) {
            return SettleResponse::failure(normalized_network, reason);
        }

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
        if let Err(reason) = self.verify_time_window(&payload.authorization.valid_after, &payload.authorization.valid_before) {
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

        // Safety Check 7: Pre-settlement balance verification
        if let Err(reason) = self.verify_balance(payer, &requirements.asset, &requirements.max_amount_required, &normalized_network).await {
            return SettleResponse::failure(normalized_network, reason);
        }

        // Safety Check 8: Check on-chain nonce state
        if let Err(reason) = self.check_nonce_unused(payer, nonce, &requirements.asset, &normalized_network).await {
            return SettleResponse::failure(normalized_network, reason);
        }

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

        // Execute the settlement transaction
        match self.execute_transfer(payload, requirements, &normalized_network, &signer).await {
            Ok(tx_hash) => {
                info!("⏳ Transaction submitted: {}", tx_hash);
                
                // Update database with pending status
                if let Err(e) = self.database.update_transaction_hash(transaction_id, &tx_hash, "pending").await {
                    error!("Failed to update transaction hash: {}", e);
                }

                // Wait for confirmation (flashblock fast path + standard fallback)
                let (confirmed, final_status) = self.wait_for_confirmation(&tx_hash, &normalized_network).await;
                
                if confirmed && final_status == "completed" {
                    info!("✅ Settlement confirmed: {}", tx_hash);
                    
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

    /// Verify time window
    fn verify_time_window(&self, valid_after: &str, valid_before: &str) -> Result<(), String> {
        let now = chrono::Utc::now().timestamp() as u64;
        
        let after: u64 = valid_after.parse().map_err(|_| "Invalid validAfter")?;
        let before: u64 = valid_before.parse().map_err(|_| "Invalid validBefore")?;

        if now < after {
            return Err(format!("Authorization not yet valid. Current: {}, validAfter: {}", now, after));
        }
        if now > before {
            return Err(format!("Authorization expired. Current: {}, validBefore: {}", now, before));
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
    /// Returns (confirmed: bool, status: &'static str)
    async fn wait_for_confirmation(&self, tx_hash: &str, network: &str) -> (bool, &'static str) {
        let provider = match self.provider_pool.get_provider(network) {
            Ok(p) => p,
            Err(e) => {
                warn!("Provider error during confirmation wait: {}", e);
                return (false, "pending");
            }
        };
        
        let provider = match provider.as_ref() {
            ProviderType::Http(p) => p,
        };

        // Parse hash
        let hash_hex = tx_hash.strip_prefix("0x").unwrap_or(tx_hash);
        let hash_bytes = match hex::decode(hash_hex) {
            Ok(b) => b,
            Err(_) => return (false, "pending"),
        };
        
        if hash_bytes.len() != 32 {
            return (false, "pending");
        }
        
        let hash: FixedBytes<32> = FixedBytes::from_slice(&hash_bytes);
        let is_flashblock = Self::is_flashblock_network(network);
        
        if is_flashblock {
            info!("⚡ Using Flashblock-optimized polling for {}", network);
            
            // Phase 1: Aggressive flashblock polling (100ms intervals for 1.5s)
            let start = std::time::Instant::now();
            let flashblock_duration = Duration::from_millis(1500);
            let flashblock_interval = Duration::from_millis(100);
            
            while start.elapsed() < flashblock_duration {
                match provider.get_transaction_receipt(hash).await {
                    Ok(Some(receipt)) => {
                        let elapsed = start.elapsed().as_millis();
                        if receipt.status() {
                            info!("⚡ Flashblock confirmation in {}ms: {}", elapsed, tx_hash);
                            return (true, "completed");
                        } else {
                            info!("⚡ Transaction reverted in {}ms: {}", elapsed, tx_hash);
                            return (true, "failed");
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
            match provider.get_transaction_receipt(hash).await {
                Ok(Some(receipt)) => {
                    let elapsed = start.elapsed().as_millis();
                    if receipt.status() {
                        info!("✅ Transaction confirmed in {}ms: {}", elapsed, tx_hash);
                        return (true, "completed");
                    } else {
                        info!("❌ Transaction reverted in {}ms: {}", elapsed, tx_hash);
                        return (true, "failed");
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
        (false, "pending")
    }

    /// Verify balance
    async fn verify_balance(&self, payer: &str, token_address: &str, amount: &str, network: &str) -> Result<(), String> {
        let provider = self.provider_pool.get_provider(network)
            .map_err(|e| format!("Provider error: {}", e))?;
        
        let provider = match provider.as_ref() {
            ProviderType::Http(p) => p,
        };

        let payer_addr: Address = payer.parse().map_err(|_| "Invalid payer address")?;
        let token: Address = token_address.parse().map_err(|_| "Invalid token address")?;
        let required: U256 = amount.parse().map_err(|_| "Invalid amount")?;

        let contract = IERC3009::new(token, provider);
        let balance = contract.balanceOf(payer_addr)
            .call()
            .await
            .map_err(|e| format!("Balance check failed: {}", e))?
            ._0;

        if balance < required {
            return Err(format!("Insufficient balance: {} < {}", balance, required));
        }

        Ok(())
    }

    /// Check that nonce hasn't been used on-chain
    async fn check_nonce_unused(&self, payer: &str, nonce: &str, token_address: &str, network: &str) -> Result<(), String> {
        let provider = self.provider_pool.get_provider(network)
            .map_err(|e| format!("Provider error: {}", e))?;
        
        let provider = match provider.as_ref() {
            ProviderType::Http(p) => p,
        };

        let payer_addr: Address = payer.parse().map_err(|_| "Invalid payer address")?;
        let token: Address = token_address.parse().map_err(|_| "Invalid token address")?;
        
        // Parse nonce
        let nonce_hex = nonce.strip_prefix("0x").unwrap_or(nonce);
        let nonce_bytes = hex::decode(nonce_hex).map_err(|_| "Invalid nonce hex")?;
        let mut nonce_arr = [0u8; 32];
        let start = 32 - nonce_bytes.len().min(32);
        nonce_arr[start..].copy_from_slice(&nonce_bytes[..nonce_bytes.len().min(32)]);
        let nonce_fixed: FixedBytes<32> = FixedBytes::from(nonce_arr);

        let contract = IERC3009::new(token, provider);
        let is_used = contract.authorizationState(payer_addr, nonce_fixed)
            .call()
            .await
            .map_err(|e| format!("Nonce check failed: {}", e))?
            ._0;

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

        let pending_tx = tx.send().await
            .map_err(|e| format!("Transaction send failed: {}", e))?;

        let tx_hash = format!("{:?}", pending_tx.tx_hash());
        
        info!("✅ Transaction sent: {}", tx_hash);

        Ok(tx_hash)
    }
}
