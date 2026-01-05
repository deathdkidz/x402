//! x402 Protocol v2 Types
//!
//! Implements the x402 v2 standard with:
//! - Standardized headers: PAYMENT-REQUIRED, PAYMENT-SIGNATURE, PAYMENT-RESPONSE, PAYMENT-VERSION
//! - Base64 encoded payloads (except PAYMENT-VERSION)
//! - CAIP-2 network identifiers (eip155:chainId)
//! - "accepts" field instead of "paymentOptions"

use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64};
use serde::{Deserialize, Serialize};
use validator::Validate;

use crate::config::network_resolver;

/// x402 Protocol Version
pub const X402_VERSION: &str = "2";

/// Header names for x402 v2
pub mod headers {
    /// Payment requirements header (base64 encoded JSON)
    pub const PAYMENT_REQUIRED: &str = "payment-required";
    /// Payment signature header (base64 encoded JSON)  
    pub const PAYMENT_SIGNATURE: &str = "payment-signature";
    /// Payment response header (base64 encoded JSON)
    pub const PAYMENT_RESPONSE: &str = "payment-response";
    /// Protocol version header (plain text)
    pub const PAYMENT_VERSION: &str = "payment-version";
}

/// x402 v2 Payment Requirements (sent in PAYMENT-REQUIRED header or 402 response)
/// This is what merchants specify for accepting payments
#[derive(Debug, Clone, Serialize, Deserialize, Validate)]
#[serde(rename_all = "camelCase")]
pub struct PaymentRequirementsV2 {
    /// Payment scheme - "exact" for exact amount matching
    #[validate(length(min = 1))]
    pub scheme: String,
    
    /// CAIP-2 network identifier (e.g., "eip155:8453" for Base)
    #[validate(length(min = 1))]
    pub network: String,
    
    /// Token contract address (0x...)
    #[validate(length(min = 42, max = 42))]
    pub asset: String,
    
    /// Recipient address to receive payment
    #[validate(length(min = 42, max = 42))]
    pub pay_to: String,
    
    /// Maximum amount required in smallest token units
    pub max_amount_required: String,
    
    /// Resource identifier being paid for
    #[serde(default)]
    pub resource: String,
    
    /// Human-readable description
    #[serde(default)]
    pub description: String,
    
    /// MIME type of the resource
    #[serde(default)]
    pub mime_type: String,
    
    /// Maximum timeout in seconds
    #[serde(default = "default_timeout")]
    pub max_timeout_seconds: u64,
    
    /// Optional output schema
    #[serde(skip_serializing_if = "Option::is_none")]
    pub output_schema: Option<serde_json::Value>,
    
    /// Optional extra data
    #[serde(skip_serializing_if = "Option::is_none")]
    pub extra: Option<serde_json::Value>,
}

fn default_timeout() -> u64 { 60 }

impl PaymentRequirementsV2 {
    /// Get the canonical network name from CAIP-2 or other formats
    pub fn canonical_network(&self) -> Option<String> {
        network_resolver::resolve_network(&self.network)
    }
    
    /// Get chain ID from network identifier
    pub fn chain_id(&self) -> Option<u64> {
        network_resolver::get_chain_id(&self.network)
    }
    
    /// Encode to base64 for header
    pub fn to_base64(&self) -> Result<String, serde_json::Error> {
        let json = serde_json::to_string(self)?;
        Ok(BASE64.encode(json.as_bytes()))
    }
    
    /// Decode from base64 header
    pub fn from_base64(encoded: &str) -> Result<Self, X402Error> {
        let bytes = BASE64.decode(encoded).map_err(|e| X402Error::Base64Decode(e.to_string()))?;
        let json = String::from_utf8(bytes).map_err(|e| X402Error::Utf8(e.to_string()))?;
        serde_json::from_str(&json).map_err(|e| X402Error::JsonParse(e.to_string()))
    }
}

/// EIP-3009 Authorization Data
#[derive(Debug, Clone, Serialize, Deserialize, Validate)]
#[serde(rename_all = "camelCase")]
pub struct AuthorizationV2 {
    /// Payer address (from)
    #[validate(length(min = 42, max = 42))]
    pub from: String,
    
    /// Recipient address (to)
    #[validate(length(min = 42, max = 42))]
    pub to: String,
    
    /// Transfer amount in smallest token units
    pub value: String,
    
    /// Unix timestamp - valid after
    pub valid_after: String,
    
    /// Unix timestamp - valid before  
    pub valid_before: String,
    
    /// Unique nonce (hex)
    pub nonce: String,
}

/// x402 v2 Payment Signature (sent in PAYMENT-SIGNATURE header)
#[derive(Debug, Clone, Serialize, Deserialize, Validate)]
#[serde(rename_all = "camelCase")]
pub struct PaymentSignatureV2 {
    /// EIP-3009 authorization data
    #[validate(nested)]
    pub authorization: AuthorizationV2,
    
    /// EIP-712 signature (0x prefixed hex)
    pub signature: String,
    
    /// Network name or CAIP-2 identifier (optional for backward compatibility)
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub network: Option<String>,
    
    /// Asset/token address (optional for backward compatibility)
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub asset: Option<String>,
}

impl PaymentSignatureV2 {
    /// Encode to base64 for header
    pub fn to_base64(&self) -> Result<String, serde_json::Error> {
        let json = serde_json::to_string(self)?;
        Ok(BASE64.encode(json.as_bytes()))
    }
    
    /// Decode from base64 header
    pub fn from_base64(encoded: &str) -> Result<Self, X402Error> {
        let bytes = BASE64.decode(encoded).map_err(|e| X402Error::Base64Decode(e.to_string()))?;
        let json = String::from_utf8(bytes).map_err(|e| X402Error::Utf8(e.to_string()))?;
        serde_json::from_str(&json).map_err(|e| X402Error::JsonParse(e.to_string()))
    }
}

/// x402 v2 Payment Response (sent in PAYMENT-RESPONSE header after settlement)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PaymentResponseV2 {
    /// Whether the payment was successful
    pub success: bool,
    
    /// Transaction hash if settled
    #[serde(skip_serializing_if = "Option::is_none")]
    pub transaction: Option<String>,
    
    /// CAIP-2 network identifier
    pub network: String,
    
    /// Payer address
    #[serde(skip_serializing_if = "Option::is_none")]
    pub payer: Option<String>,
    
    /// Error message if failed
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

impl PaymentResponseV2 {
    pub fn success(network: String, payer: String, tx_hash: String) -> Self {
        Self {
            success: true,
            transaction: Some(tx_hash),
            network,
            payer: Some(payer),
            error: None,
        }
    }
    
    pub fn failure(network: String, error: String) -> Self {
        Self {
            success: false,
            transaction: None,
            network,
            payer: None,
            error: Some(error),
        }
    }
    
    /// Encode to base64 for header
    pub fn to_base64(&self) -> Result<String, serde_json::Error> {
        let json = serde_json::to_string(self)?;
        Ok(BASE64.encode(json.as_bytes()))
    }
    
    /// Decode from base64 header
    pub fn from_base64(encoded: &str) -> Result<Self, X402Error> {
        let bytes = BASE64.decode(encoded).map_err(|e| X402Error::Base64Decode(e.to_string()))?;
        let json = String::from_utf8(bytes).map_err(|e| X402Error::Utf8(e.to_string()))?;
        serde_json::from_str(&json).map_err(|e| X402Error::JsonParse(e.to_string()))
    }
}

/// 402 Payment Required Response body
/// Sent when a resource requires payment
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PaymentRequiredResponse {
    /// x402 protocol version
    pub x402_version: String,
    
    /// Payment options the merchant accepts (renamed from paymentOptions)
    pub accepts: Vec<PaymentRequirementsV2>,
    
    /// Error message
    pub error: String,
}

impl PaymentRequiredResponse {
    pub fn new(accepts: Vec<PaymentRequirementsV2>) -> Self {
        Self {
            x402_version: X402_VERSION.to_string(),
            accepts,
            error: "Payment Required".to_string(),
        }
    }
    
    /// Encode to base64 for header
    pub fn to_base64(&self) -> Result<String, serde_json::Error> {
        let json = serde_json::to_string(self)?;
        Ok(BASE64.encode(json.as_bytes()))
    }
}

/// x402 verification/settlement request - supports both JSON body and headers
#[derive(Debug, Clone)]
pub struct X402Request {
    /// Payment signature (authorization + signature)
    pub payment_signature: PaymentSignatureV2,
    
    /// Payment requirements
    pub payment_requirements: PaymentRequirementsV2,
    
    /// Protocol version
    pub version: String,
}

/// x402 error types
#[derive(Debug, thiserror::Error)]
pub enum X402Error {
    #[error("Base64 decode error: {0}")]
    Base64Decode(String),
    
    #[error("UTF-8 decode error: {0}")]
    Utf8(String),
    
    #[error("JSON parse error: {0}")]
    JsonParse(String),
    
    #[error("Missing header: {0}")]
    MissingHeader(String),
    
    #[error("Invalid version: {0}")]
    InvalidVersion(String),
    
    #[error("Validation error: {0}")]
    Validation(String),
    
    #[error("Network not supported: {0}")]
    UnsupportedNetwork(String),
}

/// Convert legacy PaymentRequirements to V2
impl From<&crate::types::PaymentRequirements> for PaymentRequirementsV2 {
    fn from(legacy: &crate::types::PaymentRequirements) -> Self {
        // Convert network name to CAIP-2 if possible
        let network = network_resolver::get_caip2(&legacy.network)
            .unwrap_or_else(|| legacy.network.clone());
        
        Self {
            scheme: legacy.scheme.clone(),
            network,
            asset: legacy.asset.clone(),
            pay_to: legacy.pay_to.clone(),
            max_amount_required: legacy.max_amount_required.clone(),
            resource: legacy.resource.clone(),
            description: legacy.description.clone(),
            mime_type: legacy.mime_type.clone(),
            max_timeout_seconds: legacy.max_timeout_seconds,
            output_schema: legacy.output_schema.clone(),
            extra: legacy.extra.clone(),
        }
    }
}

/// Convert legacy PaymentPayload to V2 PaymentSignature
impl From<&crate::types::PaymentPayload> for PaymentSignatureV2 {
    fn from(legacy: &crate::types::PaymentPayload) -> Self {
        Self {
            authorization: AuthorizationV2 {
                from: legacy.authorization.from.clone(),
                to: legacy.authorization.to.clone(),
                value: legacy.authorization.value.clone(),
                valid_after: legacy.authorization.valid_after.clone(),
                valid_before: legacy.authorization.valid_before.clone(),
                nonce: legacy.authorization.nonce.clone(),
            },
            signature: legacy.signature.clone(),
            network: None,
            asset: None,
        }
    }
}

/// Convert V2 to legacy types for backward compatibility
impl From<&PaymentRequirementsV2> for crate::types::PaymentRequirements {
    fn from(v2: &PaymentRequirementsV2) -> Self {
        // Convert CAIP-2 to canonical network name
        let network = network_resolver::resolve_network(&v2.network)
            .unwrap_or_else(|| v2.network.clone());
        
        Self {
            scheme: v2.scheme.clone(),
            network,
            asset: v2.asset.clone(),
            pay_to: v2.pay_to.clone(),
            max_amount_required: v2.max_amount_required.clone(),
            resource: v2.resource.clone(),
            description: v2.description.clone(),
            mime_type: v2.mime_type.clone(),
            max_timeout_seconds: v2.max_timeout_seconds,
            output_schema: v2.output_schema.clone(),
            extra: v2.extra.clone(),
        }
    }
}

impl From<&PaymentSignatureV2> for crate::types::PaymentPayload {
    fn from(v2: &PaymentSignatureV2) -> Self {
        Self {
            authorization: crate::types::Eip3009Authorization {
                from: v2.authorization.from.clone(),
                to: v2.authorization.to.clone(),
                value: v2.authorization.value.clone(),
                valid_after: v2.authorization.valid_after.clone(),
                valid_before: v2.authorization.valid_before.clone(),
                nonce: v2.authorization.nonce.clone(),
                extra: None,
            },
            signature: v2.signature.clone(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_payment_requirements_base64_roundtrip() {
        let req = PaymentRequirementsV2 {
            scheme: "exact".to_string(),
            network: "eip155:84532".to_string(),
            asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e".to_string(),
            pay_to: "0x1234567890123456789012345678901234567890".to_string(),
            max_amount_required: "1000000".to_string(),
            resource: "/api/content".to_string(),
            description: "Premium content".to_string(),
            mime_type: "application/json".to_string(),
            max_timeout_seconds: 60,
            output_schema: None,
            extra: None,
        };
        
        let encoded = req.to_base64().unwrap();
        let decoded = PaymentRequirementsV2::from_base64(&encoded).unwrap();
        
        assert_eq!(req.network, decoded.network);
        assert_eq!(req.asset, decoded.asset);
        assert_eq!(req.max_amount_required, decoded.max_amount_required);
    }
    
    #[test]
    fn test_caip2_network_resolution() {
        let req = PaymentRequirementsV2 {
            scheme: "exact".to_string(),
            network: "eip155:84532".to_string(),
            asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e".to_string(),
            pay_to: "0x1234567890123456789012345678901234567890".to_string(),
            max_amount_required: "1000000".to_string(),
            resource: "".to_string(),
            description: "".to_string(),
            mime_type: "".to_string(),
            max_timeout_seconds: 60,
            output_schema: None,
            extra: None,
        };
        
        assert_eq!(req.canonical_network(), Some("Base Sepolia".to_string()));
        assert_eq!(req.chain_id(), Some(84532));
    }
}
