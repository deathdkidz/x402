-- =============================================================================
-- GAS-ACCURATE BILLING SCHEMA UPDATE
-- =============================================================================
-- 
-- This migration adds support for precise USD credit balances with actual gas cost
-- deduction. Replaces the integer credit system with precise decimal tracking.
--
-- Run with: sudo mysql x402_facilitator < scripts/schema_gas_accurate_billing.sql
-- =============================================================================

USE x402_facilitator;

-- =============================================================================
-- STEP 1: Add decimal credit columns to merchants
-- =============================================================================

-- Add USD-based decimal credit balance (precision: 10 decimal places for calculation, display 4)
SET @add_usd_credit = (
    SELECT IF(
        (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS 
         WHERE TABLE_SCHEMA='x402_facilitator' AND TABLE_NAME='merchants' AND COLUMN_NAME='usd_credit_balance') = 0,
        'ALTER TABLE merchants ADD COLUMN usd_credit_balance DECIMAL(20, 10) NOT NULL DEFAULT 0.0000000000',
        'SELECT 1'
    )
);
PREPARE stmt FROM @add_usd_credit;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Add lifetime USD credits purchased
SET @add_lifetime_usd = (
    SELECT IF(
        (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS 
         WHERE TABLE_SCHEMA='x402_facilitator' AND TABLE_NAME='merchants' AND COLUMN_NAME='lifetime_usd_credits_purchased') = 0,
        'ALTER TABLE merchants ADD COLUMN lifetime_usd_credits_purchased DECIMAL(20, 10) NOT NULL DEFAULT 0.0000000000',
        'SELECT 1'
    )
);
PREPARE stmt FROM @add_lifetime_usd;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Add lifetime USD credits used
SET @add_lifetime_used = (
    SELECT IF(
        (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS 
         WHERE TABLE_SCHEMA='x402_facilitator' AND TABLE_NAME='merchants' AND COLUMN_NAME='lifetime_usd_credits_used') = 0,
        'ALTER TABLE merchants ADD COLUMN lifetime_usd_credits_used DECIMAL(20, 10) NOT NULL DEFAULT 0.0000000000',
        'SELECT 1'
    )
);
PREPARE stmt FROM @add_lifetime_used;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Create index for USD credit balance lookups
SET @add_usd_index = (
    SELECT IF(
        (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS 
         WHERE TABLE_SCHEMA='x402_facilitator' AND TABLE_NAME='merchants' AND INDEX_NAME='idx_usd_credit_balance') = 0,
        'CREATE INDEX idx_usd_credit_balance ON merchants(usd_credit_balance)',
        'SELECT 1'
    )
);
PREPARE stmt FROM @add_usd_index;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- =============================================================================
-- STEP 2: Add gas cost tracking to transactions
-- =============================================================================

-- Add gas_used column
SET @add_gas_used = (
    SELECT IF(
        (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS 
         WHERE TABLE_SCHEMA='x402_facilitator' AND TABLE_NAME='transactions' AND COLUMN_NAME='gas_used') = 0,
        'ALTER TABLE transactions ADD COLUMN gas_used BIGINT UNSIGNED',
        'SELECT 1'
    )
);
PREPARE stmt FROM @add_gas_used;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Add effective gas price (in wei)
SET @add_gas_price = (
    SELECT IF(
        (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS 
         WHERE TABLE_SCHEMA='x402_facilitator' AND TABLE_NAME='transactions' AND COLUMN_NAME='effective_gas_price_wei') = 0,
        'ALTER TABLE transactions ADD COLUMN effective_gas_price_wei BIGINT UNSIGNED',
        'SELECT 1'
    )
);
PREPARE stmt FROM @add_gas_price;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Add gas cost in ETH (precise)
SET @add_gas_eth = (
    SELECT IF(
        (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS 
         WHERE TABLE_SCHEMA='x402_facilitator' AND TABLE_NAME='transactions' AND COLUMN_NAME='gas_cost_eth') = 0,
        'ALTER TABLE transactions ADD COLUMN gas_cost_eth DECIMAL(36, 18)',
        'SELECT 1'
    )
);
PREPARE stmt FROM @add_gas_eth;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Add gas cost in USD (precise - 10 decimals for calculation)
SET @add_gas_usd = (
    SELECT IF(
        (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS 
         WHERE TABLE_SCHEMA='x402_facilitator' AND TABLE_NAME='transactions' AND COLUMN_NAME='gas_cost_usd') = 0,
        'ALTER TABLE transactions ADD COLUMN gas_cost_usd DECIMAL(20, 10)',
        'SELECT 1'
    )
);
PREPARE stmt FROM @add_gas_usd;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Add ETH/USD price used for conversion
SET @add_eth_price = (
    SELECT IF(
        (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS 
         WHERE TABLE_SCHEMA='x402_facilitator' AND TABLE_NAME='transactions' AND COLUMN_NAME='eth_usd_price') = 0,
        'ALTER TABLE transactions ADD COLUMN eth_usd_price DECIMAL(20, 10)',
        'SELECT 1'
    )
);
PREPARE stmt FROM @add_eth_price;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Add service fee (fixed per transaction - e.g., $0.001)
SET @add_service_fee = (
    SELECT IF(
        (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS 
         WHERE TABLE_SCHEMA='x402_facilitator' AND TABLE_NAME='transactions' AND COLUMN_NAME='service_fee_usd') = 0,
        'ALTER TABLE transactions ADD COLUMN service_fee_usd DECIMAL(20, 10) NOT NULL DEFAULT 0.0010000000',
        'SELECT 1'
    )
);
PREPARE stmt FROM @add_service_fee;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Add total deducted amount (service_fee + gas_cost)
SET @add_total_deducted = (
    SELECT IF(
        (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS 
         WHERE TABLE_SCHEMA='x402_facilitator' AND TABLE_NAME='transactions' AND COLUMN_NAME='total_usd_deducted') = 0,
        'ALTER TABLE transactions ADD COLUMN total_usd_deducted DECIMAL(20, 10)',
        'SELECT 1'
    )
);
PREPARE stmt FROM @add_total_deducted;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Add gas deduction status
SET @add_deduction_status = (
    SELECT IF(
        (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS 
         WHERE TABLE_SCHEMA='x402_facilitator' AND TABLE_NAME='transactions' AND COLUMN_NAME='deduction_status') = 0,
        'ALTER TABLE transactions ADD COLUMN deduction_status ENUM(''pending'', ''deducted'', ''failed'', ''refunded'') DEFAULT ''pending''',
        'SELECT 1'
    )
);
PREPARE stmt FROM @add_deduction_status;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Add deduction timestamp
SET @add_deducted_at = (
    SELECT IF(
        (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS 
         WHERE TABLE_SCHEMA='x402_facilitator' AND TABLE_NAME='transactions' AND COLUMN_NAME='deducted_at') = 0,
        'ALTER TABLE transactions ADD COLUMN deducted_at TIMESTAMP NULL',
        'SELECT 1'
    )
);
PREPARE stmt FROM @add_deducted_at;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Create index for pending deductions
SET @add_deduction_index = (
    SELECT IF(
        (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS 
         WHERE TABLE_SCHEMA='x402_facilitator' AND TABLE_NAME='transactions' AND INDEX_NAME='idx_deduction_status') = 0,
        'CREATE INDEX idx_deduction_status ON transactions(deduction_status, status)',
        'SELECT 1'
    )
);
PREPARE stmt FROM @add_deduction_index;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- =============================================================================
-- STEP 3: Create USD credit transactions table (for precise tracking)
-- =============================================================================

CREATE TABLE IF NOT EXISTS usd_credit_transactions (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    
    -- Relations
    merchant_id BIGINT NOT NULL,
    transaction_id BIGINT,
    
    -- Transaction Type
    type ENUM(
        'purchase',           -- Credit purchase (crypto payment)
        'service_fee',        -- Fixed per-transaction fee
        'gas_deduction',      -- Gas cost deduction
        'refund',             -- Refund for failed transaction
        'bonus',              -- Bonus credits
        'adjustment'          -- Manual adjustment
    ) NOT NULL,
    
    -- Amounts (10 decimal precision for calculation accuracy)
    amount DECIMAL(20, 10) NOT NULL,          -- Positive for credit, negative for debit
    balance_before DECIMAL(20, 10) NOT NULL,
    balance_after DECIMAL(20, 10) NOT NULL,
    
    -- Reference
    reference_type VARCHAR(50),
    reference_id VARCHAR(100),
    
    -- Gas-specific metadata (populated for gas_deduction type)
    gas_used BIGINT UNSIGNED,
    gas_price_wei BIGINT UNSIGNED,
    gas_cost_eth DECIMAL(36, 18),
    eth_usd_price DECIMAL(20, 10),
    
    -- Metadata
    description VARCHAR(500),
    metadata JSON,
    
    -- Timestamps
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    -- Indexes
    INDEX idx_merchant_usd_credits (merchant_id, created_at DESC),
    INDEX idx_type (type, created_at DESC),
    INDEX idx_transaction_ref (transaction_id),
    
    -- Foreign Keys
    FOREIGN KEY (merchant_id) REFERENCES merchants(id) ON DELETE RESTRICT,
    FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- =============================================================================
-- STEP 4: Create ETH price cache table (for gas cost conversion)
-- =============================================================================

CREATE TABLE IF NOT EXISTS eth_price_cache (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    
    -- Price Data
    source VARCHAR(50) NOT NULL DEFAULT 'coinmarketcap',
    eth_usd_price DECIMAL(20, 10) NOT NULL,
    
    -- Metadata
    raw_response JSON,
    
    -- Timestamps
    fetched_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL,
    
    -- Indexes
    INDEX idx_expires (expires_at),
    INDEX idx_source_time (source, fetched_at DESC)
) ENGINE=InnoDB;

-- Insert initial fallback price (will be updated by price feed)
INSERT IGNORE INTO eth_price_cache (source, eth_usd_price, expires_at)
VALUES ('fallback', 3500.0000000000, DATE_ADD(NOW(), INTERVAL 1 YEAR));

-- =============================================================================
-- STEP 5: Create pending gas deductions queue table
-- =============================================================================

CREATE TABLE IF NOT EXISTS pending_gas_deductions (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    
    -- Relations
    transaction_id BIGINT NOT NULL UNIQUE,
    merchant_id BIGINT NOT NULL,
    
    -- Transaction Info
    transaction_hash VARCHAR(66) NOT NULL,
    network VARCHAR(50) NOT NULL,
    
    -- Service Fee (known immediately)
    service_fee_usd DECIMAL(20, 10) NOT NULL DEFAULT 0.0010000000,
    
    -- Status
    status ENUM('queued', 'processing', 'completed', 'failed', 'expired') NOT NULL DEFAULT 'queued',
    retry_count INT NOT NULL DEFAULT 0,
    max_retries INT NOT NULL DEFAULT 10,
    
    -- Error Tracking
    last_error TEXT,
    
    -- Timestamps
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    completed_at TIMESTAMP NULL,
    next_retry_at TIMESTAMP NULL,
    
    -- Indexes
    INDEX idx_status_retry (status, next_retry_at),
    INDEX idx_merchant (merchant_id),
    INDEX idx_tx_hash (transaction_hash),
    
    -- Foreign Keys
    FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE CASCADE,
    FOREIGN KEY (merchant_id) REFERENCES merchants(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

-- =============================================================================
-- STEP 6: Migrate existing credit balances (one-time)
-- =============================================================================
-- Convert integer credits to USD (1 credit = $0.01)
-- Only run this if usd_credit_balance is still 0

UPDATE merchants 
SET usd_credit_balance = credit_balance * 0.01,
    lifetime_usd_credits_purchased = lifetime_credits_purchased * 0.01,
    lifetime_usd_credits_used = lifetime_credits_used * 0.01
WHERE usd_credit_balance = 0 AND credit_balance > 0;

-- =============================================================================
-- STEP 7: Create views for analytics
-- =============================================================================

-- View: Merchant USD balance summary
CREATE OR REPLACE VIEW v_merchant_usd_balance AS
SELECT 
    m.id AS merchant_id,
    m.auth_address,
    m.business_name,
    m.usd_credit_balance,
    m.lifetime_usd_credits_purchased,
    m.lifetime_usd_credits_used,
    ROUND(m.usd_credit_balance, 4) AS display_balance,
    (SELECT COUNT(*) FROM transactions t WHERE t.merchant_id = m.id AND t.status = 'completed') AS total_transactions,
    (SELECT COALESCE(SUM(total_usd_deducted), 0) FROM transactions t WHERE t.merchant_id = m.id AND t.deduction_status = 'deducted') AS total_deducted
FROM merchants m
WHERE m.is_active = 1;

-- View: Gas cost analytics by network
CREATE OR REPLACE VIEW v_gas_cost_analytics AS
SELECT 
    network,
    DATE(created_at) AS date,
    COUNT(*) AS transaction_count,
    AVG(gas_used) AS avg_gas_used,
    AVG(effective_gas_price_wei / 1000000000) AS avg_gas_price_gwei,
    AVG(gas_cost_usd) AS avg_gas_cost_usd,
    SUM(gas_cost_usd) AS total_gas_cost_usd,
    AVG(eth_usd_price) AS avg_eth_price
FROM transactions
WHERE gas_used IS NOT NULL 
  AND status = 'completed'
  AND deduction_status = 'deducted'
GROUP BY network, DATE(created_at)
ORDER BY date DESC, network;

-- View: Pending deductions summary
CREATE OR REPLACE VIEW v_pending_deductions AS
SELECT 
    pgd.id,
    pgd.transaction_id,
    pgd.merchant_id,
    m.auth_address,
    pgd.transaction_hash,
    pgd.network,
    pgd.service_fee_usd,
    pgd.status,
    pgd.retry_count,
    pgd.last_error,
    pgd.created_at,
    pgd.next_retry_at,
    TIMESTAMPDIFF(MINUTE, pgd.created_at, NOW()) AS minutes_pending
FROM pending_gas_deductions pgd
JOIN merchants m ON m.id = pgd.merchant_id
WHERE pgd.status IN ('queued', 'processing')
ORDER BY pgd.created_at ASC;

-- =============================================================================
-- DONE
-- =============================================================================

SELECT 'Gas-accurate billing schema migration completed successfully!' AS status;
