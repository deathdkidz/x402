-- Migration V3: Database Cleanup
-- Removes unused columns after business model transformation
-- Date: 2025-12-19

-- =====================================================
-- 1. Remove unused tier-based columns from merchants
-- (Now using credit system with fixed rate limits)
-- =====================================================

-- Store procedures for safe column drops
DELIMITER //

CREATE PROCEDURE IF NOT EXISTS drop_column_if_exists(
    IN p_table VARCHAR(64),
    IN p_column VARCHAR(64)
)
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = DATABASE() 
        AND table_name = p_table 
        AND column_name = p_column
    ) THEN
        SET @sql = CONCAT('ALTER TABLE ', p_table, ' DROP COLUMN ', p_column);
        PREPARE stmt FROM @sql;
        EXECUTE stmt;
        DEALLOCATE PREPARE stmt;
        SELECT CONCAT('Dropped column: ', p_table, '.', p_column) AS result;
    ELSE
        SELECT CONCAT('Column already dropped: ', p_table, '.', p_column) AS result;
    END IF;
END //

DELIMITER ;

-- Drop unused tier columns
CALL drop_column_if_exists('merchants', 'tier');
CALL drop_column_if_exists('merchants', 'verify_limit');
CALL drop_column_if_exists('merchants', 'settle_limit');
CALL drop_column_if_exists('merchants', 'rate_limit_window');

-- Note: Keeping is_active for backward compatibility (Node.js may use it)
-- We'll just rely on status for new code

-- =====================================================
-- 2. Clean up transactions table - remove signature
-- (Signature is only needed during settlement, not stored)
-- =====================================================
CALL drop_column_if_exists('transactions', 'signature');

-- =====================================================
-- 3. Add index for pending transaction monitoring
-- =====================================================
-- Add composite index for efficient pending transaction queries
CREATE INDEX IF NOT EXISTS idx_transactions_status_created 
ON transactions(status, created_at);

-- =====================================================
-- 4. Verify cleanup
-- =====================================================
SELECT 'Merchants table after cleanup:' AS info;
SHOW COLUMNS FROM merchants;

SELECT 'Transactions table after cleanup:' AS info;
SHOW COLUMNS FROM transactions;

-- Cleanup procedure
DROP PROCEDURE IF EXISTS drop_column_if_exists;

SELECT 'Migration V3 complete!' AS status;
