-- ============================================================
-- x402 Facilitator Database Migration
-- From: Tiered Merchant Model
-- To: Settlement Credit Model
-- ============================================================

-- Run this migration in a transaction
START TRANSACTION;

-- ============================================================
-- STEP 1: Backup existing data (recommended before running)
-- ============================================================
-- CREATE TABLE merchants_backup AS SELECT * FROM merchants;
-- CREATE TABLE transactions_backup AS SELECT * FROM transactions;

-- ============================================================
-- STEP 2: Create new tables
-- ============================================================

-- Credit Transactions (tracks all credit movements)
CREATE TABLE IF NOT EXISTS credit_transactions (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    merchant_id BIGINT NOT NULL,
    
    -- Transaction Type
    type ENUM('purchase', 'settlement_fee', 'refund', 'bonus', 'adjustment', 'migration') NOT NULL,
    
    -- Amounts
    amount DECIMAL(18,6) NOT NULL,
    balance_before DECIMAL(18,6) NOT NULL,
    balance_after DECIMAL(18,6) NOT NULL,
    
    -- Reference
    reference_type VARCHAR(50),
    reference_id VARCHAR(100),
    
    -- Metadata
    description VARCHAR(255),
    metadata JSON,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    INDEX idx_merchant_credits (merchant_id, created_at DESC),
    INDEX idx_type (type, created_at DESC)
) ENGINE=InnoDB;

-- Credit Purchases (blockchain monitoring)
CREATE TABLE IF NOT EXISTS credit_purchases (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    merchant_id BIGINT NOT NULL,
    
    -- Blockchain Info
    network VARCHAR(20) NOT NULL,
    tx_hash VARCHAR(66) UNIQUE NOT NULL,
    block_number BIGINT NOT NULL,
    from_address VARCHAR(42) NOT NULL,
    
    -- Amount
    token_address VARCHAR(42) NOT NULL,
    token_amount DECIMAL(36,18) NOT NULL,
    credit_amount DECIMAL(18,6) NOT NULL,
    bonus_credits DECIMAL(18,6) DEFAULT 0,
    
    -- Status
    status ENUM('pending', 'confirmed', 'failed') DEFAULT 'pending',
    confirmations INT DEFAULT 0,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    confirmed_at TIMESTAMP,
    
    INDEX idx_tx_hash (tx_hash),
    INDEX idx_status (status),
    INDEX idx_merchant_purchases (merchant_id, created_at DESC)
) ENGINE=InnoDB;

-- Merchant Resources (for marketplace)
CREATE TABLE IF NOT EXISTS merchant_resources (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    merchant_id BIGINT NOT NULL,
    
    -- Resource Info
    resource_id VARCHAR(64) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    endpoint_url VARCHAR(500) NOT NULL,
    
    -- Pricing
    price_per_call DECIMAL(18,6) NOT NULL DEFAULT 1.0,
    
    -- Supported Networks/Tokens
    supported_networks JSON NOT NULL DEFAULT '["base"]',
    supported_tokens JSON NOT NULL DEFAULT '["USDC"]',
    
    -- Metadata
    category VARCHAR(50),
    tags JSON,
    documentation_url VARCHAR(500),
    
    -- Stats
    total_calls BIGINT DEFAULT 0,
    total_revenue DECIMAL(18,6) DEFAULT 0,
    avg_response_time_ms INT,
    
    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    is_marketplace_visible BOOLEAN DEFAULT FALSE,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    INDEX idx_resource_merchant (merchant_id),
    INDEX idx_resource_category (category, is_marketplace_visible),
    INDEX idx_resource_id (resource_id)
) ENGINE=InnoDB;

-- Paymasters (admin managed gas wallets)
CREATE TABLE IF NOT EXISTS paymasters (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    
    -- Identity (no private key stored - use env vars or KMS)
    address VARCHAR(42) UNIQUE NOT NULL,
    name VARCHAR(50),
    
    -- Networks this paymaster operates on
    networks JSON NOT NULL DEFAULT '["base"]',
    
    -- Balance Tracking
    last_known_balance DECIMAL(36,18),
    last_balance_check TIMESTAMP,
    low_balance_threshold DECIMAL(36,18) DEFAULT 0.1,
    
    -- Stats
    total_transactions BIGINT DEFAULT 0,
    total_gas_spent DECIMAL(36,18) DEFAULT 0,
    
    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    priority INT DEFAULT 0,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    INDEX idx_active_priority (is_active, priority DESC)
) ENGINE=InnoDB;

-- Admin Users
CREATE TABLE IF NOT EXISTS admin_users (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role ENUM('super_admin', 'admin', 'viewer') DEFAULT 'viewer',
    
    -- 2FA
    totp_secret VARCHAR(32),
    totp_enabled BOOLEAN DEFAULT FALSE,
    
    -- Session tracking
    last_login_at TIMESTAMP,
    last_login_ip VARCHAR(45),
    failed_login_attempts INT DEFAULT 0,
    locked_until TIMESTAMP,
    
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    INDEX idx_username (username),
    INDEX idx_email (email)
) ENGINE=InnoDB;

-- Audit Log
CREATE TABLE IF NOT EXISTS audit_log (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    admin_id BIGINT,
    
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(50),
    entity_id VARCHAR(100),
    
    old_value JSON,
    new_value JSON,
    
    ip_address VARCHAR(45),
    user_agent TEXT,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    INDEX idx_admin_actions (admin_id, created_at DESC),
    INDEX idx_entity (entity_type, entity_id),
    INDEX idx_action_time (action, created_at DESC)
) ENGINE=InnoDB;

-- System Metrics (for monitoring dashboard)
CREATE TABLE IF NOT EXISTS system_metrics (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    
    metric_name VARCHAR(50) NOT NULL,
    metric_value DECIMAL(18,6) NOT NULL,
    tags JSON,
    
    recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    INDEX idx_metric_time (metric_name, recorded_at DESC)
) ENGINE=InnoDB;

-- Merchant Analytics (pre-aggregated for dashboard)
CREATE TABLE IF NOT EXISTS merchant_analytics_daily (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    merchant_id BIGINT NOT NULL,
    date DATE NOT NULL,
    
    -- Settlement Stats
    total_settlements INT DEFAULT 0,
    successful_settlements INT DEFAULT 0,
    failed_settlements INT DEFAULT 0,
    
    -- Volume
    total_volume_usd DECIMAL(18,6) DEFAULT 0,
    
    -- By Network
    volume_by_network JSON,
    
    -- By Token
    volume_by_token JSON,
    
    -- Credits
    credits_used DECIMAL(18,6) DEFAULT 0,
    credits_purchased DECIMAL(18,6) DEFAULT 0,
    
    -- API Usage
    verify_requests INT DEFAULT 0,
    settle_requests INT DEFAULT 0,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    UNIQUE KEY uk_merchant_date (merchant_id, date),
    INDEX idx_date (date)
) ENGINE=InnoDB;

-- ============================================================
-- STEP 3: Modify merchants table
-- ============================================================

-- Add new columns
ALTER TABLE merchants 
    ADD COLUMN IF NOT EXISTS merchant_id VARCHAR(32) UNIQUE AFTER id,
    ADD COLUMN IF NOT EXISTS api_key_hash VARCHAR(64) AFTER api_key,
    ADD COLUMN IF NOT EXISTS api_key_issued_at BIGINT AFTER api_key_hash,
    ADD COLUMN IF NOT EXISTS description TEXT AFTER business_name,
    ADD COLUMN IF NOT EXISTS website_url VARCHAR(255) AFTER description,
    ADD COLUMN IF NOT EXISTS logo_url VARCHAR(255) AFTER website_url,
    ADD COLUMN IF NOT EXISTS contact_email VARCHAR(255) AFTER logo_url,
    ADD COLUMN IF NOT EXISTS credit_balance DECIMAL(18,6) DEFAULT 0 AFTER contact_email,
    ADD COLUMN IF NOT EXISTS lifetime_credits_purchased DECIMAL(18,6) DEFAULT 0 AFTER credit_balance,
    ADD COLUMN IF NOT EXISTS lifetime_credits_used DECIMAL(18,6) DEFAULT 0 AFTER lifetime_credits_purchased,
    ADD COLUMN IF NOT EXISTS is_marketplace_visible BOOLEAN DEFAULT FALSE AFTER lifetime_credits_used,
    ADD COLUMN IF NOT EXISTS marketplace_category VARCHAR(50) AFTER is_marketplace_visible,
    ADD COLUMN IF NOT EXISTS marketplace_tags JSON AFTER marketplace_category,
    ADD COLUMN IF NOT EXISTS status ENUM('pending', 'active', 'suspended', 'banned') DEFAULT 'active' AFTER is_active,
    ADD COLUMN IF NOT EXISTS status_reason VARCHAR(255) AFTER status,
    ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMP AFTER status_reason;

-- Rename transactions table to settlements for clarity (optional, or create new)
-- For safety, we'll create a new settlements table and keep old one

CREATE TABLE IF NOT EXISTS settlements (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    settlement_id VARCHAR(64) UNIQUE NOT NULL,
    merchant_id BIGINT NOT NULL,
    
    -- Payment Details
    network VARCHAR(20) NOT NULL,
    token_address VARCHAR(42) NOT NULL,
    payer_address VARCHAR(42) NOT NULL,
    recipient_address VARCHAR(42) NOT NULL,
    amount DECIMAL(36,18) NOT NULL,
    
    -- Authorization
    nonce VARCHAR(66) NOT NULL,
    valid_after BIGINT NOT NULL,
    valid_before BIGINT NOT NULL,
    signature VARCHAR(132) NOT NULL,
    
    -- Resource
    resource_id VARCHAR(64),
    resource_url VARCHAR(500),
    
    -- Execution
    tx_hash VARCHAR(66),
    block_number BIGINT,
    gas_used BIGINT,
    gas_price BIGINT,
    
    -- Cost
    credit_cost DECIMAL(18,6) NOT NULL DEFAULT 1.0,
    gas_cost_usd DECIMAL(18,6),
    
    -- Status
    status ENUM('pending', 'preconfirmed', 'confirmed', 'failed', 'expired') DEFAULT 'pending',
    error_message TEXT,
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    submitted_at TIMESTAMP,
    confirmed_at TIMESTAMP,
    
    INDEX idx_settlement_id (settlement_id),
    INDEX idx_merchant_settlements (merchant_id, created_at DESC),
    INDEX idx_status (status),
    INDEX idx_network_status (network, status),
    INDEX idx_payer_nonce (payer_address, nonce),
    INDEX idx_tx_hash (tx_hash)
) ENGINE=InnoDB;

-- ============================================================
-- STEP 4: Migrate existing data
-- ============================================================

-- Generate merchant_id for existing merchants
UPDATE merchants 
SET merchant_id = CONCAT('m_', LOWER(SUBSTRING(MD5(CONCAT(id, auth_address)), 1, 12)))
WHERE merchant_id IS NULL;

-- Set status based on is_active
UPDATE merchants 
SET status = CASE 
    WHEN is_active = 1 THEN 'active' 
    ELSE 'suspended' 
END
WHERE status IS NULL OR status = '';

-- Give existing merchants starting credits based on their tier
UPDATE merchants SET 
    credit_balance = CASE 
        WHEN tier = 'free' THEN 100
        WHEN tier = 'basic' THEN 500
        WHEN tier = 'pro' THEN 2000
        WHEN tier = 'enterprise' THEN 10000
        ELSE 100
    END,
    lifetime_credits_purchased = CASE 
        WHEN tier = 'free' THEN 100
        WHEN tier = 'basic' THEN 500
        WHEN tier = 'pro' THEN 2000
        WHEN tier = 'enterprise' THEN 10000
        ELSE 100
    END
WHERE credit_balance = 0 OR credit_balance IS NULL;

-- Log migration credits
INSERT INTO credit_transactions (merchant_id, type, amount, balance_before, balance_after, reference_type, description)
SELECT 
    id,
    'migration',
    credit_balance,
    0,
    credit_balance,
    'tier_migration',
    CONCAT('Migration from tier: ', COALESCE(tier, 'free'))
FROM merchants
WHERE credit_balance > 0;

-- Migrate existing transactions to settlements table
INSERT INTO settlements (
    settlement_id,
    merchant_id,
    network,
    token_address,
    payer_address,
    recipient_address,
    amount,
    nonce,
    valid_after,
    valid_before,
    signature,
    resource_url,
    tx_hash,
    credit_cost,
    status,
    created_at
)
SELECT 
    CONCAT('stl_', LOWER(SUBSTRING(MD5(CONCAT(id, nonce)), 1, 16))),
    merchant_id,
    network,
    asset,
    payer_address,
    merchant_address,
    CAST(amount AS DECIMAL(36,18)),
    nonce,
    CAST(valid_after AS BIGINT),
    CAST(valid_before AS BIGINT),
    '',  -- signature not stored in old schema
    resource,
    transaction_hash,
    1.0,  -- default credit cost
    CASE status
        WHEN 'pending' THEN 'pending'
        WHEN 'preconfirmed' THEN 'preconfirmed'
        WHEN 'completed' THEN 'confirmed'
        WHEN 'failed' THEN 'failed'
        ELSE 'pending'
    END,
    created_at
FROM transactions
WHERE NOT EXISTS (
    SELECT 1 FROM settlements s 
    WHERE s.tx_hash = transactions.transaction_hash
);

-- ============================================================
-- STEP 5: Create views
-- ============================================================

-- Active merchants view
CREATE OR REPLACE VIEW v_active_merchants AS
SELECT 
    m.*,
    (SELECT COUNT(*) FROM settlements s WHERE s.merchant_id = m.id AND s.created_at > DATE_SUB(NOW(), INTERVAL 24 HOUR)) as settlements_24h,
    (SELECT SUM(amount) FROM settlements s WHERE s.merchant_id = m.id AND s.status = 'confirmed' AND s.created_at > DATE_SUB(NOW(), INTERVAL 24 HOUR)) as volume_24h
FROM merchants m
WHERE m.status = 'active';

-- Marketplace listings view
CREATE OR REPLACE VIEW v_marketplace_listings AS
SELECT 
    mr.*,
    m.business_name,
    m.logo_url as merchant_logo,
    m.description as merchant_description,
    m.auth_address as merchant_address
FROM merchant_resources mr
JOIN merchants m ON mr.merchant_id = m.id
WHERE mr.is_marketplace_visible = TRUE 
    AND mr.is_active = TRUE 
    AND m.is_marketplace_visible = TRUE
    AND m.status = 'active';

-- Low balance paymasters view
CREATE OR REPLACE VIEW v_low_balance_paymasters AS
SELECT * FROM paymasters
WHERE is_active = TRUE 
    AND last_known_balance IS NOT NULL 
    AND last_known_balance < low_balance_threshold;

-- ============================================================
-- STEP 6: Add indexes for new queries
-- ============================================================

-- For API key lookup (if still using DB fallback)
CREATE INDEX IF NOT EXISTS idx_merchants_api_key ON merchants(api_key);
CREATE INDEX IF NOT EXISTS idx_merchants_merchant_id ON merchants(merchant_id);
CREATE INDEX IF NOT EXISTS idx_merchants_status ON merchants(status);
CREATE INDEX IF NOT EXISTS idx_merchants_marketplace ON merchants(is_marketplace_visible, marketplace_category);
CREATE INDEX IF NOT EXISTS idx_merchants_business_name ON merchants(business_name);

-- ============================================================
-- STEP 7: Drop deprecated columns (DO THIS AFTER VERIFICATION)
-- ============================================================
-- WARNING: Only run these after confirming migration is successful!
-- 
-- ALTER TABLE merchants DROP COLUMN private_key;
-- ALTER TABLE merchants DROP COLUMN tier;
-- ALTER TABLE merchants DROP COLUMN verify_limit;
-- ALTER TABLE merchants DROP COLUMN settle_limit;
-- ALTER TABLE merchants DROP COLUMN rate_limit_window;

-- ============================================================
-- STEP 8: Create default admin user
-- ============================================================

-- Password: change_me_immediately (bcrypt hash)
-- You should change this immediately after first login!
INSERT INTO admin_users (username, email, password_hash, role, is_active)
VALUES (
    'admin',
    'admin@x402.io',
    '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/X4w/Yxyz9Qm7a1kGC', -- change_me_immediately
    'super_admin',
    TRUE
)
ON DUPLICATE KEY UPDATE updated_at = CURRENT_TIMESTAMP;

-- ============================================================
-- STEP 9: Insert initial paymasters from existing config
-- ============================================================
-- You'll need to add your existing paymaster addresses here
-- INSERT INTO paymasters (address, name, networks, is_active, priority)
-- VALUES 
--     ('0x...', 'Primary Paymaster', '["base", "ethereum"]', TRUE, 10),
--     ('0x...', 'Secondary Paymaster', '["base"]', TRUE, 5);

COMMIT;

-- ============================================================
-- Post-migration verification queries
-- ============================================================

-- Check merchant migration
-- SELECT COUNT(*) as total_merchants, 
--        SUM(CASE WHEN merchant_id IS NOT NULL THEN 1 ELSE 0 END) as with_merchant_id,
--        SUM(CASE WHEN credit_balance > 0 THEN 1 ELSE 0 END) as with_credits
-- FROM merchants;

-- Check settlement migration
-- SELECT 
--     (SELECT COUNT(*) FROM transactions) as old_transactions,
--     (SELECT COUNT(*) FROM settlements) as new_settlements;

-- Check credit transactions
-- SELECT type, COUNT(*), SUM(amount) FROM credit_transactions GROUP BY type;
