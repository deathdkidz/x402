//! x402 Protocol Types
//! 
//! Core data structures for payment verification and settlement

#![allow(dead_code)]

use serde::{Deserialize, Serialize};
use validator::Validate;
use once_cell::sync::Lazy;
use regex::Regex;

// Regex patterns for validation
pub static ETH_ADDRESS_REGEX: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"^0x[a-fA-F0-9]{40}$").unwrap()
});

pub static HEX_STRING_REGEX: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"^0x[a-fA-F0-9]+$").unwrap()
});

pub static NUMERIC_STRING_REGEX: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"^\d+$").unwrap()
});

/// Custom validator for Ethereum addresses
fn validate_eth_address(addr: &str) -> Result<(), validator::ValidationError> {
    if !ETH_ADDRESS_REGEX.is_match(addr) {
        let mut error = validator::ValidationError::new("invalid_eth_address");
        error.message = Some("must be a valid Ethereum address (0x...)".into());
        return Err(error);
    }
    Ok(())
}

/// Custom validator for hex strings
fn validate_hex_string(hex: &str) -> Result<(), validator::ValidationError> {
    if !HEX_STRING_REGEX.is_match(hex) {
        let mut error = validator::ValidationError::new("invalid_hex_string");
        error.message = Some("must be a valid hex string (0x...)".into());
        return Err(error);
    }
    Ok(())
}

/// Custom validator for numeric strings
fn validate_numeric_string(num: &str) -> Result<(), validator::ValidationError> {
    if !NUMERIC_STRING_REGEX.is_match(num) {
        let mut error = validator::ValidationError::new("invalid_numeric_string");
        error.message = Some("must be a numeric string".into());
        return Err(error);
    }
    Ok(())
}

/// Custom validator for scheme field
fn validate_scheme(scheme: &str) -> Result<(), validator::ValidationError> {
    if scheme != "exact" {
        let mut error = validator::ValidationError::new("invalid_scheme");
        error.message = Some("scheme must be \"exact\" (only exact amount matching is currently supported)".into());
        return Err(error);
    }
    Ok(())
}

/// Payment requirements from merchant
#[derive(Debug, Clone, Serialize, Deserialize, Validate)]
#[serde(rename_all = "camelCase")]
pub struct PaymentRequirements {
    /// Payment scheme (currently only "exact" is supported)
    #[validate(custom(function = "validate_scheme"))]
    pub scheme: String,
    
    /// Network name (e.g., "Base", "Base Sepolia")
    #[validate(length(min = 1, message = "network cannot be empty"))]
    pub network: String,
    
    /// Token contract address
    #[validate(custom(function = "validate_eth_address"))]
    pub asset: String,
    
    /// Merchant address to receive payment
    #[validate(custom(function = "validate_eth_address"))]
    pub pay_to: String,
    
    /// Maximum amount required in smallest token units
    #[validate(custom(function = "validate_numeric_string"))]
    pub max_amount_required: String,
    
    /// Resource identifier being paid for
    pub resource: String,
    
    /// Human-readable description
    pub description: String,
    
    /// MIME type of the resource
    pub mime_type: String,
    
    /// Maximum timeout in seconds
    #[validate(range(min = 1, message = "maxTimeoutSeconds must be positive"))]
    pub max_timeout_seconds: u64,
    
    /// Optional output schema
    #[serde(skip_serializing_if = "Option::is_none")]
    pub output_schema: Option<serde_json::Value>,
    
    /// Optional extra data
    #[serde(skip_serializing_if = "Option::is_none")]
    pub extra: Option<serde_json::Value>,
}

/// EIP-3009 authorization data
#[derive(Debug, Clone, Serialize, Deserialize, Validate)]
#[serde(rename_all = "camelCase")]
pub struct Eip3009Authorization {
    /// Payer address (token owner)
    #[validate(custom(function = "validate_eth_address"))]
    pub from: String,
    
    /// Recipient address
    #[validate(custom(function = "validate_eth_address"))]
    pub to: String,
    
    /// Transfer amount in smallest token units
    #[validate(custom(function = "validate_numeric_string"))]
    pub value: String,
    
    /// Unix timestamp after which transfer is valid
    #[validate(custom(function = "validate_numeric_string"))]
    pub valid_after: String,
    
    /// Unix timestamp before which transfer is valid
    #[validate(custom(function = "validate_numeric_string"))]
    pub valid_before: String,
    
    /// Unique nonce (hex string)
    #[validate(custom(function = "validate_hex_string"))]
    pub nonce: String,
    
    /// Optional extra data
    #[serde(skip_serializing_if = "Option::is_none")]
    pub extra: Option<serde_json::Value>,
}

/// Payment payload containing authorization and signature
#[derive(Debug, Clone, Serialize, Deserialize, Validate)]
#[serde(rename_all = "camelCase")]
pub struct PaymentPayload {
    /// EIP-3009 authorization data
    #[validate(nested)]
    pub authorization: Eip3009Authorization,
    
    /// EIP-712 signature (hex string)
    #[validate(custom(function = "validate_hex_string"))]
    pub signature: String,
}

/// Verification request body
#[derive(Debug, Clone, Serialize, Deserialize, Validate)]
#[serde(rename_all = "camelCase")]
pub struct VerifyRequest {
    /// x402 protocol version (must be 1)
    #[validate(range(min = 1, max = 1, message = "x402Version must be 1"))]
    pub x402_version: u32,
    
    /// Payment payload
    #[validate(nested)]
    pub payment_payload: PaymentPayload,
    
    /// Payment requirements
    #[validate(nested)]
    pub payment_requirements: PaymentRequirements,
}

/// Settlement request body
#[derive(Debug, Clone, Serialize, Deserialize, Validate)]
#[serde(rename_all = "camelCase")]
pub struct SettleRequest {
    /// x402 protocol version (must be 1)
    #[validate(range(min = 1, max = 1, message = "x402Version must be 1"))]
    pub x402_version: u32,
    
    /// Payment payload
    #[validate(nested)]
    pub payment_payload: PaymentPayload,
    
    /// Payment requirements
    #[validate(nested)]
    pub payment_requirements: PaymentRequirements,
}

/// Verification response
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VerifyResponse {
    /// Whether the payment is valid
    pub is_valid: bool,
    
    /// Python compatibility field
    #[serde(rename = "is_valid")]
    pub is_valid_snake: bool,
    
    /// Payer address (if valid)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub payer: Option<String>,
    
    /// Reason for invalidity
    #[serde(skip_serializing_if = "Option::is_none")]
    pub invalid_reason: Option<String>,
    
    /// Python compatibility field
    #[serde(rename = "invalid_reason", skip_serializing_if = "Option::is_none")]
    pub invalid_reason_snake: Option<String>,
}

impl VerifyResponse {
    pub fn valid(payer: String) -> Self {
        Self {
            is_valid: true,
            is_valid_snake: true,
            payer: Some(payer),
            invalid_reason: None,
            invalid_reason_snake: None,
        }
    }

    pub fn invalid(reason: String) -> Self {
        Self {
            is_valid: false,
            is_valid_snake: false,
            payer: None,
            invalid_reason: Some(reason.clone()),
            invalid_reason_snake: Some(reason),
        }
    }
}

/// Settlement status
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SettlementStatus {
    Pending,
    Completed,
    Failed,
    Preconfirmed,
}

impl std::fmt::Display for SettlementStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Pending => write!(f, "pending"),
            Self::Completed => write!(f, "completed"),
            Self::Failed => write!(f, "failed"),
            Self::Preconfirmed => write!(f, "preconfirmed"),
        }
    }
}

/// Settlement response
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SettleResponse {
    /// Whether settlement was successful
    pub success: bool,
    
    /// Transaction hash
    #[serde(skip_serializing_if = "Option::is_none")]
    pub transaction: Option<String>,
    
    /// Network where transaction was submitted
    pub network: String,
    
    /// Payer address
    #[serde(skip_serializing_if = "Option::is_none")]
    pub payer: Option<String>,
    
    /// Error reason if failed
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error_reason: Option<String>,
    
    /// Transaction hash (duplicate for compatibility)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub transaction_hash: Option<String>,
    
    /// Current transaction status
    #[serde(skip_serializing_if = "Option::is_none")]
    pub transaction_status: Option<String>,
    
    /// Whether result was cached
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cached: Option<bool>,
    
    /// Settlement status
    #[serde(skip_serializing_if = "Option::is_none")]
    pub status: Option<SettlementStatus>,
    
    /// Additional message
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
}

impl SettleResponse {
    pub fn success(network: String, payer: String, tx_hash: String, status: SettlementStatus) -> Self {
        Self {
            success: true,
            transaction: Some(tx_hash.clone()),
            network,
            payer: Some(payer),
            error_reason: None,
            transaction_hash: Some(tx_hash),
            transaction_status: Some(status.to_string()),
            cached: None,
            status: Some(status),
            message: None,
        }
    }

    pub fn failure(network: String, reason: String) -> Self {
        Self {
            success: false,
            transaction: None,
            network,
            payer: None,
            error_reason: Some(reason),
            transaction_hash: None,
            transaction_status: None,
            cached: None,
            status: Some(SettlementStatus::Failed),
            message: None,
        }
    }

    pub fn cached(network: String, payer: String, tx_hash: String, status: SettlementStatus) -> Self {
        Self {
            success: true,
            transaction: Some(tx_hash.clone()),
            network,
            payer: Some(payer),
            error_reason: None,
            transaction_hash: Some(tx_hash),
            transaction_status: Some(status.to_string()),
            cached: Some(true),
            status: Some(status),
            message: Some("Transaction already processed".to_string()),
        }
    }
}

/// Health check response
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HealthResponse {
    pub status: String,
    pub service: String,
    pub timestamp: u64,
    pub uptime: f64,
}

/// Network info for /networks endpoint
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NetworkInfo {
    pub network: String,
    pub chain_id: u64,
    pub tokens: Vec<TokenInfo>,
}

/// Token info for /networks endpoint
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TokenInfo {
    pub symbol: String,
    pub name: String,
    pub address: String,
    pub decimals: u8,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub eip712: Option<Eip712Info>,
}

/// EIP-712 info for /networks endpoint
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Eip712Info {
    pub name: String,
    pub version: String,
    pub verifying_contract: String,
}

/// Networks response
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NetworksResponse {
    pub success: bool,
    pub mainnet: Vec<NetworkInfo>,
    pub testnet: Vec<NetworkInfo>,
}

/// Service info response (root endpoint)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServiceInfoResponse {
    pub name: String,
    pub description: String,
    pub endpoints: EndpointInfo,
    pub mainnet_networks: Vec<String>,
    pub testnet_networks: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EndpointInfo {
    pub health: String,
    pub networks: String,
    pub verify: String,
    pub settle: String,
}

/// Merchant account status
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum MerchantStatus {
    Pending,
    Active,
    Suspended,
    Banned,
}

impl Default for MerchantStatus {
    fn default() -> Self {
        MerchantStatus::Active
    }
}

impl std::fmt::Display for MerchantStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            MerchantStatus::Pending => write!(f, "pending"),
            MerchantStatus::Active => write!(f, "active"),
            MerchantStatus::Suspended => write!(f, "suspended"),
            MerchantStatus::Banned => write!(f, "banned"),
        }
    }
}

/// Merchant data from database
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Merchant {
    pub id: i64,
    pub auth_address: String,
    pub business_name: Option<String>,
    #[serde(skip_serializing, default)]
    pub api_key: String,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
    pub is_active: bool,
    pub webhook_url: Option<String>,
    #[serde(skip_serializing, default)]
    pub webhook_secret: Option<String>,
    pub webhook_events: String,
    pub email: Option<String>,
    pub profile_image_url: Option<String>,
    // Credit system fields
    pub credit_balance: i32,
    pub lifetime_credits_purchased: i32,
    pub lifetime_credits_used: i32,
    pub status: String,
    pub last_active_at: Option<chrono::DateTime<chrono::Utc>>,
}

impl Merchant {
    /// Check if merchant has sufficient credits for a settlement
    pub fn has_credits(&self, amount: i32) -> bool {
        self.credit_balance >= amount
    }
    
    /// Check if merchant account is active
    pub fn is_account_active(&self) -> bool {
        self.is_active && self.status == "active"
    }
}

/// Transaction record from database
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Transaction {
    pub id: i64,
    pub merchant_id: Option<i64>,
    pub payer_address: String,
    pub recipient_address: String,
    pub network: String,
    pub asset: String,
    pub amount: String,
    pub nonce: String,
    pub transaction_hash: Option<String>,
    pub status: String,
    pub valid_after: Option<String>,
    pub valid_before: Option<String>,
    pub resource: Option<String>,
    pub description: Option<String>,
    pub credit_cost: i32,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
    pub timeout_at: Option<chrono::DateTime<chrono::Utc>>,
}

/// Error response
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ErrorResponse {
    pub error: String,
    pub message: String,
}

impl ErrorResponse {
    pub fn new(error: impl Into<String>, message: impl Into<String>) -> Self {
        Self {
            error: error.into(),
            message: message.into(),
        }
    }
}
