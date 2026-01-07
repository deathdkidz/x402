# x402 Facilitator Business Model Transformation

## Executive Summary

Transform from a **tiered merchant subscription model** to a **settlement credit model** optimized for AI agent consumers with high polling rates.

---

## 1. API Key Authentication Optimization

### Current Problem
Direct database lookup for every request creates a bottleneck, especially with high-frequency AI agent polling.

### Options Analysis

| Option | Pros | Cons | Latency | Scalability |
|--------|------|------|---------|-------------|
| **A. Redis-First with DB Fallback** | Fast reads, simple | Redis failure = DB hit | ~1ms | High |
| **B. JWT Tokens** | Stateless, no lookup needed | Token revocation complex, larger headers | ~0.1ms | Very High |
| **C. Signed API Keys (HMAC)** | Self-validating, no lookup for auth | Still need credit check | ~0.1ms | Very High |
| **D. Hybrid: Signed Key + Cached Credits** | Best of both worlds | More complex | ~0.5ms | Very High |

### **Recommended: Option D - Hybrid Approach**

```
API Key Format: {merchant_id}.{timestamp}.{hmac_signature}
Example: m_abc123.1703001234.a1b2c3d4e5f6

Flow:
1. Parse API key, verify HMAC signature (no DB/Redis needed)
2. Extract merchant_id from key
3. Check Redis for cached credit balance
4. If cache miss, load from DB and cache for 60s
5. Proceed with request
```

**Benefits:**
- Authentication is cryptographic (instant, no I/O)
- Credit balance cached in Redis (1ms lookup)
- DB only hit on cache miss or credit updates
- Can handle 100k+ requests/second

### Implementation

```rust
// API Key structure
struct ApiKey {
    merchant_id: String,
    issued_at: u64,
    signature: [u8; 32],
}

impl ApiKey {
    fn verify(&self, secret: &[u8]) -> bool {
        let expected = hmac_sha256(
            secret,
            format!("{}.{}", self.merchant_id, self.issued_at)
        );
        constant_time_eq(&self.signature, &expected)
    }
}
```

---

## 2. Rate Limiting for AI Agents

### Current Problem
Traditional rate limiting (X requests per minute) doesn't fit AI agent usage patterns:
- AI agents poll frequently for payment status
- Legitimate high-frequency usage shouldn't be penalized
- Need to prevent abuse without blocking valid traffic

### Recommended: Credit-Based Rate Limiting

Instead of request limits, use **credit deduction** as natural rate limiting:

```
┌─────────────────────────────────────────────────────────────┐
│                    RATE LIMITING STRATEGY                    │
├─────────────────────────────────────────────────────────────┤
│ Endpoint       │ Cost      │ Rate Limit                      │
├────────────────┼───────────┼─────────────────────────────────┤
│ GET /health    │ FREE      │ 1000/min (prevent DDoS)         │
│ GET /supported │ FREE      │ 100/min                         │
│ POST /verify   │ FREE      │ 10000/min (high for AI agents)  │
│ POST /settle   │ CREDITS   │ Unlimited (pay per use)         │
└─────────────────────────────────────────────────────────────┘
```

### Tiered Rate Limits by Credit Balance

```rust
fn get_rate_limits(credit_balance: u64) -> RateLimits {
    match credit_balance {
        0 => RateLimits { verify: 10, settle: 0 },           // Suspended
        1..=1000 => RateLimits { verify: 1000, settle: 100 }, // Basic
        1001..=10000 => RateLimits { verify: 5000, settle: 500 }, // Pro
        _ => RateLimits { verify: 50000, settle: 5000 },     // Enterprise
    }
}
```

### Burst Handling for AI Agents

```rust
// Token bucket with generous burst allowance
struct AiAgentRateLimiter {
    tokens_per_second: u32,      // Sustained rate
    burst_capacity: u32,         // Allow bursts up to this
    current_tokens: AtomicU32,
}
```

---

## 3. Credit Purchase System

### Option A: Direct Wallet Transfer (Recommended for MVP)

```
┌──────────────────────────────────────────────────────────────┐
│                    CREDIT PURCHASE FLOW                       │
├──────────────────────────────────────────────────────────────┤
│                                                               │
│  1. Merchant requests credit purchase                         │
│     └─> Generate unique deposit address OR use main wallet    │
│                                                               │
│  2. Merchant sends USDC to deposit address                    │
│     └─> Amount: $X USDC                                       │
│                                                               │
│  3. Backend monitors for incoming transfers                   │
│     └─> Use WebSocket subscription to token Transfer events   │
│                                                               │
│  4. On confirmed transfer:                                    │
│     └─> Credit merchant account: X credits (1 USDC = 1 credit)│
│     └─> Log transaction                                       │
│     └─> Send webhook notification                             │
│                                                               │
└──────────────────────────────────────────────────────────────┘
```

### Option B: Smart Contract (Recommended for Production)

```solidity
// CreditPurchase.sol
contract X402CreditPurchase {
    IERC20 public usdc;
    address public treasury;
    
    event CreditPurchased(
        address indexed merchant,
        uint256 amount,
        bytes32 merchantId
    );
    
    function purchaseCredits(
        uint256 amount,
        bytes32 merchantId
    ) external {
        usdc.transferFrom(msg.sender, treasury, amount);
        emit CreditPurchased(msg.sender, amount, merchantId);
    }
}
```

**Benefits of Smart Contract:**
- Trustless, verifiable
- Automatic event emission for backend monitoring
- Can add features: bulk discounts, referral bonuses
- Transparent pricing

### Credit Pricing Model

```
┌─────────────────────────────────────────────────────────────┐
│                    CREDIT PRICING                            │
├─────────────────────────────────────────────────────────────┤
│ Credits Purchased │ Price per Credit │ Bonus               │
├───────────────────┼──────────────────┼─────────────────────┤
│ 1 - 100           │ $0.01            │ 0%                  │
│ 101 - 1,000       │ $0.009           │ 10%                 │
│ 1,001 - 10,000    │ $0.008           │ 20%                 │
│ 10,001+           │ $0.007           │ 30%                 │
└─────────────────────────────────────────────────────────────┘

Settlement Cost: 1 credit per settlement (covers gas + margin)
```

---

## 4. Database Schema Redesign

### Current Schema Issues
- `private_key` in merchants table (no longer needed)
- Tier-based limits hardcoded
- No credit tracking
- Not optimized for analytics dashboard

### New Database Schema

```sql
-- ============================================================
-- MERCHANTS (Simplified, credit-based)
-- ============================================================
CREATE TABLE merchants (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    merchant_id VARCHAR(32) UNIQUE NOT NULL,  -- Public identifier (m_xxx)
    
    -- Authentication
    auth_address VARCHAR(42) NOT NULL,        -- Wallet address for verification
    api_key_hash VARCHAR(64) NOT NULL,        -- HMAC key hash (not the key itself)
    api_key_issued_at BIGINT NOT NULL,
    
    -- Business Info
    business_name VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    website_url VARCHAR(255),
    logo_url VARCHAR(255),
    contact_email VARCHAR(255),
    
    -- Credit System
    credit_balance DECIMAL(18,6) DEFAULT 0,   -- Current credits
    lifetime_credits_purchased DECIMAL(18,6) DEFAULT 0,
    lifetime_credits_used DECIMAL(18,6) DEFAULT 0,
    
    -- Marketplace
    is_marketplace_visible BOOLEAN DEFAULT FALSE,
    marketplace_category VARCHAR(50),
    marketplace_tags JSON,                     -- ["ai", "api", "data"]
    
    -- Settings
    webhook_url VARCHAR(500),
    webhook_secret VARCHAR(64),
    webhook_events JSON DEFAULT '["settlement.completed", "settlement.failed"]',
    
    -- Status
    status ENUM('pending', 'active', 'suspended', 'banned') DEFAULT 'pending',
    status_reason VARCHAR(255),
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    last_active_at TIMESTAMP,
    
    INDEX idx_merchant_id (merchant_id),
    INDEX idx_auth_address (auth_address),
    INDEX idx_status (status),
    INDEX idx_marketplace (is_marketplace_visible, marketplace_category)
) ENGINE=InnoDB;

-- ============================================================
-- MERCHANT RESOURCES (For marketplace)
-- ============================================================
CREATE TABLE merchant_resources (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    merchant_id BIGINT NOT NULL,
    
    -- Resource Info
    resource_id VARCHAR(64) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    endpoint_url VARCHAR(500) NOT NULL,
    
    -- Pricing (in credits)
    price_per_call DECIMAL(18,6) NOT NULL,
    
    -- Supported Networks/Tokens
    supported_networks JSON NOT NULL,         -- ["base", "ethereum"]
    supported_tokens JSON NOT NULL,           -- ["USDC", "USDT"]
    
    -- Metadata
    category VARCHAR(50),
    tags JSON,
    documentation_url VARCHAR(500),
    
    -- Stats
    total_calls BIGINT DEFAULT 0,
    total_revenue DECIMAL(18,6) DEFAULT 0,
    avg_response_time_ms INT,
    
    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    is_marketplace_visible BOOLEAN DEFAULT FALSE,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (merchant_id) REFERENCES merchants(id),
    INDEX idx_resource_merchant (merchant_id),
    INDEX idx_resource_category (category, is_marketplace_visible)
) ENGINE=InnoDB;

-- ============================================================
-- CREDIT TRANSACTIONS
-- ============================================================
CREATE TABLE credit_transactions (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    merchant_id BIGINT NOT NULL,
    
    -- Transaction Type
    type ENUM('purchase', 'settlement_fee', 'refund', 'bonus', 'adjustment') NOT NULL,
    
    -- Amounts
    amount DECIMAL(18,6) NOT NULL,            -- Positive for credit, negative for debit
    balance_before DECIMAL(18,6) NOT NULL,
    balance_after DECIMAL(18,6) NOT NULL,
    
    -- Reference
    reference_type VARCHAR(50),               -- 'blockchain_tx', 'settlement', 'admin'
    reference_id VARCHAR(100),                -- tx hash, settlement id, etc.
    
    -- Metadata
    description VARCHAR(255),
    metadata JSON,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (merchant_id) REFERENCES merchants(id),
    INDEX idx_merchant_credits (merchant_id, created_at DESC),
    INDEX idx_type (type, created_at DESC)
) ENGINE=InnoDB;

-- ============================================================
-- CREDIT PURCHASES (Blockchain monitoring)
-- ============================================================
CREATE TABLE credit_purchases (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    merchant_id BIGINT NOT NULL,
    
    -- Blockchain Info
    network VARCHAR(20) NOT NULL,
    tx_hash VARCHAR(66) UNIQUE NOT NULL,
    block_number BIGINT NOT NULL,
    from_address VARCHAR(42) NOT NULL,
    
    -- Amount
    token_amount DECIMAL(36,18) NOT NULL,     -- Raw token amount
    credit_amount DECIMAL(18,6) NOT NULL,     -- Credits awarded
    bonus_credits DECIMAL(18,6) DEFAULT 0,
    
    -- Status
    status ENUM('pending', 'confirmed', 'failed') DEFAULT 'pending',
    confirmations INT DEFAULT 0,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    confirmed_at TIMESTAMP,
    
    FOREIGN KEY (merchant_id) REFERENCES merchants(id),
    INDEX idx_tx_hash (tx_hash),
    INDEX idx_status (status),
    INDEX idx_merchant_purchases (merchant_id, created_at DESC)
) ENGINE=InnoDB;

-- ============================================================
-- SETTLEMENTS (Enhanced)
-- ============================================================
CREATE TABLE settlements (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    settlement_id VARCHAR(64) UNIQUE NOT NULL,
    merchant_id BIGINT NOT NULL,
    
    -- Payment Details
    network VARCHAR(20) NOT NULL,
    token_address VARCHAR(42) NOT NULL,
    payer_address VARCHAR(42) NOT NULL,
    recipient_address VARCHAR(42) NOT NULL,
    amount DECIMAL(36,18) NOT NULL,
    
    -- Authorization
    nonce VARCHAR(66) NOT NULL,
    valid_after BIGINT NOT NULL,
    valid_before BIGINT NOT NULL,
    signature VARCHAR(132) NOT NULL,
    
    -- Resource
    resource_id VARCHAR(64),
    resource_url VARCHAR(500),
    
    -- Execution
    tx_hash VARCHAR(66),
    block_number BIGINT,
    gas_used BIGINT,
    gas_price BIGINT,
    
    -- Cost
    credit_cost DECIMAL(18,6) NOT NULL,
    gas_cost_usd DECIMAL(18,6),
    
    -- Status
    status ENUM('pending', 'preconfirmed', 'confirmed', 'failed', 'expired') DEFAULT 'pending',
    error_message TEXT,
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    submitted_at TIMESTAMP,
    confirmed_at TIMESTAMP,
    
    FOREIGN KEY (merchant_id) REFERENCES merchants(id),
    INDEX idx_settlement_id (settlement_id),
    INDEX idx_merchant_settlements (merchant_id, created_at DESC),
    INDEX idx_status (status),
    INDEX idx_network_status (network, status),
    INDEX idx_payer_nonce (payer_address, nonce)
) ENGINE=InnoDB;

-- ============================================================
-- PAYMASTERS (Admin managed)
-- ============================================================
CREATE TABLE paymasters (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    
    -- Identity
    address VARCHAR(42) UNIQUE NOT NULL,
    name VARCHAR(50),
    
    -- Networks
    networks JSON NOT NULL,                   -- ["base", "ethereum"]
    
    -- Balance Tracking
    last_known_balance DECIMAL(36,18),
    last_balance_check TIMESTAMP,
    low_balance_threshold DECIMAL(36,18),
    
    -- Stats
    total_transactions BIGINT DEFAULT 0,
    total_gas_spent DECIMAL(36,18) DEFAULT 0,
    
    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    priority INT DEFAULT 0,                   -- Higher = preferred
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    INDEX idx_active_priority (is_active, priority DESC)
) ENGINE=InnoDB;

-- ============================================================
-- ADMIN USERS
-- ============================================================
CREATE TABLE admin_users (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role ENUM('super_admin', 'admin', 'viewer') DEFAULT 'viewer',
    
    -- 2FA
    totp_secret VARCHAR(32),
    totp_enabled BOOLEAN DEFAULT FALSE,
    
    -- Session
    last_login_at TIMESTAMP,
    last_login_ip VARCHAR(45),
    
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    INDEX idx_username (username)
) ENGINE=InnoDB;

-- ============================================================
-- AUDIT LOG (For admin actions)
-- ============================================================
CREATE TABLE audit_log (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    admin_id BIGINT,
    
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(50),
    entity_id VARCHAR(100),
    
    old_value JSON,
    new_value JSON,
    
    ip_address VARCHAR(45),
    user_agent TEXT,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (admin_id) REFERENCES admin_users(id),
    INDEX idx_admin_actions (admin_id, created_at DESC),
    INDEX idx_entity (entity_type, entity_id)
) ENGINE=InnoDB;

-- ============================================================
-- SYSTEM METRICS (For monitoring dashboard)
-- ============================================================
CREATE TABLE system_metrics (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    
    metric_name VARCHAR(50) NOT NULL,
    metric_value DECIMAL(18,6) NOT NULL,
    tags JSON,
    
    recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    INDEX idx_metric_time (metric_name, recorded_at DESC)
) ENGINE=InnoDB;

-- ============================================================
-- ANALYTICS AGGREGATES (Pre-computed for dashboard)
-- ============================================================
CREATE TABLE merchant_analytics_daily (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    merchant_id BIGINT NOT NULL,
    date DATE NOT NULL,
    
    -- Settlement Stats
    total_settlements INT DEFAULT 0,
    successful_settlements INT DEFAULT 0,
    failed_settlements INT DEFAULT 0,
    
    -- Volume
    total_volume_usd DECIMAL(18,6) DEFAULT 0,
    
    -- By Network
    volume_by_network JSON,                   -- {"base": 1000, "ethereum": 500}
    
    -- By Token
    volume_by_token JSON,                     -- {"USDC": 1200, "USDT": 300}
    
    -- Credits
    credits_used DECIMAL(18,6) DEFAULT 0,
    credits_purchased DECIMAL(18,6) DEFAULT 0,
    
    -- API Usage
    verify_requests INT DEFAULT 0,
    settle_requests INT DEFAULT 0,
    
    UNIQUE KEY uk_merchant_date (merchant_id, date),
    FOREIGN KEY (merchant_id) REFERENCES merchants(id),
    INDEX idx_date (date)
) ENGINE=InnoDB;

-- ============================================================
-- VIEWS FOR COMMON QUERIES
-- ============================================================

-- Active merchants with credits
CREATE VIEW v_active_merchants AS
SELECT 
    m.*,
    (SELECT COUNT(*) FROM settlements s WHERE s.merchant_id = m.id AND s.created_at > DATE_SUB(NOW(), INTERVAL 24 HOUR)) as settlements_24h
FROM merchants m
WHERE m.status = 'active';

-- Marketplace listings
CREATE VIEW v_marketplace_listings AS
SELECT 
    mr.*,
    m.business_name,
    m.logo_url,
    m.description as merchant_description
FROM merchant_resources mr
JOIN merchants m ON mr.merchant_id = m.id
WHERE mr.is_marketplace_visible = TRUE 
  AND mr.is_active = TRUE 
  AND m.is_marketplace_visible = TRUE
  AND m.status = 'active';
```

---

## 5. Admin Dashboard Features

### Core Features

```
┌─────────────────────────────────────────────────────────────────┐
│                     ADMIN DASHBOARD                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  📊 OVERVIEW                                                     │
│  ├── Total merchants (active/suspended/pending)                  │
│  ├── Total settlements (24h/7d/30d)                             │
│  ├── Total volume (24h/7d/30d)                                  │
│  ├── Total credits sold                                          │
│  ├── System health indicators                                    │
│  └── Recent activity feed                                        │
│                                                                  │
│  👥 MERCHANTS                                                    │
│  ├── List all merchants (searchable, filterable)                │
│  ├── View merchant details                                       │
│  │   ├── Profile info                                           │
│  │   ├── Credit history                                          │
│  │   ├── Settlement history                                      │
│  │   ├── API usage stats                                         │
│  │   └── Resources/services                                      │
│  ├── Suspend/activate merchant                                   │
│  ├── Adjust credits (with reason)                                │
│  └── Generate new API key                                        │
│                                                                  │
│  💳 SETTLEMENTS                                                  │
│  ├── Real-time settlement feed                                   │
│  ├── Filter by status/network/merchant                          │
│  ├── View settlement details                                     │
│  ├── Retry failed settlements                                    │
│  └── Export to CSV                                               │
│                                                                  │
│  💰 PAYMASTERS                                                   │
│  ├── List all paymaster wallets                                  │
│  ├── Current balance (per network)                               │
│  ├── Gas usage history                                           │
│  ├── Add new paymaster                                           │
│  ├── Deactivate paymaster                                        │
│  ├── Rebalance gas                                               │
│  │   ├── From wallet A to B                                      │
│  │   ├── Batch transfer (if efficient)                          │
│  │   └── Auto-rebalance settings                                 │
│  └── Low balance alerts config                                   │
│                                                                  │
│  📈 ANALYTICS                                                    │
│  ├── Settlement volume charts                                    │
│  ├── Revenue breakdown                                           │
│  ├── Network distribution                                        │
│  ├── Top merchants                                               │
│  └── Trend analysis                                              │
│                                                                  │
│  🖥️ SYSTEM                                                       │
│  ├── Server resources (CPU/RAM/Disk)                            │
│  ├── Database stats                                              │
│  ├── Redis stats                                                 │
│  ├── RPC provider health                                         │
│  ├── Error logs                                                  │
│  └── Configuration                                               │
│                                                                  │
│  ⚙️ SETTINGS                                                     │
│  ├── Credit pricing                                              │
│  ├── Rate limits                                                 │
│  ├── Supported networks/tokens                                   │
│  ├── Webhook configuration                                       │
│  └── Admin user management                                       │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Paymaster Rebalancing Logic

```rust
struct RebalanceConfig {
    min_balance_threshold: U256,      // Trigger rebalance below this
    target_balance: U256,             // Rebalance to this amount
    batch_transfer_threshold: usize,  // Use batch if transferring to N+ wallets
}

async fn check_and_rebalance(paymasters: &[Paymaster]) {
    let low_balance: Vec<_> = paymasters
        .iter()
        .filter(|p| p.balance < config.min_balance_threshold)
        .collect();
    
    let high_balance: Vec<_> = paymasters
        .iter()
        .filter(|p| p.balance > config.target_balance * 2)
        .collect();
    
    if low_balance.len() >= config.batch_transfer_threshold {
        // Use batch contract
        batch_transfer(high_balance[0], low_balance, config.target_balance);
    } else {
        // Individual transfers
        for pm in low_balance {
            transfer(high_balance[0], pm, config.target_balance);
        }
    }
}
```

---

## 6. Merchant Dashboard Features

### Dashboard Pages

```
┌─────────────────────────────────────────────────────────────────┐
│                   MERCHANT DASHBOARD                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  📊 OVERVIEW                                                     │
│  ├── Credit balance (prominent display)                          │
│  ├── Low credit warning                                          │
│  ├── Quick stats (today/this week/this month)                   │
│  │   ├── Settlements processed                                   │
│  │   ├── Volume                                                  │
│  │   └── Credits used                                            │
│  └── Recent transactions (last 10)                               │
│                                                                  │
│  💳 TRANSACTIONS                                                 │
│  ├── Full transaction history                                    │
│  ├── Filters:                                                    │
│  │   ├── Date range                                              │
│  │   ├── Status (success/failed/pending)                        │
│  │   ├── Network                                                 │
│  │   ├── Token                                                   │
│  │   └── Amount range                                            │
│  ├── Transaction detail view                                     │
│  │   ├── All blockchain details                                  │
│  │   ├── Timeline                                                │
│  │   └── Retry option (if failed)                               │
│  └── Export to CSV/JSON                                          │
│                                                                  │
│  📈 ANALYTICS                                                    │
│  ├── Revenue charts                                              │
│  │   ├── Daily/Weekly/Monthly/Yearly                            │
│  │   └── All time                                                │
│  ├── Volume by network (pie chart)                              │
│  ├── Volume by token (pie chart)                                │
│  ├── Volume by resource (if multiple)                           │
│  ├── Success rate over time                                      │
│  └── Peak usage times                                            │
│                                                                  │
│  💰 CREDITS                                                      │
│  ├── Current balance                                             │
│  ├── Credit history                                              │
│  │   ├── Purchases                                               │
│  │   ├── Usage                                                   │
│  │   └── Bonuses/adjustments                                     │
│  ├── Purchase credits                                            │
│  │   ├── Amount selector                                         │
│  │   ├── Bonus calculator                                        │
│  │   └── Payment instructions                                    │
│  └── Usage forecast                                              │
│                                                                  │
│  🛠️ RESOURCES                                                    │
│  ├── List my resources/services                                  │
│  ├── Add new resource                                            │
│  ├── Edit resource                                               │
│  │   ├── Name, description                                       │
│  │   ├── Endpoint URL                                            │
│  │   ├── Price per call                                          │
│  │   ├── Supported networks/tokens                               │
│  │   └── Marketplace visibility                                  │
│  └── Resource performance stats                                  │
│                                                                  │
│  ⚙️ SETTINGS                                                     │
│  ├── Business Profile                                            │
│  │   ├── Business name (unique, required)                       │
│  │   ├── Description                                             │
│  │   ├── Website URL                                             │
│  │   ├── Logo upload                                             │
│  │   └── Contact email                                           │
│  ├── API Keys                                                    │
│  │   ├── View current key (masked)                              │
│  │   ├── Regenerate key                                          │
│  │   └── Key usage stats                                         │
│  ├── Webhooks                                                    │
│  │   ├── Webhook URL                                             │
│  │   ├── Secret (for verification)                              │
│  │   ├── Events to send                                          │
│  │   └── Test webhook                                            │
│  ├── Marketplace                                                 │
│  │   ├── Enable/disable visibility                              │
│  │   ├── Category selection                                      │
│  │   └── Tags                                                    │
│  └── Notifications                                               │
│      ├── Email preferences                                       │
│      └── Low credit alerts                                       │
│                                                                  │
│  📚 DOCUMENTATION                                                │
│  ├── API reference                                               │
│  ├── Integration guides                                          │
│  ├── Code examples                                               │
│  └── FAQ                                                         │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 7. Additional Feature Suggestions

### High Priority

1. **Multi-signature Treasury**
   - Use a multi-sig wallet for received credits
   - Requires 2-of-3 signatures for withdrawals
   - Increases security and trust

2. **Auto-topup for Merchants**
   - Set minimum credit threshold
   - Automatically purchase credits when low
   - Use pre-authorized wallet

3. **Real-time WebSocket API**
   ```
   ws://api.x402.io/ws
   
   Events:
   - settlement.submitted
   - settlement.preconfirmed
   - settlement.confirmed
   - settlement.failed
   - credit.low
   - credit.purchased
   ```

4. **SDK/Libraries**
   - Python SDK (for AI agents)
   - JavaScript/TypeScript SDK
   - Go SDK

5. **Idempotency Keys**
   - Prevent duplicate settlements
   - Important for AI agents that may retry

### Medium Priority

6. **Settlement Batching**
   - Batch multiple small settlements
   - Reduce gas costs
   - Share savings with merchants

7. **Priority Settlement**
   - Pay extra credits for faster settlement
   - Use higher gas for urgent transactions

8. **Scheduled Settlements**
   - Queue settlements for later
   - Optimize for low gas periods

9. **Multi-currency Credits**
   - Accept ETH, USDT, DAI
   - Auto-convert to credit balance

10. **Referral Program**
    - Merchants earn credits for referrals
    - Track referral conversions

### Lower Priority

11. **White-label Solution**
    - Allow large merchants to use own branding
    - Custom domain support

12. **SLA Guarantees**
    - Uptime guarantees
    - Compensation for failures

13. **Compliance Tools**
    - Transaction reporting
    - AML/KYC integration option

14. **Developer Sandbox**
    - Test environment with fake credits
    - Simulated settlements

---

## 8. Implementation Phases

### Phase 1: Core Credit System (2-3 weeks)
- [ ] New database schema migration
- [ ] HMAC-based API key authentication
- [ ] Credit balance management
- [ ] Basic credit purchase (direct transfer)
- [ ] Update Rust facilitator

### Phase 2: Merchant Dashboard (2-3 weeks)
- [ ] Authentication (wallet-based)
- [ ] Onboarding flow (business name required)
- [ ] Transaction history
- [ ] Credit purchase flow
- [ ] Basic analytics
- [ ] Settings pages

### Phase 3: Admin Dashboard (2-3 weeks)
- [ ] Admin authentication (2FA)
- [ ] Merchant management
- [ ] Paymaster management
- [ ] System monitoring
- [ ] Audit logging

### Phase 4: Marketplace (1-2 weeks)
- [ ] Resource listing page
- [ ] Merchant profiles
- [ ] Search/filter
- [ ] Categories

### Phase 5: Advanced Features (ongoing)
- [ ] Smart contract for credits
- [ ] WebSocket API
- [ ] Batched settlements
- [ ] SDKs

---

## 9. Migration Strategy

### Step 1: Database Migration
```sql
-- Add new columns to existing merchants table
ALTER TABLE merchants 
  ADD COLUMN merchant_id VARCHAR(32) UNIQUE,
  ADD COLUMN credit_balance DECIMAL(18,6) DEFAULT 0,
  ADD COLUMN api_key_hash VARCHAR(64),
  ADD COLUMN api_key_issued_at BIGINT,
  ADD COLUMN status ENUM('pending', 'active', 'suspended', 'banned') DEFAULT 'active';

-- Migrate existing merchants
UPDATE merchants SET 
  merchant_id = CONCAT('m_', LOWER(SUBSTRING(MD5(id), 1, 12))),
  credit_balance = 1000,  -- Give existing merchants starting credits
  status = CASE WHEN is_active = 1 THEN 'active' ELSE 'suspended' END;

-- Create new tables...
```

### Step 2: Dual-mode Operation
- Support both old tier-based and new credit-based
- Feature flag to switch
- Gradual migration of merchants

### Step 3: Deprecation
- Announce deprecation of tier system
- Migration deadline
- Remove old code

---

## Summary

This transformation moves x402 from a subscription model to a **pay-per-use credit model** that:

1. **Scales better** - No API key DB lookups, cached credits
2. **Fits AI agents** - High rate limits, pay for actual usage
3. **Simpler pricing** - No tiers, just credits
4. **Better UX** - Dashboard with full visibility
5. **Marketplace opportunity** - Merchants can monetize services

The key architectural changes are:
- HMAC-signed API keys (no auth DB lookup)
- Redis-cached credit balances
- Credit-based rate limiting
- Event-driven credit purchase monitoring
- Comprehensive dashboards for merchants and admins
