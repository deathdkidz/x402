# Transaction Status in Nonce Replay Response

## Enhanced Replay Protection

When a nonce has already been used, the facilitator now returns the **transaction hash** and **status** from cache, allowing merchants to check transaction status **without making RPC calls**.

## Response Examples

### 1. Cached Transaction (Fast - No RPC Call)

**Request:** POST `/settle` with already-used nonce

**Response:**
```json
{
  "success": false,
  "network": "base-sepolia",
  "errorReason": "Nonce already used - transaction previously executed",
  "transactionHash": "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
  "transactionStatus": "completed",
  "cached": true
}
```

**Status Values:**
- `"pending"` - Transaction submitted but not yet confirmed
- `"completed"` - Transaction successfully confirmed on-chain
- `"failed"` - Transaction reverted or failed

### 2. On-Chain Detection (Slower - With RPC Call)

If nonce is found on-chain but not in cache (e.g., after restart):

**Response:**
```json
{
  "success": false,
  "network": "base-sepolia",
  "errorReason": "Nonce already used - transaction previously executed (found on-chain)"
}
```

**Note:** Transaction hash not available since we only checked `authorizationState()`. The merchant can check their transaction history in the database.

## Benefits for Merchants

### ✅ Instant Status Checks
```javascript
// Merchant tries to settle payment
const response = await fetch('http://localhost:8080/settle', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer YOUR_API_KEY',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify(payment)
});

const result = await response.json();

if (!result.success && result.transactionHash) {
  // Already processed! Get transaction info WITHOUT RPC call
  console.log(`Already settled: ${result.transactionHash}`);
  console.log(`Status: ${result.transactionStatus}`);
  
  // Show user the transaction immediately
  const explorerUrl = `https://sepolia.basescan.org/tx/${result.transactionHash}`;
  console.log(`View on explorer: ${explorerUrl}`);
}
```

### ✅ No Database Query Needed
The merchant doesn't need to query their database or make an RPC call - the facilitator returns all necessary information from Redis cache.

### ✅ Idempotent Payments
Safely retry payments without worrying about double-spending:

```javascript
async function processPayment(payment) {
  const result = await settlementAPI.settle(payment);
  
  if (result.success) {
    // New payment successful
    return {
      status: 'success',
      txHash: result.transaction
    };
  }
  
  if (result.transactionHash) {
    // Already processed - idempotent response
    return {
      status: 'already_processed',
      txHash: result.transactionHash,
      previousStatus: result.transactionStatus
    };
  }
  
  // Other error
  throw new Error(result.errorReason);
}
```

## Cache Lifecycle

### 1. First Settlement Request
```
POST /settle
  ↓
Save to DB as 'pending'
  ↓
Submit to blockchain
  ↓
Cache nonce with tx hash + 'pending' status
  ↓
Wait for confirmation
  ↓
Update cache to 'completed' or 'failed'
  ↓
Update DB with final status
```

### 2. Duplicate Settlement Request
```
POST /settle (same nonce)
  ↓
Check Redis cache
  ↓
Found! Return immediately:
{
  transactionHash: "0x...",
  transactionStatus: "completed",
  cached: true
}
```

**Performance:**
- First request: ~2-5 seconds (blockchain tx)
- Duplicate request: ~1-3ms (cache hit)
- **~1000x faster response for duplicates!**

## Redis Cache Structure

```
Key: nonce:{payerAddress}:{nonceHex}
Value: {
  "transactionHash": "0x...",
  "status": "completed",
  "timestamp": 1733029200000
}
TTL: 86400 seconds (24 hours)
```

## Testing

### Test Replay with Status
```bash
# 1. Make initial payment
curl -X POST http://localhost:8080/settle \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d @payment.json

# Response: { "success": true, "transaction": "0x..." }

# 2. Try same payment again (replay)
curl -X POST http://localhost:8080/settle \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d @payment.json

# Response includes transaction details:
# {
#   "success": false,
#   "errorReason": "Nonce already used...",
#   "transactionHash": "0x...",
#   "transactionStatus": "completed",
#   "cached": true
# }
```

### Check Logs
```
⛔ Nonce found in cache (already used): 0x... for payer: 0x...
   Cached transaction: 0x1234...abcd (completed)
```

## Frontend Integration Example

```typescript
interface SettlementResult {
  success: boolean;
  transaction?: string;
  transactionHash?: string;
  transactionStatus?: 'pending' | 'completed' | 'failed';
  errorReason?: string;
  cached?: boolean;
}

async function handlePayment(payment: Payment): Promise<void> {
  const result: SettlementResult = await settlementAPI.settle(payment);
  
  if (result.success) {
    showSuccess(`Payment confirmed: ${result.transaction}`);
    return;
  }
  
  // Check if payment was already processed
  if (result.transactionHash) {
    const status = result.transactionStatus;
    
    if (status === 'completed') {
      showSuccess(`Already paid! Transaction: ${result.transactionHash}`);
      unlockContent(); // Grant access
    } else if (status === 'pending') {
      showPending(`Payment processing: ${result.transactionHash}`);
      pollForConfirmation(result.transactionHash);
    } else if (status === 'failed') {
      showError(`Previous attempt failed: ${result.transactionHash}`);
      retryWithNewNonce();
    }
    return;
  }
  
  // Other error
  showError(result.errorReason);
}
```

## Monitoring

Track cache hit rates:
```bash
redis-cli INFO stats | grep keyspace_hits
redis-cli INFO stats | grep keyspace_misses
```

View cached nonces:
```bash
redis-cli KEYS "nonce:*"
```

Inspect specific nonce:
```bash
redis-cli GET "nonce:0xPAYER_ADDRESS:0xNONCE_HEX"
# Returns: {"transactionHash":"0x...","status":"completed","timestamp":1733029200000}
```

## Summary

**Before:**
```json
{
  "success": false,
  "errorReason": "Nonce already used"
}
```
*Merchant needs to query DB or blockchain to find transaction*

**After:**
```json
{
  "success": false,
  "errorReason": "Nonce already used - transaction previously executed",
  "transactionHash": "0x...",
  "transactionStatus": "completed",
  "cached": true
}
```
*Merchant gets everything instantly - no extra calls needed!*
