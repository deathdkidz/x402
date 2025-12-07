# Auth Address as Primary Identifier

## Change Summary

Updated the X402 system to use **`auth_address`** as the primary merchant identifier instead of `topup_address`.

## Rationale

- `topup_address` is only used for **deposits/top-ups** (optional functionality)
- `auth_address` is the **main merchant identity** - used for:
  - Dashboard login
  - API authentication
  - Payment recipient (transaction.recipient_address)
  - Rate limiting
  - Webhooks
  - All merchant operations

## What Changed

### Database
- No schema changes needed
- Both `auth_address` and `topup_address` remain in merchants table
- `auth_address` is now the **primary identifier**
- `topup_address` is **optional** (deposits only)

### X402 Facilitator

**Updated Methods:**
- `getMerchantByAddress(address)` - Now queries by `auth_address`
- `updateMerchantTier(merchantAddress, tier)` - Uses `auth_address`
- `getMerchantRateLimits(merchantAddress)` - Uses `auth_address`
- `createMerchant()` - Returns merchant by `auth_address`

**Updated Services:**
- Auth middleware - Logs `merchant.auth_address`
- Rate limiter - Uses `merchant.auth_address`
- Settlement service - Uses `merchant.auth_address`
- Transaction monitor - Looks up merchants by `auth_address`
- Redis cache - Caches by `merchant.auth_address`

**Transaction Flow:**
```
Payment request → Uses merchant.auth_address
   ↓
Save to transactions table → recipient_address = auth_address
   ↓
Webhook notification → Lookup merchant by auth_address
```

### Merchant Dashboard

**Transaction Queries:**
- Now query transactions by `auth_address`
- `topup_address` shown only for display/deposit info

### Merchant Generation Script

**Updated Output:**
```
Auth Address (PRIMARY): 0x...     ← Main identity
Topup Address (for deposits): 0x... ← Optional
```

**Clarified Usage:**
- Auth wallet: PRIMARY - payments, dashboard, API
- Topup wallet: OPTIONAL - deposits only

## Usage Examples

### Create Merchant
```bash
npm run generate:merchant
# Auth address is PRIMARY identifier
# Topup address is for deposits only
```

### API Request
```javascript
// Payment goes to merchant's auth_address
POST /settle
Authorization: Bearer <api_key>
// Recipient will be auth_address
```

### Transaction Query
```sql
-- Get transactions for merchant
SELECT * FROM transactions 
WHERE recipient_address = '<auth_address>'
```

### Dashboard Login
```
1. Connect wallet with auth_address
2. Sign message
3. Get session
4. View transactions (by auth_address)
```

## Migration Notes

### Existing Merchants

If you have existing merchants, no migration needed:
- System now uses `auth_address` for lookups
- `topup_address` remains for deposit functionality
- All existing data works as-is

### Future Deposits

If implementing deposit feature:
1. Merchant sends funds to `topup_address`
2. System credits merchant account
3. Regular payments still go to `auth_address`

## Key Points

✅ **auth_address** = Primary merchant identity
✅ **auth_address** = Payment recipient
✅ **auth_address** = Dashboard login
✅ **auth_address** = API linked identity
✅ **topup_address** = Optional deposits only

## Files Updated

**X402 Facilitator:**
- `src/services/database.ts` - Updated queries
- `src/middleware/auth.ts` - Updated logging
- `src/middleware/rateLimit.ts` - Updated merchant lookup
- `src/routes/index.ts` - Updated settlement
- `src/services/redis.ts` - Updated caching
- `src/services/transactionMonitor.ts` - Updated webhook lookup
- `scripts/generate-merchant-v2.mjs` - Updated messaging

**Merchant Dashboard:**
- `app/api/dashboard/transactions/route.ts` - Query by auth_address

**Documentation:**
- `WALLET_AUTH_MIGRATION_SUMMARY.md`
- `DATABASE_SCHEMA_V2.md`
- `MERCHANT_DASHBOARD_README.md`

## Testing

1. Generate new merchant: `npm run generate:merchant`
2. Note the auth_address (PRIMARY)
3. Use auth_address for all operations
4. topup_address is only for deposits (if needed)

---

**Date:** December 7, 2025
**Status:** ✅ Complete - Build successful, no errors
