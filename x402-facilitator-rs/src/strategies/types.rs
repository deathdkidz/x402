//! Transfer Strategy Types
//!
//! Unified types for all transfer strategies

use serde::{Deserialize, Serialize};

/// Unified authorization payload that works with all transfer types
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UnifiedPayload {
    /// Payer/owner address
    pub from: String,
    
    /// Recipient address
    pub to: String,
    
    /// Transfer amount in smallest units
    pub value: String,
    
    /// Signature (hex string with 0x prefix)
    pub signature: String,
    
    // === ERC-3009 specific fields ===
    
    /// Valid after timestamp (ERC-3009)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub valid_after: Option<String>,
    
    /// Valid before timestamp (ERC-3009)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub valid_before: Option<String>,
    
    /// Nonce as bytes32 hex string (ERC-3009)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub nonce: Option<String>,
    
    // === ERC-2612 specific fields ===
    
    /// Deadline timestamp (ERC-2612)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub deadline: Option<String>,
    
    /// Sequential nonce (ERC-2612) - if not provided, will be fetched from chain
    #[serde(skip_serializing_if = "Option::is_none")]
    pub permit_nonce: Option<u64>,
    
    /// Spender address for permit (ERC-2612) - usually the forwarder contract
    #[serde(skip_serializing_if = "Option::is_none")]
    pub spender: Option<String>,
    
    // === Solana specific fields (future) ===
    
    /// Token mint address (Solana)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mint: Option<String>,
    
    // === Common optional fields ===
    
    /// Extra data (for future use)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub extra: Option<serde_json::Value>,
}

impl UnifiedPayload {
    /// Create an ERC-3009 payload
    pub fn erc3009(
        from: String,
        to: String,
        value: String,
        valid_after: String,
        valid_before: String,
        nonce: String,
        signature: String,
    ) -> Self {
        Self {
            from,
            to,
            value,
            signature,
            valid_after: Some(valid_after),
            valid_before: Some(valid_before),
            nonce: Some(nonce),
            deadline: None,
            permit_nonce: None,
            spender: None,
            mint: None,
            extra: None,
        }
    }
    
    /// Create an ERC-2612 payload
    pub fn erc2612(
        from: String,
        to: String,
        value: String,
        deadline: String,
        spender: String,
        signature: String,
        permit_nonce: Option<u64>,
    ) -> Self {
        Self {
            from,
            to,
            value,
            signature,
            valid_after: None,
            valid_before: None,
            nonce: None,
            deadline: Some(deadline),
            permit_nonce,
            spender: Some(spender),
            mint: None,
            extra: None,
        }
    }
    
    /// Get the payer address (normalized to lowercase)
    pub fn payer(&self) -> String {
        self.from.to_lowercase()
    }
    
    /// Get the recipient address (normalized to lowercase)
    pub fn recipient(&self) -> String {
        self.to.to_lowercase()
    }
}

/// Pre-check result
#[derive(Debug, Clone)]
pub struct PreCheckResult {
    /// Whether all pre-checks passed
    pub success: bool,
    
    /// Payer's current balance
    pub balance: String,
    
    /// Whether nonce is available (not used)
    pub nonce_available: bool,
    
    /// Current nonce value (for ERC-2612)
    pub current_nonce: Option<u64>,
    
    /// Any warnings (non-fatal issues)
    pub warnings: Vec<String>,
    
    /// Error message if failed
    pub error: Option<String>,
}

impl PreCheckResult {
    /// Create a successful pre-check result
    pub fn success(balance: String, nonce_available: bool) -> Self {
        Self {
            success: true,
            balance,
            nonce_available,
            current_nonce: None,
            warnings: Vec::new(),
            error: None,
        }
    }
    
    /// Create a failed pre-check result
    pub fn failure(error: String) -> Self {
        Self {
            success: false,
            balance: "0".to_string(),
            nonce_available: false,
            current_nonce: None,
            warnings: Vec::new(),
            error: Some(error),
        }
    }
    
    /// Add a warning
    pub fn with_warning(mut self, warning: String) -> Self {
        self.warnings.push(warning);
        self
    }
    
    /// Set current nonce
    pub fn with_nonce(mut self, nonce: u64) -> Self {
        self.current_nonce = Some(nonce);
        self
    }
}

/// Execute result
#[derive(Debug, Clone)]
pub struct ExecuteResult {
    /// Whether execution was successful
    pub success: bool,
    
    /// Transaction hash (if submitted)
    pub tx_hash: Option<String>,
    
    /// Gas used (if available)
    pub gas_used: Option<u64>,
    
    /// Effective gas price in wei (if available)
    pub gas_price: Option<u128>,
    
    /// Error message if failed
    pub error: Option<String>,
    
    /// Whether transaction is pending confirmation
    pub pending: bool,
}

impl ExecuteResult {
    /// Create a successful execution result
    pub fn success(tx_hash: String) -> Self {
        Self {
            success: true,
            tx_hash: Some(tx_hash),
            gas_used: None,
            gas_price: None,
            error: None,
            pending: false,
        }
    }
    
    /// Create a pending execution result
    pub fn pending(tx_hash: String) -> Self {
        Self {
            success: true,
            tx_hash: Some(tx_hash),
            gas_used: None,
            gas_price: None,
            error: None,
            pending: true,
        }
    }
    
    /// Create a failed execution result
    pub fn failure(error: String) -> Self {
        Self {
            success: false,
            tx_hash: None,
            gas_used: None,
            gas_price: None,
            error: Some(error),
            pending: false,
        }
    }
    
    /// Set gas info
    pub fn with_gas(mut self, gas_used: u64, gas_price: u128) -> Self {
        self.gas_used = Some(gas_used);
        self.gas_price = Some(gas_price);
        self
    }
}

/// EIP-712 domain for signature verification
#[derive(Debug, Clone)]
pub struct Eip712Domain {
    pub name: String,
    pub version: String,
    pub chain_id: u64,
    pub verifying_contract: String,
}

/// Signature components
#[derive(Debug, Clone)]
pub struct SignatureComponents {
    pub v: u8,
    pub r: [u8; 32],
    pub s: [u8; 32],
}

impl SignatureComponents {
    /// Parse from hex signature string
    pub fn from_hex(signature: &str) -> Result<Self, String> {
        let sig_hex = signature.strip_prefix("0x").unwrap_or(signature);
        let sig_bytes = hex::decode(sig_hex)
            .map_err(|_| "Invalid signature hex")?;
        
        if sig_bytes.len() != 65 {
            return Err(format!("Invalid signature length: {} (expected 65)", sig_bytes.len()));
        }
        
        let mut r = [0u8; 32];
        let mut s = [0u8; 32];
        r.copy_from_slice(&sig_bytes[0..32]);
        s.copy_from_slice(&sig_bytes[32..64]);
        
        let v = sig_bytes[64];
        // Normalize v value
        let v_normalized = if v >= 27 { v } else { v + 27 };
        
        Ok(Self { v: v_normalized, r, s })
    }
    
    /// Convert to alloy FixedBytes
    pub fn r_bytes(&self) -> alloy::primitives::FixedBytes<32> {
        alloy::primitives::FixedBytes::from(self.r)
    }
    
    /// Convert to alloy FixedBytes
    pub fn s_bytes(&self) -> alloy::primitives::FixedBytes<32> {
        alloy::primitives::FixedBytes::from(self.s)
    }
}

/// Nonce utilities
pub struct NonceUtils;

impl NonceUtils {
    /// Parse bytes32 nonce from hex string
    pub fn parse_bytes32(nonce: &str) -> Result<[u8; 32], String> {
        let nonce_hex = nonce.strip_prefix("0x").unwrap_or(nonce);
        let nonce_bytes = hex::decode(nonce_hex)
            .map_err(|_| "Invalid nonce hex")?;
        
        let mut nonce_arr = [0u8; 32];
        let start = 32 - nonce_bytes.len().min(32);
        nonce_arr[start..].copy_from_slice(&nonce_bytes[..nonce_bytes.len().min(32)]);
        
        Ok(nonce_arr)
    }
    
    /// Convert to alloy FixedBytes<32>
    pub fn to_fixed_bytes(nonce: &str) -> Result<alloy::primitives::FixedBytes<32>, String> {
        let arr = Self::parse_bytes32(nonce)?;
        Ok(alloy::primitives::FixedBytes::from(arr))
    }
}
