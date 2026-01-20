//! Credits Routes
//!
//! API endpoints for API key management and credit operations.
//! No authentication required - just use your API key!

use std::sync::Arc;
use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
    routing::{get, post},
    Json, Router,
};
use rand::Rng;
use rust_decimal::prelude::*;
use rust_decimal_macros::dec;
use serde_json::json;
use tracing::{info, warn, error};

use crate::routes::AppState;
use crate::services::ApiKeyDb;
use crate::types::{
    ApiKeyInfo, CreditPurchaseRequest, CreditPurchaseResponse,
    BalanceResponse,
};
use crate::types::api_key::BalanceType;
use crate::middleware::ValidatedJson;

/// Create credits router
pub fn create_credits_router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/credits", post(purchase_credits_handler))
        .route("/credits/:api_key", get(get_balance_handler))
        .route("/credits/:api_key/history", get(get_history_handler))
}

/// Generate a new API key (64-char hex string)
fn generate_api_key() -> String {
    let mut rng = rand::thread_rng();
    let bytes: [u8; 32] = rng.gen();
    hex::encode(bytes)
}

// =============================================================================
// PURCHASE CREDITS / CREATE API KEY
// =============================================================================

/// POST /credits
/// 
/// Purchase credits or create a new API key.
/// - If no api_key provided: Creates new API key with initial balance
/// - If api_key provided: Adds credits to existing key
///
/// Note: This is a simplified demo. In production, integrate with
/// actual payment processing (crypto payments, Stripe, etc.)
async fn purchase_credits_handler(
    State(state): State<Arc<AppState>>,
    ValidatedJson(request): ValidatedJson<CreditPurchaseRequest>,
) -> impl IntoResponse {
    let amount = Decimal::from_f64(request.amount).unwrap_or(dec!(0));
    
    info!("💳 Credit purchase request: ${:.2}, email={:?}, existing_key={}", 
          amount, request.email, request.api_key.is_some());
    
    // Check if adding to existing key or creating new
    if let Some(ref existing_key) = request.api_key {
        // Validate existing API key
        match ApiKeyDb::validate_api_key(state.database.pool(), existing_key).await {
            Ok(key) => {
                // Add credits to existing key (defaults to mainnet for manual purchases)
                match ApiKeyDb::add_credits(
                    state.database.pool(),
                    key.id,
                    amount,
                    BalanceType::Mainnet, // Manual purchases go to mainnet balance
                    Some(&format!("Credit top-up: ${:.2}", amount)),
                    None,
                ).await {
                    Ok(new_balance) => {
                        // Get updated key info
                        let updated_key = ApiKeyDb::get_api_key_by_id(state.database.pool(), key.id)
                            .await
                            .unwrap_or(key);
                        
                        info!("✅ Added ${:.2} to API key {}...{}, new balance: ${:.2}",
                              amount, &existing_key[..8], &existing_key[existing_key.len()-8..], new_balance);

                        // Send async notification
                        let notify_msg = format!("Credit top-up: ${:.2}\nKey: {}...{}\nNew Balance: ${:.2}", 
                            amount, &existing_key[..8], &existing_key[existing_key.len()-8..], new_balance);
                        crate::utils::send_admin_notification(&notify_msg, "💰 Credit Purchase");
                        
                        return (
                            StatusCode::OK,
                            Json(CreditPurchaseResponse {
                                success: true,
                                api_key: None, // Don't return existing key
                                info: ApiKeyInfo::from(&updated_key),
                                payment_address: None,
                                amount_usdc: None,
                                message: Some(format!("Added ${:.2} credits. New balance: ${:.2}", amount, new_balance)),
                            }),
                        );
                    }
                    Err(e) => {
                        error!("Failed to add credits: {}", e);
                        return (
                            StatusCode::INTERNAL_SERVER_ERROR,
                            Json(CreditPurchaseResponse {
                                success: false,
                                api_key: None,
                                info: ApiKeyInfo::from(&key),
                                payment_address: None,
                                amount_usdc: None,
                                message: Some(format!("Failed to add credits: {}", e)),
                            }),
                        );
                    }
                }
            }
            Err(e) => {
                warn!("Invalid API key for top-up: {}", e);
                return (
                    StatusCode::BAD_REQUEST,
                    Json(CreditPurchaseResponse {
                        success: false,
                        api_key: None,
                        info: ApiKeyInfo {
                            api_key_suffix: String::new(),
                            email: None,
                            balance: dec!(0),
                            mainnet_balance: dec!(0),
                            testnet_balance: dec!(0),
                            total_transactions: 0,
                            success_rate: 0.0,
                            is_active: false,
                            expires_at: None,
                            days_until_expiry: None,
                            created_at: String::new(),
                        },
                        payment_address: None,
                        amount_usdc: None,
                        message: Some(format!("Invalid API key: {}", e)),
                    }),
                );
            }
        }
    }
    
    // Create new API key
    let new_api_key = generate_api_key();
    
    match ApiKeyDb::create_api_key(
        state.database.pool(),
        &new_api_key,
        request.email.as_deref(),
        amount,
    ).await {
        Ok(key) => {
            info!("✅ Created new API key {}...{} with ${:.2} initial balance",
                  &new_api_key[..8], &new_api_key[new_api_key.len()-8..], amount);
            
            // Send async notification
            let notify_msg = format!("New API Key Created\nInitial Balance: ${:.2}", amount);
            crate::utils::send_admin_notification(&notify_msg, "🆕 New User Signup");
            
            (
                StatusCode::CREATED,
                Json(CreditPurchaseResponse {
                    success: true,
                    api_key: Some(new_api_key), // IMPORTANT: Only returned on creation!
                    info: ApiKeyInfo::from(&key),
                    payment_address: None,
                    amount_usdc: None,
                    message: Some("API key created. IMPORTANT: Save this key securely - it won't be shown again!".to_string()),
                }),
            )
        }
        Err(e) => {
            error!("Failed to create API key: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(CreditPurchaseResponse {
                    success: false,
                    api_key: None,
                    info: ApiKeyInfo {
                        api_key_suffix: String::new(),
                        email: None,
                        balance: dec!(0),
                        mainnet_balance: dec!(0),
                        testnet_balance: dec!(0),
                        total_transactions: 0,
                        success_rate: 0.0,
                        is_active: false,
                        expires_at: None,
                        days_until_expiry: None,
                        created_at: String::new(),
                    },
                    payment_address: None,
                    amount_usdc: None,
                    message: Some(format!("Failed to create API key: {}", e)),
                }),
            )
        }
    }
}

// =============================================================================
// GET BALANCE
// =============================================================================

/// GET /credits/:api_key
///
/// Get current balance and info for an API key.
async fn get_balance_handler(
    State(state): State<Arc<AppState>>,
    Path(api_key): Path<String>,
) -> impl IntoResponse {
    // Validate API key
    match ApiKeyDb::validate_api_key(state.database.pool(), &api_key).await {
        Ok(key) => {
            // Get recent transactions
            let recent = ApiKeyDb::get_ledger_entries(state.database.pool(), key.id, 10)
                .await
                .unwrap_or_default();
            
            // Estimate settlements remaining
            // Assume ~$0.006 per settlement (service fee + avg gas)
            let avg_cost = dec!(0.006);
            let total_balance = key.total_balance();
            let estimated_remaining = if avg_cost > dec!(0) {
                (total_balance / avg_cost).floor().to_i64().unwrap_or(0)
            } else {
                0
            };
            
            (
                StatusCode::OK,
                Json(BalanceResponse {
                    success: true,
                    balance: total_balance,
                    balance_formatted: format!("${:.4}", total_balance),
                    estimated_settlements_remaining: estimated_remaining,
                    info: ApiKeyInfo::from(&key),
                    recent_transactions: recent,
                }),
            )
        }
        Err(e) => {
            warn!("Balance check failed for key: {}", e);
            (
                StatusCode::UNAUTHORIZED,
                Json(BalanceResponse {
                    success: false,
                    balance: dec!(0),
                    balance_formatted: "$0.00".to_string(),
                    estimated_settlements_remaining: 0,
                    info: ApiKeyInfo {
                        api_key_suffix: String::new(),
                        email: None,
                        balance: dec!(0),
                        mainnet_balance: dec!(0),
                        testnet_balance: dec!(0),
                        total_transactions: 0,
                        success_rate: 0.0,
                        is_active: false,
                        expires_at: None,
                        days_until_expiry: None,
                        created_at: String::new(),
                    },
                    recent_transactions: vec![],
                }),
            )
        }
    }
}

// =============================================================================
// GET TRANSACTION HISTORY
// =============================================================================

/// GET /credits/:api_key/history
///
/// Get full transaction history for an API key.
async fn get_history_handler(
    State(state): State<Arc<AppState>>,
    Path(api_key): Path<String>,
) -> impl IntoResponse {
    // Validate API key
    match ApiKeyDb::validate_api_key(state.database.pool(), &api_key).await {
        Ok(key) => {
            // Get all ledger entries (max 100)
            let entries = ApiKeyDb::get_ledger_entries(state.database.pool(), key.id, 100)
                .await
                .unwrap_or_default();
            
            (
                StatusCode::OK,
                Json(json!({
                    "success": true,
                    "entries": entries,
                    "count": entries.len(),
                })),
            )
        }
        Err(e) => {
            warn!("History check failed for key: {}", e);
            (
                StatusCode::UNAUTHORIZED,
                Json(json!({
                    "success": false,
                    "error": format!("{}", e),
                    "entries": [],
                    "count": 0,
                })),
            )
        }
    }
}
