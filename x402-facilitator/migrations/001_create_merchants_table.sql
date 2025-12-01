-- Create merchants table for API key management
CREATE TABLE IF NOT EXISTS merchants (
    id INT AUTO_INCREMENT PRIMARY KEY,
    merchant_address VARCHAR(42) NOT NULL UNIQUE,
    api_key VARCHAR(80) NOT NULL UNIQUE,
    private_key VARCHAR(66) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE,
    INDEX idx_api_key (api_key),
    INDEX idx_merchant_address (merchant_address),
    INDEX idx_is_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Example: Insert a merchant
-- INSERT INTO merchants (merchant_address, api_key, private_key) 
-- VALUES (
--     '0x7b5f1298f62ce5127B2f86E0AFfE37a7437D7ebD',
--     'sk_live_abc123...',
--     '0xa1f46be742d1b3114bf15d5ac73b7407259e67c47529b9c9904911d0e234d909'
-- );
