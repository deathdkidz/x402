//! Admin Routes
//!
//! API endpoints for admin control panel operations

use std::sync::Arc;
use axum::{
    extract::{Path, Query, State},
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
    routing::{get, post, put, delete},
    Json, Router,
};
use bcrypt::{hash, verify, DEFAULT_COST};
use chrono::{Datelike, Utc};
use serde::{Deserialize, Serialize};
use totp_rs::{Algorithm, Secret, TOTP};
use tracing::{error, info, warn};
use uuid::Uuid;

use crate::routes::AppState;

/// Create admin API router
pub fn create_admin_router() -> Router<Arc<AppState>> {
    Router::new()
        // Auth
        .route("/admin/auth/login", post(admin_login_handler))
        .route("/admin/auth/session", post(admin_session_handler))
        .route("/admin/auth/logout", post(admin_logout_handler))
        // Dashboard
        .route("/admin/dashboard", get(admin_dashboard_handler))
        // Merchants
        .route("/admin/merchants", get(list_merchants_handler))
        .route("/admin/merchants/:merchant_id", get(get_merchant_handler))
        .route("/admin/merchants/:merchant_id", put(update_merchant_handler))
        .route("/admin/merchants/:merchant_id/ban", post(ban_merchant_handler))
        .route("/admin/merchants/:merchant_id/unban", post(unban_merchant_handler))
        .route("/admin/merchants/:merchant_id/credits", post(adjust_credits_handler))
        // Transactions
        .route("/admin/transactions", get(list_all_transactions_handler))
        .route("/admin/transactions/:tx_id", get(get_transaction_handler))
        // System
        .route("/admin/settings", get(get_settings_handler))
        .route("/admin/settings", put(update_settings_handler))
        .route("/admin/metrics", get(get_metrics_handler))
        // Audit
        .route("/admin/audit", get(get_audit_log_handler))
        // Topup management
        .route("/admin/topup/orders", get(list_topup_orders_handler))
        .route("/admin/topup/orders/:order_id/complete", post(complete_topup_order_handler))
}

// ============ Types ============

#[derive(Debug, Deserialize)]
pub struct AdminLoginRequest {
    username: String,
    password: String,
    #[serde(rename = "totpCode")]
    totp_code: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct AdminLoginResponse {
    admin: AdminInfo,
    #[serde(rename = "sessionToken")]
    session_token: String,
}

#[derive(Debug, Serialize, Clone)]
pub struct AdminInfo {
    id: i64,
    username: String,
    #[serde(rename = "displayName")]
    display_name: Option<String>,
    role: String,
    #[serde(rename = "totpEnabled")]
    totp_enabled: bool,
}

#[derive(Debug, Deserialize)]
pub struct AdminSessionRequest {
    #[serde(rename = "sessionToken")]
    session_token: String,
}

#[derive(Debug, Serialize)]
pub struct AdminDashboardStats {
    #[serde(rename = "totalMerchants")]
    total_merchants: i64,
    #[serde(rename = "activeMerchants")]
    active_merchants: i64,
    #[serde(rename = "pendingMerchants")]
    pending_merchants: i64,
    #[serde(rename = "suspendedMerchants")]
    suspended_merchants: i64,
    #[serde(rename = "bannedMerchants")]
    banned_merchants: i64,
    #[serde(rename = "totalSettlements24h")]
    total_settlements_24h: i64,
    #[serde(rename = "totalSettlements7d")]
    total_settlements_7d: i64,
    #[serde(rename = "totalVolume24h")]
    total_volume_24h: f64,
    #[serde(rename = "totalVolume7d")]
    total_volume_7d: f64,
    #[serde(rename = "totalCreditsUsed")]
    total_credits_used: i64,
    #[serde(rename = "totalCreditsPurchased")]
    total_credits_purchased: i64,
    #[serde(rename = "successRate24h")]
    success_rate_24h: f64,
    #[serde(rename = "recentSettlements")]
    recent_settlements: Vec<SettlementInfo>,
}

#[derive(Debug, Serialize)]
pub struct SettlementInfo {
    id: i64,
    #[serde(rename = "merchantName")]
    merchant_name: String,
    amount: f64,
    network: String,
    status: String,
    #[serde(rename = "createdAt")]
    created_at: String,
}

#[derive(Debug, Deserialize)]
pub struct MerchantListQuery {
    page: Option<i32>,
    limit: Option<i32>,
    status: Option<String>,
    search: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct MerchantListResponse {
    merchants: Vec<MerchantDetail>,
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
pub struct MerchantDetail {
    id: i64,
    #[serde(rename = "authAddress")]
    auth_address: String,
    #[serde(rename = "businessName")]
    business_name: Option<String>,
    email: Option<String>,
    #[serde(rename = "creditBalance")]
    credit_balance: i32,
    #[serde(rename = "mainnetCreditBalance")]
    mainnet_credit_balance: i32,
    #[serde(rename = "lifetimeCreditsPurchased")]
    lifetime_credits_purchased: i32,
    #[serde(rename = "lifetimeCreditsUsed")]
    lifetime_credits_used: i32,
    status: String,
    #[serde(rename = "isActive")]
    is_active: bool,
    #[serde(rename = "createdAt")]
    created_at: String,
    #[serde(rename = "lastActiveAt")]
    last_active_at: Option<String>,
    #[serde(rename = "settlementCount")]
    settlement_count: i64,
    #[serde(rename = "totalVolume")]
    total_volume: f64,
}

#[derive(Debug, Deserialize)]
pub struct UpdateMerchantRequest {
    #[serde(rename = "businessName")]
    business_name: Option<String>,
    email: Option<String>,
    status: Option<String>,
    #[serde(rename = "isActive")]
    is_active: Option<bool>,
    #[serde(rename = "testnetCreditsEnabled")]
    testnet_credits_enabled: Option<bool>,
}

#[derive(Debug, Deserialize)]
pub struct BanMerchantRequest {
    reason: String,
}

#[derive(Debug, Deserialize)]
pub struct AdjustCreditsRequest {
    #[serde(rename = "type")]
    credit_type: String, // "mainnet" or "testnet"
    amount: i32,
    reason: String,
}

#[derive(Debug, Deserialize)]
pub struct TransactionListQuery {
    page: Option<i32>,
    limit: Option<i32>,
    status: Option<String>,
    network: Option<String>,
    #[serde(rename = "merchantId")]
    merchant_id: Option<i64>,
    search: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct TransactionListResponse {
    transactions: Vec<TransactionDetail>,
    pagination: Pagination,
}

#[derive(Debug, Serialize)]
pub struct TransactionDetail {
    id: i64,
    #[serde(rename = "merchantId")]
    merchant_id: Option<i64>,
    #[serde(rename = "merchantName")]
    merchant_name: Option<String>,
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
    #[serde(rename = "createdAt")]
    created_at: String,
}

#[derive(Debug, Serialize)]
pub struct SystemSettings {
    settings: Vec<SettingItem>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SettingItem {
    key: String,
    value: String,
    #[serde(rename = "type")]
    setting_type: String,
    description: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateSettingsRequest {
    settings: Vec<SettingItem>,
}

#[derive(Debug, Serialize)]
pub struct SystemMetrics {
    uptime: f64,
    #[serde(rename = "totalRequests")]
    total_requests: i64,
    #[serde(rename = "requestsPerMinute")]
    requests_per_minute: f64,
    #[serde(rename = "avgResponseTime")]
    avg_response_time: f64,
    #[serde(rename = "activeConnections")]
    active_connections: i32,
    #[serde(rename = "paymasterBalances")]
    paymaster_balances: Vec<PaymasterBalance>,
}

#[derive(Debug, Serialize)]
pub struct PaymasterBalance {
    address: String,
    network: String,
    balance: f64,
}

#[derive(Debug, Deserialize)]
pub struct AuditLogQuery {
    page: Option<i32>,
    limit: Option<i32>,
    action: Option<String>,
    #[serde(rename = "adminId")]
    admin_id: Option<i64>,
}

#[derive(Debug, Serialize)]
pub struct AuditLogResponse {
    logs: Vec<AuditLogEntry>,
    pagination: Pagination,
}

#[derive(Debug, Serialize)]
pub struct AuditLogEntry {
    id: i64,
    #[serde(rename = "adminId")]
    admin_id: Option<i64>,
    #[serde(rename = "adminUsername")]
    admin_username: Option<String>,
    action: String,
    #[serde(rename = "entityType")]
    entity_type: Option<String>,
    #[serde(rename = "entityId")]
    entity_id: Option<String>,
    #[serde(rename = "oldValue")]
    old_value: Option<serde_json::Value>,
    #[serde(rename = "newValue")]
    new_value: Option<serde_json::Value>,
    #[serde(rename = "ipAddress")]
    ip_address: Option<String>,
    #[serde(rename = "createdAt")]
    created_at: String,
}

#[derive(Debug, Deserialize)]
pub struct TopupOrdersQuery {
    page: Option<i32>,
    limit: Option<i32>,
    status: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct TopupOrdersResponse {
    orders: Vec<TopupOrderDetail>,
    pagination: Pagination,
}

#[derive(Debug, Serialize)]
pub struct TopupOrderDetail {
    id: i64,
    #[serde(rename = "orderId")]
    order_id: String,
    #[serde(rename = "merchantId")]
    merchant_id: i64,
    #[serde(rename = "merchantName")]
    merchant_name: Option<String>,
    #[serde(rename = "creditAmount")]
    credit_amount: i32,
    #[serde(rename = "bonusCredits")]
    bonus_credits: i32,
    #[serde(rename = "priceUsdc")]
    price_usdc: f64,
    network: Option<String>,
    status: String,
    #[serde(rename = "expiresAt")]
    expires_at: String,
    #[serde(rename = "createdAt")]
    created_at: String,
}

#[derive(Debug, Deserialize)]
pub struct CompleteTopupRequest {
    #[serde(rename = "txHash")]
    tx_hash: String,
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

/// Validate admin session from X-Admin-Session header or X-Internal-Secret
/// Returns (admin_id, admin_username, admin_role) on success
async fn validate_admin_auth(
    pool: &sqlx::MySqlPool,
    headers: &HeaderMap,
    internal_secret: Option<&str>,
) -> Result<(i64, String, String), Response> {
    // First check for internal secret (for internal dashboard calls)
    if let Some(secret) = internal_secret {
        if let Some(provided_secret) = headers.get("X-Internal-Secret").and_then(|v| v.to_str().ok()) {
            if provided_secret == secret {
                // Internal secret valid - return system admin
                return Ok((0, "system".to_string(), "superadmin".to_string()));
            }
        }
    }

    // Get session token from header
    let session_token = headers
        .get("X-Admin-Session")
        .and_then(|v| v.to_str().ok())
        .ok_or_else(|| {
            warn!("Missing admin session token");
            error_response("Unauthorized: Missing admin session", StatusCode::UNAUTHORIZED)
        })?;

    // Validate session and get admin info
    let session: Option<(i64, String, String)> = sqlx::query_as::<_, (i64, String, String)>(
        r#"SELECT a.id, a.username, a.role 
           FROM admin_sessions s 
           JOIN admin_users a ON s.admin_id = a.id 
           WHERE s.session_token = ? AND s.expires_at > NOW() AND a.is_active = 1"#
    )
    .bind(session_token)
    .fetch_optional(pool)
    .await
    .map_err(|e| {
        error!("Database error validating admin session: {}", e);
        error_response("Internal server error", StatusCode::INTERNAL_SERVER_ERROR)
    })?;

    session.ok_or_else(|| {
        warn!("Invalid or expired admin session");
        error_response("Unauthorized: Invalid or expired session", StatusCode::UNAUTHORIZED)
    })
}

// ============ Handlers ============

/// Admin login
async fn admin_login_handler(
    State(state): State<Arc<AppState>>,
    Json(req): Json<AdminLoginRequest>,
) -> Response {
    info!("Admin login attempt for: {}", req.username);

    let db = &state.database;
    let pool = db.pool();

    // Find admin
    let admin: Option<(i64, String, Option<String>, String, String, bool)> = sqlx::query_as::<_, (i64, String, Option<String>, String, String, bool)>(
        "SELECT id, username, display_name, role, password_hash, totp_enabled FROM admin_users WHERE username = ? AND is_active = 1"
    )
    .bind(&req.username)
    .fetch_optional(pool)
    .await
    .ok()
    .flatten();

    let admin = match admin {
        Some(a) => a,
        None => {
            return error_response("Invalid credentials", StatusCode::UNAUTHORIZED);
        }
    };

    // Verify password
    match verify(&req.password, &admin.4) {
        Ok(true) => {}
        _ => {
            return error_response("Invalid credentials", StatusCode::UNAUTHORIZED);
        }
    }

    // TOTP verification if enabled
    if admin.5 {
        // totp_enabled is true
        let totp_code = match &req.totp_code {
            Some(code) => code,
            None => {
                return error_response("TOTP code required", StatusCode::UNAUTHORIZED);
            }
        };
        
        // Get TOTP secret from database
        let totp_secret: Option<(String,)> = sqlx::query_as::<_, (String,)>(
            "SELECT totp_secret FROM admin_users WHERE id = ? AND totp_secret IS NOT NULL"
        )
        .bind(admin.0)
        .fetch_optional(pool)
        .await
        .ok()
        .flatten();
        
        match totp_secret {
            Some((secret,)) => {
                // Verify TOTP code using simple time-based validation
                if !verify_totp(&secret, totp_code) {
                    warn!("Invalid TOTP code for admin: {}", admin.1);
                    return error_response("Invalid TOTP code", StatusCode::UNAUTHORIZED);
                }
            }
            None => {
                // TOTP enabled but no secret - shouldn't happen, but fail securely
                error!("TOTP enabled but no secret for admin: {}", admin.1);
                return error_response("TOTP configuration error", StatusCode::INTERNAL_SERVER_ERROR);
            }
        }
    }

    // Create session
    let session_token = Uuid::new_v4().to_string();
    let expires_at = Utc::now() + chrono::Duration::hours(24);

    if let Err(e) = sqlx::query(
        "INSERT INTO admin_sessions (admin_id, session_token, expires_at) VALUES (?, ?, ?)"
    )
    .bind(admin.0)
    .bind(&session_token)
    .bind(expires_at)
    .execute(pool)
    .await {
        error!("Failed to create admin session: {}", e);
        return error_response("Failed to create session", StatusCode::INTERNAL_SERVER_ERROR);
    }

    // Update last login
    let _ = sqlx::query("UPDATE admin_users SET last_login_at = NOW() WHERE id = ?")
        .bind(admin.0)
        .execute(pool)
        .await;

    // Audit log
    let _ = log_admin_action(pool, admin.0, &admin.1, "login", None, None, None).await;

    success_response(AdminLoginResponse {
        admin: AdminInfo {
            id: admin.0,
            username: admin.1,
            display_name: admin.2,
            role: admin.3,
            totp_enabled: admin.5,
        },
        session_token,
    })
}

/// Validate admin session
async fn admin_session_handler(
    State(state): State<Arc<AppState>>,
    Json(req): Json<AdminSessionRequest>,
) -> Response {
    let db = &state.database;
    let pool = db.pool();

    let session: Option<(i64,)> = sqlx::query_as::<_, (i64,)>(
        "SELECT admin_id FROM admin_sessions WHERE session_token = ? AND expires_at > NOW()"
    )
    .bind(&req.session_token)
    .fetch_optional(pool)
    .await
    .ok()
    .flatten();

    let admin_id = match session {
        Some((id,)) => id,
        None => {
            return error_response("Invalid or expired session", StatusCode::UNAUTHORIZED);
        }
    };

    let admin: Option<(i64, String, Option<String>, String, bool)> = sqlx::query_as::<_, (i64, String, Option<String>, String, bool)>(
        "SELECT id, username, display_name, role, totp_enabled FROM admin_users WHERE id = ? AND is_active = 1"
    )
    .bind(admin_id)
    .fetch_optional(pool)
    .await
    .ok()
    .flatten();

    match admin {
        Some(a) => success_response(AdminInfo {
            id: a.0,
            username: a.1,
            display_name: a.2,
            role: a.3,
            totp_enabled: a.4,
        }),
        None => error_response("Admin not found", StatusCode::NOT_FOUND),
    }
}

/// Admin logout
async fn admin_logout_handler(
    State(state): State<Arc<AppState>>,
    Json(req): Json<AdminSessionRequest>,
) -> Response {
    let db = &state.database;
    let pool = db.pool();

    let _ = sqlx::query("DELETE FROM admin_sessions WHERE session_token = ?")
        .bind(&req.session_token)
        .execute(pool)
        .await;

    success_response(serde_json::json!({ "success": true }))
}

/// Admin dashboard stats
async fn admin_dashboard_handler(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Response {
    let db = &state.database;
    let pool = db.pool();

    // Validate admin session
    if let Err(response) = validate_admin_auth(pool, &headers, state.config.internal_api_secret.as_deref()).await {
        return response;
    }

    // Merchant counts
    let merchants: (i64, i64, i64, i64, i64) = sqlx::query_as::<_, (i64, i64, i64, i64, i64)>(
        r#"SELECT 
            COUNT(*),
            SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END),
            SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END),
            SUM(CASE WHEN status = 'suspended' THEN 1 ELSE 0 END),
            SUM(CASE WHEN status = 'banned' THEN 1 ELSE 0 END)
           FROM merchants"#
    )
    .fetch_one(pool)
    .await
    .unwrap_or((0, 0, 0, 0, 0));

    // Settlement stats 24h
    let stats_24h: (i64, f64, f64) = sqlx::query_as::<_, (i64, f64, f64)>(
        r#"SELECT 
            COUNT(*),
            COALESCE(SUM(CASE WHEN status = 'completed' THEN CAST(amount AS DECIMAL(36,18)) / 1000000 END), 0),
            COALESCE(COUNT(CASE WHEN status = 'completed' THEN 1 END) * 100.0 / NULLIF(COUNT(*), 0), 0)
           FROM transactions WHERE created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)"#
    )
    .fetch_one(pool)
    .await
    .unwrap_or((0, 0.0, 0.0));

    // Settlement stats 7d
    let stats_7d: (i64, f64) = sqlx::query_as::<_, (i64, f64)>(
        r#"SELECT 
            COUNT(*),
            COALESCE(SUM(CASE WHEN status = 'completed' THEN CAST(amount AS DECIMAL(36,18)) / 1000000 END), 0)
           FROM transactions WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)"#
    )
    .fetch_one(pool)
    .await
    .unwrap_or((0, 0.0));

    // Credit stats
    let credits: (i64, i64) = sqlx::query_as::<_, (i64, i64)>(
        "SELECT COALESCE(SUM(lifetime_credits_used), 0), COALESCE(SUM(lifetime_credits_purchased), 0) FROM merchants"
    )
    .fetch_one(pool)
    .await
    .unwrap_or((0, 0));

    // Recent settlements
    let recent_rows: Vec<(i64, Option<String>, String, String, String, chrono::DateTime<chrono::Utc>)> = sqlx::query_as(
        r#"SELECT t.id, m.business_name, t.amount, t.network, t.status, t.created_at
           FROM transactions t
           LEFT JOIN merchants m ON t.merchant_id = m.id
           ORDER BY t.created_at DESC LIMIT 10"#
    )
    .fetch_all(pool)
    .await
    .unwrap_or_default();

    let recent_settlements: Vec<SettlementInfo> = recent_rows.into_iter().map(|r| {
        let amount_f: f64 = r.2.parse::<f64>().unwrap_or(0.0) / 1_000_000.0;
        SettlementInfo {
            id: r.0,
            merchant_name: r.1.unwrap_or_else(|| "Unknown".to_string()),
            amount: amount_f,
            network: r.3,
            status: r.4,
            created_at: r.5.to_rfc3339(),
        }
    }).collect();

    success_response(AdminDashboardStats {
        total_merchants: merchants.0,
        active_merchants: merchants.1,
        pending_merchants: merchants.2,
        suspended_merchants: merchants.3,
        banned_merchants: merchants.4,
        total_settlements_24h: stats_24h.0,
        total_settlements_7d: stats_7d.0,
        total_volume_24h: stats_24h.1,
        total_volume_7d: stats_7d.1,
        total_credits_used: credits.0,
        total_credits_purchased: credits.1,
        success_rate_24h: stats_24h.2,
        recent_settlements,
    })
}

/// List merchants
async fn list_merchants_handler(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Query(query): Query<MerchantListQuery>,
) -> Response {
    let db = &state.database;
    let pool = db.pool();

    // Validate admin session
    if let Err(response) = validate_admin_auth(pool, &headers, state.config.internal_api_secret.as_deref()).await {
        return response;
    }

    let page = query.page.unwrap_or(1).max(1);
    let limit = query.limit.unwrap_or(20).min(100);
    let offset = (page - 1) * limit;

    // Build query with parameterized values to prevent SQL injection
    let (total, rows) = match (&query.status, &query.search) {
        (Some(status), Some(search)) => {
            let search_pattern = format!("%{}%", search);
            let total: (i64,) = sqlx::query_as(
                "SELECT COUNT(*) FROM merchants WHERE status = ? AND (business_name LIKE ? OR auth_address LIKE ? OR email LIKE ?)"
            )
            .bind(status)
            .bind(&search_pattern)
            .bind(&search_pattern)
            .bind(&search_pattern)
            .fetch_one(pool)
            .await
            .unwrap_or((0,));
            
            let rows: Vec<(i64, String, Option<String>, Option<String>, i32, i32, i32, i32, String, i8, chrono::DateTime<chrono::Utc>, Option<chrono::DateTime<chrono::Utc>>)> = sqlx::query_as(
                r#"SELECT id, auth_address, business_name, email, credit_balance, COALESCE(mainnet_credit_balance, 0), 
                          lifetime_credits_purchased, lifetime_credits_used, status, is_active, created_at, last_active_at
                   FROM merchants WHERE status = ? AND (business_name LIKE ? OR auth_address LIKE ? OR email LIKE ?)
                   ORDER BY created_at DESC LIMIT ? OFFSET ?"#
            )
            .bind(status)
            .bind(&search_pattern)
            .bind(&search_pattern)
            .bind(&search_pattern)
            .bind(limit)
            .bind(offset)
            .fetch_all(pool)
            .await
            .unwrap_or_default();
            (total, rows)
        }
        (Some(status), None) => {
            let total: (i64,) = sqlx::query_as(
                "SELECT COUNT(*) FROM merchants WHERE status = ?"
            )
            .bind(status)
            .fetch_one(pool)
            .await
            .unwrap_or((0,));
            
            let rows: Vec<(i64, String, Option<String>, Option<String>, i32, i32, i32, i32, String, i8, chrono::DateTime<chrono::Utc>, Option<chrono::DateTime<chrono::Utc>>)> = sqlx::query_as(
                r#"SELECT id, auth_address, business_name, email, credit_balance, COALESCE(mainnet_credit_balance, 0), 
                          lifetime_credits_purchased, lifetime_credits_used, status, is_active, created_at, last_active_at
                   FROM merchants WHERE status = ? ORDER BY created_at DESC LIMIT ? OFFSET ?"#
            )
            .bind(status)
            .bind(limit)
            .bind(offset)
            .fetch_all(pool)
            .await
            .unwrap_or_default();
            (total, rows)
        }
        (None, Some(search)) => {
            let search_pattern = format!("%{}%", search);
            let total: (i64,) = sqlx::query_as(
                "SELECT COUNT(*) FROM merchants WHERE business_name LIKE ? OR auth_address LIKE ? OR email LIKE ?"
            )
            .bind(&search_pattern)
            .bind(&search_pattern)
            .bind(&search_pattern)
            .fetch_one(pool)
            .await
            .unwrap_or((0,));
            
            let rows: Vec<(i64, String, Option<String>, Option<String>, i32, i32, i32, i32, String, i8, chrono::DateTime<chrono::Utc>, Option<chrono::DateTime<chrono::Utc>>)> = sqlx::query_as(
                r#"SELECT id, auth_address, business_name, email, credit_balance, COALESCE(mainnet_credit_balance, 0), 
                          lifetime_credits_purchased, lifetime_credits_used, status, is_active, created_at, last_active_at
                   FROM merchants WHERE business_name LIKE ? OR auth_address LIKE ? OR email LIKE ?
                   ORDER BY created_at DESC LIMIT ? OFFSET ?"#
            )
            .bind(&search_pattern)
            .bind(&search_pattern)
            .bind(&search_pattern)
            .bind(limit)
            .bind(offset)
            .fetch_all(pool)
            .await
            .unwrap_or_default();
            (total, rows)
        }
        (None, None) => {
            let total: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM merchants")
                .fetch_one(pool)
                .await
                .unwrap_or((0,));
            
            let rows: Vec<(i64, String, Option<String>, Option<String>, i32, i32, i32, i32, String, i8, chrono::DateTime<chrono::Utc>, Option<chrono::DateTime<chrono::Utc>>)> = sqlx::query_as(
                r#"SELECT id, auth_address, business_name, email, credit_balance, COALESCE(mainnet_credit_balance, 0), 
                          lifetime_credits_purchased, lifetime_credits_used, status, is_active, created_at, last_active_at
                   FROM merchants ORDER BY created_at DESC LIMIT ? OFFSET ?"#
            )
            .bind(limit)
            .bind(offset)
            .fetch_all(pool)
            .await
            .unwrap_or_default();
            (total, rows)
        }
    };

    let mut merchants: Vec<MerchantDetail> = Vec::new();
    for r in rows {
        // Get settlement stats for each merchant
        let stats: (i64, f64) = sqlx::query_as::<_, (i64, f64)>(
            "SELECT COUNT(*), COALESCE(SUM(CASE WHEN status = 'completed' THEN CAST(amount AS DECIMAL(36,18)) / 1000000 END), 0) FROM transactions WHERE merchant_id = ?"
        )
        .bind(r.0)
        .fetch_one(pool)
        .await
        .unwrap_or((0, 0.0));

        merchants.push(MerchantDetail {
            id: r.0,
            auth_address: r.1,
            business_name: r.2,
            email: r.3,
            credit_balance: r.4,
            mainnet_credit_balance: r.5,
            lifetime_credits_purchased: r.6,
            lifetime_credits_used: r.7,
            status: r.8,
            is_active: r.9 != 0,
            created_at: r.10.to_rfc3339(),
            last_active_at: r.11.map(|d| d.to_rfc3339()),
            settlement_count: stats.0,
            total_volume: stats.1,
        });
    }

    let total_pages = ((total.0 as f64) / (limit as f64)).ceil() as i32;

    success_response(MerchantListResponse {
        merchants,
        pagination: Pagination {
            page,
            limit,
            total: total.0,
            total_pages,
        },
    })
}

/// Get single merchant
async fn get_merchant_handler(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(merchant_id): Path<i64>,
) -> Response {
    let db = &state.database;
    let pool = db.pool();

    // Validate admin session
    if let Err(response) = validate_admin_auth(pool, &headers, state.config.internal_api_secret.as_deref()).await {
        return response;
    }

    let merchant: Option<(i64, String, Option<String>, Option<String>, i32, i32, i32, i32, String, i8, chrono::DateTime<chrono::Utc>, Option<chrono::DateTime<chrono::Utc>>)> = sqlx::query_as::<_, (i64, String, Option<String>, Option<String>, i32, i32, i32, i32, String, i8, chrono::DateTime<chrono::Utc>, Option<chrono::DateTime<chrono::Utc>>)>(
        r#"SELECT id, auth_address, business_name, email, credit_balance, COALESCE(mainnet_credit_balance, 0),
                  lifetime_credits_purchased, lifetime_credits_used, status, is_active, created_at, last_active_at
           FROM merchants WHERE id = ?"#
    )
    .bind(merchant_id)
    .fetch_optional(pool)
    .await
    .ok()
    .flatten();

    match merchant {
        Some(r) => {
            let stats: (i64, f64) = sqlx::query_as::<_, (i64, f64)>(
                "SELECT COUNT(*), COALESCE(SUM(CASE WHEN status = 'completed' THEN CAST(amount AS DECIMAL(36,18)) / 1000000 END), 0) FROM transactions WHERE merchant_id = ?"
            )
            .bind(r.0)
            .fetch_one(pool)
            .await
            .unwrap_or((0, 0.0));

            success_response(MerchantDetail {
                id: r.0,
                auth_address: r.1,
                business_name: r.2,
                email: r.3,
                credit_balance: r.4,
                mainnet_credit_balance: r.5,
                lifetime_credits_purchased: r.6,
                lifetime_credits_used: r.7,
                status: r.8,
                is_active: r.9 != 0,
                created_at: r.10.to_rfc3339(),
                last_active_at: r.11.map(|d| d.to_rfc3339()),
                settlement_count: stats.0,
                total_volume: stats.1,
            })
        }
        None => error_response("Merchant not found", StatusCode::NOT_FOUND),
    }
}

/// Update merchant
async fn update_merchant_handler(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(merchant_id): Path<i64>,
    Json(req): Json<UpdateMerchantRequest>,
) -> Response {
    let db = &state.database;
    let pool = db.pool();

    // Validate admin session
    let (admin_id, admin_username, _) = match validate_admin_auth(pool, &headers, state.config.internal_api_secret.as_deref()).await {
        Ok(admin) => admin,
        Err(response) => return response,
    };

    // Use parameterized query to prevent SQL injection
    let result = sqlx::query(
        r#"UPDATE merchants SET 
           business_name = COALESCE(?, business_name),
           email = COALESCE(?, email),
           status = COALESCE(?, status),
           is_active = COALESCE(?, is_active),
           testnet_credits_enabled = COALESCE(?, testnet_credits_enabled),
           updated_at = NOW()
           WHERE id = ?"#
    )
    .bind(req.business_name.as_ref())
    .bind(req.email.as_ref())
    .bind(req.status.as_ref())
    .bind(req.is_active.map(|b| if b { 1i8 } else { 0i8 }))
    .bind(req.testnet_credits_enabled.map(|b| if b { 1i8 } else { 0i8 }))
    .bind(merchant_id)
    .execute(pool)
    .await;

    match result {
        Ok(_) => {
            let _ = log_admin_action(pool, admin_id, &admin_username, "update_merchant", Some("merchant"), Some(&merchant_id.to_string()), None).await;
            success_response(serde_json::json!({ "success": true }))
        }
        Err(e) => {
            error!("Failed to update merchant: {}", e);
            error_response("Failed to update merchant", StatusCode::INTERNAL_SERVER_ERROR)
        }
    }
}

/// Ban merchant
async fn ban_merchant_handler(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(merchant_id): Path<i64>,
    Json(req): Json<BanMerchantRequest>,
) -> Response {
    let db = &state.database;
    let pool = db.pool();

    // Validate admin session
    let (admin_id, admin_username, _) = match validate_admin_auth(pool, &headers, state.config.internal_api_secret.as_deref()).await {
        Ok(admin) => admin,
        Err(response) => return response,
    };

    let result = sqlx::query(
        "UPDATE merchants SET status = 'banned', is_active = 0, banned_at = NOW(), ban_reason = ?, updated_at = NOW() WHERE id = ?"
    )
    .bind(&req.reason)
    .bind(merchant_id)
    .execute(pool)
    .await;

    match result {
        Ok(_) => {
            let _ = log_admin_action(pool, admin_id, &admin_username, "ban_merchant", Some("merchant"), Some(&merchant_id.to_string()), Some(&req.reason)).await;
            success_response(serde_json::json!({ "success": true }))
        }
        Err(e) => {
            error!("Failed to ban merchant: {}", e);
            error_response("Failed to ban merchant", StatusCode::INTERNAL_SERVER_ERROR)
        }
    }
}

/// Unban merchant
async fn unban_merchant_handler(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(merchant_id): Path<i64>,
) -> Response {
    let db = &state.database;
    let pool = db.pool();

    // Validate admin session
    let (admin_id, admin_username, _) = match validate_admin_auth(pool, &headers, state.config.internal_api_secret.as_deref()).await {
        Ok(admin) => admin,
        Err(response) => return response,
    };

    let result = sqlx::query(
        "UPDATE merchants SET status = 'active', is_active = 1, banned_at = NULL, ban_reason = NULL, updated_at = NOW() WHERE id = ?"
    )
    .bind(merchant_id)
    .execute(pool)
    .await;

    match result {
        Ok(_) => {
            let _ = log_admin_action(pool, admin_id, &admin_username, "unban_merchant", Some("merchant"), Some(&merchant_id.to_string()), None).await;
            success_response(serde_json::json!({ "success": true }))
        }
        Err(e) => {
            error!("Failed to unban merchant: {}", e);
            error_response("Failed to unban merchant", StatusCode::INTERNAL_SERVER_ERROR)
        }
    }
}

/// Adjust merchant credits
async fn adjust_credits_handler(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(merchant_id): Path<i64>,
    Json(req): Json<AdjustCreditsRequest>,
) -> Response {
    let db = &state.database;
    let pool = db.pool();

    // Validate admin session
    let (admin_id, admin_username, _) = match validate_admin_auth(pool, &headers, state.config.internal_api_secret.as_deref()).await {
        Ok(admin) => admin,
        Err(response) => return response,
    };

    if req.credit_type == "mainnet" {
        // Get current balance
        let current: (i32,) = sqlx::query_as::<_, (i32,)>(
            "SELECT COALESCE(mainnet_credit_balance, 0) FROM merchants WHERE id = ?"
        )
        .bind(merchant_id)
        .fetch_one(pool)
        .await
        .unwrap_or((0,));

        let new_balance = current.0 + req.amount;
        if new_balance < 0 {
            return error_response("Insufficient balance", StatusCode::BAD_REQUEST);
        }

        // Update balance
        let result = sqlx::query(
            "UPDATE merchants SET mainnet_credit_balance = ?, lifetime_credits_purchased = lifetime_credits_purchased + GREATEST(?, 0), updated_at = NOW() WHERE id = ?"
        )
        .bind(new_balance)
        .bind(req.amount)
        .bind(merchant_id)
        .execute(pool)
        .await;

        if result.is_err() {
            return error_response("Failed to adjust credits", StatusCode::INTERNAL_SERVER_ERROR);
        }

        // Log credit transaction
        let tx_type = if req.amount > 0 { "bonus" } else { "adjustment" };
        let _ = sqlx::query(
            "INSERT INTO credit_transactions (merchant_id, type, amount, balance_before, balance_after, description) VALUES (?, ?, ?, ?, ?, ?)"
        )
        .bind(merchant_id)
        .bind(tx_type)
        .bind(req.amount)
        .bind(current.0)
        .bind(new_balance)
        .bind(&req.reason)
        .execute(pool)
        .await;

        let _ = log_admin_action(pool, admin_id, &admin_username, "adjust_credits", Some("merchant"), Some(&merchant_id.to_string()), Some(&format!("Mainnet: {} credits - {}", req.amount, req.reason))).await;
    } else {
        // Testnet credits - adjust current month allocation
        let now = chrono::Utc::now();
        let year = now.year();
        let month = now.month() as i32;

        // Ensure record exists
        let _ = sqlx::query(
            "INSERT IGNORE INTO merchant_testnet_credits (merchant_id, period_year, period_month, credits_allocated) VALUES (?, ?, ?, 1000)"
        )
        .bind(merchant_id)
        .bind(year)
        .bind(month)
        .execute(pool)
        .await;

        // Adjust allocation
        let _ = sqlx::query(
            "UPDATE merchant_testnet_credits SET credits_allocated = credits_allocated + ? WHERE merchant_id = ? AND period_year = ? AND period_month = ?"
        )
        .bind(req.amount)
        .bind(merchant_id)
        .bind(year)
        .bind(month)
        .execute(pool)
        .await;

        let _ = log_admin_action(pool, admin_id, &admin_username, "adjust_credits", Some("merchant"), Some(&merchant_id.to_string()), Some(&format!("Testnet: {} credits - {}", req.amount, req.reason))).await;
    }

    success_response(serde_json::json!({ "success": true }))
}

/// List all transactions
async fn list_all_transactions_handler(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Query(query): Query<TransactionListQuery>,
) -> Response {
    let db = &state.database;
    let pool = db.pool();

    // Validate admin session
    if let Err(response) = validate_admin_auth(pool, &headers, state.config.internal_api_secret.as_deref()).await {
        return response;
    }

    let page = query.page.unwrap_or(1).max(1);
    let limit = query.limit.unwrap_or(20).min(100);
    let offset = (page - 1) * limit;

    // Use parameterized queries to prevent SQL injection
    let (total, rows) = match (&query.status, &query.network, query.merchant_id, &query.search) {
        (None, None, None, None) => {
            let total: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM transactions")
                .fetch_one(pool).await.unwrap_or((0,));
            let rows: Vec<(i64, Option<i64>, Option<String>, String, String, String, String, String, String, Option<String>, Option<String>, i32, chrono::DateTime<chrono::Utc>)> = sqlx::query_as(
                r#"SELECT t.id, t.merchant_id, m.business_name, t.payer_address, t.recipient_address, t.amount, t.asset, t.network, t.status, t.transaction_hash, t.resource, t.credit_cost, t.created_at
                   FROM transactions t LEFT JOIN merchants m ON t.merchant_id = m.id
                   ORDER BY t.created_at DESC LIMIT ? OFFSET ?"#
            ).bind(limit).bind(offset).fetch_all(pool).await.unwrap_or_default();
            (total, rows)
        }
        _ => {
            // Build dynamic query with optional filters using proper parameterization
            let mut sql_count = String::from("SELECT COUNT(*) FROM transactions t WHERE 1=1");
            let mut sql_select = String::from(
                r#"SELECT t.id, t.merchant_id, m.business_name, t.payer_address, t.recipient_address, t.amount, t.asset, t.network, t.status, t.transaction_hash, t.resource, t.credit_cost, t.created_at
                   FROM transactions t LEFT JOIN merchants m ON t.merchant_id = m.id WHERE 1=1"#
            );
            
            if query.status.is_some() { sql_count.push_str(" AND t.status = ?"); sql_select.push_str(" AND t.status = ?"); }
            if query.network.is_some() { sql_count.push_str(" AND t.network = ?"); sql_select.push_str(" AND t.network = ?"); }
            if query.merchant_id.is_some() { sql_count.push_str(" AND t.merchant_id = ?"); sql_select.push_str(" AND t.merchant_id = ?"); }
            if query.search.is_some() { sql_count.push_str(" AND (t.payer_address LIKE ? OR t.transaction_hash LIKE ?)"); sql_select.push_str(" AND (t.payer_address LIKE ? OR t.transaction_hash LIKE ?)"); }
            
            sql_select.push_str(" ORDER BY t.created_at DESC LIMIT ? OFFSET ?");
            
            let search_pattern = query.search.as_ref().map(|s| format!("%{}%", s));
            
            // Build count query
            let mut count_query = sqlx::query_as::<_, (i64,)>(&sql_count);
            if let Some(ref status) = query.status { count_query = count_query.bind(status); }
            if let Some(ref network) = query.network { count_query = count_query.bind(network); }
            if let Some(merchant_id) = query.merchant_id { count_query = count_query.bind(merchant_id); }
            if let Some(ref pattern) = search_pattern { count_query = count_query.bind(pattern).bind(pattern); }
            let total = count_query.fetch_one(pool).await.unwrap_or((0,));
            
            // Build select query
            let mut select_query = sqlx::query_as::<_, (i64, Option<i64>, Option<String>, String, String, String, String, String, String, Option<String>, Option<String>, i32, chrono::DateTime<chrono::Utc>)>(&sql_select);
            if let Some(ref status) = query.status { select_query = select_query.bind(status); }
            if let Some(ref network) = query.network { select_query = select_query.bind(network); }
            if let Some(merchant_id) = query.merchant_id { select_query = select_query.bind(merchant_id); }
            if let Some(ref pattern) = search_pattern { select_query = select_query.bind(pattern).bind(pattern); }
            let rows = select_query.bind(limit).bind(offset).fetch_all(pool).await.unwrap_or_default();
            
            (total, rows)
        }
    };

    let transactions: Vec<TransactionDetail> = rows.into_iter().map(|r| {
        let amount_f: f64 = r.5.parse::<f64>().unwrap_or(0.0) / 1_000_000.0;
        TransactionDetail {
            id: r.0,
            merchant_id: r.1,
            merchant_name: r.2,
            payer_address: r.3,
            recipient_address: r.4,
            amount: amount_f,
            asset: r.6,
            network: r.7,
            status: r.8,
            tx_hash: r.9,
            resource: r.10,
            credit_cost: r.11,
            created_at: r.12.to_rfc3339(),
        }
    }).collect();

    let total_pages = ((total.0 as f64) / (limit as f64)).ceil() as i32;

    success_response(TransactionListResponse {
        transactions,
        pagination: Pagination {
            page,
            limit,
            total: total.0,
            total_pages,
        },
    })
}

/// Get single transaction
async fn get_transaction_handler(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(tx_id): Path<i64>,
) -> Response {
    let db = &state.database;
    let pool = db.pool();

    // Validate admin session
    if let Err(response) = validate_admin_auth(pool, &headers, state.config.internal_api_secret.as_deref()).await {
        return response;
    }

    let tx: Option<(i64, Option<i64>, Option<String>, String, String, String, String, String, String, Option<String>, Option<String>, i32, chrono::DateTime<chrono::Utc>)> = sqlx::query_as::<_, (i64, Option<i64>, Option<String>, String, String, String, String, String, String, Option<String>, Option<String>, i32, chrono::DateTime<chrono::Utc>)>(
        r#"SELECT t.id, t.merchant_id, m.business_name, t.payer_address, t.recipient_address, t.amount, t.asset, t.network, t.status, t.transaction_hash, t.resource, t.credit_cost, t.created_at
           FROM transactions t
           LEFT JOIN merchants m ON t.merchant_id = m.id
           WHERE t.id = ?"#
    )
    .bind(tx_id)
    .fetch_optional(pool)
    .await
    .ok()
    .flatten();

    match tx {
        Some(r) => {
            let amount_f: f64 = r.5.parse::<f64>().unwrap_or(0.0) / 1_000_000.0;
            success_response(TransactionDetail {
                id: r.0,
                merchant_id: r.1,
                merchant_name: r.2,
                payer_address: r.3,
                recipient_address: r.4,
                amount: amount_f,
                asset: r.6,
                network: r.7,
                status: r.8,
                tx_hash: r.9,
                resource: r.10,
                credit_cost: r.11,
                created_at: r.12.to_rfc3339(),
            })
        }
        None => error_response("Transaction not found", StatusCode::NOT_FOUND),
    }
}

/// Get system settings
async fn get_settings_handler(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Response {
    let db = &state.database;
    let pool = db.pool();

    // Validate admin session
    if let Err(response) = validate_admin_auth(pool, &headers, state.config.internal_api_secret.as_deref()).await {
        return response;
    }

    let rows: Vec<(String, String, String, Option<String>)> = sqlx::query_as(
        "SELECT setting_key, setting_value, setting_type, description FROM system_settings ORDER BY setting_key"
    )
    .fetch_all(pool)
    .await
    .unwrap_or_default();

    let settings: Vec<SettingItem> = rows.into_iter().map(|r| SettingItem {
        key: r.0,
        value: r.1,
        setting_type: r.2,
        description: r.3,
    }).collect();

    success_response(SystemSettings { settings })
}

/// Update system settings
async fn update_settings_handler(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(req): Json<UpdateSettingsRequest>,
) -> Response {
    let db = &state.database;
    let pool = db.pool();

    // Validate admin session
    let (admin_id, admin_username, _) = match validate_admin_auth(pool, &headers, state.config.internal_api_secret.as_deref()).await {
        Ok(admin) => admin,
        Err(response) => return response,
    };

    for setting in req.settings {
        let _ = sqlx::query(
            "UPDATE system_settings SET setting_value = ?, updated_at = NOW() WHERE setting_key = ?"
        )
        .bind(&setting.value)
        .bind(&setting.key)
        .execute(pool)
        .await;
    }

    let _ = log_admin_action(pool, admin_id, &admin_username, "update_settings", Some("system"), None, None).await;

    success_response(serde_json::json!({ "success": true }))
}

/// Get system metrics
async fn get_metrics_handler(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Response {
    let db = &state.database;
    let pool = db.pool();

    // Validate admin session
    if let Err(response) = validate_admin_auth(pool, &headers, state.config.internal_api_secret.as_deref()).await {
        return response;
    }

    let uptime = state.start_time.elapsed().as_secs_f64();

    success_response(SystemMetrics {
        uptime,
        total_requests: 0, // TODO: Get from metrics service
        requests_per_minute: 0.0,
        avg_response_time: 0.0,
        active_connections: 0,
        paymaster_balances: vec![], // TODO: Get from paymaster pool
    })
}

/// Get audit log
async fn get_audit_log_handler(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Query(query): Query<AuditLogQuery>,
) -> Response {
    let db = &state.database;
    let pool = db.pool();

    // Validate admin session
    if let Err(response) = validate_admin_auth(pool, &headers, state.config.internal_api_secret.as_deref()).await {
        return response;
    }

    let page = query.page.unwrap_or(1).max(1);
    let limit = query.limit.unwrap_or(50).min(200);
    let offset = (page - 1) * limit;

    // Build parameterized query
    let (count_result, rows) = match (&query.action, query.admin_id) {
        (Some(action), Some(admin_id)) => {
            let total: (i64,) = sqlx::query_as::<_, (i64,)>(
                "SELECT COUNT(*) FROM admin_audit_log WHERE action = ? AND admin_id = ?"
            )
            .bind(action)
            .bind(admin_id)
            .fetch_one(pool)
            .await
            .unwrap_or((0,));

            let rows: Vec<(i64, Option<i64>, Option<String>, String, Option<String>, Option<String>, Option<String>, Option<String>, chrono::DateTime<chrono::Utc>)> = sqlx::query_as(
                "SELECT id, admin_id, admin_username, action, entity_type, entity_id, old_value, ip_address, created_at FROM admin_audit_log WHERE action = ? AND admin_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?"
            )
            .bind(action)
            .bind(admin_id)
            .bind(limit)
            .bind(offset)
            .fetch_all(pool)
            .await
            .unwrap_or_default();
            (total, rows)
        }
        (Some(action), None) => {
            let total: (i64,) = sqlx::query_as::<_, (i64,)>(
                "SELECT COUNT(*) FROM admin_audit_log WHERE action = ?"
            )
            .bind(action)
            .fetch_one(pool)
            .await
            .unwrap_or((0,));

            let rows: Vec<(i64, Option<i64>, Option<String>, String, Option<String>, Option<String>, Option<String>, Option<String>, chrono::DateTime<chrono::Utc>)> = sqlx::query_as(
                "SELECT id, admin_id, admin_username, action, entity_type, entity_id, old_value, ip_address, created_at FROM admin_audit_log WHERE action = ? ORDER BY created_at DESC LIMIT ? OFFSET ?"
            )
            .bind(action)
            .bind(limit)
            .bind(offset)
            .fetch_all(pool)
            .await
            .unwrap_or_default();
            (total, rows)
        }
        (None, Some(admin_id)) => {
            let total: (i64,) = sqlx::query_as::<_, (i64,)>(
                "SELECT COUNT(*) FROM admin_audit_log WHERE admin_id = ?"
            )
            .bind(admin_id)
            .fetch_one(pool)
            .await
            .unwrap_or((0,));

            let rows: Vec<(i64, Option<i64>, Option<String>, String, Option<String>, Option<String>, Option<String>, Option<String>, chrono::DateTime<chrono::Utc>)> = sqlx::query_as(
                "SELECT id, admin_id, admin_username, action, entity_type, entity_id, old_value, ip_address, created_at FROM admin_audit_log WHERE admin_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?"
            )
            .bind(admin_id)
            .bind(limit)
            .bind(offset)
            .fetch_all(pool)
            .await
            .unwrap_or_default();
            (total, rows)
        }
        (None, None) => {
            let total: (i64,) = sqlx::query_as::<_, (i64,)>(
                "SELECT COUNT(*) FROM admin_audit_log"
            )
            .fetch_one(pool)
            .await
            .unwrap_or((0,));

            let rows: Vec<(i64, Option<i64>, Option<String>, String, Option<String>, Option<String>, Option<String>, Option<String>, chrono::DateTime<chrono::Utc>)> = sqlx::query_as(
                "SELECT id, admin_id, admin_username, action, entity_type, entity_id, old_value, ip_address, created_at FROM admin_audit_log ORDER BY created_at DESC LIMIT ? OFFSET ?"
            )
            .bind(limit)
            .bind(offset)
            .fetch_all(pool)
            .await
            .unwrap_or_default();
            (total, rows)
        }
    };

    let logs: Vec<AuditLogEntry> = rows.into_iter().map(|r| AuditLogEntry {
        id: r.0,
        admin_id: r.1,
        admin_username: r.2,
        action: r.3,
        entity_type: r.4,
        entity_id: r.5,
        old_value: r.6.and_then(|s| serde_json::from_str(&s).ok()),
        new_value: None,
        ip_address: r.7,
        created_at: r.8.to_rfc3339(),
    }).collect();

    let total_pages = ((count_result.0 as f64) / (limit as f64)).ceil() as i32;

    success_response(AuditLogResponse {
        logs,
        pagination: Pagination {
            page,
            limit,
            total: count_result.0,
            total_pages,
        },
    })
}

/// List topup orders
async fn list_topup_orders_handler(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Query(query): Query<TopupOrdersQuery>,
) -> Response {
    let db = &state.database;
    let pool = db.pool();

    // Validate admin session
    if let Err(response) = validate_admin_auth(pool, &headers, state.config.internal_api_secret.as_deref()).await {
        return response;
    }

    let page = query.page.unwrap_or(1).max(1);
    let limit = query.limit.unwrap_or(20).min(100);
    let offset = (page - 1) * limit;

    // Build parameterized query based on status filter
    let (total, rows) = if let Some(ref status) = query.status {
        let total: (i64,) = sqlx::query_as::<_, (i64,)>(
            "SELECT COUNT(*) FROM credit_topup_orders o WHERE o.status = ?"
        )
        .bind(status)
        .fetch_one(pool)
        .await
        .unwrap_or((0,));

        let rows: Vec<(i64, String, i64, Option<String>, i32, i32, f64, Option<String>, String, chrono::DateTime<chrono::Utc>, chrono::DateTime<chrono::Utc>)> = sqlx::query_as(
            r#"SELECT o.id, o.order_id, o.merchant_id, m.business_name, o.credit_amount, o.bonus_credits, o.price_usdc, o.network, o.status, o.expires_at, o.created_at
               FROM credit_topup_orders o
               LEFT JOIN merchants m ON o.merchant_id = m.id
               WHERE o.status = ? ORDER BY o.created_at DESC LIMIT ? OFFSET ?"#
        )
        .bind(status)
        .bind(limit)
        .bind(offset)
        .fetch_all(pool)
        .await
        .unwrap_or_default();
        (total, rows)
    } else {
        let total: (i64,) = sqlx::query_as::<_, (i64,)>(
            "SELECT COUNT(*) FROM credit_topup_orders"
        )
        .fetch_one(pool)
        .await
        .unwrap_or((0,));

        let rows: Vec<(i64, String, i64, Option<String>, i32, i32, f64, Option<String>, String, chrono::DateTime<chrono::Utc>, chrono::DateTime<chrono::Utc>)> = sqlx::query_as(
            r#"SELECT o.id, o.order_id, o.merchant_id, m.business_name, o.credit_amount, o.bonus_credits, o.price_usdc, o.network, o.status, o.expires_at, o.created_at
               FROM credit_topup_orders o
               LEFT JOIN merchants m ON o.merchant_id = m.id
               ORDER BY o.created_at DESC LIMIT ? OFFSET ?"#
        )
        .bind(limit)
        .bind(offset)
        .fetch_all(pool)
        .await
        .unwrap_or_default();
        (total, rows)
    };

    let orders: Vec<TopupOrderDetail> = rows.into_iter().map(|r| TopupOrderDetail {
        id: r.0,
        order_id: r.1,
        merchant_id: r.2,
        merchant_name: r.3,
        credit_amount: r.4,
        bonus_credits: r.5,
        price_usdc: r.6,
        network: r.7,
        status: r.8,
        expires_at: r.9.to_rfc3339(),
        created_at: r.10.to_rfc3339(),
    }).collect();

    let total_pages = ((total.0 as f64) / (limit as f64)).ceil() as i32;

    success_response(TopupOrdersResponse {
        orders,
        pagination: Pagination {
            page,
            limit,
            total: total.0,
            total_pages,
        },
    })
}

/// Complete topup order manually
async fn complete_topup_order_handler(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(order_id): Path<String>,
    Json(req): Json<CompleteTopupRequest>,
) -> Response {
    let db = &state.database;
    let pool = db.pool();

    // Validate admin session
    let (admin_id, admin_username, _) = match validate_admin_auth(pool, &headers, state.config.internal_api_secret.as_deref()).await {
        Ok(admin) => admin,
        Err(response) => return response,
    };

    // Get order
    let order: Option<(i64, i32, i32, String)> = sqlx::query_as::<_, (i64, i32, i32, String)>(
        "SELECT merchant_id, credit_amount, bonus_credits, status FROM credit_topup_orders WHERE order_id = ?"
    )
    .bind(&order_id)
    .fetch_optional(pool)
    .await
    .ok()
    .flatten();

    let (merchant_id, credit_amount, bonus_credits, status) = match order {
        Some(o) => o,
        None => {
            return error_response("Order not found", StatusCode::NOT_FOUND);
        }
    };

    if status == "completed" {
        return error_response("Order already completed", StatusCode::BAD_REQUEST);
    }

    let total_credits = credit_amount + bonus_credits;

    // Update merchant credits
    let _ = sqlx::query(
        "UPDATE merchants SET mainnet_credit_balance = mainnet_credit_balance + ?, lifetime_credits_purchased = lifetime_credits_purchased + ?, updated_at = NOW() WHERE id = ?"
    )
    .bind(total_credits)
    .bind(total_credits)
    .bind(merchant_id)
    .execute(pool)
    .await;

    // Update order
    let _ = sqlx::query(
        "UPDATE credit_topup_orders SET status = 'completed', payment_tx_hash = ?, payment_confirmed_at = NOW(), completed_at = NOW(), updated_at = NOW() WHERE order_id = ?"
    )
    .bind(&req.tx_hash)
    .bind(&order_id)
    .execute(pool)
    .await;

    // Log credit transaction
    let _ = sqlx::query(
        "INSERT INTO credit_transactions (merchant_id, type, amount, balance_before, balance_after, reference_type, reference_id, description) VALUES (?, 'purchase', ?, 0, 0, 'topup', ?, 'Credit topup')"
    )
    .bind(merchant_id)
    .bind(total_credits)
    .bind(&order_id)
    .execute(pool)
    .await;

    let _ = log_admin_action(pool, admin_id, &admin_username, "complete_topup", Some("topup_order"), Some(&order_id), Some(&format!("Credits: {}", total_credits))).await;

    success_response(serde_json::json!({ "success": true, "creditsAdded": total_credits }))
}

// ============ Helper Functions ============

/// Verify TOTP code against a secret
fn verify_totp(secret: &str, code: &str) -> bool {
    // Try to create TOTP from base32 secret
    let secret_bytes = match Secret::Encoded(secret.to_string()).to_bytes() {
        Ok(bytes) => bytes,
        Err(_) => {
            warn!("Invalid TOTP secret format");
            return false;
        }
    };

    let totp = match TOTP::new(
        Algorithm::SHA1,
        6,      // digits
        1,      // skew (allow 1 step before/after)
        30,     // step in seconds
        secret_bytes,
        None,   // issuer (optional)
        String::new(), // account name (not used for verification)
    ) {
        Ok(t) => t,
        Err(_) => {
            warn!("Failed to create TOTP instance");
            return false;
        }
    };

    // Check the code
    totp.check_current(code).unwrap_or(false)
}

async fn log_admin_action(
    pool: &sqlx::MySqlPool,
    admin_id: i64,
    admin_username: &str,
    action: &str,
    entity_type: Option<&str>,
    entity_id: Option<&str>,
    details: Option<&str>,
) -> Result<(), String> {
    sqlx::query(
        "INSERT INTO admin_audit_log (admin_id, admin_username, action, entity_type, entity_id, old_value) VALUES (?, ?, ?, ?, ?, ?)"
    )
    .bind(if admin_id > 0 { Some(admin_id) } else { None })
    .bind(admin_username)
    .bind(action)
    .bind(entity_type)
    .bind(entity_id)
    .bind(details)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(())
}
