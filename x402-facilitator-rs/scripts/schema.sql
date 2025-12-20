-- =============================================================================
-- x402 FACILITATOR DATABASE SCHEMA
-- Run with: sudo mysql -u root -p < scripts/schema.sql
-- =============================================================================

-- Create database
CREATE DATABASE IF NOT EXISTS x402 CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Create user (change password in production!)
CREATE USER IF NOT EXISTS 'x402_user'@'localhost' IDENTIFIED BY 'your_secure_password';
GRANT ALL PRIVILEGES ON x402.* TO 'x402_user'@'localhost';
FLUSH PRIVILEGES;

USE x402;

-- -----------------------------------------------------------------------------
-- Merchants table
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS merchants (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE,
    api_key VARCHAR(64) NOT NULL UNIQUE,
    auth_address VARCHAR(42) NOT NULL,
    credits_balance BIGINT DEFAULT 0,
    webhook_url VARCHAR(512),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_api_key (api_key),
    INDEX idx_auth_address (auth_address)
);

-- -----------------------------------------------------------------------------
-- Transactions table
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS transactions (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    merchant_id INT NOT NULL,
    network VARCHAR(50) NOT NULL,
    asset VARCHAR(42) NOT NULL,
    payer VARCHAR(42) NOT NULL,
    recipient VARCHAR(42) NOT NULL,
    amount VARCHAR(78) NOT NULL,
    resource VARCHAR(512),
    nonce VARCHAR(66) NOT NULL,
    tx_hash VARCHAR(66),
    status ENUM('pending', 'completed', 'failed', 'timeout') DEFAULT 'pending',
    error_message TEXT,
    gas_used BIGINT,
    gas_price VARCHAR(78),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_merchant (merchant_id),
    INDEX idx_tx_hash (tx_hash),
    INDEX idx_status (status),
    INDEX idx_payer_nonce (payer, nonce),
    FOREIGN KEY (merchant_id) REFERENCES merchants(id)
);

-- -----------------------------------------------------------------------------
-- Credit transactions table
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS credit_transactions (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    merchant_id INT NOT NULL,
    amount BIGINT NOT NULL,
    transaction_type ENUM('purchase', 'deduction', 'refund', 'bonus') NOT NULL,
    description VARCHAR(512),
    reference_tx VARCHAR(66),
    balance_after BIGINT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_merchant (merchant_id),
    FOREIGN KEY (merchant_id) REFERENCES merchants(id)
);

-- -----------------------------------------------------------------------------
-- Test merchant (for development - remove in production)
-- -----------------------------------------------------------------------------
INSERT INTO merchants (name, email, api_key, auth_address, credits_balance)
VALUES (
    'Test Merchant',
    'test@example.com',
    SHA2(CONCAT(RAND(), NOW()), 256),
    '0xYourMerchantWalletAddress',
    1000000
);

-- Show the generated API key
SELECT CONCAT('✅ Test merchant created with API key: ', api_key) AS result 
FROM merchants WHERE name = 'Test Merchant';
