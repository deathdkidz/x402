//! Database Service
//! 
//! MySQL connection pool and merchant/transaction operations

#![allow(dead_code)]

use sqlx::{mysql::MySqlPoolOptions, MySqlPool, FromRow};
use tracing::info;
use crate::config::Config;
use crate::types::{Merchant, Transaction};

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

    /// Get merchant by API key
    pub async fn get_merchant_by_api_key(&self, api_key: &str) -> Result<Option<Merchant>, DatabaseError> {
        let result: Option<MerchantRow> = sqlx::query_as(
            r#"
            SELECT 
                id, auth_address, business_name, api_key,
                created_at, updated_at, is_active, webhook_url, webhook_secret,
                webhook_events, email, profile_image_url,
                credit_balance, lifetime_credits_purchased, lifetime_credits_used,
                status, last_active_at
            FROM merchants 
            WHERE api_key = ? AND is_active = TRUE
            "#
        )
        .bind(api_key)
        .fetch_optional(&self.pool)
        .await
        .map_err(|e| DatabaseError::QueryError(e.to_string()))?;

        Ok(result.map(|r| r.into()))
    }

    /// Get all active merchants for cache pre-warming
    pub async fn get_active_merchants(&self) -> Result<Vec<Merchant>, DatabaseError> {
        let results: Vec<MerchantRow> = sqlx::query_as(
            r#"
            SELECT 
                id, auth_address, business_name, api_key,
                created_at, updated_at, is_active, webhook_url, webhook_secret,
                webhook_events, email, profile_image_url,
                credit_balance, lifetime_credits_purchased, lifetime_credits_used,
                status, last_active_at
            FROM merchants 
            WHERE is_active = TRUE
            "#
        )
        .fetch_all(&self.pool)
        .await
        .map_err(|e| DatabaseError::QueryError(e.to_string()))?;

        Ok(results.into_iter().map(|r| r.into()).collect())
    }

    /// Get merchant by auth address
    pub async fn get_merchant_by_auth_address(&self, auth_address: &str) -> Result<Option<Merchant>, DatabaseError> {
        let lower_address = auth_address.to_lowercase();
        
        let result: Option<MerchantRow> = sqlx::query_as(
            r#"
            SELECT 
                id, auth_address, business_name, api_key,
                created_at, updated_at, is_active, webhook_url, webhook_secret,
                webhook_events, email, profile_image_url,
                credit_balance, lifetime_credits_purchased, lifetime_credits_used,
                status, last_active_at
            FROM merchants 
            WHERE auth_address = ? AND is_active = TRUE
            "#
        )
        .bind(&lower_address)
        .fetch_optional(&self.pool)
        .await
        .map_err(|e| DatabaseError::QueryError(e.to_string()))?;

        Ok(result.map(|r| r.into()))
    }

    /// Deduct credits from merchant account
    pub async fn deduct_credits(&self, merchant_id: i64, amount: i32, reference_id: &str, description: &str) -> Result<i32, DatabaseError> {
        // Get current balance
        let balance: (i32,) = sqlx::query_as("SELECT credit_balance FROM merchants WHERE id = ?")
            .bind(merchant_id)
            .fetch_one(&self.pool)
            .await
            .map_err(|e| DatabaseError::QueryError(e.to_string()))?;
        
        let new_balance = balance.0 - amount;
        
        // Update balance
        sqlx::query("UPDATE merchants SET credit_balance = ?, lifetime_credits_used = lifetime_credits_used + ?, last_active_at = NOW() WHERE id = ?")
            .bind(new_balance)
            .bind(amount)
            .bind(merchant_id)
            .execute(&self.pool)
            .await
            .map_err(|e| DatabaseError::QueryError(e.to_string()))?;
        
        // Log credit transaction
        sqlx::query(
            r#"INSERT INTO credit_transactions (merchant_id, type, amount, balance_before, balance_after, reference_type, reference_id, description)
               VALUES (?, 'settlement_fee', ?, ?, ?, 'settlement', ?, ?)"#
        )
        .bind(merchant_id)
        .bind(-amount)
        .bind(balance.0)
        .bind(new_balance)
        .bind(reference_id)
        .bind(description)
        .execute(&self.pool)
        .await
        .map_err(|e| DatabaseError::QueryError(e.to_string()))?;
        
        Ok(new_balance)
    }

    /// Create a new transaction record
    pub async fn create_transaction(&self, tx: &CreateTransaction) -> Result<i64, DatabaseError> {
        let result = sqlx::query(
            r#"
            INSERT INTO transactions (
                merchant_id, payer_address, recipient_address, network, asset,
                amount, nonce, transaction_hash, status, valid_after, valid_before,
                resource, description, credit_cost, timeout_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            "#
        )
        .bind(tx.merchant_id)
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
        .bind(tx.credit_cost)
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
                id, merchant_id, payer_address, recipient_address, network, asset,
                amount, nonce, transaction_hash, status, valid_after, valid_before,
                resource, description, credit_cost, created_at, updated_at, timeout_at
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
                id, merchant_id, payer_address, recipient_address, network, asset,
                amount, nonce, transaction_hash, status, valid_after, valid_before,
                resource, description, credit_cost, created_at, updated_at, timeout_at
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

    /// Log webhook delivery
    pub async fn log_webhook_delivery(
        &self,
        transaction_id: i64,
        webhook_url: &str,
        event: &str,
        status: &str,
        response_code: Option<i32>,
        attempts: i32,
        error_message: Option<&str>,
    ) -> Result<(), DatabaseError> {
        sqlx::query(
            r#"
            INSERT INTO webhook_logs (
                transaction_id, webhook_url, event, status, 
                response_code, attempts, error_message
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
            "#
        )
        .bind(transaction_id)
        .bind(webhook_url)
        .bind(event)
        .bind(status)
        .bind(response_code)
        .bind(attempts)
        .bind(error_message)
        .execute(&self.pool)
        .await
        .map_err(|e| DatabaseError::QueryError(e.to_string()))?;

        Ok(())
    }

    /// Log gas tracking data
    pub async fn log_gas_tracking(
        &self,
        network: &str,
        gas_price_gwei: f64,
        gas_used: Option<u64>,
        eth_cost: Option<f64>,
        usd_cost: Option<f64>,
        transaction_hash: Option<&str>,
    ) -> Result<(), DatabaseError> {
        sqlx::query(
            r#"
            INSERT INTO gas_tracking (
                network, gas_price_gwei, gas_used, eth_cost, usd_cost, transaction_hash
            ) VALUES (?, ?, ?, ?, ?, ?)
            "#
        )
        .bind(network)
        .bind(gas_price_gwei)
        .bind(gas_used.map(|v| v as i64))
        .bind(eth_cost)
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
        .bind(transaction_id as i32) // Match INT type in table
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
        merchant_id: i64,
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
                merchant_id, transaction_id, delivery_id, event_type, webhook_url,
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
        .bind(merchant_id as i32) // Match INT type in table
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

    /// Get pool reference for advanced queries
    pub fn pool(&self) -> &MySqlPool {
        &self.pool
    }
}

/// Internal row type for merchant queries
#[derive(Debug, FromRow)]
struct MerchantRow {
    id: i64,
    auth_address: String,
    business_name: Option<String>,
    api_key: String,
    created_at: chrono::DateTime<chrono::Utc>,
    updated_at: chrono::DateTime<chrono::Utc>,
    is_active: i8,
    webhook_url: Option<String>,
    webhook_secret: Option<String>,
    webhook_events: String,
    email: Option<String>,
    profile_image_url: Option<String>,
    credit_balance: i32,
    lifetime_credits_purchased: i32,
    lifetime_credits_used: i32,
    status: String,
    last_active_at: Option<chrono::DateTime<chrono::Utc>>,
}

impl From<MerchantRow> for Merchant {
    fn from(row: MerchantRow) -> Self {
        Merchant {
            id: row.id,
            auth_address: row.auth_address,
            business_name: row.business_name,
            api_key: row.api_key,
            created_at: row.created_at,
            updated_at: row.updated_at,
            is_active: row.is_active != 0,
            webhook_url: row.webhook_url,
            webhook_secret: row.webhook_secret,
            webhook_events: row.webhook_events,
            email: row.email,
            profile_image_url: row.profile_image_url,
            credit_balance: row.credit_balance,
            lifetime_credits_purchased: row.lifetime_credits_purchased,
            lifetime_credits_used: row.lifetime_credits_used,
            status: row.status,
            last_active_at: row.last_active_at,
        }
    }
}

/// Internal row type for transaction queries
#[derive(Debug, FromRow)]
struct TransactionRow {
    id: i64,
    merchant_id: Option<i64>,
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
    credit_cost: i32,
    created_at: chrono::DateTime<chrono::Utc>,
    updated_at: chrono::DateTime<chrono::Utc>,
    timeout_at: Option<chrono::DateTime<chrono::Utc>>,
}

impl From<TransactionRow> for Transaction {
    fn from(row: TransactionRow) -> Self {
        Transaction {
            id: row.id,
            merchant_id: row.merchant_id,
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
            credit_cost: row.credit_cost,
            created_at: row.created_at,
            updated_at: row.updated_at,
            timeout_at: row.timeout_at,
        }
    }
}

/// Transaction creation parameters
#[derive(Debug, Clone)]
pub struct CreateTransaction {
    pub merchant_id: i64,
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
    pub credit_cost: i32,
    pub timeout_at: Option<chrono::DateTime<chrono::Utc>>,
}

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
