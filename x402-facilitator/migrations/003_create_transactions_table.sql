-- Create transactions table for tracking payments
CREATE TABLE IF NOT EXISTS transactions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  merchant_address VARCHAR(42) NOT NULL,
  payer_address VARCHAR(42) NOT NULL,
  amount VARCHAR(100) NOT NULL,
  asset VARCHAR(42) NOT NULL,
  network VARCHAR(50) NOT NULL,
  transaction_hash VARCHAR(66),
  status ENUM('pending', 'completed', 'failed') DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_merchant (merchant_address),
  INDEX idx_payer (payer_address),
  INDEX idx_status (status),
  INDEX idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
