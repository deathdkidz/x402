//! Logging utilities
//! 
//! Configures tracing with console and file output

use std::path::Path;
use tracing_subscriber::{
    fmt,
    layer::SubscriberExt,
    util::SubscriberInitExt,
    EnvFilter,
    Layer,
};
use tracing_appender::rolling::{RollingFileAppender, Rotation};

/// Initialize logging with tracing
pub fn init_logging(log_level: &str, log_dir: &Path) {
    // Create log directory if it doesn't exist
    std::fs::create_dir_all(log_dir).ok();

    // Create file appenders
    let all_log = RollingFileAppender::new(
        Rotation::DAILY,
        log_dir,
        "all.log",
    );
    
    let error_log = RollingFileAppender::new(
        Rotation::DAILY,
        log_dir,
        "error.log",
    );

    // Build env filter
    let env_filter = EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| {
            EnvFilter::new(format!("x402_facilitator={},tower_http=debug", log_level))
        });

    // Console layer with colors
    let console_layer = fmt::layer()
        .with_target(false)
        .with_thread_ids(false)
        .with_ansi(true)
        .with_level(true)
        .with_file(false)
        .with_line_number(false);

    // File layer for all logs (no colors)
    let file_layer = fmt::layer()
        .with_target(true)
        .with_thread_ids(true)
        .with_ansi(false)
        .with_writer(all_log);

    // Error file layer with filter
    let error_layer = fmt::layer()
        .with_target(true)
        .with_thread_ids(true)
        .with_ansi(false)
        .with_writer(error_log)
        .with_filter(tracing_subscriber::filter::LevelFilter::ERROR);

    // Initialize tracing subscriber
    tracing_subscriber::registry()
        .with(env_filter)
        .with(console_layer)
        .with(file_layer)
        .with(error_layer)
        .init();
}
