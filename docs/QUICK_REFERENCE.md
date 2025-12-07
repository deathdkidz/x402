# X-402 Payment Protocol - Quick Reference Card

## 🚀 Two Ways to Use X-402

### Method 1: X-PAYMENT Header (Recommended for APIs)
```http
GET /api/premium/content HTTP/1.1
X-PAYMENT: eyJhdXRob3JpemF0aW9uIjp7ImZyb20iOiIweDc0MmQzNUNjNjYzNEM...
```

### Method 2: Direct REST API (Recommended for Complex Flows)
```javascript
POST /verify + POST /settle
```

---

## 📊 Raw Data at Each Step

| Step | Data | Size | Format |
|------|------|------|--------|
| 1. Authorization | `{"from":"0x...","to":"0x...","value":"10000",...}` | 280 B | JSON |
| 2. Signature | `0x1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e...` | 65 B | Hex |
| 3. Encoded | `eyJhdXRob3JpemF0aW9uIjp7ImZy...` | 640 B | Base64 |
| 4. Client→Server | `GET /api/... X-PAYMENT: ...` | 950 B | HTTP |
| 5. Decoded | `{"authorization":{...},"signature":"..."}` | 480 B | JSON |
| 6. Server→Facilitator | `POST /verify {...}` | 1,350 B | HTTP |
| 7. Verify Result | `{"isValid":true,"payer":"0x..."}` | 180 B | JSON |
| 8. Settle Request | `POST /settle {...}` | 1,350 B | HTTP |
| 9. Settle Result | `{"success":true,"transaction":"0x..."}` | 320 B | JSON |
| 10. Server→Client | `200 OK X-PAYMENT-RESPONSE: ... {...}` | 650 B | HTTP |

**Total:** ~6.1 KB per payment

---

## 🔐 Security Checklist (10 Layers)

- [ ] 1. Network supported?
- [ ] 2. Required fields present?
- [ ] 3. Signature valid?
- [ ] 4. **Recipient matches?** ⭐
- [ ] 5. Time window valid?
- [ ] 6. Balance sufficient?
- [ ] 7. Amount matches?
- [ ] 8. Nonce not cached?
- [ ] 9. Nonce not in DB?
- [ ] 10. Nonce not on-chain?

---

## 💻 Quick Code Examples

### Client: Create Payment
```typescript
// 1. Create authorization
const auth = {
  from: userAddress,
  to: merchantAddress,
  value: "10000", // 0.01 USDC
  validAfter: Math.floor(Date.now() / 1000),
  validBefore: Math.floor(Date.now() / 1000) + 3600,
  nonce: randomBytes32()
};

// 2. Sign with EIP-712
const signature = await signTypedDataAsync({
  domain: { name: "USD Coin", version: "2", chainId, verifyingContract },
  types: { TransferWithAuthorization: [...] },
  message: auth
});

// 3. Encode to base64
const xPayment = btoa(JSON.stringify({ authorization: auth, signature }));

// 4. Send request
fetch('/api/premium/cat', {
  headers: { 'X-PAYMENT': xPayment }
});
```

### Server: Handle Payment
```typescript
export async function GET(req: NextRequest) {
  const result = await handleX402Payment(req, {
    resource: '/api/premium/cat',
    amount: '10000',
    description: 'Premium content'
  });
  
  if (result.error) return result.response;
  
  return NextResponse.json(
    { content: 'Premium data...' },
    { headers: result.headers }
  );
}
```

---

## 🧪 Testing Commands

### Verify Payment
```bash
curl -X POST http://localhost:8080/verify \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "x402Version": 1,
    "paymentPayload": {...},
    "paymentRequirements": {...}
  }'
```

### Settle Payment
```bash
curl -X POST http://localhost:8080/settle \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{...same as verify...}'
```

---

## 📁 Key Files

### Facilitator
- `src/services/verification.ts` - 7-layer verification
- `src/services/settlement.ts` - Blockchain execution
- `src/routes/index.ts` - API endpoints

### Merchant Demo
- `app/x-payment-demo/page.tsx` - Interactive demo
- `middleware/x402Payment.ts` - X-PAYMENT handler
- `app/api/premium/cat/route.ts` - Example API

### Documentation
- `X_PAYMENT_RAW_DATA_FLOW.md` - Complete flow
- `X402_TESTING_GUIDE.md` - Testing examples
- `SECURITY_AUDIT_SUMMARY.md` - Security review

---

## 🌐 URLs

| Service | URL | Description |
|---------|-----|-------------|
| Facilitator | http://localhost:8080 | Payment processing |
| Merchant Demo | http://localhost:3003 | Example merchant |
| X-PAYMENT Demo | http://localhost:3003/x-payment-demo | Interactive demo |
| REST API Demo | http://localhost:3003/demo | Original demo |

---

## 🎯 Decision Guide

**Use X-PAYMENT Headers when:**
- ✅ Building payment-gated APIs
- ✅ Want simple client code
- ✅ Prefer server-side logic
- ✅ Need standard HTTP pattern

**Use Direct REST API when:**
- ✅ Need explicit payment control
- ✅ Want client-side tracking
- ✅ Building complex checkout flows
- ✅ Need custom error handling

---

## 🔍 Debugging

### Check Facilitator Logs
```bash
tail -f /srv/x402/x402-facilitator/logs/combined.log
```

### Browser DevTools
1. Network tab → XHR
2. Find request to /verify or /settle
3. Inspect headers and payload
4. Check X-PAYMENT header (base64)
5. Decode: `atob("eyJhdXRob3Jpemf...")` 

### Common Errors

| Error | Cause | Solution |
|-------|-------|----------|
| Recipient mismatch | authorization.to ≠ requirements.payTo | Check merchant address |
| Amount mismatch | authorization.value ≠ requirements.amount | Verify amount encoding |
| Expired signature | now > validBefore | Create new signature |
| Invalid signature | EIP-712 verification failed | Check domain/types |
| Nonce used | Replay attack | Generate new nonce |

---

## 📦 Data Sizes

```
Client Side:
  Authorization JSON:  280 bytes
  Signature:            65 bytes
  Base64 encoded:      640 bytes
  HTTP request:        950 bytes

Server ↔ Facilitator:
  Verify request:    1,350 bytes
  Verify response:     180 bytes
  Settle request:    1,350 bytes
  Settle response:     320 bytes

Server → Client:
  HTTP response:       650 bytes

Total: ~6,100 bytes
```

---

## 🛡️ Security Best Practices

1. ✅ **Always verify recipient** - Prevent payment redirection
2. ✅ **Use time windows** - Limit signature validity
3. ✅ **Check nonces** - Prevent replay attacks
4. ✅ **Validate amounts** - Ensure payment matches
5. ✅ **Rate limit** - Prevent abuse
6. ✅ **Log everything** - Enable auditing
7. ✅ **Use HTTPS** - Encrypt in transit
8. ✅ **Verify signatures** - Cryptographic proof

---

## 🎓 EIP-712 Signature Structure

```typescript
domain = {
  name: "USD Coin",
  version: "2", 
  chainId: 84532,
  verifyingContract: "0x036CbD53842c5426634e7929541eC2318f3dCF7e"
}

types = {
  TransferWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" }
  ]
}

// Sign: keccak256("\x19\x01" ‖ domainHash ‖ structHash)
// Result: 65 bytes (r: 32, s: 32, v: 1)
```

---

## 📊 Flow Diagram

```
┌────────┐         ┌────────┐         ┌─────────────┐         ┌──────────┐
│ Client │────────>│ Server │────────>│ Facilitator │────────>│Blockchain│
└────────┘         └────────┘         └─────────────┘         └──────────┘
    │                  │                      │                      │
    │ 1. Sign          │                      │                      │
    │ 2. Encode        │                      │                      │
    │ 3. X-PAYMENT ────>                      │                      │
    │                  │ 4. Decode            │                      │
    │                  │ 5. POST /verify ────>                       │
    │                  │                      │ 6. Validate          │
    │                  │ 7. isValid ──────────<                      │
    │                  │ 8. POST /settle ────>                       │
    │                  │                      │ 9. Execute ─────────>│
    │                  │                      │ 10. TX Hash <────────│
    │                  │ 11. Success <────────│                      │
    │ 12. Content ─────<                      │                      │
    │ X-PAYMENT-RESPONSE                      │                      │
```

---

## 💡 Pro Tips

- 🔹 **Cache merchant data** in Redis (faster lookups)
- 🔹 **Use testnet first** (base-sepolia)
- 🔹 **Monitor gas costs** (check gas_tracking table)
- 🔹 **Set webhooks** (get notified on completion)
- 🔹 **Test security** (try tampering with data)
- 🔹 **Read logs** (understand flow execution)
- 🔹 **Use demo** (/x-payment-demo for learning)

---

**For complete documentation, see:**
- `/srv/x402/X_PAYMENT_RAW_DATA_FLOW.md` (full technical details)
- `/srv/x402/X402_TESTING_GUIDE.md` (testing examples)
- `/srv/x402/SECURITY_AUDIT_SUMMARY.md` (security review)
