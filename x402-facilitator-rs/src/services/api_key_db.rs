//! API Key Database Operations
//! 
//! Database operations for the simplified API key + USD credits model.
//! All credit operations are atomic with proper overdraft protection.

use rust_decimal::Decimal;
use rust_decimal_macros::dec;
use sqlx::{FromRow, MySqlPool, Row};
use std::str::FromStr;
use tracing::{info, warn};

use crate::types::api_key::{ApiKey, LedgerEntry, LedgerEntryType, BalanceType};

/// Error type for API key database operations
#[derive(Debug, thiserror::Error)]
pub enum ApiKeyDbError {
    #[error("Database error: {0}")]
    Database(String),
    
    #[error("API key not found")]
    NotFound,
    
    #[error("API key expired")]
    Expired,
    
    #[error("API key inactive")]
    Inactive,
    
    #[error("Insufficient credits: have ${have:.6}, need ${need:.6}")]
    InsufficientCredits { have: Decimal, need: Decimal },
    
    #[error("Invalid data: {0}")]
    InvalidData(String),
}

/// API Key database operations
pub struct ApiKeyDb;

impl ApiKeyDb {
    // =========================================================================
    // API KEY CRUD
    // =========================================================================
    
    /// Create a new API key with initial balance
    pub async fn create_api_key(
        pool: &MySqlPool,
        api_key: &str,
        email: Option<&str>,
        initial_balance: Decimal,
    ) -> Result<ApiKey, ApiKeyDbError> {
        // API keys with balance expire in 1 year, empty keys expire in 30 days
        let expiry_days = if initial_balance > dec!(0) { 365 } else { 30 };
        
        let result = sqlx::query(
            r#"INSERT INTO api_keys (api_key, email, mainnet_balance, lifetime_credits_purchased, lifetime_mainnet_purchased, expires_at)
               VALUES (?, ?, CAST(? AS DECIMAL(20,10)), CAST(? AS DECIMAL(20,10)), CAST(? AS DECIMAL(20,10)), DATE_ADD(NOW(), INTERVAL ? DAY))"#
        )
        .bind(api_key)
        .bind(email)
        .bind(initial_balance.to_string())
        .bind(initial_balance.to_string())
        .bind(initial_balance.to_string())
        .bind(expiry_days)
        .execute(pool)
        .await
        .map_err(|e| ApiKeyDbError::Database(e.to_string()))?;
        
        let id = result.last_insert_id() as i64;
        
        // Log initial balance if non-zero
        if initial_balance > dec!(0) {
            Self::log_ledger_entry(
                pool,
                id,
                None,
                None,
                LedgerEntryType::Purchase,
                initial_balance,
                dec!(0),
                initial_balance,
                Some("Initial credit purchase"),
            ).await?;
        }
        
        Self::get_api_key_by_id(pool, id).await
    }
    
    /// Get API key by the key string
    pub async fn get_api_key(pool: &MySqlPool, api_key: &str) -> Result<ApiKey, ApiKeyDbError> {
        let row: Option<ApiKeyRow> = sqlx::query_as(
            r#"SELECT id, api_key, email, 
                      CAST(mainnet_balance AS CHAR) as mainnet_balance,
                      CAST(testnet_balance AS CHAR) as testnet_balance,
                      CAST(lifetime_credits_purchased AS CHAR) as lifetime_credits_purchased,
                      CAST(lifetime_credits_used AS CHAR) as lifetime_credits_used,
                      total_transactions, successful_transactions,
                      is_active, expires_at, created_at, updated_at, last_used_at
               FROM api_keys 
               WHERE api_key = ?"#
        )
        .bind(api_key)
        .fetch_optional(pool)
        .await
        .map_err(|e| ApiKeyDbError::Database(e.to_string()))?;
        
        match row {
            Some(r) => Ok(r.try_into()?),
            None => Err(ApiKeyDbError::NotFound),
        }
    }
    
    /// Get API key by ID
    pub async fn get_api_key_by_id(pool: &MySqlPool, id: i64) -> Result<ApiKey, ApiKeyDbError> {
        let row: Option<ApiKeyRow> = sqlx::query_as(
            r#"SELECT id, api_key, email, 
                      CAST(mainnet_balance AS CHAR) as mainnet_balance,
                      CAST(testnet_balance AS CHAR) as testnet_balance,
                      CAST(lifetime_credits_purchased AS CHAR) as lifetime_credits_purchased,
                      CAST(lifetime_credits_used AS CHAR) as lifetime_credits_used,
                      total_transactions, successful_transactions,
                      is_active, expires_at, created_at, updated_at, last_used_at
               FROM api_keys 
               WHERE id = ?"#
        )
        .bind(id)
        .fetch_optional(pool)
        .await
        .map_err(|e| ApiKeyDbError::Database(e.to_string()))?;
        
        match row {
            Some(r) => Ok(r.try_into()?),
            None => Err(ApiKeyDbError::NotFound),
        }
    }
    
    /// Validate API key and return it if valid
    pub async fn validate_api_key(pool: &MySqlPool, api_key: &str) -> Result<ApiKey, ApiKeyDbError> {
        let key = Self::get_api_key(pool, api_key).await?;
        
        if !key.is_active {
            return Err(ApiKeyDbError::Inactive);
        }
        
        if !key.is_valid() {
            return Err(ApiKeyDbError::Expired);
        }
        
        Ok(key)
    }
    
    /// Update last_used_at timestamp
    pub async fn touch_api_key(pool: &MySqlPool, api_key_id: i64) -> Result<(), ApiKeyDbError> {
        sqlx::query("UPDATE api_keys SET last_used_at = NOW() WHERE id = ?")
            .bind(api_key_id)
            .execute(pool)
            .await
            .map_err(|e| ApiKeyDbError::Database(e.to_string()))?;
        Ok(())
    }
    
    // =========================================================================
    // CREDIT OPERATIONS
    // =========================================================================
    
    /// Add credits to an API key (specify mainnet or testnet)
    pub async fn add_credits(
        pool: &MySqlPool,
        api_key_id: i64,
        amount: Decimal,
        balance_type: BalanceType,
        description: Option<&str>,
        purchase_id: Option<i64>,
    ) -> Result<Decimal, ApiKeyDbError> {
        let mut tx = pool.begin().await
            .map_err(|e| ApiKeyDbError::Database(e.to_string()))?;
        
        // Get current balance with lock
        let balance_col = match balance_type {
            BalanceType::Mainnet => "mainnet_balance",
            BalanceType::Testnet => "testnet_balance",
        };
        let query = format!(
            "SELECT CAST({} AS CHAR) as balance FROM api_keys WHERE id = ? FOR UPDATE",
            balance_col
        );
        
        let row = sqlx::query(&query)
            .bind(api_key_id)
            .fetch_one(&mut *tx)
            .await
            .map_err(|e| ApiKeyDbError::Database(e.to_string()))?;
        
        let balance_str: String = row.get("balance");
        let current_balance = Decimal::from_str(&balance_str)
            .map_err(|e| ApiKeyDbError::InvalidData(format!("Invalid balance: {}", e)))?;
        
        let new_balance = current_balance + amount;
        
        // Update the appropriate balance column
        let update_query = match balance_type {
            BalanceType::Mainnet => {
                r#"UPDATE api_keys 
                   SET mainnet_balance = CAST(? AS DECIMAL(20,10)),
                       lifetime_credits_purchased = lifetime_credits_purchased + CAST(? AS DECIMAL(20,10)),
                       lifetime_mainnet_purchased = lifetime_mainnet_purchased + CAST(? AS DECIMAL(20,10)),
                       expires_at = DATE_ADD(NOW(), INTERVAL 1 YEAR),
                       updated_at = NOW()
                   WHERE id = ?"#
            }
            BalanceType::Testnet => {
                r#"UPDATE api_keys 
                   SET testnet_balance = CAST(? AS DECIMAL(20,10)),
                       lifetime_credits_purchased = lifetime_credits_purchased + CAST(? AS DECIMAL(20,10)),
                       lifetime_testnet_purchased = lifetime_testnet_purchased + CAST(? AS DECIMAL(20,10)),
                       expires_at = DATE_ADD(NOW(), INTERVAL 1 YEAR),
                       updated_at = NOW()
                   WHERE id = ?"#
            }
        };
        
        sqlx::query(update_query)
            .bind(new_balance.to_string())
            .bind(amount.to_string())
            .bind(amount.to_string())
            .bind(api_key_id)
            .execute(&mut *tx)
            .await
            .map_err(|e| ApiKeyDbError::Database(e.to_string()))?;
        
        // Log to ledger
        sqlx::query(
            r#"INSERT INTO credit_ledger 
               (api_key_id, purchase_id, entry_type, network_type, amount, balance_before, balance_after, description)
               VALUES (?, ?, 'purchase', ?, CAST(? AS DECIMAL(20,10)), CAST(? AS DECIMAL(20,10)), CAST(? AS DECIMAL(20,10)), ?)"#
        )
        .bind(api_key_id)
        .bind(purchase_id)
        .bind(balance_type.as_str())
        .bind(amount.to_string())
        .bind(current_balance.to_string())
        .bind(new_balance.to_string())
        .bind(description.unwrap_or("Credit purchase"))
        .execute(&mut *tx)
        .await
        .map_err(|e| ApiKeyDbError::Database(e.to_string()))?;
        
        tx.commit().await
            .map_err(|e| ApiKeyDbError::Database(e.to_string()))?;
        
        info!("Added ${:.6} {} credits to API key {}, new balance: ${:.6}", 
              amount, balance_type.as_str(), api_key_id, new_balance);
        
        Ok(new_balance)
    }
    
    /// Atomic credit deduction with overdraft protection
    /// Used for both service fees and gas costs
    pub async fn deduct_credits(
        pool: &MySqlPool,
        api_key_id: i64,
        amount: Decimal,
        balance_type: BalanceType,
        entry_type: LedgerEntryType,
        transaction_id: Option<i64>,
        description: &str,
    ) -> Result<Decimal, ApiKeyDbError> {
        let mut tx = pool.begin().await
            .map_err(|e| ApiKeyDbError::Database(e.to_string()))?;
        
        // Get current balance with lock
        let balance_col = match balance_type {
            BalanceType::Mainnet => "mainnet_balance",
            BalanceType::Testnet => "testnet_balance",
        };
        let query = format!(
            "SELECT CAST({} AS CHAR) as balance FROM api_keys WHERE id = ? FOR UPDATE",
            balance_col
        );
        
        let row = sqlx::query(&query)
            .bind(api_key_id)
            .fetch_one(&mut *tx)
            .await
            .map_err(|e| ApiKeyDbError::Database(e.to_string()))?;
        
        let balance_str: String = row.get("balance");
        let current_balance = Decimal::from_str(&balance_str)
            .map_err(|e| ApiKeyDbError::InvalidData(format!("Invalid balance: {}", e)))?;
        
        // Check sufficient funds
        if current_balance < amount {
            tx.rollback().await.ok();
            return Err(ApiKeyDbError::InsufficientCredits {
                have: current_balance,
                need: amount,
            });
        }
        
        let new_balance = current_balance - amount;
        
        // Update the appropriate balance
        let update_query = match balance_type {
            BalanceType::Mainnet => {
                r#"UPDATE api_keys 
                   SET mainnet_balance = CAST(? AS DECIMAL(20,10)),
                       lifetime_credits_used = lifetime_credits_used + CAST(? AS DECIMAL(20,10)),
                       lifetime_mainnet_used = COALESCE(lifetime_mainnet_used, 0) + CAST(? AS DECIMAL(20,10)),
                       last_used_at = NOW()
                   WHERE id = ?"#
            }
            BalanceType::Testnet => {
                r#"UPDATE api_keys 
                   SET testnet_balance = CAST(? AS DECIMAL(20,10)),
                       lifetime_credits_used = lifetime_credits_used + CAST(? AS DECIMAL(20,10)),
                       lifetime_testnet_used = COALESCE(lifetime_testnet_used, 0) + CAST(? AS DECIMAL(20,10)),
                       last_used_at = NOW()
                   WHERE id = ?"#
            }
        };
        
        sqlx::query(update_query)
            .bind(new_balance.to_string())
            .bind(amount.to_string())
            .bind(amount.to_string())
            .bind(api_key_id)
            .execute(&mut *tx)
            .await
            .map_err(|e| ApiKeyDbError::Database(e.to_string()))?;
        
        // Log to ledger (amount is negative for deductions)
        let neg_amount = -amount;
        let entry_type_str = entry_type.to_string();
        sqlx::query(
            r#"INSERT INTO credit_ledger 
               (api_key_id, transaction_id, entry_type, network_type, amount, balance_before, balance_after, description)
               VALUES (?, ?, ?, ?, CAST(? AS DECIMAL(20,10)), CAST(? AS DECIMAL(20,10)), CAST(? AS DECIMAL(20,10)), ?)"#
        )
        .bind(api_key_id)
        .bind(transaction_id)
        .bind(entry_type_str)
        .bind(balance_type.as_str())
        .bind(neg_amount.to_string())
        .bind(current_balance.to_string())
        .bind(new_balance.to_string())
        .bind(description)
        .execute(&mut *tx)
        .await
        .map_err(|e| ApiKeyDbError::Database(e.to_string()))?;
        
        // Update expiry if balance is now zero
        if new_balance <= dec!(0) {
            sqlx::query(
                "UPDATE api_keys SET expires_at = DATE_ADD(NOW(), INTERVAL 30 DAY) WHERE id = ? AND expires_at > DATE_ADD(NOW(), INTERVAL 30 DAY)"
            )
            .bind(api_key_id)
            .execute(&mut *tx)
            .await
            .ok(); // Non-critical, don't fail on this
        }
        
        tx.commit().await
            .map_err(|e| ApiKeyDbError::Database(e.to_string()))?;
        
        Ok(new_balance)
    }
    
    /// Deduct service fee + gas cost atomically for a settlement
    /// This is the main deduction function used during settlement
    pub async fn deduct_settlement_costs(
        pool: &MySqlPool,
        api_key_id: i64,
        transaction_id: i64,
        balance_type: BalanceType,
        service_fee: Decimal,
        gas_cost: Decimal,
        gas_data: &GasDeductionData,
    ) -> Result<Decimal, ApiKeyDbError> {
        let total = service_fee + gas_cost;
        
        let mut tx = pool.begin().await
            .map_err(|e| ApiKeyDbError::Database(e.to_string()))?;
        
        // Get current balance with lock
        let balance_col = match balance_type {
            BalanceType::Mainnet => "mainnet_balance",
            BalanceType::Testnet => "testnet_balance",
        };
        let query = format!(
            "SELECT CAST({} AS CHAR) as balance FROM api_keys WHERE id = ? FOR UPDATE",
            balance_col
        );
        
        let row = sqlx::query(&query)
            .bind(api_key_id)
            .fetch_one(&mut *tx)
            .await
            .map_err(|e| ApiKeyDbError::Database(e.to_string()))?;
        
        let balance_str: String = row.get("balance");
        let current_balance = Decimal::from_str(&balance_str)
            .map_err(|e| ApiKeyDbError::InvalidData(format!("Invalid balance: {}", e)))?;
        
        // Check sufficient funds
        if current_balance < total {
            tx.rollback().await.ok();
            return Err(ApiKeyDbError::InsufficientCredits {
                have: current_balance,
                need: total,
            });
        }
        
        let balance_after_service = current_balance - service_fee;
        let new_balance = balance_after_service - gas_cost;
        
        // Update the appropriate balance
        let update_query = match balance_type {
            BalanceType::Mainnet => {
                r#"UPDATE api_keys 
                   SET mainnet_balance = CAST(? AS DECIMAL(20,10)),
                       lifetime_credits_used = lifetime_credits_used + CAST(? AS DECIMAL(20,10)),
                       lifetime_mainnet_used = COALESCE(lifetime_mainnet_used, 0) + CAST(? AS DECIMAL(20,10)),
                       total_transactions = total_transactions + 1,
                       successful_transactions = successful_transactions + 1,
                       last_used_at = NOW()
                   WHERE id = ?"#
            }
            BalanceType::Testnet => {
                r#"UPDATE api_keys 
                   SET testnet_balance = CAST(? AS DECIMAL(20,10)),
                       lifetime_credits_used = lifetime_credits_used + CAST(? AS DECIMAL(20,10)),
                       lifetime_testnet_used = COALESCE(lifetime_testnet_used, 0) + CAST(? AS DECIMAL(20,10)),
                       total_transactions = total_transactions + 1,
                       successful_transactions = successful_transactions + 1,
                       last_used_at = NOW()
                   WHERE id = ?"#
            }
        };
        
        sqlx::query(update_query)
            .bind(new_balance.to_string())
            .bind(total.to_string())
            .bind(total.to_string())
            .bind(api_key_id)
            .execute(&mut *tx)
            .await
            .map_err(|e| ApiKeyDbError::Database(e.to_string()))?;
        
        // Log service fee
        if service_fee > dec!(0) {
            let neg_fee = -service_fee;
            sqlx::query(
                r#"INSERT INTO credit_ledger 
                   (api_key_id, transaction_id, entry_type, network_type, amount, balance_before, balance_after, description)
                   VALUES (?, ?, 'service_fee', ?, CAST(? AS DECIMAL(20,10)), CAST(? AS DECIMAL(20,10)), CAST(? AS DECIMAL(20,10)), ?)"#
            )
            .bind(api_key_id)
            .bind(transaction_id)
            .bind(balance_type.as_str())
            .bind(neg_fee.to_string())
            .bind(current_balance.to_string())
            .bind(balance_after_service.to_string())
            .bind("Settlement service fee")
            .execute(&mut *tx)
            .await
            .map_err(|e| ApiKeyDbError::Database(e.to_string()))?;
        }
        
        // Log gas cost
        if gas_cost > dec!(0) {
            let neg_gas = -gas_cost;
            let desc = format!(
                "Gas: {} native @ ${:.4}/token on {}",
                gas_data.gas_cost_native,
                gas_data.native_usd_price,
                gas_data.network
            );
            sqlx::query(
                r#"INSERT INTO credit_ledger 
                   (api_key_id, transaction_id, entry_type, network_type, amount, balance_before, balance_after, description)
                   VALUES (?, ?, 'gas_cost', ?, CAST(? AS DECIMAL(20,10)), CAST(? AS DECIMAL(20,10)), CAST(? AS DECIMAL(20,10)), ?)"#
            )
            .bind(api_key_id)
            .bind(transaction_id)
            .bind(balance_type.as_str())
            .bind(neg_gas.to_string())
            .bind(balance_after_service.to_string())
            .bind(new_balance.to_string())
            .bind(desc)
            .execute(&mut *tx)
            .await
            .map_err(|e| ApiKeyDbError::Database(e.to_string()))?;
        }
        
        // Update transaction with gas data
        sqlx::query(
            r#"UPDATE transactions 
               SET gas_used = ?, effective_gas_price_wei = ?,
                   gas_cost_native = CAST(? AS DECIMAL(36,18)),
                   gas_cost_usd = CAST(? AS DECIMAL(20,10)),
                   native_token_price_usd = CAST(? AS DECIMAL(20,10)),
                   service_fee_usd = CAST(? AS DECIMAL(20,10)),
                   total_cost_usd = CAST(? AS DECIMAL(20,10))
               WHERE id = ?"#
        )
        .bind(gas_data.gas_used as i64)
        .bind(gas_data.gas_price_wei as i64)
        .bind(gas_data.gas_cost_native.to_string())
        .bind(gas_cost.to_string())
        .bind(gas_data.native_usd_price.to_string())
        .bind(service_fee.to_string())
        .bind(total.to_string())
        .bind(transaction_id)
        .execute(&mut *tx)
        .await
        .map_err(|e| ApiKeyDbError::Database(e.to_string()))?;
        
        // Update expiry if balance is now zero
        if new_balance <= dec!(0) {
            sqlx::query(
                "UPDATE api_keys SET expires_at = DATE_ADD(NOW(), INTERVAL 30 DAY) WHERE id = ? AND expires_at > DATE_ADD(NOW(), INTERVAL 30 DAY)"
            )
            .bind(api_key_id)
            .execute(&mut *tx)
            .await
            .ok();
        }
        
        tx.commit().await
            .map_err(|e| ApiKeyDbError::Database(e.to_string()))?;
        
        info!(
            "Deducted ${:.6} {} from API key {} (service: ${:.6}, gas: ${:.6}), new balance: ${:.6}",
            total, balance_type.as_str(), api_key_id, service_fee, gas_cost, new_balance
        );
        
        Ok(new_balance)
    }
    
    /// Get balance for an API key (total of mainnet + testnet)
    pub async fn get_balance(pool: &MySqlPool, api_key_id: i64) -> Result<Decimal, ApiKeyDbError> {
        let row = sqlx::query(
            "SELECT CAST(mainnet_balance + testnet_balance AS CHAR) as balance FROM api_keys WHERE id = ?"
        )
        .bind(api_key_id)
        .fetch_one(pool)
        .await
        .map_err(|e| ApiKeyDbError::Database(e.to_string()))?;
        
        let balance_str: String = row.get("balance");
        Decimal::from_str(&balance_str)
            .map_err(|e| ApiKeyDbError::InvalidData(format!("Invalid balance: {}", e)))
    }
    
    // =========================================================================
    // LEDGER OPERATIONS
    // =========================================================================
    
    /// Get recent ledger entries for an API key
    pub async fn get_ledger_entries(
        pool: &MySqlPool,
        api_key_id: i64,
        limit: i32,
    ) -> Result<Vec<LedgerEntry>, ApiKeyDbError> {
        let rows: Vec<LedgerRow> = sqlx::query_as(
            r#"SELECT l.id, l.entry_type, 
                      CAST(l.amount AS CHAR) as amount,
                      CAST(l.balance_before AS CHAR) as balance_before,
                      CAST(l.balance_after AS CHAR) as balance_after,
                      l.description, l.created_at,
                      t.transaction_hash
               FROM credit_ledger l
               LEFT JOIN transactions t ON l.transaction_id = t.id
               WHERE l.api_key_id = ?
               ORDER BY l.created_at DESC
               LIMIT ?"#
        )
        .bind(api_key_id)
        .bind(limit)
        .fetch_all(pool)
        .await
        .map_err(|e| ApiKeyDbError::Database(e.to_string()))?;
        
        rows.into_iter()
            .map(|r| r.try_into())
            .collect::<Result<Vec<_>, _>>()
    }
    
    /// Log a ledger entry (internal helper)
    async fn log_ledger_entry(
        pool: &MySqlPool,
        api_key_id: i64,
        transaction_id: Option<i64>,
        purchase_id: Option<i64>,
        entry_type: LedgerEntryType,
        amount: Decimal,
        balance_before: Decimal,
        balance_after: Decimal,
        description: Option<&str>,
    ) -> Result<i64, ApiKeyDbError> {
        let entry_type_str = entry_type.to_string();
        let result = sqlx::query(
            r#"INSERT INTO credit_ledger 
               (api_key_id, transaction_id, purchase_id, entry_type, amount, balance_before, balance_after, description)
               VALUES (?, ?, ?, ?, CAST(? AS DECIMAL(20,10)), CAST(? AS DECIMAL(20,10)), CAST(? AS DECIMAL(20,10)), ?)"#
        )
        .bind(api_key_id)
        .bind(transaction_id)
        .bind(purchase_id)
        .bind(entry_type_str)
        .bind(amount.to_string())
        .bind(balance_before.to_string())
        .bind(balance_after.to_string())
        .bind(description)
        .execute(pool)
        .await
        .map_err(|e| ApiKeyDbError::Database(e.to_string()))?;
        
        Ok(result.last_insert_id() as i64)
    }
    
    // =========================================================================
    // NATIVE TOKEN PRICES
    // =========================================================================
    
    /// Get cached price for a native token
    pub async fn get_native_token_price(
        pool: &MySqlPool,
        symbol: &str,
    ) -> Result<Option<Decimal>, ApiKeyDbError> {
        let row: Option<(String,)> = sqlx::query_as(
            r#"SELECT CAST(price_usd AS CHAR) 
               FROM native_token_prices 
               WHERE symbol = ? AND expires_at > NOW()
               ORDER BY fetched_at DESC 
               LIMIT 1"#
        )
        .bind(symbol)
        .fetch_optional(pool)
        .await
        .map_err(|e| ApiKeyDbError::Database(e.to_string()))?;
        
        match row {
            Some((price_str,)) => {
                let price = Decimal::from_str(&price_str)
                    .map_err(|e| ApiKeyDbError::InvalidData(format!("Invalid price: {}", e)))?;
                Ok(Some(price))
            }
            None => Ok(None),
        }
    }
    
    /// Cache a native token price
    pub async fn cache_native_token_price(
        pool: &MySqlPool,
        symbol: &str,
        price: Decimal,
        source: &str,
        ttl_minutes: i64,
    ) -> Result<(), ApiKeyDbError> {
        sqlx::query(
            r#"INSERT INTO native_token_prices (symbol, price_usd, source, expires_at)
               VALUES (?, CAST(? AS DECIMAL(20,10)), ?, DATE_ADD(NOW(), INTERVAL ? MINUTE))
               ON DUPLICATE KEY UPDATE 
                   price_usd = VALUES(price_usd),
                   source = VALUES(source),
                   expires_at = VALUES(expires_at),
                   fetched_at = NOW()"#
        )
        .bind(symbol)
        .bind(price.to_string())
        .bind(source)
        .bind(ttl_minutes)
        .execute(pool)
        .await
        .map_err(|e| ApiKeyDbError::Database(e.to_string()))?;
        
        Ok(())
    }
    
    /// Get fallback price for a native token (from hardcoded defaults)
    pub async fn get_fallback_price(
        pool: &MySqlPool,
        symbol: &str,
    ) -> Result<Decimal, ApiKeyDbError> {
        let row: Option<(String,)> = sqlx::query_as(
            r#"SELECT CAST(price_usd AS CHAR) 
               FROM native_token_prices 
               WHERE symbol = ? AND source = 'fallback'
               LIMIT 1"#
        )
        .bind(symbol)
        .fetch_optional(pool)
        .await
        .map_err(|e| ApiKeyDbError::Database(e.to_string()))?;
        
        match row {
            Some((price_str,)) => {
                Decimal::from_str(&price_str)
                    .map_err(|e| ApiKeyDbError::InvalidData(format!("Invalid price: {}", e)))
            }
            None => {
                // Hardcoded fallbacks if not in DB
                let fallback = match symbol.to_uppercase().as_str() {
                    "ETH" => dec!(3500),
                    "HYPE" => dec!(25),
                    "MATIC" => dec!(0.5),
                    "AVAX" => dec!(35),
                    "BNB" => dec!(300),
                    _ => dec!(1), // Default to $1 if unknown
                };
                warn!("Using hardcoded fallback price for {}: ${}", symbol, fallback);
                Ok(fallback)
            }
        }
    }
    
    // =========================================================================
    // TRANSACTION OPERATIONS (for new model)
    // =========================================================================
    
    /// Create a transaction record
    pub async fn create_transaction(
        pool: &MySqlPool,
        api_key_id: i64,
        tx: &CreateTransactionParams,
    ) -> Result<i64, ApiKeyDbError> {
        let result = sqlx::query(
            r#"INSERT INTO transactions 
               (api_key_id, network, asset, payer_address, recipient_address, 
                amount, nonce, valid_after, valid_before, resource, description, status)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')"#
        )
        .bind(api_key_id)
        .bind(&tx.network)
        .bind(&tx.asset)
        .bind(&tx.payer_address)
        .bind(&tx.recipient_address)
        .bind(&tx.amount)
        .bind(&tx.nonce)
        .bind(tx.valid_after)
        .bind(tx.valid_before)
        .bind(&tx.resource)
        .bind(&tx.description)
        .execute(pool)
        .await
        .map_err(|e| ApiKeyDbError::Database(e.to_string()))?;
        
        Ok(result.last_insert_id() as i64)
    }
    
    /// Update transaction status and hash
    pub async fn update_transaction_status(
        pool: &MySqlPool,
        transaction_id: i64,
        status: &str,
        tx_hash: Option<&str>,
    ) -> Result<(), ApiKeyDbError> {
        if let Some(hash) = tx_hash {
            sqlx::query(
                "UPDATE transactions SET status = ?, transaction_hash = ?, updated_at = NOW() WHERE id = ?"
            )
            .bind(status)
            .bind(hash)
            .bind(transaction_id)
            .execute(pool)
            .await
            .map_err(|e| ApiKeyDbError::Database(e.to_string()))?;
        } else {
            sqlx::query(
                "UPDATE transactions SET status = ?, updated_at = NOW() WHERE id = ?"
            )
            .bind(status)
            .bind(transaction_id)
            .execute(pool)
            .await
            .map_err(|e| ApiKeyDbError::Database(e.to_string()))?;
        }
        
        Ok(())
    }
    
    /// Mark transaction as confirmed
    pub async fn confirm_transaction(
        pool: &MySqlPool,
        transaction_id: i64,
    ) -> Result<(), ApiKeyDbError> {
        sqlx::query(
            "UPDATE transactions SET status = 'completed', confirmed_at = NOW(), updated_at = NOW() WHERE id = ?"
        )
        .bind(transaction_id)
        .execute(pool)
        .await
        .map_err(|e| ApiKeyDbError::Database(e.to_string()))?;
        
        Ok(())
    }
    
    /// Find existing transaction by payer and nonce
    pub async fn find_transaction_by_nonce(
        pool: &MySqlPool,
        payer: &str,
        nonce: &str,
    ) -> Result<Option<(i64, String, Option<String>)>, ApiKeyDbError> {
        let row: Option<(i64, String, Option<String>)> = sqlx::query_as(
            "SELECT id, status, transaction_hash FROM transactions WHERE payer_address = ? AND nonce = ? LIMIT 1"
        )
        .bind(payer.to_lowercase())
        .bind(nonce)
        .fetch_optional(pool)
        .await
        .map_err(|e| ApiKeyDbError::Database(e.to_string()))?;
        
        Ok(row)
    }
    
    /// Increment failed transaction count
    pub async fn increment_failed_transactions(
        pool: &MySqlPool,
        api_key_id: i64,
    ) -> Result<(), ApiKeyDbError> {
        sqlx::query(
            "UPDATE api_keys SET total_transactions = total_transactions + 1, last_used_at = NOW() WHERE id = ?"
        )
        .bind(api_key_id)
        .execute(pool)
        .await
        .map_err(|e| ApiKeyDbError::Database(e.to_string()))?;
        
        Ok(())
    }
}

// =============================================================================
// HELPER TYPES
// =============================================================================

/// Gas deduction data for settlement cost calculation
#[derive(Debug, Clone)]
pub struct GasDeductionData {
    pub gas_used: u64,
    pub gas_price_wei: u128,
    pub gas_cost_native: Decimal,
    pub gas_cost_usd: Decimal,
    pub native_usd_price: Decimal,
    pub service_fee_usd: Decimal,
    pub network: String,
}

/// Parameters for creating a transaction
#[derive(Debug, Clone)]
pub struct CreateTransactionParams {
    pub network: String,
    pub asset: String,
    pub payer_address: String,
    pub recipient_address: String,
    pub amount: String,
    pub nonce: String,
    pub valid_after: i64,
    pub valid_before: i64,
    pub resource: Option<String>,
    pub description: Option<String>,
}

// =============================================================================
// ROW TYPES (for sqlx)
// =============================================================================

#[derive(Debug, FromRow)]
struct ApiKeyRow {
    id: i64,
    api_key: String,
    email: Option<String>,
    mainnet_balance: String,
    testnet_balance: String,
    lifetime_credits_purchased: String,
    lifetime_credits_used: String,
    total_transactions: i32,
    successful_transactions: i32,
    is_active: i8,
    expires_at: Option<chrono::DateTime<chrono::Utc>>,
    created_at: chrono::DateTime<chrono::Utc>,
    updated_at: chrono::DateTime<chrono::Utc>,
    last_used_at: Option<chrono::DateTime<chrono::Utc>>,
}

impl TryFrom<ApiKeyRow> for ApiKey {
    type Error = ApiKeyDbError;
    
    fn try_from(row: ApiKeyRow) -> Result<Self, Self::Error> {
        Ok(ApiKey {
            id: row.id,
            api_key: row.api_key,
            email: row.email,
            mainnet_balance: Decimal::from_str(&row.mainnet_balance)
                .map_err(|e| ApiKeyDbError::InvalidData(format!("Invalid mainnet_balance: {}", e)))?,
            testnet_balance: Decimal::from_str(&row.testnet_balance)
                .map_err(|e| ApiKeyDbError::InvalidData(format!("Invalid testnet_balance: {}", e)))?,
            lifetime_credits_purchased: Decimal::from_str(&row.lifetime_credits_purchased)
                .map_err(|e| ApiKeyDbError::InvalidData(format!("Invalid lifetime_credits_purchased: {}", e)))?,
            lifetime_credits_used: Decimal::from_str(&row.lifetime_credits_used)
                .map_err(|e| ApiKeyDbError::InvalidData(format!("Invalid lifetime_credits_used: {}", e)))?,
            total_transactions: row.total_transactions,
            successful_transactions: row.successful_transactions,
            is_active: row.is_active != 0,
            expires_at: row.expires_at,
            created_at: row.created_at,
            updated_at: row.updated_at,
            last_used_at: row.last_used_at,
        })
    }
}

#[derive(Debug, FromRow)]
struct LedgerRow {
    id: i64,
    entry_type: String,
    amount: String,
    balance_before: String,
    balance_after: String,
    description: Option<String>,
    created_at: chrono::DateTime<chrono::Utc>,
    transaction_hash: Option<String>,
}

impl TryFrom<LedgerRow> for LedgerEntry {
    type Error = ApiKeyDbError;
    
    fn try_from(row: LedgerRow) -> Result<Self, Self::Error> {
        let entry_type = match row.entry_type.as_str() {
            "purchase" => LedgerEntryType::Purchase,
            "service_fee" => LedgerEntryType::ServiceFee,
            "gas_cost" => LedgerEntryType::GasCost,
            "refund" => LedgerEntryType::Refund,
            "adjustment" => LedgerEntryType::Adjustment,
            other => return Err(ApiKeyDbError::InvalidData(format!("Unknown entry type: {}", other))),
        };
        
        Ok(LedgerEntry {
            id: row.id,
            entry_type,
            amount: Decimal::from_str(&row.amount)
                .map_err(|e| ApiKeyDbError::InvalidData(format!("Invalid amount: {}", e)))?,
            balance_before: Decimal::from_str(&row.balance_before)
                .map_err(|e| ApiKeyDbError::InvalidData(format!("Invalid balance_before: {}", e)))?,
            balance_after: Decimal::from_str(&row.balance_after)
                .map_err(|e| ApiKeyDbError::InvalidData(format!("Invalid balance_after: {}", e)))?,
            description: row.description,
            transaction_hash: row.transaction_hash,
            created_at: row.created_at.to_rfc3339(),
        })
    }
}

impl ApiKeyDb {
    /// Create a new API key with payer address and balance type
    pub async fn create_api_key_with_payer(
        pool: &MySqlPool,
        initial_balance: Decimal,
        balance_type: BalanceType,
        payer_address: Option<&str>,
        description: &str,
    ) -> Result<(String, i64), ApiKeyDbError> {
        use rand::Rng;
        
        // Generate random 64-char hex API key
        let api_key: String = (0..32)
            .map(|_| format!("{:02x}", rand::thread_rng().gen::<u8>()))
            .collect();
        
        // API keys with balance expire in 1 year, empty keys expire in 30 days
        let expiry_days = if initial_balance > dec!(0) { 365 } else { 30 };
        
        // Determine which balance column to initialize
        let (mainnet_bal, testnet_bal, mainnet_purchased, testnet_purchased) = match balance_type {
            BalanceType::Mainnet => (initial_balance, dec!(0), initial_balance, dec!(0)),
            BalanceType::Testnet => (dec!(0), initial_balance, dec!(0), initial_balance),
        };
        
        let result = sqlx::query(
            r#"INSERT INTO api_keys (
                api_key, email, 
                mainnet_balance, testnet_balance,
                lifetime_credits_purchased, lifetime_mainnet_purchased, lifetime_testnet_purchased,
                expires_at
            ) VALUES (
                ?, ?, 
                CAST(? AS DECIMAL(20,10)), CAST(? AS DECIMAL(20,10)),
                CAST(? AS DECIMAL(20,10)), CAST(? AS DECIMAL(20,10)), CAST(? AS DECIMAL(20,10)),
                DATE_ADD(NOW(), INTERVAL ? DAY)
            )"#
        )
        .bind(&api_key)
        .bind(payer_address) // Store payer address in email field for now
        .bind(mainnet_bal.to_string())
        .bind(testnet_bal.to_string())
        .bind(initial_balance.to_string())
        .bind(mainnet_purchased.to_string())
        .bind(testnet_purchased.to_string())
        .bind(expiry_days)
        .execute(pool)
        .await
        .map_err(|e| ApiKeyDbError::Database(e.to_string()))?;
        
        let id = result.last_insert_id() as i64;
        
        // Log initial balance if non-zero
        if initial_balance > dec!(0) {
            ApiKeyDb::log_ledger_entry(
                pool,
                id,
                None,
                None,
                LedgerEntryType::Purchase,
                initial_balance,
                dec!(0),
                initial_balance,
                Some(description),
            ).await?;
        }
        
        info!("Created new API key {}...{} with ${:.2} {} balance", 
              &api_key[..8], &api_key[api_key.len()-4..], initial_balance, balance_type.as_str());
        
        Ok((api_key, id))
    }
    
    /// Get API key statistics
    pub async fn get_api_key_stats(pool: &MySqlPool, api_key_id: i64) -> Result<ApiKeyStats, ApiKeyDbError> {
        let row = sqlx::query(
            r#"SELECT 
                total_transactions,
                successful_transactions,
                total_transactions - successful_transactions as failed_transactions,
                COALESCE(CAST(lifetime_credits_used AS CHAR), '0') as total_spent
               FROM api_keys WHERE id = ?"#
        )
        .bind(api_key_id)
        .fetch_optional(pool)
        .await
        .map_err(|e| ApiKeyDbError::Database(e.to_string()))?;
        
        match row {
            Some(row) => {
                let total_spent_str: String = row.get("total_spent");
                let total_spent = Decimal::from_str(&total_spent_str).unwrap_or(dec!(0));
                
                // Get breakdown from ledger using CAST AS CHAR for Decimal conversion
                let ledger_stats = sqlx::query(
                    r#"SELECT 
                        CAST(COALESCE(SUM(CASE WHEN entry_type = 'gas_cost' THEN ABS(CAST(amount AS DECIMAL(20,10))) ELSE 0 END), 0) AS CHAR) as gas_cost,
                        CAST(COALESCE(SUM(CASE WHEN entry_type = 'service_fee' THEN ABS(CAST(amount AS DECIMAL(20,10))) ELSE 0 END), 0) AS CHAR) as service_fees
                       FROM credit_ledger WHERE api_key_id = ?"#
                )
                .bind(api_key_id)
                .fetch_one(pool)
                .await
                .ok();
                
                let (gas_cost, service_fees) = if let Some(ls) = ledger_stats {
                    let gc_str: String = ls.get("gas_cost");
                    let sf_str: String = ls.get("service_fees");
                    let gc = Decimal::from_str(&gc_str).unwrap_or(dec!(0));
                    let sf = Decimal::from_str(&sf_str).unwrap_or(dec!(0));
                    (gc, sf)
                } else {
                    (dec!(0), dec!(0))
                };
                
                Ok(ApiKeyStats {
                    total_transactions: row.get("total_transactions"),
                    successful_transactions: row.get("successful_transactions"),
                    failed_transactions: row.get("failed_transactions"),
                    total_spent,
                    total_gas_cost: gas_cost,
                    total_service_fees: service_fees,
                })
            }
            None => Err(ApiKeyDbError::NotFound),
        }
    }
    
    /// Record a credit purchase in the credit_purchases table
    /// This provides a complete audit trail for all purchases
    pub async fn record_credit_purchase(
        pool: &MySqlPool,
        api_key: &str,
        amount: Decimal,
        payment_method: &str,
        network: Option<&str>,
        is_testnet: bool,
        payer_address: Option<&str>,
        transaction_hash: Option<&str>,
    ) -> Result<i64, ApiKeyDbError> {
        let result = sqlx::query(
            r#"INSERT INTO credit_purchases 
               (api_key, usd_amount, payment_method, network, is_testnet, 
                payer_address, transaction_hash, status, completed_at)
               VALUES (?, CAST(? AS DECIMAL(20,10)), ?, ?, ?, ?, ?, 'completed', NOW())"#
        )
        .bind(api_key)
        .bind(amount.to_string())
        .bind(payment_method)
        .bind(network)
        .bind(is_testnet)
        .bind(payer_address)
        .bind(transaction_hash)
        .execute(pool)
        .await
        .map_err(|e| ApiKeyDbError::Database(e.to_string()))?;
        
        let id = result.last_insert_id() as i64;
        
        info!(
            "📝 Recorded credit purchase #{}: ${:.2} {} via {} on {}",
            id, amount, 
            if is_testnet { "testnet" } else { "mainnet" },
            payment_method,
            network.unwrap_or("unknown")
        );
        
        Ok(id)
    }
}

/// API Key statistics
#[derive(Debug, Clone, Default)]
pub struct ApiKeyStats {
    pub total_transactions: i64,
    pub successful_transactions: i64,
    pub failed_transactions: i64,
    pub total_spent: Decimal,
    pub total_gas_cost: Decimal,
    pub total_service_fees: Decimal,
}