# Tracking Features Implementation

This document describes the three tracking features implemented in the x402 Facilitator:

1. **Gas Tracking** - Records gas costs for analytics
2. **Transaction Events** - Audit trail for transaction status changes
3. **Webhook Deliveries** - Tracks webhook delivery attempts and retries

---

## 1. Gas Tracking

### Purpose
Track gas costs per transaction for billing analytics and cost optimization.

### Database Table
```sql
CREATE TABLE gas_tracking (
    id INT AUTO_INCREMENT PRIMARY KEY,
    network VARCHAR(50) NOT NULL,
    gas_price_gwei DECIMAL(20, 10) NOT NULL,
    gas_used BIGINT NULL,
    eth_cost DECIMAL(30, 18) NULL,
    usd_cost DECIMAL(10, 4) NULL,
    tx_hash VARCHAR(66) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### When Data is Logged
- After a transaction is confirmed (completed or failed)
- Gas data is extracted from the transaction receipt

### Data Captured
- `network` - Which blockchain (e.g., "Base", "Optimism")
- `gas_price_gwei` - Effective gas price in gwei
- `gas_used` - Total gas units consumed
- `eth_cost` - Total ETH cost (gas_used × gas_price)
- `tx_hash` - Transaction hash for reference

### Usage
```sql
-- Average gas cost by network (last 7 days)
SELECT 
    network,
    COUNT(*) as tx_count,
    AVG(gas_price_gwei) as avg_gas_price,
    AVG(eth_cost) as avg_eth_cost
FROM gas_tracking
WHERE created_at > DATE_SUB(NOW(), INTERVAL 7 DAY)
GROUP BY network;
```

---

## 2. Transaction Events

### Purpose
Audit trail tracking all transaction status changes for debugging and compliance.

### Database Table
```sql
CREATE TABLE transaction_events (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    transaction_id BIGINT NOT NULL,
    event_type VARCHAR(50) NOT NULL,
    old_status VARCHAR(20) NULL,
    new_status VARCHAR(20) NULL,
    metadata JSON NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE CASCADE
);
```

### Event Types
| Event Type | Old Status | New Status | Description |
|------------|------------|------------|-------------|
| `created` | NULL | `pending` | Transaction record created |
| `submitted` | `pending` | `pending` | Transaction submitted to blockchain |
| `confirmed` | `pending` | `completed` | Transaction confirmed on-chain |
| `reverted` | `pending` | `failed` | Transaction reverted on-chain |
| `execution_failed` | `pending` | `failed` | Failed to submit transaction |

### Metadata Examples
```json
// submitted event
{"tx_hash": "0x..."}

// execution_failed event
{"reason": "Insufficient balance"}

// reverted event
{"reason": "Transaction reverted on-chain"}
```

### Usage
```sql
-- View transaction lifecycle
SELECT 
    te.event_type,
    te.old_status,
    te.new_status,
    te.metadata,
    te.created_at
FROM transaction_events te
WHERE te.transaction_id = 123
ORDER BY te.created_at ASC;
```

---

## 3. Webhook Deliveries

### Purpose
Track webhook notification delivery with retry support for reliability.

### Database Table
```sql
CREATE TABLE webhook_deliveries (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    merchant_id INT NOT NULL,
    transaction_id BIGINT NULL,
    delivery_id VARCHAR(36) NOT NULL UNIQUE,
    event_type VARCHAR(50) NOT NULL,
    webhook_url VARCHAR(500) NOT NULL,
    request_body TEXT NULL,
    response_status INT NULL,
    response_body TEXT NULL,
    status ENUM('pending', 'retrying', 'delivered', 'failed') DEFAULT 'pending',
    attempts INT DEFAULT 0,
    error_message TEXT NULL,
    last_attempt_at TIMESTAMP NULL,
    completed_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (merchant_id) REFERENCES merchants(id) ON DELETE CASCADE,
    FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE SET NULL
);
```

### Webhook Event Types
| Event | When Triggered |
|-------|----------------|
| `transaction.created` | After transaction record created |
| `transaction.completed` | After transaction confirmed |
| `transaction.failed` | After transaction failed or reverted |
| `transaction.pending` | After timeout (monitoring continues) |

### Webhook Payload
```json
{
    "event": "transaction.completed",
    "delivery_id": "uuid-v4",
    "timestamp": "2024-01-15T10:30:00Z",
    "data": {
        "transaction_id": 123,
        "transaction_hash": "0x...",
        "status": "completed",
        "network": "Base",
        "asset": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        "amount": "1000000",
        "payer_address": "0x...",
        "recipient_address": "0x...",
        "resource": "/api/protected"
    }
}
```

### HTTP Headers
```
Content-Type: application/json
X-Webhook-Event: transaction.completed
X-Delivery-ID: uuid-v4
```

### Retry Logic
1. Initial attempt: Immediate
2. Retry 1: After 1 second
3. Retry 2: After 5 seconds  
4. Retry 3: After 15 seconds
5. Give up after 3 retries

### Configuration
```env
WEBHOOK_TIMEOUT_MS=10000
WEBHOOK_RETRY_ATTEMPTS=3
```

### Merchant Setup
Merchants can configure webhooks in their settings:
- `webhook_url` - URL to receive notifications
- `webhook_events` - Comma-separated events (or "all")

### Usage
```sql
-- Failed deliveries in last 24 hours
SELECT 
    m.business_name,
    wd.event_type,
    wd.webhook_url,
    wd.error_message,
    wd.attempts
FROM webhook_deliveries wd
JOIN merchants m ON wd.merchant_id = m.id
WHERE wd.status = 'failed'
AND wd.created_at > DATE_SUB(NOW(), INTERVAL 24 HOUR);

-- Delivery success rate by merchant
SELECT 
    m.business_name,
    COUNT(*) as total,
    SUM(CASE WHEN wd.status = 'delivered' THEN 1 ELSE 0 END) as delivered,
    ROUND(SUM(CASE WHEN wd.status = 'delivered' THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 2) as success_rate
FROM webhook_deliveries wd
JOIN merchants m ON wd.merchant_id = m.id
GROUP BY m.id, m.business_name;
```

---

## Architecture

```
Settlement Flow
     │
     ├─► Create Transaction Record
     │       └─► log_transaction_event("created")
     │
     ├─► Execute Transfer
     │       └─► log_transaction_event("submitted")
     │
     ├─► Wait for Confirmation
     │       └─► log_gas_tracking() (from receipt)
     │
     └─► Update Status
             ├─► log_transaction_event("confirmed/reverted/failed")
             └─► send_webhook() (async, fire-and-forget)
                     └─► log_webhook_delivery_v2() (per attempt)
```

## Files Modified

- `src/services/database.rs` - Added `log_gas_tracking`, `log_transaction_event`, `log_webhook_delivery_v2`
- `src/services/settlement.rs` - Added tracking calls and webhook service integration
- `src/services/webhook.rs` - New file for webhook delivery logic
- `src/services/mod.rs` - Added webhook module export
- `src/main.rs` - Initialize and inject WebhookService
