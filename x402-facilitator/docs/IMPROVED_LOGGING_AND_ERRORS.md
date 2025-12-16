# Improved Logging and Error Messages

## Changes Made (December 16, 2025)

### 1. Network Name Normalization in Logs

**Problem:** Logs were showing the raw network name from merchant payload (e.g., `base-sepolia`, `hyperevm-testnet`) instead of the normalized format (e.g., `Base Sepolia`, `HyperEVM Testnet`).

**Solution:** Updated logging to show normalized network names after validation.

#### Files Modified:

**`src/routes/index.ts`**
- Changed `Network: ${paymentRequirements.network}` → `Network (raw): ${paymentRequirements.network}`
- This shows the original value merchant sent in the route handler
- The normalized value is logged in the service layer after validation

**`src/services/verification.ts`**
- Moved network logging to AFTER normalization
- Now logs: `Network: ${normalizedNetwork}` (e.g., "Base Sepolia")

**`src/services/settlement.ts`**
- Changed to log normalized network: `Network: ${networkForProvider}`
- Shows the actual network name used for provider lookup

#### Example Log Output:

**Before:**
```
Network: base-sepolia
Network: base-sepolia
⚠️ base-sepolia: Provider not in pool
```

**After:**
```
Network (raw): base-sepolia
Network: Base Sepolia
✅ Using provider for Base Sepolia
```

---

### 2. Enhanced Validation Error Messages

**Problem:** Generic validation errors didn't help merchants understand what was wrong or how to fix it.

**Solution:** Added detailed, helpful error messages with examples and hints.

#### Improvements in `src/middleware/validation.ts`:

**Address Validation:**
```javascript
asset: Joi.string().pattern(/^0x[a-fA-F0-9]{40}$/).required()
  .messages({
    'string.pattern.base': 'asset must be a valid Ethereum address (e.g., 0x036CbD53842c5426634e7929541eC2318f3dCF7e)',
  })
```

**Amount Validation:**
```javascript
maxAmountRequired: Joi.string().pattern(/^\d+$/).required()
  .messages({
    'string.pattern.base': 'maxAmountRequired must be a numeric string (e.g., "10000" for 0.01 USDC with 6 decimals)',
  })
```

**Scheme Validation:**
```javascript
scheme: Joi.string().valid('exact').required()
  .messages({
    'any.only': 'scheme must be "exact" (only exact amount matching is currently supported)',
  })
```

**Network Validation:**
```javascript
network: Joi.string().min(1).required()
  .messages({
    'any.required': 'network is required',
    'string.empty': 'network cannot be empty',
  })
```

#### Example Error Response:

**Before:**
```json
{
  "error": "Validation Error",
  "message": "Invalid request payload",
  "details": [
    {
      "field": "paymentRequirements.asset",
      "message": "\"paymentRequirements.asset\" with value \"invalid\" fails to match the required pattern"
    }
  ]
}
```

**After:**
```json
{
  "error": "Validation Error",
  "message": "Invalid request payload: 1 validation error(s) found",
  "details": [
    {
      "field": "paymentRequirements.asset",
      "message": "asset must be a valid Ethereum address (e.g., 0x036CbD53842c5426634e7929541eC2318f3dCF7e)",
      "type": "string.pattern.base"
    }
  ],
  "hint": "Check the API documentation at /docs for correct payload structure"
}
```

---

## Benefits

### For Merchants:
- **Clearer error messages** - Know exactly what's wrong and how to fix it
- **Better examples** - See the correct format for each field
- **Faster debugging** - Spend less time figuring out API issues

### For Facilitator Operations:
- **Consistent logging** - Always see the normalized network name
- **Easier troubleshooting** - Logs are more readable and consistent
- **Better monitoring** - Network names match configuration exactly

---

## Testing

### Test Network Normalization:
```bash
node test-network-normalization.mjs
```

### Test Validation Errors:
```bash
node test-validation-errors.mjs
```

### Test Network Logging:
```bash
node test-network-logging.mjs
pm2 logs x402-facilitator --lines 50
```

---

## All Supported Network Formats

All these formats now work correctly and log the normalized name:

| Merchant Sends | Logs Show | Works |
|---------------|-----------|-------|
| `base-sepolia` | `Base Sepolia` | ✅ |
| `BASE-SEPOLIA` | `Base Sepolia` | ✅ |
| `base_sepolia` | `Base Sepolia` | ✅ |
| `Base Sepolia` | `Base Sepolia` | ✅ |
| `hyperevm-testnet` | `HyperEVM Testnet` | ✅ |
| `HyperEVM-Testnet` | `HyperEVM Testnet` | ✅ |
| `ethereum-sepolia` | `Ethereum Sepolia` | ✅ |

---

## Files Modified

1. `/srv/x402/x402-facilitator/src/routes/index.ts`
2. `/srv/x402/x402-facilitator/src/services/verification.ts`
3. `/srv/x402/x402-facilitator/src/services/settlement.ts`
4. `/srv/x402/x402-facilitator/src/middleware/validation.ts`
5. `/srv/x402/x402-facilitator/src/config/index.ts` (network normalization utility)
6. `/srv/x402/x402-facilitator/src/services/providerPool.ts` (use normalization)

---

## Date
December 16, 2025
