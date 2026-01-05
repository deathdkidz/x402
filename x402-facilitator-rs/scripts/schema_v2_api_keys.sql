-- =============================================================================
-- x402 Facilitator v2.0 - API Key Model Database Schema
-- =============================================================================
-- 
-- This schema replaces the old merchant model with a simpler API key model.
-- No wallet signatures required - just API keys with USD credit balances.
--
-- Run: mysql -u root -p x402_facilitator < schema_v2_api_keys.sql
-- =============================================================================

-- Ensure we're using the right database
USE x402_facilitator;

-- =============================================================================
-- 1. API KEYS TABLE
-- =============================================================================
-- Simple API keys with USD balances. No wallet/auth complexity.

CREATE TABLE IF NOT EXISTS api_keys (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    
    -- API key (format: x402_live_xxx or x402_test_xxx)
    api_key VARCHAR(64) NOT NULL UNIQUE,
    
    -- Optional owner info (for customer support only, not auth)
    email VARCHAR(255),
    name VARCHAR(255),
    
    -- USD credit balance (DECIMAL for precision)
    usd_balance DECIMAL(20, 10) NOT NULL DEFAULT 0.0000000000,
    lifetime_credits_purchased DECIMAL(20, 10) NOT NULL DEFAULT 0.0000000000,
    lifetime_credits_used DECIMAL(20, 10) NOT NULL DEFAULT 0.0000000000,
    
    -- Transaction counters
    total_transactions INT NOT NULL DEFAULT 0,
    successful_transactions INT NOT NULL DEFAULT 0,
    failed_transactions INT NOT NULL DEFAULT 0,
    
    -- Status
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    
    -- Timestamps
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    last_used_at TIMESTAMP NULL,
    expires_at TIMESTAMP NULL,
    
    -- Indexes
    INDEX idx_api_key (api_key),
    INDEX idx_email (email),
    INDEX idx_is_active (is_active),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================================
-- 2. TRANSACTIONS TABLE (Updated for API Key model)
-- =============================================================================

CREATE TABLE IF NOT EXISTS transactions (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    
    -- Link to API key (required)
    api_key VARCHAR(64) NOT NULL,
    
    -- Transaction details
    payer_address VARCHAR(42) NOT NULL,
    recipient_address VARCHAR(42) NOT NULL,
    network VARCHAR(64) NOT NULL,
    asset VARCHAR(42) NOT NULL,
    amount VARCHAR(78) NOT NULL,
    nonce VARCHAR(66) NOT NULL,
    
    -- Blockchain data
    transaction_hash VARCHAR(66),
    status ENUM('pending', 'preconfirmed', 'completed', 'failed', 'expired') NOT NULL DEFAULT 'pending',
    
    -- Validity window
    valid_after BIGINT,
    valid_before BIGINT,
    
    -- Resource info
    resource VARCHAR(512),
    description TEXT,
    
    -- Gas tracking
    gas_used BIGINT,
    effective_gas_price_wei BIGINT,
    gas_cost_native DECIMAL(36, 18),
    gas_cost_usd DECIMAL(20, 10),
    native_token_price_usd DECIMAL(20, 10),
    
    -- Cost tracking
    service_fee_usd DECIMAL(20, 10),
    total_cost_usd DECIMAL(20, 10),
    deduction_status ENUM('pending', 'deducted', 'failed') DEFAULT 'pending',
    deducted_at TIMESTAMP NULL,
    
    -- Timestamps
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    timeout_at TIMESTAMP NULL,
    
    -- Indexes
    INDEX idx_api_key (api_key),
    INDEX idx_payer (payer_address),
    INDEX idx_status (status),
    INDEX idx_network (network),
    INDEX idx_nonce (payer_address, nonce),
    INDEX idx_tx_hash (transaction_hash),
    INDEX idx_created (created_at),
    
    -- Foreign key (optional - allows orphaned transactions for simplicity)
    -- FOREIGN KEY (api_key) REFERENCES api_keys(api_key) ON DELETE SET NULL
    CONSTRAINT fk_transactions_api_key FOREIGN KEY (api_key) REFERENCES api_keys(api_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================================
-- 3. CREDIT PURCHASES TABLE
-- =============================================================================
-- Records of credit purchases (from Stripe, crypto, etc.)

CREATE TABLE IF NOT EXISTS credit_purchases (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    
    -- Link to API key
    api_key VARCHAR(64) NOT NULL,
    
    -- Purchase details
    usd_amount DECIMAL(20, 10) NOT NULL,
    payment_method ENUM('stripe', 'crypto', 'manual', 'referral', 'bonus') NOT NULL,
    payment_reference VARCHAR(255),
    
    -- Status
    status ENUM('pending', 'completed', 'failed', 'refunded') NOT NULL DEFAULT 'pending',
    
    -- Timestamps
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP NULL,
    
    -- Indexes
    INDEX idx_api_key (api_key),
    INDEX idx_status (status),
    INDEX idx_payment_ref (payment_reference),
    
    FOREIGN KEY (api_key) REFERENCES api_keys(api_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================================
-- 4. CREDIT LEDGER TABLE
-- =============================================================================
-- Audit trail of all balance changes

CREATE TABLE IF NOT EXISTS credit_ledger (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    
    -- Link to API key
    api_key_id BIGINT NOT NULL,
    
    -- Optional link to transaction
    transaction_id BIGINT,
    
    -- Entry type
    entry_type ENUM('purchase', 'service_fee', 'gas_cost', 'refund', 'adjustment', 'bonus') NOT NULL,
    
    -- Amount (positive for credits, negative for debits)
    amount DECIMAL(20, 10) NOT NULL,
    balance_before DECIMAL(20, 10) NOT NULL,
    balance_after DECIMAL(20, 10) NOT NULL,
    
    -- Description
    description VARCHAR(512),
    
    -- Timestamp
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    -- Indexes
    INDEX idx_api_key (api_key_id),
    INDEX idx_transaction (transaction_id),
    INDEX idx_entry_type (entry_type),
    INDEX idx_created (created_at),
    
    FOREIGN KEY (api_key_id) REFERENCES api_keys(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================================
-- 5. NATIVE TOKEN PRICES TABLE
-- =============================================================================
-- Cached prices for multi-token gas calculation

CREATE TABLE IF NOT EXISTS native_token_prices (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    
    symbol VARCHAR(10) NOT NULL,
    price_usd DECIMAL(20, 10) NOT NULL,
    source VARCHAR(32) NOT NULL,
    
    fetched_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL,
    
    UNIQUE KEY idx_symbol (symbol),
    INDEX idx_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Insert fallback prices
INSERT INTO native_token_prices (symbol, price_usd, source, expires_at) VALUES
    ('ETH', 2500.00, 'fallback', DATE_ADD(NOW(), INTERVAL 10 YEAR)),
    ('HYPE', 25.00, 'fallback', DATE_ADD(NOW(), INTERVAL 10 YEAR)),
    ('MATIC', 0.50, 'fallback', DATE_ADD(NOW(), INTERVAL 10 YEAR)),
    ('AVAX', 35.00, 'fallback', DATE_ADD(NOW(), INTERVAL 10 YEAR)),
    ('BNB', 600.00, 'fallback', DATE_ADD(NOW(), INTERVAL 10 YEAR))
ON DUPLICATE KEY UPDATE price_usd = VALUES(price_usd);

-- =============================================================================
-- 6. GAS STATS TABLE (For Analytics)
-- =============================================================================

CREATE TABLE IF NOT EXISTS gas_stats (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    
    network VARCHAR(64) NOT NULL,
    gas_price_gwei DOUBLE NOT NULL,
    gas_used BIGINT,
    native_cost DOUBLE,
    usd_cost DOUBLE,
    transaction_hash VARCHAR(66),
    
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    INDEX idx_network (network),
    INDEX idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================================
-- 7. TRANSACTION EVENTS (Audit Trail)
-- =============================================================================

CREATE TABLE IF NOT EXISTS transaction_events (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    
    transaction_id BIGINT NOT NULL,
    event_type VARCHAR(50) NOT NULL,
    old_status VARCHAR(20),
    new_status VARCHAR(20),
    metadata JSON,
    
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    INDEX idx_transaction (transaction_id),
    INDEX idx_event_type (event_type),
    INDEX idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================================
-- 8. WEBHOOK DELIVERIES (Optional - for future use)
-- =============================================================================

CREATE TABLE IF NOT EXISTS webhook_deliveries (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    
    api_key VARCHAR(64) NOT NULL,
    transaction_id BIGINT,
    delivery_id VARCHAR(64) NOT NULL UNIQUE,
    event_type VARCHAR(50) NOT NULL,
    webhook_url VARCHAR(512) NOT NULL,
    
    request_body TEXT,
    response_status INT,
    response_body TEXT,
    
    status ENUM('pending', 'delivered', 'retrying', 'failed') NOT NULL DEFAULT 'pending',
    attempts INT NOT NULL DEFAULT 0,
    error_message TEXT,
    
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_attempt_at TIMESTAMP NULL,
    completed_at TIMESTAMP NULL,
    
    INDEX idx_api_key (api_key),
    INDEX idx_delivery_id (delivery_id),
    INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================================
-- 9. NETWORK ALIASES TABLE (For CAIP-2 Support)
-- =============================================================================
-- Maps various network identifiers to canonical names

CREATE TABLE IF NOT EXISTS network_aliases (
    id INT AUTO_INCREMENT PRIMARY KEY,
    
    -- Canonical network name (matches config)
    canonical_name VARCHAR(64) NOT NULL,
    
    -- Alias (case-insensitive)
    alias VARCHAR(128) NOT NULL,
    
    -- Type of alias
    alias_type ENUM('name', 'chain_id', 'caip2', 'slug') NOT NULL,
    
    UNIQUE KEY idx_alias (alias),
    INDEX idx_canonical (canonical_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Insert network aliases
INSERT INTO network_aliases (canonical_name, alias, alias_type) VALUES
    -- Base Mainnet
    ('Base', 'base', 'slug'),
    ('Base', '8453', 'chain_id'),
    ('Base', 'eip155:8453', 'caip2'),
    ('Base', 'base mainnet', 'name'),
    ('Base', 'base-mainnet', 'name'),
    
    -- Ethereum Mainnet
    ('Ethereum', 'ethereum', 'slug'),
    ('Ethereum', 'eth', 'slug'),
    ('Ethereum', '1', 'chain_id'),
    ('Ethereum', 'eip155:1', 'caip2'),
    ('Ethereum', 'mainnet', 'name'),
    ('Ethereum', 'ethereum mainnet', 'name'),
    
    -- OP Mainnet
    ('OP Mainnet', 'optimism', 'slug'),
    ('OP Mainnet', 'op', 'slug'),
    ('OP Mainnet', '10', 'chain_id'),
    ('OP Mainnet', 'eip155:10', 'caip2'),
    ('OP Mainnet', 'op mainnet', 'name'),
    ('OP Mainnet', 'op-mainnet', 'name'),
    ('OP Mainnet', 'optimism mainnet', 'name'),
    
    -- HyperEVM Mainnet
    ('HyperEVM', 'hyperevm', 'slug'),
    ('HyperEVM', 'hyperliquid', 'slug'),
    ('HyperEVM', '999', 'chain_id'),
    ('HyperEVM', 'eip155:999', 'caip2'),
    
    -- Base Sepolia
    ('Base Sepolia', 'base sepolia', 'name'),
    ('Base Sepolia', 'base-sepolia', 'name'),
    ('Base Sepolia', 'basesepolia', 'slug'),
    ('Base Sepolia', '84532', 'chain_id'),
    ('Base Sepolia', 'eip155:84532', 'caip2'),
    
    -- Ethereum Sepolia
    ('Ethereum Sepolia', 'ethereum sepolia', 'name'),
    ('Ethereum Sepolia', 'eth-sepolia', 'name'),
    ('Ethereum Sepolia', 'eth sepolia', 'name'),
    ('Ethereum Sepolia', 'sepolia', 'slug'),
    ('Ethereum Sepolia', '11155111', 'chain_id'),
    ('Ethereum Sepolia', 'eip155:11155111', 'caip2'),
    
    -- OP Sepolia
    ('OP Sepolia', 'op sepolia', 'name'),
    ('OP Sepolia', 'op-sepolia', 'name'),
    ('OP Sepolia', 'optimism sepolia', 'name'),
    ('OP Sepolia', 'optimism-sepolia', 'name'),
    ('OP Sepolia', '11155420', 'chain_id'),
    ('OP Sepolia', 'eip155:11155420', 'caip2'),
    
    -- HyperEVM Testnet
    ('HyperEVM Testnet', 'hyperevm testnet', 'name'),
    ('HyperEVM Testnet', 'hyperevm-testnet', 'name'),
    ('HyperEVM Testnet', 'hyperliquid testnet', 'name'),
    ('HyperEVM Testnet', '998', 'chain_id'),
    ('HyperEVM Testnet', 'eip155:998', 'caip2'),
    
    -- Arbitrum
    ('Arbitrum', 'arbitrum', 'slug'),
    ('Arbitrum', 'arb', 'slug'),
    ('Arbitrum', '42161', 'chain_id'),
    ('Arbitrum', 'eip155:42161', 'caip2'),
    ('Arbitrum', 'arbitrum one', 'name'),
    ('Arbitrum', 'arbitrum-one', 'name'),
    
    -- Polygon
    ('Polygon', 'polygon', 'slug'),
    ('Polygon', 'matic', 'slug'),
    ('Polygon', '137', 'chain_id'),
    ('Polygon', 'eip155:137', 'caip2'),
    ('Polygon', 'polygon mainnet', 'name')
ON DUPLICATE KEY UPDATE canonical_name = VALUES(canonical_name);

-- =============================================================================
-- STORED PROCEDURES
-- =============================================================================

-- Atomic credit deduction with overdraft protection
DELIMITER //
CREATE PROCEDURE IF NOT EXISTS deduct_credits(
    IN p_api_key_id BIGINT,
    IN p_amount DECIMAL(20, 10),
    IN p_transaction_id BIGINT,
    IN p_entry_type VARCHAR(20),
    IN p_description VARCHAR(512)
)
BEGIN
    DECLARE v_current_balance DECIMAL(20, 10);
    DECLARE v_new_balance DECIMAL(20, 10);
    
    -- Get current balance with lock
    SELECT usd_balance INTO v_current_balance 
    FROM api_keys 
    WHERE id = p_api_key_id 
    FOR UPDATE;
    
    -- Check sufficient funds
    IF v_current_balance < p_amount THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Insufficient credits';
    END IF;
    
    -- Calculate new balance
    SET v_new_balance = v_current_balance - p_amount;
    
    -- Update balance
    UPDATE api_keys 
    SET usd_balance = v_new_balance,
        lifetime_credits_used = lifetime_credits_used + p_amount,
        last_used_at = NOW()
    WHERE id = p_api_key_id;
    
    -- Log ledger entry
    INSERT INTO credit_ledger (api_key_id, transaction_id, entry_type, amount, balance_before, balance_after, description)
    VALUES (p_api_key_id, p_transaction_id, p_entry_type, -p_amount, v_current_balance, v_new_balance, p_description);
    
    -- Return new balance
    SELECT v_new_balance AS new_balance;
END //
DELIMITER ;

-- Add credits procedure
DELIMITER //
CREATE PROCEDURE IF NOT EXISTS add_credits(
    IN p_api_key_id BIGINT,
    IN p_amount DECIMAL(20, 10),
    IN p_entry_type VARCHAR(20),
    IN p_description VARCHAR(512)
)
BEGIN
    DECLARE v_current_balance DECIMAL(20, 10);
    DECLARE v_new_balance DECIMAL(20, 10);
    
    -- Get current balance with lock
    SELECT usd_balance INTO v_current_balance 
    FROM api_keys 
    WHERE id = p_api_key_id 
    FOR UPDATE;
    
    -- Calculate new balance
    SET v_new_balance = v_current_balance + p_amount;
    
    -- Update balance
    UPDATE api_keys 
    SET usd_balance = v_new_balance,
        lifetime_credits_purchased = lifetime_credits_purchased + p_amount
    WHERE id = p_api_key_id;
    
    -- Log ledger entry
    INSERT INTO credit_ledger (api_key_id, entry_type, amount, balance_before, balance_after, description)
    VALUES (p_api_key_id, p_entry_type, p_amount, v_current_balance, v_new_balance, p_description);
    
    -- Return new balance
    SELECT v_new_balance AS new_balance;
END //
DELIMITER ;

-- =============================================================================
-- VIEWS
-- =============================================================================

-- API Key summary view
CREATE OR REPLACE VIEW v_api_key_summary AS
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
    SUM(CASE WHEN t.status = 'completed' THEN t.total_cost_usd ELSE 0 END) AS revenue_7d
FROM api_keys ak
LEFT JOIN transactions t ON ak.api_key = t.api_key AND t.created_at > DATE_SUB(NOW(), INTERVAL 7 DAY)
GROUP BY ak.id;

-- Transaction summary view
CREATE OR REPLACE VIEW v_transaction_summary AS
SELECT 
    DATE(created_at) AS date,
    network,
    COUNT(*) AS total,
    SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed,
    SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed,
    AVG(gas_cost_usd) AS avg_gas_cost,
    SUM(total_cost_usd) AS total_revenue
FROM transactions
WHERE created_at > DATE_SUB(NOW(), INTERVAL 30 DAY)
GROUP BY DATE(created_at), network
ORDER BY date DESC, network;

-- =============================================================================
-- Initial test API key (remove in production)
-- =============================================================================

INSERT INTO api_keys (api_key, email, name, usd_balance, is_active) VALUES
    ('x402_test_demo123456789abcdef', 'demo@example.com', 'Demo API Key', 10.00, TRUE)
ON DUPLICATE KEY UPDATE usd_balance = 10.00;

SELECT 'Schema v2 API Keys migration completed!' AS status;
