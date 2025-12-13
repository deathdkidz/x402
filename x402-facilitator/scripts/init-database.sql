-- =====================================================
-- x402 Facilitator - Database Initialization Script
-- =====================================================
-- Creates database and all required tables
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
    id INT NOT NULL AUTO_INCREMENT,
    auth_address VARCHAR(42) NOT NULL COMMENT 'Ethereum wallet address for authentication',
    business_name VARCHAR(255) DEFAULT NULL COMMENT 'Business/merchant name',
    api_key VARCHAR(80) NOT NULL COMMENT 'API key for authentication',
    private_key VARCHAR(66) NOT NULL COMMENT 'Private key for signing',
    created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    is_active TINYINT(1) DEFAULT 1 COMMENT 'Whether merchant account is active',
    
    -- Rate limiting and tiers
    tier VARCHAR(20) DEFAULT 'free' COMMENT 'Merchant tier: free, pro, enterprise',
    verify_limit INT DEFAULT 60 COMMENT 'Max verify requests per rate_limit_window',
    settle_limit INT DEFAULT 20 COMMENT 'Max settle requests per rate_limit_window',
    rate_limit_window INT DEFAULT 60 COMMENT 'Rate limit window in seconds',
    
    -- Webhook configuration
    webhook_url VARCHAR(255) DEFAULT NULL COMMENT 'URL to receive webhook notifications',
    webhook_secret VARCHAR(64) DEFAULT NULL COMMENT 'Secret for webhook signature verification',
    webhook_events VARCHAR(255) DEFAULT 'transaction.completed,transaction.failed' COMMENT 'Comma-separated list of events',
    
    -- Profile information
    email VARCHAR(255) DEFAULT NULL COMMENT 'Merchant email address',
    profile_image_url VARCHAR(512) DEFAULT NULL COMMENT 'Profile/avatar image URL',
    
    PRIMARY KEY (id),
    UNIQUE KEY api_key (api_key),
    UNIQUE KEY unique_auth_address (auth_address),
    KEY idx_api_key (api_key),
    KEY idx_is_active (is_active),
    KEY idx_tier (tier),
    KEY idx_webhook_enabled (webhook_url),
    KEY idx_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

SELECT '✓ Table created: merchants' AS status;

-- =====================================================
-- 4. Create transactions table
-- =====================================================
CREATE TABLE IF NOT EXISTS transactions (
    id INT NOT NULL AUTO_INCREMENT,
    recipient_address VARCHAR(42) NOT NULL COMMENT 'Merchant/recipient receiving the payment',
    payer_address VARCHAR(42) NOT NULL COMMENT 'User making the payment',
    nonce VARCHAR(66) DEFAULT NULL COMMENT 'Unique nonce from EIP-3009 authorization',
    
    -- Authorization details
    valid_after BIGINT DEFAULT NULL COMMENT 'Unix timestamp - authorization valid after',
    valid_before BIGINT DEFAULT NULL COMMENT 'Unix timestamp - authorization valid before',
    signature TEXT COMMENT 'EIP-3009 signature',
    
    -- Payment details
    amount VARCHAR(100) NOT NULL COMMENT 'Payment amount in token units (wei)',
    asset VARCHAR(42) NOT NULL COMMENT 'Token contract address (e.g., USDC)',
    network VARCHAR(50) NOT NULL COMMENT 'Network name (e.g., Base Sepolia)',
    
    -- Resource tracking
    resource VARCHAR(255) DEFAULT NULL COMMENT 'Protected resource being accessed',
    description TEXT DEFAULT NULL COMMENT 'Payment description',
    mime_type VARCHAR(100) DEFAULT NULL COMMENT 'Resource mime type',
    
    -- Transaction status
    transaction_hash VARCHAR(66) DEFAULT NULL COMMENT 'Blockchain transaction hash',
    status ENUM('pending','preconfirmed','completed','failed') DEFAULT 'pending',
    
    -- Timestamps
    created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    timeout_at TIMESTAMP NULL DEFAULT NULL COMMENT 'When transaction will timeout if still pending',
    
    PRIMARY KEY (id),
    UNIQUE KEY unique_payer_nonce (payer_address, nonce),
    UNIQUE KEY idx_payer_nonce_unique (payer_address, nonce),
    KEY idx_merchant (recipient_address),
    KEY idx_payer (payer_address),
    KEY idx_status (status),
    KEY idx_created (created_at),
    KEY idx_nonce (nonce),
    KEY idx_payer_nonce (payer_address, nonce),
    KEY idx_pending_timeout (status, timeout_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

SELECT '✓ Table created: transactions' AS status;

-- =====================================================
-- 5. Create gas_tracking table
-- =====================================================
CREATE TABLE IF NOT EXISTS gas_tracking (
    id INT NOT NULL AUTO_INCREMENT,
    transaction_id INT DEFAULT NULL COMMENT 'Reference to transactions table',
    merchant_id INT DEFAULT NULL COMMENT 'Reference to merchants table',
    
    -- Operation details
    operation_type VARCHAR(50) NOT NULL COMMENT 'settlement, authorization_check, balance_check, etc.',
    network VARCHAR(50) NOT NULL COMMENT 'base-sepolia, eth-sepolia, bsc-testnet',
    transaction_hash VARCHAR(66) DEFAULT NULL COMMENT 'Blockchain tx hash if successful',
    
    -- Gas metrics
    gas_token VARCHAR(10) NOT NULL COMMENT 'ETH, BNB, MATIC, etc.',
    gas_used BIGINT DEFAULT NULL COMMENT 'Actual gas units consumed',
    gas_price VARCHAR(50) DEFAULT NULL COMMENT 'Gas price in wei',
    gas_cost_wei VARCHAR(50) DEFAULT NULL COMMENT 'Total gas cost in wei',
    gas_cost_native DECIMAL(30,18) DEFAULT NULL COMMENT 'Gas cost in native token (ETH/BNB)',
    gas_cost_usd DECIMAL(10,4) DEFAULT NULL COMMENT 'Estimated USD cost at time of tx',
    
    -- Balance tracking
    balance_before VARCHAR(50) DEFAULT NULL COMMENT 'Native token balance before tx',
    balance_after VARCHAR(50) DEFAULT NULL COMMENT 'Native token balance after tx',
    
    -- Status
    status VARCHAR(20) NOT NULL DEFAULT 'success' COMMENT 'success, failed, reverted',
    error_message TEXT COMMENT 'Error details if failed',
    block_number BIGINT DEFAULT NULL,
    timestamp TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    
    PRIMARY KEY (id),
    KEY idx_transaction_id (transaction_id),
    KEY idx_merchant_id (merchant_id),
    KEY idx_network (network),
    KEY idx_operation_type (operation_type),
    KEY idx_status (status),
    KEY idx_timestamp (timestamp),
    KEY idx_network_operation (network, operation_type),
    CONSTRAINT gas_tracking_ibfk_1 FOREIGN KEY (transaction_id) REFERENCES transactions (id) ON DELETE SET NULL,
    CONSTRAINT gas_tracking_ibfk_2 FOREIGN KEY (merchant_id) REFERENCES merchants (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

SELECT '✓ Table created: gas_tracking' AS status;

-- =====================================================
-- 6. Create webhook_deliveries table
-- =====================================================
CREATE TABLE IF NOT EXISTS webhook_deliveries (
    id INT NOT NULL AUTO_INCREMENT,
    transaction_id INT NOT NULL COMMENT 'Reference to transactions table',
    
    -- Webhook details
    webhook_url VARCHAR(255) NOT NULL COMMENT 'URL where webhook was delivered',
    event VARCHAR(50) NOT NULL COMMENT 'Event type (transaction.completed, transaction.failed)',
    
    -- Delivery status
    status ENUM('success','failed') NOT NULL,
    response_code INT DEFAULT NULL COMMENT 'HTTP response code from webhook endpoint',
    attempts INT DEFAULT 1 COMMENT 'Number of delivery attempts',
    error_message TEXT COMMENT 'Error message if delivery failed',
    
    created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    
    PRIMARY KEY (id),
    KEY idx_transaction (transaction_id),
    KEY idx_status (status),
    KEY idx_created (created_at),
    KEY idx_webhook_url (webhook_url),
    KEY idx_event (event),
    CONSTRAINT webhook_deliveries_ibfk_1 FOREIGN KEY (transaction_id) REFERENCES transactions (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

SELECT '✓ Table created: webhook_deliveries' AS status;

-- =====================================================
-- 7. Create transaction_events table
-- =====================================================
CREATE TABLE IF NOT EXISTS transaction_events (
    id INT NOT NULL AUTO_INCREMENT,
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
    from_status VARCHAR(20) DEFAULT NULL COMMENT 'Previous status',
    to_status VARCHAR(20) DEFAULT NULL COMMENT 'New status',
    
    -- Blockchain details
    block_number BIGINT DEFAULT NULL COMMENT 'Block number where tx was included',
    confirmations INT DEFAULT NULL COMMENT 'Number of confirmations',
    
    -- Transaction replacement
    replaced_by_tx VARCHAR(66) DEFAULT NULL COMMENT 'Hash of replacement tx (if replaced)',
    gas_price_old VARCHAR(50) DEFAULT NULL COMMENT 'Previous gas price',
    gas_price_new VARCHAR(50) DEFAULT NULL COMMENT 'New gas price (if replaced)',
    
    -- Additional data
    event_data JSON DEFAULT NULL COMMENT 'Additional event metadata',
    error_message TEXT COMMENT 'Error message if event represents failure',
    
    created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    
    PRIMARY KEY (id),
    KEY idx_transaction_id (transaction_id),
    KEY idx_transaction_hash (transaction_hash),
    KEY idx_event_type (event_type),
    KEY idx_created_at (created_at),
    KEY idx_composite_search (transaction_id, event_type, created_at),
    CONSTRAINT transaction_events_ibfk_1 FOREIGN KEY (transaction_id) REFERENCES transactions (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

SELECT '✓ Table created: transaction_events' AS status;

-- =====================================================
-- 8. Create auth_nonces table
-- =====================================================
CREATE TABLE IF NOT EXISTS auth_nonces (
    id INT NOT NULL AUTO_INCREMENT,
    auth_address VARCHAR(42) NOT NULL COMMENT 'Wallet address requesting authentication',
    nonce VARCHAR(128) NOT NULL COMMENT 'Unique nonce for SIWE authentication',
    created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL COMMENT 'When nonce expires',
    used TINYINT(1) DEFAULT 0 COMMENT 'Whether nonce has been used',
    
    PRIMARY KEY (id),
    UNIQUE KEY nonce (nonce),
    KEY idx_nonce (nonce),
    KEY idx_auth_address (auth_address),
    KEY idx_expires_at (expires_at),
    KEY idx_used (used)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SELECT '✓ Table created: auth_nonces' AS status;

-- =====================================================
-- 9. Create merchant_sessions table
-- =====================================================
CREATE TABLE IF NOT EXISTS merchant_sessions (
    id INT NOT NULL AUTO_INCREMENT,
    merchant_id INT NOT NULL COMMENT 'Reference to merchants table',
    session_token VARCHAR(128) NOT NULL COMMENT 'Unique session token',
    auth_address VARCHAR(42) NOT NULL COMMENT 'Authenticated wallet address',
    nonce VARCHAR(128) NOT NULL COMMENT 'Nonce used for authentication',
    signature TEXT COMMENT 'SIWE signature',
    expires_at TIMESTAMP NOT NULL COMMENT 'When session expires',
    created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    last_activity TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    ip_address VARCHAR(45) DEFAULT NULL COMMENT 'IP address of session',
    user_agent TEXT COMMENT 'User agent string',
    is_active TINYINT(1) DEFAULT 1 COMMENT 'Whether session is active',
    
    PRIMARY KEY (id),
    UNIQUE KEY session_token (session_token),
    KEY idx_session_token (session_token),
    KEY idx_merchant_id (merchant_id),
    KEY idx_auth_address (auth_address),
    KEY idx_expires_at (expires_at),
    KEY idx_is_active (is_active),
    CONSTRAINT merchant_sessions_ibfk_1 FOREIGN KEY (merchant_id) REFERENCES merchants (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SELECT '✓ Table created: merchant_sessions' AS status;

-- =====================================================
-- 10. Display created tables
-- =====================================================
SELECT '✅ Database initialization complete!' AS status;

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
