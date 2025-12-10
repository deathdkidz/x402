# X-402 Payment Flow Explained

## Settlement Process: One Endpoint, Complete Verification

The X-402 facilitator's `/settle` endpoint handles **everything** - it performs all verification internally before executing the blockchain transaction.

### `/settle` Endpoint Does It All

When you call `/settle`, the facilitator performs these checks automatically:

#### **Built-in Verification (Inside /settle)**

**Security Checks (~100ms):**
- ✅ Cryptographic signature validation (EIP-712)
- ✅ Nonce check - Redis cache + on-chain verification
- ✅ Amount validation (matches requirement)
- ✅ Time window validation (validAfter/validBefore)
- ✅ Recipient validation (payTo matches authorization.to)
- ✅ Network and token validation
- ✅ Balance check (payer has sufficient funds)

**Then Blockchain Execution (~5-30 seconds):**
- 📤 Submit transaction to blockchain
- ⏳ Wait for block confirmation
- 💰 Transfer funds from payer to merchant
- ✅ Return success with transaction hash

### Optional `/verify` Endpoint

The `/verify` endpoint is **optional** and meant for merchants who want to:
- Check payment validity BEFORE attempting settlement
- Show users why their payment would fail
- Validate multiple payments without executing them

**Most merchants don't need it** - just call `/settle` directly!

### Merchant Demo Implementation

**Before (Redundant):**
```typescript
// ❌ Double verification - wasteful!
const isValid = await verifyPayment(payment); // Call /verify
if (!isValid) return 402;

const settlement = await settlePayment(payment); // Call /settle (verifies again!)
if (!settlement.success) return 402;
return content;
```

**After (Efficient):**
```typescript
// ✅ Single call - /settle does all verification internally
const settlement = await settlePayment(payment); // Call /settle only
if (!settlement.success) return 402;
return content; // Verification + settlement done in one call
```

### Complete Flow Timeline

```
┌─────────────────────────────────────────────────────────────┐
│ Client sends X-PAYMENT header with signed authorization     │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│ Merchant calls /settle (ONE ENDPOINT)                       │
│                                                              │
│ FACILITATOR DOES INTERNALLY:                                │
│ ├─ [100ms] Decode and validate signature (EIP-712)          │
│ ├─ [50ms] Check nonce in Redis + on-chain                   │
│ ├─ [50ms] Verify amount, time window, recipient             │
│ ├─ [50ms] Check balance (payer has funds)                   │
│ ├─ ✅ All checks passed                                     │
│ ├─ [200ms] Submit transaction to blockchain                 │
│ ├─ [5-30s] Wait for block confirmation                      │
│ └─ ✅ Return success with transaction hash                  │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│ SERVE CONTENT                                               │
│ └─ Payment confirmed, deliver protected resource            │
└─────────────────────────────────────────────────────────────┘
```

### Timing Breakdown

| Step | Time | What Happens |
|------|------|--------------|
| **Merchant → Facilitator** | <100ms | HTTP request |
| **Internal Verification** | 100-300ms | All security checks |
| **Transaction Submit** | 100-500ms | Blockchain submission |
| **Blockchain Confirmation** | 5-30 seconds | Block finality |
| **Facilitator → Merchant** | <100ms | Response with tx hash |
| **Serve Content** | <50ms | Deliver resource |
| **TOTAL** | **5-30 seconds** | End-to-end user wait time |

### Why Verification is Built Into /settle

#### Efficiency & Security

The facilitator does verification **inside** the `/settle` endpoint for several reasons:

**1. Single Point of Validation**
```typescript
// ✅ Efficient - one call, all checks
const result = await fetch('/settle', { body: payment });
// Facilitator does internally:
// - Signature validation
// - Nonce check
// - Balance verification
// - Then executes if valid

// ❌ Wasteful - two calls, duplicate checks
await fetch('/verify', { body: payment }); // Check 1
await fetch('/settle', { body: payment }); // Check 2 (same checks again!)
```

**2. Atomic Operation**
- Nonce check + settlement happens atomically
- No race condition between verify and settle
- Prevents double-spending window

**3. Gas Protection Built-In**
- Invalid signatures rejected BEFORE gas expenditure
- Failed checks return 402 immediately
- Only valid payments reach blockchain

**4. Merchant Simplicity**
- One endpoint to call
- No need to handle verify → settle logic
- Facilitator handles all complexity

### Implementation (Current)

#### Middleware (Server-Side)
```typescript
// middleware.ts - Single /settle call

// Call /settle (does verification + execution internally)
console.log('💰 Settling payment with facilitator...');
const settlement = await settlePayment(payment, requirements);

if (!settlement.success) {
  console.log('❌ Payment rejected:', settlement.message);
  return 402; // Could be invalid signature, insufficient funds, etc.
}

console.log('✅ Payment confirmed on blockchain');
// Content served only after blockchain confirmation
return NextResponse.next();
```

#### What Happens Inside /settle Endpoint (Facilitator)
```typescript
// x402-facilitator/src/services/settlement.ts

async settle(payment, requirements) {
  // Verification (100-300ms)
  validateSignature(payment);      // ✅ EIP-712 signature
  checkNonce(payment);              // ✅ Redis + on-chain
  validateAmount(payment);          // ✅ Matches requirement
  validateTimeWindow(payment);      // ✅ Not expired
  checkBalance(payment);            // ✅ Sufficient funds
  
  // Execution (5-30 seconds)
  const tx = await blockchain.submit(payment);
  await tx.wait(); // Wait for confirmation
  
  return { success: true, transaction: tx.hash };
}
```

### Real-World Example

```typescript
// Client makes request with X-PAYMENT header
const response = await fetch('/premium-content.gif', {
  headers: { 'X-PAYMENT': signedPaymentData }
});

// SERVER SIDE:
// [0ms] Receive request
// [0-100ms] VERIFY: Check signature, nonce, amount ✅
// [100-200ms] SETTLE: Submit to blockchain 📤
// [200ms-30s] SETTLE: Wait for confirmation ⏳
// [30s] Blockchain confirms transaction ✅
// [30s] Serve content to client 🎉

// TOTAL: ~30 seconds (mostly waiting for blockchain)
```

### Performance Optimizations Applied

While the blocking settlement model ensures safety, we've optimized where possible:

#### 1. **HTTP Keep-Alive Connections**
- Reuses TCP connections to facilitator
- Eliminates repeated TLS handshakes
- Saves ~50-100ms per request

```typescript
fetch(`${FACILITATOR_URL}/verify`, {
  headers: { 'Connection': 'keep-alive' },
  keepalive: true
});
```

#### 2. **Efficient Verification**
- Redis cache for nonce checking (sub-millisecond)
- Cryptographic validation (no database queries)
- Parallel checks where possible

#### 3. **Optimized Settlement**
- Single RPC call for balance check
- Efficient transaction queue (prevents nonce conflicts)
- Multiple paymaster wallets (parallel processing)

### Safety Guarantees

✅ **Content Only After Payment**: Resource delivered only after blockchain confirmation
✅ **No Double-Spending**: Nonce verified before and during settlement
✅ **Atomic Operations**: Transaction recorded in database with settlement
✅ **Gas Protection**: Invalid payments rejected before gas expenditure
✅ **Audit Trail**: All transactions logged with full details

### When to Use /verify Endpoint (Optional)

The `/verify` endpoint is useful for:

**1. Pre-flight Checks**
```typescript
// Check if payment is valid before showing confirmation UI
const isValid = await fetch('/verify', { body: payment });
if (isValid) {
  showConfirmationDialog(); // "This payment will succeed"
} else {
  showError(); // "Insufficient balance" or "Invalid signature"
}
```

**2. Batch Validation**
```typescript
// Check multiple payments without executing them
const payments = [payment1, payment2, payment3];
for (const payment of payments) {
  const result = await fetch('/verify', { body: payment });
  console.log(`Payment ${payment.nonce}: ${result.isValid}`);
}
```

**3. User Feedback**
- Show detailed error messages before attempting settlement
- Let users fix issues (connect wallet, get more funds)
- Better UX than waiting 30 seconds for settlement to fail

**Most merchants don't need it** - the merchant demo just calls `/settle` directly.

### Common Questions

**Q: Do I need to call /verify before /settle?**
A: **No!** /settle does all verification internally. Calling /verify first is redundant.

**Q: What if settlement fails?**
A: The facilitator returns error immediately with reason:
- Invalid signature
- Insufficient balance
- Nonce already used
- Time window expired
- Network/token mismatch

**Q: Why does settlement take 5-30 seconds?**
A: Blockchain confirmation time:
- Base Sepolia: ~2 second blocks
- Ethereum: ~12 second blocks
- Network congestion varies
- Must wait for finality before returning success
This is inherent to blockchain - ensures payment is actually confirmed.

**Q: Does /settle check the signature?**
A: **Yes!** /settle performs ALL security checks:
- ✅ Signature validation (EIP-712)
- ✅ Nonce verification (Redis + on-chain)
- ✅ Balance check
- ✅ Amount validation
- ✅ Time window check
- ✅ Recipient validation
Then executes blockchain transaction only if everything passes.

### Monitoring

Check transaction statistics:
```bash
# On facilitator server
node view-gas-stats.mjs --days 7
```

Transaction states in database:
- `pending`: Submitted to blockchain
- `completed`: Confirmed on blockchain
- `failed`: Rejected (verify failed or settlement error)

### Current Performance Profile

| Metric | Time | Blocking? |
|--------|------|-----------|
| Verify | 100-300ms | ✅ Yes (required) |
| Settle (submit) | 100-500ms | ✅ Yes (required) |
| Settle (confirm) | 5-30 seconds | ✅ Yes (required) |
| Serve Content | <50ms | After settlement |
| **Total User Wait** | **5-30 seconds** | Full blocking |

This ensures maximum security: **content is only delivered after funds are confirmed on the blockchain.**
