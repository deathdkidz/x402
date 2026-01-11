# x402 Facilitator Optimization Guide

## Alchemy Rate Limits

| Plan | CU/second | CU/day |
|------|-----------|--------|
| Free | 330 | 300M |
| Growth | 660 | Unlimited |
| Scale | 3000+ | Unlimited |

### RPC Call Costs (Compute Units)
| Method | CU | When Used |
|--------|-----|-----------|
| `eth_sendRawTransaction` | ~250 | Transaction send |
| `eth_getTransactionReceipt` | ~15 | Receipt polling |
| `eth_call` (balanceOf) | ~26 | Balance/nonce checks |
| `eth_blockNumber` | ~10 | Block number queries |
| `eth_subscribe` | ~10 + ~2/event | WebSocket subscriptions |

## Optimization Strategy

### Transport Selection Guide

| Operation | Best Transport | Reason |
|-----------|---------------|--------|
| Send transaction | HTTP | Connection pooling, parallel requests |
| Poll receipt (single) | HTTP | No WS handshake overhead |
| Poll receipt (high concurrency) | HTTP | True parallelism |
| Subscribe to blocks | WebSocket | Reduces polling, real-time |
| Balance/nonce checks | HTTP (pooled) | Single request-response |
| Health checks | HTTP | Simple request |
| Background monitoring | WebSocket | Single persistent connection |

### Why HTTP for Transactions and Polling?

**WebSocket Limitations Under Concurrent Load:**
- Single WebSocket connection multiplexes all requests
- Requests queue up waiting for their turn
- Response times degrade under concurrent load (10-238ms variance)

**HTTP Advantages:**
- \`reqwest\` automatically pools connections (HTTP Keep-Alive)
- Each request can use a parallel connection
- Consistent response times under concurrent load (20-50ms)
- No connection handshake for pooled connections

## Current Optimizations Applied

### 1. HTTP for Transaction Sending
**Files:** \`src/strategies/erc3009.rs:463-470\`, \`src/strategies/erc2612.rs\`

- Converts wss:// URLs to https:// for transaction sending
- Uses reqwest HTTP client with automatic connection pooling
- Avoids ~200ms WebSocket handshake overhead per transaction

### 2. HTTP for Receipt Polling
**File:** \`src/services/settlement.rs:694-800\`

- Creates HTTP provider per settlement request
- Flashblock: 100ms poll intervals for 2 seconds
- Standard: 500ms poll intervals for 10 seconds
- Connection pooling enables true parallelism

### 3. Parallel Pre-checks
**File:** \`src/strategies/erc3009.rs:387-395\`

- Balance and nonce checks run in parallel via tokio::join!
- Reduces pre-check latency by ~50%

### 4. Pooled WebSocket for Monitoring
**File:** \`src/services/provider_pool.rs\`

- Single persistent WebSocket per network
- Used for transaction_monitor.rs finality checks
- Reconnection logic with exponential backoff

## Performance Benchmarks

### Sequential Settlement
| Phase | Time |
|-------|------|
| Network/token validation | ~1ms |
| Signature verification | ~5ms |
| Pre-checks (parallel) | ~50ms |
| Transaction send (HTTP) | ~300ms |
| Flashblock confirmation | ~100-200ms |
| DB/Redis updates | ~20ms |
| **Total** | **~550ms** |

### Concurrent Settlement (5 parallel)
| Phase | Time |
|-------|------|
| Per-request average | ~650-750ms |
| True parallelism | ✅ Yes (HTTP) |
| No request queueing | ✅ Yes |

### CU Consumption per Settlement
| Operation | CU |
|-----------|-----|
| eth_call (balance) | ~26 |
| eth_call (nonce state) | ~26 |
| eth_sendRawTransaction | ~250 |
| eth_getTransactionReceipt (avg 10 polls) | ~150 |
| **Total per settlement** | **~450 CU** |

## Further Optimization Options

### 1. WebSocket Block Subscriptions
Subscribe to new blocks instead of polling for receipts:

```rust
// In provider_pool.rs - add block subscription
pub async fn subscribe_blocks(&self, network: &str) -> Result<BlockStream> {
    if let ProviderType::WebSocket(ws) = self.get_provider(network)?.as_ref() {
        return Ok(ws.subscribe_blocks().await?);
    }
    Err("WebSocket required for subscriptions")
}
```
**Savings:** ~80% reduction in receipt polling CU (from ~150 to ~30)

### 2. Receipt Caching in Redis
```rust
// In settlement.rs - check cache first
if let Some(receipt) = redis.get_cached_receipt(&tx_hash).await? {
    return (true, receipt.status, Some(receipt));
}
// ... poll for receipt ...
redis.cache_receipt(&tx_hash, &receipt, 60).await?;
```

### 3. Batch RPC Calls for Pre-checks
```rust
// Currently: 2 separate calls (52 CU)
let balance = provider.balanceOf(payer).await?;
let nonce_used = provider.authorizationState(payer, nonce).await?;

// Optimized: Single batch call (~26 CU total)
// Note: Requires Alloy batch API
```
**Savings:** 1 RPC call instead of 2

### 4. Reduce Polling Intervals
```rust
// Current values in settlement.rs
let flashblock_interval = Duration::from_millis(100);  // → 150ms
let standard_interval = Duration::from_millis(500);    // → 750ms
```
**Savings:** 33% reduction in polling CU

## Environment Configuration

```bash
# Polling intervals (milliseconds)
FLASHBLOCK_POLL_INTERVAL_MS=100
STANDARD_POLL_INTERVAL_MS=500

# Confirmation timeout (seconds)
FLASHBLOCK_TIMEOUT_S=2
STANDARD_TIMEOUT_S=10

# Rate limiting
SETTLE_RATE_LIMIT_MAX=100
VERIFY_RATE_LIMIT_MAX=200
```

## Architecture Decisions

### Why Not Use WebSocket for Everything?

| Scenario | HTTP | WebSocket |
|----------|------|-----------|
| Single request | ✅ Fast | ❌ Handshake overhead |
| 5 concurrent | ✅ Parallel | ⚠️ Queued |
| 20 concurrent | ✅ Parallel | ❌ Heavy queueing |
| Long-running subscription | ❌ Polling waste | ✅ Efficient |

### Connection Pooling Details

**reqwest HTTP client behavior:**
- Default pool: 100 connections per host
- Keep-Alive: Enabled by default
- Connection reuse: Automatic
- No handshake for pooled connections

**Alloy WebSocket behavior:**
- Single connection per provider
- All requests multiplex on that connection
- Requests queue on high concurrency
