//! Account Endpoint - Unified account management
//!
//! Single endpoint for:
//! - GET /account: Plain text instructions with supported networks and USDC addresses
//! - POST /account: Purchase credits with PAYMENT-SIGNATURE header

use std::sync::Arc;
use axum::{
    body::Bytes,
    extract::State,
    http::{HeaderMap, StatusCode, header::HeaderValue},
    response::IntoResponse,
    routing::{get, post},
    Json, Router,
};
use rust_decimal::prelude::*;
use rust_decimal::Decimal;
use rust_decimal_macros::dec;
use std::str::FromStr;
use serde::Deserialize;
use serde_json::json;
use tracing::{info, warn, error};

use crate::routes::AppState;
use crate::services::ApiKeyDb;
use crate::types::{X402_VERSION, headers, PaymentSignatureV2, ErrorResponse};
use crate::types::api_key::BalanceType;
use crate::config::network_resolver;

/// Create account router
pub fn create_account_router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/account", get(account_help_handler))
        .route("/account", post(account_purchase_handler))
}

/// Service fee per settlement in USD
const SERVICE_FEE_USD: &str = "0.001";
/// Minimum purchase amount in USD
const MIN_PURCHASE_USD: &str = "1.00";

/// Credit purchase request body
#[derive(Debug, Deserialize)]
struct CreditPurchaseRequest {
    /// Network name or CAIP-2 identifier
    network: String,
}

/// GET /account - Plain text instructions
async fn account_help_handler(
    State(state): State<Arc<AppState>>,
) -> impl IntoResponse {
    let config = &state.config;
    
    // Build network list with USDC addresses
    let mut networks_text = String::new();
    
    // Mainnets
    networks_text.push_str("MAINNET NETWORKS:\n");
    for name in &config.mainnet_networks {
        if let Some(nc) = config.networks.get(name) {
            let usdc = nc.tokens.iter()
                .find(|t| t.symbol.to_uppercase() == "USDC")
                .map(|t| t.address.as_str())
                .unwrap_or("not configured");
            networks_text.push_str(&format!(
                "  {} (eip155:{})\n    USDC: {}\n",
                name, nc.chain_id, usdc
            ));
        }
    }
    
    // Testnets
    networks_text.push_str("\nTESTNET NETWORKS:\n");
    for name in &config.testnet_networks {
        if let Some(nc) = config.networks.get(name) {
            let usdc = nc.tokens.iter()
                .find(|t| t.symbol.to_uppercase() == "USDC")
                .map(|t| t.address.as_str())
                .unwrap_or("not configured");
            networks_text.push_str(&format!(
                "  {} (eip155:{})\n    USDC: {}\n",
                name, nc.chain_id, usdc
            ));
        }
    }
    
    let vault_address = config.vault_address.as_deref().unwrap_or("not configured");
    
    let help_text = format!(r#"x402 ACCOUNT - CREDIT PURCHASE
===============================
Version: {version}

HOW TO PURCHASE CREDITS
-----------------------
1. Create a signed EIP-3009 USDC transfer to our vault
2. POST to /account with PAYMENT-SIGNATURE header
3. Receive API key with USDC balance

VAULT ADDRESS (send USDC here)
------------------------------
{vault_address}

SUPPORTED NETWORKS & USDC ADDRESSES
-----------------------------------
{networks}
REQUEST FORMAT
--------------
POST /account
Headers:
  PAYMENT-SIGNATURE: <base64 encoded payment signature>
  API-KEY: <existing key> (optional - to add balance to existing account)

PAYMENT-SIGNATURE STRUCTURE
---------------------------
Base64 encoded JSON:
{{
  "authorization": {{
    "from": "0x...",        // your wallet address
    "to": "{vault_address}", // vault address
    "value": "1000000",     // amount in USDC (6 decimals) - min 1 USDC
    "validAfter": "0",      // unix timestamp
    "validBefore": "...",   // unix timestamp (expiry)
    "nonce": "0x..."        // unique 32-byte hex
  }},
  "signature": "0x...",     // EIP-712 signature
  "network": "Base Sepolia", // network name or CAIP-2
  "asset": "0x..."          // USDC token address
}}

RESPONSE (new account)
----------------------
{{
  "success": true,
  "action": "create",
  "apiKey": "a1b2c3d4...64_char_hex",  // SAVE THIS!
  "balanceType": "testnet",
  "usdc": "10.000000",
  "transaction": "0x..."
}}

RESPONSE (top-up existing)
--------------------------
{{
  "success": true,
  "action": "topup",
  "balanceType": "mainnet",
  "usdc": "5.000000",
  "newBalance": "15.000000",
  "transaction": "0x..."
}}

PRICING
-------
Service fee: ${service_fee} per settlement
Minimum deposit: ${min_purchase} USDC

NOTES
-----
- Mainnet payments add to mainnet balance
- Testnet payments add to testnet balance
- Balances are tracked separately
- API keys never expire while active

CHECK BALANCE
-------------
Use Authorization header with your API key:

POST /account
Headers:
  Authorization: Bearer <your_api_key>
Body:
  {{"action": "balance"}}

Response:
  {{"success": true, "mainnetBalance": "5.00", "testnetBalance": "10.00"}}

CHECK METRICS
-------------
Get detailed usage statistics:

POST /account
Headers:
  Authorization: Bearer <your_api_key>
Body:
  {{"action": "metrics"}}

Response:
  {{
    "success": true,
    "usdc": "10.000000",
    "stats": {{
      "totalTransactions": 150,
      "successfulTransactions": 148,
      "failedTransactions": 2,
      "successRate": "98.7%",
      "totalSpent": "0.150000 USDC",
      "totalGasCost": "0.100000 USDC",
      "totalServiceFees": "0.050000 USDC"
    }},
    "createdAt": "2025-01-15 10:30:00",
    "lastUsed": "2025-01-20 14:22:15"
  }}
"#,
        version = X402_VERSION,
        vault_address = vault_address,
        networks = networks_text,
        service_fee = SERVICE_FEE_USD,
        min_purchase = MIN_PURCHASE_USD,
    );
    
    let mut response_headers = HeaderMap::new();
    response_headers.insert(
        axum::http::header::CONTENT_TYPE,
        HeaderValue::from_static("text/plain; charset=utf-8")
    );
    
    (response_headers, help_text)
}

/// Account action request (for balance/metrics queries)
#[derive(Debug, Deserialize)]
struct AccountAction {
    action: Option<String>,
}

/// POST /account - Handle credit purchase or account queries
async fn account_purchase_handler(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    body: Bytes,
) -> impl IntoResponse {
    // Check for PAYMENT-SIGNATURE header (purchase flow)
    let has_payment_signature = headers.get(headers::PAYMENT_SIGNATURE).is_some();
    
    // Check for Authorization header (query flow - balance/metrics)
    let auth_header = headers.get(axum::http::header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok());
    
    // Check for API-KEY header (for top-up to existing account)
    let api_key_header: Option<String> = headers.get("API-KEY")
        .or_else(|| headers.get("api-key"))
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string());
    
    // Flow A: Credit purchase with PAYMENT-SIGNATURE
    if has_payment_signature {
        return handle_credit_purchase(state, headers, body, api_key_header.as_deref()).await;
    }
    
    // Flow B: Account query with Authorization header
    if let Some(auth) = auth_header {
        let api_key_str = if auth.starts_with("Bearer ") {
            &auth[7..]
        } else {
            auth
        };
        
        // Parse body for action
        let action: AccountAction = match serde_json::from_slice(&body) {
            Ok(a) => a,
            Err(_) => {
                return (
                    StatusCode::BAD_REQUEST,
                    Json(json!({
                        "error": "MISSING_ACTION",
                        "message": "Request body must contain {\"action\": \"balance\"} or {\"action\": \"metrics\"}",
                        "validActions": ["balance", "metrics"]
                    }))
                ).into_response();
            }
        };
        
        return match action.action.as_deref() {
            Some("balance") => handle_balance_query(state, api_key_str).await,
            Some("metrics") => handle_metrics_query(state, api_key_str).await,
            Some(other) => (
                StatusCode::BAD_REQUEST,
                Json(json!({
                    "error": "INVALID_ACTION",
                    "message": format!("Unknown action: {}. Use 'balance' or 'metrics'", other),
                    "validActions": ["balance", "metrics"]
                }))
            ).into_response(),
            None => (
                StatusCode::BAD_REQUEST,
                Json(json!({
                    "error": "MISSING_ACTION",
                    "message": "Request body must contain {\"action\": \"balance\"} or {\"action\": \"metrics\"}",
                    "validActions": ["balance", "metrics"]
                }))
            ).into_response(),
        };
    }
    
    // Neither PAYMENT-SIGNATURE nor Authorization provided
    (
        StatusCode::BAD_REQUEST,
        Json(json!({
            "error": "MISSING_PARAMETERS",
            "message": "POST /account requires either PAYMENT-SIGNATURE header (for purchase) or Authorization header with action body (for queries)",
            "usage": {
                "purchase": {
                    "headers": {"PAYMENT-SIGNATURE": "<base64>", "PAYMENT-VERSION": "2"},
                    "note": "Send payment to vault address"
                },
                "query": {
                    "headers": {"Authorization": "Bearer <api_key>"},
                    "body": {"action": "balance or metrics"}
                }
            }
        }))
    ).into_response()
}

/// Handle credit purchase with PAYMENT-SIGNATURE
async fn handle_credit_purchase(
    state: Arc<AppState>,
    headers: HeaderMap,
    body: Bytes,
    existing_api_key: Option<&str>,
) -> axum::response::Response {
    info!("=== CREDIT PURCHASE REQUEST ===");
    
    // Decode PAYMENT-SIGNATURE first (to extract network if present)
    let signature_b64 = match headers.get(headers::PAYMENT_SIGNATURE)
        .and_then(|v| v.to_str().ok()) 
    {
        Some(s) => s,
        None => {
            return (
                StatusCode::BAD_REQUEST,
                Json(ErrorResponse::new("INVALID_HEADER", "Invalid PAYMENT-SIGNATURE header"))
            ).into_response();
        }
    };
    
    let payment_sig = match PaymentSignatureV2::from_base64(signature_b64) {
        Ok(p) => p,
        Err(e) => {
            return (
                StatusCode::BAD_REQUEST,
                Json(ErrorResponse::new("DECODE_ERROR", format!("Failed to decode PAYMENT-SIGNATURE: {}", e)))
            ).into_response();
        }
    };
    
    // Extract network from PAYMENT-SIGNATURE if present, otherwise from body
    let network = if let Some(net) = &payment_sig.network {
        net.clone()
    } else {
        // Fallback to body for backward compatibility
        let purchase_req: CreditPurchaseRequest = match serde_json::from_slice(&body) {
            Ok(req) => req,
            Err(_) => {
                return (
                    StatusCode::BAD_REQUEST,
                    Json(json!({
                        "error": "MISSING_NETWORK",
                        "message": "Network not found in PAYMENT-SIGNATURE or request body",
                        "hint": "Include 'network' field in PAYMENT-SIGNATURE or request body"
                    }))
                ).into_response();
            }
        };
        purchase_req.network
    };
    
    // Get vault address from config
    let vault_address = match &state.config.vault_address {
        Some(addr) => addr.to_lowercase(),
        None => {
            error!("Vault address not configured");
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse::new("CONFIG_ERROR", "Credit purchases not available"))
            ).into_response();
        }
    };
    
    // Verify payment is to vault address
    let payment_to = payment_sig.authorization.to.to_lowercase();
    if payment_to != vault_address {
        warn!("Payment to wrong address: {} (expected {})", payment_to, vault_address);
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({
                "error": "INVALID_RECIPIENT",
                "message": "Payment must be sent to vault address",
                "vaultAddress": vault_address
            }))
        ).into_response();
    }
    
    // Validate existing API key if provided
    if let Some(key) = existing_api_key {
        match ApiKeyDb::validate_api_key(state.database.pool(), key).await {
            Ok(_) => {
                info!("Top-up for existing API key: {}...{}", &key[..8.min(key.len())], &key[key.len().saturating_sub(4)..]);
            }
            Err(e) => {
                warn!("Invalid API key for top-up: {}", e);
                return (
                    StatusCode::BAD_REQUEST,
                    Json(json!({
                        "error": "INVALID_API_KEY",
                        "message": "The provided API-KEY header contains an invalid or non-existent API key"
                    }))
                ).into_response();
            }
        }
    }
    
    // Determine if this is a testnet or mainnet network
    let is_testnet = network_resolver::is_testnet(&network).unwrap_or(true);
    let balance_type = if is_testnet { BalanceType::Testnet } else { BalanceType::Mainnet };
    
    let network_config = match state.config.networks.get(&state.config.normalize_network_name(&network)) {
        Some(nc) => nc,
        None => {
            return (
                StatusCode::BAD_REQUEST,
                Json(ErrorResponse::new("UNSUPPORTED_NETWORK", format!("Network {} not supported", network)))
            ).into_response();
        }
    };
    
    // Get USDC token config for this network
    let usdc_token = match network_config.tokens.iter()
        .find(|t| t.symbol.to_uppercase() == "USDC")
    {
        Some(t) => t,
        None => {
            return (
                StatusCode::BAD_REQUEST,
                Json(ErrorResponse::new("TOKEN_NOT_SUPPORTED", "USDC not configured on this network"))
            ).into_response();
        }
    };
    
    // Use USDC token address for this network
    let asset_address = usdc_token.address.clone();
    
    // Create payment requirements for the vault
    let payment_requirements = crate::types::PaymentRequirements {
        scheme: "exact".to_string(),
        network: network.clone(),
        asset: asset_address.clone(),
        pay_to: vault_address.clone(),
        max_amount_required: payment_sig.authorization.value.clone(),
        resource: "credit-purchase".to_string(),
        description: "x402 Credit Purchase".to_string(),
        mime_type: "application/json".to_string(),
        max_timeout_seconds: 300,
        output_schema: None,
        extra: None,
    };
    
    // Create payment payload from signature
    let payment_payload = crate::types::PaymentPayload {
        authorization: crate::types::Eip3009Authorization {
            from: payment_sig.authorization.from.clone(),
            to: payment_sig.authorization.to.clone(),
            value: payment_sig.authorization.value.clone(),
            valid_after: payment_sig.authorization.valid_after.clone(),
            valid_before: payment_sig.authorization.valid_before.clone(),
            nonce: payment_sig.authorization.nonce.clone(),
            extra: None,
        },
        signature: payment_sig.signature.clone(),
    };
    
    // First verify the payment
    let verify_result = state.verification_service.verify(
        &payment_payload,
        &payment_requirements,
    ).await;
    
    if !verify_result.is_valid {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({
                "error": "INVALID_PAYMENT",
                "message": verify_result.invalid_reason.unwrap_or_else(|| "Payment verification failed".to_string())
            }))
        ).into_response();
    }
    
    // Execute settlement to vault
    let settle_result = state.settlement_service.settle_to_vault(
        &payment_payload,
        &payment_requirements,
        &vault_address,
    ).await;
    
    let (tx_hash, usdc_amount) = match settle_result {
        Ok((hash, amount)) => (hash, amount),
        Err(reason) => {
            return (
                StatusCode::BAD_REQUEST,
                Json(json!({
                    "error": "SETTLEMENT_FAILED",
                    "message": reason
                }))
            ).into_response();
        }
    };
    
    // Check minimum purchase amount
    let min_purchase = Decimal::from_str(MIN_PURCHASE_USD).unwrap_or(dec!(1));
    if usdc_amount < min_purchase {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({
                "error": "MINIMUM_PURCHASE",
                "message": format!("Minimum purchase is {} USDC", MIN_PURCHASE_USD),
                "minimumRequired": MIN_PURCHASE_USD,
                "received": format!("{:.2} USDC", usdc_amount)
            }))
        ).into_response();
    }
    
    // Check if this is a top-up for existing API key (already validated above)
    if let Some(existing_key) = existing_api_key {
        // Key was already validated, get the key info
        match ApiKeyDb::validate_api_key(state.database.pool(), existing_key).await {
            Ok(key) => {
                // Record the purchase first
                let _ = ApiKeyDb::record_credit_purchase(
                    state.database.pool(),
                    existing_key,
                    usdc_amount,
                    "crypto",
                    Some(&network),
                    is_testnet,
                    Some(&payment_sig.authorization.from),
                    Some(&tx_hash),
                ).await;
                
                // Add credits to existing key
                match ApiKeyDb::add_credits(
                    state.database.pool(),
                    key.id,
                    usdc_amount,
                    balance_type,
                    Some(&format!("USDC deposit: {} on {}", tx_hash, network)),
                    None,
                ).await {
                    Ok(new_balance) => {
                        info!("✓ Added {:.2} USDC ({}) to existing API key {}...{}", 
                              usdc_amount, balance_type.as_str(), &existing_key[..8.min(existing_key.len())], &existing_key[existing_key.len().saturating_sub(4)..]);
                        
                        return (
                            StatusCode::OK,
                            Json(json!({
                                "success": true,
                                "action": "topup",
                                "balanceType": balance_type.as_str(),
                                "usdc": format!("{:.6}", usdc_amount),
                                "newBalance": format!("{:.6}", new_balance),
                                "transaction": tx_hash
                            }))
                        ).into_response();
                    }
                    Err(e) => {
                        error!("Failed to add credits: {}", e);
                        return (
                            StatusCode::INTERNAL_SERVER_ERROR,
                            Json(ErrorResponse::new("CREDIT_ERROR", "Failed to add credits"))
                        ).into_response();
                    }
                }
            }
            Err(e) => {
                // This shouldn't happen since we validated above, but handle anyway
                error!("API key validation failed unexpectedly: {}", e);
                return (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(ErrorResponse::new("INTERNAL_ERROR", "Failed to process top-up"))
                ).into_response();
            }
        }
    }
    
    // Create new API key
    let payer_address = payment_sig.authorization.from.clone();
    
    match ApiKeyDb::create_api_key_with_payer(
        state.database.pool(),
        usdc_amount,
        balance_type,
        Some(&payer_address),
        &format!("USDC deposit: {} on {}", tx_hash, network),
    ).await {
        Ok((api_key, _key_id)) => {
            // Record the purchase
            let _ = ApiKeyDb::record_credit_purchase(
                state.database.pool(),
                &api_key,
                usdc_amount,
                "crypto",
                Some(&network),
                is_testnet,
                Some(&payer_address),
                Some(&tx_hash),
            ).await;
            
            info!("✓ Created new API key {}...{} with {:.2} USDC ({})", 
                  &api_key[..8], &api_key[api_key.len()-4..], usdc_amount, balance_type.as_str());
            
            (
                StatusCode::OK,
                Json(json!({
                    "success": true,
                    "action": "create",
                    "apiKey": api_key,
                    "balanceType": balance_type.as_str(),
                    "usdc": format!("{:.6}", usdc_amount),
                    "transaction": tx_hash,
                    "message": "API key created. SAVE THIS KEY - it will not be shown again!"
                }))
            ).into_response()
        }
        Err(e) => {
            error!("Failed to create API key: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse::new("CREATE_ERROR", "Failed to create API key"))
            ).into_response()
        }
    }
}

/// Handle balance query
async fn handle_balance_query(
    state: Arc<AppState>,
    api_key_str: &str,
) -> axum::response::Response {
    match ApiKeyDb::validate_api_key(state.database.pool(), api_key_str).await {
        Ok(key) => {
            // Service fee per settlement (from constant)
            let service_fee = Decimal::from_str(SERVICE_FEE_USD).unwrap_or(dec!(0.001));
            let mainnet_settlements = if service_fee > dec!(0) {
                (key.mainnet_balance / service_fee).to_u64().unwrap_or(0)
            } else {
                0
            };
            let testnet_settlements = if service_fee > dec!(0) {
                (key.testnet_balance / service_fee).to_u64().unwrap_or(0)
            } else {
                0
            };
            
            (
                StatusCode::OK,
                Json(json!({
                    "success": true,
                    "totalBalance": format!("{:.6}", key.total_balance()),
                    "mainnetBalance": format!("{:.6}", key.mainnet_balance),
                    "testnetBalance": format!("{:.6}", key.testnet_balance),
                    "estimatedMainnetSettlements": mainnet_settlements,
                    "estimatedTestnetSettlements": testnet_settlements,
                    "isActive": key.is_active,
                    "expiresAt": key.expires_at.map(|d| d.to_string())
                }))
            ).into_response()
        }
        Err(e) => {
            warn!("Balance query failed: {}", e);
            (
                StatusCode::UNAUTHORIZED,
                Json(ErrorResponse::new("UNAUTHORIZED", "Invalid API key"))
            ).into_response()
        }
    }
}

/// Handle metrics query
async fn handle_metrics_query(
    state: Arc<AppState>,
    api_key_str: &str,
) -> axum::response::Response {
    match ApiKeyDb::validate_api_key(state.database.pool(), api_key_str).await {
        Ok(key) => {
            // Get transaction stats from database
            let stats = ApiKeyDb::get_api_key_stats(state.database.pool(), key.id).await
                .unwrap_or_default();
            
            (
                StatusCode::OK,
                Json(json!({
                    "success": true,
                    "usdc": format!("{:.6}", key.total_balance()),
                    "stats": {
                        "totalTransactions": stats.total_transactions,
                        "successfulTransactions": stats.successful_transactions,
                        "failedTransactions": stats.failed_transactions,
                        "successRate": if stats.total_transactions > 0 {
                            format!("{:.1}%", (stats.successful_transactions as f64 / stats.total_transactions as f64) * 100.0)
                        } else {
                            "N/A".to_string()
                        },
                        "totalSpent": format!("{:.6} USDC", stats.total_spent),
                        "totalGasCost": format!("{:.6} USDC", stats.total_gas_cost),
                        "totalServiceFees": format!("{:.6} USDC", stats.total_service_fees)
                    },
                    "createdAt": key.created_at.to_string(),
                    "lastUsed": key.last_used_at.map(|d| d.to_string())
                }))
            ).into_response()
        }
        Err(e) => {
            warn!("Metrics query failed: {}", e);
            (
                StatusCode::UNAUTHORIZED,
                Json(ErrorResponse::new("UNAUTHORIZED", "Invalid API key"))
            ).into_response()
        }
    }
}
