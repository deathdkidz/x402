-- ============================================================
-- x402 Facilitator Database Migration v2
-- Business Model Transformation
-- ============================================================
-- 
-- Changes:
-- 1. Add credit system fields to merchants table
-- 2. Simplify transactions table (remove redundant columns)
-- 3. Remove tier-based rate limiting columns
-- 4. Add status field for merchant account state
-- 5. Clean up unused tables
--
-- Run with: mysql -u root -p x402_facilitator < migration_v2.sql
-- ============================================================

-- Start transaction for safety
START TRANSACTION;

-- ============================================================
-- STEP 1: Backup existing data (recommended)
-- ============================================================
-- Uncomment if you want to create backups first:
-- CREATE TABLE merchants_backup_v2 AS SELECT * FROM merchants;
-- CREATE TABLE transactions_backup_v2 AS SELECT * FROM transactions;

-- ============================================================
-- STEP 2: Modify merchants table - Add credit system fields
-- ============================================================

-- Add new columns for credit system (ignore errors if already exist)
-- Using procedures to handle "column already exists" gracefully

DELIMITER //

DROP PROCEDURE IF EXISTS add_column_if_not_exists//
CREATE PROCEDURE add_column_if_not_exists()
BEGIN
    -- Add credit_balance
    IF NOT EXISTS (SELECT * FROM information_schema.columns 
                   WHERE table_schema = DATABASE() AND table_name = 'merchants' AND column_name = 'credit_balance') THEN
        ALTER TABLE merchants ADD COLUMN credit_balance INT NOT NULL DEFAULT 0;
    END IF;
    
    -- Add lifetime_credits_purchased
    IF NOT EXISTS (SELECT * FROM information_schema.columns 
                   WHERE table_schema = DATABASE() AND table_name = 'merchants' AND column_name = 'lifetime_credits_purchased') THEN
        ALTER TABLE merchants ADD COLUMN lifetime_credits_purchased INT NOT NULL DEFAULT 0;
    END IF;
    
    -- Add lifetime_credits_used
    IF NOT EXISTS (SELECT * FROM information_schema.columns 
                   WHERE table_schema = DATABASE() AND table_name = 'merchants' AND column_name = 'lifetime_credits_used') THEN
        ALTER TABLE merchants ADD COLUMN lifetime_credits_used INT NOT NULL DEFAULT 0;
    END IF;
    
    -- Add status
    IF NOT EXISTS (SELECT * FROM information_schema.columns 
                   WHERE table_schema = DATABASE() AND table_name = 'merchants' AND column_name = 'status') THEN
        ALTER TABLE merchants ADD COLUMN status ENUM('pending', 'active', 'suspended', 'banned') DEFAULT 'active';
    END IF;
    
    -- Add last_active_at
    IF NOT EXISTS (SELECT * FROM information_schema.columns 
                   WHERE table_schema = DATABASE() AND table_name = 'merchants' AND column_name = 'last_active_at') THEN
        ALTER TABLE merchants ADD COLUMN last_active_at TIMESTAMP NULL;
    END IF;
    
    -- Add credit_cost to transactions
    IF NOT EXISTS (SELECT * FROM information_schema.columns 
                   WHERE table_schema = DATABASE() AND table_name = 'transactions' AND column_name = 'credit_cost') THEN
        ALTER TABLE transactions ADD COLUMN credit_cost INT NOT NULL DEFAULT 1;
    END IF;
    
    -- Add purchase_id to credit_purchases
    IF NOT EXISTS (SELECT * FROM information_schema.columns 
                   WHERE table_schema = DATABASE() AND table_name = 'credit_purchases' AND column_name = 'purchase_id') THEN
        ALTER TABLE credit_purchases ADD COLUMN purchase_id VARCHAR(32) UNIQUE;
    END IF;
END//

DELIMITER ;

CALL add_column_if_not_exists();
DROP PROCEDURE IF EXISTS add_column_if_not_exists;

-- Set default status based on is_active
UPDATE merchants SET status = 'active' WHERE is_active = 1 AND (status IS NULL OR status = '');
UPDATE merchants SET status = 'suspended' WHERE is_active = 0 AND (status IS NULL OR status = '');

-- Give existing merchants starting credits based on their tier (one-time migration)
UPDATE merchants SET 
    credit_balance = CASE 
        WHEN tier = 'free' THEN 1000
        WHEN tier = 'basic' THEN 5000
        WHEN tier = 'pro' THEN 20000
        WHEN tier = 'enterprise' THEN 100000
        ELSE 1000
    END,
    lifetime_credits_purchased = CASE 
        WHEN tier = 'free' THEN 1000
        WHEN tier = 'basic' THEN 5000
        WHEN tier = 'pro' THEN 20000
        WHEN tier = 'enterprise' THEN 100000
        ELSE 1000
    END
WHERE credit_balance = 0;

-- Log migration credits to credit_transactions
INSERT INTO credit_transactions (merchant_id, type, amount, balance_before, balance_after, reference_type, description)
SELECT 
    id,
    'migration',
    credit_balance,
    0,
    credit_balance,
    'tier_migration',
    CONCAT('Migration bonus from tier: ', COALESCE(tier, 'free'))
FROM merchants
WHERE credit_balance > 0
AND NOT EXISTS (
    SELECT 1 FROM credit_transactions ct 
    WHERE ct.merchant_id = merchants.id AND ct.type = 'migration'
);

-- Add indexes for credit queries (ignore if exist)
CREATE INDEX idx_credit_balance ON merchants(credit_balance);
CREATE INDEX idx_merchant_status ON merchants(status);

-- ============================================================
-- STEP 3: Simplify transactions table
-- ============================================================

-- Remove redundant columns using procedure
DELIMITER //

DROP PROCEDURE IF EXISTS drop_columns_if_exist//
CREATE PROCEDURE drop_columns_if_exist()
BEGIN
    -- Drop merchant_address if exists
    IF EXISTS (SELECT * FROM information_schema.columns 
               WHERE table_schema = DATABASE() AND table_name = 'transactions' AND column_name = 'merchant_address') THEN
        ALTER TABLE transactions DROP COLUMN merchant_address;
    END IF;
    
    -- Drop mime_type if exists
    IF EXISTS (SELECT * FROM information_schema.columns 
               WHERE table_schema = DATABASE() AND table_name = 'transactions' AND column_name = 'mime_type') THEN
        ALTER TABLE transactions DROP COLUMN mime_type;
    END IF;
END//

DELIMITER ;

CALL drop_columns_if_exist();
DROP PROCEDURE IF EXISTS drop_columns_if_exist;

-- ============================================================
-- STEP 4: Remove unused columns from merchants
-- ============================================================

-- Note: We keep tier, verify_limit, settle_limit, rate_limit_window 
-- for backward compatibility during transition. They can be removed later.

-- Drop private_key column (no longer needed - paymasters handle signing)
-- WARNING: Make sure you don't need this data!
-- Uncomment when ready:
-- ALTER TABLE merchants DROP COLUMN IF EXISTS private_key;

-- ============================================================
-- STEP 5: Update existing credit tables if needed
-- ============================================================

-- Update existing records with generated purchase_id (already handled in procedure above)
UPDATE credit_purchases 
SET purchase_id = CONCAT('pur_', LOWER(SUBSTRING(MD5(CONCAT(id, tx_hash)), 1, 12)))
WHERE purchase_id IS NULL;

-- ============================================================
-- STEP 6: Create views for common queries
-- ============================================================

-- Drop existing views if they exist
DROP VIEW IF EXISTS v_active_merchants;
DROP VIEW IF EXISTS v_merchant_credits;

-- Active merchants with credit info
CREATE VIEW v_active_merchants AS
SELECT 
    id,
    auth_address,
    business_name,
    email,
    credit_balance,
    lifetime_credits_purchased,
    lifetime_credits_used,
    status,
    created_at,
    last_active_at,
    (SELECT COUNT(*) FROM transactions t WHERE t.merchant_id = m.id AND t.status = 'completed' AND t.created_at > DATE_SUB(NOW(), INTERVAL 24 HOUR)) as settlements_24h
FROM merchants m
WHERE status = 'active';

-- Merchant credit summary
CREATE VIEW v_merchant_credits AS
SELECT 
    m.id,
    m.auth_address,
    m.business_name,
    m.credit_balance,
    m.lifetime_credits_purchased,
    m.lifetime_credits_used,
    (SELECT COUNT(*) FROM credit_transactions ct WHERE ct.merchant_id = m.id AND ct.type = 'purchase') as total_purchases,
    (SELECT SUM(amount) FROM credit_transactions ct WHERE ct.merchant_id = m.id AND ct.type = 'purchase') as total_credits_bought,
    (SELECT COUNT(*) FROM credit_transactions ct WHERE ct.merchant_id = m.id AND ct.type = 'settlement_fee') as total_settlements
FROM merchants m;

-- ============================================================
-- STEP 7: Clean up unused tables (optional)
-- ============================================================

-- These tables may no longer be needed:
-- DROP TABLE IF EXISTS gas_tracking;        -- If not using gas tracking
-- DROP TABLE IF EXISTS auth_nonces;         -- If not using nonce tracking
-- DROP TABLE IF EXISTS transaction_events;  -- If not using event logging

-- Keep for now - uncomment when confirmed not needed

-- ============================================================
-- STEP 8: Verify migration
-- ============================================================

-- Check merchants table structure
-- DESCRIBE merchants;

-- Check transactions table structure
-- DESCRIBE transactions;

-- Check credit balances
-- SELECT auth_address, credit_balance, status FROM merchants;

-- Commit transaction
COMMIT;

-- ============================================================
-- POST-MIGRATION NOTES
-- ============================================================
--
-- 1. Update Rust code to use new schema:
--    - Remove merchant_address from CreateTransaction
--    - Remove mime_type from CreateTransaction  
--    - Add credit_cost handling
--    - Update Merchant struct (remove tier-based rate limits, add credits)
--
-- 2. Rate limiting now uses fixed limits:
--    - Unauthenticated: 200/min
--    - Authenticated: 1500/min
--    - No more tier-based limits
--
-- 3. Credit deduction per settlement:
--    - 1 credit = 1 settlement
--    - Check credit_balance before settlement
--    - Deduct after successful settlement
--
-- 4. Future: Remove deprecated columns
--    - private_key (after confirming not needed)
--    - tier, verify_limit, settle_limit, rate_limit_window (after code update)
--
