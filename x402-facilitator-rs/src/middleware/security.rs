//! Security Middleware
//! 
//! Blocks common attack patterns and implements IP banning

use std::sync::Arc;
use axum::{
    extract::{ConnectInfo, Request, State},
    http::StatusCode,
    middleware::Next,
    response::{IntoResponse, Response},
    Json,
};
use dashmap::DashMap;
use once_cell::sync::Lazy;
use regex::Regex;
use tracing::{warn, error, debug};

use crate::types::ErrorResponse;

/// Suspicious patterns to block
static SUSPICIOUS_PATTERNS: Lazy<Vec<Regex>> = Lazy::new(|| {
    vec![
        Regex::new(r"\.\.\/\.\.\/").unwrap(),           // Path traversal
        Regex::new(r"\/bin\/sh").unwrap(),              // Shell access
        Regex::new(r"eval-stdin\.php").unwrap(),        // PHPUnit RCE
        Regex::new(r"\/cgi-bin\/").unwrap(),            // CGI exploits
        Regex::new(r"\.env$").unwrap(),                 // Environment file
        Regex::new(r"\/phpunit\/").unwrap(),            // PHPUnit exploits
        Regex::new(r"\/vendor\/").unwrap(),             // Vendor folder scans
        Regex::new(r"\/\.git\/").unwrap(),              // Git folder access
        Regex::new(r"\.sql$").unwrap(),                 // SQL file access
        Regex::new(r"\/wp-admin\/").unwrap(),           // WordPress scans
        Regex::new(r"\/phpmyadmin").unwrap(),           // phpMyAdmin scans
    ]
});

/// Allowed paths
static ALLOWED_PATHS: Lazy<Vec<Regex>> = Lazy::new(|| {
    vec![
        Regex::new(r"^/$").unwrap(),                    // Root endpoint
        Regex::new(r"^/health$").unwrap(),              // Health check
        Regex::new(r"^/networks$").unwrap(),            // Networks info (detailed)
        Regex::new(r"^/supported$").unwrap(),           // Supported kinds (x402 standard)
        Regex::new(r"^/metrics$").unwrap(),             // Prometheus metrics (localhost only)
        Regex::new(r"^/verify$").unwrap(),              // Verify payment
        Regex::new(r"^/settle$").unwrap(),              // Settle payment
        Regex::new(r"^/help").unwrap(),                 // Help documentation
        Regex::new(r"^/account").unwrap(),              // Account API (purchase credits, balance, metrics)
        Regex::new(r"^/credits").unwrap(),              // Credits API (legacy)
        Regex::new(r"^/api/").unwrap(),                 // API endpoints (credits, transactions)
        Regex::new(r"^/admin/").unwrap(),               // Admin dashboard API
    ]
});

/// IP tracking data
#[derive(Debug, Clone)]
pub struct IpTracker {
    pub count: u32,
    pub last_seen: u64,
}

/// Security state
#[derive(Clone)]
pub struct SecurityState {
    /// Track suspicious IPs
    suspicious_ips: Arc<DashMap<String, IpTracker>>,
    /// Ban threshold
    ban_threshold: u32,
    /// Ban duration in milliseconds
    ban_duration_ms: u64,
}

impl SecurityState {
    pub fn new(ban_threshold: u32, ban_duration_ms: u64) -> Self {
        Self {
            suspicious_ips: Arc::new(DashMap::new()),
            ban_threshold,
            ban_duration_ms,
        }
    }

    /// Check if an IP is banned
    fn is_banned(&self, ip: &str) -> bool {
        if let Some(tracker) = self.suspicious_ips.get(ip) {
            if tracker.count >= self.ban_threshold {
                let now = chrono::Utc::now().timestamp_millis() as u64;
                let time_since_ban = now - tracker.last_seen;
                
                if time_since_ban < self.ban_duration_ms {
                    return true;
                } else {
                    // Unban after duration
                    self.suspicious_ips.remove(ip);
                }
            }
        }
        false
    }

    /// Record suspicious activity
    fn record_suspicious(&self, ip: &str) {
        let now = chrono::Utc::now().timestamp_millis() as u64;
        
        self.suspicious_ips
            .entry(ip.to_string())
            .and_modify(|tracker| {
                tracker.count += 1;
                tracker.last_seen = now;
            })
            .or_insert(IpTracker {
                count: 1,
                last_seen: now,
            });
    }

    /// Cleanup old entries
    pub fn cleanup(&self) {
        let now = chrono::Utc::now().timestamp_millis() as u64;
        let cutoff = now - (self.ban_duration_ms * 2);
        
        self.suspicious_ips.retain(|_, tracker| {
            tracker.last_seen > cutoff
        });
    }
}

/// Security middleware
pub async fn security_middleware(
    State(state): State<Arc<SecurityState>>,
    ConnectInfo(addr): ConnectInfo<std::net::SocketAddr>,
    request: Request,
    next: Next,
) -> Response {
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
    
    let path = request.uri().path();

    // Check if IP is banned
    if state.is_banned(&ip) {
        warn!("🚫 Blocked banned IP: {} ({})", ip, path);
        return (
            StatusCode::FORBIDDEN,
            Json(ErrorResponse::new("Forbidden", "Access denied")),
        ).into_response();
    }

    // Check for suspicious patterns
    let is_suspicious = SUSPICIOUS_PATTERNS.iter().any(|pattern| pattern.is_match(path));
    
    if is_suspicious {
        state.record_suspicious(&ip);
        
        let tracker = state.suspicious_ips.get(&ip);
        let count = tracker.map(|t| t.count).unwrap_or(0);
        
        warn!("⚠️ Suspicious request from {}: {} (count: {})", ip, path, count);
        
        if count >= state.ban_threshold {
            error!("🚫 IP banned for suspicious activity: {}", ip);
        }
        
        return (
            StatusCode::NOT_FOUND,
            Json(ErrorResponse::new("Not Found", "The requested resource was not found")),
        ).into_response();
    }

    // Special handling for /metrics - only allow from localhost
    if path == "/metrics" {
        if ip == "127.0.0.1" || ip == "::1" {
            return next.run(request).await;
        } else {
            warn!("🔒 Non-localhost metrics access blocked: {}", ip);
            return (
                StatusCode::FORBIDDEN,
                Json(ErrorResponse::new("Forbidden", "Metrics endpoint is only accessible from localhost")),
            ).into_response();
        }
    }

    // Check if path is allowed
    let is_allowed = ALLOWED_PATHS.iter().any(|pattern| pattern.is_match(path));
    
    if !is_allowed && path != "/" {
        warn!("🔒 Unauthorized path access attempt: {} → {}", ip, path);
        return (
            StatusCode::NOT_FOUND,
            Json(ErrorResponse::new("Not Found", "The requested resource was not found")),
        ).into_response();
    }

    next.run(request).await
}

/// Start periodic cleanup task
pub fn start_cleanup_task(state: Arc<SecurityState>, interval_ms: u64) {
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(
            tokio::time::Duration::from_millis(interval_ms)
        );
        
        loop {
            interval.tick().await;
            state.cleanup();
            debug!("Security cleanup completed");
        }
    });
}
