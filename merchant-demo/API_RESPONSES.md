# X-402 Facilitator API Response Documentation

Complete guide to all API responses from the X-402 facilitator service.

## Table of Contents
- [Networks Endpoint](#networks-endpoint)
- [Verify Endpoint](#verify-endpoint)
- [Settle Endpoint](#settle-endpoint)
- [Merchant Endpoint](#merchant-endpoint)

---

## Networks Endpoint

**GET** `/networks`

Returns all supported payment networks and tokens.

### Success Response (200)

```json
{
  "success": true,
  "networks": [
    {
      "network": "Base Sepolia",
      "chainId": 84532,
      "tokens": [
        {
          "symbol": "USDC",
          "name": "USD Coin",
          "address": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
          "decimals": 6,
          "eip712": {
            "name": "USDC",
            "version": "2",
            "verifyingContract": "0x036CbD53842c5426634e7929541eC2318f3dCF7e"
          }
        }
      ],
      "rpcConfigured": true
    },
    {
      "network": "Ethereum Sepolia",
      "chainId": 11155111,
      "tokens": [
        {
          "symbol": "USDC",
          "name": "USD Coin",
          "address": "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
          "decimals": 6,
          "eip712": {
            "name": "USDC",
            "version": "2",
            "verifyingContract": "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238"
          }
        }
      ],
      "rpcConfigured": true
    },
    {
      "network": "BSC Testnet",
      "chainId": 97,
      "tokens": [
        {
          "symbol": "USDT",
          "name": "USDT Token",
          "address": "0x337610d27c682E347C9cD60BD4b3b107C9d34dDd",
          "decimals": 18,
          "eip712": {
            "name": "USDT Token",
            "version": "2",
            "verifyingContract": "0x337610d27c682E347C9cD60BD4b3b107C9d34dDd"
          }
        }
      ],
      "rpcConfigured": true
    }
  ],
  "defaultNetwork": "Base Sepolia"
}
```

### Usage

```typescript
const response = await fetch('https://api.novacasino.xyz/networks');
const data = await response.json();

// Access networks
data.networks.forEach(network => {
  console.log(`Network: ${network.network}`);
  console.log(`Chain ID: ${network.chainId}`);
  
  network.tokens.forEach(token => {
    console.log(`  Token: ${token.symbol} (${token.address})`);
    console.log(`  Decimals: ${token.decimals}`);
    console.log(`  EIP-712 Domain: ${token.eip712.name} v${token.eip712.version}`);
  });
});
```

---

## Verify Endpoint

**POST** `/verify`

Verifies a payment signature without executing the blockchain transaction.

### Request Body

```json
{
  "x402Version": 1,
  "paymentPayload": {
    "x402Version": 1,
    "payload": {
      "authorization": {
        "from": "0x67B662afAc6AE778134803aeB9a32d4fF0ECe84C",
        "to": "0x530f81f36d55118d8e829a1f8b15a4d910f43b6e",
        "value": "10000",
        "validAfter": "1765031054",
        "validBefore": "1765034654",
        "nonce": "0x0679b6dc44641696ff45f88b03d63d7be02cba09ece51f6cdf584d4a5f7e3cce"
      },
      "signature": "0x54a131e2aa70644bff29eb4058268f7c76a8775d08d39365474211e48f9618111b823deb9c3ea3855e505880c336c2cc40801003083cbcc20be584305e7878021c"
    }
  },
  "paymentRequirements": {
    "scheme": "erc3009",
    "network": "Base Sepolia",
    "asset": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    "payTo": "0x530f81f36d55118d8e829a1f8b15a4d910f43b6e",
    "maxAmountRequired": "10000",
    "resource": "/dancing-cat.gif",
    "description": "Premium Dancing Cat GIF",
    "mimeType": "image/gif",
    "maxTimeoutSeconds": 3600
  }
}
```

### Success Response - Valid Payment (200)

```json
{
  "isValid": true,
  "is_valid": true,
  "payer": "0x67B662afAc6AE778134803aeB9a32d4fF0ECe84C"
}
```

### Success Response - Invalid Payment (200)

**Note:** Returns 200 status even when payment is invalid. Check `isValid` field.

```json
{
  "isValid": false,
  "is_valid": false,
  "invalidReason": "Network 'base-sepolia' is not supported. Supported networks: Base Sepolia, Ethereum Sepolia, BSC Testnet",
  "invalid_reason": "Network 'base-sepolia' is not supported. Supported networks: Base Sepolia, Ethereum Sepolia, BSC Testnet",
  "payer": "0x67B662afAc6AE778134803aeB9a32d4fF0ECe84C"
}
```

### Common Invalid Reasons

- `"Network 'xxx' is not supported. Supported networks: ..."`
- `"Token 0xXXX is not supported on network XXX"`
- `"Invalid signature"`
- `"Payment expired (current time after validBefore)"`
- `"Payment not yet valid (current time before validAfter)"`
- `"Insufficient balance"`
- `"Amount mismatch: required XXX, provided YYY"`
- `"Recipient mismatch: expected XXX, got YYY"` (CRITICAL SECURITY)

### Error Response (401)

```json
{
  "error": "Unauthorized",
  "message": "Invalid API key"
}
```

### Error Response (500)

```json
{
  "isValid": false,
  "is_valid": false,
  "invalidReason": "Internal server error during verification",
  "invalid_reason": "Internal server error during verification"
}
```

### Usage

```typescript
const response = await fetch('https://api.novacasino.xyz/verify', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`
  },
  body: JSON.stringify({
    x402Version: 1,
    paymentPayload: { x402Version: 1, payload: { authorization, signature } },
    paymentRequirements: requirements
  })
});

const result = await response.json();

// IMPORTANT: Check isValid field, not HTTP status!
if (response.ok && result.isValid) {
  console.log('Payment is valid!');
  console.log('Payer:', result.payer);
} else if (response.ok && !result.isValid) {
  console.error('Payment invalid:', result.invalidReason);
} else {
  console.error('API error:', result.message || result.invalidReason);
}
```

---

## Settle Endpoint

**POST** `/settle`

Executes the payment on the blockchain. Returns immediately with status.

### Request Body

Same as verify endpoint.

### Success Response - Transaction Submitted (200)

**IMPORTANT:** `success: true` with `status: "pending"` means transaction was submitted but not yet confirmed.

```json
{
  "success": true,
  "transaction": "0x8f5e9c7b3a1d6e4f2c8a9b5e7d3f1a4c6b8e2d9f5a7c3e1b6d8f4a2c5e9b7d3f1",
  "transactionHash": "0x8f5e9c7b3a1d6e4f2c8a9b5e7d3f1a4c6b8e2d9f5a7c3e1b6d8f4a2c5e9b7d3f1",
  "network": "Base Sepolia",
  "payer": "0x67B662afAc6AE778134803aeB9a32d4fF0ECe84C",
  "status": "pending",
  "message": "Transaction submitted and pending confirmation. This may take 1-2 minutes."
}
```

### Success Response - Transaction Confirmed (200)

```json
{
  "success": true,
  "transaction": "0x8f5e9c7b3a1d6e4f2c8a9b5e7d3f1a4c6b8e2d9f5a7c3e1b6d8f4a2c5e9b7d3f1",
  "transactionHash": "0x8f5e9c7b3a1d6e4f2c8a9b5e7d3f1a4c6b8e2d9f5a7c3e1b6d8f4a2c5e9b7d3f1",
  "network": "Base Sepolia",
  "payer": "0x67B662afAc6AE778134803aeB9a32d4fF0ECe84C",
  "status": "completed"
}
```

### Success Response - Settlement Failed (200)

**IMPORTANT:** `success: false` with status code 200.

```json
{
  "success": false,
  "errorReason": "Transaction already settled with this nonce",
  "error_reason": "Transaction already settled with this nonce",
  "network": "Base Sepolia",
  "payer": "0x67B662afAc6AE778134803aeB9a32d4fF0ECe84C",
  "transactionHash": "0xexisting_transaction_hash",
  "transactionStatus": "confirmed",
  "status": "failed"
}
```

### Common Error Reasons

- `"Transaction already settled with this nonce"` - Duplicate/replay attack
- `"Nonce already used"` - Authorization already consumed
- `"Insufficient balance"` - Payer doesn't have enough tokens
- `"Signature verification failed"` - Invalid signature
- `"Payment expired"` - Outside valid time window
- `"Transaction failed or reverted"` - Blockchain execution failed
- `"Gas estimation failed"` - Unable to execute on-chain

### Error Response (401)

```json
{
  "success": false,
  "errorReason": "Authentication required for settlement"
}
```

### Error Response (500)

```json
{
  "success": false,
  "errorReason": "Internal server error during settlement",
  "error_reason": "Internal server error during settlement",
  "network": "Base Sepolia"
}
```

### Usage

```typescript
const response = await fetch('https://api.novacasino.xyz/settle', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`
  },
  body: JSON.stringify({
    x402Version: 1,
    paymentPayload: { x402Version: 1, payload: { authorization, signature } },
    paymentRequirements: requirements
  })
});

const result = await response.json();

// ALWAYS check both response.ok AND result.success
if (response.ok && result.success) {
  // Check status field
  if (result.status === 'pending') {
    console.log('Transaction submitted, waiting for confirmation...');
    console.log('TX Hash:', result.transaction);
    console.log('Message:', result.message);
    
    // Show user: "Payment processing, please wait..."
    // Monitor transaction status or wait for webhook
  } else if (result.status === 'completed') {
    console.log('Payment confirmed!');
    console.log('TX Hash:', result.transaction);
    
    // Serve protected content
  }
} else if (response.ok && !result.success) {
  console.error('Settlement failed:', result.errorReason);
  console.log('Status:', result.status);
  
  // Show user-friendly error
  if (result.errorReason.includes('already settled')) {
    alert('This payment has already been used.');
  } else if (result.errorReason.includes('Insufficient balance')) {
    alert('Insufficient balance. Please add funds to your wallet.');
  } else {
    alert('Payment failed: ' + result.errorReason);
  }
} else {
  console.error('API error:', result);
}
```

### Important Notes

1. **`success: true` + `status: "pending"`** - Transaction submitted but not confirmed
   - Show loading indicator
   - Wait 1-2 minutes for confirmation
   - Can check transaction on block explorer

2. **`success: true` + `status: "completed"`** - Payment fully confirmed
   - Safe to serve content
   - Transaction is on blockchain

3. **`success: false`** - Settlement failed
   - Check `errorReason` for details
   - Show appropriate error to user
   - User may need to retry with new signature

4. **HTTP 500** - Server error
   - Retry with exponential backoff
   - Payment may not have been executed

---

## Merchant Endpoint

**GET** `/merchant`

Returns merchant account information.

### Headers

```
Authorization: Bearer YOUR_API_KEY
```

### Success Response (200)

```json
{
  "merchant": {
    "id": 1,
    "merchant_address": "0x530f81f36d55118d8e829a1f8b15a4d910f43b6e",
    "api_key": "df120001...",
    "tier": "basic",
    "created_at": "2024-12-06T10:30:00.000Z"
  }
}
```

### Error Response (401)

```json
{
  "error": "Unauthorized",
  "message": "Invalid API key"
}
```

### Usage

```typescript
const response = await fetch('https://api.novacasino.xyz/merchant', {
  headers: {
    'Authorization': `Bearer ${apiKey}`
  }
});

if (response.ok) {
  const data = await response.json();
  console.log('Merchant address:', data.merchant.merchant_address);
  console.log('Tier:', data.merchant.tier);
} else {
  const error = await response.json();
  console.error('Auth error:', error.message);
}
```

---

## Status Field Reference

### Verify Endpoint
- No `status` field - check `isValid` boolean

### Settle Endpoint
- `"pending"` - Transaction submitted, waiting for blockchain confirmation (1-2 min)
- `"completed"` - Transaction confirmed on blockchain
- `"failed"` - Transaction failed or was rejected

---

## Best Practices

### 1. Always Check Both HTTP Status AND Result Fields

```typescript
// ❌ WRONG
if (response.ok) {
  // Serve content
}

// ✅ CORRECT
if (response.ok && result.success && result.status === 'completed') {
  // Serve content
}
```

### 2. Handle Pending Status

```typescript
if (result.success && result.status === 'pending') {
  showLoadingIndicator('Payment processing...');
  
  // Option 1: Poll transaction status
  await pollTransactionStatus(result.transaction);
  
  // Option 2: Wait for webhook callback
  // Option 3: Show "check back later" message
}
```

### 3. Show User-Friendly Errors

```typescript
const errorMessages = {
  'already settled': 'This payment has already been used. Please create a new payment.',
  'Insufficient balance': 'Insufficient balance. Please add funds to your wallet.',
  'Payment expired': 'Payment expired. Please try again.',
  'Nonce already used': 'This authorization has already been used.',
};

function getUserFriendlyError(errorReason: string): string {
  for (const [key, message] of Object.entries(errorMessages)) {
    if (errorReason.includes(key)) {
      return message;
    }
  }
  return 'Payment failed. Please try again.';
}
```

### 4. Verify Before Settle

Always call `/verify` before `/settle` to validate payment without gas costs:

```typescript
// 1. Verify first (free, no gas)
const verifyResponse = await fetch('/verify', {...});
const verifyResult = await verifyResponse.json();

if (!verifyResult.isValid) {
  alert('Invalid payment: ' + verifyResult.invalidReason);
  return;
}

// 2. Then settle (costs gas)
const settleResponse = await fetch('/settle', {...});
const settleResult = await settleResponse.json();

if (settleResult.success) {
  if (settleResult.status === 'pending') {
    showPendingState();
  } else if (settleResult.status === 'completed') {
    serveContent();
  }
}
```

---

## Error Code Summary

| HTTP Code | Meaning | Action |
|-----------|---------|--------|
| 200 | Success (check result fields!) | Parse JSON, check `isValid`/`success` |
| 401 | Unauthorized | Check API key, re-authenticate |
| 429 | Rate Limited | Wait and retry with backoff |
| 500 | Server Error | Retry with exponential backoff |

---

## Python Compatibility

The API returns both snake_case and camelCase fields:

```json
{
  "isValid": true,
  "is_valid": true,
  "invalidReason": "...",
  "invalid_reason": "...",
  "transactionHash": "0x...",
  "errorReason": "...",
  "error_reason": "..."
}
```

Use whichever naming convention your language prefers.
