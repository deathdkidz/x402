# X402 Database Schema Reference

## Current Schema (After Wallet Auth Update)

### merchants
```sql
CREATE TABLE merchants (
  id INT AUTO_INCREMENT PRIMARY KEY,
  
  -- Wallet Addresses
  auth_address VARCHAR(42) NOT NULL UNIQUE,        -- PRIMARY: Dashboard login, API identity, payment recipient
  topup_address VARCHAR(42) NOT NULL UNIQUE,       -- OPTIONAL: Deposits only
  
  -- Business Info
  business_name VARCHAR(255) NULL,
  email VARCHAR(255) NULL,
  profile_image_url VARCHAR(512) NULL,
  
  -- API Credentials
  api_key VARCHAR(80) NOT NULL UNIQUE,
  private_key VARCHAR(66) NOT NULL,                -- Topup wallet key (for deposits)
  
  -- Account Settings
  tier VARCHAR(20) DEFAULT 'free',
  is_active BOOLEAN DEFAULT TRUE,
  
  -- Rate Limits
  verify_limit INT DEFAULT 60,
  settle_limit INT DEFAULT 20,
  rate_limit_window INT DEFAULT 60,
  
  -- Webhooks
  webhook_url VARCHAR(255) NULL,
  webhook_secret VARCHAR(64) NULL,
  webhook_events VARCHAR(255) DEFAULT 'transaction.completed,transaction.failed',
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  INDEX idx_topup_address (topup_address),
  INDEX idx_auth_address (auth_address),
  INDEX idx_api_key (api_key),
  INDEX idx_tier (tier),
  INDEX idx_is_active (is_active),
  INDEX idx_email (email)
);
```

### auth_nonces
```sql
CREATE TABLE auth_nonces (
  id INT AUTO_INCREMENT PRIMARY KEY,
  auth_address VARCHAR(42) NOT NULL,
  nonce VARCHAR(128) NOT NULL UNIQUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NOT NULL,                -- 5 minutes from creation
  used BOOLEAN DEFAULT FALSE,
  
  INDEX idx_auth_address (auth_address),
  INDEX idx_nonce (nonce),
  INDEX idx_expires_at (expires_at),
  INDEX idx_used (used)
);
```

### merchant_sessions
```sql
CREATE TABLE merchant_sessions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  merchant_id INT NOT NULL,
  session_token VARCHAR(128) NOT NULL UNIQUE,
  auth_address VARCHAR(42) NOT NULL,
  nonce VARCHAR(128) NOT NULL,
  signature TEXT NULL,
  expires_at TIMESTAMP NOT NULL,                -- 30 days from creation
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  ip_address VARCHAR(45) NULL,
  user_agent TEXT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  
  FOREIGN KEY (merchant_id) REFERENCES merchants(id),
  INDEX idx_merchant_id (merchant_id),
  INDEX idx_session_token (session_token),
  INDEX idx_auth_address (auth_address),
  INDEX idx_expires_at (expires_at),
  INDEX idx_is_active (is_active)
);
```

### transactions
```sql
CREATE TABLE transactions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  
  -- Payment Details
  recipient_address VARCHAR(42) NOT NULL,       -- Merchant's topup_address
  payer_address VARCHAR(42) NOT NULL,
  amount VARCHAR(100) NOT NULL,
  asset VARCHAR(42) NOT NULL,
  network VARCHAR(50) NOT NULL,
  
  -- ERC-3009 Data
  nonce VARCHAR(66) NULL,
  valid_after BIGINT NULL,
  valid_before BIGINT NULL,
  signature TEXT NULL,
  
  -- Resource Info
  resource VARCHAR(255) NULL,
  description TEXT NULL,
  mime_type VARCHAR(100) NULL,
  
  -- Transaction Status
  transaction_hash VARCHAR(66) NULL,
  status ENUM('pending', 'completed', 'failed') DEFAULT 'pending',
  timeout_at TIMESTAMP NULL,
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  INDEX idx_recipient (recipient_address),
  INDEX idx_payer (payer_address),
  INDEX idx_nonce (nonce),
  INDEX idx_status (status),
  INDEX idx_created_at (created_at)
);
```

### webhook_deliveries
```sql
CREATE TABLE webhook_deliveries (
  id INT AUTO_INCREMENT PRIMARY KEY,
  transaction_id INT NOT NULL,
  webhook_url VARCHAR(255) NOT NULL,
  event VARCHAR(50) NOT NULL,
  status ENUM('success', 'failed') NOT NULL,
  response_code INT NULL,
  attempts INT DEFAULT 1,
  error_message TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (transaction_id) REFERENCES transactions(id),
  INDEX idx_transaction_id (transaction_id)
);
```

### gas_tracking
```sql
CREATE TABLE gas_tracking (
  id INT AUTO_INCREMENT PRIMARY KEY,
  transaction_hash VARCHAR(66) NOT NULL,
  network VARCHAR(50) NOT NULL,
  operation_type VARCHAR(50) NOT NULL,
  gas_used BIGINT NOT NULL,
  gas_price VARCHAR(100) NOT NULL,
  gas_cost_eth VARCHAR(100) NOT NULL,
  gas_cost_usd DECIMAL(20, 8) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  INDEX idx_network (network),
  INDEX idx_operation_type (operation_type),
  INDEX idx_created_at (created_at)
);
```

---

## Key Relationships

```
merchants
  ├── auth_address → transactions.recipient_address (PRIMARY)
  ├── auth_address → auth_nonces.auth_address
  │                → merchant_sessions.auth_address
  ├── topup_address (for deposits only)
  └── id → merchant_sessions.merchant_id

transactions
  └── id → webhook_deliveries.transaction_id

merchant_sessions
  └── merchant_id → merchants.id
```

---

## Common Queries

### Get Merchant by Auth Wallet (Primary)
```sql
SELECT * FROM merchants 
WHERE auth_address = '0x...' 
AND is_active = TRUE;
```

### Get Merchant by Topup Address (Deposits)
```sql
SELECT * FROM merchants 
WHERE topup_address = '0x...' 
AND is_active = TRUE;
```

### Get Active Session
```sql
SELECT * FROM merchant_sessions 
WHERE session_token = '...' 
AND is_active = TRUE 
AND expires_at > NOW();
```

### Get Valid Nonce
```sql
SELECT * FROM auth_nonces 
WHERE nonce = '...' 
AND used = FALSE 
AND expires_at > NOW();
```

### Get Merchant Transactions
```sql
SELECT * FROM transactions 
WHERE recipient_address = (
  SELECT auth_address FROM merchants WHERE id = ?
)
ORDER BY created_at DESC;
```

### Cleanup Expired Nonces
```sql
DELETE FROM auth_nonces 
WHERE expires_at < NOW();
```

### Cleanup Expired Sessions
```sql
UPDATE merchant_sessions 
SET is_active = FALSE 
WHERE expires_at < NOW();
```

---

## Field Explanations

### merchants.auth_address
- **PRIMARY** merchant identifier
- Merchant's wallet for dashboard login
- Used as payment recipient in transactions
- API identity (linked to api_key)
- Private key kept by merchant (not stored)
- Used for MetaMask authentication

### merchants.topup_address
- **OPTIONAL** - Only for deposits/top-ups
- Merchant can use this for separate deposit functionality
- Private key stored in `private_key` field
- Not used for regular payment transactions
- Can be same as auth_address or different

### merchants.api_key
- Used for API authentication (Bearer token)
- Random 64-character hex string
- Linked to auth_address

### merchants.private_key
- Private key for topup_address wallet
- Used if merchant implements deposit feature
- Stored encrypted (should be encrypted in production)
- NOT used for regular payment processing

### auth_nonces.nonce
- Random challenge string (64-byte hex)
- Expires in 5 minutes
- One-time use (prevents replay attacks)
- Merchant signs this to authenticate

### merchant_sessions.session_token
- Random session identifier (64-byte hex)
- Expires in 30 days
- Stored in HTTP-only cookie
- Used for authenticated API requests

---

## Security Notes

1. **Nonce Expiration**: Clean up expired nonces regularly
2. **Session Expiration**: Clean up expired sessions regularly
3. **Private Key Storage**: Consider encrypting in production
4. **Session Tokens**: Use HTTPS in production
5. **IP Tracking**: Monitor for suspicious activity
6. **Signature Verification**: Always verify wallet signatures

---

## Indexes for Performance

All frequently queried fields are indexed:
- `topup_address`, `auth_address` - Merchant lookups
- `api_key` - API authentication
- `session_token` - Session validation
- `nonce` - Nonce verification
- `recipient_address`, `payer_address` - Transaction queries
- `status`, `created_at` - Transaction filtering
- `expires_at` - Cleanup queries

---

## Migration from Old Schema

If you have old data with `merchant_address`:

```sql
-- Add new columns if missing
ALTER TABLE merchants 
ADD COLUMN topup_address VARCHAR(42) NULL,
ADD COLUMN auth_address VARCHAR(42) NULL;

-- Migrate data
UPDATE merchants 
SET topup_address = merchant_address,
    auth_address = merchant_address
WHERE topup_address IS NULL;

-- Add constraints
ALTER TABLE merchants 
MODIFY topup_address VARCHAR(42) NOT NULL,
MODIFY auth_address VARCHAR(42) NOT NULL,
ADD UNIQUE KEY (topup_address),
ADD UNIQUE KEY (auth_address);

-- Drop old column
ALTER TABLE merchants DROP COLUMN merchant_address;
```
