# Dropped Transaction Handling

## Overview

The x402 facilitator now detects and handles dropped transactions (transactions removed from the mempool without being mined).

## Why Transactions Get Dropped

1. **Gas price too low** - Network congestion caused validators to evict low-fee transactions
2. **Mempool full** - Node's transaction pool exceeded capacity
3. **Nonce gap** - Earlier transaction from same address wasn't confirmed first
4. **Node restart** - Some nodes clear mempool on restart
5. **Network congestion** - During high activity, low-priority txs get dropped

## Detection

### Transaction Monitor Detection
```typescript
// Check every 30 seconds for pending transactions
const receipt = await provider.getTransactionReceipt(txHash);
const pendingTx = await provider.getTransaction(txHash);

if (!receipt && !pendingTx) {
  // Transaction NOT in mempool and NOT mined = DROPPED!
  console.log('Transaction dropped from mempool');
}
```

### Status Checks
- `getTransactionReceipt(hash)` returns `null` → Not mined yet
- `getTransaction(hash)` returns `null` → Not in mempool
- **Both null = DROPPED**

## Current Handling

### 1. Detection & Logging
```typescript
if (!receipt && !pendingTx) {
  // Log to transaction_events table
  await db.logTransactionEvent({
    transactionId: tx.id,
    transactionHash: tx.transaction_hash,
    eventType: 'dropped',
    fromStatus: tx.status,
    toStatus: 'failed',
    errorMessage: 'Transaction dropped from mempool',
  });
}
```

### 2. Nonce Availability Check
```typescript
// Check if nonce is still unused on-chain
const tokenContract = new ethers.Contract(tokenAddress, ABI, provider);
const isNonceUsed = await tokenContract.authorizationState(payer, nonce);

if (!isNonceUsed) {
  // Nonce still available - merchant can request user to retry
  console.log('✓ Nonce available for retry');
} else {
  // Nonce was used in another transaction
  console.log('✗ Nonce already consumed on-chain');
}
```

### 3. Status Update
```typescript
// Mark as failed
await db.updateTransaction(tx.id, 'failed', tx.transaction_hash);
await redis.cacheUsedNonce(payer, nonce, tx.transaction_hash, 'failed');

// Send webhook notification
await webhookService.sendWebhook(merchantWebhook, {
  event: 'transaction.failed',
  transactionId: tx.id,
  reason: 'dropped_from_mempool',
  nonceStillAvailable: true, // If nonce check succeeded
});
```

## Automatic Rebroadcast Logic

### When We CAN Auto-Resubmit ✅

The facilitator **automatically rebroadcasts** dropped transactions if:

1. ✅ **Nonce is still unused on-chain** (check via `authorizationState()`)
2. ✅ **Signature is still valid** (`currentTime <= validBefore`)
3. ✅ **Original transaction data available** (stored in database)

```typescript
// Check eligibility
const isNonceUsed = await tokenContract.authorizationState(payer, nonce);
const signatureValid = currentTime <= validBefore;

if (!isNonceUsed && signatureValid) {
  // ✅ Automatic rebroadcast!
  const rebroadcastTx = await tokenContract.transferWithAuthorization(
    from, to, value, validAfter, validBefore, nonce, v, r, s
  );
  
  logger.info(`Rebroadcast successful: ${rebroadcastTx.hash}`);
}
```

### When We CANNOT Auto-Resubmit ❌

Manual retry required if:

1. ❌ **Signature expired** (`currentTime > validBefore`)
   - Need new signature from user with later `validBefore`
2. ❌ **Nonce already used** (consumed by another transaction)
   - User must create payment with new nonce

### Standard Ethereum Transactions (for comparison)
```
✓ CAN auto-resubmit because:

1. We have paymaster's private key
2. Can create new signature with higher gas price
3. Can bump gas price (replacement transaction)
```

## Merchant Integration

### Handling Dropped Transactions

```typescript
// Webhook payload
{
  "event": "transaction.failed",
  "transactionId": 12345,
  "transactionHash": "0x...",
  "reason": "dropped_from_mempool",
  "nonceStillAvailable": true,
  "timestamp": 1733029200
}
```

### Retry Flow

```
User submits payment
    ↓
Facilitator receives flashblock preconfirmation (200ms)
    ↓
Merchant grants access
    ↓
[30s later] Transaction dropped from mempool
    ↓
Facilitator detects drop, checks nonce
    ↓
Webhook sent to merchant: "transaction.failed"
    ↓
Merchant displays error: "Payment failed, please retry"
    ↓
User clicks "Retry Payment"
    ↓
Client generates NEW signature (same or new nonce)
    ↓
Retry succeeds
```

### Merchant Response Options

**If nonce still available:**
```typescript
// Option 1: Ask user to retry payment
displayError("Payment failed. Please try again.");
showRetryButton();
```

**If nonce already consumed:**
```typescript
// Payment may have succeeded in another transaction
// Check transaction_events for the nonce
const events = await getTransactionEvents(transactionId);
const maybeCompleted = events.find(e => e.event_type === 'completed');

if (maybeCompleted) {
  grantAccess(); // Payment did go through eventually
} else {
  displayError("Payment failed. Please use a different payment method.");
}
```

## Database Schema

### transaction_events Table
```sql
CREATE TABLE transaction_events (
  id INT AUTO_INCREMENT PRIMARY KEY,
  transaction_id INT NOT NULL,
  transaction_hash VARCHAR(66) NOT NULL,
  event_type ENUM(
    'submitted',
    'pending',
    'preconfirmed',
    'completed',
    'failed',
    'reorg_detected',
    'dropped',        -- Transaction removed from mempool
    'replaced',       -- Gas price bump (future)
    'rebroadcast',    -- Manual resubmit (future)
    'canonical_confirmed'
  ),
  from_status VARCHAR(20),
  to_status VARCHAR(20),
  error_message TEXT,
  event_data JSON,  -- { nonceStillAvailable: true }
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## Statistics & Monitoring

### Query Dropped Transactions
```sql
-- Get all dropped transactions
SELECT t.*, e.error_message, e.event_data
FROM transactions t
JOIN transaction_events e ON t.id = e.transaction_id
WHERE e.event_type = 'dropped'
ORDER BY e.created_at DESC;

-- Count dropped transactions by network
SELECT network, COUNT(*) as dropped_count
FROM transactions t
JOIN transaction_events e ON t.id = e.transaction_id
WHERE e.event_type = 'dropped'
GROUP BY network;

-- Dropped rate (should be < 1%)
SELECT 
  (SELECT COUNT(*) FROM transaction_events WHERE event_type = 'dropped') as dropped,
  (SELECT COUNT(*) FROM transactions) as total,
  (SELECT COUNT(*) FROM transaction_events WHERE event_type = 'dropped') * 100.0 / 
  (SELECT COUNT(*) FROM transactions) as dropped_percentage;
```

### Logs
```bash
# Watch for dropped transactions
pm2 logs x402-facilitator | grep "DROPPED from mempool"

# Check nonce availability for dropped txs
pm2 logs x402-facilitator | grep "Nonce.*still unused"
```

## Future Enhancements

### Automatic Gas Price Monitoring
```typescript
// Future: Detect low gas price BEFORE submission
const currentGasPrice = await provider.getFeeData();
const networkCongestion = await checkMempool();

if (networkCongestion > 80%) {
  // Increase gas price by 20%
  const adjustedGasPrice = currentGasPrice.gasPrice * 1.2;
}
```

### Smart Retry Logic
```typescript
// Future: Merchant API endpoint for retry
POST /transaction/:id/retry
{
  "newSignature": "0x...",
  "newValidBefore": 1733030000
}

// Resubmits with new signature if nonce still available
```

### Gas Price Bumping (Non-ERC3009 only)
```typescript
// Future: For facilitator's own transactions
async function bumpGasPrice(txHash: string) {
  const tx = await provider.getTransaction(txHash);
  const newGasPrice = tx.gasPrice * 1.1; // 10% increase
  
  const replacementTx = await wallet.sendTransaction({
    ...tx,
    gasPrice: newGasPrice,
  });
  
  return replacementTx.hash;
}
```

## Rebroadcast Flow

```
Transaction submitted
    ↓
Flashblock preconfirmation received (200ms)
    ↓
Merchant grants access to user
    ↓
[Background] Monitor detects drop (30-60s later)
    ↓
Check nonce: unused ✓
Check signature: valid until 2025-12-10 18:00 ✓
    ↓
🔄 AUTOMATIC REBROADCAST
    ↓
Transaction resubmitted with same signature
    ↓
New transaction hash assigned
    ↓
Database updated: old_hash → new_hash
    ↓
Redis updated with new hash
    ↓
Event logged: 'rebroadcast' (old_hash → new_hash)
    ↓
Monitor continues checking new hash
    ↓
✅ Transaction confirmed
```

### Rebroadcast Success Rate

**Expected:**
- 95%+ automatic rebroadcast success
- Most drops happen within signature validity window
- Typical signature validity: 1 hour

**Failures:**
- 5% require manual retry (signature expired or nonce consumed)

## Summary

**Current Behavior:**
- ✅ Detects dropped transactions (getTransaction + getTransactionReceipt)
- ✅ Checks nonce availability on-chain (authorizationState)
- ✅ Validates signature expiration (validBefore timestamp)
- ✅ **Automatically rebroadcasts if nonce unused + signature valid**
- ✅ Logs all events to transaction_events table
- ✅ Sends webhook notifications
- ✅ Updates transaction hash in database if rebroadcast succeeds

**Merchant Action Required (Only if auto-rebroadcast fails):**
- Receive webhook: `transaction.failed` with reason
- Display error message to user
- Provide "Retry Payment" button if signature expired
- User generates new signature and resubmits

**Drop Rate:**
- Expected: < 0.5% on Base/Optimism
- 95%+ automatically recovered via rebroadcast
- Monitor via transaction_events table
- Alert if drops > 1% (indicates gas price too low)
