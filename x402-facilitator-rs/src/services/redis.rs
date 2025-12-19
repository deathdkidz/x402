//! Redis Service
//! 
//! Redis connection pool for caching nonces, merchant data, and rate limits

#![allow(dead_code)]

use deadpool_redis::{Config as RedisConfig, Pool, Runtime, Connection};
use redis::AsyncCommands;
use tracing::{info, debug};
use serde::{Deserialize, Serialize};

/// Redis service wrapping deadpool connection pool
pub struct Redis {
    pool: Pool,
    is_connected: bool,
}

/// Cached nonce transaction data
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CachedNonce {
    pub transaction_hash: String,
    pub status: String,
    pub timestamp: u64,
}

/// Cached merchant rate limits
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CachedRateLimits {
    pub verify_limit: i32,
    pub settle_limit: i32,
    pub window: i32,
    pub tier: String,
}

impl Redis {
    /// Create a new Redis connection pool
    pub async fn new(redis_url: &str) -> Result<Self, RedisError> {
        let cfg = RedisConfig::from_url(redis_url);
        
        let pool = cfg.create_pool(Some(Runtime::Tokio1))
            .map_err(|e| RedisError::ConnectionError(e.to_string()))?;

        // Test connection
        let mut conn = pool.get().await
            .map_err(|e| RedisError::ConnectionError(e.to_string()))?;
        
        let _: String = redis::cmd("PING")
            .query_async(&mut conn)
            .await
            .map_err(|e| RedisError::ConnectionError(e.to_string()))?;

        info!("✅ Redis connected and ready");

        Ok(Self {
            pool,
            is_connected: true,
        })
    }

    /// Check if Redis is connected
    pub fn is_ready(&self) -> bool {
        self.is_connected
    }

    /// Get a connection from the pool
    async fn get_conn(&self) -> Result<Connection, RedisError> {
        self.pool.get().await
            .map_err(|e| RedisError::ConnectionError(e.to_string()))
    }

    /// Cache a used nonce with transaction details
    pub async fn cache_used_nonce(
        &self,
        payer: &str,
        nonce: &str,
        transaction_hash: &str,
        status: &str,
        ttl_secs: u64,
    ) -> Result<(), RedisError> {
        let mut conn = self.get_conn().await?;
        
        let key = format!("nonce:{}:{}", payer.to_lowercase(), nonce);
        let data = CachedNonce {
            transaction_hash: transaction_hash.to_string(),
            status: status.to_string(),
            timestamp: chrono::Utc::now().timestamp_millis() as u64,
        };
        
        let json = serde_json::to_string(&data)
            .map_err(|e| RedisError::SerializationError(e.to_string()))?;
        
        conn.set_ex::<_, _, ()>(&key, &json, ttl_secs)
            .await
            .map_err(|e| RedisError::CommandError(e.to_string()))?;
        
        debug!("Cached used nonce: {} with tx: {}", key, transaction_hash);
        Ok(())
    }

    /// Get cached nonce transaction
    pub async fn get_nonce_transaction(
        &self,
        payer: &str,
        nonce: &str,
    ) -> Result<Option<CachedNonce>, RedisError> {
        let mut conn = self.get_conn().await?;
        
        let key = format!("nonce:{}:{}", payer.to_lowercase(), nonce);
        
        let result: Option<String> = conn.get(&key)
            .await
            .map_err(|e| RedisError::CommandError(e.to_string()))?;
        
        match result {
            Some(json) => {
                let data: CachedNonce = serde_json::from_str(&json)
                    .map_err(|e| RedisError::SerializationError(e.to_string()))?;
                Ok(Some(data))
            }
            None => Ok(None),
        }
    }

    /// Cache merchant data
    pub async fn cache_merchant(
        &self,
        api_key: &str,
        merchant_json: &str,
        ttl_secs: u64,
    ) -> Result<(), RedisError> {
        let mut conn = self.get_conn().await?;
        
        let key = format!("merchant:{}", api_key);
        
        conn.set_ex::<_, _, ()>(&key, merchant_json, ttl_secs)
            .await
            .map_err(|e| RedisError::CommandError(e.to_string()))?;
        
        debug!("Cached merchant: {}", api_key);
        Ok(())
    }

    /// Get cached merchant data
    pub async fn get_cached_merchant(&self, api_key: &str) -> Result<Option<String>, RedisError> {
        let mut conn = self.get_conn().await?;
        
        let key = format!("merchant:{}", api_key);
        
        conn.get(&key)
            .await
            .map_err(|e| RedisError::CommandError(e.to_string()))
    }

    /// Invalidate cached merchant
    pub async fn invalidate_merchant(&self, api_key: &str) -> Result<(), RedisError> {
        let mut conn = self.get_conn().await?;
        
        let key = format!("merchant:{}", api_key);
        
        conn.del::<_, ()>(&key)
            .await
            .map_err(|e| RedisError::CommandError(e.to_string()))?;
        
        debug!("Invalidated merchant cache: {}", api_key);
        Ok(())
    }

    /// Cache merchant rate limits
    pub async fn cache_merchant_rate_limits(
        &self,
        auth_address: &str,
        limits: &CachedRateLimits,
        ttl_secs: u64,
    ) -> Result<(), RedisError> {
        let mut conn = self.get_conn().await?;
        
        let key = format!("ratelimits:{}", auth_address.to_lowercase());
        let json = serde_json::to_string(limits)
            .map_err(|e| RedisError::SerializationError(e.to_string()))?;
        
        conn.set_ex::<_, _, ()>(&key, &json, ttl_secs)
            .await
            .map_err(|e| RedisError::CommandError(e.to_string()))?;
        
        Ok(())
    }

    /// Get cached merchant rate limits
    pub async fn get_cached_merchant_rate_limits(
        &self,
        auth_address: &str,
    ) -> Result<Option<CachedRateLimits>, RedisError> {
        let mut conn = self.get_conn().await?;
        
        let key = format!("ratelimits:{}", auth_address.to_lowercase());
        
        let result: Option<String> = conn.get(&key)
            .await
            .map_err(|e| RedisError::CommandError(e.to_string()))?;
        
        match result {
            Some(json) => {
                let data: CachedRateLimits = serde_json::from_str(&json)
                    .map_err(|e| RedisError::SerializationError(e.to_string()))?;
                Ok(Some(data))
            }
            None => Ok(None),
        }
    }

    /// Increment rate limit counter and check if exceeded
    pub async fn check_rate_limit(
        &self,
        key: &str,
        limit: i32,
        window_secs: i32,
    ) -> Result<RateLimitResult, RedisError> {
        let mut conn = self.get_conn().await?;
        
        // Increment counter
        let current: i32 = conn.incr(&key, 1)
            .await
            .map_err(|e| RedisError::CommandError(e.to_string()))?;
        
        // Set expiry on first request
        if current == 1 {
            conn.expire::<_, ()>(&key, window_secs as i64)
                .await
                .map_err(|e| RedisError::CommandError(e.to_string()))?;
        }
        
        // Get TTL
        let ttl: i64 = conn.ttl(&key)
            .await
            .map_err(|e| RedisError::CommandError(e.to_string()))?;
        
        let remaining = std::cmp::max(0, limit - current);
        let exceeded = current > limit;
        
        Ok(RateLimitResult {
            current,
            limit,
            remaining,
            reset_at: chrono::Utc::now().timestamp_millis() as u64 + (ttl as u64 * 1000),
            exceeded,
        })
    }

    /// Store pending transaction in Redis for quick lookup
    pub async fn store_pending_tx(
        &self,
        payer: &str,
        nonce: &str,
        tx_hash: &str,
        ttl_secs: u64,
    ) -> Result<(), RedisError> {
        let mut conn = self.get_conn().await?;
        
        let key = format!("pending_tx:{}:{}", payer.to_lowercase(), nonce);
        
        conn.set_ex::<_, _, ()>(&key, tx_hash, ttl_secs)
            .await
            .map_err(|e| RedisError::CommandError(e.to_string()))?;
        
        debug!("Stored pending tx: {} -> {}", key, tx_hash);
        Ok(())
    }

    /// Get pending transaction by payer and nonce
    pub async fn get_pending_tx(&self, payer: &str, nonce: &str) -> Result<Option<String>, RedisError> {
        let mut conn = self.get_conn().await?;
        
        let key = format!("pending_tx:{}:{}", payer.to_lowercase(), nonce);
        
        conn.get(&key)
            .await
            .map_err(|e| RedisError::CommandError(e.to_string()))
    }

    /// Delete pending transaction
    pub async fn delete_pending_tx(&self, payer: &str, nonce: &str) -> Result<(), RedisError> {
        let mut conn = self.get_conn().await?;
        
        let key = format!("pending_tx:{}:{}", payer.to_lowercase(), nonce);
        
        conn.del::<_, ()>(&key)
            .await
            .map_err(|e| RedisError::CommandError(e.to_string()))?;
        
        Ok(())
    }
}

/// Rate limit check result
#[derive(Debug, Clone)]
pub struct RateLimitResult {
    pub current: i32,
    pub limit: i32,
    pub remaining: i32,
    pub reset_at: u64,
    pub exceeded: bool,
}

/// Redis error types
#[derive(Debug, thiserror::Error)]
pub enum RedisError {
    #[error("Connection error: {0}")]
    ConnectionError(String),
    
    #[error("Command error: {0}")]
    CommandError(String),
    
    #[error("Serialization error: {0}")]
    SerializationError(String),
}
