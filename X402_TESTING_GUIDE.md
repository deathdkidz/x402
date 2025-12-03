# X-402 Testing Guide

Complete guide to testing the X-402 payment protocol with real examples and curl commands.

## Prerequisites

```bash
# Install required tools
npm install -g base64
brew install jq  # For JSON formatting (optional)

# Set environment variables
export FACILITATOR_URL="http://localhost:8080"
export API_KEY="your_merchant_api_key_here"
export MERCHANT_ADDRESS="0x1234567890123456789012345678901234567890"
```

---

## Test 1: Health Check

```bash
curl -X GET $FACILITATOR_URL/health | jq
```

**Expected Response:**
```json
{
  "status": "ok",
  "service": "x402-facilitator",
  "timestamp": 1733271000000,
  "uptime": 86400,
  "supportedNetworks": ["base-sepolia", "eth-sepolia"]
}
```

---

## Test 2: Get Networks

```bash
curl -X GET $FACILITATOR_URL/networks | jq
```

**Expected Response:**
```json
{
  "success": true,
  "networks": [
    {
      "network": "base-sepolia",
      "chainId": 84532,
      "tokens": [
        {
          "symbol": "USDC",
          "name": "USD Coin",
          "address": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
          "decimals": 6,
          "eip712": {
            "name": "USD Coin",
            "version": "2",
            "verifyingContract": "0x036CbD53842c5426634e7929541eC2318f3dCF7e"
          }
        }
      ],
      "rpcConfigured": true
    }
  ],
  "defaultNetwork": "base-sepolia"
}
```

---

## Test 3: Verify Payment (Direct REST API)

### Create Test Payload

```javascript
// In browser console or Node.js
const authorization = {
  from: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
  to: "0x1234567890123456789012345678901234567890",
  value: "10000",
  validAfter: Math.floor(Date.now() / 1000).toString(),
  validBefore: (Math.floor(Date.now() / 1000) + 3600).toString(),
  nonce: "0x" + Array(64).fill(0).map(() => 
    Math.floor(Math.random() * 16).toString(16)
  ).join('')
};

// Sign with MetaMask or wallet
const signature = await window.ethereum.request({
  method: 'eth_signTypedData_v4',
  params: [
    authorization.from,
    JSON.stringify({
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
    })
  ]
});

console.log('Authorization:', authorization);
console.log('Signature:', signature);
```

### Send Verify Request

```bash
curl -X POST $FACILITATOR_URL/verify \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_KEY" \
  -d '{
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
        "signature": "0x<your_signature_here>"
      }
    },
    "paymentRequirements": {
      "scheme": "erc3009",
      "network": "base-sepolia",
      "asset": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
      "payTo": "0x1234567890123456789012345678901234567890",
      "maxAmountRequired": "10000",
      "resource": "/api/premium/cat",
      "description": "Premium Cat Image",
      "mimeType": "image/jpeg",
      "maxTimeoutSeconds": 3600
    }
  }' | jq
```

**Expected Response (Valid):**
```json
{
  "isValid": true,
  "is_valid": true,
  "payer": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb"
}
```

**Expected Response (Invalid - Wrong Recipient):**
```json
{
  "isValid": false,
  "is_valid": false,
  "invalidReason": "Recipient mismatch. Payment authorized for 0xAAA..., but requirements specify 0xBBB.... Possible attack attempt.",
  "invalid_reason": "Recipient mismatch. Payment authorized for 0xAAA..., but requirements specify 0xBBB.... Possible attack attempt.",
  "payer": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb"
}
```

---

## Test 4: X-PAYMENT Header Method

### Encode Payment as Base64

```javascript
const payment = {
  authorization: {
    from: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
    to: "0x1234567890123456789012345678901234567890",
    value: "10000",
    validAfter: "1733270400",
    validBefore: "1733274000",
    nonce: "0xa1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456"
  },
  signature: "0x<your_signature_here>"
};

const base64Payment = btoa(JSON.stringify(payment));
console.log('X-PAYMENT header value:', base64Payment);
```

### Send Request with X-PAYMENT Header

```bash
# Replace <BASE64_PAYMENT> with the output from above
curl -X GET http://localhost:3003/api/premium/cat \
  -H "X-PAYMENT: <BASE64_PAYMENT>" \
  -v
```

**Expected Response:**
```http
HTTP/1.1 200 OK
Content-Type: application/json
X-PAYMENT-RESPONSE: {"status":"completed","transactionHash":"0xabcd...","payer":"0x742d...","network":"base-sepolia"}

{
  "success": true,
  "resource": "/api/premium/cat",
  "imageUrl": "https://cataas.com/cat/cute",
  "description": "Exclusive premium cat image",
  "payer": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
  "transactionHash": "0xabcd1234...",
  "message": "Thank you for your payment! Here is your exclusive cat image."
}
```

---

## Test 5: Security Tests

### Test 5.1: Recipient Mismatch (Should Fail)

```bash
# User signs for MerchantA but attacker submits to MerchantB
curl -X POST $FACILITATOR_URL/verify \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_KEY" \
  -d '{
    "x402Version": 1,
    "paymentPayload": {
      "x402Version": 1,
      "payload": {
        "authorization": {
          "from": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
          "to": "0xMerchantAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
          "value": "10000",
          "validAfter": "1733270400",
          "validBefore": "1733274000",
          "nonce": "0xa1b2c3d4..."
        },
        "signature": "0x<valid_signature_for_merchantA>"
      }
    },
    "paymentRequirements": {
      "scheme": "erc3009",
      "network": "base-sepolia",
      "asset": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
      "payTo": "0xMerchantBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB",
      "maxAmountRequired": "10000",
      "resource": "/api/test",
      "description": "Test",
      "mimeType": "text/plain",
      "maxTimeoutSeconds": 3600
    }
  }' | jq
```

**Expected Response:**
```json
{
  "isValid": false,
  "invalidReason": "Recipient mismatch. Payment authorized for 0xmerchantaaaa..., but requirements specify 0xmerchantbbbb.... Possible attack attempt."
}
```

### Test 5.2: Amount Mismatch (Should Fail)

```bash
curl -X POST $FACILITATOR_URL/verify \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_KEY" \
  -d '{
    "paymentPayload": {
      "payload": {
        "authorization": {
          "value": "10000"
        },
        "signature": "0x..."
      }
    },
    "paymentRequirements": {
      "maxAmountRequired": "50000"
    }
  }' | jq
```

**Expected Response:**
```json
{
  "isValid": false,
  "invalidReason": "Amount mismatch. Authorization amount (10000) doesn't match required amount (50000)"
}
```

### Test 5.3: Expired Signature (Should Fail)

```bash
curl -X POST $FACILITATOR_URL/verify \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_KEY" \
  -d '{
    "paymentPayload": {
      "payload": {
        "authorization": {
          "validAfter": "1000000000",
          "validBefore": "1000001000"
        }
      }
    }
  }' | jq
```

**Expected Response:**
```json
{
  "isValid": false,
  "invalidReason": "Payment authorization expired"
}
```

### Test 5.4: Invalid Signature (Should Fail)

```bash
curl -X POST $FACILITATOR_URL/verify \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_KEY" \
  -d '{
    "paymentPayload": {
      "payload": {
        "authorization": {...},
        "signature": "0x0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000"
      }
    }
  }' | jq
```

**Expected Response:**
```json
{
  "isValid": false,
  "invalidReason": "Invalid signature. Expected signer: 0x742d..., got: 0x0000..."
}
```

---

## Test 6: Decode Payment Data

### Decode X-PAYMENT Header

```bash
# Save base64 to file
echo "eyJhdXRob3JpemF0aW9uIjp7ImZyb20iOiIweDc0MmQzNUNjNjYzNEMwNTMyOTI1YTNiODQ0QmM5ZTc1OTVmMGJFYiIsInRvIjoiMHgxMjM0NTY3ODkwMTIzNDU2Nzg5MDEyMzQ1Njc4OTAxMjM0NTY3ODkwIiwidmFsdWUiOiIxMDAwMCIsInZhbGlkQWZ0ZXIiOiIxNzMzMjcwNDAwIiwidmFsaWRCZWZvcmUiOiIxNzMzMjc0MDAwIiwibm9uY2UiOiIweGExYjJjM2Q0ZTVmNjc4OTAxMjM0NTY3ODkwMTIzNDU2Nzg5MGFiY2RlZjEyMzQ1Njc4OTBhYmNkZWYxMjM0NTYifSwic2lnbmF0dXJlIjoiMHgxYjJjM2Q0ZTVmNjc4OS4uLjEzMF9oZXhfY2hhcmFjdGVycyJ9" > payment.b64

# Decode
cat payment.b64 | base64 -d | jq

# Or one-liner
echo "eyJhdXRob..." | base64 -d | jq
```

**Output:**
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

### Decode X-PAYMENT-RESPONSE Header

```bash
echo '{"status":"completed","transactionHash":"0xabcd..."}' | base64

# Decode
echo "eyJzdGF0dXMiOiJjb21wbGV0ZWQiLCJ0cmFuc2FjdGlvbkhhc2giOiIweGFiY2QuLi4ifQ==" | base64 -d | jq
```

---

## Test 7: End-to-End Flow

### Script: Complete Payment Flow

```bash
#!/bin/bash

# 1. Get merchant info
echo "1. Getting merchant info..."
MERCHANT_INFO=$(curl -s -X GET "$FACILITATOR_URL/merchant/wallet" \
  -H "Authorization: Bearer $API_KEY")
echo "Merchant: $(echo $MERCHANT_INFO | jq -r '.merchant.merchant_address')"

# 2. Get network config
echo -e "\n2. Getting network config..."
NETWORKS=$(curl -s -X GET "$FACILITATOR_URL/networks")
TOKEN=$(echo $NETWORKS | jq -r '.networks[0].tokens[0].address')
echo "Token: $TOKEN"

# 3. Create payment (requires wallet signature - use browser)
echo -e "\n3. Create and sign payment in browser console"
echo "Then paste the authorization and signature below..."

# 4. Verify
echo -e "\n4. Verifying payment..."
VERIFY_RESULT=$(curl -s -X POST "$FACILITATOR_URL/verify" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_KEY" \
  -d @payment_request.json)
echo "Verification: $(echo $VERIFY_RESULT | jq -r '.isValid')"

# 5. Settle
if [ "$(echo $VERIFY_RESULT | jq -r '.isValid')" = "true" ]; then
  echo -e "\n5. Settling payment..."
  SETTLE_RESULT=$(curl -s -X POST "$FACILITATOR_URL/settle" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $API_KEY" \
    -d @payment_request.json)
  echo "Settlement: $(echo $SETTLE_RESULT | jq)"
  
  # 6. Get transaction hash
  TX_HASH=$(echo $SETTLE_RESULT | jq -r '.transaction')
  echo -e "\n6. Transaction Hash: $TX_HASH"
  echo "View on BaseScan: https://sepolia.basescan.org/tx/$TX_HASH"
else
  echo "Verification failed!"
fi
```

---

## Test 8: Monitor Logs

### Facilitator Logs

```bash
# Follow logs
docker logs -f x402-facilitator

# Or if running locally
tail -f logs/app.log

# Filter for specific transaction
docker logs x402-facilitator 2>&1 | grep "0xabcd1234..."
```

**Expected Log Output:**
```
2025-12-03 10:15:23 [INFO] === STARTING PAYMENT VERIFICATION ===
2025-12-03 10:15:23 [INFO] Network: base-sepolia
2025-12-03 10:15:23 [INFO] Asset: 0x036CbD53842c5426634e7929541eC2318f3dCF7e
2025-12-03 10:15:23 [INFO] Amount: 10000
2025-12-03 10:15:23 [DEBUG] ✓ Network validation passed: base-sepolia
2025-12-03 10:15:23 [DEBUG] ✓ Payload extraction passed: Payer=0x742d...
2025-12-03 10:15:23 [DEBUG] ✓ EIP-712 typed data signature verification succeeded
2025-12-03 10:15:23 [DEBUG] ✓ Recipient verification passed: 0x1234...
2025-12-03 10:15:23 [DEBUG] ✓ Time window validation passed
2025-12-03 10:15:23 [DEBUG] ✓ Balance verification passed: 1000000
2025-12-03 10:15:23 [DEBUG] ✓ Amount verification passed
2025-12-03 10:15:23 [INFO] ✅ All verification layers passed successfully
```

---

## Common Issues & Solutions

### Issue 1: "Invalid signature"
**Cause:** Signature doesn't match the data or wrong signer
**Solution:** Ensure EIP-712 domain matches exactly, including chainId and contract address

### Issue 2: "Recipient mismatch"
**Cause:** `authorization.to` ≠ `requirements.payTo`
**Solution:** Ensure user signs for the correct merchant address

### Issue 3: "Insufficient balance"
**Cause:** User doesn't have enough USDC
**Solution:** Get testnet USDC from faucet or use different wallet

### Issue 4: "Nonce already used"
**Cause:** Replay protection - nonce was used in previous transaction
**Solution:** Generate new nonce for each payment

### Issue 5: "Payment authorization expired"
**Cause:** Current time > validBefore
**Solution:** Create new signature with updated timestamps

---

## Performance Benchmarks

| Operation | Average Time | Notes |
|-----------|--------------|-------|
| Verify (no blockchain calls) | 50-100ms | Signature verification only |
| Verify (with balance check) | 200-500ms | Includes RPC call |
| Settle (fast path) | 10-15 seconds | Transaction confirmed in 30s window |
| Settle (slow path) | 30-120 seconds | Returns pending, monitor confirms later |
| Database query | 5-20ms | Redis cache hit |
| Webhook delivery | 100-1000ms | Depends on merchant endpoint |

---

## Security Checklist

- [x] Recipient validation (prevents payment redirection)
- [x] Signature verification (EIP-712)
- [x] Amount matching
- [x] Time window validation
- [x] Nonce protection (replay prevention)
- [x] Balance verification
- [x] Network validation
- [x] Merchant authentication
- [x] Rate limiting
- [x] HTTPS/TLS encryption
- [x] HMAC webhook signatures
- [x] Input validation (Joi schemas)
- [x] SQL injection prevention (parameterized queries)
- [x] Gas estimation with buffer

---

## Next Steps

1. **Integration Testing** - Test with real wallet on testnet
2. **Load Testing** - Use Apache Bench or k6 for stress testing
3. **Security Audit** - Review code for additional vulnerabilities
4. **Monitoring** - Set up Prometheus/Grafana for metrics
5. **Documentation** - Update API docs with new security features

For more details, see:
- `X402_PROTOCOL_FLOW.md` - Complete protocol flow with raw data
- `WEBHOOK_RESOURCE_TRACKING.md` - Resource tracking implementation
- `SECURITY.md` - Security best practices
