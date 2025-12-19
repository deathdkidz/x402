-- Migration V4: Database Cleanup and Constraint Fix
-- Date: 2025-12-19
-- 
-- Issues fixed:
-- 1. merchant_id should NOT be NULL (was nullable)
-- 2. nonce should NOT be NULL (was nullable)
-- 3. Duplicate indexes (unique_payer_nonce, idx_payer_nonce_unique, idx_payer_nonce)
-- 4. Clear old test data
-- 5. Reset merchant credits for fresh start

-- =====================================================
-- 1. TRUNCATE OLD DATA (clean slate)
-- =====================================================
SET FOREIGN_KEY_CHECKS = 0;

TRUNCATE TABLE transactions;
TRUNCATE TABLE credit_transactions;
TRUNCATE TABLE credit_purchases;
TRUNCATE TABLE webhook_deliveries;
TRUNCATE TABLE transaction_events;
TRUNCATE TABLE gas_tracking;
TRUNCATE TABLE auth_nonces;
TRUNCATE TABLE merchant_sessions;

SET FOREIGN_KEY_CHECKS = 1;

SELECT 'Cleared all transaction data' AS status;

-- =====================================================
-- 2. REMOVE DUPLICATE INDEXES
-- =====================================================
DROP INDEX IF EXISTS idx_payer_nonce_unique ON transactions;
DROP INDEX IF EXISTS idx_payer_nonce ON transactions;
-- Keep only unique_payer_nonce (the unique constraint)

SELECT 'Removed duplicate indexes' AS status;

-- =====================================================
-- 3. FIX COLUMN CONSTRAINTS
-- =====================================================

-- Make merchant_id NOT NULL (with a proper foreign key later)
ALTER TABLE transactions 
  MODIFY COLUMN merchant_id bigint NOT NULL,
  MODIFY COLUMN nonce varchar(66) NOT NULL,
  MODIFY COLUMN valid_after bigint NOT NULL DEFAULT 0,
  MODIFY COLUMN valid_before bigint NOT NULL DEFAULT 4102444800;

SELECT 'Fixed column constraints' AS status;

-- =====================================================
-- 4. UPDATE MERCHANT DATA
-- =====================================================
UPDATE merchants SET
  business_name = 'NetPay Demo',
  credit_balance = 10000,
  lifetime_credits_purchased = 10000,
  lifetime_credits_used = 0,
  status = 'active',
  last_active_at = NOW()
WHERE id = 1;

SELECT 'Updated merchant data' AS status;

-- =====================================================
-- 5. VERIFY FINAL STATE
-- =====================================================
SELECT 'Final transactions table:' AS info;
SHOW COLUMNS FROM transactions WHERE Field IN ('merchant_id', 'nonce', 'valid_after', 'valid_before');

SELECT 'Final merchant state:' AS info;
SELECT id, auth_address, business_name, credit_balance, lifetime_credits_purchased, lifetime_credits_used, status 
FROM merchants;

SELECT 'Migration V4 complete!' AS status;
