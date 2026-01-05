//! API Key Model Types
//! 
//! Simplified types for the API key + USD credits model.
//! No authentication required - just purchase credits and use the API key.

use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use validator::Validate;

// =============================================================================
// BALANCE TYPE (Testnet vs Mainnet)
// =============================================================================

/// Which balance to use for operations
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum BalanceType {
    Mainnet,
    Testnet,
}

impl BalanceType {
    pub fn from_network_name(network: &str) -> Self {
        // Check known testnet patterns
        let lower = network.to_lowercase();
        if lower.contains("sepolia") 
            || lower.contains("testnet")
            || lower.contains("goerli")
            || lower.contains("mumbai")
            || lower.contains("amoy")
            || lower.contains("fuji")
        {
            BalanceType::Testnet
        } else {
            BalanceType::Mainnet
        }
    }
    
    pub fn as_str(&self) -> &'static str {
        match self {
            BalanceType::Mainnet => "mainnet",
            BalanceType::Testnet => "testnet",
        }
    }
}

impl std::fmt::Display for BalanceType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.as_str())
    }
}

// =============================================================================
// API KEY
// =============================================================================

/// API Key record from database
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApiKey {
    pub id: i64,
    pub api_key: String,
    pub email: Option<String>,
    
    /// Mainnet-only USD balance
    #[serde(with = "rust_decimal::serde::float")]
    pub mainnet_balance: Decimal,
    
    /// Testnet-only USD balance
    #[serde(with = "rust_decimal::serde::float")]
    pub testnet_balance: Decimal,
    
    /// Lifetime statistics
    #[serde(with = "rust_decimal::serde::float")]
    pub lifetime_credits_purchased: Decimal,
    #[serde(with = "rust_decimal::serde::float")]
    pub lifetime_credits_used: Decimal,
    pub total_transactions: i32,
    pub successful_transactions: i32,
    
    /// Status
    pub is_active: bool,
    pub expires_at: Option<chrono::DateTime<chrono::Utc>>,
    
    /// Timestamps
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
    pub last_used_at: Option<chrono::DateTime<chrono::Utc>>,
}

impl ApiKey {
    /// Check if API key has sufficient USD credits for the given balance type
    pub fn has_credits(&self, amount: Decimal, balance_type: BalanceType) -> bool {
        match balance_type {
            BalanceType::Mainnet => self.mainnet_balance >= amount,
            BalanceType::Testnet => self.testnet_balance >= amount,
        }
    }
    
    /// Get the balance for a specific type
    pub fn get_balance(&self, balance_type: BalanceType) -> Decimal {
        match balance_type {
            BalanceType::Mainnet => self.mainnet_balance,
            BalanceType::Testnet => self.testnet_balance,
        }
    }
    
    /// Check if API key is valid (active and not expired)
    pub fn is_valid(&self) -> bool {
        if !self.is_active {
            return false;
        }
        
        if let Some(expires_at) = self.expires_at {
            if expires_at < chrono::Utc::now() {
                return false;
            }
        }
        
        true
    }
    
    /// Get days until expiration (None if never expires)
    pub fn days_until_expiry(&self) -> Option<i64> {
        self.expires_at.map(|exp| {
            let now = chrono::Utc::now();
            (exp - now).num_days()
        })
    }
}

// =============================================================================
// API KEY PUBLIC INFO (safe to return to users)
// =============================================================================

/// Public API key info (excludes sensitive internal data)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApiKeyInfo {
    /// Last 8 characters of API key (for display)
    pub api_key_suffix: String,
    
    /// Email (if provided)
    pub email: Option<String>,
    
    /// Current combined USD balance (total)
    #[serde(with = "rust_decimal::serde::float")]
    pub balance: Decimal,
    
    /// Mainnet balance
    #[serde(with = "rust_decimal::serde::float")]
    pub mainnet_balance: Decimal,
    
    /// Testnet balance
    #[serde(with = "rust_decimal::serde::float")]
    pub testnet_balance: Decimal,
    
    /// Total transactions count
    pub total_transactions: i32,
    
    /// Success rate percentage (0-100)
    pub success_rate: f64,
    
    /// Is the key valid and active
    pub is_active: bool,
    
    /// Expiration date (if set)
    pub expires_at: Option<String>,
    
    /// Days until expiration (if set)
    pub days_until_expiry: Option<i64>,
    
    /// When the key was created
    pub created_at: String,
}

impl ApiKey {
    /// Get total balance (mainnet + testnet)
    pub fn total_balance(&self) -> Decimal {
        self.mainnet_balance + self.testnet_balance
    }
}

impl From<&ApiKey> for ApiKeyInfo {
    fn from(key: &ApiKey) -> Self {
        let success_rate = if key.total_transactions > 0 {
            (key.successful_transactions as f64 / key.total_transactions as f64) * 100.0
        } else {
            0.0
        };
        
        Self {
            api_key_suffix: key.api_key.chars().skip(key.api_key.len().saturating_sub(8)).collect(),
            email: key.email.clone(),
            balance: key.total_balance(),
            mainnet_balance: key.mainnet_balance,
            testnet_balance: key.testnet_balance,
            total_transactions: key.total_transactions,
            success_rate,
            is_active: key.is_valid(),
            expires_at: key.expires_at.map(|d| d.to_rfc3339()),
            days_until_expiry: key.days_until_expiry(),
            created_at: key.created_at.to_rfc3339(),
        }
    }
}

// =============================================================================
// CREDIT PURCHASE
// =============================================================================

/// Request to purchase credits / create new API key
#[derive(Debug, Clone, Deserialize, Validate)]
#[serde(rename_all = "camelCase")]
pub struct CreditPurchaseRequest {
    /// Amount in USD to purchase (min $1, max $10000)
    #[validate(range(min = 1.0, max = 10000.0, message = "amount must be between $1 and $10,000"))]
    pub amount: f64,
    
    /// Optional email for notifications/recovery
    #[validate(email(message = "invalid email format"))]
    pub email: Option<String>,
    
    /// Optional existing API key to add credits to
    pub api_key: Option<String>,
}

/// Response when credits are purchased
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreditPurchaseResponse {
    /// Whether purchase was successful
    pub success: bool,
    
    /// The API key (new or existing)
    /// IMPORTANT: Only returned on first creation - store it securely!
    #[serde(skip_serializing_if = "Option::is_none")]
    pub api_key: Option<String>,
    
    /// API key info
    pub info: ApiKeyInfo,
    
    /// Payment address to send funds to
    #[serde(skip_serializing_if = "Option::is_none")]
    pub payment_address: Option<String>,
    
    /// Amount to pay in USDC
    #[serde(skip_serializing_if = "Option::is_none")]
    pub amount_usdc: Option<f64>,
    
    /// Message
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
}

// =============================================================================
// CREDIT BALANCE
// =============================================================================

/// Response for balance check
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BalanceResponse {
    pub success: bool,
    
    /// Current USD balance (high precision)
    #[serde(with = "rust_decimal::serde::float")]
    pub balance: Decimal,
    
    /// Formatted balance for display (e.g., "$12.34")
    pub balance_formatted: String,
    
    /// Estimated settlements remaining at current gas prices
    /// (assumes ~$0.001 service fee + ~$0.005 average gas)
    pub estimated_settlements_remaining: i64,
    
    /// API key info
    pub info: ApiKeyInfo,
    
    /// Recent transactions (last 10)
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub recent_transactions: Vec<LedgerEntry>,
}

// =============================================================================
// LEDGER ENTRIES (Credit History)
// =============================================================================

/// Credit ledger entry type
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum LedgerEntryType {
    Purchase,
    ServiceFee,
    GasCost,
    Refund,
    Adjustment,
}

impl std::fmt::Display for LedgerEntryType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Purchase => write!(f, "purchase"),
            Self::ServiceFee => write!(f, "service_fee"),
            Self::GasCost => write!(f, "gas_cost"),
            Self::Refund => write!(f, "refund"),
            Self::Adjustment => write!(f, "adjustment"),
        }
    }
}

/// Single ledger entry
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LedgerEntry {
    pub id: i64,
    pub entry_type: LedgerEntryType,
    
    /// Amount (negative for deductions)
    #[serde(with = "rust_decimal::serde::float")]
    pub amount: Decimal,
    
    /// Balance before this entry
    #[serde(with = "rust_decimal::serde::float")]
    pub balance_before: Decimal,
    
    /// Balance after this entry
    #[serde(with = "rust_decimal::serde::float")]
    pub balance_after: Decimal,
    
    /// Description
    pub description: Option<String>,
    
    /// Related transaction hash (if applicable)
    pub transaction_hash: Option<String>,
    
    /// Timestamp
    pub created_at: String,
}

// =============================================================================
// HELP ENDPOINT TYPES
// =============================================================================

/// Complete facilitator documentation for AI agents
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HelpResponse {
    pub name: String,
    pub description: String,
    pub version: String,
    pub documentation_url: Option<String>,
    
    /// Quick start guide
    pub quick_start: Vec<String>,
    
    /// All available endpoints
    pub endpoints: Vec<EndpointDoc>,
    
    /// Supported networks
    pub networks: NetworksDoc,
    
    /// Pricing information
    pub pricing: PricingDoc,
    
    /// Error codes and meanings
    pub error_codes: Vec<ErrorCodeDoc>,
    
    /// Example requests
    pub examples: ExamplesDoc,
}

/// Single endpoint documentation
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EndpointDoc {
    /// HTTP method
    pub method: String,
    
    /// Path
    pub path: String,
    
    /// Short description
    pub description: String,
    
    /// Whether authentication is required
    pub requires_auth: bool,
    
    /// Request body schema (if applicable)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub request_body: Option<serde_json::Value>,
    
    /// Response schema
    #[serde(skip_serializing_if = "Option::is_none")]
    pub response: Option<serde_json::Value>,
}

/// Networks documentation
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NetworksDoc {
    pub mainnet: Vec<NetworkDoc>,
    pub testnet: Vec<NetworkDoc>,
}

/// Single network documentation
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NetworkDoc {
    pub name: String,
    pub chain_id: u64,
    pub native_token: String,
    pub tokens: Vec<TokenDoc>,
}

/// Token documentation
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TokenDoc {
    pub symbol: String,
    pub address: String,
    pub decimals: u8,
}

/// Pricing documentation
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PricingDoc {
    /// Service fee per settlement (USD)
    pub service_fee_usd: f64,
    
    /// Note about gas costs
    pub gas_costs_note: String,
    
    /// Typical total cost per settlement
    pub typical_total_cost_usd: String,
    
    /// Minimum recommended balance
    pub minimum_recommended_balance: f64,
}

/// Error code documentation
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ErrorCodeDoc {
    pub code: String,
    pub description: String,
    pub resolution: String,
}

/// Example requests
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExamplesDoc {
    pub verify: serde_json::Value,
    pub settle: serde_json::Value,
    pub credits: serde_json::Value,
}

// =============================================================================
// NATIVE TOKEN PRICE
// =============================================================================

/// Cached native token price
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NativeTokenPrice {
    pub symbol: String,
    #[serde(with = "rust_decimal::serde::float")]
    pub price_usd: Decimal,
    pub source: String,
    pub fetched_at: chrono::DateTime<chrono::Utc>,
    pub expires_at: chrono::DateTime<chrono::Utc>,
}

// =============================================================================
// TRANSACTION (Updated for API Key model)
// =============================================================================

/// Transaction record for API key model
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TransactionRecord {
    pub id: i64,
    pub api_key_id: i64,
    pub network: String,
    pub asset: String,
    pub payer_address: String,
    pub recipient_address: String,
    pub amount: String,
    pub nonce: String,
    pub valid_after: i64,
    pub valid_before: i64,
    pub resource: Option<String>,
    pub description: Option<String>,
    pub transaction_hash: Option<String>,
    pub status: String,
    
    /// Gas tracking
    pub gas_used: Option<i64>,
    pub effective_gas_price_wei: Option<i64>,
    #[serde(with = "rust_decimal::serde::float_option")]
    pub gas_cost_native: Option<Decimal>,
    #[serde(with = "rust_decimal::serde::float_option")]
    pub gas_cost_usd: Option<Decimal>,
    #[serde(with = "rust_decimal::serde::float_option")]
    pub native_token_price_usd: Option<Decimal>,
    
    /// Cost tracking
    #[serde(with = "rust_decimal::serde::float")]
    pub service_fee_usd: Decimal,
    #[serde(with = "rust_decimal::serde::float_option")]
    pub total_cost_usd: Option<Decimal>,
    
    /// Timestamps
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
    pub confirmed_at: Option<chrono::DateTime<chrono::Utc>>,
}
