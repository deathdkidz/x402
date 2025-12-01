# Gas Tracking Documentation

## Overview

The x402 Facilitator tracks all blockchain gas usage for operational cost monitoring. Every blockchain operation is logged with detailed gas metrics.

**⚠️ SECURITY NOTE**: Gas statistics are **NOT exposed via API**. This is sensitive financial/operational data. Access gas data only via direct database connection.

## What Gets Tracked

### Successful Transactions
- **Gas Used**: Actual gas units consumed
- **Gas Price**: Gas price in wei at time of transaction
- **Gas Cost**: Total cost in wei and native token (ETH/BNB)
- **Balance Changes**: Facilitator wallet balance before/after transaction
- **Transaction Hash**: On-chain transaction identifier
- **Block Number**: Block where transaction was included

### Failed/Reverted Transactions
- Same metrics as successful (gas is still consumed even if tx reverts)
- **Error Message**: Why the transaction failed
- **Status**: `reverted` for on-chain failures

### Pre-Submission Failures
- **Operation Type**: What was attempted (settlement, etc.)
- **Network**: Which blockchain
- **Error Message**: Why it failed before submission
- **Status**: `failed`

## Database Schema

```sql
CREATE TABLE gas_tracking (
    id INT AUTO_INCREMENT PRIMARY KEY,
    transaction_id INT NULL,              -- Links to transactions table
    merchant_id INT NULL,                  -- Which merchant if applicable
    operation_type VARCHAR(50),            -- 'settlement', 'authorization_check', etc.
    network VARCHAR(50),                   -- 'base-sepolia', 'eth-sepolia', 'bsc-testnet'
    transaction_hash VARCHAR(66),          -- Blockchain tx hash
    gas_token VARCHAR(10),                 -- 'ETH', 'BNB', 'MATIC'
    gas_used BIGINT,                       -- Gas units consumed
    gas_price VARCHAR(50),                 -- Wei per gas unit
    gas_cost_wei VARCHAR(50),              -- Total cost in wei
    gas_cost_native DECIMAL(30, 18),       -- Cost in native token
    gas_cost_usd DECIMAL(10, 4),           -- USD cost (if calculated)
    balance_before VARCHAR(50),            -- Wallet balance before
    balance_after VARCHAR(50),             -- Wallet balance after
    status VARCHAR(20),                    -- 'success', 'failed', 'reverted'
    error_message TEXT,                    -- Error details
    block_number BIGINT,                   -- Block number
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## Accessing Gas Statistics

**⚠️ Database Access Only** - Gas statistics are NOT exposed via API for security reasons.

### Quick View: Use the Stats Script

The easiest way to view gas statistics:

```bash
# View all-time stats
node view-gas-stats.mjs

# Today's stats only
node view-gas-stats.mjs --today

# Last 7 days
node view-gas-stats.mjs --days 7

# Filter by network
node view-gas-stats.mjs --network base-sepolia

# Filter by merchant
node view-gas-stats.mjs --merchant 1

# Show detailed transaction list
node view-gas-stats.mjs --detailed

# Combine filters
node view-gas-stats.mjs --network base-sepolia --days 30 --detailed
```

**Output includes:**
- Overall summary (total transactions, success/fail rates, total gas cost)
- Breakdown by network
- Breakdown by operation type
- Breakdown by status (success/failed/reverted)
- Breakdown by merchant
- Daily trend (last 7 days)
- Detailed transaction list (with --detailed flag)

### Direct MySQL Queries

Connect to your database:
```bash
mysql -u root -p x402_facilitator
```

### Using Database Service (Internal)

The `database.ts` service includes a `getGasStats()` method for programmatic access within the facilitator codebase only:

```typescript
import db from './services/database.js';

const stats = await db.getGasStats({
  network: 'base-sepolia',
  startDate: new Date('2025-12-01'),
  endDate: new Date('2025-12-31'),
});

console.log(stats);
// {
//   totalTransactions: 150,
//   totalGasCostUsd: 4.52,
//   avgGasCostUsd: 0.03,
//   byNetwork: [...],
//   byOperation: [...]
// }
```

**This method is for internal use only** - not exposed to merchants or public.

## Tracked Metrics

### Per Transaction
Every successful settlement logs:
- ⛽ Gas used: `123456 units`
- 💰 Cost: `0.000123456 ETH`
- 📊 Balance change: Before/After

### Aggregate Analytics
Query database for:
- **Total gas spent per network**
- **Average gas cost per operation type**
- **Gas costs per merchant**
- **Daily/weekly/monthly gas usage trends**

## SQL Queries

### Total Gas Cost by Network
```sql
SELECT 
  network,
  COUNT(*) as transactions,
  SUM(gas_used) as total_gas,
  SUM(CAST(gas_cost_native AS DECIMAL(30,18))) as total_cost_native
FROM gas_tracking
WHERE status = 'success'
GROUP BY network;
```

### Gas Cost by Merchant
```sql
SELECT 
  m.merchant_address,
  COUNT(g.id) as transactions,
  SUM(CAST(g.gas_cost_native AS DECIMAL(30,18))) as total_cost
FROM gas_tracking g
JOIN merchants m ON g.merchant_id = m.id
WHERE g.status = 'success'
GROUP BY m.merchant_address
ORDER BY total_cost DESC;
```

### Failed Transaction Gas Waste
```sql
SELECT 
  COUNT(*) as failed_count,
  SUM(CAST(gas_cost_native AS DECIMAL(30,18))) as wasted_gas
FROM gas_tracking
WHERE status IN ('failed', 'reverted')
  AND gas_used IS NOT NULL;
```

### Daily Gas Usage
```sql
SELECT 
  DATE(timestamp) as date,
  network,
  COUNT(*) as transactions,
  SUM(CAST(gas_cost_native AS DECIMAL(30,18))) as total_cost
FROM gas_tracking
WHERE status = 'success'
GROUP BY DATE(timestamp), network
ORDER BY date DESC;
```

## Use Cases

### 1. Cost Accounting
Track exact operational costs for each blockchain network to:
- Calculate profitability
- Determine fee structure
- Budget for scaling

### 2. Network Comparison
Compare gas costs across networks:
```sql
SELECT network, AVG(CAST(gas_cost_native AS DECIMAL(30,18))) as avg_cost
FROM gas_tracking
WHERE operation_type = 'settlement' AND status = 'success'
GROUP BY network;
```

### 3. Merchant Cost Allocation
Bill merchants for gas usage or factor into fee calculations:
```sql
SELECT merchant_id, SUM(CAST(gas_cost_native AS DECIMAL(30,18))) as total_gas_cost
FROM gas_tracking
WHERE timestamp >= '2025-12-01'
GROUP BY merchant_id;
```

### 4. Performance Optimization
Identify expensive operations:
```sql
SELECT operation_type, AVG(gas_used) as avg_gas, MAX(gas_used) as max_gas
FROM gas_tracking
GROUP BY operation_type;
```

## Logging

Gas tracking logs appear in standard output:

```
⛽ Gas used: 123456 units, Cost: 0.000123456 ETH
⚠️ Gas wasted on failed tx: 98765 units, Cost: 0.000098765 BNB
```

## Future Enhancements

1. **USD Price Tracking**: Fetch ETH/BNB prices to calculate USD costs
2. **Gas Optimization Alerts**: Notify when gas costs spike
3. **Merchant Billing**: Automatic invoice generation based on gas usage
4. **Dashboard**: Visual analytics for gas trends
5. **Gas Estimation**: Predict costs before transaction submission

## Notes

- Gas tracking is non-blocking (wrapped in try/catch)
- Failed tracking doesn't affect transaction success
- Stores raw wei values for precision
- Decimal fields use DECIMAL(30,18) for accuracy
- Foreign keys allow orphaned records if transaction/merchant deleted
