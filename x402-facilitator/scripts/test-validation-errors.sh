#!/bin/bash

FACILITATOR_URL="https://api.netpay.id"

echo "╔═══════════════════════════════════════════════════════════════════╗"
echo "║          TESTING IMPROVED VALIDATION ERROR MESSAGES               ║"
echo "╚═══════════════════════════════════════════════════════════════════╝"
echo ""

# Test 1: Missing required field (no auth needed to test validation)
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Test 1: Missing 'network' field - Should show helpful error"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
curl -s -X POST "${FACILITATOR_URL}/verify" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer 10426200df51076eeee39dba3963b78ba616b6d490ba6606bb16dfb7974e3036" \
  -d '{
    "x402Version": 1,
    "paymentPayload": {
      "x402Version": 1,
      "payload": {
        "authorization": {
          "from": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
          "to": "0x6008d7660d3ef04e8dbd10cff6e5bec980fcb88d",
          "value": "10000",
          "validAfter": "0",
          "validBefore": "9999999999",
          "nonce": "0x1234"
        },
        "signature": "0xabcd"
      }
    },
    "paymentRequirements": {
      "scheme": "exact",
      "asset": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
      "payTo": "0x6008d7660d3ef04e8dbd10cff6e5bec980fcb88d",
      "maxAmountRequired": "10000",
      "resource": "/test",
      "description": "Test",
      "mimeType": "text/plain",
      "maxTimeoutSeconds": 300
    }
  }' | jq '.'
echo ""

# Test 2: Wrong scheme value
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Test 2: Invalid scheme 'deferred' - Should show helpful hint"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
curl -s -X POST "${FACILITATOR_URL}/verify" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer test_key_123" \
  -d '{
    "x402Version": 1,
    "paymentPayload": {
      "x402Version": 1,
      "payload": {
        "authorization": {
          "from": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
          "to": "0x6008d7660d3ef04e8dbd10cff6e5bec980fcb88d",
          "value": "10000",
          "validAfter": "0",
          "validBefore": "9999999999",
          "nonce": "0x1234"
        },
        "signature": "0xabcd"
      }
    },
    "paymentRequirements": {
      "scheme": "deferred",
      "network": "base-sepolia",
      "asset": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
      "payTo": "0x6008d7660d3ef04e8dbd10cff6e5bec980fcb88d",
      "maxAmountRequired": "10000",
      "resource": "/test",
      "description": "Test",
      "mimeType": "text/plain",
      "maxTimeoutSeconds": 300
    }
  }' | jq '.'
echo ""

# Test 3: Multiple missing fields
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Test 3: Multiple missing fields - Should list all errors"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
curl -s -X POST "${FACILITATOR_URL}/verify" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer test_key_123" \
  -d '{
    "x402Version": 1,
    "paymentPayload": {
      "x402Version": 1,
      "payload": {
        "authorization": {
          "from": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb"
        },
        "signature": "0xabcd"
      }
    },
    "paymentRequirements": {
      "scheme": "exact"
    }
  }' | jq '.'
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Validation error messages should now include helpful hints!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
