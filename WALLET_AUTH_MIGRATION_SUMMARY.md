# X402 System Update - Wallet Authentication & Database Schema

## Overview

Updated the X402 payment system to use wallet-based authentication for the merchant dashboard and cleaned up the database schema to support separate topup and auth addresses.

---

## Database Schema Changes

### Merchants Table Updates

**New Structure:**
```sql
- auth_address (varchar(42), UNIQUE) - PRIMARY: Dashboard login, API identity, receives payments
- topup_address (varchar(42), UNIQUE) - OPTIONAL: For deposits/top-ups only
- business_name (varchar(255), NULL) - Optional business name
- api_key (varchar(80), UNIQUE) - For API authentication
- private_key (varchar(66)) - Topup wallet private key
- email (varchar(255), NULL) - Optional contact email
- profile_image_url (varchar(512), NULL) - Optional profile image
- tier, verify_limit, settle_limit, rate_limit_window - Rate limiting
- webhook_url, webhook_secret, webhook_events - Webhook configuration
```

**Removed:**
- `merchant_address` - Replaced by `auth_address` (primary identifier)

### New Tables for Auth

**auth_nonces:**
```sql
- id (auto_increment)
- auth_address (varchar(42)) - Wallet requesting auth
- nonce (varchar(128), UNIQUE) - Random challenge string
- created_at (timestamp)
- expires_at (timestamp) - 5 minute expiration
- used (boolean) - One-time use
```

**merchant_sessions:**
```sql
- id (auto_increment)
- merchant_id (int) - Foreign key to merchants
- session_token (varchar(128), UNIQUE) - Session identifier
- auth_address (varchar(42)) - Wallet that authenticated
- nonce (varchar(128)) - Nonce used for this session
- signature (text) - Signature provided
- expires_at (timestamp) - 30 day expiration
- created_at (timestamp)
- last_activity (timestamp) - Auto-updated
- ip_address (varchar(45))
- user_agent (text)
- is_active (boolean)
```

---

## X402 Facilitator Updates

### 1. Database Service (`src/services/database.ts`)

**Updated Interfaces:**
```typescript
interface Merchant {
  auth_address: string;   // PRIMARY - Dashboard login, API identity, payment recipient
  topup_address: string;  // OPTIONAL - Deposits only
  business_name: string | null;  // NEW
  email: string | null;   // NEW
  profile_image_url: string | null;  // NEW
  // ... existing fields
}

interface AuthNonce { ... }  // NEW
interface MerchantSession { ... }  // NEW
```

**New Methods:**
- `getMerchantByAuthAddress(authAddress)` - Find by auth wallet
- `getMerchantById(id)` - Find by ID
- `getMerchantByAddress(address)` - Now uses `auth_address` (primary)
- `createAuthNonce(authAddress)` - Generate login challenge
- `getAuthNonce(nonce)` - Verify nonce exists
- `markNonceUsed(nonce)` - Prevent replay attacks
- `cleanupExpiredNonces()` - Maintenance
- `createMerchantSession(...)` - Create login session
- `getSessionByToken(token)` - Validate session
- `invalidateSession(token)` - Logout
- `getMerchantSessions(merchantId)` - List active sessions
- `cleanupExpiredSessions()` - Maintenance

**Updated Methods:**
- `getMerchantByAddress()` - Now uses `auth_address` (primary identifier)
- `createMerchant()` - Now requires both topup and auth addresses
- `updateMerchantTier()` - Uses auth_address
- `getMerchantRateLimits()` - Uses auth_address

### 2. Auth Middleware (`src/middleware/auth.ts`)

**Updated:**
- Log messages now use `merchant.auth_address`
- Maintains backward compatibility with existing API key auth

### 3. Other Service Updates

**Rate Limiter:** Uses `merchant.auth_address` for caching
**Transaction Monitor:** Uses `recipient_address` (auth_address) for webhooks
**Settlement Service:** Uses `merchant.auth_address`
**Redis Service:** Updated merchant cache logging

### 4. New Merchant Generation Script

**File:** `scripts/generate-merchant-v2.mjs`

**Features:**
- Generates or imports topup wallet (for deposits only)
- Generates or uses auth wallet (PRIMARY: for payments, dashboard, API)
- Creates API key and webhook secret
- Saves to database with both addresses
- Displays all credentials clearly

**Usage:**
```bash
npm run generate:merchant  # Random wallets
npm run generate:merchant <topup-key> <auth-address>  # Existing keys
npm run generate:merchant <topup-key>  # Topup + random auth
```

---

## Merchant Dashboard (merchant-demo)

### Authentication System

**Wallet-Based Authentication Flow:**

1. **Request Nonce**
   - `POST /api/auth/nonce`
   - Input: `{ authAddress }`
   - Output: `{ nonce, message, expiresAt }`

2. **Sign & Verify**
   - User signs nonce with MetaMask
   - `POST /api/auth/verify`
   - Input: `{ authAddress, nonce, signature }`
   - Output: `{ sessionToken, merchant, expiresAt }`
   - Sets HTTP-only cookie

3. **Session Management**
   - `GET /api/auth/session` - Check auth status
   - `POST /api/auth/logout` - Invalidate session

### API Routes Created

**Authentication:**
- `/api/auth/nonce` - Request authentication challenge
- `/api/auth/verify` - Verify signature and login
- `/api/auth/session` - Get current session
- `/api/auth/logout` - Logout

**Dashboard:**
- `/api/dashboard/settings` - GET/PATCH merchant settings
- `/api/dashboard/transactions` - GET transaction history with pagination

### Frontend Pages

**`/dashboard`** - Main dashboard page
- Wallet connection UI
- Session management
- Account overview
- Quick action links

### Configuration

**Environment Variables (`.env.local`):**
```env
DB_HOST=localhost
DB_PORT=3306
DB_NAME=x402_facilitator
DB_USER=root
DB_PASSWORD=your_password

NODE_ENV=development
NEXT_PUBLIC_APP_URL=http://localhost:3001
```

**Dependencies Added:**
- `mysql2` - Direct database connection

---

## Security Features

### Wallet Authentication
✅ **Cryptographic signatures** - Cannot be phished
✅ **No password storage** - No password database
✅ **Nonce expiration** - 5-minute window
✅ **One-time use nonces** - Prevents replay attacks
✅ **Session tracking** - IP and User-Agent logged
✅ **30-day sessions** - Auto-expire
✅ **HTTP-only cookies** - XSS protection

### API Security
✅ **API key auth** - Existing system maintained
✅ **Rate limiting** - Per-merchant limits
✅ **Webhook HMAC** - Signature verification
✅ **HTTPS validation** - Webhook URLs
✅ **Input validation** - All endpoints

---

## Migration Notes

### For Existing Merchants

If you have existing merchants in the database, you need to:

1. **Add auth_address:**
   ```sql
   UPDATE merchants 
   SET auth_address = topup_address 
   WHERE auth_address IS NULL;
   ```

2. **Or create new merchants:**
   ```bash
   cd x402-facilitator
   npm run generate:merchant
   ```

### Database Compatibility

The system is fully backward compatible:
- Old API endpoints still work
- API key authentication unchanged
- Transactions table unchanged
- Webhook system unchanged

**Only new features:**
- Wallet authentication for dashboard
- Separate topup/auth addresses
- Session management

---

## Key Differences: Old vs New

| Feature | Before | After |
|---------|--------|-------|
| **Authentication** | Username/Password | Wallet Signature |
| **Merchant ID** | `merchant_address` | `auth_address` (primary) + `topup_address` (deposits) |
| **Payment Recipient** | `merchant_address` | `auth_address` |
| **Login** | Email/password form | MetaMask signature |
| **Sessions** | Not implemented | 30-day cookie sessions |
| **Password Reset** | Required | Not needed |
| **Security** | Password hashing | Cryptographic signatures |

---

## Testing the System

### 1. Generate Merchant
```bash
cd x402-facilitator
npm run generate:merchant
# Save the auth_address and import to MetaMask
```

### 2. Start Facilitator
```bash
npm run pm2:restart
```

### 3. Start Dashboard
```bash
cd ../merchant-demo
npm install
npm run dev
```

### 4. Login to Dashboard
1. Open http://localhost:3001/dashboard
2. Click "Connect Wallet"
3. Approve MetaMask connection
4. Sign the authentication message
5. Access dashboard

---

## API Usage Examples

### Request Nonce
```bash
curl -X POST http://localhost:3001/api/auth/nonce \
  -H "Content-Type: application/json" \
  -d '{"authAddress": "0x1234..."}'
```

### Verify Signature
```bash
curl -X POST http://localhost:3001/api/auth/verify \
  -H "Content-Type: application/json" \
  -d '{
    "authAddress": "0x1234...",
    "nonce": "abc123...",
    "signature": "0x5678..."
  }'
```

### Get Settings (with session)
```bash
curl http://localhost:3001/api/dashboard/settings \
  -H "Cookie: session_token=xyz..."
```

---

## Files Modified/Created

### X402 Facilitator
**Modified:**
- `src/services/database.ts` - Added auth methods, updated interfaces
- `src/middleware/auth.ts` - Updated logging
- `src/middleware/rateLimit.ts` - Updated merchant reference
- `src/routes/index.ts` - Updated merchant reference
- `src/services/redis.ts` - Updated logging
- `src/services/transactionMonitor.ts` - Updated merchant lookup
- `package.json` - Added generate:merchant script

**Created:**
- `scripts/generate-merchant-v2.mjs` - New merchant generator

**Deleted:**
- `src/routes/merchants.ts` - Old merchant management
- `scripts/generate-merchant.mjs` - Old generator

### Merchant Demo
**Created:**
- `app/api/auth/nonce/route.ts`
- `app/api/auth/verify/route.ts`
- `app/api/auth/session/route.ts`
- `app/api/auth/logout/route.ts`
- `app/api/dashboard/settings/route.ts`
- `app/api/dashboard/transactions/route.ts`
- `app/dashboard/page.tsx`
- `types/global.d.ts`
- `.env.local`
- `MERCHANT_DASHBOARD_README.md`

**Modified:**
- `package.json` - Added mysql2 dependency

---

## Next Steps

1. **Test wallet authentication** on the dashboard
2. **Update existing merchants** with auth_address
3. **Configure production environment** variables
4. **Set up HTTPS** for dashboard
5. **Test transaction flow** end-to-end
6. **Configure webhooks** in dashboard
7. **Monitor sessions** and clean up expired ones

---

## Support

For issues or questions:
1. Check `MERCHANT_DASHBOARD_README.md`
2. Review API endpoint documentation
3. Check database schema
4. Verify environment variables
5. Test with MetaMask in browser console

---

**Last Updated:** December 7, 2025
**Database Schema Version:** 2.0 (Wallet Auth)
**Facilitator Version:** Updated
**Dashboard Version:** New Implementation
