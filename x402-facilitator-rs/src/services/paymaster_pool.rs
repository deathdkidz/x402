//! Paymaster Pool
//! 
//! Manages paymaster wallets for paying gas fees on settlements.
//! Implements round-robin selection for load balancing.

#![allow(dead_code)]

use std::sync::atomic::{AtomicUsize, Ordering};
use parking_lot::RwLock;
use tracing::{info, warn, error};
use alloy::signers::local::PrivateKeySigner;
use alloy::primitives::Address;

use crate::config::Config;

/// Paymaster wallet pool for settlement transactions
pub struct PaymasterPool {
    /// Base signers (without provider connection)
    signers: RwLock<Vec<PrivateKeySigner>>,
    /// Wallet addresses for quick lookup
    addresses: RwLock<Vec<Address>>,
    /// Round-robin index
    current_index: AtomicUsize,
    /// Initialization flag
    is_initialized: RwLock<bool>,
}

impl PaymasterPool {
    /// Create a new paymaster pool
    pub fn new() -> Self {
        Self {
            signers: RwLock::new(Vec::new()),
            addresses: RwLock::new(Vec::new()),
            current_index: AtomicUsize::new(0),
            is_initialized: RwLock::new(false),
        }
    }

    /// Initialize paymaster wallets from configuration
    pub fn initialize(&self, config: &Config) -> Result<(), PaymasterPoolError> {
        if *self.is_initialized.read() {
            warn!("Paymaster pool already initialized");
            return Ok(());
        }

        let private_keys = &config.paymaster_private_keys;
        
        if private_keys.is_empty() {
            return Err(PaymasterPoolError::NoKeysConfigured);
        }

        let mut signers = Vec::new();
        let mut addresses = Vec::new();
        let mut address_set = std::collections::HashSet::new();

        for (i, key) in private_keys.iter().enumerate() {
            // Remove 0x prefix if present
            let key_hex = key.strip_prefix("0x").unwrap_or(key);
            
            match key_hex.parse::<PrivateKeySigner>() {
                Ok(signer) => {
                    let address = signer.address();
                    
                    // Check for duplicates
                    if address_set.contains(&address) {
                        warn!("⚠️ Duplicate paymaster wallet address detected: {} (skipping)", address);
                        continue;
                    }
                    
                    address_set.insert(address);
                    addresses.push(address);
                    signers.push(signer);
                    
                    info!("✅ Loaded paymaster wallet {}: {}", i + 1, address);
                }
                Err(e) => {
                    error!("Failed to load paymaster wallet {}: {}", i + 1, e);
                    return Err(PaymasterPoolError::InvalidPrivateKey(i, e.to_string()));
                }
            }
        }

        if signers.is_empty() {
            return Err(PaymasterPoolError::NoValidKeys);
        }

        *self.signers.write() = signers;
        *self.addresses.write() = addresses.clone();
        *self.is_initialized.write() = true;

        let wallet_count = addresses.len();
        info!("📦 Paymaster pool initialized: {} wallet(s) ready for parallel settlement", wallet_count);
        
        if wallet_count > 1 {
            info!("⚡ Multi-wallet mode: Can process {} settlements in parallel", wallet_count);
        } else {
            info!("⚠️ Single-wallet mode: Settlements will be sequential. Add more wallets for parallelization");
        }

        Ok(())
    }

    /// Get the next signer using round-robin selection
    pub fn get_next_signer(&self) -> Result<PrivateKeySigner, PaymasterPoolError> {
        if !*self.is_initialized.read() {
            return Err(PaymasterPoolError::NotInitialized);
        }

        let signers = self.signers.read();
        if signers.is_empty() {
            return Err(PaymasterPoolError::NoValidKeys);
        }

        let index = self.current_index.fetch_add(1, Ordering::SeqCst) % signers.len();
        Ok(signers[index].clone())
    }

    /// Get a signer by address
    pub fn get_signer_by_address(&self, address: &Address) -> Option<PrivateKeySigner> {
        let signers = self.signers.read();
        let addresses = self.addresses.read();
        
        addresses.iter()
            .position(|a| a == address)
            .map(|i| signers[i].clone())
    }

    /// Get all wallet addresses
    pub fn get_all_addresses(&self) -> Vec<Address> {
        self.addresses.read().clone()
    }

    /// Get pool statistics
    pub fn get_stats(&self) -> PaymasterPoolStats {
        let addresses = self.addresses.read();
        PaymasterPoolStats {
            total: addresses.len(),
            addresses: addresses.iter().map(|a| format!("{}", a)).collect(),
            current_index: self.current_index.load(Ordering::SeqCst),
        }
    }

    /// Check if pool is ready
    pub fn is_ready(&self) -> bool {
        *self.is_initialized.read() && !self.signers.read().is_empty()
    }
}

impl Default for PaymasterPool {
    fn default() -> Self {
        Self::new()
    }
}

/// Paymaster pool statistics
#[derive(Debug, Clone)]
pub struct PaymasterPoolStats {
    pub total: usize,
    pub addresses: Vec<String>,
    pub current_index: usize,
}

/// Paymaster pool errors
#[derive(Debug, thiserror::Error)]
pub enum PaymasterPoolError {
    #[error("No paymaster private keys configured")]
    NoKeysConfigured,
    
    #[error("Invalid private key at index {0}: {1}")]
    InvalidPrivateKey(usize, String),
    
    #[error("No valid paymaster keys loaded")]
    NoValidKeys,
    
    #[error("Paymaster pool not initialized")]
    NotInitialized,
}
