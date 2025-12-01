-- Add webhook configuration to merchants table
ALTER TABLE merchants
  ADD COLUMN webhook_url VARCHAR(255) DEFAULT NULL,
  ADD COLUMN webhook_secret VARCHAR(64) DEFAULT NULL,
  ADD COLUMN webhook_events VARCHAR(255) DEFAULT 'transaction.completed,transaction.failed';

-- Index for active webhooks
CREATE INDEX idx_webhook_enabled ON merchants(webhook_url);
