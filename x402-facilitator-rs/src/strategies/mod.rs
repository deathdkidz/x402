//! Transfer Strategy Module
//!
//! Implements the Strategy pattern for different token transfer mechanisms.
//! Supports ERC-3009, ERC-2612, and future protocols like Solana SPL.

pub mod erc3009;
pub mod erc2612;
pub mod types;

use std::sync::Arc;
use async_trait::async_trait;
use tracing::{info, debug};

use crate::config::external::{TransferType, ExternalConfig};
use crate::services::provider_pool::ProviderPool;
use crate::services::paymaster_pool::PaymasterPool;

pub use types::*;
pub use erc3009::Erc3009Strategy;
pub use erc2612::Erc2612Strategy;

/// Transfer strategy trait - all transfer mechanisms implement this
#[async_trait]
pub trait TransferStrategy: Send + Sync {
    /// Get the transfer type this strategy handles
    fn transfer_type(&self) -> TransferType;
    
    /// Validate the authorization payload
    fn validate_payload(&self, payload: &UnifiedPayload) -> Result<(), StrategyError>;
    
    /// Verify the signature is valid
    async fn verify_signature(
        &self,
        payload: &UnifiedPayload,
        network: &str,
        token_address: &str,
    ) -> Result<String, StrategyError>;
    
    /// Check if the authorization can be executed (balance, nonce, etc.)
    async fn pre_check(
        &self,
        payload: &UnifiedPayload,
        network: &str,
        token_address: &str,
    ) -> Result<PreCheckResult, StrategyError>;
    
    /// Execute the transfer
    async fn execute(
        &self,
        payload: &UnifiedPayload,
        network: &str,
        token_address: &str,
        recipient: &str,
    ) -> Result<ExecuteResult, StrategyError>;
    
    /// Check if a nonce/authorization has been used
    async fn is_nonce_used(
        &self,
        payer: &str,
        nonce: &str,
        network: &str,
        token_address: &str,
    ) -> Result<bool, StrategyError>;
}

/// Strategy factory - creates the appropriate strategy based on transfer type
pub struct StrategyFactory {
    config: Arc<ExternalConfig>,
    provider_pool: Arc<ProviderPool>,
    paymaster_pool: Arc<PaymasterPool>,
    erc3009: Arc<Erc3009Strategy>,
    erc2612: Arc<Erc2612Strategy>,
}

impl StrategyFactory {
    /// Create a new strategy factory
    pub fn new(
        config: Arc<ExternalConfig>,
        provider_pool: Arc<ProviderPool>,
        paymaster_pool: Arc<PaymasterPool>,
    ) -> Self {
        let erc3009 = Arc::new(Erc3009Strategy::new(
            config.clone(),
            provider_pool.clone(),
            paymaster_pool.clone(),
        ));
        
        let erc2612 = Arc::new(Erc2612Strategy::new(
            config.clone(),
            provider_pool.clone(),
            paymaster_pool.clone(),
        ));
        
        info!("✅ Strategy factory initialized with ERC-3009 and ERC-2612 support");
        
        Self {
            config,
            provider_pool,
            paymaster_pool,
            erc3009,
            erc2612,
        }
    }
    
    /// Get the appropriate strategy for a network/token combination
    pub fn get_strategy(&self, network: &str, token_address: &str) -> Result<Arc<dyn TransferStrategy>, StrategyError> {
        let token = self.config.get_token(network, token_address)
            .ok_or_else(|| StrategyError::UnsupportedToken(
                format!("Token {} not found on network {}", token_address, network)
            ))?;
        
        debug!("Getting strategy for {} on {} (type: {:?})", token.symbol, network, token.transfer_type);
        
        match token.transfer_type {
            TransferType::Erc3009 => Ok(self.erc3009.clone()),
            TransferType::Erc2612 => Ok(self.erc2612.clone()),
            TransferType::SplToken => Err(StrategyError::UnsupportedTransferType(
                "Solana SPL Token support not yet implemented".to_string()
            )),
            TransferType::Native => Err(StrategyError::UnsupportedTransferType(
                "Native token transfers not yet implemented".to_string()
            )),
        }
    }
    
    /// Get strategy by transfer type directly
    pub fn get_strategy_by_type(&self, transfer_type: &TransferType) -> Result<Arc<dyn TransferStrategy>, StrategyError> {
        match transfer_type {
            TransferType::Erc3009 => Ok(self.erc3009.clone()),
            TransferType::Erc2612 => Ok(self.erc2612.clone()),
            TransferType::SplToken => Err(StrategyError::UnsupportedTransferType(
                "Solana SPL Token support not yet implemented".to_string()
            )),
            TransferType::Native => Err(StrategyError::UnsupportedTransferType(
                "Native token transfers not yet implemented".to_string()
            )),
        }
    }
    
    /// Check if a transfer type is supported
    pub fn is_supported(&self, transfer_type: &TransferType) -> bool {
        matches!(transfer_type, TransferType::Erc3009 | TransferType::Erc2612)
    }
}

/// Strategy errors
#[derive(Debug, thiserror::Error)]
pub enum StrategyError {
    #[error("Unsupported token: {0}")]
    UnsupportedToken(String),
    
    #[error("Unsupported transfer type: {0}")]
    UnsupportedTransferType(String),
    
    #[error("Invalid payload: {0}")]
    InvalidPayload(String),
    
    #[error("Signature verification failed: {0}")]
    SignatureError(String),
    
    #[error("Pre-check failed: {0}")]
    PreCheckError(String),
    
    #[error("Execution failed: {0}")]
    ExecutionError(String),
    
    #[error("Provider error: {0}")]
    ProviderError(String),
    
    #[error("Paymaster error: {0}")]
    PaymasterError(String),
    
    #[error("Network error: {0}")]
    NetworkError(String),
}
