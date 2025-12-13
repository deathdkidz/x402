-- =====================================================
-- x402 Facilitator - Database Initialization
-- =====================================================
-- Fresh database initialization script
-- Run with: mysql -u root -p x402_facilitator < migrations/init_database.sql
-- =====================================================

-- Create merchants table
CREATE TABLE IF NOT EXISTS merchants (
    id INT AUTO_INCREMENT PRIMARY KEY,
    merchant_address VARCHAR(42) NOT NULL UNIQUE,
    api_key VARCHAR(80) NOT NULL UNIQUE,
    private_key VARCHAR(66) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE,
    tier VARCHAR(20) DEFAULT 'free',
    verify_limit INT DEFAULT 60,
    settle_limit INT DEFAULT 20,
    rate_limit_window INT DEFAULT 60,
    webhook_url VARCHAR(255) DEFAULT NULL,
    webhook_secret VARCHAR(64) DEFAULT NULL,
    webhook_events VARCHAR(255) DEFAULT 'transaction.completed,transaction.failed',
    INDEX idx_api_key (api_key),
    INDEX idx_merchant_address (merchant_address),
    INDEX idx_is_active (is_active),
    INDEX idx_tier (tier),
    INDEX idx_webhook_enabled (webhook_url)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Create transactions table
CREATE TABLE IF NOT EXISTS transactions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    merchant_address VARCHAR(42) NOT NULL,
    payer_address VARCHAR(42) NOT NULL,
    nonce VARCHAR(66),
    valid_after BIGINT,
    valid_before BIGINT,
    signature TEXT,
    amount VARCHAR(100) NOT NULL,
    asset VARCHAR(42) NOT NULL,
    network VARCHAR(50) NOT NULL,
    resource VARCHAR(255) DEFAULT NULL,
    description TEXT DEFAULT NULL,
    mime_type VARCHAR(100) DEFAULT NULL,
    transaction_hash VARCHAR(66),
    status ENUM('pending', 'preconfirmed', 'completed', 'failed') DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    timeout_at TIMESTAMP NULL,
    INDEX idx_merchant (merchant_address),
    INDEX idx_payer (payer_address),
    INDEX idx_nonce (nonce),
    INDEX idx_payer_nonce (payer_address, nonce),
    INDEX idx_status (status),
    INDEX idx_created (created_at),
    INDEX idx_resource (resource),
    INDEX idx_pending_timeout (status, timeout_at),
    UNIQUE KEY idx_payer_nonce_unique (payer_address, nonce)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Create gas_tracking table
CREATE TABLE IF NOT EXISTS gas_tracking (
    id INT AUTO_INCREMENT PRIMARY KEY,
    transaction_id INT NULL,
    merchant_id INT NULL,
    operation_type VARCHAR(50) NOT NULL COMMENT 'settlement, authorization_check, balance_check, etc.',
    network VARCHAR(50) NOT NULL COMMENT 'base-sepolia, eth-sepolia, bsc-testnet',
    transaction_hash VARCHAR(66) NULL COMMENT 'Blockchain tx hash if successful',
    gas_token VARCHAR(10) NOT NULL COMMENT 'ETH, BNB, MATIC, etc.',
    gas_used BIGINT NULL COMMENT 'Actual gas units consumed',
    gas_price VARCHAR(50) NULL COMMENT 'Gas price in wei',
    gas_cost_wei VARCHAR(50) NULL COMMENT 'Total gas cost in wei',
    gas_cost_native DECIMAL(30, 18) NULL COMMENT 'Gas cost in native token (ETH/BNB)',
    gas_cost_usd DECIMAL(10, 4) NULL COMMENT 'Estimated USD cost at time of tx',
    balance_before VARCHAR(50) NULL COMMENT 'Native token balance before tx',
    balance_after VARCHAR(50) NULL COMMENT 'Native token balance after tx',
    status VARCHAR(20) NOT NULL DEFAULT 'success' COMMENT 'success, failed, reverted',
    error_message TEXT NULL COMMENT 'Error details if failed',
    block_number BIGINT NULL,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_transaction_id (transaction_id),
    INDEX idx_merchant_id (merchant_id),
    INDEX idx_network (network),
    INDEX idx_operation_type (operation_type),
    INDEX idx_status (status),
    INDEX idx_timestamp (timestamp),
    INDEX idx_network_operation (network, operation_type),
    FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE SET NULL,
    FOREIGN KEY (merchant_id) REFERENCES merchants(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Create webhook_deliveries table
CREATE TABLE IF NOT EXISTS webhook_deliveries (
    id INT AUTO_INCREMENT PRIMARY KEY,
    transaction_id INT NOT NULL,
    webhook_url VARCHAR(255) NOT NULL,
    event VARCHAR(50) NOT NULL,
    status ENUM('success', 'failed') NOT NULL,
    response_code INT,
    attempts INT DEFAULT 1,
    error_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_transaction (transaction_id),
    INDEX idx_status (status),
    INDEX idx_created (created_at),
    INDEX idx_webhook_url (webhook_url),
    INDEX idx_event (event),
    FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Create transaction_events table
CREATE TABLE IF NOT EXISTS transaction_events (
    id INT AUTO_INCREMENT PRIMARY KEY,
    transaction_id INT NOT NULL,
    transaction_hash VARCHAR(66) NOT NULL,
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
    ) NOT NULL,
    from_status VARCHAR(20),
    to_status VARCHAR(20),
    block_number BIGINT,
    confirmations INT,
    replaced_by_tx VARCHAR(66),
    gas_price_old VARCHAR(50),
    gas_price_new VARCHAR(50),
    event_data JSON,
    error_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_transaction_id (transaction_id),
    INDEX idx_transaction_hash (transaction_hash),
    INDEX idx_event_type (event_type),
    INDEX idx_created_at (created_at),
    INDEX idx_composite_search (transaction_id, event_type, created_at),
    FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =====================================================
-- Initialization Complete
-- =====================================================

SELECT 'Database initialized successfully!' AS status;
SHOW TABLES;
