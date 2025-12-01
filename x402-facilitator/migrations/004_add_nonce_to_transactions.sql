-- Add nonce and additional fields to transactions table
ALTER TABLE transactions 
  ADD COLUMN nonce VARCHAR(66) AFTER payer_address,
  ADD COLUMN valid_after BIGINT AFTER nonce,
  ADD COLUMN valid_before BIGINT AFTER valid_after,
  ADD COLUMN signature TEXT AFTER valid_before,
  ADD INDEX idx_nonce (nonce),
  ADD INDEX idx_payer_nonce (payer_address, nonce),
  ADD UNIQUE KEY unique_payer_nonce (payer_address, nonce);

-- Add timeout tracking for pending transactions
ALTER TABLE transactions
  ADD COLUMN timeout_at TIMESTAMP NULL AFTER updated_at;

-- Index for finding stuck pending transactions
CREATE INDEX idx_pending_timeout ON transactions(status, timeout_at);
