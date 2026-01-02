//! ERC-2612 Transfer Strategy
//!
//! Implements permit + transferFrom for gasless token transfers.
//! 
//! ERC-2612 allows token holders to approve a spender via a signed message
//! (EIP-712 typed data), which is then executed with a transferFrom.
//! 
//! Key differences from ERC-3009:
//! - Uses permit() to approve spender, then transferFrom() to transfer
//! - Nonce is sequential (uint256), not random bytes32
//! - Has deadline instead of validAfter/validBefore
//! - Requires a forwarder contract to bundle permit + transfer
//!
//! Flow:
//! 1. User signs permit message (owner, spender, value, nonce, deadline)
//! 2. Facilitator calls forwarder.permitAndTransfer(permit_data, recipient, signature)
//! 3. Forwarder calls token.permit() then token.transferFrom()

use std::sync::Arc;
use std::time::{Instant, Duration};
use async_trait::async_trait;
use tracing::{info, debug, warn};
use alloy::primitives::{Address, U256, keccak256, B256};
use alloy::signers::k256::ecdsa::{RecoveryId, Signature as K256Signature, VerifyingKey};
use alloy::providers::{Provider, ProviderBuilder, WsConnect};
use alloy::network::EthereumWallet;
use alloy::sol;
use tokio::time::timeout;

use crate::config::external::{TransferType, ExternalConfig};
use crate::services::provider_pool::{ProviderPool, ProviderType};
use crate::services::paymaster_pool::PaymasterPool;
use super::{TransferStrategy, StrategyError, UnifiedPayload, PreCheckResult, ExecuteResult, SignatureComponents};

// ERC-2612 interface
sol! {
    #[sol(rpc)]
    interface IERC2612 {
        function permit(
            address owner,
            address spender,
            uint256 value,
            uint256 deadline,
            uint8 v,
            bytes32 r,
            bytes32 s
        ) external;
        
        function transferFrom(address from, address to, uint256 amount) external returns (bool);
        function balanceOf(address account) external view returns (uint256);
        function allowance(address owner, address spender) external view returns (uint256);
        function nonces(address owner) external view returns (uint256);
        function name() external view returns (string);
        function DOMAIN_SEPARATOR() external view returns (bytes32);
    }
    
    // Forwarder contract interface for ERC-2612
    #[sol(rpc)]
    interface IPermitForwarder {
        function permitAndTransfer(
            address token,
            address owner,
            address recipient,
            uint256 value,
            uint256 deadline,
            uint8 v,
            bytes32 r,
            bytes32 s
        ) external returns (bool);
        
        function isAuthorizedCaller(address caller) external view returns (bool);
    }
}

/// ERC-2612 transfer strategy
pub struct Erc2612Strategy {
    config: Arc<ExternalConfig>,
    provider_pool: Arc<ProviderPool>,
    paymaster_pool: Arc<PaymasterPool>,
}

impl Erc2612Strategy {
    /// Create a new ERC-2612 strategy
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
    
    /// Validate ERC-2612 specific fields
    fn validate_erc2612_fields(&self, payload: &UnifiedPayload) -> Result<(), StrategyError> {
        // Check required fields
        if payload.deadline.is_none() {
            return Err(StrategyError::InvalidPayload("deadline is required for ERC-2612".to_string()));
        }
        
        // Validate deadline
        let now = chrono::Utc::now().timestamp() as u64;
        let deadline: u64 = payload.deadline.as_ref().unwrap()
            .parse()
            .map_err(|_| StrategyError::InvalidPayload("Invalid deadline timestamp".to_string()))?;
        
        if now > deadline {
            return Err(StrategyError::InvalidPayload(
                format!("Permit expired. Current: {}, deadline: {}", now, deadline)
            ));
        }
        
        Ok(())
    }
    
    /// Get balance for an address
    async fn get_balance(&self, token: Address, owner: Address, network: &str) -> Result<U256, StrategyError> {
        let provider_arc = self.provider_pool.get_provider(network)
            .map_err(|e| StrategyError::ProviderError(e.to_string()))?;
        
        let balance = match provider_arc.as_ref() {
            ProviderType::Http(p) => {
                let contract = IERC2612::new(token, p);
                contract.balanceOf(owner)
                    .call()
                    .await
                    .map_err(|e| StrategyError::ProviderError(format!("Balance check failed: {}", e)))?
                    ._0
            }
            ProviderType::WebSocket(p) => {
                let contract = IERC2612::new(token, p);
                contract.balanceOf(owner)
                    .call()
                    .await
                    .map_err(|e| StrategyError::ProviderError(format!("Balance check failed: {}", e)))?
                    ._0
            }
        };
        
        Ok(balance)
    }
    
    /// Get current nonce for an address
    async fn get_nonce(&self, token: Address, owner: Address, network: &str) -> Result<U256, StrategyError> {
        let provider_arc = self.provider_pool.get_provider(network)
            .map_err(|e| StrategyError::ProviderError(e.to_string()))?;
        
        let nonce = match provider_arc.as_ref() {
            ProviderType::Http(p) => {
                let contract = IERC2612::new(token, p);
                contract.nonces(owner)
                    .call()
                    .await
                    .map_err(|e| StrategyError::ProviderError(format!("Nonce check failed: {}", e)))?
                    ._0
            }
            ProviderType::WebSocket(p) => {
                let contract = IERC2612::new(token, p);
                contract.nonces(owner)
                    .call()
                    .await
                    .map_err(|e| StrategyError::ProviderError(format!("Nonce check failed: {}", e)))?
                    ._0
            }
        };
        
        Ok(nonce)
    }
    
    /// Get forwarder address for a token
    fn get_forwarder(&self, network: &str, token_address: &str) -> Result<Address, StrategyError> {
        let token = self.config.get_token(network, token_address)
            .ok_or_else(|| StrategyError::UnsupportedToken(
                format!("Token {} not found on {}", token_address, network)
            ))?;
        
        let forwarder = token.forwarder_address.as_ref()
            .filter(|s| !s.is_empty())
            .ok_or_else(|| StrategyError::ExecutionError(
                format!("No forwarder contract configured for {} on {}", token.symbol, network)
            ))?;
        
        forwarder.parse()
            .map_err(|_| StrategyError::ExecutionError("Invalid forwarder address".to_string()))
    }
    
    /// Verify EIP-712 permit signature locally before submitting transaction
    /// This saves gas by catching invalid signatures early
    fn verify_eip712_signature(
        &self,
        payload: &UnifiedPayload,
        chain_id: u64,
        token_address: &str,
        token_name: &str,
        token_version: &str,
        spender: &Address,
        current_nonce: U256,
    ) -> Result<Address, StrategyError> {
        // EIP-712 type hashes (pre-computed)
        // keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)")
        let domain_type_hash: B256 = keccak256(
            b"EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
        );
        
        // keccak256("Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)")
        let permit_type_hash: B256 = keccak256(
            b"Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)"
        );
        
        // Parse addresses and values
        let owner: Address = payload.from.parse()
            .map_err(|_| StrategyError::SignatureError("Invalid owner address".to_string()))?;
        let value: U256 = payload.value.parse()
            .map_err(|_| StrategyError::SignatureError("Invalid value".to_string()))?;
        let deadline: U256 = payload.deadline.as_ref().unwrap().parse()
            .map_err(|_| StrategyError::SignatureError("Invalid deadline".to_string()))?;
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
        // structHash = keccak256(abi.encode(PERMIT_TYPE_HASH, owner, spender, value, nonce, deadline))
        let mut struct_data = Vec::with_capacity(192);
        struct_data.extend_from_slice(permit_type_hash.as_slice());
        struct_data.extend_from_slice(&[0u8; 12]); // padding for address
        struct_data.extend_from_slice(owner.as_slice());
        struct_data.extend_from_slice(&[0u8; 12]); // padding for address
        struct_data.extend_from_slice(spender.as_slice());
        struct_data.extend_from_slice(&value.to_be_bytes::<32>());
        struct_data.extend_from_slice(&current_nonce.to_be_bytes::<32>());
        struct_data.extend_from_slice(&deadline.to_be_bytes::<32>());
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
        
        // Verify recovered address matches claimed owner
        if recovered_address != owner {
            return Err(StrategyError::SignatureError(
                format!("Signature mismatch: recovered {} but expected {}", recovered_address, owner)
            ));
        }
        
        Ok(recovered_address)
    }
}

#[async_trait]
impl TransferStrategy for Erc2612Strategy {
    fn transfer_type(&self) -> TransferType {
        TransferType::Erc2612
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
        
        // ERC-2612 specific validations
        self.validate_erc2612_fields(payload)?;
        
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
        
        let (token_name, token_version, chain_id) = match (token_config.clone(), network_config) {
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
        
        // Get forwarder address (spender in the permit)
        let forwarder = self.get_forwarder(network, token_address)?;
        
        // Get current nonce for the owner
        let owner: Address = payload.from.parse()
            .map_err(|_| StrategyError::SignatureError("Invalid owner address".to_string()))?;
        let token: Address = token_address.parse()
            .map_err(|_| StrategyError::SignatureError("Invalid token address".to_string()))?;
        
        let current_nonce = self.get_nonce(token, owner, network).await?;
        
        // Verify signature locally before spending gas
        debug!("🔐 Verifying EIP-712 permit signature locally (chain_id={}, token={}, spender={})", 
            chain_id, token_name, forwarder);
        
        let signer = self.verify_eip712_signature(
            payload,
            chain_id,
            token_address,
            &token_name,
            &token_version,
            &forwarder,
            current_nonce,
        )?;
        
        debug!("✅ Local signature verification passed. Signer: {}", signer);
        
        Ok(signer.to_string())
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
        
        // Check forwarder is configured
        let _forwarder = self.get_forwarder(network, token_address)?;
        
        // Run balance and nonce checks in parallel
        let (balance_result, nonce_result) = tokio::join!(
            self.get_balance(token, payer, network),
            self.get_nonce(token, payer, network)
        );
        
        let balance = balance_result?;
        let current_nonce = nonce_result?;
        
        debug!("⏱️ Pre-check completed in {}ms", start.elapsed().as_millis());
        
        // Check balance
        if balance < required {
            return Ok(PreCheckResult::failure(
                format!("Insufficient balance: {} < {}", balance, required)
            ));
        }
        
        // For ERC-2612, check if the provided nonce matches current nonce
        if let Some(provided_nonce) = payload.permit_nonce {
            let current_nonce_u64: u64 = current_nonce.try_into()
                .unwrap_or(u64::MAX);
            
            if provided_nonce != current_nonce_u64 {
                return Ok(PreCheckResult::failure(
                    format!("Nonce mismatch: provided {} != current {}", provided_nonce, current_nonce_u64)
                ));
            }
        }
        
        let current_nonce_u64: u64 = current_nonce.try_into().unwrap_or(0);
        Ok(PreCheckResult::success(balance.to_string(), true).with_nonce(current_nonce_u64))
    }
    
    async fn execute(
        &self,
        payload: &UnifiedPayload,
        network: &str,
        token_address: &str,
        recipient: &str,
    ) -> Result<ExecuteResult, StrategyError> {
        let start = Instant::now();
        
        // Get forwarder address
        let forwarder = self.get_forwarder(network, token_address)?;
        
        // Get paymaster signer
        let signer = self.paymaster_pool.get_next_signer()
            .map_err(|e| StrategyError::PaymasterError(e.to_string()))?;
        
        info!("Using paymaster wallet: {}", signer.address());
        info!("Using forwarder contract: {}", forwarder);
        
        // Get RPC URL
        let rpc_url = self.config.get_rpc_url(network)
            .ok_or_else(|| StrategyError::NetworkError(format!("No RPC URL for network: {}", network)))?;
        
        // Parse parameters
        let owner: Address = payload.from.parse()
            .map_err(|_| StrategyError::InvalidPayload("Invalid from address".to_string()))?;
        let recipient_addr: Address = recipient.parse()
            .map_err(|_| StrategyError::InvalidPayload("Invalid recipient address".to_string()))?;
        let value: U256 = payload.value.parse()
            .map_err(|_| StrategyError::InvalidPayload("Invalid value".to_string()))?;
        let deadline: U256 = payload.deadline.as_ref().unwrap().parse()
            .map_err(|_| StrategyError::InvalidPayload("Invalid deadline".to_string()))?;
        
        let sig = SignatureComponents::from_hex(&payload.signature)
            .map_err(|e| StrategyError::InvalidPayload(format!("Invalid signature: {}", e)))?;
        
        let token: Address = token_address.parse()
            .map_err(|_| StrategyError::InvalidPayload("Invalid token address".to_string()))?;
        
        // Get gas limit from config
        let gas_limit = self.config.get_network(network)
            .map(|n| n.gas_limit)
            .unwrap_or(200000);
        
        // Build wallet
        let wallet = EthereumWallet::from(signer.clone());
        
        info!("📤 Sending permitAndTransfer via forwarder...");
        info!("   Token: {}", token);
        info!("   Owner: {}", owner);
        info!("   Recipient: {}", recipient_addr);
        info!("   Value: {}", value);
        info!("   Deadline: {}", deadline);
        
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
                
                let contract = IPermitForwarder::new(forwarder, &provider);
                let tx = contract.permitAndTransfer(
                    token, owner, recipient_addr, value, deadline,
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
                    
                    let contract = IPermitForwarder::new(forwarder, &provider);
                    let tx = contract.permitAndTransfer(
                        token, owner, recipient_addr, value, deadline,
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
            
            let contract = IPermitForwarder::new(forwarder, &provider);
            let tx = contract.permitAndTransfer(
                token, owner, recipient_addr, value, deadline,
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
        // For ERC-2612, we check if the nonce has already been used
        // by comparing to the current nonce
        let payer_addr: Address = payer.parse()
            .map_err(|_| StrategyError::InvalidPayload("Invalid payer address".to_string()))?;
        let token: Address = token_address.parse()
            .map_err(|_| StrategyError::InvalidPayload("Invalid token address".to_string()))?;
        
        let provided_nonce: u64 = nonce.parse()
            .map_err(|_| StrategyError::InvalidPayload("Invalid nonce (must be numeric for ERC-2612)".to_string()))?;
        
        let current_nonce = self.get_nonce(token, payer_addr, network).await?;
        let current_nonce_u64: u64 = current_nonce.try_into().unwrap_or(0);
        
        // If provided nonce is less than current nonce, it's been used
        Ok(provided_nonce < current_nonce_u64)
    }
}
