# X-402 Protocol Implementation - Complete Flow with Raw Data

## Security Fixes Applied ✅

### **Critical Fix: Recipient Validation**

**Problem:** Facilitator was not verifying that `authorization.to` matches `requirements.payTo`
**Impact:** Attacker could redirect payments intended for MerchantA to MerchantB
**Fix:** Added recipient validation in both verification and settlement services

**Before (Vulnerable):**
```typescript
// ❌ Only checked signature and amount
verifySignature() → ✅
verifyAmount() → ✅
// Missing: Check if authorization.to === requirements.payTo
```

**After (Secure):**
```typescript
// ✅ Now includes recipient validation
verifySignature() → ✅
verifyRecipient() → ✅  // NEW!
verifyTimeWindow() → ✅
verifyBalance() → ✅
verifyAmount() → ✅
```

---

## Complete X-402 Protocol Flow

### **Architecture:**
```
Client (Browser) ←→ Server (Merchant) ←→ Facilitator ←→ Blockchain
     [X-PAYMENT]        [REST API]         [ERC-3009]
```

---

## **Step-by-Step with Raw Data**

### **Step 1: Client Creates Payment (Client-Side)**

**User Action:** Click "Buy Premium Content"

**Code:**
```typescript
// Generate authorization
const authorization = {
  from: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
  to: "0x1234567890123456789012345678901234567890", // Merchant address
  value: "10000", // 0.01 USDC
  validAfter: "1733270400",
  validBefore: "1733274000",
  nonce: "0xa1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456"
};

// Sign with EIP-712
const signature = await wallet.signTypedData({
  domain: {
    name: "USD Coin",
    version: "2",
    chainId: 84532,
    verifyingContract: "0x036CbD53842c5426634e7929541eC2318f3dCF7e"
  },
  types: {
    TransferWithAuthorization: [
      { name: 'from', type: 'address' },
      { name: 'to', type: 'address' },
      { name: 'value', type: 'uint256' },
      { name: 'validAfter', type: 'uint256' },
      { name: 'validBefore', type: 'uint256' },
      { name: 'nonce', type: 'bytes32' }
    ]
  },
  primaryType: 'TransferWithAuthorization',
  message: authorization
});

// Result
signature = "0x1b2c3d4e5f6789...130_hex_characters";
```

---

### **Step 2: Client → Server (X-PAYMENT Header)**

**HTTP Request:**
```http
GET /api/premium/cat HTTP/1.1
Host: merchant.example.com
X-PAYMENT: eyJhdXRob3JpemF0aW9uIjp7ImZyb20iOiIweDc0MmQzNUNjNjYzNEMwNTMyOTI1YTNiODQ0QmM5ZTc1OTVmMGJFYiIsInRvIjoiMHgxMjM0NTY3ODkwMTIzNDU2Nzg5MDEyMzQ1Njc4OTAxMjM0NTY3ODkwIiwidmFsdWUiOiIxMDAwMCIsInZhbGlkQWZ0ZXIiOiIxNzMzMjcwNDAwIiwidmFsaWRCZWZvcmUiOiIxNzMzMjc0MDAwIiwibm9uY2UiOiIweGExYjJjM2Q0ZTVmNjc4OTAxMjM0NTY3ODkwMTIzNDU2Nzg5MGFiY2RlZjEyMzQ1Njc4OTBhYmNkZWYxMjM0NTYifSwic2lnbmF0dXJlIjoiMHgxYjJjM2Q0ZTVmNjc4OS4uLjEzMF9oZXhfY2hhcmFjdGVycyJ9
```

**Decoded X-PAYMENT (Base64 → JSON):**
```json
{
  "authorization": {
    "from": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
    "to": "0x1234567890123456789012345678901234567890",
    "value": "10000",
    "validAfter": "1733270400",
    "validBefore": "1733274000",
    "nonce": "0xa1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456"
  },
  "signature": "0x1b2c3d4e5f6789...130_hex_characters"
}
```

---

### **Step 3: Server Decodes X-PAYMENT**

**Server Code:**
```typescript
// Extract header
const xPaymentHeader = req.headers.get('x-payment');

// Decode base64
const decoded = Buffer.from(xPaymentHeader, 'base64').toString('utf-8');
const payment = JSON.parse(decoded);

console.log('Decoded Payment:', {
  from: payment.authorization.from,
  to: payment.authorization.to,
  value: payment.authorization.value,
  signatureLength: payment.signature.length
});
```

**Console Output:**
```
Decoded Payment: {
  from: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
  to: '0x1234567890123456789012345678901234567890',
  value: '10000',
  signatureLength: 132
}
```

---

### **Step 4: Server → Facilitator (Verify)**

**HTTP Request:**
```http
POST /verify HTTP/1.1
Host: facilitator.example.com:8080
Content-Type: application/json
Authorization: Bearer sk_live_abc123def456...

{
  "x402Version": 1,
  "paymentPayload": {
    "x402Version": 1,
    "payload": {
      "authorization": {
        "from": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
        "to": "0x1234567890123456789012345678901234567890",
        "value": "10000",
        "validAfter": "1733270400",
        "validBefore": "1733274000",
        "nonce": "0xa1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456"
      },
      "signature": "0x1b2c3d4e5f6789...130_hex_characters"
    }
  },
  "paymentRequirements": {
    "scheme": "erc3009",
    "network": "base-sepolia",
    "asset": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    "payTo": "0x1234567890123456789012345678901234567890",
    "maxAmountRequired": "10000",
    "resource": "/api/premium/cat",
    "description": "Premium Cat Image Access",
    "mimeType": "image/jpeg",
    "maxTimeoutSeconds": 3600
  }
}
```

**Size:** ~850 bytes (uncompressed JSON)

---

### **Step 5: Facilitator Verification Process**

**Layer 1: Network Validation**
```
Input: "base-sepolia"
Check: Is in supportedNetworks array?
Output: ✅ Valid
```

**Layer 2: Payload Extraction**
```
Input: paymentPayload.payload
Extract: {
  payer: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
  signature: "0x1b2c3d4e5f6...",
  authorization: {...}
}
Output: ✅ Complete
```

**Layer 3: Signature Verification (EIP-712)**
```
Reconstruct typed data:
  domain = {
    name: "USD Coin",
    version: "2",
    chainId: 84532,
    verifyingContract: "0x036CbD5..."
  }
  value = authorization

Verify: ethers.verifyTypedData(domain, types, value, signature)
Recovered: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb"
Expected:  "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb"
Output: ✅ Match
```

**Layer 3.5: Recipient Validation (NEW SECURITY FIX)**
```
Signed recipient (authorization.to):  "0x1234567890123456789012345678901234567890"
Required recipient (requirements.payTo): "0x1234567890123456789012345678901234567890"
Output: ✅ Match
```

**Layer 4: Time Window**
```
now = 1733271000
validAfter = 1733270400 ✅
validBefore = 1733274000 ✅
Output: ✅ Valid
```

**Layer 5: Balance Check**
```
Check: balanceOf("0x742d35Cc...") on USDC contract
Balance: 1000000 (1.0 USDC with 6 decimals)
Required: 10000 (0.01 USDC)
Output: ✅ Sufficient
```

**Layer 6: Amount Match**
```
authorization.value: "10000"
requirements.maxAmountRequired: "10000"
Output: ✅ Match
```

---

### **Step 6: Facilitator → Server (Verify Response)**

**HTTP Response:**
```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "isValid": true,
  "is_valid": true,
  "payer": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb"
}
```

**Size:** ~95 bytes

---

### **Step 7: Server → Facilitator (Settle)**

**HTTP Request:**
```http
POST /settle HTTP/1.1
Host: facilitator.example.com:8080
Content-Type: application/json
Authorization: Bearer sk_live_abc123def456...

{
  "x402Version": 1,
  "paymentPayload": {
    "x402Version": 1,
    "payload": {
      "authorization": {
        "from": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
        "to": "0x1234567890123456789012345678901234567890",
        "value": "10000",
        "validAfter": "1733270400",
        "validBefore": "1733274000",
        "nonce": "0xa1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456"
      },
      "signature": "0x1b2c3d4e5f6789...130_hex_characters"
    }
  },
  "paymentRequirements": {
    "scheme": "erc3009",
    "network": "base-sepolia",
    "asset": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    "payTo": "0x1234567890123456789012345678901234567890",
    "maxAmountRequired": "10000",
    "resource": "/api/premium/cat",
    "description": "Premium Cat Image Access",
    "mimeType": "image/jpeg",
    "maxTimeoutSeconds": 3600
  }
}
```

**Size:** ~850 bytes (same as verify)

---

### **Step 8: Facilitator Settlement Process**

**Safety Checks:**
```
Check 1-6: Re-run all verification checks ✅
Check 7: Duplicate transaction?
  - Redis cache check → Not found ✅
  - Database check → Not found ✅
  - On-chain nonce check → Not used ✅
```

**Execute Transaction:**
```
Contract: 0x036CbD53842c5426634e7929541eC2318f3dCF7e
Function: transferWithAuthorization(
  from:        0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb,
  to:          0x1234567890123456789012345678901234567890,
  value:       10000,
  validAfter:  1733270400,
  validBefore: 1733274000,
  nonce:       0xa1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456,
  v: 27,
  r: 0x1b2c3d4e5f6...,
  s: 0x789012345...
)
Gas Used: 85000 units
Gas Price: 0.5 gwei
Cost: 0.0000425 ETH (~$0.13 at $3000/ETH)
```

---

### **Step 9: Facilitator → Blockchain**

**Raw Transaction Data:**
```
To: 0x036CbD53842c5426634e7929541eC2318f3dCF7e
Data: 0xe3ee160e  // Function selector
  000000000000000000000000742d35cc6634c0532925a3b844bc9e7595f0beb  // from
  0000000000000000000000001234567890123456789012345678901234567890  // to
  0000000000000000000000000000000000000000000000000000000000002710  // value (10000)
  00000000000000000000000000000000000000000000000000000000674e9280  // validAfter
  00000000000000000000000000000000000000000000000000000000674ea100  // validBefore
  a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456  // nonce
  000000000000000000000000000000000000000000000000000000000000001b  // v
  1b2c3d4e5f6789...  // r
  789012345...       // s
Gas Limit: 200000
Gas Price: 500000000 wei (0.5 gwei)
Nonce: 42 (facilitator's nonce)
Value: 0 ETH
```

**Transaction Hash:** `0xabcd1234567890abcdef1234567890abcdef1234567890abcdef1234567890ab`

---

### **Step 10: Blockchain → Facilitator**

**Transaction Receipt:**
```json
{
  "transactionHash": "0xabcd1234567890abcdef1234567890abcdef1234567890abcdef1234567890ab",
  "blockNumber": 12345678,
  "blockHash": "0xblock hash...",
  "status": 1,
  "gasUsed": 85000,
  "effectiveGasPrice": 500000000,
  "from": "0xFacilitatorWallet...",
  "to": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  "logs": [
    {
      "address": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
      "topics": [
        "0xTransfer(address,address,uint256)",
        "0x000000000000000000000000742d35cc...",
        "0x0000000000000000000000001234567890..."
      ],
      "data": "0x0000000000000000000000000000000000000000000000000000000000002710"
    }
  ]
}
```

---

### **Step 11: Facilitator → Server (Settle Response)**

**HTTP Response:**
```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "success": true,
  "transaction": "0xabcd1234567890abcdef1234567890abcdef1234567890abcdef1234567890ab",
  "transactionHash": "0xabcd1234567890abcdef1234567890abcdef1234567890abcdef1234567890ab",
  "network": "base-sepolia",
  "payer": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
  "status": "completed"
}
```

**Size:** ~245 bytes

---

### **Step 12: Server → Client (With X-PAYMENT-RESPONSE)**

**HTTP Response:**
```http
HTTP/1.1 200 OK
Content-Type: application/json
X-PAYMENT-RESPONSE: {"status":"completed","transactionHash":"0xabcd1234567890abcdef1234567890abcdef1234567890abcdef1234567890ab","payer":"0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb","network":"base-sepolia"}

{
  "success": true,
  "resource": "/api/premium/cat",
  "imageUrl": "https://cataas.com/cat/cute",
  "description": "Exclusive premium cat image",
  "payer": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
  "transactionHash": "0xabcd1234567890abcdef1234567890abcdef1234567890abcdef1234567890ab",
  "message": "Thank you for your payment! Here is your exclusive cat image."
}
```

**Decoded X-PAYMENT-RESPONSE:**
```json
{
  "status": "completed",
  "transactionHash": "0xabcd1234567890abcdef1234567890abcdef1234567890abcdef1234567890ab",
  "payer": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
  "network": "base-sepolia"
}
```

---

## **Data Size Summary**

| Step | Direction | Format | Size | Encoding |
|------|-----------|--------|------|----------|
| 2 | Client → Server | X-PAYMENT header | ~750 bytes | Base64 |
| 4 | Server → Facilitator | JSON | ~850 bytes | Plain |
| 6 | Facilitator → Server | JSON | ~95 bytes | Plain |
| 7 | Server → Facilitator | JSON | ~850 bytes | Plain |
| 9 | Facilitator → Blockchain | Binary | ~500 bytes | RLP encoded |
| 11 | Facilitator → Server | JSON | ~245 bytes | Plain |
| 12 | Server → Client | X-PAYMENT-RESPONSE | ~200 bytes | Base64 |

**Total Client ↔ Server:** ~950 bytes  
**Total Server ↔ Facilitator:** ~2,040 bytes  
**Total Facilitator ↔ Blockchain:** ~500 bytes

---

## **Security Validations Applied**

### ✅ **All Security Checks:**

1. **Network Validation** - Prevents unsupported networks
2. **Signature Verification** - Cryptographic proof of authorization
3. **Recipient Validation** ⭐ **NEW** - Prevents payment redirection
4. **Time Window** - Prevents expired/premature use
5. **Balance Check** - Ensures sufficient funds
6. **Amount Match** - Prevents amount tampering
7. **Nonce Protection** - Prevents replay attacks
8. **Merchant Auth** - Only authorized merchants can settle
9. **Rate Limiting** - Prevents abuse
10. **HMAC Webhooks** - Secure notifications

---

## **Testing the Implementation**

See `X402_TESTING_GUIDE.md` for complete testing examples with curl commands.
