# Adding New Tokens

## Current Structure

The config now uses a structured `networks` object where each network can have multiple tokens:

```typescript
networks: {
  'base-sepolia': {
    chainId: 84532,
    rpcUrl: 'https://...',
    tokens: [
      { symbol: 'USDC', name: 'USD Coin', address: '0x...', decimals: 6, eip712: {...} },
      // Add more tokens here
    ]
  }
}
```

## How to Add a New Token

### 1. Add Environment Variable

In `.env`:
```bash
# Example: Adding DAI to Base Sepolia
BASE_SEPOLIA_DAI=0x1234567890abcdef...
```

### 2. Update Config

In `src/config/index.ts`, add the token to the network's tokens array:

```typescript
networks: {
  'base-sepolia': {
    chainId: 84532,
    rpcUrl: process.env.BASE_SEPOLIA_RPC || '...',
    tokens: [
      {
        symbol: 'USDC',
        name: 'USD Coin',
        address: process.env.BASE_SEPOLIA_USDC!,
        decimals: 6,
        eip712: {
          name: 'USDC',
          version: '2',
        },
      },
      {
        symbol: 'DAI',
        name: 'Dai Stablecoin',
        address: process.env.BASE_SEPOLIA_DAI!,
        decimals: 18,
        eip712: {
          name: 'Dai Stablecoin',
          version: '1',
        },
      },
    ],
  },
}
```

### 3. API Will Automatically Return It

The `/networks` endpoint will automatically include all tokens:

```json
{
  "success": true,
  "networks": [{
    "network": "base-sepolia",
    "chainId": 84532,
    "tokens": [
      {
        "symbol": "USDC",
        "name": "USD Coin",
        "address": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
        "decimals": 6,
        "eip712": {...}
      },
      {
        "symbol": "DAI",
        "name": "Dai Stablecoin",
        "address": "0x...",
        "decimals": 18,
        "eip712": {...}
      }
    ]
  }]
}
```

## Helper Functions

Use these helper functions to access network/token data:

```typescript
import { getNetworkConfig, getTokenByAddress, getEIP712Domain } from '../config/index.js';

// Get full network config
const network = getNetworkConfig('base-sepolia');
console.log(network.tokens); // Array of all tokens

// Get specific token by address
const token = getTokenByAddress('base-sepolia', '0x036Cb...');
console.log(token.symbol); // 'USDC'

// Get EIP-712 domain for signing
const domain = getEIP712Domain('base-sepolia', '0x036Cb...');
// Returns: { name, version, chainId, verifyingContract }
```

## Adding Non-EIP-712 Tokens

For tokens that don't support EIP-712 (standard ERC-20), omit the `eip712` field:

```typescript
{
  symbol: 'WETH',
  name: 'Wrapped Ether',
  address: process.env.BASE_SEPOLIA_WETH!,
  decimals: 18,
  // No eip712 field - will use standard ERC-20
}
```
