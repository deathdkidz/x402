//! Middleware module
//! 
//! Simplified middleware for API key authentication and rate limiting

pub mod auth;
pub mod rate_limit;
pub mod security;
pub mod validation;

pub use auth::{api_key_auth, AuthState};
pub use rate_limit::{general_rate_limiter, RateLimitState};
pub use security::{security_middleware, SecurityState, start_cleanup_task};
pub use validation::ValidatedJson;
