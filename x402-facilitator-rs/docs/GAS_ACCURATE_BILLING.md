# Gas-Accurate USD Billing System

## Overview

This system implements precise USD credit deductions based on actual on-chain gas costs, replacing the previous integer credit system with decimal precision tracking.

## Architecture

### Components

1. **GasCostWatcher Service** ([gas_cost_watcher.rs](src/services/gas_cost_watcher.rs))
   - Background task that monitors confirmed transactions
   - Fetches transaction receipts to get actual gas usage
   - Calculates gas cost in USD using ETH/USD price feed
   - Performs atomic credit deductions

2. **Database Extensions** ([database.rs](src/services/database.rs))
   - New USD credit columns with DECIMAL(20,10) precision
   - Atomic deduction with overdraft protection
   - Pending deduction queue for reliability
   - ETH price cache table

3. **Settlement Integration** ([settlement.rs](src/services/settlement.rs))
   - Queues gas deductions after successful transaction submission
   - Maintains backwards compatibility with legacy integer credits

4. **Balance API** ([merchant.rs](src/routes/merchant.rs))
   - New `/merchant/:id/credits/balance` endpoint
   - Returns USD balance rounded to 4 decimal places for UI
   - Also provides raw precision for calculations

## Database Schema

Run the migration:
```bash
sudo mysql x402_facilitator < scripts/schema_gas_accurate_billing.sql
```

### New/Modified Tables

#### `merchants` (modified)
```sql
usd_credit_balance DECIMAL(20, 10)           -- Current USD balance
lifetime_usd_credits_purchased DECIMAL(20, 10)
lifetime_usd_credits_used DECIMAL(20, 10)
```

#### `transactions` (modified)
```sql
gas_used BIGINT UNSIGNED                     -- Actual gas units used
effective_gas_price_wei BIGINT UNSIGNED      -- Gas price in wei
gas_cost_eth DECIMAL(36, 18)                 -- Gas cost in ETH
gas_cost_usd DECIMAL(20, 10)                 -- Gas cost in USD
eth_usd_price DECIMAL(20, 10)                -- ETH/USD rate at deduction
service_fee_usd DECIMAL(20, 10)              -- Fixed service fee ($0.001)
total_usd_deducted DECIMAL(20, 10)           -- Total amount deducted
deduction_status ENUM('pending', 'deducted', 'failed', 'refunded')
deducted_at TIMESTAMP
```

#### `pending_gas_deductions` (new)
Queue for reliable async deduction processing:
```sql
id BIGINT AUTO_INCREMENT
transaction_id BIGINT NOT NULL UNIQUE
merchant_id BIGINT NOT NULL
transaction_hash VARCHAR(66) NOT NULL
network VARCHAR(50) NOT NULL
service_fee_usd DECIMAL(20, 10) DEFAULT 0.001
status ENUM('queued', 'processing', 'completed', 'failed', 'expired')
retry_count INT DEFAULT 0
max_retries INT DEFAULT 10
```

#### `usd_credit_transactions` (new)
Audit log for all USD credit movements:
```sql
id BIGINT AUTO_INCREMENT
merchant_id BIGINT NOT NULL
transaction_id BIGINT
type ENUM('purchase', 'service_fee', 'gas_deduction', 'refund', 'bonus', 'adjustment')
amount DECIMAL(20, 10)            -- Negative for deductions
balance_before DECIMAL(20, 10)
balance_after DECIMAL(20, 10)
gas_used BIGINT UNSIGNED          -- For gas_deduction type
gas_price_wei BIGINT UNSIGNED
gas_cost_eth DECIMAL(36, 18)
eth_usd_price DECIMAL(20, 10)
```

#### `eth_price_cache` (new)
ETH/USD price feed cache:
```sql
id BIGINT AUTO_INCREMENT
source VARCHAR(50) DEFAULT 'coinmarketcap'
eth_usd_price DECIMAL(20, 10) NOT NULL
expires_at TIMESTAMP NOT NULL
```

## Billing Model

### Per-Transaction Costs
1. **Fixed Service Fee**: $0.001 (configurable in `gas_cost_watcher.rs`)
2. **Gas Cost**: Actual gas used × effective gas price × ETH/USD rate

### Calculation Precision
- All calculations use `rust_decimal` (not floating-point)
- Database stores 10 decimal places
- API returns 4 decimal places for UI display

### Example
```
Transaction: Settlement on Base
- Gas Used: 85,000 units
- Gas Price: 0.005 gwei (5,000,000 wei)
- Gas Cost: 0.000000425 ETH
- ETH Price: $3,500
- Gas Cost USD: $0.00148750

Total Deduction:
- Service Fee: $0.0010
- Gas Cost:    $0.00148750
- Total:       $0.00248750
```

## API Endpoints

### GET /merchant/:id/credits/balance

Returns precise USD balance:

```json
{
  "usdBalance": "10.5432",           // Rounded for display
  "rawBalance": "10.5432156789",     // Full precision
  "lifetimePurchased": "100.0000",
  "lifetimeUsed": "89.4568",
  "serviceFeePerTx": "0.0010",
  "ethUsdPrice": "3500.00"
}
```

## Migration Path

### Phase 1: Deploy (Backwards Compatible)
1. Run SQL migration
2. Deploy new code
3. Legacy integer credits continue working
4. New USD credits start accumulating

### Phase 2: Balance Migration
```sql
-- Convert legacy integer credits to USD (1 credit = $0.01)
UPDATE merchants 
SET usd_credit_balance = credit_balance * 0.01,
    lifetime_usd_credits_purchased = lifetime_credits_purchased * 0.01,
    lifetime_usd_credits_used = lifetime_credits_used * 0.01
WHERE usd_credit_balance = 0 AND credit_balance > 0;
```

### Phase 3: Frontend Migration
Update UI to use new `/credits/balance` endpoint for displaying USD values.

## Monitoring

### Key Metrics
- Pending deduction queue depth
- Average gas costs by network
- ETH price feed staleness
- Deduction success/failure rates

### Views
```sql
-- Gas cost analytics by network
SELECT * FROM v_gas_cost_analytics;

-- Pending deductions
SELECT * FROM v_pending_deductions;

-- Merchant USD balance summary
SELECT * FROM v_merchant_usd_balance;
```

## Error Handling

### Insufficient Funds
If a merchant's balance goes negative due to gas costs:
1. Critical error is logged
2. Deduction marked as failed
3. Manual intervention required

### Receipt Not Found
If transaction receipt isn't available:
1. Deduction stays in queue
2. Retries with exponential backoff (1min, 2min, 4min...)
3. Expires after 10 retries

### Price Feed Failure
If ETH price can't be fetched:
1. Uses cached price (up to 10 minutes old)
2. Falls back to last known price
3. Logs warning

## Security Considerations

1. **Atomic Operations**: All deductions use database transactions with row locks
2. **Overdraft Prevention**: Balance check happens within the same transaction
3. **Audit Trail**: Every credit movement is logged with full context
4. **No Floating Point**: `rust_decimal` prevents precision loss
