//! Admin Endpoints - Internal API for monitoring
//!
//! Low-impact endpoints for admin notifications and monitoring.
//! These are internal endpoints, not exposed publicly.

use std::sync::Arc;
use axum::{
    extract::{Query, State},
    http::StatusCode,
    response::IntoResponse,
    routing::get,
    Json, Router,
};
use serde::{Deserialize, Serialize};
use tracing::{info, warn};

use crate::routes::AppState;

/// Create admin router
pub fn create_admin_router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/admin/purchases", get(purchases_handler))
        .route("/admin/purchases/acknowledge", get(acknowledge_handler))
}

/// Query parameters for purchases endpoint
#[derive(Debug, Deserialize)]
pub struct PurchasesQuery {
    /// Unix timestamp - only return purchases after this time
    #[serde(default)]
    pub since: Option<i64>,
    /// Only return unacknowledged purchases
    #[serde(default)]
    pub unacknowledged: Option<bool>,
    /// Limit number of results (default 100)
    #[serde(default)]
    pub limit: Option<i32>,
    /// Filter by network type (mainnet/testnet)
    #[serde(default)]
    pub network_type: Option<String>,
    /// Minimum amount in USD
    #[serde(default)]
    pub min_amount: Option<f64>,
}

/// Query parameters for acknowledge endpoint
#[derive(Debug, Deserialize)]
pub struct AcknowledgeQuery {
    /// Purchase IDs to acknowledge (comma-separated)
    pub ids: String,
}

/// Purchase record for response
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PurchaseRecord {
    pub id: i64,
    pub api_key_id: i64,
    pub payer_address: Option<String>,
    pub amount: String,
    pub network_type: String,
    pub balance_after: String,
    pub description: Option<String>,
    pub created_at: String,
    pub acknowledged: bool,
}

/// Purchases response
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PurchasesResponse {
    pub success: bool,
    pub count: usize,
    pub purchases: Vec<PurchaseRecord>,
    /// Latest timestamp for pagination
    pub latest_timestamp: Option<i64>,
}

/// GET /admin/purchases - List recent credit purchases
/// 
/// Query params:
/// - since: Unix timestamp, only return purchases after this time
/// - unacknowledged: true to only show unacknowledged purchases
/// - limit: Max results (default 100)
/// - network_type: Filter by mainnet/testnet
/// - min_amount: Minimum USD amount
async fn purchases_handler(
    State(state): State<Arc<AppState>>,
    Query(params): Query<PurchasesQuery>,
) -> impl IntoResponse {
    let pool = state.database.pool();
    let limit = params.limit.unwrap_or(100).min(1000);
    let since_ts = params.since.unwrap_or(0);
    let only_unacked = params.unacknowledged.unwrap_or(false);
    let min_amount = params.min_amount.unwrap_or(0.0);
    
    // Build query dynamically
    let mut conditions = vec!["cl.entry_type = 'purchase'".to_string()];
    
    if since_ts > 0 {
        conditions.push(format!("UNIX_TIMESTAMP(cl.created_at) > {}", since_ts));
    }
    
    if only_unacked {
        conditions.push("cl.acknowledged_at IS NULL".to_string());
    }
    
    if let Some(ref net_type) = params.network_type {
        conditions.push(format!("cl.network_type = '{}'", net_type.to_lowercase()));
    }
    
    if min_amount > 0.0 {
        conditions.push(format!("cl.amount >= {}", min_amount));
    }
    
    let where_clause = conditions.join(" AND ");
    
    let query = format!(
        r#"SELECT 
            cl.id,
            cl.api_key_id,
            ak.email as payer_address,
            CAST(cl.amount AS CHAR) as amount,
            cl.network_type,
            CAST(cl.balance_after AS CHAR) as balance_after,
            cl.description,
            cl.created_at,
            cl.acknowledged_at
        FROM credit_ledger cl
        LEFT JOIN api_keys ak ON cl.api_key_id = ak.id
        WHERE {}
        ORDER BY cl.created_at DESC
        LIMIT {}"#,
        where_clause, limit
    );
    
    match sqlx::query_as::<_, PurchaseRow>(&query)
        .fetch_all(pool)
        .await
    {
        Ok(rows) => {
            let latest_ts = rows.first()
                .map(|r| r.created_at.timestamp())
                .unwrap_or(0);
            
            let purchases: Vec<PurchaseRecord> = rows.into_iter().map(|r| PurchaseRecord {
                id: r.id,
                api_key_id: r.api_key_id,
                payer_address: r.payer_address,
                amount: r.amount,
                network_type: r.network_type,
                balance_after: r.balance_after,
                description: r.description,
                created_at: r.created_at.format("%Y-%m-%dT%H:%M:%SZ").to_string(),
                acknowledged: r.acknowledged_at.is_some(),
            }).collect();
            
            let count = purchases.len();
            
            Json(PurchasesResponse {
                success: true,
                count,
                purchases,
                latest_timestamp: if latest_ts > 0 { Some(latest_ts) } else { None },
            }).into_response()
        }
        Err(e) => {
            warn!("Failed to fetch purchases: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({
                    "success": false,
                    "error": "Database error"
                }))
            ).into_response()
        }
    }
}

/// GET /admin/purchases/acknowledge?ids=1,2,3 - Mark purchases as acknowledged
async fn acknowledge_handler(
    State(state): State<Arc<AppState>>,
    Query(params): Query<AcknowledgeQuery>,
) -> impl IntoResponse {
    let pool = state.database.pool();
    
    // Parse comma-separated IDs
    let ids: Vec<i64> = params.ids
        .split(',')
        .filter_map(|s| s.trim().parse().ok())
        .collect();
    
    if ids.is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({
                "success": false,
                "error": "No valid IDs provided"
            }))
        ).into_response();
    }
    
    let placeholders: Vec<String> = ids.iter().map(|_| "?".to_string()).collect();
    let query = format!(
        "UPDATE credit_ledger SET acknowledged_at = NOW() WHERE id IN ({}) AND entry_type = 'purchase'",
        placeholders.join(",")
    );
    
    let mut q = sqlx::query(&query);
    for id in &ids {
        q = q.bind(id);
    }
    
    match q.execute(pool).await {
        Ok(result) => {
            let updated = result.rows_affected();
            info!("Acknowledged {} purchases: {:?}", updated, ids);
            
            Json(serde_json::json!({
                "success": true,
                "acknowledged": updated,
                "ids": ids
            })).into_response()
        }
        Err(e) => {
            warn!("Failed to acknowledge purchases: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({
                    "success": false,
                    "error": "Database error"
                }))
            ).into_response()
        }
    }
}

/// Database row for purchase query
#[derive(Debug, sqlx::FromRow)]
struct PurchaseRow {
    id: i64,
    api_key_id: i64,
    payer_address: Option<String>,
    amount: String,
    network_type: String,
    balance_after: String,
    description: Option<String>,
    created_at: chrono::DateTime<chrono::Utc>,
    acknowledged_at: Option<chrono::DateTime<chrono::Utc>>,
}
