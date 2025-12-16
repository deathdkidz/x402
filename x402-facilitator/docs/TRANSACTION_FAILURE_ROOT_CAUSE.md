# Transaction Failure Root Cause Analysis

## Issue
Transactions are failing with "FiatTokenV2: invalid signature" error, wasting gas on every failed settlement.

## Root Cause
**Address checksum mismatch in EIP-712 signatures**

The EIP-712 signature is being created with a **lowercase** `to` address:
```
0x530f81f36d55118d8e829a1f8b15a4d910f43b6e (used in signature)
```

But the USDC contract expects the **checksummed** address:
```
0x530f81F36D55118D8e829A1f8b15a4D910f43b6E (checksummed version)
```

When the contract validates the signature, it reconstructs the EIP-712 message using the checksummed address from the transaction parameters, which doesn't match the address that was signed, causing signature validation to fail.

## Evidence

1. **Balance Check**: Wallet has sufficient USDC (11 USDC) ✅
2. **Nonce Check**: Authorization nonce not used ✅  
3. **Signature Verification**: Signature is mathematically valid ✅
4. **On-chain Error**: "FiatTokenV2: invalid signature" ❌
5. **Address Mismatch**: Signature uses lowercase, contract expects checksummed ❌

## Impact
- **Gas Wasted**: ~62,000 gas units per failed transaction
- **Cost**: ~0.0000000747 ETH per failure
- **User Experience**: Payments fail even with valid signatures
- **Throughput**: 0% success rate in batch settlements

## Solution

### Quick Fix (Client-Side)
Ensure the wallet/client **always uses checksummed addresses** when creating EIP-712 signatures:

```javascript
import { ethers } from 'ethers';

// ❌ Wrong - using lowercase
const to = '0x530f81f36d55118d8e829a1f8b15a4d910f43b6e';

// ✅ Correct - use checksummed
const to = ethers.getAddress('0x530f81f36d55118d8e829a1f8b15a4d910f43b6e');
// Returns: 0x530f81F36D55118D8e829A1f8b15a4D910f43b6E
```

### Additional Safeguard (Facilitator)
Add pre-flight signature validation using `staticCall` before sending the actual transaction. This would:
1. Detect invalid signatures **before** sending transaction
2. Save gas by not broadcasting doomed transactions
3. Return helpful error message to merchant

## Recommended Changes

### 1. Client/Wallet Side
Update signature creation to use checksummed addresses:

```javascript
const value = {
  from: ethers.getAddress(from),      // Checksum
  to: ethers.getAddress(to),          // Checksum  
  value: amount,
  validAfter: validAfter,
  validBefore: validBefore,
  nonce: nonce,
};

const signature = await wallet.signTypedData(domain, types, value);
```

### 2. Facilitator Side (Gas Optimization)
Add simulation before transaction execution in settlement service:

```typescript
// Before sending transaction, simulate it
try {
  await tokenContract.transferWithAuthorization.staticCall(
    payer, payTo, amount, validAfter, validBefore, nonce, v, r, s
  );
  logger.debug('✓ Pre-flight simulation passed');
} catch (simError) {
  logger.error(`❌ Pre-flight simulation failed: ${simError.reason || simError.message}`);
  return {
    success: false,
    errorReason: `Transaction would fail: ${simError.reason || simError.message}`,
    network: requirements.network,
    payer,
    status: 'failed',
  };
}

// Only send transaction if simulation succeeds
const tx = await tokenContract.transferWithAuthorization(...);
```

This prevents wasting gas on transactions that will definitely fail.

## Testing
To verify the fix:

```bash
# Test with checksummed addresses
node test-eip712-signature.mjs

# Should show signature verification passing
```

## Related
- EIP-712: https://eips.ethereum.org/EIPS/eip-712
- ERC-3009: https://eips.ethereum.org/EIPS/eip-3009
- Address Checksum: https://eips.ethereum.org/EIPS/eip-55
