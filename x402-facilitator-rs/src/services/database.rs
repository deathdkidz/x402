//! Database Service
//! 
//! MySQL connection pool and transaction operations for API key model.
//! Merchant-specific operations moved to api_key_db.rs

use sqlx::{mysql::MySqlPoolOptions, MySqlPool, FromRow};
use tracing::info;
use crate::config::Config;
use crate::types::Transaction;

/// Database service wrapping SQLx MySQL pool
pub struct Database {
    pool: MySqlPool,
}

impl Database {
    /// Create a new database connection pool
    pub async fn new(config: &Config) -> Result<Self, DatabaseError> {
        let database_url = format!(
            "mysql://{}:{}@{}:{}/{}",
            config.database.user,
            config.database.password,
            config.database.host,
            config.database.port,
            config.database.database
        );

        let pool = MySqlPoolOptions::new()
            .max_connections(config.database.connection_limit)
            .min_connections(2)
            .acquire_timeout(std::time::Duration::from_secs(10))
            .idle_timeout(std::time::Duration::from_secs(60))
            .connect(&database_url)
            .await
            .map_err(|e| DatabaseError::ConnectionError(e.to_string()))?;

        info!(
            "✅ MySQL connection pool created ({} connections)",
            config.database.connection_limit
        );

        Ok(Self { pool })
    }

    // =========================================================================
    // TRANSACTION OPERATIONS
    // =========================================================================

    /// Create a new transaction record
    pub async fn create_transaction(&self, tx: &CreateTransaction) -> Result<i64, DatabaseError> {
        let result = sqlx::query(
            r#"
            INSERT INTO transactions (
                api_key, payer_address, recipient_address, network, asset,
                amount, nonce, transaction_hash, status, valid_after, valid_before,
                resource, description, timeout_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            "#
        )
        .bind(&tx.api_key)
        .bind(&tx.payer_address)
        .bind(&tx.recipient_address)
        .bind(&tx.network)
        .bind(&tx.asset)
        .bind(&tx.amount)
        .bind(&tx.nonce)
        .bind(&tx.transaction_hash)
        .bind(&tx.status)
        .bind(&tx.valid_after)
        .bind(&tx.valid_before)
        .bind(&tx.resource)
        .bind(&tx.description)
        .bind(&tx.timeout_at)
        .execute(&self.pool)
        .await
        .map_err(|e| DatabaseError::QueryError(e.to_string()))?;

        Ok(result.last_insert_id() as i64)
    }

    /// Update transaction status
    pub async fn update_transaction(&self, id: i64, status: &str) -> Result<(), DatabaseError> {
        sqlx::query("UPDATE transactions SET status = ?, updated_at = NOW() WHERE id = ?")
            .bind(status)
            .bind(id)
            .execute(&self.pool)
            .await
            .map_err(|e| DatabaseError::QueryError(e.to_string()))?;

        Ok(())
    }

    /// Update transaction with hash and status
    pub async fn update_transaction_hash(&self, id: i64, tx_hash: &str, status: &str) -> Result<(), DatabaseError> {
        sqlx::query("UPDATE transactions SET transaction_hash = ?, status = ?, updated_at = NOW() WHERE id = ?")
            .bind(tx_hash)
            .bind(status)
            .bind(id)
            .execute(&self.pool)
            .await
            .map_err(|e| DatabaseError::QueryError(e.to_string()))?;

        Ok(())
    }

    /// Get pending transactions for monitoring
    pub async fn get_pending_transactions(&self, limit: i32) -> Result<Vec<Transaction>, DatabaseError> {
        let results: Vec<TransactionRow> = sqlx::query_as(
            r#"
            SELECT 
                id, api_key, payer_address, recipient_address, network, asset,
                amount, nonce, transaction_hash, status, valid_after, valid_before,
                resource, description, created_at, updated_at, timeout_at
            FROM transactions 
            WHERE status IN ('pending', 'preconfirmed')
            ORDER BY created_at ASC
            LIMIT ?
            "#
        )
        .bind(limit)
        .fetch_all(&self.pool)
        .await
        .map_err(|e| DatabaseError::QueryError(e.to_string()))?;

        Ok(results.into_iter().map(|r| r.into()).collect())
    }

    /// Find transaction by payer and nonce
    pub async fn find_transaction_by_nonce(&self, payer: &str, nonce: &str) -> Result<Option<Transaction>, DatabaseError> {
        let result: Option<TransactionRow> = sqlx::query_as(
            r#"
            SELECT 
                id, api_key, payer_address, recipient_address, network, asset,
                amount, nonce, transaction_hash, status, valid_after, valid_before,
                resource, description, created_at, updated_at, timeout_at
            FROM transactions 
            WHERE payer_address = ? AND nonce = ?
            ORDER BY created_at DESC
            LIMIT 1
            "#
        )
        .bind(payer.to_lowercase())
        .bind(nonce)
        .fetch_optional(&self.pool)
        .await
        .map_err(|e| DatabaseError::QueryError(e.to_string()))?;

        Ok(result.map(|r| r.into()))
    }

    /// Update transaction with gas data after settlement
    pub async fn update_transaction_gas_data(
        &self,
        transaction_id: i64,
        gas_used: u64,
        gas_price_wei: u128,
        gas_cost_native: rust_decimal::Decimal,
        gas_cost_usd: rust_decimal::Decimal,
        native_usd_price: rust_decimal::Decimal,
        service_fee: rust_decimal::Decimal,
        total_deducted: rust_decimal::Decimal,
    ) -> Result<(), DatabaseError> {
        sqlx::query(
            r#"UPDATE transactions 
               SET gas_used = ?, effective_gas_price_wei = ?, 
                   gas_cost_native = CAST(? AS DECIMAL(36,18)), 
                   gas_cost_usd = CAST(? AS DECIMAL(20,10)), 
                   native_usd_price = CAST(? AS DECIMAL(20,10)), 
                   service_fee_usd = CAST(? AS DECIMAL(20,10)),
                   total_usd_deducted = CAST(? AS DECIMAL(20,10)), 
                   deduction_status = 'deducted', deducted_at = NOW()
               WHERE id = ?"#
        )
        .bind(gas_used as i64)
        .bind(gas_price_wei as i64)
        .bind(gas_cost_native.to_string())
        .bind(gas_cost_usd.to_string())
        .bind(native_usd_price.to_string())
        .bind(service_fee.to_string())
        .bind(total_deducted.to_string())
        .bind(transaction_id)
        .execute(&self.pool)
        .await
        .map_err(|e| DatabaseError::QueryError(e.to_string()))?;
        Ok(())
    }

    // =========================================================================
    // GAS TRACKING (For Analytics)
    // =========================================================================

    /// Log gas tracking data
    pub async fn log_gas_tracking(
        &self,
        network: &str,
        gas_price_gwei: f64,
        gas_used: Option<u64>,
        native_cost: Option<f64>,
        usd_cost: Option<f64>,
        transaction_hash: Option<&str>,
    ) -> Result<(), DatabaseError> {
        sqlx::query(
            r#"
            INSERT INTO gas_stats (
                network, gas_price_gwei, gas_used, native_cost, usd_cost, transaction_hash
            ) VALUES (?, ?, ?, ?, ?, ?)
            "#
        )
        .bind(network)
        .bind(gas_price_gwei)
        .bind(gas_used.map(|v| v as i64))
        .bind(native_cost)
        .bind(usd_cost)
        .bind(transaction_hash)
        .execute(&self.pool)
        .await
        .map_err(|e| DatabaseError::QueryError(e.to_string()))?;

        Ok(())
    }

    /// Log transaction event for audit trail
    pub async fn log_transaction_event(
        &self,
        transaction_id: i64,
        event_type: &str,
        old_status: Option<&str>,
        new_status: Option<&str>,
        metadata: Option<&str>,
    ) -> Result<(), DatabaseError> {
        sqlx::query(
            r#"
            INSERT INTO transaction_events (
                transaction_id, event_type, old_status, new_status, metadata
            ) VALUES (?, ?, ?, ?, ?)
            "#
        )
        .bind(transaction_id as i32)
        .bind(event_type)
        .bind(old_status)
        .bind(new_status)
        .bind(metadata)
        .execute(&self.pool)
        .await
        .map_err(|e| DatabaseError::QueryError(e.to_string()))?;

        Ok(())
    }

    /// Log webhook delivery attempt
    pub async fn log_webhook_delivery_v2(
        &self,
        api_key: &str,
        transaction_id: Option<i64>,
        delivery_id: &str,
        event_type: &str,
        webhook_url: &str,
        request_body: Option<&str>,
        response_status: Option<i32>,
        response_body: Option<&str>,
        status: &str,
        attempts: i32,
        error_message: Option<&str>,
    ) -> Result<(), DatabaseError> {
        sqlx::query(
            r#"
            INSERT INTO webhook_deliveries (
                api_key, transaction_id, delivery_id, event_type, webhook_url,
                request_body, response_status, response_body, status, attempts, error_message,
                last_attempt_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
            ON DUPLICATE KEY UPDATE
                response_status = VALUES(response_status),
                response_body = VALUES(response_body),
                status = VALUES(status),
                attempts = VALUES(attempts),
                error_message = VALUES(error_message),
                last_attempt_at = NOW(),
                completed_at = CASE WHEN VALUES(status) IN ('success', 'failed') THEN NOW() ELSE completed_at END
            "#
        )
        .bind(api_key)
        .bind(transaction_id.map(|v| v as i32))
        .bind(delivery_id)
        .bind(event_type)
        .bind(webhook_url)
        .bind(request_body)
        .bind(response_status)
        .bind(response_body)
        .bind(status)
        .bind(attempts)
        .bind(error_message)
        .execute(&self.pool)
        .await
        .map_err(|e| DatabaseError::QueryError(e.to_string()))?;

        Ok(())
    }

    // =========================================================================
    // UTILITY
    // =========================================================================

    /// Get pool reference for advanced queries (used by api_key_db)
    pub fn pool(&self) -> &MySqlPool {
        &self.pool
    }
}

// =========================================================================
// ROW TYPES
// =========================================================================

/// Internal row type for transaction queries
#[derive(Debug, FromRow)]
struct TransactionRow {
    id: i64,
    api_key: String,
    payer_address: String,
    recipient_address: String,
    network: String,
    asset: String,
    amount: String,
    nonce: String,
    transaction_hash: Option<String>,
    status: String,
    valid_after: Option<i64>,
    valid_before: Option<i64>,
    resource: Option<String>,
    description: Option<String>,
    created_at: chrono::DateTime<chrono::Utc>,
    updated_at: chrono::DateTime<chrono::Utc>,
    timeout_at: Option<chrono::DateTime<chrono::Utc>>,
}

impl From<TransactionRow> for Transaction {
    fn from(row: TransactionRow) -> Self {
        Transaction {
            id: row.id,
            api_key: Some(row.api_key),
            payer_address: row.payer_address,
            recipient_address: row.recipient_address,
            network: row.network,
            asset: row.asset,
            amount: row.amount,
            nonce: row.nonce,
            transaction_hash: row.transaction_hash,
            status: row.status,
            valid_after: row.valid_after.map(|v| v.to_string()),
            valid_before: row.valid_before.map(|v| v.to_string()),
            resource: row.resource,
            description: row.description,
            created_at: row.created_at,
            updated_at: row.updated_at,
            timeout_at: row.timeout_at,
        }
    }
}

// =========================================================================
// REQUEST TYPES
// =========================================================================

/// Transaction creation parameters (simplified for API key model)
#[derive(Debug, Clone)]
pub struct CreateTransaction {
    pub api_key: String,
    pub payer_address: String,
    pub recipient_address: String,
    pub network: String,
    pub asset: String,
    pub amount: String,
    pub nonce: String,
    pub transaction_hash: Option<String>,
    pub status: String,
    pub valid_after: String,
    pub valid_before: String,
    pub resource: Option<String>,
    pub description: Option<String>,
    pub timeout_at: Option<chrono::DateTime<chrono::Utc>>,
}

// =========================================================================
// ERROR TYPES
// =========================================================================

/// Database error types
#[derive(Debug, thiserror::Error)]
pub enum DatabaseError {
    #[error("Connection error: {0}")]
    ConnectionError(String),
    
    #[error("Query error: {0}")]
    QueryError(String),
    
    #[error("Not found: {0}")]
    NotFound(String),
}
