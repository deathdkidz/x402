# Network Name Normalization Fix

## Problem
The x402 facilitator was failing to recognize network names sent in different formats. When merchants sent requests with network names like `base-sepolia`, `BASE-SEPOLIA`, or `base_sepolia`, the system would fail with:

```
⚠️ base-sepolia: Provider not in pool, creating temporary HTTP provider
error: Pre-settlement balance check error: No RPC URL configured for network: base-sepolia
```

The system expected the exact format `Base Sepolia` (title case with space).

## Solution
Implemented a centralized network name normalization function that handles all variations:

### Supported Formats (All Networks)
- ✅ `Base Sepolia` (standard)
- ✅ `base-sepolia` (hyphenated lowercase)
- ✅ `base sepolia` (lowercase with space)
- ✅ `BASE-SEPOLIA` (uppercase with hyphen)
- ✅ `BaSe SePolia` (mixed case)
- ✅ `base_sepolia` (underscore separator)
- ✅ `BASE SEPOLIA` (uppercase with space)

### Changes Made

1. **Added normalization utility** (`src/config/index.ts`):
   - `normalizeNetworkName()` - Converts any format to the configured network name
   - Handles case-insensitive matching
   - Handles hyphens, underscores, and spaces as separators

2. **Updated helper functions** to use normalization:
   - `getNetworkConfig()`
   - `getTokenByAddress()`
   - `getRpcUrl()`
   - `getEIP712Domain()`

3. **Updated ProviderPool** (`src/services/providerPool.ts`):
   - `getProvider()` - Normalizes network name before lookup
   - `hasProvider()` - Normalizes network name before checking

## Testing

Run the test script to verify all formats work:

```bash
node test-network-normalization.mjs
```

Expected output:
```
✅ Base Sepolia         → Normalized successfully
✅ base-sepolia         → Normalized successfully
✅ base sepolia         → Normalized successfully
✅ BASE-SEPOLIA         → Normalized successfully
✅ BaSe-SePolia         → Normalized successfully
✅ base_sepolia         → Normalized successfully
✅ BASE SEPOLIA         → Normalized successfully

Results: 7/7 passed, 0 failed
```

## Impact

- **Merchants** can now use any network name format in their requests
- **Frontend applications** no longer need to match exact capitalization
- **API integrations** are more flexible and error-resistant
- **All networks** benefit from normalization (Base, Ethereum, HyperEVM, etc.)

## Example

Before:
```javascript
// ❌ Would fail
{
  network: 'base-sepolia',
  asset: '0x036CbD53842c5426634e7929541eC2318f3dCF7e'
}
```

After:
```javascript
// ✅ All formats work
{
  network: 'base-sepolia',     // or
  network: 'Base Sepolia',      // or
  network: 'BASE-SEPOLIA',      // etc.
  asset: '0x036CbD53842c5426634e7929541eC2318f3dCF7e'
}
```

## Files Modified

- `/srv/x402/x402-facilitator/src/config/index.ts`
- `/srv/x402/x402-facilitator/src/services/providerPool.ts`
- `/srv/x402/merchant-demo/config/protected-resources.ts`

## Date
December 16, 2025
