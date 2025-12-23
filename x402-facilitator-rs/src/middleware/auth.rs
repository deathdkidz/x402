//! Authentication Middleware
//! 
//! API key authentication using database-backed merchant lookup with Redis caching

#![allow(dead_code)]

use std::sync::Arc;
use axum::{
    extract::{Request, State},
    http::{header, StatusCode},
    middleware::Next,
    response::{IntoResponse, Response},
    Json,
};
use tracing::{info, warn, debug};

use crate::types::{Merchant, ErrorResponse};
use crate::services::{Database, Redis};

/// Application state for auth middleware
#[derive(Clone)]
pub struct AuthState {
    pub database: Arc<Database>,
    pub redis: Arc<Redis>,
}

/// Extension to store authenticated merchant in request
#[derive(Clone)]
pub struct AuthenticatedMerchant(pub Merchant);

/// Public paths that don't require API key authentication
/// These paths handle their own authentication (e.g., wallet signature, session tokens)
const PUBLIC_PATHS: &[&str] = &[
    "/", 
    "/health", 
    "/networks", 
    "/metrics",
    // Merchant auth routes (use SIWE wallet signature auth)
    "/merchant/siwe/nonce",
    "/merchant/siwe/verify",
    "/merchant/session",
    "/merchant/logout",
    // Topup routes
    "/topup/packages",
    "/topup/order",
];

/// Admin routes use session token authentication, not API keys
fn is_admin_path(path: &str) -> bool {
    path.starts_with("/admin/")
}

/// Merchant dashboard routes use session tokens
fn is_merchant_dashboard_path(path: &str) -> bool {
    path.starts_with("/merchant/") && !PUBLIC_PATHS.contains(&path)
}

/// API key authentication middleware
/// Note: /metrics access control is handled in security.rs (checks real client IP from proxy headers)
pub async fn api_key_auth(
    State(state): State<Arc<AuthState>>,
    mut request: Request,
    next: Next,
) -> Response {
    let path = request.uri().path();
    
    // Skip API key auth for public endpoints
    if PUBLIC_PATHS.contains(&path) {
        return next.run(request).await;
    }
    
    // Skip API key auth for admin routes (they use session tokens)
    if is_admin_path(path) {
        return next.run(request).await;
    }
    
    // Skip API key auth for merchant dashboard routes (they use session tokens)
    if is_merchant_dashboard_path(path) {
        return next.run(request).await;
    }

    // Get authorization header
    let auth_header = request.headers()
        .get(header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok());

    let api_key = match auth_header {
        Some(header) => {
            // Support both "Bearer TOKEN" and direct token
            if header.starts_with("Bearer ") {
                &header[7..]
            } else {
                header
            }
        }
        None => {
            warn!("Authentication failed: No Authorization header");
            return (
                StatusCode::UNAUTHORIZED,
                Json(ErrorResponse::new("Unauthorized", "Missing Authorization header")),
            ).into_response();
        }
    };

    // Try Redis cache first
    let merchant = match state.redis.get_cached_merchant(api_key).await {
        Ok(Some(json)) => {
            // Cache hit
            match serde_json::from_str::<Merchant>(&json) {
                Ok(m) => {
                    debug!("Auth cache hit for merchant: {}", m.auth_address);
                    Some(m)
                }
                Err(e) => {
                    warn!("Failed to deserialize cached merchant: {}", e);
                    None
                }
            }
        }
        Ok(None) => None,
        Err(e) => {
            debug!("Redis cache check failed: {}", e);
            None
        }
    };

    // If not in cache, query database
    let merchant = match merchant {
        Some(m) => m,
        None => {
            match state.database.get_merchant_by_api_key(api_key).await {
                Ok(Some(m)) => {
                    // Cache for 1 hour
                    if let Ok(json) = serde_json::to_string(&m) {
                        if let Err(e) = state.redis.cache_merchant(api_key, &json, 3600).await {
                            debug!("Failed to cache merchant: {}", e);
                        }
                    }
                    debug!("Authenticated merchant from DB: {}", m.auth_address);
                    m
                }
                Ok(None) => {
                    warn!("Authentication failed: Invalid API key");
                    return (
                        StatusCode::UNAUTHORIZED,
                        Json(ErrorResponse::new("Unauthorized", "Invalid API key")),
                    ).into_response();
                }
                Err(e) => {
                    warn!("Database error during authentication: {}", e);
                    return (
                        StatusCode::INTERNAL_SERVER_ERROR,
                        Json(ErrorResponse::new("Internal Server Error", "Authentication service unavailable")),
                    ).into_response();
                }
            }
        }
    };

    info!("Authenticated merchant: {}", merchant.auth_address);

    // Store merchant in request extensions
    request.extensions_mut().insert(AuthenticatedMerchant(merchant));

    next.run(request).await
}

/// Extract authenticated merchant from request
pub fn get_merchant(request: &Request) -> Option<&Merchant> {
    request.extensions()
        .get::<AuthenticatedMerchant>()
        .map(|am| &am.0)
}
