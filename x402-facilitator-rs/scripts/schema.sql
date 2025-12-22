-- =============================================================================
-- x402 FACILITATOR DATABASE SCHEMA
-- =============================================================================
-- 
-- This is the complete and up-to-date schema for the x402 Facilitator (Rust).
-- Run with: sudo mysql < scripts/schema.sql
--
-- Database name: x402_facilitator
-- =============================================================================

-- Create database
CREATE DATABASE IF NOT EXISTS x402_facilitator 
    CHARACTER SET utf8mb4 
    COLLATE utf8mb4_unicode_ci;

-- Create application user (change password in production!)
CREATE USER IF NOT EXISTS 'x402_user'@'localhost' IDENTIFIED BY 'your_secure_password';
GRANT ALL PRIVILEGES ON x402_facilitator.* TO 'x402_user'@'localhost';
FLUSH PRIVILEGES;

USE x402_facilitator;

-- =============================================================================
-- MERCHANTS TABLE
-- =============================================================================
-- Stores merchant account information and credit balances

CREATE TABLE IF NOT EXISTS merchants (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    
    -- Identity
    auth_address VARCHAR(42) NOT NULL,
    business_name VARCHAR(255),
    email VARCHAR(255),
    profile_image_url VARCHAR(512),
    
    -- API Authentication
    api_key VARCHAR(64) NOT NULL UNIQUE,
    
    -- Credit System
    credit_balance INT NOT NULL DEFAULT 0,
    lifetime_credits_purchased INT NOT NULL DEFAULT 0,
    lifetime_credits_used INT NOT NULL DEFAULT 0,
    
    -- Webhook Configuration
    webhook_url VARCHAR(512),
    webhook_secret VARCHAR(64),
    webhook_events VARCHAR(255) NOT NULL DEFAULT 'settlement.completed,settlement.failed',
    
    -- Account Status
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    status ENUM('pending', 'active', 'suspended', 'banned') NOT NULL DEFAULT 'active',
    
    -- Timestamps
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    last_active_at TIMESTAMP NULL,
    
    -- Indexes
    INDEX idx_api_key (api_key),
    INDEX idx_auth_address (auth_address),
    INDEX idx_status (status),
    INDEX idx_credit_balance (credit_balance)
) ENGINE=InnoDB;

-- =============================================================================
-- TRANSACTIONS TABLE
-- =============================================================================
-- Stores all settlement transactions

CREATE TABLE IF NOT EXISTS transactions (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    
    -- Relations
    merchant_id BIGINT NOT NULL,
    
    -- Payment Details
    network VARCHAR(50) NOT NULL,
    asset VARCHAR(42) NOT NULL,
    payer_address VARCHAR(42) NOT NULL,
    recipient_address VARCHAR(42) NOT NULL,
    amount VARCHAR(78) NOT NULL,
    
    -- Authorization
    nonce VARCHAR(66) NOT NULL,
    valid_after BIGINT NOT NULL DEFAULT 0,
    valid_before BIGINT NOT NULL DEFAULT 4102444800,
    
    -- Resource
    resource VARCHAR(512),
    description VARCHAR(512),
    
    -- Execution
    transaction_hash VARCHAR(66),
    status ENUM('pending', 'preconfirmed', 'completed', 'failed', 'timeout') NOT NULL DEFAULT 'pending',
    
    -- Cost
    credit_cost INT NOT NULL DEFAULT 1,
    
    -- Timestamps
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    timeout_at TIMESTAMP NULL,
    
    -- Indexes
    INDEX idx_merchant_id (merchant_id),
    INDEX idx_transaction_hash (transaction_hash),
    INDEX idx_status (status),
    INDEX idx_status_created (status, created_at),
    UNIQUE INDEX unique_payer_nonce (payer_address, nonce),
    
    -- Foreign Keys
    FOREIGN KEY (merchant_id) REFERENCES merchants(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

-- =============================================================================
-- CREDIT_TRANSACTIONS TABLE
-- =============================================================================
-- Tracks all credit movements (purchases, deductions, refunds, etc.)

CREATE TABLE IF NOT EXISTS credit_transactions (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    
    -- Relations
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
    
    -- Timestamps
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    -- Indexes
    INDEX idx_merchant_credits (merchant_id, created_at DESC),
    INDEX idx_type (type, created_at DESC),
    
    -- Foreign Keys
    FOREIGN KEY (merchant_id) REFERENCES merchants(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

-- =============================================================================
-- CREDIT_PURCHASES TABLE
-- =============================================================================
-- Tracks credit purchases from blockchain transactions

CREATE TABLE IF NOT EXISTS credit_purchases (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    
    -- Relations
    merchant_id BIGINT NOT NULL,
    purchase_id VARCHAR(32) UNIQUE,
    
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
    
    -- Timestamps
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    confirmed_at TIMESTAMP NULL,
    
    -- Indexes
    INDEX idx_tx_hash (tx_hash),
    INDEX idx_status (status),
    INDEX idx_merchant_purchases (merchant_id, created_at DESC),
    
    -- Foreign Keys
    FOREIGN KEY (merchant_id) REFERENCES merchants(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

-- =============================================================================
-- WEBHOOK_LOGS TABLE
-- =============================================================================
-- Tracks webhook delivery attempts

CREATE TABLE IF NOT EXISTS webhook_logs (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    
    -- Relations
    transaction_id BIGINT NOT NULL,
    
    -- Webhook Info
    webhook_url VARCHAR(512) NOT NULL,
    event VARCHAR(50) NOT NULL,
    status VARCHAR(20) NOT NULL,
    
    -- Response
    response_code INT,
    attempts INT NOT NULL DEFAULT 1,
    error_message TEXT,
    
    -- Timestamps
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    -- Indexes
    INDEX idx_transaction_id (transaction_id),
    INDEX idx_status (status),
    
    -- Foreign Keys
    FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- =============================================================================
-- AUTH_NONCES TABLE
-- =============================================================================
-- Tracks nonces for SIWE (Sign-In with Ethereum) authentication

CREATE TABLE IF NOT EXISTS auth_nonces (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    
    -- Nonce
    nonce VARCHAR(64) NOT NULL UNIQUE,
    address VARCHAR(42),
    
    -- Expiration
    expires_at TIMESTAMP NOT NULL,
    used TINYINT(1) NOT NULL DEFAULT 0,
    
    -- Timestamps
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    -- Indexes
    INDEX idx_nonce (nonce),
    INDEX idx_expires (expires_at)
) ENGINE=InnoDB;

-- =============================================================================
-- MERCHANT_SESSIONS TABLE
-- =============================================================================
-- Tracks merchant login sessions

CREATE TABLE IF NOT EXISTS merchant_sessions (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    
    -- Relations
    merchant_id BIGINT NOT NULL,
    
    -- Session
    session_token VARCHAR(64) NOT NULL UNIQUE,
    
    -- Metadata
    ip_address VARCHAR(45),
    user_agent TEXT,
    
    -- Expiration
    expires_at TIMESTAMP NOT NULL,
    
    -- Timestamps
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    -- Indexes
    INDEX idx_session_token (session_token),
    INDEX idx_merchant_id (merchant_id),
    INDEX idx_expires (expires_at),
    
    -- Foreign Keys
    FOREIGN KEY (merchant_id) REFERENCES merchants(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- =============================================================================
-- GAS_TRACKING TABLE
-- =============================================================================
-- Tracks gas prices and costs for analytics

CREATE TABLE IF NOT EXISTS gas_tracking (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    
    -- Network Info
    network VARCHAR(50) NOT NULL,
    
    -- Gas Data
    gas_price_gwei DECIMAL(18,9) NOT NULL,
    gas_used BIGINT,
    
    -- Costs
    eth_cost DECIMAL(36,18),
    usd_cost DECIMAL(18,6),
    
    -- Reference
    transaction_hash VARCHAR(66),
    
    -- Timestamps
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    -- Indexes
    INDEX idx_network_time (network, created_at DESC),
    INDEX idx_transaction_hash (transaction_hash)
) ENGINE=InnoDB;

-- =============================================================================
-- TRANSACTION_EVENTS TABLE
-- =============================================================================
-- Tracks transaction status changes for auditing

CREATE TABLE IF NOT EXISTS transaction_events (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    
    -- Relations
    transaction_id BIGINT NOT NULL,
    
    -- Event Info
    event_type VARCHAR(50) NOT NULL,
    old_status VARCHAR(20),
    new_status VARCHAR(20),
    
    -- Metadata
    metadata JSON,
    
    -- Timestamps
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    -- Indexes
    INDEX idx_transaction_id (transaction_id, created_at DESC),
    
    -- Foreign Keys
    FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- =============================================================================
-- WEBHOOK_DELIVERIES TABLE (for webhook_resource tracking)
-- =============================================================================
-- Tracks webhook deliveries with detailed info

CREATE TABLE IF NOT EXISTS webhook_deliveries (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    
    -- Relations
    merchant_id BIGINT NOT NULL,
    transaction_id BIGINT,
    
    -- Delivery Info
    delivery_id VARCHAR(64) NOT NULL UNIQUE,
    event_type VARCHAR(50) NOT NULL,
    webhook_url VARCHAR(512) NOT NULL,
    
    -- Request
    request_body JSON,
    
    -- Response
    response_status INT,
    response_body TEXT,
    
    -- Status
    status ENUM('pending', 'success', 'failed') NOT NULL DEFAULT 'pending',
    attempts INT NOT NULL DEFAULT 0,
    last_attempt_at TIMESTAMP NULL,
    next_retry_at TIMESTAMP NULL,
    error_message TEXT,
    
    -- Timestamps
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP NULL,
    
    -- Indexes
    INDEX idx_merchant_id (merchant_id),
    INDEX idx_delivery_id (delivery_id),
    INDEX idx_status (status),
    INDEX idx_next_retry (status, next_retry_at),
    
    -- Foreign Keys
    FOREIGN KEY (merchant_id) REFERENCES merchants(id) ON DELETE CASCADE,
    FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- =============================================================================
-- VIEWS
-- =============================================================================

-- Active merchants with recent stats
CREATE OR REPLACE VIEW v_active_merchants AS
SELECT 
    m.*,
    (SELECT COUNT(*) FROM transactions t 
     WHERE t.merchant_id = m.id AND t.status = 'completed' 
     AND t.created_at > DATE_SUB(NOW(), INTERVAL 24 HOUR)) as settlements_24h
FROM merchants m
WHERE m.status = 'active' AND m.is_active = 1;

-- =============================================================================
-- CLEANUP OLD MIGRATION FILES' ARTIFACTS
-- =============================================================================

-- Drop procedure if exists from migrations
DROP PROCEDURE IF EXISTS add_column_if_not_exists;
DROP PROCEDURE IF EXISTS drop_column_if_exists;
DROP PROCEDURE IF EXISTS drop_columns_if_exist;

-- =============================================================================
-- COMPLETED
-- =============================================================================

SELECT '✅ x402_facilitator database schema created successfully!' AS status;
