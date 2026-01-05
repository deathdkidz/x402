//! Merchant Routes
//!
//! API endpoints for merchant dashboard operations

use std::sync::Arc;
use axum::{
    extract::{Path, Query, State},
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
    routing::{get, post, put},
    Json, Router,
};
use chrono::{Datelike, Utc};
use serde::{Deserialize, Serialize};
use tracing::{error, info, warn};
use uuid::Uuid;

use crate::routes::AppState;

/// Create merchant API router
pub fn create_merchant_router() -> Router<Arc<AppState>> {
    Router::new()
        // SIWE Authentication (EIP-4361)
        .route("/merchant/siwe/nonce", get(siwe_nonce_handler))
        .route("/merchant/siwe/verify", post(siwe_verify_handler))
        // Session management
        .route("/merchant/session", post(session_handler))
        .route("/merchant/logout", post(logout_handler))
        // Dashboard endpoints
        .route("/merchant/:merchant_id/dashboard/stats", get(dashboard_stats_handler))
        .route("/merchant/:merchant_id/transactions", get(transactions_handler))
        .route("/merchant/:merchant_id/credits", get(credits_handler))
        .route("/merchant/:merchant_id/credits/balance", get(usd_balance_handler))
        .route("/merchant/:merchant_id/credits/packages", get(topup_packages_handler))
        .route("/merchant/:merchant_id/credits/topup", post(create_topup_order_handler))
        .route("/merchant/:merchant_id/credits/topup/:order_id", get(get_topup_order_handler))
        .route("/merchant/:merchant_id/analytics", get(analytics_handler))
        .route("/merchant/:merchant_id/settings", get(get_settings_handler))
        .route("/merchant/:merchant_id/settings", put(update_settings_handler))
}

// ============ Types ============

// SIWE Types
#[derive(Debug, Serialize)]
pub struct SiweNonceResponse {
    nonce: String,
}

#[derive(Debug, Deserialize)]
pub struct SiweVerifyRequest {
    message: String,
    signature: String,
}

#[derive(Debug, Serialize)]
pub struct AuthResponse {
    merchant: MerchantInfo,
    #[serde(rename = "sessionToken")]
    session_token: String,
    #[serde(rename = "isNewUser")]
    is_new_user: bool,
    #[serde(rename = "isAdmin", skip_serializing_if = "Option::is_none")]
    is_admin: Option<bool>,
    #[serde(rename = "adminRole", skip_serializing_if = "Option::is_none")]
    admin_role: Option<String>,
}

#[derive(Debug, Serialize, Clone)]
pub struct MerchantInfo {
    id: i64,
    #[serde(rename = "authAddress")]
    auth_address: String,
    #[serde(rename = "businessName")]
    business_name: String,
    #[serde(rename = "apiKey")]
    api_key: String,
    #[serde(rename = "creditBalance")]
    credit_balance: i32,
    #[serde(rename = "mainnetCreditBalance")]
    mainnet_credit_balance: i32,
    #[serde(rename = "testnetCreditsRemaining")]
    testnet_credits_remaining: i32,
    #[serde(rename = "testnetCreditsUsed")]
    testnet_credits_used: i32,
    status: String,
    #[serde(rename = "createdAt")]
    created_at: String,
}

#[derive(Debug, Deserialize)]
pub struct SessionRequest {
    #[serde(rename = "sessionToken")]
    session_token: String,
}

#[derive(Debug, Serialize)]
pub struct SessionResponse {
    merchant: MerchantInfo,
}

#[derive(Debug, Serialize)]
pub struct DashboardStats {
    #[serde(rename = "creditBalance")]
    credit_balance: i32,
    #[serde(rename = "mainnetCreditBalance")]
    mainnet_credit_balance: i32,
    #[serde(rename = "testnetCreditsRemaining")]
    testnet_credits_remaining: i32,
    #[serde(rename = "testnetCreditsUsed")]
    testnet_credits_used: i32,
    #[serde(rename = "testnetCreditsAllocated")]
    testnet_credits_allocated: i32,
    #[serde(rename = "currentPeriod")]
    current_period: String,
    #[serde(rename = "totalTransactions")]
    total_transactions: i64,
    #[serde(rename = "totalVolume")]
    total_volume: f64,
    #[serde(rename = "successRate")]
    success_rate: f64,
    #[serde(rename = "recentTransactions")]
    recent_transactions: Vec<TransactionInfo>,
    #[serde(rename = "volumeByDay")]
    volume_by_day: Vec<VolumeByDay>,
}

#[derive(Debug, Serialize)]
pub struct TransactionInfo {
    id: i64,
    #[serde(rename = "payerAddress")]
    payer_address: String,
    #[serde(rename = "recipientAddress")]
    recipient_address: String,
    amount: f64,
    asset: String,
    network: String,
    status: String,
    #[serde(rename = "txHash")]
    tx_hash: Option<String>,
    resource: Option<String>,
    #[serde(rename = "creditCost")]
    credit_cost: i32,
    #[serde(rename = "errorMessage")]
    error_message: Option<String>,
    #[serde(rename = "createdAt")]
    created_at: String,
    #[serde(rename = "updatedAt")]
    updated_at: String,
}

#[derive(Debug, Serialize)]
pub struct VolumeByDay {
    date: String,
    volume: f64,
}

#[derive(Debug, Deserialize)]
pub struct TransactionsQuery {
    page: Option<i32>,
    limit: Option<i32>,
    status: Option<String>,
    network: Option<String>,
    search: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct TransactionsResponse {
    transactions: Vec<TransactionInfo>,
    pagination: Pagination,
}

#[derive(Debug, Serialize)]
pub struct Pagination {
    page: i32,
    limit: i32,
    total: i64,
    #[serde(rename = "totalPages")]
    total_pages: i32,
}

#[derive(Debug, Serialize)]
pub struct CreditsResponse {
    balance: i32,
    #[serde(rename = "mainnetBalance")]
    mainnet_balance: i32,
    #[serde(rename = "testnetRemaining")]
    testnet_remaining: i32,
    #[serde(rename = "testnetUsed")]
    testnet_used: i32,
    #[serde(rename = "testnetAllocated")]
    testnet_allocated: i32,
    #[serde(rename = "currentPeriod")]
    current_period: String,
    #[serde(rename = "lifetimePurchased")]
    lifetime_purchased: i32,
    #[serde(rename = "lifetimeUsed")]
    lifetime_used: i32,
    #[serde(rename = "usedLast30Days")]
    used_last_30_days: i32,
    transactions: Vec<CreditTransaction>,
    purchases: Vec<CreditPurchase>,
}

#[derive(Debug, Serialize)]
pub struct CreditTransaction {
    id: i64,
    #[serde(rename = "type")]
    tx_type: String,
    amount: f64,
    #[serde(rename = "balanceBefore")]
    balance_before: f64,
    #[serde(rename = "balanceAfter")]
    balance_after: f64,
    description: Option<String>,
    #[serde(rename = "createdAt")]
    created_at: String,
}

#[derive(Debug, Serialize)]
pub struct CreditPurchase {
    id: i64,
    network: String,
    #[serde(rename = "txHash")]
    tx_hash: String,
    #[serde(rename = "tokenAmount")]
    token_amount: f64,
    #[serde(rename = "creditAmount")]
    credit_amount: i32,
    status: String,
    #[serde(rename = "createdAt")]
    created_at: String,
}

#[derive(Debug, Serialize)]
pub struct AnalyticsResponse {
    #[serde(rename = "totalVolume")]
    total_volume: f64,
    #[serde(rename = "totalCount")]
    total_count: i64,
    #[serde(rename = "avgTransaction")]
    avg_transaction: f64,
    #[serde(rename = "successRate")]
    success_rate: f64,
    #[serde(rename = "volumeByNetwork")]
    volume_by_network: Vec<VolumeByCategory>,
    #[serde(rename = "volumeByAsset")]
    volume_by_asset: Vec<VolumeByCategory>,
    #[serde(rename = "dailyVolume")]
    daily_volume: Vec<DailyVolume>,
    #[serde(rename = "hourlyDistribution")]
    hourly_distribution: Vec<HourlyCount>,
}

#[derive(Debug, Serialize)]
pub struct VolumeByCategory {
    name: String,
    value: f64,
    percentage: f64,
}

#[derive(Debug, Serialize)]
pub struct DailyVolume {
    date: String,
    volume: f64,
    count: i64,
    #[serde(rename = "successRate")]
    success_rate: f64,
}

#[derive(Debug, Serialize)]
pub struct HourlyCount {
    hour: i32,
    count: i64,
}

#[derive(Debug, Deserialize)]
pub struct AnalyticsQuery {
    period: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct MerchantSettings {
    merchant: MerchantSettingsInfo,
    notifications: NotificationSettings,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct MerchantSettingsInfo {
    id: i64,
    #[serde(rename = "businessName")]
    business_name: String,
    #[serde(rename = "businessEmail")]
    business_email: Option<String>,
    website: Option<String>,
    #[serde(rename = "walletAddress")]
    wallet_address: String,
    #[serde(rename = "supportEmail")]
    support_email: Option<String>,
    description: Option<String>,
    #[serde(rename = "apiKey")]
    api_key: String,
    #[serde(rename = "createdAt")]
    created_at: String,
}

#[derive(Debug, Serialize, Deserialize, Default)]
pub struct NotificationSettings {
    #[serde(rename = "emailSettlements", default)]
    email_settlements: bool,
    #[serde(rename = "emailFailures", default)]
    email_failures: bool,
    #[serde(rename = "emailCredits", default)]
    email_credits: bool,
    #[serde(rename = "emailWeekly", default)]
    email_weekly: bool,
    #[serde(rename = "emailMarketing", default)]
    email_marketing: bool,
}

#[derive(Debug, Deserialize)]
pub struct UpdateSettingsRequest {
    merchant: Option<UpdateMerchantInfo>,
    notifications: Option<NotificationSettings>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateMerchantInfo {
    #[serde(rename = "businessName")]
    business_name: Option<String>,
    #[serde(rename = "businessEmail")]
    business_email: Option<String>,
    website: Option<String>,
    #[serde(rename = "supportEmail")]
    support_email: Option<String>,
    description: Option<String>,
}

// Topup Types
#[derive(Debug, Serialize)]
pub struct TopupPackage {
    id: i64,
    name: String,
    description: Option<String>,
    #[serde(rename = "creditAmount")]
    credit_amount: i32,
    #[serde(rename = "priceUsdc")]
    price_usdc: f64,
    #[serde(rename = "bonusCredits")]
    bonus_credits: i32,
    #[serde(rename = "totalCredits")]
    total_credits: i32,
    #[serde(rename = "isPopular")]
    is_popular: bool,
}

#[derive(Debug, Deserialize)]
pub struct CreateTopupOrderRequest {
    #[serde(rename = "packageId")]
    package_id: Option<i64>,
    #[serde(rename = "creditAmount")]
    credit_amount: Option<i32>,
    network: String,
}

#[derive(Debug, Serialize)]
pub struct TopupOrder {
    #[serde(rename = "orderId")]
    order_id: String,
    #[serde(rename = "merchantId")]
    merchant_id: i64,
    #[serde(rename = "creditAmount")]
    credit_amount: i32,
    #[serde(rename = "bonusCredits")]
    bonus_credits: i32,
    #[serde(rename = "totalCredits")]
    total_credits: i32,
    #[serde(rename = "priceUsdc")]
    price_usdc: f64,
    network: String,
    status: String,
    #[serde(rename = "paymentAddress")]
    payment_address: String,
    #[serde(rename = "expiresAt")]
    expires_at: String,
    #[serde(rename = "createdAt")]
    created_at: String,
}

#[derive(Debug, Serialize)]
struct ApiResponse<T> {
    success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    data: Option<T>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

fn success_response<T: Serialize>(data: T) -> Response {
    let body = serde_json::to_string(&ApiResponse {
        success: true,
        data: Some(data),
        error: None::<String>,
    }).unwrap();
    
    Response::builder()
        .status(StatusCode::OK)
        .header("content-type", "application/json")
        .body(axum::body::Body::from(body))
        .unwrap()
}

fn error_response(message: &str, status: StatusCode) -> Response {
    let body = serde_json::to_string(&ApiResponse::<()> {
        success: false,
        data: None,
        error: Some(message.to_string()),
    }).unwrap();
    
    Response::builder()
        .status(status)
        .header("content-type", "application/json")
        .body(axum::body::Body::from(body))
        .unwrap()
}

/// Validate request authentication for merchant routes
/// Accepts either:
/// 1. X-Internal-Secret header (for internal dashboard calls)
/// 2. X-Session-Token header (for user session-based auth)
async fn validate_merchant_auth(
    pool: &sqlx::MySqlPool,
    headers: &HeaderMap,
    expected_merchant_id: i64,
    internal_secret: Option<&str>,
) -> Result<(), Response> {
    // First check for internal secret (trusted internal calls from netpay-web)
    if let Some(secret) = internal_secret {
        if let Some(provided_secret) = headers.get("X-Internal-Secret").and_then(|v| v.to_str().ok()) {
            if provided_secret == secret {
                // Internal secret matches - allow access
                return Ok(());
            }
        }
    }

    // Fall back to session token validation
    let session_token = headers
        .get("X-Session-Token")
        .and_then(|v| v.to_str().ok())
        .ok_or_else(|| {
            warn!("Missing authentication for merchant {}", expected_merchant_id);
            error_response("Unauthorized: Missing authentication", StatusCode::UNAUTHORIZED)
        })?;

    // Validate session and get merchant_id
    let session: Option<(i64,)> = sqlx::query_as(
        "SELECT merchant_id FROM merchant_sessions WHERE session_token = ? AND expires_at > NOW()"
    )
    .bind(session_token)
    .fetch_optional(pool)
    .await
    .map_err(|e| {
        error!("Database error validating session: {}", e);
        error_response("Internal server error", StatusCode::INTERNAL_SERVER_ERROR)
    })?;

    let session_merchant_id = session
        .ok_or_else(|| {
            warn!("Invalid or expired session token");
            error_response("Unauthorized: Invalid or expired session", StatusCode::UNAUTHORIZED)
        })?
        .0;

    // Ensure the session belongs to the requested merchant
    if session_merchant_id != expected_merchant_id {
        warn!(
            "Session merchant {} doesn't match requested merchant {}",
            session_merchant_id, expected_merchant_id
        );
        return Err(error_response("Forbidden: Access denied", StatusCode::FORBIDDEN));
    }

    Ok(())
}

// ============ Handlers ============

/// Generate SIWE nonce
async fn siwe_nonce_handler(
    State(state): State<Arc<AppState>>,
) -> Response {
    let db = &state.database;
    let pool = db.pool();
    
    // Generate random nonce (32 bytes hex)
    let nonce = format!("{:032x}{:032x}", rand::random::<u64>(), rand::random::<u64>());
    let expires_at = Utc::now() + chrono::Duration::minutes(10);
    
    // Store nonce in database
    if let Err(e) = sqlx::query(
        "INSERT INTO siwe_nonces (nonce, expires_at) VALUES (?, ?)"
    )
    .bind(&nonce)
    .bind(expires_at)
    .execute(pool)
    .await {
        error!("Failed to store nonce: {}", e);
        return error_response("Failed to generate nonce", StatusCode::INTERNAL_SERVER_ERROR);
    }
    
    // Cleanup expired nonces occasionally
    let _ = sqlx::query("DELETE FROM siwe_nonces WHERE expires_at < NOW()")
        .execute(pool)
        .await;
    
    success_response(SiweNonceResponse { nonce })
}

/// Verify SIWE message and authenticate
async fn siwe_verify_handler(
    State(state): State<Arc<AppState>>,
    Json(req): Json<SiweVerifyRequest>,
) -> Response {
    let db = &state.database;
    let pool = db.pool();
    
    // Parse SIWE message
    let siwe_message = match parse_siwe_message(&req.message) {
        Ok(msg) => msg,
        Err(e) => {
            warn!("Invalid SIWE message format: {}", e);
            return error_response("Invalid SIWE message format", StatusCode::BAD_REQUEST);
        }
    };
    
    let address = siwe_message.address.to_lowercase();
    info!("SIWE auth request for address: {}", address);
    
    // Verify nonce exists and is not expired/used
    let nonce_check: Option<(i64, bool)> = sqlx::query_as::<_, (i64, bool)>(
        "SELECT id, used FROM siwe_nonces WHERE nonce = ? AND expires_at > NOW()"
    )
    .bind(&siwe_message.nonce)
    .fetch_optional(pool)
    .await
    .ok()
    .flatten();
    
    match nonce_check {
        Some((_, true)) => {
            return error_response("Nonce already used", StatusCode::BAD_REQUEST);
        }
        None => {
            return error_response("Invalid or expired nonce", StatusCode::BAD_REQUEST);
        }
        _ => {}
    }
    
    // Mark nonce as used
    let _ = sqlx::query("UPDATE siwe_nonces SET used = TRUE, address = ? WHERE nonce = ?")
        .bind(&address)
        .bind(&siwe_message.nonce)
        .execute(pool)
        .await;
    
    // Verify signature using EIP-191 personal_sign
    match verify_signature(&req.message, &req.signature, &address) {
        Ok(true) => {}
        Ok(false) => {
            return error_response("Invalid signature", StatusCode::UNAUTHORIZED);
        }
        Err(e) => {
            error!("SIWE signature verification error: {}", e);
            return error_response("Signature verification failed", StatusCode::UNAUTHORIZED);
        }
    }
    
    // Check domain (optional - can be strict)
    // For now, we accept any domain for flexibility
    
    // Check if merchant exists
    let existing: Option<(i64,)> = sqlx::query_as::<_, (i64,)>(
        "SELECT id FROM merchants WHERE auth_address = ?"
    )
    .bind(&address)
    .fetch_optional(pool)
    .await
    .ok()
    .flatten();

    let (merchant_id, is_new_user) = match existing {
        Some((id,)) => (id, false),
        None => {
            // Create new merchant
            let api_key = format!("pk_live_{}", Uuid::new_v4().to_string().replace("-", ""));
            let business_name = format!("Merchant {}", &address[0..8]);

            let result = sqlx::query(
                r#"INSERT INTO merchants (auth_address, business_name, api_key, credit_balance, status)
                   VALUES (?, ?, ?, 0, 'active')"#
            )
            .bind(&address)
            .bind(&business_name)
            .bind(&api_key)
            .execute(pool)
            .await;

            match result {
                Ok(r) => (r.last_insert_id() as i64, true),
                Err(e) => {
                    error!("Failed to create merchant: {}", e);
                    return error_response("Failed to create account", StatusCode::INTERNAL_SERVER_ERROR);
                }
            }
        }
    };

    // Get merchant info
    let merchant_info = match get_merchant_info(pool, merchant_id).await {
        Ok(info) => info,
        Err(e) => {
            error!("Failed to get merchant info: {}", e);
            return error_response("Failed to get merchant info", StatusCode::INTERNAL_SERVER_ERROR);
        }
    };

    // Create session
    let session_token = Uuid::new_v4().to_string();
    let expires_at = Utc::now() + chrono::Duration::days(30);

    if let Err(e) = sqlx::query(
        "INSERT INTO merchant_sessions (merchant_id, session_token, auth_address, nonce, signature, expires_at) VALUES (?, ?, ?, ?, ?, ?)"
    )
    .bind(merchant_id)
    .bind(&session_token)
    .bind(&address)
    .bind(&siwe_message.nonce)
    .bind(&req.signature)
    .bind(expires_at)
    .execute(pool)
    .await {
        error!("Failed to create session: {}", e);
        return error_response("Failed to create session", StatusCode::INTERNAL_SERVER_ERROR);
    }

    // Update last active
    let _ = sqlx::query("UPDATE merchants SET last_active_at = NOW() WHERE id = ?")
        .bind(merchant_id)
        .execute(pool)
        .await;

    // Check if wallet is an admin
    let admin_info: Option<(String,)> = sqlx::query_as::<_, (String,)>(
        "SELECT role FROM admin_users WHERE wallet_address = ? AND is_active = 1"
    )
    .bind(&address)
    .fetch_optional(pool)
    .await
    .ok()
    .flatten();

    let (is_admin, admin_role) = match admin_info {
        Some((role,)) => (Some(true), Some(role)),
        None => (None, None),
    };

    success_response(AuthResponse {
        merchant: merchant_info,
        session_token,
        is_new_user,
        is_admin,
        admin_role,
    })
}

/// Validate session
async fn session_handler(
    State(state): State<Arc<AppState>>,
    Json(req): Json<SessionRequest>,
) -> Response {
    let db = &state.database;
    let pool = db.pool();

    // Find session
    let session: Option<(i64,)> = sqlx::query_as::<_, (i64,)>(
        "SELECT merchant_id FROM merchant_sessions WHERE session_token = ? AND expires_at > NOW()"
    )
    .bind(&req.session_token)
    .fetch_optional(pool)
    .await
    .ok()
    .flatten();

    let merchant_id = match session {
        Some((id,)) => id,
        None => {
            return error_response("Invalid or expired session", StatusCode::UNAUTHORIZED);
        }
    };

    let merchant_info = match get_merchant_info(pool, merchant_id).await {
        Ok(info) => info,
        Err(e) => {
            error!("Failed to get merchant info: {}", e);
            return error_response("Failed to get merchant info", StatusCode::INTERNAL_SERVER_ERROR);
        }
    };

    // Update last active
    let _ = sqlx::query("UPDATE merchants SET last_active_at = NOW() WHERE id = ?")
        .bind(merchant_id)
        .execute(pool)
        .await;

    success_response(SessionResponse { merchant: merchant_info })
}

/// Logout
async fn logout_handler(
    State(state): State<Arc<AppState>>,
    Json(req): Json<SessionRequest>,
) -> Response {
    let db = &state.database;
    let pool = db.pool();

    let _ = sqlx::query("DELETE FROM merchant_sessions WHERE session_token = ?")
        .bind(&req.session_token)
        .execute(pool)
        .await;

    success_response(serde_json::json!({ "success": true }))
}

/// Get dashboard stats
async fn dashboard_stats_handler(
    State(state): State<Arc<AppState>>,
    Path(merchant_id): Path<i64>,
    headers: HeaderMap,
) -> Response {
    let db = &state.database;
    let pool = db.pool();

    // Validate session token
    if let Err(response) = validate_merchant_auth(pool, &headers, merchant_id, state.config.internal_api_secret.as_deref()).await {
        return response;
    }

    // Get merchant credits
    let credits = match get_merchant_credits(pool, merchant_id).await {
        Ok(c) => c,
        Err(e) => {
            error!("Failed to get credits: {}", e);
            return error_response("Failed to get credits", StatusCode::INTERNAL_SERVER_ERROR);
        }
    };

    // Get transaction stats
    let stats: (i64, f64, f64) = sqlx::query_as::<_, (i64, f64, f64)>(
        r#"SELECT 
            COUNT(*) as total,
            COALESCE(SUM(CASE WHEN status = 'completed' THEN CAST(amount AS DECIMAL(36,18)) / 1000000 END), 0) as volume,
            COALESCE(COUNT(CASE WHEN status = 'completed' THEN 1 END) * 100.0 / NULLIF(COUNT(*), 0), 0) as success_rate
           FROM transactions WHERE merchant_id = ?"#
    )
    .bind(merchant_id)
    .fetch_one(pool)
    .await
    .unwrap_or((0, 0.0, 0.0));

    // Get recent transactions
    let recent: Vec<TransactionInfo> = get_recent_transactions(pool, merchant_id, 10).await.unwrap_or_default();

    // Get volume by day
    let volume_by_day: Vec<VolumeByDay> = get_volume_by_day(pool, merchant_id, 7).await.unwrap_or_default();

    success_response(DashboardStats {
        credit_balance: credits.mainnet_balance,
        mainnet_credit_balance: credits.mainnet_balance,
        testnet_credits_remaining: credits.testnet_remaining,
        testnet_credits_used: credits.testnet_used,
        testnet_credits_allocated: credits.testnet_allocated,
        current_period: credits.current_period,
        total_transactions: stats.0,
        total_volume: stats.1,
        success_rate: stats.2,
        recent_transactions: recent,
        volume_by_day,
    })
}

/// Get transactions
async fn transactions_handler(
    State(state): State<Arc<AppState>>,
    Path(merchant_id): Path<i64>,
    headers: HeaderMap,
    Query(query): Query<TransactionsQuery>,
) -> Response {
    let db = &state.database;
    let pool = db.pool();

    // Validate session token
    if let Err(response) = validate_merchant_auth(pool, &headers, merchant_id, state.config.internal_api_secret.as_deref()).await {
        return response;
    }

    let page = query.page.unwrap_or(1).max(1);
    let limit = query.limit.unwrap_or(20).min(100);
    let offset = (page - 1) * limit;

    // Build query
    let mut sql = String::from(
        "SELECT id, payer_address, recipient_address, amount, asset, network, status, 
                transaction_hash, resource, credit_cost, created_at, updated_at 
         FROM transactions WHERE merchant_id = ?"
    );
    let mut count_sql = String::from("SELECT COUNT(*) FROM transactions WHERE merchant_id = ?");

    if let Some(ref status) = query.status {
        sql.push_str(&format!(" AND status = '{}'", status));
        count_sql.push_str(&format!(" AND status = '{}'", status));
    }
    if let Some(ref network) = query.network {
        sql.push_str(&format!(" AND network = '{}'", network));
        count_sql.push_str(&format!(" AND network = '{}'", network));
    }
    if let Some(ref search) = query.search {
        let search_pattern = format!("%{}%", search);
        sql.push_str(&format!(" AND (payer_address LIKE '{}' OR transaction_hash LIKE '{}')", search_pattern, search_pattern));
        count_sql.push_str(&format!(" AND (payer_address LIKE '{}' OR transaction_hash LIKE '{}')", search_pattern, search_pattern));
    }

    sql.push_str(&format!(" ORDER BY created_at DESC LIMIT {} OFFSET {}", limit, offset));

    // Get total count
    let total: (i64,) = sqlx::query_as::<_, (i64,)>(&count_sql)
        .bind(merchant_id)
        .fetch_one(pool)
        .await
        .unwrap_or((0,));

    // Get transactions
    let rows: Vec<(i64, String, String, String, String, String, String, Option<String>, Option<String>, i32, chrono::DateTime<chrono::Utc>, chrono::DateTime<chrono::Utc>)> = 
        sqlx::query_as(&sql)
        .bind(merchant_id)
        .fetch_all(pool)
        .await
        .unwrap_or_default();

    let transactions: Vec<TransactionInfo> = rows.into_iter().map(|r| {
        let amount_f: f64 = r.3.parse::<f64>().unwrap_or(0.0) / 1_000_000.0;
        TransactionInfo {
            id: r.0,
            payer_address: r.1,
            recipient_address: r.2,
            amount: amount_f,
            asset: r.4,
            network: r.5,
            status: r.6,
            tx_hash: r.7,
            resource: r.8,
            credit_cost: r.9,
            error_message: None,
            created_at: r.10.to_rfc3339(),
            updated_at: r.11.to_rfc3339(),
        }
    }).collect();

    let total_pages = ((total.0 as f64) / (limit as f64)).ceil() as i32;

    success_response(TransactionsResponse {
        transactions,
        pagination: Pagination {
            page,
            limit,
            total: total.0,
            total_pages,
        },
    })
}

/// Get credits info
async fn credits_handler(
    State(state): State<Arc<AppState>>,
    Path(merchant_id): Path<i64>,
    headers: HeaderMap,
) -> Response {
    let db = &state.database;
    let pool = db.pool();

    // Validate session token
    if let Err(response) = validate_merchant_auth(pool, &headers, merchant_id, state.config.internal_api_secret.as_deref()).await {
        return response;
    }

    // Get merchant info
    let merchant: (i32, i32, i32) = sqlx::query_as::<_, (i32, i32, i32)>(
        "SELECT credit_balance, lifetime_credits_purchased, lifetime_credits_used FROM merchants WHERE id = ?"
    )
    .bind(merchant_id)
    .fetch_one(pool)
    .await
    .unwrap_or((0, 0, 0));

    // Get testnet credits
    let credits = get_merchant_credits(pool, merchant_id).await.unwrap_or_default();

    // Get usage last 30 days
    let used_30d: (i32,) = sqlx::query_as::<_, (i32,)>(
        "SELECT COALESCE(SUM(ABS(amount)), 0) FROM credit_transactions WHERE merchant_id = ? AND type = 'settlement_fee' AND created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)"
    )
    .bind(merchant_id)
    .fetch_one(pool)
    .await
    .unwrap_or((0,));

    // Get credit transactions
    let tx_rows: Vec<(i64, String, f64, f64, f64, Option<String>, chrono::DateTime<chrono::Utc>)> = sqlx::query_as(
        "SELECT id, type, amount, balance_before, balance_after, description, created_at FROM credit_transactions WHERE merchant_id = ? ORDER BY created_at DESC LIMIT 50"
    )
    .bind(merchant_id)
    .fetch_all(pool)
    .await
    .unwrap_or_default();

    let transactions: Vec<CreditTransaction> = tx_rows.into_iter().map(|r| CreditTransaction {
        id: r.0,
        tx_type: r.1,
        amount: r.2,
        balance_before: r.3,
        balance_after: r.4,
        description: r.5,
        created_at: r.6.to_rfc3339(),
    }).collect();

    // Get purchases
    let purchase_rows: Vec<(i64, String, String, f64, i32, String, chrono::DateTime<chrono::Utc>)> = sqlx::query_as(
        "SELECT id, network, tx_hash, token_amount, credit_amount, status, created_at FROM credit_purchases WHERE merchant_id = ? ORDER BY created_at DESC LIMIT 20"
    )
    .bind(merchant_id)
    .fetch_all(pool)
    .await
    .unwrap_or_default();

    let purchases: Vec<CreditPurchase> = purchase_rows.into_iter().map(|r| CreditPurchase {
        id: r.0,
        network: r.1,
        tx_hash: r.2,
        token_amount: r.3,
        credit_amount: r.4,
        status: r.5,
        created_at: r.6.to_rfc3339(),
    }).collect();

    success_response(CreditsResponse {
        balance: merchant.0,
        mainnet_balance: merchant.0,
        testnet_remaining: credits.testnet_remaining,
        testnet_used: credits.testnet_used,
        testnet_allocated: credits.testnet_allocated,
        current_period: credits.current_period,
        lifetime_purchased: merchant.1,
        lifetime_used: merchant.2,
        used_last_30_days: used_30d.0,
        transactions,
        purchases,
    })
}

// ============ USD Balance Types ============

/// USD balance response (with proper 4 decimal rounding for display)
#[derive(Debug, Serialize)]
pub struct UsdBalanceResponse {
    /// Current USD credit balance (rounded to 4 decimal places for display)
    #[serde(rename = "usdBalance")]
    usd_balance: String,
    /// Raw balance value (full precision for calculations)
    #[serde(rename = "rawBalance")]
    raw_balance: String,
    /// Lifetime USD credits purchased
    #[serde(rename = "lifetimePurchased")]
    lifetime_purchased: String,
    /// Lifetime USD credits used
    #[serde(rename = "lifetimeUsed")]
    lifetime_used: String,
    /// Service fee per transaction
    #[serde(rename = "serviceFeePerTx")]
    service_fee_per_tx: String,
    /// Current ETH/USD price used for gas calculations
    #[serde(rename = "ethUsdPrice")]
    eth_usd_price: String,
}

/// Get USD credit balance with precise decimal values
/// Rounds to 4 decimal places for UI display, but also returns raw precision
async fn usd_balance_handler(
    State(state): State<Arc<AppState>>,
    Path(merchant_id): Path<i64>,
    headers: HeaderMap,
) -> Response {
    use rust_decimal::prelude::*;
    use std::str::FromStr;
    
    let db = &state.database;
    let pool = db.pool();

    // Validate session token
    if let Err(response) = validate_merchant_auth(pool, &headers, merchant_id, state.config.internal_api_secret.as_deref()).await {
        return response;
    }

    // Get precise USD balance from database (as strings for precise parsing)
    let balance_row: Option<(String, String, String)> = 
        sqlx::query_as::<_, (String, String, String)>(
            "SELECT CAST(usd_credit_balance AS CHAR), CAST(lifetime_usd_credits_purchased AS CHAR), CAST(lifetime_usd_credits_used AS CHAR) FROM merchants WHERE id = ?"
        )
        .bind(merchant_id)
        .fetch_optional(pool)
        .await
        .unwrap_or(None);

    let (raw_balance, lifetime_purchased, lifetime_used) = match balance_row {
        Some((b, p, u)) => {
            let bal = rust_decimal::Decimal::from_str(&b).unwrap_or(rust_decimal::Decimal::ZERO);
            let pur = rust_decimal::Decimal::from_str(&p).unwrap_or(rust_decimal::Decimal::ZERO);
            let used = rust_decimal::Decimal::from_str(&u).unwrap_or(rust_decimal::Decimal::ZERO);
            (bal, pur, used)
        },
        None => {
            // Fallback: Try to get legacy integer balance and convert
            let legacy: Option<(i32, i32, i32)> = sqlx::query_as(
                "SELECT credit_balance, lifetime_credits_purchased, lifetime_credits_used FROM merchants WHERE id = ?"
            )
            .bind(merchant_id)
            .fetch_optional(pool)
            .await
            .unwrap_or(None);
            
            match legacy {
                Some((b, p, u)) => {
                    // Convert legacy integer credits to USD (1 credit = $0.01)
                    let dec_b = rust_decimal::Decimal::from(b) / rust_decimal::Decimal::from(100);
                    let dec_p = rust_decimal::Decimal::from(p) / rust_decimal::Decimal::from(100);
                    let dec_u = rust_decimal::Decimal::from(u) / rust_decimal::Decimal::from(100);
                    (dec_b, dec_p, dec_u)
                }
                None => {
                    return error_response("Merchant not found", StatusCode::NOT_FOUND);
                }
            }
        }
    };

    // Round to 4 decimal places for display
    let display_balance = raw_balance.round_dp(4);
    
    // Get current ETH price from the gas cost watcher
    let eth_price = state.gas_cost_watcher.get_eth_price();
    
    // Get service fee constant
    let service_fee = crate::services::gas_cost_watcher::SERVICE_FEE_USD;

    success_response(UsdBalanceResponse {
        usd_balance: format!("{:.4}", display_balance),
        raw_balance: raw_balance.to_string(),
        lifetime_purchased: format!("{:.4}", lifetime_purchased.round_dp(4)),
        lifetime_used: format!("{:.4}", lifetime_used.round_dp(4)),
        service_fee_per_tx: format!("{:.4}", service_fee),
        eth_usd_price: format!("{:.2}", eth_price),
    })
}

/// Get analytics
async fn analytics_handler(
    State(state): State<Arc<AppState>>,
    Path(merchant_id): Path<i64>,
    headers: HeaderMap,
    Query(query): Query<AnalyticsQuery>,
) -> Response {
    let db = &state.database;
    let pool = db.pool();

    // Validate session token
    if let Err(response) = validate_merchant_auth(pool, &headers, merchant_id, state.config.internal_api_secret.as_deref()).await {
        return response;
    }

    let period = query.period.unwrap_or("30d".to_string());
    let days = match period.as_str() {
        "7d" => 7,
        "30d" => 30,
        "90d" => 90,
        "all" => 365,
        _ => 30,
    };

    // Get overall stats
    let stats: (f64, i64, f64) = sqlx::query_as::<_, (f64, i64, f64)>(
        &format!(
            r#"SELECT 
                COALESCE(SUM(CASE WHEN status = 'completed' THEN CAST(amount AS DECIMAL(36,18)) / 1000000 END), 0),
                COUNT(*),
                COALESCE(COUNT(CASE WHEN status = 'completed' THEN 1 END) * 100.0 / NULLIF(COUNT(*), 0), 0)
               FROM transactions WHERE merchant_id = ? AND created_at >= DATE_SUB(NOW(), INTERVAL {} DAY)"#,
            days
        )
    )
    .bind(merchant_id)
    .fetch_one(pool)
    .await
    .unwrap_or((0.0, 0, 0.0));

    let avg_tx = if stats.1 > 0 { stats.0 / stats.1 as f64 } else { 0.0 };

    // Volume by network
    let network_rows: Vec<(String, f64)> = sqlx::query_as::<_, (String, f64)>(
        &format!(
            r#"SELECT network, COALESCE(SUM(CASE WHEN status = 'completed' THEN CAST(amount AS DECIMAL(36,18)) / 1000000 END), 0)
               FROM transactions WHERE merchant_id = ? AND created_at >= DATE_SUB(NOW(), INTERVAL {} DAY)
               GROUP BY network"#,
            days
        )
    )
    .bind(merchant_id)
    .fetch_all(pool)
    .await
    .unwrap_or_default();

    let volume_by_network: Vec<VolumeByCategory> = network_rows.iter().map(|r| {
        VolumeByCategory {
            name: r.0.clone(),
            value: r.1,
            percentage: if stats.0 > 0.0 { r.1 / stats.0 * 100.0 } else { 0.0 },
        }
    }).collect();

    // Volume by asset
    let asset_rows: Vec<(String, f64)> = sqlx::query_as::<_, (String, f64)>(
        &format!(
            r#"SELECT asset, COALESCE(SUM(CASE WHEN status = 'completed' THEN CAST(amount AS DECIMAL(36,18)) / 1000000 END), 0)
               FROM transactions WHERE merchant_id = ? AND created_at >= DATE_SUB(NOW(), INTERVAL {} DAY)
               GROUP BY asset"#,
            days
        )
    )
    .bind(merchant_id)
    .fetch_all(pool)
    .await
    .unwrap_or_default();

    let volume_by_asset: Vec<VolumeByCategory> = asset_rows.iter().map(|r| {
        VolumeByCategory {
            name: r.0.clone(),
            value: r.1,
            percentage: if stats.0 > 0.0 { r.1 / stats.0 * 100.0 } else { 0.0 },
        }
    }).collect();

    // Daily volume
    let daily_volume = get_volume_by_day(pool, merchant_id, days).await.unwrap_or_default();

    // Hourly distribution
    let hourly_rows: Vec<(i32, i64)> = sqlx::query_as::<_, (i32, i64)>(
        &format!(
            r#"SELECT HOUR(created_at) as hr, COUNT(*)
               FROM transactions WHERE merchant_id = ? AND created_at >= DATE_SUB(NOW(), INTERVAL {} DAY)
               GROUP BY hr ORDER BY hr"#,
            days
        )
    )
    .bind(merchant_id)
    .fetch_all(pool)
    .await
    .unwrap_or_default();

    let hourly_distribution: Vec<HourlyCount> = hourly_rows.into_iter().map(|r| HourlyCount {
        hour: r.0,
        count: r.1,
    }).collect();

    success_response(AnalyticsResponse {
        total_volume: stats.0,
        total_count: stats.1,
        avg_transaction: avg_tx,
        success_rate: stats.2,
        volume_by_network,
        volume_by_asset,
        daily_volume: daily_volume.into_iter().map(|v| DailyVolume {
            date: v.date,
            volume: v.volume,
            count: 0,
            success_rate: 100.0,
        }).collect(),
        hourly_distribution,
    })
}

/// Get merchant settings
async fn get_settings_handler(
    State(state): State<Arc<AppState>>,
    Path(merchant_id): Path<i64>,
    headers: HeaderMap,
) -> Response {
    let db = &state.database;
    let pool = db.pool();

    // Validate session token
    if let Err(response) = validate_merchant_auth(pool, &headers, merchant_id, state.config.internal_api_secret.as_deref()).await {
        return response;
    }

    let merchant: Option<(i64, String, Option<String>, Option<String>, String, Option<String>, Option<String>, String, chrono::DateTime<chrono::Utc>)> = sqlx::query_as::<_, (i64, String, Option<String>, Option<String>, String, Option<String>, Option<String>, String, chrono::DateTime<chrono::Utc>)>(
        "SELECT id, business_name, email, webhook_url, auth_address, email, profile_image_url, api_key, created_at FROM merchants WHERE id = ?"
    )
    .bind(merchant_id)
    .fetch_optional(pool)
    .await
    .ok()
    .flatten();

    match merchant {
        Some(m) => {
            success_response(MerchantSettings {
                merchant: MerchantSettingsInfo {
                    id: m.0,
                    business_name: m.1.clone(),
                    business_email: m.2.clone(),
                    website: m.3.clone(),
                    wallet_address: m.4,
                    support_email: m.5,
                    description: m.6,
                    api_key: m.7,
                    created_at: m.8.to_rfc3339(),
                },
                notifications: NotificationSettings::default(),
            })
        }
        None => error_response("Merchant not found", StatusCode::NOT_FOUND),
    }
}

/// Update merchant settings
async fn update_settings_handler(
    State(state): State<Arc<AppState>>,
    Path(merchant_id): Path<i64>,
    headers: HeaderMap,
    Json(req): Json<UpdateSettingsRequest>,
) -> Response {
    let db = &state.database;
    let pool = db.pool();

    // Validate session token
    if let Err(response) = validate_merchant_auth(pool, &headers, merchant_id, state.config.internal_api_secret.as_deref()).await {
        return response;
    }

    if let Some(merchant_update) = req.merchant {
        let mut updates = Vec::new();
        if let Some(name) = merchant_update.business_name {
            updates.push(format!("business_name = '{}'", name.replace("'", "''")));
        }
        if let Some(email) = merchant_update.business_email {
            updates.push(format!("email = '{}'", email.replace("'", "''")));
        }
        if let Some(website) = merchant_update.website {
            updates.push(format!("webhook_url = '{}'", website.replace("'", "''")));
        }

        if !updates.is_empty() {
            let sql = format!(
                "UPDATE merchants SET {}, updated_at = NOW() WHERE id = {}",
                updates.join(", "),
                merchant_id
            );
            let _ = sqlx::query(&sql).execute(pool).await;
        }
    }

    success_response(serde_json::json!({ "success": true }))
}

/// Get topup packages
async fn topup_packages_handler(
    State(state): State<Arc<AppState>>,
    Path(merchant_id): Path<i64>,
    headers: HeaderMap,
) -> Response {
    let db = &state.database;
    let pool = db.pool();

    // Validate session token
    if let Err(response) = validate_merchant_auth(pool, &headers, merchant_id, state.config.internal_api_secret.as_deref()).await {
        return response;
    }

    let rows: Vec<(i64, String, Option<String>, i32, f64, i32, bool)> = sqlx::query_as(
        "SELECT id, name, description, credit_amount, price_usdc, bonus_credits, is_popular FROM credit_packages WHERE is_active = 1 ORDER BY display_order"
    )
    .fetch_all(pool)
    .await
    .unwrap_or_default();

    let packages: Vec<TopupPackage> = rows.into_iter().map(|r| TopupPackage {
        id: r.0,
        name: r.1,
        description: r.2,
        credit_amount: r.3,
        price_usdc: r.4,
        bonus_credits: r.5,
        total_credits: r.3 + r.5,
        is_popular: r.6,
    }).collect();

    success_response(packages)
}

/// Create topup order
async fn create_topup_order_handler(
    State(state): State<Arc<AppState>>,
    Path(merchant_id): Path<i64>,
    headers: HeaderMap,
    Json(req): Json<CreateTopupOrderRequest>,
) -> Response {
    let db = &state.database;
    let pool = db.pool();

    // Validate session token
    if let Err(response) = validate_merchant_auth(pool, &headers, merchant_id, state.config.internal_api_secret.as_deref()).await {
        return response;
    }

    // Get package or calculate custom amount
    let (credit_amount, bonus_credits, price_usdc): (i32, i32, f64) = if let Some(pkg_id) = req.package_id {
        sqlx::query_as(
            "SELECT credit_amount, bonus_credits, price_usdc FROM credit_packages WHERE id = ? AND is_active = 1"
        )
        .bind(pkg_id)
        .fetch_one(pool)
        .await
        .unwrap_or((1000, 0, 10.0))
    } else if let Some(amount) = req.credit_amount {
        // Custom amount: $0.01 per credit
        (amount, 0, amount as f64 * 0.01)
    } else {
        return error_response("Package ID or credit amount required", StatusCode::BAD_REQUEST);
    };

    let order_id = format!("ord_{}", Uuid::new_v4().to_string().replace("-", "")[0..16].to_string());
    let expires_at = Utc::now() + chrono::Duration::minutes(30);

    // Get payment address from settings
    let payment_address: (String,) = sqlx::query_as::<_, (String,)>(
        "SELECT COALESCE(setting_value, '') FROM system_settings WHERE setting_key = 'topup_payment_address'"
    )
    .fetch_one(pool)
    .await
    .unwrap_or(("".to_string(),));

    // Create order
    let result = sqlx::query(
        r#"INSERT INTO credit_topup_orders (order_id, merchant_id, package_id, credit_amount, bonus_credits, price_usdc, network, status, expires_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'awaiting_payment', ?)"#
    )
    .bind(&order_id)
    .bind(merchant_id)
    .bind(req.package_id)
    .bind(credit_amount)
    .bind(bonus_credits)
    .bind(price_usdc)
    .bind(&req.network)
    .bind(expires_at)
    .execute(pool)
    .await;

    match result {
        Ok(_) => success_response(TopupOrder {
            order_id,
            merchant_id,
            credit_amount,
            bonus_credits,
            total_credits: credit_amount + bonus_credits,
            price_usdc,
            network: req.network,
            status: "awaiting_payment".to_string(),
            payment_address: payment_address.0,
            expires_at: expires_at.to_rfc3339(),
            created_at: Utc::now().to_rfc3339(),
        }),
        Err(e) => {
            error!("Failed to create order: {}", e);
            error_response("Failed to create order", StatusCode::INTERNAL_SERVER_ERROR)
        }
    }
}

/// Get topup order
async fn get_topup_order_handler(
    State(state): State<Arc<AppState>>,
    Path((merchant_id, order_id)): Path<(i64, String)>,
    headers: HeaderMap,
) -> Response {
    let db = &state.database;
    let pool = db.pool();

    // Validate session token
    if let Err(response) = validate_merchant_auth(pool, &headers, merchant_id, state.config.internal_api_secret.as_deref()).await {
        return response;
    }

    let order: Option<(String, i64, i32, i32, f64, String, String, chrono::DateTime<chrono::Utc>, chrono::DateTime<chrono::Utc>)> = sqlx::query_as::<_, (String, i64, i32, i32, f64, String, String, chrono::DateTime<chrono::Utc>, chrono::DateTime<chrono::Utc>)>(
        "SELECT order_id, merchant_id, credit_amount, bonus_credits, price_usdc, network, status, expires_at, created_at FROM credit_topup_orders WHERE order_id = ?"
    )
    .bind(&order_id)
    .fetch_optional(pool)
    .await
    .ok()
    .flatten();

    match order {
        Some(o) => {
            let payment_address: (String,) = sqlx::query_as::<_, (String,)>(
                "SELECT COALESCE(setting_value, '') FROM system_settings WHERE setting_key = 'topup_payment_address'"
            )
            .fetch_one(pool)
            .await
            .unwrap_or(("".to_string(),));

            success_response(TopupOrder {
                order_id: o.0,
                merchant_id: o.1,
                credit_amount: o.2,
                bonus_credits: o.3,
                total_credits: o.2 + o.3,
                price_usdc: o.4,
                network: o.5,
                status: o.6,
                payment_address: payment_address.0,
                expires_at: o.7.to_rfc3339(),
                created_at: o.8.to_rfc3339(),
            })
        }
        None => error_response("Order not found", StatusCode::NOT_FOUND),
    }
}

// ============ Helper Functions ============

#[derive(Default)]
struct MerchantCredits {
    mainnet_balance: i32,
    testnet_remaining: i32,
    testnet_used: i32,
    testnet_allocated: i32,
    current_period: String,
}

async fn get_merchant_credits(pool: &sqlx::MySqlPool, merchant_id: i64) -> Result<MerchantCredits, String> {
    let now = Utc::now();
    let year = now.year();
    let month = now.month() as i32;
    
    // Get mainnet balance
    let mainnet: (i32,) = sqlx::query_as::<_, (i32,)>(
        "SELECT credit_balance FROM merchants WHERE id = ?"
    )
    .bind(merchant_id)
    .fetch_one(pool)
    .await
    .map_err(|e| e.to_string())?;

    // Auto-allocate testnet credits if needed
    let _ = sqlx::query(
        r#"INSERT IGNORE INTO merchant_testnet_credits (merchant_id, period_year, period_month, credits_allocated)
           SELECT ?, ?, ?, CAST((SELECT setting_value FROM system_settings WHERE setting_key = 'testnet_monthly_credits') AS UNSIGNED)"#
    )
    .bind(merchant_id)
    .bind(year)
    .bind(month)
    .execute(pool)
    .await;

    // Get testnet credits
    let testnet: Option<(i32, i32, i32)> = sqlx::query_as::<_, (i32, i32, i32)>(
        "SELECT credits_remaining, credits_used, credits_allocated FROM merchant_testnet_credits WHERE merchant_id = ? AND period_year = ? AND period_month = ?"
    )
    .bind(merchant_id)
    .bind(year)
    .bind(month)
    .fetch_optional(pool)
    .await
    .map_err(|e| e.to_string())?;

    let (remaining, used, allocated) = testnet.unwrap_or((1000, 0, 1000));

    Ok(MerchantCredits {
        mainnet_balance: mainnet.0,
        testnet_remaining: remaining,
        testnet_used: used,
        testnet_allocated: allocated,
        current_period: format!("{}-{:02}", year, month),
    })
}

async fn get_merchant_info(pool: &sqlx::MySqlPool, merchant_id: i64) -> Result<MerchantInfo, String> {
    let row: (i64, String, Option<String>, String, i32, String, chrono::DateTime<chrono::Utc>) = sqlx::query_as::<_, (i64, String, Option<String>, String, i32, String, chrono::DateTime<chrono::Utc>)>(
        "SELECT id, auth_address, business_name, api_key, credit_balance, status, created_at FROM merchants WHERE id = ?"
    )
    .bind(merchant_id)
    .fetch_one(pool)
    .await
    .map_err(|e| e.to_string())?;

    let credits = get_merchant_credits(pool, merchant_id).await?;

    Ok(MerchantInfo {
        id: row.0,
        auth_address: row.1,
        business_name: row.2.unwrap_or_else(|| "New Merchant".to_string()),
        api_key: row.3,
        credit_balance: row.4,
        mainnet_credit_balance: row.4, // Same as credit_balance (consolidated)
        testnet_credits_remaining: credits.testnet_remaining,
        testnet_credits_used: credits.testnet_used,
        status: row.5,
        created_at: row.6.to_rfc3339(),
    })
}

async fn get_recent_transactions(pool: &sqlx::MySqlPool, merchant_id: i64, limit: i32) -> Result<Vec<TransactionInfo>, String> {
    let rows: Vec<(i64, String, String, String, String, String, String, Option<String>, Option<String>, i32, chrono::DateTime<chrono::Utc>, chrono::DateTime<chrono::Utc>)> = sqlx::query_as(
        &format!(
            "SELECT id, payer_address, recipient_address, amount, asset, network, status, transaction_hash, resource, credit_cost, created_at, updated_at FROM transactions WHERE merchant_id = ? ORDER BY created_at DESC LIMIT {}", 
            limit
        )
    )
    .bind(merchant_id)
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(rows.into_iter().map(|r| {
        let amount_f: f64 = r.3.parse::<f64>().unwrap_or(0.0) / 1_000_000.0;
        TransactionInfo {
            id: r.0,
            payer_address: r.1,
            recipient_address: r.2,
            amount: amount_f,
            asset: r.4,
            network: r.5,
            status: r.6,
            tx_hash: r.7,
            resource: r.8,
            credit_cost: r.9,
            error_message: None,
            created_at: r.10.to_rfc3339(),
            updated_at: r.11.to_rfc3339(),
        }
    }).collect())
}

async fn get_volume_by_day(pool: &sqlx::MySqlPool, merchant_id: i64, days: i32) -> Result<Vec<VolumeByDay>, String> {
    let rows: Vec<(String, f64)> = sqlx::query_as::<_, (String, f64)>(
        &format!(
            r#"SELECT DATE_FORMAT(created_at, '%Y-%m-%d'), COALESCE(SUM(CASE WHEN status = 'completed' THEN CAST(amount AS DECIMAL(36,18)) / 1000000 END), 0)
               FROM transactions WHERE merchant_id = ? AND created_at >= DATE_SUB(NOW(), INTERVAL {} DAY)
               GROUP BY DATE(created_at) ORDER BY DATE(created_at)"#,
            days
        )
    )
    .bind(merchant_id)
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(rows.into_iter().map(|r| VolumeByDay {
        date: r.0,
        volume: r.1,
    }).collect())
}

/// Verify Ethereum signature using alloy
fn verify_signature(message: &str, signature: &str, expected_address: &str) -> Result<bool, String> {
    use alloy::primitives::{Address, keccak256};
    use alloy::signers::Signature;
    
    // Parse signature
    let sig_bytes = hex::decode(signature.strip_prefix("0x").unwrap_or(signature))
        .map_err(|e| format!("Invalid signature hex: {}", e))?;
    
    if sig_bytes.len() != 65 {
        return Err("Invalid signature length".to_string());
    }

    // Create signature (r, s, v)
    let sig = Signature::try_from(sig_bytes.as_slice())
        .map_err(|e| format!("Invalid signature format: {}", e))?;

    // Hash the message with Ethereum prefix
    let prefixed_message = format!("\x19Ethereum Signed Message:\n{}{}", message.len(), message);
    let message_hash = keccak256(prefixed_message.as_bytes());

    // Recover the address
    let recovered = sig.recover_address_from_prehash(&message_hash)
        .map_err(|e| format!("Failed to recover address: {}", e))?;

    let expected = expected_address.parse::<Address>()
        .map_err(|e| format!("Invalid expected address: {}", e))?;

    Ok(recovered == expected)
}

/// Parsed SIWE message fields
struct SiweMessage {
    address: String,
    nonce: String,
    #[allow(dead_code)]
    domain: String,
    #[allow(dead_code)]
    uri: String,
    #[allow(dead_code)]
    chain_id: Option<u64>,
}

/// Parse SIWE message according to EIP-4361
fn parse_siwe_message(message: &str) -> Result<SiweMessage, String> {
    // SIWE message format:
    // {domain} wants you to sign in with your Ethereum account:
    // {address}
    //
    // {statement (optional)}
    //
    // URI: {uri}
    // Version: {version}
    // Chain ID: {chain_id}
    // Nonce: {nonce}
    // Issued At: {issued_at}
    
    let lines: Vec<&str> = message.lines().collect();
    
    if lines.len() < 5 {
        return Err("Message too short".to_string());
    }
    
    // Parse domain from first line
    let first_line = lines[0];
    let domain = if let Some(pos) = first_line.find(" wants you to sign in") {
        first_line[..pos].to_string()
    } else {
        return Err("Invalid SIWE format: missing domain".to_string());
    };
    
    // Address is on line 2 (index 1)
    let address = lines.get(1)
        .ok_or("Missing address")?
        .trim()
        .to_lowercase();
    
    // Validate address format
    if !address.starts_with("0x") || address.len() != 42 {
        return Err(format!("Invalid address format: {}", address));
    }
    
    // Parse fields from remaining lines
    let mut uri = String::new();
    let mut nonce = String::new();
    let mut chain_id = None;
    
    for line in &lines {
        let line = line.trim();
        if let Some(value) = line.strip_prefix("URI: ") {
            uri = value.to_string();
        } else if let Some(value) = line.strip_prefix("Nonce: ") {
            nonce = value.to_string();
        } else if let Some(value) = line.strip_prefix("Chain ID: ") {
            chain_id = value.parse().ok();
        }
    }
    
    if nonce.is_empty() {
        return Err("Missing nonce".to_string());
    }
    
    Ok(SiweMessage {
        address,
        nonce,
        domain,
        uri,
        chain_id,
    })
}
