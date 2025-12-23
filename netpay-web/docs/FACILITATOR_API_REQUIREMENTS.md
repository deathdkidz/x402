# Facilitator API Endpoints for NetPay Dashboard

## Overview

The NetPay web dashboard needs the following API endpoints to be implemented in the x402-facilitator app. These endpoints handle merchant authentication, session management, and dashboard data retrieval.

All endpoints should:
- Use the existing MySQL database connection
- Validate the `X-API-Key` header for internal API calls
- Return JSON responses with `{ success: true, data: ... }` or `{ success: false, error: "..." }` format

---

## 1. Authentication Endpoints

### POST `/merchant/auth`

Authenticate a merchant wallet. If wallet doesn't exist, create new merchant account.

**Request Body:**
```json
{
  "address": "0x...",    // Wallet address
  "message": "Sign in to netpay.id\n\nWallet: 0x...\nTimestamp: 2024-12-23T...",
  "signature": "0x..."   // Signed message
}
```

**Logic:**
1. Verify the signature matches the address using ethers.js `verifyMessage()`
2. Normalize address to lowercase
3. Check if merchant exists in `merchants` table by `auth_address`
4. If NOT exists:
   - Create new merchant with:
     - `auth_address` = address
     - `business_name` = "New Merchant" (or generate from address)
     - `api_key` = generate UUID or random string
     - `credit_balance` = 0
     - `status` = "active"
   - Set `isNewUser = true`
5. If exists, set `isNewUser = false`
6. Create session in `merchant_sessions` table:
   - `merchant_id` = merchant.id
   - `session_token` = generate UUID
   - `auth_address` = address
   - `signature` = signature
   - `expires_at` = NOW() + 30 days
7. Update `merchants.last_active_at = NOW()`

**Response:**
```json
{
  "merchant": {
    "id": 1,
    "authAddress": "0x...",
    "businessName": "Acme Corp",
    "apiKey": "pk_live_...",
    "creditBalance": 9394,
    "status": "active",
    "createdAt": "2024-10-01T..."
  },
  "sessionToken": "uuid-session-token",
  "isNewUser": false
}
```

---

### POST `/merchant/session`

Validate a session token and return merchant data.

**Request Body:**
```json
{
  "sessionToken": "uuid-session-token"
}
```

**Logic:**
1. Find session in `merchant_sessions` where `session_token = ?` AND `expires_at > NOW()`
2. If not found, return error
3. Get merchant from `merchants` table
4. Update `merchants.last_active_at = NOW()`

**Response:**
```json
{
  "merchant": {
    "id": 1,
    "authAddress": "0x...",
    "businessName": "Acme Corp",
    "apiKey": "pk_live_...",
    "creditBalance": 9394,
    "status": "active",
    "createdAt": "2024-10-01T..."
  }
}
```

---

### POST `/merchant/logout`

Invalidate a session.

**Request Body:**
```json
{
  "sessionToken": "uuid-session-token"
}
```

**Logic:**
1. Delete from `merchant_sessions` where `session_token = ?`

**Response:**
```json
{
  "success": true
}
```

---

## 2. Dashboard Data Endpoints

### GET `/merchant/:merchantId/dashboard/stats`

Get dashboard overview statistics.

**Response:**
```json
{
  "creditBalance": 9394,
  "totalTransactions": 156,
  "totalVolume": 4523.50,
  "successRate": 98.5,
  "recentTransactions": [
    {
      "id": 123,
      "payerAddress": "0x...",
      "recipientAddress": "0x...",
      "amount": 25.00,
      "asset": "USDC",
      "network": "base",
      "status": "completed",
      "txHash": "0x...",
      "resource": "/api/premium",
      "creditCost": 1,
      "errorMessage": null,
      "createdAt": "2024-12-23T...",
      "updatedAt": "2024-12-23T..."
    }
  ],
  "volumeByDay": [
    { "date": "2024-12-17", "volume": 523.00 },
    { "date": "2024-12-18", "volume": 892.50 }
  ]
}
```

**SQL Queries:**
```sql
-- Get credit balance
SELECT credit_balance FROM merchants WHERE id = ?

-- Get transaction stats
SELECT 
  COUNT(*) as totalTransactions,
  COALESCE(SUM(CASE WHEN status = 'completed' THEN amount / 1000000 END), 0) as totalVolume,
  COUNT(CASE WHEN status = 'completed' THEN 1 END) * 100.0 / NULLIF(COUNT(*), 0) as successRate
FROM transactions WHERE merchant_id = ?

-- Get recent transactions (last 10)
SELECT * FROM transactions WHERE merchant_id = ? ORDER BY created_at DESC LIMIT 10

-- Get volume by day (last 7 days)
SELECT 
  DATE(created_at) as date,
  COALESCE(SUM(CASE WHEN status = 'completed' THEN amount / 1000000 END), 0) as volume
FROM transactions 
WHERE merchant_id = ? AND created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
GROUP BY DATE(created_at)
ORDER BY date
```

---

### GET `/merchant/:merchantId/transactions`

Get paginated transaction list.

**Query Parameters:**
- `page` (default: 1)
- `limit` (default: 20)
- `status` (optional): pending, preconfirmed, completed, failed
- `network` (optional): base, base-sepolia, ethereum
- `search` (optional): search by address or tx hash

**Response:**
```json
{
  "transactions": [...],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 156,
    "totalPages": 8
  }
}
```

**SQL Query:**
```sql
SELECT * FROM transactions 
WHERE merchant_id = ?
  AND (? IS NULL OR status = ?)
  AND (? IS NULL OR network = ?)
  AND (? IS NULL OR payer_address LIKE ? OR transaction_hash LIKE ?)
ORDER BY created_at DESC
LIMIT ? OFFSET ?
```

---

### GET `/merchant/:merchantId/credits`

Get credit balance and history.

**Response:**
```json
{
  "balance": 9394,
  "lifetimePurchased": 10000,
  "lifetimeUsed": 606,
  "usedLast30Days": 45,
  "transactions": [
    {
      "id": 1,
      "type": "purchase",
      "amount": 5000,
      "balanceBefore": 4394,
      "balanceAfter": 9394,
      "description": "Credit purchase",
      "createdAt": "2024-12-20T..."
    }
  ],
  "purchases": [
    {
      "id": 1,
      "network": "base",
      "txHash": "0x...",
      "tokenAmount": 50.00,
      "creditAmount": 5000,
      "status": "confirmed",
      "createdAt": "2024-12-20T..."
    }
  ]
}
```

**SQL Queries:**
```sql
-- Get merchant balance and lifetime stats
SELECT credit_balance, lifetime_credits_purchased, lifetime_credits_used 
FROM merchants WHERE id = ?

-- Get usage last 30 days
SELECT COALESCE(SUM(ABS(amount)), 0) as usedLast30Days
FROM credit_transactions 
WHERE merchant_id = ? AND type = 'settlement_fee' AND created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)

-- Get credit transactions
SELECT * FROM credit_transactions WHERE merchant_id = ? ORDER BY created_at DESC LIMIT 50

-- Get credit purchases
SELECT * FROM credit_purchases WHERE merchant_id = ? ORDER BY created_at DESC LIMIT 20
```

---

### GET `/merchant/:merchantId/analytics`

Get analytics data.

**Query Parameters:**
- `period`: 7d, 30d, 90d, all (default: 30d)

**Response:**
```json
{
  "totalVolume": 4523.50,
  "totalCount": 156,
  "avgTransaction": 29.00,
  "successRate": 98.5,
  "volumeByNetwork": [
    { "name": "base", "value": 4000.00, "percentage": 88.4 },
    { "name": "ethereum", "value": 523.50, "percentage": 11.6 }
  ],
  "volumeByAsset": [
    { "name": "USDC", "value": 4200.00, "percentage": 92.8 },
    { "name": "USDT", "value": 323.50, "percentage": 7.2 }
  ],
  "dailyVolume": [
    { "date": "12/17", "volume": 523.00, "count": 15, "successRate": 100 }
  ],
  "hourlyDistribution": [
    { "hour": 0, "count": 5 },
    { "hour": 1, "count": 3 }
  ]
}
```

---

### GET `/merchant/:merchantId/settings`

Get merchant settings.

**Response:**
```json
{
  "merchant": {
    "id": 1,
    "businessName": "Acme Corp",
    "businessEmail": "contact@acme.com",
    "website": "https://acme.com",
    "walletAddress": "0x...",
    "supportEmail": "support@acme.com",
    "description": "Leading AI solutions provider",
    "apiKey": "pk_live_...",
    "createdAt": "2024-10-01T..."
  },
  "notifications": {
    "emailSettlements": true,
    "emailFailures": true,
    "emailCredits": true,
    "emailWeekly": false,
    "emailMarketing": false
  }
}
```

---

### PUT `/merchant/:merchantId/settings`

Update merchant settings.

**Request Body:**
```json
{
  "merchant": {
    "businessName": "Acme Corp Updated",
    "businessEmail": "new@acme.com",
    "website": "https://acme.com",
    "supportEmail": "support@acme.com",
    "description": "Updated description"
  },
  "notifications": {
    "emailSettlements": true,
    "emailFailures": true,
    "emailCredits": false,
    "emailWeekly": true,
    "emailMarketing": false
  }
}
```

**Response:**
```json
{
  "success": true
}
```

---

## 3. Database Schema Requirements

Make sure these tables exist:

```sql
-- Merchants table (should already exist)
-- Add these columns if missing:
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS business_email VARCHAR(255);
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS website VARCHAR(255);
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS support_email VARCHAR(255);
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMP;

-- Merchant sessions table
CREATE TABLE IF NOT EXISTS merchant_sessions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  merchant_id INT NOT NULL,
  session_token VARCHAR(255) NOT NULL UNIQUE,
  auth_address VARCHAR(42) NOT NULL,
  signature TEXT,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (merchant_id) REFERENCES merchants(id) ON DELETE CASCADE,
  INDEX idx_session_token (session_token),
  INDEX idx_expires_at (expires_at)
);

-- Merchant notification settings (optional - can store as JSON in merchants table)
CREATE TABLE IF NOT EXISTS merchant_notifications (
  id INT AUTO_INCREMENT PRIMARY KEY,
  merchant_id INT NOT NULL UNIQUE,
  email_settlements BOOLEAN DEFAULT TRUE,
  email_failures BOOLEAN DEFAULT TRUE,
  email_credits BOOLEAN DEFAULT TRUE,
  email_weekly BOOLEAN DEFAULT FALSE,
  email_marketing BOOLEAN DEFAULT FALSE,
  FOREIGN KEY (merchant_id) REFERENCES merchants(id) ON DELETE CASCADE
);
```

---

## 4. Security Considerations

1. **API Key Validation**: All endpoints should validate `X-API-Key` header
2. **Signature Verification**: Use ethers.js `verifyMessage()` for wallet auth
3. **Session Expiry**: Clean up expired sessions periodically
4. **Rate Limiting**: Add rate limiting to auth endpoints
5. **Input Validation**: Validate all input parameters

---

## 5. Implementation Notes

1. **File Structure** (suggested):
```
src/
  routes/
    merchant.ts         # All merchant API routes
  services/
    merchantAuth.ts     # Auth logic
    merchantDashboard.ts # Dashboard data logic
  middleware/
    apiKeyAuth.ts       # API key validation middleware
```

2. **Dependencies**:
```bash
npm install ethers uuid
```

3. **Example Route Handler**:
```typescript
// POST /merchant/auth
app.post('/merchant/auth', async (req, res) => {
  try {
    const { address, message, signature } = req.body;
    
    // Verify signature
    const recoveredAddress = ethers.verifyMessage(message, signature);
    if (recoveredAddress.toLowerCase() !== address.toLowerCase()) {
      return res.status(401).json({ success: false, error: 'Invalid signature' });
    }
    
    // Check/create merchant and session...
    const result = await merchantAuthService.authenticate(address, signature);
    
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});
```

---

## 6. Testing

Test the endpoints with these curl commands:

```bash
# Auth
curl -X POST https://api.netpay.id/merchant/auth \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-internal-key" \
  -d '{"address":"0x...","message":"...","signature":"0x..."}'

# Session validation
curl -X POST https://api.netpay.id/merchant/session \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-internal-key" \
  -d '{"sessionToken":"..."}'

# Dashboard stats
curl https://api.netpay.id/merchant/1/dashboard/stats \
  -H "X-API-Key: your-internal-key"
```
