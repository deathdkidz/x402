-- =============================================================================
-- Migration: Separate Testnet/Mainnet Balances
-- =============================================================================
-- This migration adds separate balance columns for testnet and mainnet
-- so that testnet purchases don't deplete mainnet balances and vice versa.
--
-- Run: mysql -u root -p x402_facilitator < scripts/migrations/003_separate_testnet_mainnet_balance.sql
-- =============================================================================

USE x402_facilitator;

-- Step 1: Add new balance columns
ALTER TABLE api_keys
    ADD COLUMN mainnet_balance DECIMAL(20, 10) NOT NULL DEFAULT 0.0000000000 AFTER usd_balance,
    ADD COLUMN testnet_balance DECIMAL(20, 10) NOT NULL DEFAULT 0.0000000000 AFTER mainnet_balance,
    ADD COLUMN lifetime_mainnet_purchased DECIMAL(20, 10) NOT NULL DEFAULT 0.0000000000 AFTER lifetime_credits_purchased,
    ADD COLUMN lifetime_testnet_purchased DECIMAL(20, 10) NOT NULL DEFAULT 0.0000000000 AFTER lifetime_mainnet_purchased,
    ADD COLUMN lifetime_mainnet_used DECIMAL(20, 10) NOT NULL DEFAULT 0.0000000000 AFTER lifetime_credits_used,
    ADD COLUMN lifetime_testnet_used DECIMAL(20, 10) NOT NULL DEFAULT 0.0000000000 AFTER lifetime_mainnet_used;

-- Step 2: Migrate existing balances
-- Assume all existing balances are mainnet (conservative approach)
UPDATE api_keys SET mainnet_balance = usd_balance;
UPDATE api_keys SET lifetime_mainnet_purchased = lifetime_credits_purchased;
UPDATE api_keys SET lifetime_mainnet_used = lifetime_credits_used;

-- Step 3: Add network column to credit_purchases if it doesn't exist
ALTER TABLE credit_purchases
    ADD COLUMN IF NOT EXISTS network VARCHAR(64) DEFAULT NULL AFTER payment_reference,
    ADD COLUMN IF NOT EXISTS is_testnet BOOLEAN DEFAULT FALSE AFTER network,
    ADD COLUMN IF NOT EXISTS payer_address VARCHAR(42) DEFAULT NULL AFTER is_testnet,
    ADD COLUMN IF NOT EXISTS transaction_hash VARCHAR(66) DEFAULT NULL AFTER payer_address;

-- Step 4: Add network_type to credit_ledger for tracking
ALTER TABLE credit_ledger
    ADD COLUMN IF NOT EXISTS network_type ENUM('mainnet', 'testnet') DEFAULT 'mainnet' AFTER entry_type;

-- Step 5: Update indexes
ALTER TABLE credit_purchases ADD INDEX IF NOT EXISTS idx_is_testnet (is_testnet);
ALTER TABLE credit_ledger ADD INDEX IF NOT EXISTS idx_network_type (network_type);

-- =============================================================================
-- Note: The usd_balance column is kept for backward compatibility and represents
-- the TOTAL balance (mainnet + testnet). It can be used for quick total checks.
-- 
-- After this migration:
-- - usd_balance = mainnet_balance + testnet_balance (maintained by triggers/code)
-- - mainnet_balance: Balance for mainnet transactions
-- - testnet_balance: Balance for testnet transactions (free credits, etc.)
-- =============================================================================

-- Optional: Create a trigger to keep usd_balance in sync
DELIMITER //
CREATE TRIGGER IF NOT EXISTS update_total_balance_insert
BEFORE UPDATE ON api_keys
FOR EACH ROW
BEGIN
    SET NEW.usd_balance = NEW.mainnet_balance + NEW.testnet_balance;
    SET NEW.lifetime_credits_purchased = NEW.lifetime_mainnet_purchased + NEW.lifetime_testnet_purchased;
    SET NEW.lifetime_credits_used = NEW.lifetime_mainnet_used + NEW.lifetime_testnet_used;
END//
DELIMITER ;

-- Verify migration
SELECT 
    'Migration 003 Complete' as status,
    COUNT(*) as total_api_keys,
    SUM(mainnet_balance) as total_mainnet_balance,
    SUM(testnet_balance) as total_testnet_balance,
    SUM(usd_balance) as total_combined_balance
FROM api_keys;
