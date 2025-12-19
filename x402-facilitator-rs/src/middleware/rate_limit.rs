//! Rate Limiting Middleware
//! 
//! Simplified rate limiting:
//! - Unauthenticated endpoints: 200 requests/minute (IP-based)
//! - Authenticated endpoints: 1500 requests/minute (API key based)

#![allow(dead_code)]

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
use crate::middleware::auth::AuthenticatedMerchant;

/// Rate limiter type alias
pub type KeyedRateLimiter = RateLimiter<String, DefaultKeyedStateStore<String>, DefaultClock>;

/// Rate limit configuration
pub const UNAUTHENTICATED_LIMIT_PER_MIN: u32 = 200;
pub const AUTHENTICATED_LIMIT_PER_MIN: u32 = 1500;

/// Rate limit state
#[derive(Clone)]
pub struct RateLimitState {
    /// Unauthenticated rate limiter (IP-based) - 200/min
    pub unauthenticated: Arc<KeyedRateLimiter>,
    /// Authenticated rate limiter (API key based) - 1500/min
    pub authenticated: Arc<KeyedRateLimiter>,
}

impl RateLimitState {
    /// Create rate limiters with default quotas
    pub fn new() -> Self {
        Self {
            unauthenticated: Arc::new(RateLimiter::keyed(
                Quota::per_minute(NonZeroU32::new(UNAUTHENTICATED_LIMIT_PER_MIN).unwrap())
            )),
            authenticated: Arc::new(RateLimiter::keyed(
                Quota::per_minute(NonZeroU32::new(AUTHENTICATED_LIMIT_PER_MIN).unwrap())
            )),
        }
    }
    
    /// Create rate limiters with custom quotas
    pub fn with_limits(unauth_per_min: u32, auth_per_min: u32) -> Self {
        Self {
            unauthenticated: Arc::new(RateLimiter::keyed(
                Quota::per_minute(NonZeroU32::new(unauth_per_min).unwrap())
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

/// General rate limiter for unauthenticated endpoints (IP-based, 200/min)
pub async fn general_rate_limiter(
    State(state): State<Arc<RateLimitState>>,
    ConnectInfo(addr): ConnectInfo<std::net::SocketAddr>,
    request: Request,
    next: Next,
) -> Response {
    let ip = addr.ip().to_string();
    
    if state.unauthenticated.check_key(&ip).is_err() {
        warn!("Rate limit exceeded for IP: {} (limit: {}/min)", ip, UNAUTHENTICATED_LIMIT_PER_MIN);
        return rate_limit_response(UNAUTHENTICATED_LIMIT_PER_MIN, 0, "unauthenticated");
    }

    next.run(request).await
}

/// Merchant rate limiter for authenticated endpoints (API key based, 1500/min)
pub async fn merchant_rate_limiter(
    State(state): State<Arc<RateLimitState>>,
    request: Request,
    next: Next,
) -> Response {
    // Get authenticated merchant
    let merchant_key = match request.extensions().get::<AuthenticatedMerchant>() {
        Some(am) => am.0.auth_address.clone(),
        None => {
            // No merchant auth - this shouldn't happen on authenticated routes
            // but if it does, allow the request (auth middleware will handle it)
            return next.run(request).await;
        }
    };

    let path = request.uri().path().to_string();
    let key = format!("{}:{}", merchant_key, path);

    if state.authenticated.check_key(&key).is_err() {
        warn!(
            "Merchant rate limit exceeded: {} on {} (limit: {}/min)",
            merchant_key, path, AUTHENTICATED_LIMIT_PER_MIN
        );
        return rate_limit_response(AUTHENTICATED_LIMIT_PER_MIN, 0, "authenticated");
    }

    debug!("Merchant {} rate check passed on {}", merchant_key, path);

    let mut response = next.run(request).await;
    
    // Add rate limit headers to successful responses
    let headers = response.headers_mut();
    headers.insert("X-RateLimit-Limit", AUTHENTICATED_LIMIT_PER_MIN.to_string().parse().unwrap());
    
    response
}

/// Create a rate limit exceeded response
fn rate_limit_response(limit: u32, remaining: u32, tier: &str) -> Response {
    let mut response = (
        StatusCode::TOO_MANY_REQUESTS,
        Json(ErrorResponse::new(
            "Too Many Requests",
            format!(
                "Rate limit exceeded. Limit: {} requests/minute for {} requests.",
                limit, tier
            ),
        )),
    ).into_response();
    
    // Add rate limit headers
    let headers = response.headers_mut();
    headers.insert("X-RateLimit-Limit", limit.to_string().parse().unwrap());
    headers.insert("X-RateLimit-Remaining", remaining.to_string().parse().unwrap());
    headers.insert("Retry-After", "60".parse().unwrap());
    
    response
}
