-- =====================================================
-- x402 Facilitator - Database Initialization Script
-- =====================================================
-- Creates database, user, and all required tables
-- 
-- Usage:
--   mysql -u root -p < scripts/init-database.sql
-- 
-- Or manually:
--   mysql -u root -p
--   source /srv/x402/x402-facilitator/scripts/init-database.sql
-- =====================================================

-- =====================================================
-- 1. Create Database
-- =====================================================
CREATE DATABASE IF NOT EXISTS x402_facilitator
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE x402_facilitator;

SELECT '✓ Database created: x402_facilitator' AS status;

-- =====================================================
-- 2. Create Database User (Optional - uncomment if needed)
-- =====================================================
-- DROP USER IF EXISTS 'x402user'@'localhost';
-- CREATE USER 'x402user'@'localhost' IDENTIFIED BY 'your_secure_password_here';
-- GRANT ALL PRIVILEGES ON x402_facilitator.* TO 'x402user'@'localhost';
-- FLUSH PRIVILEGES;
-- SELECT '✓ User created: x402user' AS status;

-- =====================================================
-- 3. Create merchants table
-- =====================================================
CREATE TABLE IF NOT EXISTS merchants (
    id INT AUTO_INCREMENT PRIMARY KEY,
    merchant_address VARCHAR(42) NOT NULL UNIQUE COMMENT 'Ethereum address of the merchant',
    api_key VARCHAR(80) NOT NULL UNIQUE COMMENT 'API key for authentication',
    private_key VARCHAR(66) NOT NULL COMMENT 'Private key for signing (encrypted in app)',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE COMMENT 'Whether merchant account is active',
    
    -- Rate limiting and tiers
    tier VARCHAR(20) DEFAULT 'free' COMMENT 'Merchant tier: free, pro, enterprise',
    verify_limit INT DEFAULT 60 COMMENT 'Max verify requests per rate_limit_window (in seconds)',
    settle_limit INT DEFAULT 20 COMMENT 'Max settle requests per rate_limit_window (in seconds)',
    rate_limit_window INT DEFAULT 60 COMMENT 'Rate limit window in seconds',
    
    -- Webhook configuration
    webhook_url VARCHAR(255) DEFAULT NULL COMMENT 'URL to receive webhook notifications',
    webhook_secret VARCHAR(64) DEFAULT NULL COMMENT 'Secret for webhook signature verification',
    webhook_events VARCHAR(255) DEFAULT 'transaction.completed,transaction.failed' COMMENT 'Comma-separated list of events',
    
    -- Indexes
    INDEX idx_api_key (api_key),
    INDEX idx_merchant_address (merchant_address),
    INDEX idx_is_active (is_active),
    INDEX idx_tier (tier),
    INDEX idx_webhook_enabled (webhook_url)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SELECT '✓ Table created: merchants' AS status;

-- =====================================================
-- 4. Create transactions table
-- =====================================================
CREATE TABLE IF NOT EXISTS transactions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    merchant_address VARCHAR(42) NOT NULL COMMENT 'Merchant receiving the payment',
    payer_address VARCHAR(42) NOT NULL COMMENT 'User making the payment',
    nonce VARCHAR(66) NOT NULL COMMENT 'Unique nonce from EIP-3009 authorization',
    
    -- Authorization details
    valid_after BIGINT COMMENT 'Unix timestamp - authorization valid after',
    valid_before BIGINT COMMENT 'Unix timestamp - authorization valid before',
    signature TEXT COMMENT 'EIP-3009 signature',
    
    -- Payment details
    amount VARCHAR(100) NOT NULL COMMENT 'Payment amount in token units (wei)',
    asset VARCHAR(42) NOT NULL COMMENT 'Token contract address (e.g., USDC)',
    network VARCHAR(50) NOT NULL COMMENT 'Network name (e.g., Base Sepolia)',
    
    -- Resource tracking
    resource VARCHAR(255) DEFAULT NULL COMMENT 'Protected resource being accessed (e.g., /api/premium)',
    description TEXT DEFAULT NULL COMMENT 'Payment description',
    mime_type VARCHAR(100) DEFAULT NULL COMMENT 'Resource mime type',
    
    -- Transaction status
    transaction_hash VARCHAR(66) COMMENT 'Blockchain transaction hash',
    status ENUM('pending', 'preconfirmed', 'completed', 'failed') DEFAULT 'pending',
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    timeout_at TIMESTAMP NULL COMMENT 'When transaction will timeout if still pending',
    
    -- Indexes
    INDEX idx_merchant (merchant_address),
    INDEX idx_payer (payer_address),
    INDEX idx_status (status),
    INDEX idx_created (created_at),
    INDEX idx_nonce (nonce),
    INDEX idx_payer_nonce (payer_address, nonce),
    INDEX idx_pending_timeout (status, timeout_at),
    INDEX idx_resource (resource),
    
    -- Unique constraint to prevent duplicate submissions
    UNIQUE KEY idx_payer_nonce_unique (payer_address, nonce)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SELECT '✓ Table created: transactions' AS status;

-- =====================================================
-- 5. Create gas_tracking table
-- =====================================================
CREATE TABLE IF NOT EXISTS gas_tracking (
    id INT AUTO_INCREMENT PRIMARY KEY,
    transaction_id INT NULL COMMENT 'Reference to transactions table',
    merchant_id INT NULL COMMENT 'Reference to merchants table',
    
    -- Operation details
    operation_type VARCHAR(50) NOT NULL COMMENT 'settlement, authorization_check, balance_check, etc.',
    network VARCHAR(50) NOT NULL COMMENT 'base-sepolia, eth-sepolia, base, ethereum, hyperevm',
    transaction_hash VARCHAR(66) NULL COMMENT 'Blockchain tx hash if successful',
    
    -- Gas metrics
    gas_token VARCHAR(10) NOT NULL COMMENT 'ETH, BNB, MATIC, etc.',
    gas_used BIGINT NULL COMMENT 'Actual gas units consumed',
    gas_price VARCHAR(50) NULL COMMENT 'Gas price in wei',
    gas_cost_wei VARCHAR(50) NULL COMMENT 'Total gas cost in wei (gas_used * gas_price)',
    gas_cost_native DECIMAL(30, 18) NULL COMMENT 'Gas cost in native token (ETH/BNB)',
    gas_cost_usd DECIMAL(10, 4) NULL COMMENT 'Estimated USD cost at time of tx',
    
    -- Balance tracking
    balance_before VARCHAR(50) NULL COMMENT 'Native token balance before tx',
    balance_after VARCHAR(50) NULL COMMENT 'Native token balance after tx',
    
    -- Status
    status VARCHAR(20) NOT NULL DEFAULT 'success' COMMENT 'success, failed, reverted',
    error_message TEXT NULL COMMENT 'Error details if failed',
    block_number BIGINT NULL COMMENT 'Block number where tx was included',
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Indexes
    INDEX idx_transaction_id (transaction_id),
    INDEX idx_merchant_id (merchant_id),
    INDEX idx_network (network),
    INDEX idx_operation_type (operation_type),
    INDEX idx_status (status),
    INDEX idx_timestamp (timestamp),
    INDEX idx_network_operation (network, operation_type),
    
    -- Foreign keys
    FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE SET NULL,
    FOREIGN KEY (merchant_id) REFERENCES merchants(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SELECT '✓ Table created: gas_tracking' AS status;

-- =====================================================
-- 6. Create webhook_deliveries table
-- =====================================================
CREATE TABLE IF NOT EXISTS webhook_deliveries (
    id INT AUTO_INCREMENT PRIMARY KEY,
    transaction_id INT NOT NULL COMMENT 'Reference to transactions table',
    
    -- Webhook details
    webhook_url VARCHAR(255) NOT NULL COMMENT 'URL where webhook was delivered',
    event VARCHAR(50) NOT NULL COMMENT 'Event type (transaction.completed, transaction.failed)',
    
    -- Delivery status
    status ENUM('success', 'failed') NOT NULL,
    response_code INT COMMENT 'HTTP response code from webhook endpoint',
    attempts INT DEFAULT 1 COMMENT 'Number of delivery attempts',
    error_message TEXT COMMENT 'Error message if delivery failed',
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Indexes
    INDEX idx_transaction (transaction_id),
    INDEX idx_status (status),
    INDEX idx_created (created_at),
    INDEX idx_webhook_url (webhook_url),
    INDEX idx_event (event),
    
    -- Foreign key
    FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SELECT '✓ Table created: webhook_deliveries' AS status;

-- =====================================================
-- 7. Create transaction_events table
-- =====================================================
CREATE TABLE IF NOT EXISTS transaction_events (
    id INT AUTO_INCREMENT PRIMARY KEY,
    transaction_id INT NOT NULL COMMENT 'Reference to transactions table',
    transaction_hash VARCHAR(66) NOT NULL COMMENT 'Blockchain transaction hash',
    
    -- Event details
    event_type ENUM(
        'submitted',
        'pending',
        'preconfirmed',
        'completed',
        'failed',
        'reorg_detected',
        'dropped',
        'replaced',
        'rebroadcast',
        'canonical_confirmed'
    ) NOT NULL COMMENT 'Type of event that occurred',
    
    -- Status changes
    from_status VARCHAR(20) COMMENT 'Previous status',
    to_status VARCHAR(20) COMMENT 'New status',
    
    -- Blockchain details
    block_number BIGINT COMMENT 'Block number where tx was included',
    confirmations INT COMMENT 'Number of confirmations',
    
    -- Transaction replacement
    replaced_by_tx VARCHAR(66) COMMENT 'Hash of replacement tx (if replaced)',
    gas_price_old VARCHAR(50) COMMENT 'Previous gas price',
    gas_price_new VARCHAR(50) COMMENT 'New gas price (if replaced)',
    
    -- Additional data
    event_data JSON COMMENT 'Additional event metadata',
    error_message TEXT COMMENT 'Error message if event represents failure',
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Indexes
    INDEX idx_transaction_id (transaction_id),
    INDEX idx_transaction_hash (transaction_hash),
    INDEX idx_event_type (event_type),
    INDEX idx_created_at (created_at),
    INDEX idx_composite_search (transaction_id, event_type, created_at),
    
    -- Foreign key
    FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SELECT '✓ Table created: transaction_events' AS status;

-- =====================================================
-- 8. Insert default tier configurations (Optional)
-- =====================================================
-- Uncomment to create sample tier configurations in a tiers table
-- Or keep tier logic in application code

-- =====================================================
-- 9. Display created tables
-- =====================================================
SELECT '✅ Database initialization complete!' AS status;
SELECT '' AS separator;
SELECT 'Created tables:' AS info;
SHOW TABLES;

SELECT '' AS separator;
SELECT 'Database statistics:' AS info;
SELECT 
    'merchants' AS table_name,
    COUNT(*) AS row_count
FROM merchants
UNION ALL
SELECT 
    'transactions',
    COUNT(*)
FROM transactions
UNION ALL
SELECT 
    'gas_tracking',
    COUNT(*)
FROM gas_tracking
UNION ALL
SELECT 
    'webhook_deliveries',
    COUNT(*)
FROM webhook_deliveries
UNION ALL
SELECT 
    'transaction_events',
    COUNT(*)
FROM transaction_events;

-- =====================================================
-- Next Steps:
-- =====================================================
-- 1. Create a merchant account using generate-merchant-v2.mjs:
--    npm run generate:merchant
--
-- 2. Fund paymaster wallets with gas tokens (ETH):
--    See: docs/FUND_PAYMASTER_WALLETS.md
--
-- 3. Start the facilitator:
--    pm2 start ecosystem.config.cjs
--
-- 4. Test health endpoint:
--    curl https://api.netpay.id/health
-- =====================================================
