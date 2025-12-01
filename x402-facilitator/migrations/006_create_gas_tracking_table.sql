-- Create gas_tracking table for monitoring blockchain gas usage
CREATE TABLE IF NOT EXISTS gas_tracking (
    id INT AUTO_INCREMENT PRIMARY KEY,
    transaction_id INT NULL,
    merchant_id INT NULL,
    operation_type VARCHAR(50) NOT NULL COMMENT 'settlement, authorization_check, balance_check, etc.',
    network VARCHAR(50) NOT NULL COMMENT 'base-sepolia, eth-sepolia, bsc-testnet',
    transaction_hash VARCHAR(66) NULL COMMENT 'Blockchain tx hash if successful',
    gas_token VARCHAR(10) NOT NULL COMMENT 'ETH, BNB, MATIC, etc.',
    gas_used BIGINT NULL COMMENT 'Actual gas units consumed',
    gas_price VARCHAR(50) NULL COMMENT 'Gas price in wei',
    gas_cost_wei VARCHAR(50) NULL COMMENT 'Total gas cost in wei',
    gas_cost_native DECIMAL(30, 18) NULL COMMENT 'Gas cost in native token (ETH/BNB)',
    gas_cost_usd DECIMAL(10, 4) NULL COMMENT 'Estimated USD cost at time of tx',
    balance_before VARCHAR(50) NULL COMMENT 'Native token balance before tx',
    balance_after VARCHAR(50) NULL COMMENT 'Native token balance after tx',
    status VARCHAR(20) NOT NULL DEFAULT 'success' COMMENT 'success, failed, reverted',
    error_message TEXT NULL COMMENT 'Error details if failed',
    block_number BIGINT NULL,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    INDEX idx_transaction_id (transaction_id),
    INDEX idx_merchant_id (merchant_id),
    INDEX idx_network (network),
    INDEX idx_operation_type (operation_type),
    INDEX idx_status (status),
    INDEX idx_timestamp (timestamp),
    INDEX idx_network_operation (network, operation_type),
    
    FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE SET NULL,
    FOREIGN KEY (merchant_id) REFERENCES merchants(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
