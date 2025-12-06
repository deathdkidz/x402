-- =====================================================
-- 006: Create webhook_deliveries table for tracking
-- =====================================================

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
  FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Add index for merchant webhook analysis
CREATE INDEX idx_webhook_url ON webhook_deliveries(webhook_url);

-- Add index for event type filtering
CREATE INDEX idx_event ON webhook_deliveries(event);
