-- =============================================================================
-- x402 FACILITATOR DATABASE MIGRATION: Multi-Token Support
-- =============================================================================
-- 
-- This migration adds support for multiple tokens and transfer types.
-- Run with: sudo mysql x402_facilitator < scripts/schema_multi_token.sql
--
-- Changes:
-- 1. Add token_symbol and transfer_type to transactions table
-- 2. Add supported_tokens table for tracking enabled tokens per merchant
-- 3. Add token_config table for global token configuration
-- 4. Add indexes for multi-token queries
-- =============================================================================

USE x402_facilitator;

-- =============================================================================
-- Add columns to transactions table for multi-token support
-- =============================================================================

-- Add token symbol column (defaults to USDC for backward compatibility)
ALTER TABLE transactions
    ADD COLUMN token_symbol VARCHAR(20) NOT NULL DEFAULT 'USDC' AFTER asset;

-- Add transfer type column (erc3009, erc2612, etc.)
ALTER TABLE transactions
    ADD COLUMN transfer_type ENUM('erc3009', 'erc2612', 'native') NOT NULL DEFAULT 'erc3009' AFTER token_symbol;

-- Add forwarder address (for ERC-2612 permit + transferFrom)
ALTER TABLE transactions
    ADD COLUMN forwarder_address VARCHAR(42) NULL AFTER transfer_type;

-- Add permit deadline for ERC-2612
ALTER TABLE transactions
    ADD COLUMN permit_deadline BIGINT NULL AFTER valid_before;

-- Add index for token queries
ALTER TABLE transactions
    ADD INDEX idx_token_symbol (token_symbol);

ALTER TABLE transactions
    ADD INDEX idx_transfer_type (transfer_type);

ALTER TABLE transactions
    ADD INDEX idx_network_asset (network, asset);

-- =============================================================================
-- TOKEN_CONFIG TABLE
-- =============================================================================
-- Global token configuration for all supported networks and tokens

CREATE TABLE IF NOT EXISTS token_config (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    
    -- Network and Token
    network VARCHAR(50) NOT NULL,
    chain_id INT NOT NULL,
    token_address VARCHAR(42) NOT NULL,
    
    -- Token Info
    symbol VARCHAR(20) NOT NULL,
    name VARCHAR(100) NOT NULL,
    decimals TINYINT NOT NULL DEFAULT 6,
    
    -- Transfer Configuration
    transfer_type ENUM('erc3009', 'erc2612', 'spl', 'native') NOT NULL DEFAULT 'erc3009',
    forwarder_address VARCHAR(42) NULL,
    
    -- EIP-712 Domain (for signature verification)
    eip712_name VARCHAR(100),
    eip712_version VARCHAR(10) DEFAULT '1',
    
    -- Status
    is_enabled TINYINT(1) NOT NULL DEFAULT 1,
    
    -- Cost Configuration (allows token-specific pricing)
    credit_cost_override INT NULL,
    
    -- Timestamps
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    -- Unique constraint
    UNIQUE KEY unique_network_token (network, token_address),
    
    -- Indexes
    INDEX idx_chain_id (chain_id),
    INDEX idx_symbol (symbol),
    INDEX idx_enabled (is_enabled)
) ENGINE=InnoDB;

-- =============================================================================
-- Insert default token configurations
-- =============================================================================

INSERT INTO token_config (network, chain_id, token_address, symbol, name, decimals, transfer_type, eip712_name, eip712_version) VALUES
-- Base Mainnet
('Base', 8453, '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', 'USDC', 'USD Coin', 6, 'erc3009', 'USD Coin', '2'),

-- Ethereum Mainnet
('Ethereum', 1, '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', 'USDC', 'USD Coin', 6, 'erc3009', 'USD Coin', '2'),

-- Optimism Mainnet
('OP Mainnet', 10, '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85', 'USDC', 'USD Coin', 6, 'erc3009', 'USDC', '2'),

-- HyperEVM
('HyperEVM', 999, '0xb88339CB7199b77E23DB6E890353E22632Ba630f', 'USDC', 'USD Coin', 6, 'erc3009', 'USDC', '1'),

-- Base Sepolia (Testnet)
('Base Sepolia', 84532, '0x036CbD53842c5426634e7929541eC2318f3dCF7e', 'USDC', 'USD Coin', 6, 'erc3009', 'USDC', '2'),

-- Ethereum Sepolia (Testnet)
('Ethereum Sepolia', 11155111, '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238', 'USDC', 'USD Coin', 6, 'erc3009', 'USDC', '2'),

-- OP Sepolia (Testnet)
('OP Sepolia', 11155420, '0x5fd84259d66Cd46123540766Be93DFE6D43130D7', 'USDC', 'USD Coin', 6, 'erc3009', 'USDC', '2'),

-- HyperEVM Testnet
('HyperEVM Testnet', 998, '0x2B3370eE501B4a559b57D449569354196457D8Ab', 'USDC', 'USD Coin', 6, 'erc3009', 'USDC', '2')
ON DUPLICATE KEY UPDATE
    symbol = VALUES(symbol),
    name = VALUES(name),
    decimals = VALUES(decimals),
    transfer_type = VALUES(transfer_type),
    eip712_name = VALUES(eip712_name),
    eip712_version = VALUES(eip712_version);

-- =============================================================================
-- MERCHANT_TOKENS TABLE
-- =============================================================================
-- Tracks which tokens each merchant has enabled (for optional token restrictions)

CREATE TABLE IF NOT EXISTS merchant_tokens (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    
    -- Relations
    merchant_id BIGINT NOT NULL,
    token_config_id BIGINT NOT NULL,
    
    -- Settings
    is_enabled TINYINT(1) NOT NULL DEFAULT 1,
    min_amount DECIMAL(36,18) NULL,
    max_amount DECIMAL(36,18) NULL,
    
    -- Timestamps
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    -- Unique constraint
    UNIQUE KEY unique_merchant_token (merchant_id, token_config_id),
    
    -- Foreign Keys
    FOREIGN KEY (merchant_id) REFERENCES merchants(id) ON DELETE CASCADE,
    FOREIGN KEY (token_config_id) REFERENCES token_config(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- =============================================================================
-- FORWARDER_CONTRACTS TABLE
-- =============================================================================
-- Tracks deployed forwarder contracts for ERC-2612 support

CREATE TABLE IF NOT EXISTS forwarder_contracts (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    
    -- Network Info
    network VARCHAR(50) NOT NULL,
    chain_id INT NOT NULL,
    
    -- Contract
    address VARCHAR(42) NOT NULL,
    version VARCHAR(10) NOT NULL DEFAULT '1.0',
    
    -- Status
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    
    -- Deployment Info
    deployed_at TIMESTAMP NULL,
    deploy_tx_hash VARCHAR(66),
    
    -- Timestamps
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    -- Unique constraint
    UNIQUE KEY unique_network_forwarder (network, address),
    
    -- Indexes
    INDEX idx_chain_id (chain_id),
    INDEX idx_active (is_active)
) ENGINE=InnoDB;

-- =============================================================================
-- Add network stats table for tracking per-network performance
-- =============================================================================

CREATE TABLE IF NOT EXISTS network_stats (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    
    -- Network
    network VARCHAR(50) NOT NULL,
    
    -- Date (for daily aggregation)
    stat_date DATE NOT NULL,
    
    -- Transaction counts
    total_transactions INT NOT NULL DEFAULT 0,
    successful_transactions INT NOT NULL DEFAULT 0,
    failed_transactions INT NOT NULL DEFAULT 0,
    
    -- Timing stats (in milliseconds)
    avg_confirmation_time_ms DECIMAL(10,2) NULL,
    min_confirmation_time_ms INT NULL,
    max_confirmation_time_ms INT NULL,
    flashblock_confirmations INT NOT NULL DEFAULT 0,
    
    -- Volume
    total_volume_usd DECIMAL(18,2) NOT NULL DEFAULT 0,
    
    -- Gas stats
    avg_gas_price_gwei DECIMAL(18,9) NULL,
    total_gas_cost_eth DECIMAL(36,18) NOT NULL DEFAULT 0,
    total_gas_cost_usd DECIMAL(18,2) NOT NULL DEFAULT 0,
    
    -- Timestamps
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    -- Unique constraint
    UNIQUE KEY unique_network_date (network, stat_date),
    
    -- Indexes
    INDEX idx_date (stat_date)
) ENGINE=InnoDB;

-- =============================================================================
-- Update existing transactions to have token_symbol based on asset address
-- =============================================================================

-- For Base Mainnet USDC
UPDATE transactions 
SET token_symbol = 'USDC', transfer_type = 'erc3009'
WHERE LOWER(asset) = LOWER('0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913')
  AND token_symbol = 'USDC';

-- For Ethereum Mainnet USDC  
UPDATE transactions 
SET token_symbol = 'USDC', transfer_type = 'erc3009'
WHERE LOWER(asset) = LOWER('0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48')
  AND token_symbol = 'USDC';

-- =============================================================================
-- Create view for transaction analytics with token info
-- =============================================================================

CREATE OR REPLACE VIEW v_transactions_with_token AS
SELECT 
    t.*,
    tc.name as token_name,
    tc.decimals as token_decimals,
    tc.eip712_name,
    tc.eip712_version,
    m.business_name as merchant_name,
    m.auth_address as merchant_address
FROM transactions t
LEFT JOIN token_config tc ON t.network = tc.network AND LOWER(t.asset) = LOWER(tc.token_address)
LEFT JOIN merchants m ON t.merchant_id = m.id;

-- =============================================================================
-- Done!
-- =============================================================================

SELECT 'Multi-token migration completed successfully!' AS status;
