//! Routes module
//! 
//! HTTP route handlers for the x402 facilitator API

mod merchant;
mod admin;

use std::sync::Arc;
use std::time::Instant;
use axum::{
    extract::{Extension, State},
    http::StatusCode,
    response::IntoResponse,
    routing::{get, post},
    Json, Router,
};
use tracing::info;

use crate::config::Config;
use crate::types::*;
use crate::services::{VerificationService, SettlementService, MetricsService, Database};
use crate::services::metrics;
use crate::middleware::{ValidatedJson, AuthenticatedMerchant};

pub use merchant::create_merchant_router;
pub use admin::create_admin_router;

/// Application state shared across routes
#[derive(Clone)]
pub struct AppState {
    pub config: Arc<Config>,
    pub verification_service: Arc<VerificationService>,
    pub settlement_service: Arc<SettlementService>,
    pub metrics_service: Arc<MetricsService>,
    pub database: Arc<Database>,
    pub start_time: Instant,
}

/// Create the router with all routes
pub fn create_router(state: AppState) -> Router {
    let state_arc = Arc::new(state);
    
    Router::new()
        .route("/", get(root_handler))
        .route("/health", get(health_handler))
        .route("/networks", get(networks_handler))
        .route("/metrics", get(metrics_handler))
        .route("/verify", post(verify_handler))
        .route("/settle", post(settle_handler))
        // Merge merchant and admin routes
        .merge(create_merchant_router())
        .merge(create_admin_router())
        .with_state(state_arc)
}

/// Root endpoint - Service info
async fn root_handler(
    State(state): State<Arc<AppState>>,
) -> impl IntoResponse {
    Json(ServiceInfoResponse {
        name: state.config.service_name.clone(),
        description: state.config.service_description.clone(),
        endpoints: EndpointInfo {
            health: "GET /health".to_string(),
            networks: "GET /networks".to_string(),
            verify: "POST /verify".to_string(),
            settle: "POST /settle".to_string(),
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
async fn networks_handler(
    State(state): State<Arc<AppState>>,
) -> impl IntoResponse {
    let mainnet: Vec<NetworkInfo> = state.config.mainnet_networks
        .iter()
        .filter_map(|network| {
            state.config.networks.get(network).map(|nc| {
                NetworkInfo {
                    network: network.clone(),
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
                NetworkInfo {
                    network: network.clone(),
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

/// Verify payment endpoint
async fn verify_handler(
    State(state): State<Arc<AppState>>,
    Extension(merchant): Extension<AuthenticatedMerchant>,
    ValidatedJson(request): ValidatedJson<VerifyRequest>,
) -> impl IntoResponse {
    let start_time = Instant::now();
    let network = request.payment_requirements.network.clone();
    
    info!("=== VERIFY REQUEST RECEIVED ===");
    info!("Merchant: {}", merchant.0.auth_address);
    info!("Network: {}", network);
    info!("Asset: {}", request.payment_requirements.asset);
    info!("Amount: {}", request.payment_requirements.max_amount_required);

    let result = state.verification_service.verify(
        &request.payment_payload,
        &request.payment_requirements,
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
        if result.is_valid { "SUCCESS" } else { "FAILED" }
    );

    Json(result)
}

/// Settle payment endpoint
async fn settle_handler(
    State(state): State<Arc<AppState>>,
    Extension(merchant): Extension<AuthenticatedMerchant>,
    ValidatedJson(request): ValidatedJson<SettleRequest>,
) -> impl IntoResponse {
    let start_time = Instant::now();
    let network = request.payment_requirements.network.clone();
    
    info!("=== SETTLE REQUEST RECEIVED ===");
    info!("Merchant: {}", merchant.0.auth_address);
    info!("Network: {}", network);
    info!("Asset: {}", request.payment_requirements.asset);
    info!("Amount: {}", request.payment_requirements.max_amount_required);

    let result = state.settlement_service.settle(
        &request.payment_payload,
        &request.payment_requirements,
        &merchant.0,
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

    if result.success {
        (StatusCode::OK, Json(result))
    } else {
        (StatusCode::OK, Json(result)) // Still 200 for protocol compatibility
    }
}
