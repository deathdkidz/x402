//! ERC-3009 Transfer Strategy
//!
//! Implements transferWithAuthorization for gasless token transfers.
//! 
//! ERC-3009 allows token holders to authorize a transfer via a signed message
//! (EIP-712 typed data), which can then be submitted by anyone (the facilitator).
//! 
//! Key parameters:
//! - from: Token holder (payer)
//! - to: Recipient
//! - value: Amount to transfer
//! - validAfter: Unix timestamp after which the authorization is valid
//! - validBefore: Unix timestamp before which the authorization is valid
//! - nonce: bytes32 random nonce (prevents replay)
//! - signature: EIP-712 signature (v, r, s)

use std::sync::Arc;
use std::time::{Instant, Duration};
use async_trait::async_trait;
use tracing::{info, warn, debug};
use alloy::primitives::{Address, U256, FixedBytes, keccak256, B256};
use alloy::signers::k256::ecdsa::{RecoveryId, Signature as K256Signature, VerifyingKey};
use alloy::providers::{Provider, ProviderBuilder, WsConnect};
use alloy::network::EthereumWallet;
use alloy::sol;
use tokio::time::timeout;

use crate::config::external::{TransferType, ExternalConfig};
use crate::services::provider_pool::{ProviderPool, ProviderType};
use crate::services::paymaster_pool::PaymasterPool;
use super::{TransferStrategy, StrategyError, UnifiedPayload, PreCheckResult, ExecuteResult, SignatureComponents, NonceUtils};

// ERC-3009 interface
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
        function name() external view returns (string);
        function version() external view returns (string);
        function DOMAIN_SEPARATOR() external view returns (bytes32);
    }
}

/// ERC-3009 transfer strategy
pub struct Erc3009Strategy {
    config: Arc<ExternalConfig>,
    provider_pool: Arc<ProviderPool>,
    paymaster_pool: Arc<PaymasterPool>,
}

impl Erc3009Strategy {
    /// Create a new ERC-3009 strategy
    pub fn new(
        config: Arc<ExternalConfig>,
        provider_pool: Arc<ProviderPool>,
        paymaster_pool: Arc<PaymasterPool>,
    ) -> Self {
        Self {
            config,
            provider_pool,
            paymaster_pool,
        }
    }
    
    /// Validate ERC-3009 specific fields
    fn validate_erc3009_fields(&self, payload: &UnifiedPayload) -> Result<(), StrategyError> {
        // Check required fields
        if payload.valid_after.is_none() {
            return Err(StrategyError::InvalidPayload("validAfter is required for ERC-3009".to_string()));
        }
        if payload.valid_before.is_none() {
            return Err(StrategyError::InvalidPayload("validBefore is required for ERC-3009".to_string()));
        }
        if payload.nonce.is_none() {
            return Err(StrategyError::InvalidPayload("nonce is required for ERC-3009".to_string()));
        }
        
        // Validate time window
        let now = chrono::Utc::now().timestamp() as u64;
        let valid_after: u64 = payload.valid_after.as_ref().unwrap()
            .parse()
            .map_err(|_| StrategyError::InvalidPayload("Invalid validAfter timestamp".to_string()))?;
        let valid_before: u64 = payload.valid_before.as_ref().unwrap()
            .parse()
            .map_err(|_| StrategyError::InvalidPayload("Invalid validBefore timestamp".to_string()))?;
        
        if now < valid_after {
            return Err(StrategyError::InvalidPayload(
                format!("Authorization not yet valid. Current: {}, validAfter: {}", now, valid_after)
            ));
        }
        
        if now > valid_before {
            return Err(StrategyError::InvalidPayload(
                format!("Authorization expired. Current: {}, validBefore: {}", now, valid_before)
            ));
        }
        
        // Validate nonce format
        let nonce = payload.nonce.as_ref().unwrap();
        NonceUtils::parse_bytes32(nonce)
            .map_err(|e| StrategyError::InvalidPayload(format!("Invalid nonce: {}", e)))?;
        
        Ok(())
    }
    
    /// Get balance for an address
    async fn get_balance(&self, token: Address, owner: Address, network: &str) -> Result<U256, StrategyError> {
        let provider_arc = self.provider_pool.get_provider(network)
            .map_err(|e| StrategyError::ProviderError(e.to_string()))?;
        
        let balance = match provider_arc.as_ref() {
            ProviderType::Http(p) => {
                let contract = IERC3009::new(token, p);
                contract.balanceOf(owner)
                    .call()
                    .await
                    .map_err(|e| StrategyError::ProviderError(format!("Balance check failed: {}", e)))?
                    ._0
            }
            ProviderType::WebSocket(p) => {
                let contract = IERC3009::new(token, p);
                contract.balanceOf(owner)
                    .call()
                    .await
                    .map_err(|e| StrategyError::ProviderError(format!("Balance check failed: {}", e)))?
                    ._0
            }
        };
        
        Ok(balance)
    }
    
    /// Check authorization state (nonce used)
    async fn get_authorization_state(&self, token: Address, authorizer: Address, nonce: FixedBytes<32>, network: &str) -> Result<bool, StrategyError> {
        let provider_arc = self.provider_pool.get_provider(network)
            .map_err(|e| StrategyError::ProviderError(e.to_string()))?;
        
        let is_used = match provider_arc.as_ref() {
            ProviderType::Http(p) => {
                let contract = IERC3009::new(token, p);
                contract.authorizationState(authorizer, nonce)
                    .call()
                    .await
                    .map_err(|e| StrategyError::ProviderError(format!("Nonce check failed: {}", e)))?
                    ._0
            }
            ProviderType::WebSocket(p) => {
                let contract = IERC3009::new(token, p);
                contract.authorizationState(authorizer, nonce)
                    .call()
                    .await
                    .map_err(|e| StrategyError::ProviderError(format!("Nonce check failed: {}", e)))?
                    ._0
            }
        };
        
        Ok(is_used)
    }
    
    /// Verify EIP-712 signature locally before submitting transaction
    /// This saves gas by catching invalid signatures early
    fn verify_eip712_signature(
        &self,
        payload: &UnifiedPayload,
        chain_id: u64,
        token_address: &str,
        token_name: &str,
        token_version: &str,
    ) -> Result<Address, StrategyError> {
        // EIP-712 type hashes (pre-computed)
        // keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)")
        let domain_type_hash: B256 = keccak256(
            b"EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
        );
        
        // keccak256("TransferWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)")
        let transfer_type_hash: B256 = keccak256(
            b"TransferWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)"
        );
        
        // Parse addresses and values
        let from: Address = payload.from.parse()
            .map_err(|_| StrategyError::SignatureError("Invalid from address".to_string()))?;
        let to: Address = payload.to.parse()
            .map_err(|_| StrategyError::SignatureError("Invalid to address".to_string()))?;
        let value: U256 = payload.value.parse()
            .map_err(|_| StrategyError::SignatureError("Invalid value".to_string()))?;
        let valid_after: U256 = payload.valid_after.as_ref().unwrap().parse()
            .map_err(|_| StrategyError::SignatureError("Invalid validAfter".to_string()))?;
        let valid_before: U256 = payload.valid_before.as_ref().unwrap().parse()
            .map_err(|_| StrategyError::SignatureError("Invalid validBefore".to_string()))?;
        let nonce = NonceUtils::to_fixed_bytes(payload.nonce.as_ref().unwrap())
            .map_err(|e| StrategyError::SignatureError(format!("Invalid nonce: {}", e)))?;
        let token: Address = token_address.parse()
            .map_err(|_| StrategyError::SignatureError("Invalid token address".to_string()))?;
        
        // Build domain separator
        // domainSeparator = keccak256(abi.encode(DOMAIN_TYPE_HASH, keccak256(name), keccak256(version), chainId, verifyingContract))
        let mut domain_data = Vec::with_capacity(160);
        domain_data.extend_from_slice(domain_type_hash.as_slice());
        domain_data.extend_from_slice(keccak256(token_name.as_bytes()).as_slice());
        domain_data.extend_from_slice(keccak256(token_version.as_bytes()).as_slice());
        domain_data.extend_from_slice(&U256::from(chain_id).to_be_bytes::<32>());
        domain_data.extend_from_slice(&[0u8; 12]); // padding for address
        domain_data.extend_from_slice(token.as_slice());
        let domain_separator = keccak256(&domain_data);
        
        // Build struct hash
        // structHash = keccak256(abi.encode(TRANSFER_TYPE_HASH, from, to, value, validAfter, validBefore, nonce))
        let mut struct_data = Vec::with_capacity(224);
        struct_data.extend_from_slice(transfer_type_hash.as_slice());
        struct_data.extend_from_slice(&[0u8; 12]); // padding for address
        struct_data.extend_from_slice(from.as_slice());
        struct_data.extend_from_slice(&[0u8; 12]); // padding for address
        struct_data.extend_from_slice(to.as_slice());
        struct_data.extend_from_slice(&value.to_be_bytes::<32>());
        struct_data.extend_from_slice(&valid_after.to_be_bytes::<32>());
        struct_data.extend_from_slice(&valid_before.to_be_bytes::<32>());
        struct_data.extend_from_slice(nonce.as_slice());
        let struct_hash = keccak256(&struct_data);
        
        // Build final digest: keccak256("\x19\x01" || domainSeparator || structHash)
        let mut digest_input = Vec::with_capacity(66);
        digest_input.extend_from_slice(&[0x19, 0x01]);
        digest_input.extend_from_slice(domain_separator.as_slice());
        digest_input.extend_from_slice(struct_hash.as_slice());
        let digest = keccak256(&digest_input);
        
        // Parse signature and recover signer
        let sig = SignatureComponents::from_hex(&payload.signature)
            .map_err(|e| StrategyError::SignatureError(format!("Invalid signature: {}", e)))?;
        
        // Normalize v value for recovery
        let recovery_id = match sig.v {
            0 | 27 => 0,
            1 | 28 => 1,
            v => v - 27,
        };
        
        let recovery_id = RecoveryId::try_from(recovery_id)
            .map_err(|_| StrategyError::SignatureError("Invalid recovery id".to_string()))?;
        
        // Combine r and s into signature bytes
        let mut sig_bytes = [0u8; 64];
        sig_bytes[..32].copy_from_slice(&sig.r);
        sig_bytes[32..].copy_from_slice(&sig.s);
        
        let k256_sig = K256Signature::from_slice(&sig_bytes)
            .map_err(|e| StrategyError::SignatureError(format!("Invalid signature bytes: {}", e)))?;
        
        // Recover the public key
        let recovered_key = VerifyingKey::recover_from_prehash(digest.as_slice(), &k256_sig, recovery_id)
            .map_err(|e| StrategyError::SignatureError(format!("Signature recovery failed: {}", e)))?;
        
        // Convert public key to address
        let pubkey_bytes = recovered_key.to_encoded_point(false);
        let pubkey_hash = keccak256(&pubkey_bytes.as_bytes()[1..]); // skip the 0x04 prefix
        let recovered_address = Address::from_slice(&pubkey_hash[12..]);
        
        // Verify recovered address matches claimed 'from'
        if recovered_address != from {
            return Err(StrategyError::SignatureError(
                format!("Signature mismatch: recovered {} but expected {}", recovered_address, from)
            ));
        }
        
        Ok(recovered_address)
    }
}

#[async_trait]
impl TransferStrategy for Erc3009Strategy {
    fn transfer_type(&self) -> TransferType {
        TransferType::Erc3009
    }
    
    fn validate_payload(&self, payload: &UnifiedPayload) -> Result<(), StrategyError> {
        // Common validations
        if payload.from.is_empty() {
            return Err(StrategyError::InvalidPayload("from address is required".to_string()));
        }
        if payload.to.is_empty() {
            return Err(StrategyError::InvalidPayload("to address is required".to_string()));
        }
        if payload.value.is_empty() {
            return Err(StrategyError::InvalidPayload("value is required".to_string()));
        }
        if payload.signature.is_empty() {
            return Err(StrategyError::InvalidPayload("signature is required".to_string()));
        }
        
        // Validate addresses
        payload.from.parse::<Address>()
            .map_err(|_| StrategyError::InvalidPayload("Invalid from address".to_string()))?;
        payload.to.parse::<Address>()
            .map_err(|_| StrategyError::InvalidPayload("Invalid to address".to_string()))?;
        
        // Validate value
        payload.value.parse::<U256>()
            .map_err(|_| StrategyError::InvalidPayload("Invalid value".to_string()))?;
        
        // Validate signature
        SignatureComponents::from_hex(&payload.signature)
            .map_err(|e| StrategyError::InvalidPayload(format!("Invalid signature: {}", e)))?;
        
        // ERC-3009 specific validations
        self.validate_erc3009_fields(payload)?;
        
        Ok(())
    }
    
    async fn verify_signature(
        &self,
        payload: &UnifiedPayload,
        network: &str,
        token_address: &str,
    ) -> Result<String, StrategyError> {
        // Get token config for EIP-712 domain
        let token_config = self.config.get_token(network, token_address);
        let network_config = self.config.get_network(network);
        
        let (token_name, token_version, chain_id) = match (token_config, network_config) {
            (Some(tc), Some(nc)) => (
                tc.eip712_name.clone().unwrap_or_else(|| tc.name.clone()),
                tc.eip712_version.clone().unwrap_or_else(|| "1".to_string()),
                nc.chain_id,
            ),
            _ => {
                // Fallback: skip local verification, rely on on-chain
                warn!("⚠️ Token config not found for {}/{}, skipping local signature verification", network, token_address);
                return Ok(payload.payer());
            }
        };
        
        // Verify signature locally before spending gas
        debug!("🔐 Verifying EIP-712 signature locally (chain_id={}, token={})", chain_id, token_name);
        
        let recovered = self.verify_eip712_signature(
            payload,
            chain_id,
            token_address,
            &token_name,
            &token_version,
        )?;
        
        info!("✅ Signature verified: {}", recovered);
        Ok(recovered.to_string().to_lowercase())
    }
    
    async fn pre_check(
        &self,
        payload: &UnifiedPayload,
        network: &str,
        token_address: &str,
    ) -> Result<PreCheckResult, StrategyError> {
        let start = Instant::now();
        
        let payer: Address = payload.from.parse()
            .map_err(|_| StrategyError::InvalidPayload("Invalid from address".to_string()))?;
        let token: Address = token_address.parse()
            .map_err(|_| StrategyError::InvalidPayload("Invalid token address".to_string()))?;
        let required: U256 = payload.value.parse()
            .map_err(|_| StrategyError::InvalidPayload("Invalid value".to_string()))?;
        
        let nonce_str = payload.nonce.as_ref().unwrap();
        let nonce = NonceUtils::to_fixed_bytes(nonce_str)
            .map_err(|e| StrategyError::InvalidPayload(format!("Invalid nonce: {}", e)))?;
        
        // Run balance and nonce checks in parallel
        let (balance_result, nonce_result) = tokio::join!(
            self.get_balance(token, payer, network),
            self.get_authorization_state(token, payer, nonce, network)
        );
        
        let balance = balance_result?;
        let is_nonce_used = nonce_result?;
        
        debug!("⏱️ Pre-check completed in {}ms", start.elapsed().as_millis());
        
        // Check balance
        if balance < required {
            return Ok(PreCheckResult::failure(
                format!("Insufficient balance: {} < {}", balance, required)
            ));
        }
        
        // Check nonce
        if is_nonce_used {
            return Ok(PreCheckResult::failure(
                format!("Nonce {} has already been used", nonce_str)
            ));
        }
        
        Ok(PreCheckResult::success(balance.to_string(), true))
    }
    
    async fn execute(
        &self,
        payload: &UnifiedPayload,
        network: &str,
        token_address: &str,
        _recipient: &str,
    ) -> Result<ExecuteResult, StrategyError> {
        let start = Instant::now();
        
        // Get paymaster signer
        let signer = self.paymaster_pool.get_next_signer()
            .map_err(|e| StrategyError::PaymasterError(e.to_string()))?;
        
        info!("Using paymaster wallet: {}", signer.address());
        
        // Get RPC URL
        let rpc_url = self.config.get_rpc_url(network)
            .ok_or_else(|| StrategyError::NetworkError(format!("No RPC URL for network: {}", network)))?;
        
        // Create wallet
        let wallet = EthereumWallet::from(signer.clone());
        
        // Parse all parameters upfront
        let from: Address = payload.from.parse()
            .map_err(|_| StrategyError::InvalidPayload("Invalid from address".to_string()))?;
        let to: Address = payload.to.parse()
            .map_err(|_| StrategyError::InvalidPayload("Invalid to address".to_string()))?;
        let value: U256 = payload.value.parse()
            .map_err(|_| StrategyError::InvalidPayload("Invalid value".to_string()))?;
        let valid_after: U256 = payload.valid_after.as_ref().unwrap().parse()
            .map_err(|_| StrategyError::InvalidPayload("Invalid validAfter".to_string()))?;
        let valid_before: U256 = payload.valid_before.as_ref().unwrap().parse()
            .map_err(|_| StrategyError::InvalidPayload("Invalid validBefore".to_string()))?;
        
        let nonce = NonceUtils::to_fixed_bytes(payload.nonce.as_ref().unwrap())
            .map_err(|e| StrategyError::InvalidPayload(format!("Invalid nonce: {}", e)))?;
        
        let sig = SignatureComponents::from_hex(&payload.signature)
            .map_err(|e| StrategyError::InvalidPayload(format!("Invalid signature: {}", e)))?;
        
        let token: Address = token_address.parse()
            .map_err(|_| StrategyError::InvalidPayload("Invalid token address".to_string()))?;
        
        // Get gas limit from config
        let gas_limit = self.config.get_network(network)
            .map(|n| n.gas_limit)
            .unwrap_or(200000);
        
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
            let ws_result: Result<String, StrategyError> = async {
                let ws_connect = WsConnect::new(rpc_url.clone());
                let provider = timeout(
                    Duration::from_secs(10),
                    ProviderBuilder::new()
                        .with_recommended_fillers()
                        .wallet(wallet.clone())
                        .on_ws(ws_connect)
                ).await
                    .map_err(|_| StrategyError::NetworkError("WebSocket connection timeout".to_string()))?
                    .map_err(|e| StrategyError::NetworkError(format!("WebSocket connect failed: {}", e)))?;
                
                let contract = IERC3009::new(token, &provider);
                let tx = contract.transferWithAuthorization(
                    from, to, value, valid_after, valid_before, nonce,
                    sig.v, sig.r_bytes(), sig.s_bytes(),
                ).gas(gas_limit);
                
                let pending = tx.send().await
                    .map_err(|e| StrategyError::ExecutionError(format!("Transaction send failed: {}", e)))?;
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
                        .on_http(http_url.parse().map_err(|e| StrategyError::NetworkError(format!("Invalid URL: {}", e)))?);
                    
                    let contract = IERC3009::new(token, &provider);
                    let tx = contract.transferWithAuthorization(
                        from, to, value, valid_after, valid_before, nonce,
                        sig.v, sig.r_bytes(), sig.s_bytes(),
                    ).gas(gas_limit);
                    
                    let pending = tx.send().await
                        .map_err(|e| StrategyError::ExecutionError(format!("Transaction send failed: {}", e)))?;
                    format!("{:?}", pending.tx_hash())
                }
            }
        } else {
            // HTTP only
            let provider = ProviderBuilder::new()
                .with_recommended_fillers()
                .wallet(wallet.clone())
                .on_http(rpc_url.parse().map_err(|e| StrategyError::NetworkError(format!("Invalid URL: {}", e)))?);
            
            let contract = IERC3009::new(token, &provider);
            let tx = contract.transferWithAuthorization(
                from, to, value, valid_after, valid_before, nonce,
                sig.v, sig.r_bytes(), sig.s_bytes(),
            ).gas(gas_limit);
            
            let pending = tx.send().await
                .map_err(|e| StrategyError::ExecutionError(format!("Transaction send failed: {}", e)))?;
            format!("{:?}", pending.tx_hash())
        };
        
        info!("✅ Transaction sent via {}: {} ({}ms)", 
              if used_websocket { "WebSocket" } else { "HTTP" }, 
              tx_hash, 
              start.elapsed().as_millis());
        
        Ok(ExecuteResult::pending(tx_hash))
    }
    
    async fn is_nonce_used(
        &self,
        payer: &str,
        nonce: &str,
        network: &str,
        token_address: &str,
    ) -> Result<bool, StrategyError> {
        let payer_addr: Address = payer.parse()
            .map_err(|_| StrategyError::InvalidPayload("Invalid payer address".to_string()))?;
        let token: Address = token_address.parse()
            .map_err(|_| StrategyError::InvalidPayload("Invalid token address".to_string()))?;
        let nonce_bytes = NonceUtils::to_fixed_bytes(nonce)
            .map_err(|e| StrategyError::InvalidPayload(format!("Invalid nonce: {}", e)))?;
        
        self.get_authorization_state(token, payer_addr, nonce_bytes, network).await
    }
}
