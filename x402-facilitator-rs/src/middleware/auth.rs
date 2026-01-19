//! API Key Authentication Middleware
//! 
//! Simple API key authentication using the new API key model.
//! No wallet signatures, no sessions - just API keys.

use std::sync::Arc;
use axum::{
    extract::{Request, State},
    http::{header, StatusCode},
    middleware::Next,
    response::{IntoResponse, Response},
    Json,
};
use tracing::{info, warn, debug};

use crate::types::{ApiKey, ErrorResponse};
use crate::services::{Database, Redis, ApiKeyDb};

/// Application state for auth middleware
#[derive(Clone)]
pub struct AuthState {
    pub database: Arc<Database>,
    pub redis: Arc<Redis>,
}

/// Public paths that don't require API key authentication
const PUBLIC_PATHS: &[&str] = &[
    "/", 
    "/health", 
    "/networks",
    "/supported", 
    "/metrics",
];

/// Check if a path is public (doesn't require auth)
fn is_public_path(path: &str) -> bool {
    // Exact match for static paths
    if PUBLIC_PATHS.contains(&path) {
        return true;
    }
    
    // Help endpoints are public (documentation)
    if path.starts_with("/help") {
        return true;
    }
    
    // Account endpoints are public (GET returns info, POST handles its own auth)
    if path.starts_with("/account") {
        return true;
    }
    
    
    // Credits creation endpoint is public (they validate the key in the body) - legacy
    if path == "/credits" {
        return true;
    }
    
    false
}

/// API key authentication middleware
pub async fn api_key_auth(
    State(state): State<Arc<AuthState>>,
    mut request: Request,
    next: Next,
) -> Response {
    let path = request.uri().path();
    
    // Skip auth for public endpoints
    if is_public_path(path) {
        return next.run(request).await;
    }

    // Get authorization header
    let auth_header = request.headers()
        .get(header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok());

    let api_key_str = match auth_header {
        Some(header) => {
            // Support both "Bearer TOKEN" and direct token
            if header.starts_with("Bearer ") {
                &header[7..]
            } else {
                header
            }
        }
        None => {
            warn!("Authentication failed: No Authorization header for {}", path);
            return (
                StatusCode::UNAUTHORIZED,
                Json(ErrorResponse::new(
                    "UNAUTHORIZED",
                    "Missing Authorization header. Use: Authorization: Bearer {api_key}"
                )),
            ).into_response();
        }
    };

    // Validate API key format
    // Supports both legacy 64-char hex and new prefixed format: x402_pk_live_xxx or x402_pk_test_xxx
    let is_valid_format = if api_key_str.starts_with("x402_pk_") {
        // New format: x402_pk_live_XXX or x402_pk_test_XXX (prefix + 32 chars)
        api_key_str.len() >= 20 && (
            api_key_str.starts_with("x402_pk_live_") || 
            api_key_str.starts_with("x402_pk_test_")
        )
    } else {
        // Legacy format: 64-char hex string
        api_key_str.len() == 64 && api_key_str.chars().all(|c| c.is_ascii_hexdigit())
    };

    if !is_valid_format {
        warn!("Authentication failed: Invalid API key format: {}", &api_key_str[..std::cmp::min(10, api_key_str.len())]);
        return (
            StatusCode::UNAUTHORIZED,
            Json(ErrorResponse::new(
                "UNAUTHORIZED",
                "Invalid API key format. Use x402_pk_live_xxx or x402_pk_test_xxx format."
            )),
        ).into_response();
    }

    // Try Redis cache first
    let api_key = match get_cached_api_key(&state.redis, api_key_str).await {
        Some(key) => key,
        None => {
            // Query database
            match ApiKeyDb::validate_api_key(state.database.pool(), api_key_str).await {
                Ok(key) => {
                    // Cache for 5 minutes
                    cache_api_key(&state.redis, &key).await;
                    debug!("Authenticated API key from DB: {}...{}", 
                           &key.api_key[..8], &key.api_key[key.api_key.len()-4..]);
                    key
                }
                Err(e) => {
                    warn!("Authentication failed: {}", e);
                    let message = match e {
                        crate::services::ApiKeyDbError::NotFound => 
                            "Invalid API key. Create one via POST /credits",
                        crate::services::ApiKeyDbError::Expired => 
                            "API key has expired. Add credits to extend: POST /credits",
                        crate::services::ApiKeyDbError::Inactive => 
                            "API key is inactive",
                        _ => "Authentication failed",
                    };
                    return (
                        StatusCode::UNAUTHORIZED,
                        Json(ErrorResponse::new("UNAUTHORIZED", message)),
                    ).into_response();
                }
            }
        }
    };

    info!("✓ Authenticated: {}...{} (${:.4})", 
          &api_key.api_key[..8], &api_key.api_key[api_key.api_key.len()-4..],
          api_key.total_balance());

    // Store API key in request extensions
    request.extensions_mut().insert(api_key);

    next.run(request).await
}

/// Try to get API key from Redis cache
async fn get_cached_api_key(redis: &Redis, api_key_str: &str) -> Option<ApiKey> {
    let cache_key = format!("apikey:{}", api_key_str);
    
    match redis.get(&cache_key).await {
        Ok(Some(json)) => {
            match serde_json::from_str::<ApiKey>(&json) {
                Ok(key) => {
                    // Verify the cached key is still valid
                    if key.is_valid() {
                        debug!("Auth cache hit for API key: {}...{}", 
                               &key.api_key[..8], &key.api_key[key.api_key.len()-4..]);
                        return Some(key);
                    }
                }
                Err(e) => {
                    warn!("Failed to deserialize cached API key: {}", e);
                }
            }
        }
        Ok(None) => {}
        Err(e) => {
            debug!("Redis cache check failed: {}", e);
        }
    }
    
    None
}

/// Cache API key in Redis
async fn cache_api_key(redis: &Redis, key: &ApiKey) {
    let cache_key = format!("apikey:{}", key.api_key);
    
    if let Ok(json) = serde_json::to_string(key) {
        if let Err(e) = redis.set_ex(&cache_key, &json, 300).await { // 5 minutes
            debug!("Failed to cache API key: {}", e);
        }
    }
}
