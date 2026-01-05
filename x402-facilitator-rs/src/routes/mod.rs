//! Routes module
//! 
//! HTTP route handlers for the x402 facilitator API
//! 
//! x402 v2 Standard:
//! - Headers: PAYMENT-REQUIRED, PAYMENT-SIGNATURE, PAYMENT-RESPONSE, PAYMENT-VERSION
//! - All except PAYMENT-VERSION are base64 encoded
//! - CAIP-2 network identifiers (eip155:chainId)
//! - "accepts" instead of "paymentOptions"
//! 
//! Endpoints:
//! - Public: /, /health, /networks, /help, /account
//! - Authenticated: /verify, /settle

mod account;
mod credits;
mod help;

use std::sync::Arc;
use std::time::Instant;
use axum::{
    body::Bytes,
    extract::State,
    http::{HeaderMap, StatusCode, header::HeaderValue},
    response::IntoResponse,
    routing::{get, post},
    Json, Router,
};
use tracing::{info, debug};

use crate::config::{Config, network_resolver};
use crate::types::*;
use crate::services::{VerificationService, SettlementService, MetricsService, Database, PriceFeedService};
use crate::services::metrics;

pub use account::create_account_router;
pub use credits::create_credits_router;
pub use help::create_help_router;

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
        .route("/metrics", get(metrics_handler))
        // Core API (requires authentication)
        .route("/verify", post(verify_handler))
        .route("/settle", post(settle_handler))
        // Merge account, credits (legacy) and help routes
        .merge(create_account_router())
        .merge(create_credits_router())  // Keep for backward compatibility
        .merge(create_help_router())
        .with_state(state_arc)
}

/// Root endpoint - Service info
async fn root_handler(
    State(state): State<Arc<AppState>>,
) -> impl IntoResponse {
    Json(serde_json::json!({
        "name": state.config.service_name,
        "description": state.config.service_description,
        "version": "2.0.0",
        "endpoints": {
            "health": "GET /health",
            "networks": "GET /networks",
            "help": "GET /help",
            "account": "GET /account (info) | POST /account (purchase credits)",
            "verify": "POST /verify (requires API key)",
            "settle": "POST /settle (requires API key)"
        },
        "mainnetNetworks": state.config.mainnet_networks,
        "testnetNetworks": state.config.testnet_networks
    }))
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

/// Networks endpoint - List supported networks and tokens (x402 v2)
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

    // Add PAYMENT-VERSION header
    let mut headers = HeaderMap::new();
    headers.insert(headers::PAYMENT_VERSION, HeaderValue::from_static(X402_VERSION));

    (headers, Json(NetworksResponse {
        success: true,
        mainnet,
        testnet,
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

/// Extract x402 v2 request from headers or body
/// Priority: headers > body (if both exist, use headers)
fn extract_x402_request(
    headers: &HeaderMap,
    body: &[u8],
) -> Result<(PaymentPayload, PaymentRequirements), (StatusCode, Json<ErrorResponse>)> {
    // Check for x402 v2 headers first
    let has_signature_header = headers.get(headers::PAYMENT_SIGNATURE).is_some();
    let has_required_header = headers.get(headers::PAYMENT_REQUIRED).is_some();
    
    if has_signature_header && has_required_header {
        // Parse from headers (x402 v2 format)
        debug!("Parsing x402 v2 request from headers");
        
        let version = headers.get(headers::PAYMENT_VERSION)
            .and_then(|v| v.to_str().ok())
            .unwrap_or("2");
        
        if version != "2" && version != "1" {
            return Err((
                StatusCode::BAD_REQUEST,
                Json(ErrorResponse::new("INVALID_VERSION", format!("Unsupported x402 version: {}", version)))
            ));
        }
        
        let signature_b64 = headers.get(headers::PAYMENT_SIGNATURE)
            .and_then(|v| v.to_str().ok())
            .ok_or_else(|| (
                StatusCode::BAD_REQUEST,
                Json(ErrorResponse::new("INVALID_HEADER", "Invalid PAYMENT-SIGNATURE header"))
            ))?;
        
        let required_b64 = headers.get(headers::PAYMENT_REQUIRED)
            .and_then(|v| v.to_str().ok())
            .ok_or_else(|| (
                StatusCode::BAD_REQUEST,
                Json(ErrorResponse::new("INVALID_HEADER", "Invalid PAYMENT-REQUIRED header"))
            ))?;
        
        let payment_sig = PaymentSignatureV2::from_base64(signature_b64)
            .map_err(|e| (
                StatusCode::BAD_REQUEST,
                Json(ErrorResponse::new("DECODE_ERROR", format!("Failed to decode PAYMENT-SIGNATURE: {}", e)))
            ))?;
        
        let payment_req = PaymentRequirementsV2::from_base64(required_b64)
            .map_err(|e| (
                StatusCode::BAD_REQUEST,
                Json(ErrorResponse::new("DECODE_ERROR", format!("Failed to decode PAYMENT-REQUIRED: {}", e)))
            ))?;
        
        // Convert to legacy types for processing
        let payload: PaymentPayload = (&payment_sig).into();
        let requirements: PaymentRequirements = (&payment_req).into();
        
        return Ok((payload, requirements));
    }
    
    // Fall back to JSON body
    if body.is_empty() {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse::new("MISSING_DATA", "No x402 headers or JSON body provided"))
        ));
    }
    
    debug!("Parsing x402 request from JSON body");
    
    // Try to parse as VerifyRequest or SettleRequest format
    #[derive(serde::Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct RequestBody {
        #[serde(default)]
        x402_version: Option<u32>,
        payment_payload: Option<PaymentPayload>,
        payment_requirements: Option<PaymentRequirements>,
        // v2 format fields
        payment_signature: Option<PaymentSignatureV2>,
        #[serde(alias = "paymentRequirements")]
        requirements: Option<PaymentRequirementsV2>,
    }
    
    let parsed: RequestBody = serde_json::from_slice(body)
        .map_err(|e| (
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse::new("PARSE_ERROR", format!("Invalid JSON: {}", e)))
        ))?;
    
    // Try v1 format first (legacy)
    if let (Some(payload), Some(requirements)) = (parsed.payment_payload, parsed.payment_requirements) {
        return Ok((payload, requirements));
    }
    
    // Try v2 format
    if let (Some(sig), Some(req)) = (parsed.payment_signature, parsed.requirements) {
        let payload: PaymentPayload = (&sig).into();
        let requirements: PaymentRequirements = (&req).into();
        return Ok((payload, requirements));
    }
    
    Err((
        StatusCode::BAD_REQUEST,
        Json(ErrorResponse::new("MISSING_FIELDS", "Missing paymentPayload/paymentRequirements or paymentSignature/requirements"))
    ))
}

/// Verify payment endpoint
/// Accepts both x402 v2 headers and JSON body
async fn verify_handler(
    State(state): State<Arc<AppState>>,
    axum::Extension(api_key): axum::Extension<crate::types::ApiKey>,
    headers: HeaderMap,
    body: Bytes,
) -> impl IntoResponse {
    let start_time = Instant::now();
    
    // Extract request from headers or body
    let (payment_payload, payment_requirements) = match extract_x402_request(&headers, &body) {
        Ok(data) => data,
        Err(err) => return err.into_response(),
    };
    
    // Normalize network name (supports CAIP-2, chain ID, various formats)
    let network = state.config.normalize_network_name(&payment_requirements.network);
    
    info!("=== VERIFY REQUEST (x402 v2) ===");
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

    // Build response with x402 v2 headers
    let mut response_headers = HeaderMap::new();
    response_headers.insert(
        headers::PAYMENT_VERSION,
        HeaderValue::from_static(X402_VERSION)
    );
    
    (response_headers, Json(result)).into_response()
}

/// Settle payment endpoint
/// Accepts both x402 v2 headers and JSON body
async fn settle_handler(
    State(state): State<Arc<AppState>>,
    axum::Extension(api_key): axum::Extension<crate::types::ApiKey>,
    headers: HeaderMap,
    body: Bytes,
) -> impl IntoResponse {
    let start_time = Instant::now();
    
    // Extract request from headers or body
    let (payment_payload, payment_requirements) = match extract_x402_request(&headers, &body) {
        Ok(data) => data,
        Err(err) => return err.into_response(),
    };
    
    // Normalize network name (supports CAIP-2, chain ID, various formats)
    let network = state.config.normalize_network_name(&payment_requirements.network);
    
    info!("=== SETTLE REQUEST (x402 v2) ===");
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

    // Build x402 v2 response with headers
    let mut response_headers = HeaderMap::new();
    response_headers.insert(
        headers::PAYMENT_VERSION,
        HeaderValue::from_static(X402_VERSION)
    );
    
    // Include PAYMENT-RESPONSE header with base64 encoded result
    let caip2_network = network_resolver::get_caip2(&network).unwrap_or(network.clone());
    let payment_response = if result.success {
        PaymentResponseV2::success(
            caip2_network,
            result.payer.clone().unwrap_or_default(),
            result.transaction.clone().unwrap_or_default(),
        )
    } else {
        PaymentResponseV2::failure(
            caip2_network,
            result.error_reason.clone().unwrap_or_default(),
        )
    };
    
    if let Ok(encoded) = payment_response.to_base64() {
        if let Ok(value) = HeaderValue::from_str(&encoded) {
            response_headers.insert(headers::PAYMENT_RESPONSE, value);
        }
    }

    (response_headers, Json(result)).into_response()
}
