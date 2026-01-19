//! Rate Limiting Middleware
//! 
//! Simplified rate limiting for API key model:
//! - Public endpoints: 200 requests/minute (IP-based) - /health, /help, /credits
//! - Authenticated endpoints: 1500 requests/minute (API key based) - /verify, /settle

use std::sync::Arc;

use axum::{
    extract::{ConnectInfo, Request, State},
    http::StatusCode,
    middleware::Next,
    response::{IntoResponse, Response},
    Json,
};
use governor::{Quota, RateLimiter, clock::DefaultClock, state::keyed::DefaultKeyedStateStore};
use std::num::NonZeroU32;
use tracing::{warn, debug};

use crate::types::ErrorResponse;
use crate::types::api_key::ApiKey;

/// Rate limiter type alias
pub type KeyedRateLimiter = RateLimiter<String, DefaultKeyedStateStore<String>, DefaultClock>;

/// Rate limit configuration
/// For AI agents with high polling rates, we use generous limits
pub const PUBLIC_LIMIT_PER_MIN: u32 = 200;        // Health checks, help, credits balance
pub const AUTHENTICATED_LIMIT_PER_MIN: u32 = 1500; // /verify, /settle - high for AI agents

/// Rate limit state
#[derive(Clone)]
pub struct RateLimitState {
    /// Public rate limiter (IP-based) - 200/min
    pub public: Arc<KeyedRateLimiter>,
    /// Authenticated rate limiter (API key based) - 1500/min
    pub authenticated: Arc<KeyedRateLimiter>,
}

impl RateLimitState {
    /// Create rate limiters with default quotas
    pub fn new() -> Self {
        Self {
            public: Arc::new(RateLimiter::keyed(
                Quota::per_minute(NonZeroU32::new(PUBLIC_LIMIT_PER_MIN).unwrap())
            )),
            authenticated: Arc::new(RateLimiter::keyed(
                Quota::per_minute(NonZeroU32::new(AUTHENTICATED_LIMIT_PER_MIN).unwrap())
            )),
        }
    }
    
    /// Create rate limiters with custom quotas
    pub fn with_limits(public_per_min: u32, auth_per_min: u32) -> Self {
        Self {
            public: Arc::new(RateLimiter::keyed(
                Quota::per_minute(NonZeroU32::new(public_per_min).unwrap())
            )),
            authenticated: Arc::new(RateLimiter::keyed(
                Quota::per_minute(NonZeroU32::new(auth_per_min).unwrap())
            )),
        }
    }
}

impl Default for RateLimitState {
    fn default() -> Self {
        Self::new()
    }
}

/// General rate limiter for public endpoints (IP-based)
/// Skips rate limiting if request has X-Api-Key header (will use api_key_rate_limiter instead)
pub async fn general_rate_limiter(
    State(state): State<Arc<RateLimitState>>,
    ConnectInfo(addr): ConnectInfo<std::net::SocketAddr>,
    request: Request,
    next: Next,
) -> Response {
    // Skip IP-based rate limiting if request has API key header
    // These requests will be rate-limited by api_key_rate_limiter instead
    if request.headers().contains_key("x-api-key") {
        return next.run(request).await;
    }
    
    // Get real client IP from proxy headers (Nginx sets these)
    // Priority: X-Forwarded-For > X-Real-IP > ConnectInfo
    let ip = request.headers()
        .get("x-forwarded-for")
        .and_then(|v| v.to_str().ok())
        .and_then(|s| s.split(',').next()) // First IP in chain is the client
        .map(|s| s.trim().to_string())
        .or_else(|| {
            request.headers()
                .get("x-real-ip")
                .and_then(|v| v.to_str().ok())
                .map(|s| s.to_string())
        })
        .unwrap_or_else(|| addr.ip().to_string());
    
    if state.public.check_key(&ip).is_err() {
        warn!("Rate limit exceeded for IP: {} (limit: {}/min)", ip, PUBLIC_LIMIT_PER_MIN);
        return rate_limit_response(PUBLIC_LIMIT_PER_MIN, "public");
    }

    next.run(request).await
}

/// API key rate limiter for authenticated endpoints (1500/min per API key)
pub async fn api_key_rate_limiter(
    State(state): State<Arc<RateLimitState>>,
    request: Request,
    next: Next,
) -> Response {
    // Get authenticated API key from extensions (set by auth middleware)
    let api_key = match request.extensions().get::<ApiKey>() {
        Some(key) => key.api_key.clone(),
        None => {
            // No API key auth - allow request (auth middleware will handle it)
            return next.run(request).await;
        }
    };

    let path = request.uri().path().to_string();
    let key = format!("{}:{}", api_key, path);

    if state.authenticated.check_key(&key).is_err() {
        warn!(
            "API key rate limit exceeded: {}... on {} (limit: {}/min)",
            &api_key[..12], path, AUTHENTICATED_LIMIT_PER_MIN
        );
        return rate_limit_response(AUTHENTICATED_LIMIT_PER_MIN, "authenticated");
    }

    debug!("API key {}... rate check passed on {}", &api_key[..12], path);

    let mut response = next.run(request).await;
    
    // Add rate limit headers to successful responses
    let headers = response.headers_mut();
    headers.insert("X-RateLimit-Limit", AUTHENTICATED_LIMIT_PER_MIN.to_string().parse().unwrap());
    
    response
}

/// Create a rate limit exceeded response
fn rate_limit_response(limit: u32, tier: &str) -> Response {
    let mut response = (
        StatusCode::TOO_MANY_REQUESTS,
        Json(ErrorResponse::new(
            "Too Many Requests",
            format!(
                "Rate limit exceeded. Limit: {} requests/minute for {} requests. Wait 60 seconds.",
                limit, tier
            ),
        )),
    ).into_response();
    
    // Add rate limit headers
    let headers = response.headers_mut();
    headers.insert("X-RateLimit-Limit", limit.to_string().parse().unwrap());
    headers.insert("X-RateLimit-Remaining", "0".parse().unwrap());
    headers.insert("Retry-After", "60".parse().unwrap());
    
    response
}
