//! Verification Service
//! 
//! Multi-layer payment verification implementing:
//! 1. Network validation
//! 2. Token validation  
//! 3. Payload extraction and structure validation
//! 4. Signature verification (EIP-712)
//! 5. Recipient address validation
//! 6. Time window validation
//! 7. Balance verification
//! 8. Amount validation

#![allow(dead_code)]

use std::sync::Arc;
use tracing::{info, warn, debug};
use alloy::primitives::{Address, U256, FixedBytes, keccak256};
use alloy::sol;

use crate::config::Config;
use crate::types::{PaymentPayload, PaymentRequirements, VerifyResponse};
use crate::services::provider_pool::{ProviderPool, ProviderType};

// Define the ERC20 interface for balance checking
sol! {
    #[sol(rpc)]
    interface IERC20 {
        function balanceOf(address account) external view returns (uint256);
        function decimals() external view returns (uint8);
    }
}

// EIP-3009 TransferWithAuthorization typed data
sol! {
    #[derive(Debug)]
    struct TransferWithAuthorization {
        address from;
        address to;
        uint256 value;
        uint256 validAfter;
        uint256 validBefore;
        bytes32 nonce;
    }
}

/// Verification service
pub struct VerificationService {
    config: Arc<Config>,
    provider_pool: Arc<ProviderPool>,
}

impl VerificationService {
    /// Create a new verification service
    pub fn new(config: Arc<Config>, provider_pool: Arc<ProviderPool>) -> Self {
        Self { config, provider_pool }
    }

    /// Main verification method with multi-layer checks
    pub async fn verify(
        &self,
        payload: &PaymentPayload,
        requirements: &PaymentRequirements,
    ) -> VerifyResponse {
        // Layer 1: Validate network
        let normalized_network = match self.validate_network(&requirements.network) {
            Ok(n) => n,
            Err(reason) => return VerifyResponse::invalid(reason),
        };

        info!("=== STARTING PAYMENT VERIFICATION ===");
        info!("Network: {}", normalized_network);
        info!("Asset: {}", requirements.asset);
        info!("Amount: {}", requirements.max_amount_required);

        // Layer 1.5: Validate token
        if let Err(reason) = self.validate_token(&normalized_network, &requirements.asset) {
            return VerifyResponse::invalid(reason);
        }

        // Layer 2: Extract payment data
        let payer = &payload.authorization.from;
        let signature = &payload.signature;
        
        if payer.is_empty() || signature.is_empty() {
            warn!("Missing payer address or signature in payload");
            return VerifyResponse::invalid("Missing payer address or signature".to_string());
        }

        debug!("✓ Payload extraction passed: Payer={}", payer);

        // Layer 3: Verify EIP-712 signature
        if let Err(reason) = self.verify_signature(payer, signature, &payload.authorization, &normalized_network, &requirements.asset).await {
            return VerifyResponse::invalid(reason);
        }

        // Layer 3.5: Verify recipient matches
        if let Err(reason) = self.verify_recipient(&payload.authorization.to, &requirements.pay_to) {
            return VerifyResponse::invalid(reason);
        }

        // Layer 4: Verify time window
        if let Err(reason) = self.verify_time_window(&payload.authorization.valid_after, &payload.authorization.valid_before) {
            return VerifyResponse::invalid(reason);
        }

        // Layer 5: Verify balance
        if let Err(reason) = self.verify_balance(payer, &requirements.asset, &requirements.max_amount_required, &normalized_network).await {
            return VerifyResponse::invalid(reason);
        }

        // Layer 6: Verify amounts match
        if let Err(reason) = self.verify_amounts(&payload.authorization.value, &requirements.max_amount_required) {
            return VerifyResponse::invalid(reason);
        }

        info!("✅ All verification layers passed successfully");
        VerifyResponse::valid(payer.clone())
    }

    /// Layer 1: Validate network is supported
    fn validate_network(&self, network: &str) -> Result<String, String> {
        let all_networks = self.config.all_networks();
        
        // Try exact match first (case-insensitive)
        if let Some(exact) = all_networks.iter().find(|n| n.to_lowercase() == network.to_lowercase()) {
            debug!("✓ Network validation passed (exact match): {}", exact);
            return Ok(exact.clone());
        }
        
        // Normalize and try again
        let normalized = self.config.normalize_network_name(network);
        
        if all_networks.contains(&normalized) {
            debug!("✓ Network validation passed: {}", normalized);
            return Ok(normalized);
        }
        
        warn!("Unsupported network: {}", network);
        Err(format!(
            "Network '{}' is not supported. Supported networks: {}",
            network,
            all_networks.join(", ")
        ))
    }

    /// Layer 1.5: Validate token is supported on the network
    fn validate_token(&self, network: &str, token_address: &str) -> Result<(), String> {
        match self.config.get_token_by_address(network, token_address) {
            Some(token) => {
                debug!("✓ Token validation passed: {} ({})", token.symbol, token.address);
                Ok(())
            }
            None => {
                warn!("Unsupported token: {} on network: {}", token_address, network);
                
                let supported = self.config.networks.get(network)
                    .map(|n| n.tokens.iter()
                        .map(|t| format!("{} ({})", t.symbol, t.address))
                        .collect::<Vec<_>>()
                        .join(", "))
                    .unwrap_or_else(|| "none".to_string());
                
                Err(format!(
                    "Token '{}' is not supported on network '{}'. Supported tokens: {}",
                    token_address, network, supported
                ))
            }
        }
    }

    /// Layer 3: Verify EIP-712 signature
    async fn verify_signature(
        &self,
        payer: &str,
        signature: &str,
        authorization: &crate::types::Eip3009Authorization,
        network: &str,
        token_address: &str,
    ) -> Result<(), String> {
        // Get EIP-712 domain
        let domain = self.config.get_eip712_domain(network, token_address)
            .ok_or_else(|| format!("No EIP-712 domain configured for token {} on {}", token_address, network))?;

        debug!("=== EIP-712 SIGNATURE VERIFICATION DEBUG ===");
        debug!("Domain: name={}, version={}, chainId={}, verifyingContract={}", 
               domain.name, domain.version, domain.chain_id, domain.verifying_contract);
        debug!("Authorization: from={}, to={}, value={}, validAfter={}, validBefore={}, nonce={}",
               authorization.from, authorization.to, authorization.value,
               authorization.valid_after, authorization.valid_before, authorization.nonce);

        // Parse addresses and values
        let from: Address = payer.parse()
            .map_err(|_| "Invalid payer address format")?;
        let to: Address = authorization.to.parse()
            .map_err(|_| "Invalid recipient address format")?;
        let value: U256 = authorization.value.parse()
            .map_err(|_| "Invalid value format")?;
        let valid_after: U256 = authorization.valid_after.parse()
            .map_err(|_| "Invalid validAfter format")?;
        let valid_before: U256 = authorization.valid_before.parse()
            .map_err(|_| "Invalid validBefore format")?;
        
        debug!("Parsed values: from={}, to={}, value={}, validAfter={}, validBefore={}",
               from, to, value, valid_after, valid_before);
        
        // Parse nonce as bytes32
        let nonce_hex = authorization.nonce.strip_prefix("0x").unwrap_or(&authorization.nonce);
        let nonce_bytes = hex::decode(nonce_hex)
            .map_err(|_| "Invalid nonce hex format")?;
        
        // Pad nonce to 32 bytes if needed
        let mut nonce_arr = [0u8; 32];
        let start = 32 - nonce_bytes.len().min(32);
        nonce_arr[start..].copy_from_slice(&nonce_bytes[..nonce_bytes.len().min(32)]);
        let nonce: FixedBytes<32> = FixedBytes::from(nonce_arr);

        // Build typed data struct
        let _typed_data = TransferWithAuthorization {
            from,
            to,
            value,
            validAfter: valid_after,
            validBefore: valid_before,
            nonce,
        };

        // Build domain separator
        let verifying_contract: Address = token_address.parse()
            .map_err(|_| "Invalid token address")?;
        
        // Compute EIP-712 hash (simplified - full implementation would use alloy's typed data)
        // For production, use alloy's full EIP-712 implementation
        let domain_separator = compute_domain_separator(
            &domain.name,
            &domain.version,
            domain.chain_id,
            verifying_contract,
        );
        
        let struct_hash = compute_transfer_authorization_hash(
            from, to, value, valid_after, valid_before, nonce
        );
        
        let message_hash = compute_typed_data_hash(domain_separator, struct_hash);

        debug!("Domain separator: 0x{}", hex::encode(domain_separator));
        debug!("Struct hash: 0x{}", hex::encode(struct_hash));
        debug!("Message hash: 0x{}", hex::encode(message_hash));

        // Parse signature
        let sig_hex = signature.strip_prefix("0x").unwrap_or(signature);
        let sig_bytes = hex::decode(sig_hex)
            .map_err(|_| "Invalid signature hex format")?;
        
        debug!("Signature length: {} bytes", sig_bytes.len());
        
        if sig_bytes.len() != 65 {
            return Err(format!("Invalid signature length: expected 65, got {}", sig_bytes.len()));
        }

        // Extract r, s, v from signature
        let r = &sig_bytes[0..32];
        let s = &sig_bytes[32..64];
        let v = sig_bytes[64];

        debug!("Signature v={}, r=0x{}, s=0x{}", v, hex::encode(r), hex::encode(s));

        // Recover the signer address
        let recovered = recover_signer(message_hash.as_slice(), r, s, v)
            .map_err(|e| format!("Signature recovery failed: {}", e))?;

        // Verify recovered address matches payer
        if recovered.to_lowercase() != payer.to_lowercase() {
            warn!("Signature verification failed: recovered {} != payer {}", recovered, payer);
            return Err(format!(
                "Signature verification failed: recovered address {} does not match payer {}",
                recovered, payer
            ));
        }

        debug!("✓ Signature verification passed for payer: {}", payer);
        Ok(())
    }

    /// Layer 3.5: Verify recipient matches
    fn verify_recipient(&self, authorization_to: &str, requirements_pay_to: &str) -> Result<(), String> {
        if authorization_to.to_lowercase() != requirements_pay_to.to_lowercase() {
            warn!(
                "Recipient mismatch: authorization.to={} != requirements.payTo={}",
                authorization_to, requirements_pay_to
            );
            return Err(format!(
                "Payment recipient mismatch: authorization specifies {} but payment requirements specify {}",
                authorization_to, requirements_pay_to
            ));
        }
        
        debug!("✓ Recipient verification passed: {}", authorization_to);
        Ok(())
    }

    /// Layer 4: Verify time window
    fn verify_time_window(&self, valid_after: &str, valid_before: &str) -> Result<(), String> {
        let now = chrono::Utc::now().timestamp() as u64;
        
        let after: u64 = valid_after.parse()
            .map_err(|_| "Invalid validAfter timestamp")?;
        let before: u64 = valid_before.parse()
            .map_err(|_| "Invalid validBefore timestamp")?;

        if now < after {
            warn!("Authorization not yet valid: now={} < validAfter={}", now, after);
            return Err(format!(
                "Authorization is not yet valid. Current time: {}, validAfter: {}",
                now, after
            ));
        }

        if now > before {
            warn!("Authorization expired: now={} > validBefore={}", now, before);
            return Err(format!(
                "Authorization has expired. Current time: {}, validBefore: {}",
                now, before
            ));
        }

        debug!("✓ Time window validation passed: {} < {} < {}", after, now, before);
        Ok(())
    }

    /// Layer 5: Verify token balance
    async fn verify_balance(
        &self,
        payer: &str,
        token_address: &str,
        amount: &str,
        network: &str,
    ) -> Result<(), String> {
        let provider_arc = self.provider_pool.get_provider(network)
            .map_err(|e| format!("Failed to get provider: {}", e))?;

        let payer_address: Address = payer.parse()
            .map_err(|_| "Invalid payer address")?;
        let token: Address = token_address.parse()
            .map_err(|_| "Invalid token address")?;
        let required_amount: U256 = amount.parse()
            .map_err(|_| "Invalid amount format")?;

        // Call balanceOf based on provider type
        let balance = match provider_arc.as_ref() {
            ProviderType::Http(p) => {
                let contract = IERC20::new(token, p);
                contract.balanceOf(payer_address)
                    .call()
                    .await
                    .map_err(|e| format!("Failed to get balance: {}", e))?
                    ._0
            }
            ProviderType::WebSocket(p) => {
                let contract = IERC20::new(token, p);
                contract.balanceOf(payer_address)
                    .call()
                    .await
                    .map_err(|e| format!("Failed to get balance: {}", e))?
                    ._0
            }
        };

        if balance < required_amount {
            warn!(
                "Insufficient balance: {} has {} but needs {}",
                payer, balance, required_amount
            );
            return Err(format!(
                "Insufficient token balance. Required: {}, Available: {}",
                required_amount, balance
            ));
        }

        debug!("✓ Balance verification passed: {} >= {}", balance, required_amount);
        Ok(())
    }

    /// Layer 6: Verify amounts match
    fn verify_amounts(&self, authorization_value: &str, requirements_amount: &str) -> Result<(), String> {
        let auth_amount: U256 = authorization_value.parse()
            .map_err(|_| "Invalid authorization value")?;
        let req_amount: U256 = requirements_amount.parse()
            .map_err(|_| "Invalid requirements amount")?;

        if auth_amount != req_amount {
            warn!(
                "Amount mismatch: authorization.value={} != requirements.maxAmountRequired={}",
                auth_amount, req_amount
            );
            return Err(format!(
                "Payment amount mismatch: authorization specifies {} but requirements specify {}",
                auth_amount, req_amount
            ));
        }

        debug!("✓ Amount verification passed: {}", auth_amount);
        Ok(())
    }
}

/// Compute EIP-712 domain separator
fn compute_domain_separator(name: &str, version: &str, chain_id: u64, verifying_contract: Address) -> [u8; 32] {
    // EIP-712 domain type hash
    let domain_type_hash = keccak256(
        b"EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
    );
    
    let name_hash = keccak256(name.as_bytes());
    let version_hash = keccak256(version.as_bytes());
    
    // Encode the domain struct
    let mut encoded = Vec::new();
    encoded.extend_from_slice(domain_type_hash.as_slice());
    encoded.extend_from_slice(name_hash.as_slice());
    encoded.extend_from_slice(version_hash.as_slice());
    encoded.extend_from_slice(&U256::from(chain_id).to_be_bytes::<32>());
    encoded.extend_from_slice(verifying_contract.as_slice());
    
    // Pad address to 32 bytes
    let mut padded = Vec::with_capacity(32 * 5);
    padded.extend_from_slice(domain_type_hash.as_slice());
    padded.extend_from_slice(name_hash.as_slice());
    padded.extend_from_slice(version_hash.as_slice());
    padded.extend_from_slice(&[0u8; 24]); // pad chainId
    padded.extend_from_slice(&chain_id.to_be_bytes());
    padded.extend_from_slice(&[0u8; 12]); // pad address
    padded.extend_from_slice(verifying_contract.as_slice());
    
    keccak256(&padded).into()
}

/// Compute TransferWithAuthorization struct hash
fn compute_transfer_authorization_hash(
    from: Address,
    to: Address,
    value: U256,
    valid_after: U256,
    valid_before: U256,
    nonce: FixedBytes<32>,
) -> [u8; 32] {
    // Type hash for TransferWithAuthorization
    let type_hash = keccak256(
        b"TransferWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)"
    );
    
    let mut encoded = Vec::with_capacity(32 * 7);
    encoded.extend_from_slice(type_hash.as_slice());
    
    // Pad addresses to 32 bytes
    encoded.extend_from_slice(&[0u8; 12]);
    encoded.extend_from_slice(from.as_slice());
    
    encoded.extend_from_slice(&[0u8; 12]);
    encoded.extend_from_slice(to.as_slice());
    
    encoded.extend_from_slice(&value.to_be_bytes::<32>());
    encoded.extend_from_slice(&valid_after.to_be_bytes::<32>());
    encoded.extend_from_slice(&valid_before.to_be_bytes::<32>());
    encoded.extend_from_slice(nonce.as_slice());
    
    keccak256(&encoded).into()
}

/// Compute final EIP-712 typed data hash
fn compute_typed_data_hash(domain_separator: [u8; 32], struct_hash: [u8; 32]) -> [u8; 32] {
    let mut encoded = Vec::with_capacity(66);
    encoded.extend_from_slice(b"\x19\x01");
    encoded.extend_from_slice(&domain_separator);
    encoded.extend_from_slice(&struct_hash);
    
    keccak256(&encoded).into()
}

/// Recover signer from signature (simplified - would use secp256k1 in production)
#[allow(deprecated)]
fn recover_signer(message_hash: &[u8], r: &[u8], s: &[u8], v: u8) -> Result<String, String> {
    use alloy::primitives::Signature;
    
    // Normalize v value
    let recovery_id = if v >= 27 { v - 27 } else { v };
    
    // Create signature
    let mut sig_bytes = [0u8; 65];
    sig_bytes[0..32].copy_from_slice(r);
    sig_bytes[32..64].copy_from_slice(s);
    sig_bytes[64] = recovery_id;
    
    let signature = Signature::try_from(sig_bytes.as_slice())
        .map_err(|e| format!("Invalid signature: {}", e))?;
    
    // Create fixed bytes for message hash
    let hash: FixedBytes<32> = FixedBytes::from_slice(message_hash);
    
    // Recover address
    let recovered = signature.recover_address_from_prehash(&hash)
        .map_err(|e| format!("Recovery failed: {}", e))?;
    
    Ok(format!("{}", recovered))
}
