-- =============================================================================
-- CREDIT SYSTEM UPDATE - Monthly Reset for Testnet
-- =============================================================================
-- Run with: sudo mysql x402_facilitator < scripts/schema_update_credits.sql
-- =============================================================================

USE x402_facilitator;

-- =============================================================================
-- MERCHANT CREDITS TABLE (New testnet credit system)
-- =============================================================================
-- Tracks monthly free testnet credits per merchant

CREATE TABLE IF NOT EXISTS merchant_testnet_credits (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    
    -- Relations
    merchant_id INT NOT NULL,
    
    -- Credit Period (monthly)
    period_year INT NOT NULL,
    period_month INT NOT NULL,
    
    -- Credits
    credits_allocated INT NOT NULL DEFAULT 1000,
    credits_used INT NOT NULL DEFAULT 0,
    credits_remaining INT GENERATED ALWAYS AS (credits_allocated - credits_used) STORED,
    
    -- Timestamps
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    -- Constraints
    UNIQUE KEY unique_merchant_period (merchant_id, period_year, period_month),
    INDEX idx_merchant_id (merchant_id),
    INDEX idx_period (period_year, period_month),
    
    -- Foreign Keys
    FOREIGN KEY (merchant_id) REFERENCES merchants(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- =============================================================================
-- CREDIT TOPUP PACKAGES TABLE
-- =============================================================================
-- Defines available topup packages

CREATE TABLE IF NOT EXISTS credit_packages (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    
    -- Package Info
    name VARCHAR(100) NOT NULL,
    description TEXT,
    
    -- Pricing
    credit_amount INT NOT NULL,
    price_usdc DECIMAL(18,6) NOT NULL,
    bonus_credits INT NOT NULL DEFAULT 0,
    
    -- Display
    is_popular TINYINT(1) NOT NULL DEFAULT 0,
    display_order INT NOT NULL DEFAULT 0,
    
    -- Status
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    
    -- Timestamps
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- Insert default packages
INSERT INTO credit_packages (name, description, credit_amount, price_usdc, bonus_credits, is_popular, display_order) VALUES
('Starter', 'Perfect for small projects', 1000, 10.00, 0, 0, 1),
('Growth', 'Best value for growing projects', 5000, 45.00, 500, 1, 2),
('Pro', 'For high-volume applications', 10000, 80.00, 2000, 0, 3),
('Enterprise', 'Maximum credits at best rate', 50000, 350.00, 15000, 0, 4)
ON DUPLICATE KEY UPDATE name=name;

-- =============================================================================
-- CREDIT TOPUP ORDERS TABLE
-- =============================================================================
-- Tracks topup orders and payments

CREATE TABLE IF NOT EXISTS credit_topup_orders (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    
    -- Order ID
    order_id VARCHAR(32) NOT NULL UNIQUE,
    
    -- Relations
    merchant_id INT NOT NULL,
    package_id BIGINT,
    
    -- Order Details
    credit_amount INT NOT NULL,
    bonus_credits INT NOT NULL DEFAULT 0,
    total_credits INT GENERATED ALWAYS AS (credit_amount + bonus_credits) STORED,
    price_usdc DECIMAL(18,6) NOT NULL,
    
    -- Network (for payment)
    network VARCHAR(50),
    
    -- Payment Status
    status ENUM('pending', 'awaiting_payment', 'processing', 'completed', 'failed', 'expired', 'refunded') NOT NULL DEFAULT 'pending',
    
    -- Payment Details (when paid)
    payment_tx_hash VARCHAR(66),
    payment_from_address VARCHAR(42),
    payment_block_number BIGINT,
    payment_confirmed_at TIMESTAMP NULL,
    
    -- Expiry
    expires_at TIMESTAMP NOT NULL,
    
    -- Timestamps
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    completed_at TIMESTAMP NULL,
    
    -- Indexes
    INDEX idx_order_id (order_id),
    INDEX idx_merchant_id (merchant_id),
    INDEX idx_status (status),
    INDEX idx_expires (expires_at),
    INDEX idx_payment_tx (payment_tx_hash),
    
    -- Foreign Keys
    FOREIGN KEY (merchant_id) REFERENCES merchants(id) ON DELETE RESTRICT,
    FOREIGN KEY (package_id) REFERENCES credit_packages(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- =============================================================================
-- ADMIN USERS TABLE
-- =============================================================================
-- Admin accounts for control panel

CREATE TABLE IF NOT EXISTS admin_users (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    
    -- Identity
    username VARCHAR(50) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    
    -- Profile
    display_name VARCHAR(100),
    email VARCHAR(255),
    
    -- Role
    role ENUM('super_admin', 'admin', 'viewer') NOT NULL DEFAULT 'viewer',
    
    -- Security
    totp_secret VARCHAR(32),
    totp_enabled TINYINT(1) NOT NULL DEFAULT 0,
    
    -- Session
    last_login_at TIMESTAMP NULL,
    last_login_ip VARCHAR(45),
    
    -- Status
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    
    -- Timestamps
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    INDEX idx_username (username),
    INDEX idx_role (role)
) ENGINE=InnoDB;

-- =============================================================================
-- ADMIN SESSIONS TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS admin_sessions (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    
    -- Relations
    admin_id BIGINT NOT NULL,
    
    -- Session
    session_token VARCHAR(64) NOT NULL UNIQUE,
    
    -- Metadata
    ip_address VARCHAR(45),
    user_agent TEXT,
    
    -- Expiration
    expires_at TIMESTAMP NOT NULL,
    
    -- Timestamps
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    INDEX idx_session_token (session_token),
    INDEX idx_admin_id (admin_id),
    INDEX idx_expires (expires_at),
    
    FOREIGN KEY (admin_id) REFERENCES admin_users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- =============================================================================
-- ADMIN AUDIT LOG TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS admin_audit_log (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    
    -- Who
    admin_id BIGINT,
    admin_username VARCHAR(50),
    
    -- What
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(50),
    entity_id VARCHAR(100),
    
    -- Changes
    old_value JSON,
    new_value JSON,
    
    -- Context
    ip_address VARCHAR(45),
    user_agent TEXT,
    
    -- Timestamps
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    INDEX idx_admin_id (admin_id),
    INDEX idx_action (action),
    INDEX idx_entity (entity_type, entity_id),
    INDEX idx_created_at (created_at DESC)
) ENGINE=InnoDB;

-- =============================================================================
-- UPDATE MERCHANTS TABLE
-- =============================================================================
-- Add columns for testnet credit system

-- Add testnet credit columns (using separate ALTER statements for MySQL compatibility)
SET @sql = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA='x402_facilitator' AND TABLE_NAME='merchants' AND COLUMN_NAME='testnet_credits_enabled') = 0,
    'ALTER TABLE merchants ADD COLUMN testnet_credits_enabled TINYINT(1) NOT NULL DEFAULT 1',
    'SELECT 1'
));
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA='x402_facilitator' AND TABLE_NAME='merchants' AND COLUMN_NAME='mainnet_credit_balance') = 0,
    'ALTER TABLE merchants ADD COLUMN mainnet_credit_balance INT NOT NULL DEFAULT 0',
    'SELECT 1'
));
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA='x402_facilitator' AND TABLE_NAME='merchants' AND COLUMN_NAME='status_reason') = 0,
    'ALTER TABLE merchants ADD COLUMN status_reason VARCHAR(255)',
    'SELECT 1'
));
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA='x402_facilitator' AND TABLE_NAME='merchants' AND COLUMN_NAME='banned_at') = 0,
    'ALTER TABLE merchants ADD COLUMN banned_at TIMESTAMP NULL',
    'SELECT 1'
));
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA='x402_facilitator' AND TABLE_NAME='merchants' AND COLUMN_NAME='banned_by') = 0,
    'ALTER TABLE merchants ADD COLUMN banned_by INT NULL',
    'SELECT 1'
));
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA='x402_facilitator' AND TABLE_NAME='merchants' AND COLUMN_NAME='ban_reason') = 0,
    'ALTER TABLE merchants ADD COLUMN ban_reason VARCHAR(255)',
    'SELECT 1'
));
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- =============================================================================
-- SYSTEM SETTINGS TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS system_settings (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    
    setting_key VARCHAR(100) NOT NULL UNIQUE,
    setting_value TEXT NOT NULL,
    setting_type ENUM('string', 'number', 'boolean', 'json') NOT NULL DEFAULT 'string',
    description VARCHAR(255),
    
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- Insert default settings
INSERT INTO system_settings (setting_key, setting_value, setting_type, description) VALUES
('testnet_monthly_credits', '1000', 'number', 'Free testnet credits per month'),
('testnet_credits_enabled', 'true', 'boolean', 'Enable free testnet credits'),
('mainnet_requires_credits', 'true', 'boolean', 'Require paid credits for mainnet'),
('default_credit_cost_testnet', '1', 'number', 'Credit cost per testnet settlement'),
('default_credit_cost_mainnet', '1', 'number', 'Credit cost per mainnet settlement'),
('topup_payment_expiry_minutes', '30', 'number', 'Minutes before topup order expires'),
('topup_payment_address', '', 'string', 'Address to receive topup payments')
ON DUPLICATE KEY UPDATE setting_key=setting_key;

-- =============================================================================
-- STORED PROCEDURE: Allocate Monthly Testnet Credits
-- =============================================================================

DELIMITER //

CREATE PROCEDURE IF NOT EXISTS allocate_monthly_testnet_credits()
BEGIN
    DECLARE current_year INT;
    DECLARE current_month INT;
    DECLARE monthly_credits INT;
    
    SET current_year = YEAR(CURDATE());
    SET current_month = MONTH(CURDATE());
    
    -- Get monthly credit allocation from settings
    SELECT CAST(setting_value AS UNSIGNED) INTO monthly_credits 
    FROM system_settings WHERE setting_key = 'testnet_monthly_credits';
    
    IF monthly_credits IS NULL THEN
        SET monthly_credits = 1000;
    END IF;
    
    -- Allocate credits to all active merchants who don't have credits for this month
    INSERT INTO merchant_testnet_credits (merchant_id, period_year, period_month, credits_allocated)
    SELECT m.id, current_year, current_month, monthly_credits
    FROM merchants m
    WHERE m.status = 'active' 
    AND m.testnet_credits_enabled = 1
    AND NOT EXISTS (
        SELECT 1 FROM merchant_testnet_credits mtc 
        WHERE mtc.merchant_id = m.id 
        AND mtc.period_year = current_year 
        AND mtc.period_month = current_month
    );
    
    SELECT ROW_COUNT() as merchants_allocated;
END //

DELIMITER ;

-- =============================================================================
-- STORED PROCEDURE: Get Merchant Credits
-- =============================================================================

DELIMITER //

CREATE PROCEDURE IF NOT EXISTS get_merchant_credits(IN p_merchant_id BIGINT)
BEGIN
    DECLARE current_year INT;
    DECLARE current_month INT;
    
    SET current_year = YEAR(CURDATE());
    SET current_month = MONTH(CURDATE());
    
    -- Auto-allocate if not exists
    INSERT IGNORE INTO merchant_testnet_credits (merchant_id, period_year, period_month, credits_allocated)
    SELECT p_merchant_id, current_year, current_month, 
           CAST((SELECT setting_value FROM system_settings WHERE setting_key = 'testnet_monthly_credits') AS UNSIGNED);
    
    -- Return credits info
    SELECT 
        m.id as merchant_id,
        m.mainnet_credit_balance,
        COALESCE(mtc.credits_remaining, 0) as testnet_credits_remaining,
        COALESCE(mtc.credits_used, 0) as testnet_credits_used,
        COALESCE(mtc.credits_allocated, 0) as testnet_credits_allocated,
        mtc.period_year,
        mtc.period_month
    FROM merchants m
    LEFT JOIN merchant_testnet_credits mtc ON mtc.merchant_id = m.id 
        AND mtc.period_year = current_year 
        AND mtc.period_month = current_month
    WHERE m.id = p_merchant_id;
END //

DELIMITER ;

-- =============================================================================
-- STORED PROCEDURE: Deduct Credits
-- =============================================================================

DELIMITER //

CREATE PROCEDURE IF NOT EXISTS deduct_credits(
    IN p_merchant_id BIGINT, 
    IN p_is_mainnet BOOLEAN, 
    IN p_credit_cost INT,
    OUT p_success BOOLEAN,
    OUT p_message VARCHAR(255)
)
BEGIN
    DECLARE current_balance INT;
    DECLARE current_year INT;
    DECLARE current_month INT;
    
    SET current_year = YEAR(CURDATE());
    SET current_month = MONTH(CURDATE());
    SET p_success = FALSE;
    
    IF p_is_mainnet THEN
        -- Mainnet: Use mainnet_credit_balance
        SELECT mainnet_credit_balance INTO current_balance 
        FROM merchants WHERE id = p_merchant_id FOR UPDATE;
        
        IF current_balance >= p_credit_cost THEN
            UPDATE merchants 
            SET mainnet_credit_balance = mainnet_credit_balance - p_credit_cost,
                lifetime_credits_used = lifetime_credits_used + p_credit_cost
            WHERE id = p_merchant_id;
            
            SET p_success = TRUE;
            SET p_message = 'Credits deducted successfully';
        ELSE
            SET p_message = CONCAT('Insufficient mainnet credits. Required: ', p_credit_cost, ', Available: ', current_balance);
        END IF;
    ELSE
        -- Testnet: Use monthly testnet credits
        -- Auto-allocate if not exists
        INSERT IGNORE INTO merchant_testnet_credits (merchant_id, period_year, period_month, credits_allocated)
        SELECT p_merchant_id, current_year, current_month, 
               CAST((SELECT setting_value FROM system_settings WHERE setting_key = 'testnet_monthly_credits') AS UNSIGNED);
        
        SELECT credits_remaining INTO current_balance 
        FROM merchant_testnet_credits 
        WHERE merchant_id = p_merchant_id 
        AND period_year = current_year 
        AND period_month = current_month 
        FOR UPDATE;
        
        IF current_balance >= p_credit_cost THEN
            UPDATE merchant_testnet_credits 
            SET credits_used = credits_used + p_credit_cost
            WHERE merchant_id = p_merchant_id 
            AND period_year = current_year 
            AND period_month = current_month;
            
            SET p_success = TRUE;
            SET p_message = 'Testnet credits deducted successfully';
        ELSE
            SET p_message = CONCAT('Insufficient testnet credits. Required: ', p_credit_cost, ', Available: ', COALESCE(current_balance, 0));
        END IF;
    END IF;
END //

DELIMITER ;

-- =============================================================================
-- CREATE DEFAULT ADMIN USER
-- =============================================================================
-- Password: admin123 (CHANGE THIS IMMEDIATELY!)
-- Bcrypt hash for 'admin123'

INSERT INTO admin_users (username, password_hash, display_name, role, is_active)
VALUES ('admin', '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewKyNiGBIxPDqCHe', 'Administrator', 'super_admin', 1)
ON DUPLICATE KEY UPDATE username=username;

-- =============================================================================
-- COMPLETED
-- =============================================================================

SELECT '✅ Credit system schema update completed!' AS status;
