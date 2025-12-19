//! Prometheus Metrics Service
//! 
//! Provides application-wide metrics for monitoring:
//! - Request latency histograms
//! - RPC call durations
//! - Cache hit rates
//! - Transaction counters

use metrics::{counter, gauge, histogram, describe_counter, describe_gauge, describe_histogram};
use metrics_exporter_prometheus::{PrometheusBuilder, PrometheusHandle};
use tracing::info;

/// Metrics service for Prometheus integration
pub struct MetricsService {
    handle: PrometheusHandle,
}

impl MetricsService {
    /// Create and initialize the metrics service
    pub fn new() -> Result<Self, MetricsError> {
        // Build Prometheus exporter
        let handle = PrometheusBuilder::new()
            .install_recorder()
            .map_err(|e| MetricsError::InitError(e.to_string()))?;

        // Describe all metrics
        Self::describe_metrics();

        info!("📊 Prometheus metrics initialized");

        Ok(Self { handle })
    }

    /// Describe all metrics (for Prometheus HELP text)
    fn describe_metrics() {
        // Request metrics
        describe_counter!(
            "x402_requests_total",
            "Total number of API requests"
        );
        describe_histogram!(
            "x402_request_duration_seconds",
            "Request duration in seconds"
        );

        // Settlement metrics
        describe_counter!(
            "x402_settlements_total",
            "Total number of settlement attempts"
        );
        describe_counter!(
            "x402_settlements_success",
            "Total number of successful settlements"
        );
        describe_counter!(
            "x402_settlements_failed",
            "Total number of failed settlements"
        );
        describe_histogram!(
            "x402_settlement_duration_seconds",
            "Settlement processing duration in seconds"
        );

        // Verification metrics
        describe_counter!(
            "x402_verifications_total",
            "Total number of verification requests"
        );
        describe_counter!(
            "x402_verifications_valid",
            "Total number of valid verifications"
        );
        describe_counter!(
            "x402_verifications_invalid",
            "Total number of invalid verifications"
        );
        describe_histogram!(
            "x402_verification_duration_seconds",
            "Verification processing duration in seconds"
        );

        // RPC metrics
        describe_histogram!(
            "x402_rpc_duration_seconds",
            "RPC call duration in seconds"
        );
        describe_counter!(
            "x402_rpc_calls_total",
            "Total number of RPC calls"
        );
        describe_counter!(
            "x402_rpc_errors_total",
            "Total number of RPC errors"
        );

        // Cache metrics
        describe_counter!(
            "x402_cache_hits_total",
            "Total number of cache hits"
        );
        describe_counter!(
            "x402_cache_misses_total",
            "Total number of cache misses"
        );
        describe_gauge!(
            "x402_cache_hit_rate",
            "Cache hit rate percentage"
        );

        // Provider metrics
        describe_gauge!(
            "x402_providers_active",
            "Number of active RPC providers"
        );
        describe_gauge!(
            "x402_providers_websocket",
            "Number of WebSocket providers"
        );
        describe_gauge!(
            "x402_providers_http",
            "Number of HTTP providers"
        );

        // Gas metrics
        describe_histogram!(
            "x402_gas_used",
            "Gas used per transaction"
        );
        describe_histogram!(
            "x402_gas_price_gwei",
            "Gas price in gwei"
        );

        // Credit metrics
        describe_gauge!(
            "x402_credits_deducted_total",
            "Total credits deducted"
        );
    }

    /// Get the Prometheus metrics output (for /metrics endpoint)
    pub fn render(&self) -> String {
        self.handle.render()
    }
}

// Static metric recording functions (can be called from anywhere)

/// Record a request
pub fn record_request(endpoint: &str, method: &str, status: u16) {
    counter!("x402_requests_total", "endpoint" => endpoint.to_string(), "method" => method.to_string(), "status" => status.to_string()).increment(1);
}

/// Record request duration
pub fn record_request_duration(endpoint: &str, duration_secs: f64) {
    histogram!("x402_request_duration_seconds", "endpoint" => endpoint.to_string()).record(duration_secs);
}

/// Record a settlement attempt
pub fn record_settlement(network: &str, success: bool) {
    counter!("x402_settlements_total", "network" => network.to_string()).increment(1);
    if success {
        counter!("x402_settlements_success", "network" => network.to_string()).increment(1);
    } else {
        counter!("x402_settlements_failed", "network" => network.to_string()).increment(1);
    }
}

/// Record settlement duration
pub fn record_settlement_duration(network: &str, duration_secs: f64) {
    histogram!("x402_settlement_duration_seconds", "network" => network.to_string()).record(duration_secs);
}

/// Record a verification
pub fn record_verification(network: &str, valid: bool) {
    counter!("x402_verifications_total", "network" => network.to_string()).increment(1);
    if valid {
        counter!("x402_verifications_valid", "network" => network.to_string()).increment(1);
    } else {
        counter!("x402_verifications_invalid", "network" => network.to_string()).increment(1);
    }
}

/// Record verification duration
pub fn record_verification_duration(network: &str, duration_secs: f64) {
    histogram!("x402_verification_duration_seconds", "network" => network.to_string()).record(duration_secs);
}

/// Record an RPC call
pub fn record_rpc_call(network: &str, method: &str, duration_secs: f64, error: bool) {
    counter!("x402_rpc_calls_total", "network" => network.to_string(), "method" => method.to_string()).increment(1);
    histogram!("x402_rpc_duration_seconds", "network" => network.to_string(), "method" => method.to_string()).record(duration_secs);
    if error {
        counter!("x402_rpc_errors_total", "network" => network.to_string(), "method" => method.to_string()).increment(1);
    }
}

/// Record cache hit/miss
pub fn record_cache_access(cache_type: &str, hit: bool) {
    if hit {
        counter!("x402_cache_hits_total", "type" => cache_type.to_string()).increment(1);
    } else {
        counter!("x402_cache_misses_total", "type" => cache_type.to_string()).increment(1);
    }
}

/// Record provider stats
pub fn record_provider_stats(total: usize, http: usize, websocket: usize) {
    gauge!("x402_providers_active").set(total as f64);
    gauge!("x402_providers_http").set(http as f64);
    gauge!("x402_providers_websocket").set(websocket as f64);
}

/// Record gas usage
pub fn record_gas_usage(network: &str, gas_used: u64, gas_price_gwei: f64) {
    histogram!("x402_gas_used", "network" => network.to_string()).record(gas_used as f64);
    histogram!("x402_gas_price_gwei", "network" => network.to_string()).record(gas_price_gwei);
}

/// Record credits deducted
pub fn record_credits_deducted(amount: i32) {
    gauge!("x402_credits_deducted_total").increment(amount as f64);
}

/// Metrics error types
#[derive(Debug, thiserror::Error)]
pub enum MetricsError {
    #[error("Metrics initialization error: {0}")]
    InitError(String),
}
