# USDC ERC-3009 Implementation Notes

## Issue
Base Sepolia USDC (`0x036CbD53842c5426634e7929541eC2318f3dCF7e`) supports ERC-3009 `transferWithAuthorization`, but requires **EIP-712 typed data signatures**.

## Current Problem
We're using EIP-191 personal message signing:
```javascript
const message = `Chain ID: base-sepolia\nContract: 0x036...\n...`;
const signature = await wallet.signMessage(message);  // ❌ Wrong format
```

## Required Format
ERC-3009 needs EIP-712 typed data:
```javascript
const domain = {
  name: 'USD Coin',
  version: '2',
  chainId: 84532,  // Base Sepolia
  verifyingContract: '0x036CbD53842c5426634e7929541eC2318f3dCF7e'
};

const types = {
  TransferWithAuthorization: [
    { name: 'from', type: 'address' },
    { name: 'to', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'validAfter', type: 'uint256' },
    { name: 'validBefore', type: 'uint256' },
    { name: 'nonce', type: 'bytes32' }
  ]
};

const value = {
  from: '0x67B662...',
  to: '0xAb5801...',
  value: '1000000',
  validAfter: 0,
  validBefore: 1764500328,
  nonce: '0x93fa8f...'
};

const signature = await wallet.signTypedData(domain, types, value);  // ✅ Correct
```

## Solution Options

### Option 1: Use EIP-712 Signing (Recommended)
Update signature generation and verification to use EIP-712 typed data.

### Option 2: Custom Relay Contract
Deploy a relay contract that accepts EIP-191 signatures and translates them.

### Option 3: Use Different Token
Use a token that supports simple message-based authorization.

## Next Steps
1. Update `generate-test-signature` to use `signTypedData`
2. Update verification service to verify EIP-712 signatures
3. Test with proper typed data signature
