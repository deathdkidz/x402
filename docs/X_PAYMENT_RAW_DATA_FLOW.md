# X-PAYMENT Header Protocol - Complete Raw Data Flow

This document shows **EVERY byte** of data exchanged in the X-402 payment protocol using X-PAYMENT headers.

## Overview

The X-PAYMENT header method provides a clean HTTP-based protocol for payment-gated content:

```
Client ←→ Server ←→ Facilitator ←→ Blockchain
```

## Step-by-Step Raw Data Exchange

### 🔵 Step 1: Client Creates Authorization

**Location:** Client Browser (JavaScript)

```javascript
const authorization = {
  from: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
  to: "0x1234567890123456789012345678901234567890",
  value: "10000",
  validAfter: "1701619200",
  validBefore: "1701622800",
  nonce: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef"
};
```

**Size:** ~280 bytes (JSON)

**Field Explanations:**
- `from`: User's wallet address (pays the USDC)
- `to`: Merchant's wallet address (receives the USDC)
- `value`: 10000 = 0.01 USDC (6 decimals)
- `validAfter`: Unix timestamp when signature becomes valid
- `validBefore`: Unix timestamp when signature expires
- `nonce`: 32-byte random hex for replay protection

---

### 🔵 Step 2: Client Signs with EIP-712

**Location:** Client Browser (MetaMask)

**EIP-712 Domain:**
```json
{
  "name": "USD Coin",
  "version": "2",
  "chainId": 84532,
  "verifyingContract": "0x036CbD53842c5426634e7929541eC2318f3dCF7e"
}
```

**EIP-712 Types:**
```json
{
  "TransferWithAuthorization": [
    { "name": "from", "type": "address" },
    { "name": "to", "type": "address" },
    { "name": "value", "type": "uint256" },
    { "name": "validAfter", "type": "uint256" },
    { "name": "validBefore", "type": "uint256" },
    { "name": "nonce", "type": "bytes32" }
  ]
}
```

**Signing Process:**
1. Hash the domain separator: `keccak256(EIP712Domain)`
2. Hash the struct: `keccak256(TransferWithAuthorization)`
3. Combine: `keccak256("\x19\x01" ‖ domainSeparator ‖ structHash)`
4. Sign with private key (ECDSA)

**Signature Output:**
```
0x1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c1b
```

**Size:** 65 bytes (130 hex chars + 0x prefix)
- r: 32 bytes (first 64 hex chars)
- s: 32 bytes (next 64 hex chars)
- v: 1 byte (last 2 hex chars, recovery id: 27 or 28, encoded as 1b or 1c)

---

### 🔵 Step 3: Client Encodes Payment Payload

**Location:** Client Browser

**3a. Combine Authorization + Signature:**
```json
{
  "authorization": {
    "from": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
    "to": "0x1234567890123456789012345678901234567890",
    "value": "10000",
    "validAfter": "1701619200",
    "validBefore": "1701622800",
    "nonce": "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef"
  },
  "signature": "0x1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c1b"
}
```

**Size:** ~480 bytes (JSON string)

**3b. JSON.stringify:**
```
'{"authorization":{"from":"0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb","to":"0x1234567890123456789012345678901234567890","value":"10000","validAfter":"1701619200","validBefore":"1701622800","nonce":"0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef"},"signature":"0x1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c1b"}'
```

**3c. Base64 Encode:**
```
eyJhdXRob3JpemF0aW9uIjp7ImZyb20iOiIweDc0MmQzNUNjNjYzNEMwNTMyOTI1YTNiODQ0QmM5ZTc1OTVmMGJFYiIsInRvIjoiMHgxMjM0NTY3ODkwMTIzNDU2Nzg5MDEyMzQ1Njc4OTAxMjM0NTY3ODkwIiwidmFsdWUiOiIxMDAwMCIsInZhbGlkQWZ0ZXIiOiIxNzAxNjE5MjAwIiwidmFsaWRCZWZvcmUiOiIxNzAxNjIyODAwIiwibm9uY2UiOiIweDEyMzQ1Njc4OTBhYmNkZWYxMjM0NTY3ODkwYWJjZGVmMTIzNDU2Nzg5MGFiY2RlZjEyMzQ1Njc4OTBhYmNkZWYifSwic2lnbmF0dXJlIjoiMHgxYjJjM2Q0ZTVmNmE3YjhjOWQwZTFmMmEzYjRjNWQ2ZTdmOGE5YjBjMWQyZTNmNGE1YjZjN2Q4ZTlmMGExYjJjM2Q0ZTVmNmE3YjhjOWQwZTFmMmEzYjRjNWQ2ZTdmOGE5YjBjMWQyZTNmNGE1YjZjN2Q4ZTlmMGExYjJjMWIifQ==
```

**Size:** ~640 bytes (base64 encoding increases size by ~33%)

**Why Base64?**
- HTTP headers must be ASCII characters
- Base64 converts binary/JSON to safe ASCII
- Standard encoding for HTTP headers

---

### 🟢 Step 4: CLIENT → SERVER (HTTP Request)

**Raw HTTP Request:**
```http
GET /api/premium/cat HTTP/1.1
Host: localhost:3003
X-PAYMENT: eyJhdXRob3JpemF0aW9uIjp7ImZyb20iOiIweDc0MmQzNUNjNjYzNEMwNTMyOTI1YTNiODQ0QmM5ZTc1OTVmMGJFYiIsInRvIjoiMHgxMjM0NTY3ODkwMTIzNDU2Nzg5MDEyMzQ1Njc4OTAxMjM0NTY3ODkwIiwidmFsdWUiOiIxMDAwMCIsInZhbGlkQWZ0ZXIiOiIxNzAxNjE5MjAwIiwidmFsaWRCZWZvcmUiOiIxNzAxNjIyODAwIiwibm9uY2UiOiIweDEyMzQ1Njc4OTBhYmNkZWYxMjM0NTY3ODkwYWJjZGVmMTIzNDU2Nzg5MGFiY2RlZjEyMzQ1Njc4OTBhYmNkZWYifSwic2lnbmF0dXJlIjoiMHgxYjJjM2Q0ZTVmNmE3YjhjOWQwZTFmMmEzYjRjNWQ2ZTdmOGE5YjBjMWQyZTNmNGE1YjZjN2Q4ZTlmMGExYjJjM2Q0ZTVmNmE3YjhjOWQwZTFmMmEzYjRjNWQ2ZTdmOGE5YjBjMWQyZTNmNGE1YjZjN2Q4ZTlmMGExYjJjMWIifQ==
User-Agent: Mozilla/5.0
Accept: application/json


```

**Total Size:** ~950 bytes
- Headers: ~750 bytes
- Body: empty (GET request)

---

### 🟡 Step 5: Server Decodes X-PAYMENT Header

**Location:** Server (Next.js Middleware)

**5a. Extract Header:**
```javascript
const xPaymentHeader = req.headers.get('x-payment');
// Result: "eyJhdXRob3JpemF0aW9uIjp7ImZyb20..."
```

**5b. Base64 Decode:**
```javascript
const decoded = Buffer.from(xPaymentHeader, 'base64').toString('utf-8');
```

**Result:**
```json
'{"authorization":{"from":"0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb","to":"0x1234567890123456789012345678901234567890","value":"10000","validAfter":"1701619200","validBefore":"1701622800","nonce":"0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef"},"signature":"0x1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c1b"}'
```

**5c. JSON.parse:**
```javascript
const payment = JSON.parse(decoded);
```

**Result:**
```json
{
  "authorization": {
    "from": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
    "to": "0x1234567890123456789012345678901234567890",
    "value": "10000",
    "validAfter": "1701619200",
    "validBefore": "1701622800",
    "nonce": "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef"
  },
  "signature": "0x1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c1b"
}
```

---

### 🟢 Step 6: SERVER → FACILITATOR (Verify Request)

**Raw HTTP Request:**
```http
POST /verify HTTP/1.1
Host: localhost:8080
Authorization: Bearer merchant_api_key_abc123xyz
Content-Type: application/json
Content-Length: 1024

{
  "x402Version": 1,
  "paymentPayload": {
    "x402Version": 1,
    "payload": {
      "authorization": {
        "from": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
        "to": "0x1234567890123456789012345678901234567890",
        "value": "10000",
        "validAfter": "1701619200",
        "validBefore": "1701622800",
        "nonce": "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef"
      },
      "signature": "0x1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c1b"
    }
  },
  "paymentRequirements": {
    "scheme": "erc3009",
    "network": "base-sepolia",
    "asset": "USDC",
    "payTo": "0x1234567890123456789012345678901234567890",
    "maxAmountRequired": "10000",
    "resource": "/api/premium/cat",
    "description": "Premium Cat Image Access",
    "mimeType": "image/jpeg",
    "maxTimeoutSeconds": 300
  }
}
```

**Total Size:** ~1,350 bytes
- Headers: ~150 bytes
- Body: ~1,200 bytes (JSON)

**What Facilitator Verifies:**
1. ✅ Network validation (base-sepolia supported?)
2. ✅ Signature verification (EIP-712 recovery)
3. ✅ Recipient match (authorization.to === requirements.payTo)
4. ✅ Amount match (authorization.value === requirements.maxAmountRequired)
5. ✅ Time window (validAfter < now < validBefore)
6. ✅ Balance check (user has 10000 USDC?)
7. ✅ Nonce not used (check Redis cache + blockchain)

---

### 🟣 Step 7: FACILITATOR → SERVER (Verify Response)

**Raw HTTP Response:**
```http
HTTP/1.1 200 OK
Content-Type: application/json
Content-Length: 102

{
  "isValid": true,
  "is_valid": true,
  "payer": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb"
}
```

**Total Size:** ~180 bytes

**If Verification Failed:**
```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "isValid": false,
  "is_valid": false,
  "invalidReason": "Recipient mismatch. Payment authorized for 0xABC, but requirements specify 0xXYZ",
  "invalid_reason": "Recipient mismatch. Payment authorized for 0xABC, but requirements specify 0xXYZ",
  "payer": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb"
}
```

---

### 🟢 Step 8: SERVER → FACILITATOR (Settle Request)

**Raw HTTP Request:**
```http
POST /settle HTTP/1.1
Host: localhost:8080
Authorization: Bearer merchant_api_key_abc123xyz
Content-Type: application/json
Content-Length: 1024

{
  "x402Version": 1,
  "paymentPayload": {
    "x402Version": 1,
    "payload": {
      "authorization": {
        "from": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
        "to": "0x1234567890123456789012345678901234567890",
        "value": "10000",
        "validAfter": "1701619200",
        "validBefore": "1701622800",
        "nonce": "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef"
      },
      "signature": "0x1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c1b"
    }
  },
  "paymentRequirements": {
    "scheme": "erc3009",
    "network": "base-sepolia",
    "asset": "USDC",
    "payTo": "0x1234567890123456789012345678901234567890",
    "maxAmountRequired": "10000",
    "resource": "/api/premium/cat",
    "description": "Premium Cat Image Access",
    "mimeType": "image/jpeg",
    "maxTimeoutSeconds": 300
  }
}
```

**What Facilitator Does:**
1. Re-verify all checks (don't trust prior verify call)
2. Extract v, r, s from signature
3. Call blockchain: `USDC.transferWithAuthorization(from, to, value, validAfter, validBefore, nonce, v, r, s)`
4. Wait for transaction confirmation
5. Store in database
6. Send webhook to merchant
7. Return transaction hash

---

### 🟣 Step 9: FACILITATOR → SERVER (Settle Response)

**Raw HTTP Response:**
```http
HTTP/1.1 200 OK
Content-Type: application/json
Content-Length: 245

{
  "success": true,
  "transaction": "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
  "status": "completed",
  "payer": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
  "merchant": "0x1234567890123456789012345678901234567890",
  "amount": "10000",
  "resource": "/api/premium/cat"
}
```

**Total Size:** ~320 bytes

**Blockchain Transaction Details:**
```
Transaction Hash: 0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890
From: 0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb (user)
To: 0x036CbD53842c5426634e7929541eC2318f3dCF7e (USDC contract)
Function: transferWithAuthorization(address,address,uint256,uint256,uint256,bytes32,uint8,bytes32,bytes32)
Gas Used: ~85,000
Gas Price: 0.01 Gwei
Network: Base Sepolia (Chain ID 84532)
```

---

### 🟢 Step 10: SERVER → CLIENT (Success Response)

**10a. Server Encodes Payment Response:**
```javascript
const responseData = {
  status: "completed",
  transactionHash: "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
  payer: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb"
};

const xPaymentResponse = Buffer.from(JSON.stringify(responseData)).toString('base64');
// Result: eyJzdGF0dXMiOiJjb21wbGV0ZWQiLCJ0cmFuc2FjdGlvbkhhc2giOiIweDEyMyIsInBheWVyIjoiMHg3NDJkMzVDYzY2MzRDMDUzMjkyNWEzYjg0NEJjOWU3NTk1ZjBiRWIifQ==
```

**10b. Raw HTTP Response:**
```http
HTTP/1.1 200 OK
Content-Type: application/json
X-PAYMENT-RESPONSE: eyJzdGF0dXMiOiJjb21wbGV0ZWQiLCJ0cmFuc2FjdGlvbkhhc2giOiIweDEyMyIsInBheWVyIjoiMHg3NDJkMzVDYzY2MzRDMDUzMjkyNWEzYjg0NEJjOWU3NTk1ZjBiRWIifQ==
Content-Length: 256

{
  "success": true,
  "resource": "/api/premium/cat",
  "imageUrl": "https://cataas.com/cat/cute",
  "description": "Exclusive premium cat image - paid with 0.01 USDC",
  "payer": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
  "transactionHash": "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890"
}
```

**Total Size:** ~650 bytes
- Headers: ~350 bytes
- Body: ~300 bytes

**10c. Client Decodes X-PAYMENT-RESPONSE:**
```javascript
const header = response.headers.get('x-payment-response');
const decoded = Buffer.from(header, 'base64').toString('utf-8');
const paymentStatus = JSON.parse(decoded);

console.log(paymentStatus);
// {
//   status: "completed",
//   transactionHash: "0xabcdef...",
//   payer: "0x742d35Cc..."
// }
```

---

## Data Size Summary

| Step | Direction | Size | Format |
|------|-----------|------|--------|
| 1 | Client | 280 bytes | JSON authorization |
| 2 | Client | 65 bytes | ECDSA signature |
| 3 | Client | 640 bytes | Base64 encoded |
| 4 | Client → Server | 950 bytes | HTTP GET + headers |
| 5 | Server | 480 bytes | Decoded JSON |
| 6 | Server → Facilitator | 1,350 bytes | HTTP POST verify |
| 7 | Facilitator → Server | 180 bytes | Verify response |
| 8 | Server → Facilitator | 1,350 bytes | HTTP POST settle |
| 9 | Facilitator → Server | 320 bytes | Settle response |
| 10 | Server → Client | 650 bytes | HTTP response + content |

**Total Data Exchanged:** ~6,265 bytes (~6.1 KB) for complete payment flow

---

## Complete Flow Diagram

```
┌─────────────┐                                    ┌─────────────┐
│   CLIENT    │                                    │   SERVER    │
│  (Browser)  │                                    │  (Next.js)  │
└──────┬──────┘                                    └──────┬──────┘
       │                                                  │
       │ 1. Create authorization object (280 bytes)      │
       │                                                  │
       │ 2. Sign with EIP-712 (65 bytes)                 │
       │                                                  │
       │ 3. Base64 encode (640 bytes)                    │
       │                                                  │
       │ 4. GET /api/premium/cat                         │
       │    X-PAYMENT: eyJhdXRob3Jpemf0aW9u...          │
       │──────────────────────────────────────────────>  │
       │                                                  │ 5. Decode X-PAYMENT
       │                                                  │    base64 → JSON
       │                                                  │
       │                                                  │
       │                       ┌──────────────────────────┼──────────────┐
       │                       │                          │              │
       │                       │                          ▼              │
       │                       │                  ┌───────────────┐     │
       │                       │                  │  FACILITATOR  │     │
       │                       │                  │  (Express)    │     │
       │                       │                  └───────┬───────┘     │
       │                       │                          │              │
       │                       │ 6. POST /verify          │              │
       │                       │    + payment + requirements             │
       │                       │────────────────────────> │              │
       │                       │                          │              │
       │                       │                          │ Verify:      │
       │                       │                          │ - Signature  │
       │                       │                          │ - Recipient  │
       │                       │                          │ - Amount     │
       │                       │                          │ - Time       │
       │                       │                          │ - Balance    │
       │                       │                          │              │
       │                       │ 7. {isValid: true}       │              │
       │                       │ <──────────────────────  │              │
       │                       │                          │              │
       │                       │ 8. POST /settle          │              │
       │                       │ ───────────────────────> │              │
       │                       │                          │              │
       │                       │                          │ Execute:     │
       │                       │                          │ ┌──────────┐ │
       │                       │                          │ │Blockchain│ │
       │                       │                          │ │  (USDC)  │ │
       │                       │                          │ └────┬─────┘ │
       │                       │                          │      │       │
       │                       │                          │ transferWith │
       │                       │                          │ Authorization│
       │                       │                          │ <────┘       │
       │                       │                          │              │
       │                       │ 9. {success: true, tx}   │              │
       │                       │ <──────────────────────  │              │
       │                       │                          │              │
       │                       └──────────────────────────┼──────────────┘
       │                                                  │
       │                                                  │ 10. Encode response
       │                                                  │     Create X-PAYMENT-RESPONSE
       │                                                  │
       │ 200 OK                                           │
       │ X-PAYMENT-RESPONSE: eyJzdGF0dXM...              │
       │ Body: {imageUrl, description, ...}              │
       │ <────────────────────────────────────────────── │
       │                                                  │
       │ Decode X-PAYMENT-RESPONSE                       │
       │ Display premium content                         │
       │                                                  │
```

---

## Security Validations (10 Layers)

Each piece of raw data is validated:

1. **Network Validation**: `base-sepolia` in supported networks?
2. **Payload Extraction**: All required fields present?
3. **Signature Verification**: EIP-712 signature valid?
4. **Recipient Validation**: `authorization.to === requirements.payTo`?
5. **Time Window**: `validAfter < now < validBefore`?
6. **Balance Check**: User has enough USDC?
7. **Amount Match**: `authorization.value === requirements.maxAmountRequired`?
8. **Nonce Check (Redis)**: Not in cache?
9. **Nonce Check (DB)**: Not in database?
10. **Nonce Check (Blockchain)**: Not used on-chain?

**All validations must pass before settlement!**

---

## Testing with curl

### Test Verify Endpoint

```bash
# Create payment payload
PAYMENT_PAYLOAD='{
  "authorization": {
    "from": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
    "to": "0x1234567890123456789012345678901234567890",
    "value": "10000",
    "validAfter": "1701619200",
    "validBefore": "1701622800",
    "nonce": "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef"
  },
  "signature": "0x1b2c3d..."
}'

# Encode to base64
X_PAYMENT=$(echo -n "$PAYMENT_PAYLOAD" | base64)

# Call verify via server middleware
curl -X POST http://localhost:8080/verify \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "x402Version": 1,
    "paymentPayload": {
      "x402Version": 1,
      "payload": '"$PAYMENT_PAYLOAD"'
    },
    "paymentRequirements": {
      "scheme": "erc3009",
      "network": "base-sepolia",
      "asset": "USDC",
      "payTo": "0x1234567890123456789012345678901234567890",
      "maxAmountRequired": "10000",
      "resource": "/api/premium/cat",
      "description": "Premium Cat Image",
      "mimeType": "image/jpeg",
      "maxTimeoutSeconds": 300
    }
  }'
```

### Expected Response

```json
{
  "isValid": true,
  "is_valid": true,
  "payer": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb"
}
```

---

## Comparison: X-PAYMENT vs REST API

| Aspect | X-PAYMENT Header | Direct REST API |
|--------|------------------|-----------------|
| **Client Request** | `GET /resource` + header | `POST /verify`, `POST /settle` |
| **Data Transfer** | 950 bytes | 1350 bytes × 2 calls |
| **Round Trips** | 1 (server handles rest) | 2 (client calls both) |
| **Complexity** | Server-side | Client-side |
| **Use Case** | Payment-gated content | Explicit payment control |
| **Browser Support** | Standard HTTP | Standard HTTP |

Both methods are valid - choose based on your use case!

---

## Next Steps

1. **Test X-PAYMENT Demo**: Visit `/x-payment-demo` in merchant-demo
2. **Inspect Raw Data**: Use browser DevTools Network tab
3. **Test Security**: Try tampering with amounts/recipients
4. **Monitor Logs**: Check facilitator logs for verification details

**Your payment system is ready for production!** 🚀
