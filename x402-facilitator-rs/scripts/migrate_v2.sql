-- =============================================================================
-- Migration to v2.0 API Key Model
-- =============================================================================
-- 
-- This migration converts from merchant_id based auth to API key based auth.
-- It adds new columns to existing tables and creates new tables.
--
-- IMPORTANT: This is an additive migration. Old data is preserved.
-- Run: mysql -u root -p x402_facilitator < scripts/migrate_v2.sql
-- =============================================================================

USE x402_facilitator;

-- =============================================================================
-- 1. Update API KEYS table (add missing columns if needed)
-- =============================================================================

-- Check and add columns if they don't exist
SET @col_exists = (SELECT COUNT(*) FROM information_schema.columns 
                   WHERE table_schema = 'x402_facilitator' 
                   AND table_name = 'api_keys' 
                   AND column_name = 'lifetime_credits_purchased');

SET @sql = IF(@col_exists = 0,
    'ALTER TABLE api_keys ADD COLUMN lifetime_credits_purchased DECIMAL(20, 10) NOT NULL DEFAULT 0.0000000000',
    'SELECT "Column lifetime_credits_purchased already exists"');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists = (SELECT COUNT(*) FROM information_schema.columns 
                   WHERE table_schema = 'x402_facilitator' 
                   AND table_name = 'api_keys' 
                   AND column_name = 'lifetime_credits_used');

SET @sql = IF(@col_exists = 0,
    'ALTER TABLE api_keys ADD COLUMN lifetime_credits_used DECIMAL(20, 10) NOT NULL DEFAULT 0.0000000000',
    'SELECT "Column lifetime_credits_used already exists"');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- =============================================================================
-- 2. Add new columns to transactions table
-- =============================================================================

-- Add api_key column (nullable initially for migration)
SET @col_exists = (SELECT COUNT(*) FROM information_schema.columns 
                   WHERE table_schema = 'x402_facilitator' 
                   AND table_name = 'transactions' 
                   AND column_name = 'api_key');

SET @sql = IF(@col_exists = 0,
    'ALTER TABLE transactions ADD COLUMN api_key VARCHAR(64) NULL AFTER id',
    'SELECT "Column api_key already exists"');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Add gas tracking columns
SET @col_exists = (SELECT COUNT(*) FROM information_schema.columns 
                   WHERE table_schema = 'x402_facilitator' 
                   AND table_name = 'transactions' 
                   AND column_name = 'gas_used');

SET @sql = IF(@col_exists = 0,
    'ALTER TABLE transactions ADD COLUMN gas_used BIGINT NULL',
    'SELECT "Column gas_used already exists"');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists = (SELECT COUNT(*) FROM information_schema.columns 
                   WHERE table_schema = 'x402_facilitator' 
                   AND table_name = 'transactions' 
                   AND column_name = 'effective_gas_price_wei');

SET @sql = IF(@col_exists = 0,
    'ALTER TABLE transactions ADD COLUMN effective_gas_price_wei BIGINT NULL',
    'SELECT "Column effective_gas_price_wei already exists"');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists = (SELECT COUNT(*) FROM information_schema.columns 
                   WHERE table_schema = 'x402_facilitator' 
                   AND table_name = 'transactions' 
                   AND column_name = 'gas_cost_native');

SET @sql = IF(@col_exists = 0,
    'ALTER TABLE transactions ADD COLUMN gas_cost_native DECIMAL(36, 18) NULL',
    'SELECT "Column gas_cost_native already exists"');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists = (SELECT COUNT(*) FROM information_schema.columns 
                   WHERE table_schema = 'x402_facilitator' 
                   AND table_name = 'transactions' 
                   AND column_name = 'gas_cost_usd');

SET @sql = IF(@col_exists = 0,
    'ALTER TABLE transactions ADD COLUMN gas_cost_usd DECIMAL(20, 10) NULL',
    'SELECT "Column gas_cost_usd already exists"');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists = (SELECT COUNT(*) FROM information_schema.columns 
                   WHERE table_schema = 'x402_facilitator' 
                   AND table_name = 'transactions' 
                   AND column_name = 'native_token_price_usd');

SET @sql = IF(@col_exists = 0,
    'ALTER TABLE transactions ADD COLUMN native_token_price_usd DECIMAL(20, 10) NULL',
    'SELECT "Column native_token_price_usd already exists"');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists = (SELECT COUNT(*) FROM information_schema.columns 
                   WHERE table_schema = 'x402_facilitator' 
                   AND table_name = 'transactions' 
                   AND column_name = 'service_fee_usd');

SET @sql = IF(@col_exists = 0,
    'ALTER TABLE transactions ADD COLUMN service_fee_usd DECIMAL(20, 10) NULL',
    'SELECT "Column service_fee_usd already exists"');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists = (SELECT COUNT(*) FROM information_schema.columns 
                   WHERE table_schema = 'x402_facilitator' 
                   AND table_name = 'transactions' 
                   AND column_name = 'total_cost_usd');

SET @sql = IF(@col_exists = 0,
    'ALTER TABLE transactions ADD COLUMN total_cost_usd DECIMAL(20, 10) NULL',
    'SELECT "Column total_cost_usd already exists"');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists = (SELECT COUNT(*) FROM information_schema.columns 
                   WHERE table_schema = 'x402_facilitator' 
                   AND table_name = 'transactions' 
                   AND column_name = 'deduction_status');

SET @sql = IF(@col_exists = 0,
    'ALTER TABLE transactions ADD COLUMN deduction_status ENUM(''pending'', ''deducted'', ''failed'') DEFAULT ''pending''',
    'SELECT "Column deduction_status already exists"');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists = (SELECT COUNT(*) FROM information_schema.columns 
                   WHERE table_schema = 'x402_facilitator' 
                   AND table_name = 'transactions' 
                   AND column_name = 'deducted_at');

SET @sql = IF(@col_exists = 0,
    'ALTER TABLE transactions ADD COLUMN deducted_at TIMESTAMP NULL',
    'SELECT "Column deducted_at already exists"');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Modify status enum to include 'expired'
ALTER TABLE transactions MODIFY COLUMN status ENUM('pending','preconfirmed','completed','failed','expired') DEFAULT 'pending';

-- Add index on api_key
SET @idx_exists = (SELECT COUNT(*) FROM information_schema.statistics 
                   WHERE table_schema = 'x402_facilitator' 
                   AND table_name = 'transactions' 
                   AND index_name = 'idx_api_key');

SET @sql = IF(@idx_exists = 0,
    'CREATE INDEX idx_api_key ON transactions (api_key)',
    'SELECT "Index idx_api_key already exists"');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- =============================================================================
-- 3. Create network_aliases table if not exists
-- =============================================================================

CREATE TABLE IF NOT EXISTS network_aliases (
    id INT AUTO_INCREMENT PRIMARY KEY,
    canonical_name VARCHAR(64) NOT NULL,
    alias VARCHAR(128) NOT NULL,
    alias_type ENUM('name', 'chain_id', 'caip2', 'slug') NOT NULL,
    UNIQUE KEY idx_alias (alias),
    INDEX idx_canonical (canonical_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Insert network aliases (only if empty)
SET @count = (SELECT COUNT(*) FROM network_aliases);
SET @sql = IF(@count = 0, 
'INSERT INTO network_aliases (canonical_name, alias, alias_type) VALUES
    (''Base'', ''base'', ''slug''),
    (''Base'', ''8453'', ''chain_id''),
    (''Base'', ''eip155:8453'', ''caip2''),
    (''Base'', ''base mainnet'', ''name''),
    (''Ethereum'', ''ethereum'', ''slug''),
    (''Ethereum'', ''eth'', ''slug''),
    (''Ethereum'', ''1'', ''chain_id''),
    (''Ethereum'', ''eip155:1'', ''caip2''),
    (''Ethereum'', ''mainnet'', ''name''),
    (''OP Mainnet'', ''optimism'', ''slug''),
    (''OP Mainnet'', ''op'', ''slug''),
    (''OP Mainnet'', ''10'', ''chain_id''),
    (''OP Mainnet'', ''eip155:10'', ''caip2''),
    (''HyperEVM'', ''hyperevm'', ''slug''),
    (''HyperEVM'', ''999'', ''chain_id''),
    (''HyperEVM'', ''eip155:999'', ''caip2''),
    (''Base Sepolia'', ''base sepolia'', ''name''),
    (''Base Sepolia'', ''base-sepolia'', ''name''),
    (''Base Sepolia'', ''84532'', ''chain_id''),
    (''Base Sepolia'', ''eip155:84532'', ''caip2''),
    (''Ethereum Sepolia'', ''sepolia'', ''slug''),
    (''Ethereum Sepolia'', ''11155111'', ''chain_id''),
    (''Ethereum Sepolia'', ''eip155:11155111'', ''caip2''),
    (''OP Sepolia'', ''op-sepolia'', ''name''),
    (''OP Sepolia'', ''11155420'', ''chain_id''),
    (''OP Sepolia'', ''eip155:11155420'', ''caip2''),
    (''HyperEVM Testnet'', ''hyperevm-testnet'', ''name''),
    (''HyperEVM Testnet'', ''998'', ''chain_id''),
    (''HyperEVM Testnet'', ''eip155:998'', ''caip2'')',
'SELECT "network_aliases already populated"');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- =============================================================================
-- 4. Create or update credit_ledger table
-- =============================================================================

CREATE TABLE IF NOT EXISTS credit_ledger (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    api_key_id BIGINT NOT NULL,
    transaction_id BIGINT,
    entry_type ENUM('purchase', 'service_fee', 'gas_cost', 'refund', 'adjustment', 'bonus') NOT NULL,
    amount DECIMAL(20, 10) NOT NULL,
    balance_before DECIMAL(20, 10) NOT NULL,
    balance_after DECIMAL(20, 10) NOT NULL,
    description VARCHAR(512),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_api_key (api_key_id),
    INDEX idx_transaction (transaction_id),
    INDEX idx_entry_type (entry_type),
    INDEX idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================================
-- 5. Insert/update native token prices
-- =============================================================================

INSERT INTO native_token_prices (symbol, price_usd, source, expires_at) VALUES
    ('ETH', 2500.00, 'fallback', DATE_ADD(NOW(), INTERVAL 10 YEAR)),
    ('HYPE', 25.00, 'fallback', DATE_ADD(NOW(), INTERVAL 10 YEAR)),
    ('MATIC', 0.50, 'fallback', DATE_ADD(NOW(), INTERVAL 10 YEAR)),
    ('AVAX', 35.00, 'fallback', DATE_ADD(NOW(), INTERVAL 10 YEAR)),
    ('BNB', 600.00, 'fallback', DATE_ADD(NOW(), INTERVAL 10 YEAR))
ON DUPLICATE KEY UPDATE price_usd = VALUES(price_usd);

-- =============================================================================
-- 6. Drop old procedures if they exist and recreate
-- =============================================================================

DROP PROCEDURE IF EXISTS deduct_credits;
DROP PROCEDURE IF EXISTS add_credits;

DELIMITER //
CREATE PROCEDURE deduct_credits(
    IN p_api_key_id BIGINT,
    IN p_amount DECIMAL(20, 10),
    IN p_transaction_id BIGINT,
    IN p_entry_type VARCHAR(20),
    IN p_description VARCHAR(512)
)
BEGIN
    DECLARE v_current_balance DECIMAL(20, 10);
    DECLARE v_new_balance DECIMAL(20, 10);
    
    SELECT usd_balance INTO v_current_balance 
    FROM api_keys 
    WHERE id = p_api_key_id 
    FOR UPDATE;
    
    IF v_current_balance < p_amount THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Insufficient credits';
    END IF;
    
    SET v_new_balance = v_current_balance - p_amount;
    
    UPDATE api_keys 
    SET usd_balance = v_new_balance,
        lifetime_credits_used = lifetime_credits_used + p_amount,
        last_used_at = NOW()
    WHERE id = p_api_key_id;
    
    INSERT INTO credit_ledger (api_key_id, transaction_id, entry_type, amount, balance_before, balance_after, description)
    VALUES (p_api_key_id, p_transaction_id, p_entry_type, -p_amount, v_current_balance, v_new_balance, p_description);
    
    SELECT v_new_balance AS new_balance;
END //
DELIMITER ;

DELIMITER //
CREATE PROCEDURE add_credits(
    IN p_api_key_id BIGINT,
    IN p_amount DECIMAL(20, 10),
    IN p_entry_type VARCHAR(20),
    IN p_description VARCHAR(512)
)
BEGIN
    DECLARE v_current_balance DECIMAL(20, 10);
    DECLARE v_new_balance DECIMAL(20, 10);
    
    SELECT usd_balance INTO v_current_balance 
    FROM api_keys 
    WHERE id = p_api_key_id 
    FOR UPDATE;
    
    SET v_new_balance = v_current_balance + p_amount;
    
    UPDATE api_keys 
    SET usd_balance = v_new_balance,
        lifetime_credits_purchased = lifetime_credits_purchased + p_amount
    WHERE id = p_api_key_id;
    
    INSERT INTO credit_ledger (api_key_id, entry_type, amount, balance_before, balance_after, description)
    VALUES (p_api_key_id, p_entry_type, p_amount, v_current_balance, v_new_balance, p_description);
    
    SELECT v_new_balance AS new_balance;
END //
DELIMITER ;

-- =============================================================================
-- 7. Create views (drop first if exists)
-- =============================================================================

DROP VIEW IF EXISTS v_api_key_summary;
CREATE VIEW v_api_key_summary AS
SELECT 
    ak.id,
    ak.api_key,
    ak.email,
    ak.usd_balance,
    ak.total_transactions,
    ak.successful_transactions,
    ak.is_active,
    ak.created_at,
    ak.last_used_at,
    COUNT(t.id) AS recent_transactions_7d,
    SUM(CASE WHEN t.status = 'completed' AND t.total_cost_usd IS NOT NULL THEN t.total_cost_usd ELSE 0 END) AS revenue_7d
FROM api_keys ak
LEFT JOIN transactions t ON ak.api_key COLLATE utf8mb4_0900_ai_ci = t.api_key AND t.created_at > DATE_SUB(NOW(), INTERVAL 7 DAY)
GROUP BY ak.id, ak.api_key, ak.email, ak.usd_balance, ak.total_transactions, 
         ak.successful_transactions, ak.is_active, ak.created_at, ak.last_used_at;

DROP VIEW IF EXISTS v_transaction_summary;
CREATE VIEW v_transaction_summary AS
SELECT 
    DATE(created_at) AS date,
    network,
    COUNT(*) AS total,
    SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed,
    SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed,
    AVG(gas_cost_usd) AS avg_gas_cost,
    SUM(COALESCE(total_cost_usd, 0)) AS total_revenue
FROM transactions
WHERE created_at > DATE_SUB(NOW(), INTERVAL 30 DAY)
GROUP BY DATE(created_at), network;

-- =============================================================================
-- 8. Insert test API key if not exists
-- =============================================================================

INSERT INTO api_keys (api_key, email, name, usd_balance, is_active) VALUES
    ('x402_test_demo123456789abcdef', 'demo@example.com', 'Demo API Key', 10.00, TRUE)
ON DUPLICATE KEY UPDATE usd_balance = 10.00;

-- =============================================================================
-- Done!
-- =============================================================================

SELECT 'Migration to v2.0 API Key model completed successfully!' AS status;
SELECT COUNT(*) AS api_key_count FROM api_keys;
SELECT COUNT(*) AS network_aliases_count FROM network_aliases;
