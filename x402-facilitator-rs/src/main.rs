//! x402 Facilitator - Rust Implementation
//! 
//! Secure payment facilitator service for the x402 protocol.
//! Handles ERC-3009 transferWithAuthorization for gasless token transfers.

use std::net::SocketAddr;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Instant;

use tower_http::{
    cors::{Any, CorsLayer},
    trace::TraceLayer,
    limit::RequestBodyLimitLayer,
    compression::CompressionLayer,
};
use tracing::{info, warn, error};
use tokio::signal;

mod config;
mod types;
mod services;
mod middleware;
mod routes;
mod utils;

use config::Config;
use services::{Database, Redis, ProviderPool, PaymasterPool, VerificationService, SettlementService, TransactionMonitor, MetricsService};
use middleware::{AuthState, RateLimitState, SecurityState, start_cleanup_task};
use routes::{create_router, AppState};

#[tokio::main]
async fn main() {
    // Install default crypto provider for rustls (required for WebSocket TLS)
    let _ = rustls::crypto::aws_lc_rs::default_provider().install_default();
    
    // Load configuration
    let config = match Config::from_env() {
        Ok(c) => Arc::new(c),
        Err(e) => {
            eprintln!("❌ Configuration error: {}", e);
            std::process::exit(1);
        }
    };

    // Initialize logging
    let log_dir = PathBuf::from("logs");
    utils::init_logging(&config.log_level, &log_dir);

    info!("============================================================");
    info!("🚀 x402 Facilitator Service Starting (Rust)");
    info!("============================================================");
    info!("Environment: {}", config.node_env);
    info!("Port: {}", config.port);
    info!("Mainnet Networks: {:?}", config.mainnet_networks);
    info!("Testnet Networks: {:?}", config.testnet_networks);

    // Initialize database
    let database = match Database::new(&config).await {
        Ok(db) => Arc::new(db),
        Err(e) => {
            error!("❌ Database connection failed: {}", e);
            std::process::exit(1);
        }
    };

    // Initialize Redis
    let redis = match Redis::new(&config.redis_url).await {
        Ok(r) => Arc::new(r),
        Err(e) => {
            error!("❌ Redis connection failed: {}", e);
            std::process::exit(1);
        }
    };

    // Initialize provider pool
    let provider_pool = Arc::new(ProviderPool::new(config.clone()));
    if let Err(e) = provider_pool.initialize().await {
        error!("❌ Provider pool initialization failed: {}", e);
        std::process::exit(1);
    }
    let stats = provider_pool.get_stats();
    info!("📡 Provider pool ready: {} network(s)", stats.total);

    // Initialize paymaster pool
    let paymaster_pool = Arc::new(PaymasterPool::new());
    if let Err(e) = paymaster_pool.initialize(&config) {
        error!("❌ Paymaster pool initialization failed: {}", e);
        std::process::exit(1);
    }

    // Create services
    let verification_service = Arc::new(VerificationService::new(
        config.clone(),
        provider_pool.clone(),
    ));

    let settlement_service = Arc::new(SettlementService::new(
        config.clone(),
        provider_pool.clone(),
        paymaster_pool.clone(),
        redis.clone(),
        database.clone(),
        verification_service.clone(),
    ));

    // Create and start transaction monitor
    let transaction_monitor = Arc::new(TransactionMonitor::new(
        config.clone(),
        provider_pool.clone(),
        redis.clone(),
        database.clone(),
    ));
    transaction_monitor.clone().start();

    // Create middleware states
    let auth_state = Arc::new(AuthState {
        database: database.clone(),
        redis: redis.clone(),
    });

    // Use new simplified rate limiting: 200/min unauthenticated, 1500/min authenticated
    let rate_limit_state = Arc::new(RateLimitState::new());

    let security_state = Arc::new(SecurityState::new(
        config.security_ban_threshold,
        config.security_ban_duration_ms,
    ));

    // Start security cleanup task
    start_cleanup_task(security_state.clone(), config.security_cleanup_interval_ms);

    // Pre-warm merchant cache
    match database.get_active_merchants().await {
        Ok(merchants) => {
            match redis.prewarm_merchants(&merchants).await {
                Ok(count) => info!("🔥 Pre-warmed {} merchant(s) in Redis cache", count),
                Err(e) => warn!("⚠️ Failed to pre-warm merchant cache: {}", e),
            }
        }
        Err(e) => warn!("⚠️ Failed to load merchants for cache pre-warming: {}", e),
    }

    // Initialize Prometheus metrics
    let metrics_service = match MetricsService::new() {
        Ok(m) => Arc::new(m),
        Err(e) => {
            error!("❌ Metrics initialization failed: {}", e);
            std::process::exit(1);
        }
    };

    // Create app state
    let app_state = AppState {
        config: config.clone(),
        verification_service,
        settlement_service,
        metrics_service,
        database: database.clone(),
        start_time: Instant::now(),
    };

    // Build router with middleware
    let app = create_router(app_state)
        // Apply middleware in order (bottom to top in the stack)
        .layer(axum::middleware::from_fn_with_state(
            rate_limit_state.clone(),
            middleware::merchant_rate_limiter,
        ))
        .layer(axum::middleware::from_fn_with_state(
            auth_state.clone(),
            middleware::api_key_auth,
        ))
        .layer(axum::middleware::from_fn_with_state(
            rate_limit_state.clone(),
            middleware::general_rate_limiter,
        ))
        .layer(axum::middleware::from_fn_with_state(
            security_state.clone(),
            middleware::security_middleware,
        ))
        // Tower HTTP middleware
        .layer(CompressionLayer::new()) // Gzip/Brotli response compression
        .layer(RequestBodyLimitLayer::new(1024 * 1024)) // 1MB limit
        .layer(TraceLayer::new_for_http())
        .layer(
            CorsLayer::new()
                .allow_origin(Any)
                .allow_methods(Any)
                .allow_headers(Any),
        );

    // Create server address
    let addr = SocketAddr::from(([0, 0, 0, 0], config.port));
    
    info!("============================================================");
    info!("✅ Server listening on http://{}", addr);
    info!("============================================================");

    // Start server with graceful shutdown
    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    
    axum::serve(
        listener,
        app.into_make_service_with_connect_info::<SocketAddr>(),
    )
    .with_graceful_shutdown(shutdown_signal())
    .await
    .unwrap();

    info!("🛑 Server shutdown complete");
}

/// Graceful shutdown signal handler
async fn shutdown_signal() {
    let ctrl_c = async {
        signal::ctrl_c()
            .await
            .expect("Failed to install Ctrl+C handler");
    };

    #[cfg(unix)]
    let terminate = async {
        signal::unix::signal(signal::unix::SignalKind::terminate())
            .expect("Failed to install signal handler")
            .recv()
            .await;
    };

    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        _ = ctrl_c => {
            info!("Received Ctrl+C, starting graceful shutdown...");
        }
        _ = terminate => {
            info!("Received SIGTERM, starting graceful shutdown...");
        }
    }
}
