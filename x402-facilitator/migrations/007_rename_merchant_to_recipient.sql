-- Migration: Rename merchant_address to recipient_address in transactions table
-- This makes it clearer that this is the payment recipient, not necessarily a merchant

ALTER TABLE transactions 
  CHANGE COLUMN merchant_address recipient_address VARCHAR(42) NOT NULL;

-- Update index if it exists
-- Note: The index on merchant_address (if exists) will be automatically renamed
