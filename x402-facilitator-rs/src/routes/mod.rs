//! Routes module
//! 
//! HTTP route handlers for the x402 facilitator API
//! 
//! All endpoints use JSON body for requests (no custom headers).
//! The x402 protocol headers (PAYMENT-REQUIRED, PAYMENT-SIGNATURE, etc.) are
//! used between merchants and buyers, NOT for facilitator API calls.
//! 
//! Endpoints:
//! - Public: /, /health, /networks, /supported, /help, /account
//! - Authenticated: /verify, /settle


mod account;

mod credits;
mod help;

use std::sync::Arc;
use std::time::Instant;
use axum::{
    body::Bytes,
    extract::State,
    http::StatusCode,
    response::IntoResponse,
    routing::{get, post},
    Json, Router,
};
use tracing::{info, debug};

use crate::config::Config;
use crate::types::*;
use crate::services::{VerificationService, SettlementService, MetricsService, Database, PriceFeedService};
use crate::services::metrics;
use serde::Serialize;

pub use account::create_account_router;

pub use credits::create_credits_router;
pub use help::create_help_router;

/// Root endpoint response - preserves field order
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RootResponse {
    name: String,
    description: String,
    endpoints: RootEndpoints,
    mainnet_networks: Vec<String>,
    testnet_networks: Vec<String>,
}

#[derive(Serialize)]
struct RootEndpoints {
    health: &'static str,
    networks: &'static str,
    supported: &'static str,
    help: &'static str,
    account: &'static str,
    verify: &'static str,
    settle: &'static str,
}

/// Application state shared across routes
#[derive(Clone)]
pub struct AppState {
    pub config: Arc<Config>,
    pub verification_service: Arc<VerificationService>,
    pub settlement_service: Arc<SettlementService>,
    pub metrics_service: Arc<MetricsService>,
    pub database: Arc<Database>,
    pub price_feed: Arc<PriceFeedService>,
    pub start_time: Instant,
}

/// Create the router with all routes
pub fn create_router(state: AppState) -> Router {
    let state_arc = Arc::new(state);
    
    Router::new()
        // Public endpoints
        .route("/", get(root_handler))
        .route("/health", get(health_handler))
        .route("/networks", get(networks_handler))
        .route("/supported", get(supported_handler))
        .route("/metrics", get(metrics_handler))
        // Core API (requires authentication)
        .route("/verify", post(verify_handler))
        .route("/settle", post(settle_handler))
        // Merge account, credits (legacy), help, and admin routes
        .merge(create_account_router())
        .merge(create_credits_router())  // Keep for backward compatibility
        .merge(create_help_router())

        .with_state(state_arc)
}

/// Root endpoint - Service info
async fn root_handler(
    State(state): State<Arc<AppState>>,
) -> impl IntoResponse {
    Json(RootResponse {
        name: state.config.service_name.clone(),
        description: state.config.service_description.clone(),
        endpoints: RootEndpoints {
            health: "GET /health",
            networks: "GET /networks",
            supported: "GET /supported",
            help: "GET /help",
            account: "GET /account (info) | POST /account (purchase credits)",
            verify: "POST /verify (requires API key)",
            settle: "POST /settle (requires API key)",
        },
        mainnet_networks: state.config.mainnet_networks.clone(),
        testnet_networks: state.config.testnet_networks.clone(),
    })
}

/// Health check endpoint
async fn health_handler(
    State(state): State<Arc<AppState>>,
) -> impl IntoResponse {
    let uptime = state.start_time.elapsed().as_secs_f64();
    
    Json(HealthResponse {
        status: "ok".to_string(),
        service: "x402-facilitator".to_string(),
        timestamp: chrono::Utc::now().timestamp_millis() as u64,
        uptime,
    })
}

/// Networks endpoint - List supported networks and tokens
/// Returns CAIP-2 identifiers for each network
async fn networks_handler(
    State(state): State<Arc<AppState>>,
) -> impl IntoResponse {
    let mainnet: Vec<NetworkInfo> = state.config.mainnet_networks
        .iter()
        .filter_map(|network| {
            state.config.networks.get(network).map(|nc| {
                let caip2 = format!("eip155:{}", nc.chain_id);
                NetworkInfo {
                    network: network.clone(),
                    caip2,
                    chain_id: nc.chain_id,
                    tokens: nc.tokens.iter().map(|t| {
                        TokenInfo {
                            symbol: t.symbol.clone(),
                            name: t.name.clone(),
                            address: t.address.clone(),
                            decimals: t.decimals,
                            eip712: t.eip712.as_ref().map(|e| Eip712Info {
                                name: e.name.clone(),
                                version: e.version.clone(),
                                verifying_contract: t.address.clone(),
                            }),
                        }
                    }).collect(),
                }
            })
        })
        .collect();

    let testnet: Vec<NetworkInfo> = state.config.testnet_networks
        .iter()
        .filter_map(|network| {
            state.config.networks.get(network).map(|nc| {
                let caip2 = format!("eip155:{}", nc.chain_id);
                NetworkInfo {
                    network: network.clone(),
                    caip2,
                    chain_id: nc.chain_id,
                    tokens: nc.tokens.iter().map(|t| {
                        TokenInfo {
                            symbol: t.symbol.clone(),
                            name: t.name.clone(),
                            address: t.address.clone(),
                            decimals: t.decimals,
                            eip712: t.eip712.as_ref().map(|e| Eip712Info {
                                name: e.name.clone(),
                                version: e.version.clone(),
                                verifying_contract: t.address.clone(),
                            }),
                        }
                    }).collect(),
                }
            })
        })
        .collect();

    Json(NetworksResponse {
        success: true,
        mainnet,
        testnet,
    })
}

/// Supported endpoint - x402 protocol compatibility
/// Returns supported payment kinds in standard x402 format
async fn supported_handler(
    State(state): State<Arc<AppState>>,
) -> impl IntoResponse {
    let mut kinds = Vec::new();
    
    // Add all networks with x402 v2 support (using CAIP-2)
    for network in &state.config.mainnet_networks {
        if let Some(nc) = state.config.networks.get(network) {
            kinds.push(serde_json::json!({
                "x402Version": 2,
                "scheme": "exact",
                "network": format!("eip155:{}", nc.chain_id)
            }));
        }
    }
    
    for network in &state.config.testnet_networks {
        if let Some(nc) = state.config.networks.get(network) {
            kinds.push(serde_json::json!({
                "x402Version": 2,
                "scheme": "exact",
                "network": format!("eip155:{}", nc.chain_id)
            }));
        }
    }
    
    Json(serde_json::json!({
        "kinds": kinds
    }))
}

/// Prometheus metrics endpoint
async fn metrics_handler(
    State(state): State<Arc<AppState>>,
) -> impl IntoResponse {
    let metrics_output = state.metrics_service.render();
    (
        StatusCode::OK,
        [("content-type", "text/plain; version=0.0.4; charset=utf-8")],
        metrics_output,
    )
}

/// Extract x402 request from JSON body
/// All facilitator API calls use JSON body (not headers)
fn extract_x402_request(
    body: &[u8],
) -> Result<(PaymentPayload, PaymentRequirements), (StatusCode, Json<ErrorResponse>)> {
    // JSON body required
    if body.is_empty() {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse::new("MISSING_DATA", "JSON body required with paymentPayload and paymentRequirements"))
        ));
    }
    
    debug!("Parsing x402 request from JSON body");
    
    // Parse JSON body - supports both v1 and v2 formats
    #[derive(serde::Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct RequestBody {
        #[serde(default)]
        x402_version: Option<u32>,
        payment_payload: Option<PaymentPayload>,
        payment_requirements: Option<PaymentRequirements>,
        // v2 format fields (alternative naming)
        payment_signature: Option<PaymentSignatureV2>,
        #[serde(alias = "paymentRequirements")]
        requirements: Option<PaymentRequirementsV2>,
    }
    
    let parsed: RequestBody = serde_json::from_slice(body)
        .map_err(|e| (
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse::new("PARSE_ERROR", format!("Invalid JSON: {}", e)))
        ))?;
    
    // Try v1 format first (paymentPayload/paymentRequirements)
    if let (Some(payload), Some(requirements)) = (parsed.payment_payload, parsed.payment_requirements) {
        return Ok((payload, requirements));
    }
    
    // Try v2 format (paymentSignature/requirements)
    if let (Some(sig), Some(req)) = (parsed.payment_signature, parsed.requirements) {
        let payload: PaymentPayload = (&sig).into();
        let requirements: PaymentRequirements = (&req).into();
        return Ok((payload, requirements));
    }
    
    Err((
        StatusCode::BAD_REQUEST,
        Json(ErrorResponse::new("MISSING_FIELDS", "Missing paymentPayload/paymentRequirements in JSON body"))
    ))
}

/// Verify payment endpoint
/// JSON body required with paymentPayload and paymentRequirements
async fn verify_handler(
    State(state): State<Arc<AppState>>,
    axum::Extension(api_key): axum::Extension<crate::types::ApiKey>,
    body: Bytes,
) -> impl IntoResponse {
    let start_time = Instant::now();
    
    // Extract request from JSON body
    let (payment_payload, payment_requirements) = match extract_x402_request(&body) {
        Ok(data) => data,
        Err(err) => return err.into_response(),
    };
    
    // Normalize network name (supports CAIP-2, chain ID, various formats)
    let network = state.config.normalize_network_name(&payment_requirements.network);
    
    info!("=== VERIFY REQUEST ===");
    info!("API Key: {}...{}", &api_key.api_key[..8], &api_key.api_key[api_key.api_key.len()-4..]);
    info!("Network: {} (input: {})", network, payment_requirements.network);
    info!("Asset: {}", payment_requirements.asset);
    info!("Amount: {}", payment_requirements.max_amount_required);

    // Update requirements with normalized network
    let mut normalized_requirements = payment_requirements.clone();
    normalized_requirements.network = network.clone();

    let result = state.verification_service.verify(
        &payment_payload,
        &normalized_requirements,
    ).await;

    let duration_secs = start_time.elapsed().as_secs_f64();
    
    // Record metrics
    metrics::record_verification(&network, result.is_valid);
    metrics::record_verification_duration(&network, duration_secs);
    metrics::record_request("/verify", "POST", if result.is_valid { 200 } else { 200 });
    metrics::record_request_duration("/verify", duration_secs);
    
    info!(
        "Verification completed in {:.1}ms: {}",
        duration_secs * 1000.0,
        if result.is_valid { "VALID" } else { "INVALID" }
    );

    Json(result).into_response()
}

/// Settle payment endpoint
/// JSON body required with paymentPayload and paymentRequirements
async fn settle_handler(
    State(state): State<Arc<AppState>>,
    axum::Extension(api_key): axum::Extension<crate::types::ApiKey>,
    body: Bytes,
) -> impl IntoResponse {
    let start_time = Instant::now();
    
    // Extract request from JSON body
    let (payment_payload, payment_requirements) = match extract_x402_request(&body) {
        Ok(data) => data,
        Err(err) => return err.into_response(),
    };
    
    // Normalize network name (supports CAIP-2, chain ID, various formats)
    let network = state.config.normalize_network_name(&payment_requirements.network);
    
    info!("=== SETTLE REQUEST ===");
    info!("API Key: {}...{}", &api_key.api_key[..8], &api_key.api_key[api_key.api_key.len()-4..]);
    info!("Network: {} (input: {})", network, payment_requirements.network);
    info!("Asset: {}", payment_requirements.asset);
    info!("Amount: {}", payment_requirements.max_amount_required);

    // Update requirements with normalized network
    let mut normalized_requirements = payment_requirements.clone();
    normalized_requirements.network = network.clone();

    let result = state.settlement_service.settle(
        &payment_payload,
        &normalized_requirements,
        &api_key,
    ).await;

    let duration_secs = start_time.elapsed().as_secs_f64();
    
    // Record metrics
    metrics::record_settlement(&network, result.success);
    metrics::record_settlement_duration(&network, duration_secs);
    metrics::record_request("/settle", "POST", if result.success { 200 } else { 200 });
    metrics::record_request_duration("/settle", duration_secs);
    
    if result.success {
        metrics::record_credits_deducted(1);
    }
    
    info!(
        "Settlement completed in {:.1}ms: {}",
        duration_secs * 1000.0,
        if result.success { "SUCCESS" } else { "FAILED" }
    );

    Json(result).into_response()
}
