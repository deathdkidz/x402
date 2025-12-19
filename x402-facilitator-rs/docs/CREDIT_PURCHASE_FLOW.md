# Credit Purchase Flow - Implementation Plan

## Overview

This document outlines the planned credit purchase flow for the x402 facilitator. This is a **planning document only** - implementation will be done in a future phase.

---

## Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                    CREDIT PURCHASE FLOW                              │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  1. MERCHANT INITIATES PURCHASE                                      │
│     └─> POST /credits/purchase                                       │
│         Body: { amount: "50000000" } // 50 USDC (6 decimals)        │
│                                                                      │
│  2. SERVER CREATES AUTHORIZATION REQUEST                             │
│     └─> Generate EIP-712 typed data for TransferWithAuthorization   │
│     └─> Domain: USDC contract                                        │
│     └─> Message:                                                     │
│         ├── from: merchant wallet                                    │
│         ├── to: x402 treasury wallet                                │
│         ├── value: amount (must be >= $5 USDC)                      │
│         ├── validAfter: now                                          │
│         ├── validBefore: now + 1 hour                               │
│         └── nonce: random bytes32                                    │
│                                                                      │
│  3. RETURN UNSIGNED AUTHORIZATION TO MERCHANT                        │
│     └─> Response:                                                    │
│         {                                                            │
│           purchaseId: "pur_xxx",                                     │
│           authorization: { from, to, value, ... },                  │
│           domain: { name, version, chainId, verifyingContract },    │
│           types: { ... },                                            │
│           creditAmount: calculated credits + bonus,                  │
│           expiresAt: timestamp                                       │
│         }                                                            │
│                                                                      │
│  4. MERCHANT SIGNS AUTHORIZATION                                     │
│     └─> User signs via wallet (MetaMask, etc.)                      │
│     └─> Returns signature                                            │
│                                                                      │
│  5. MERCHANT SUBMITS SIGNED AUTHORIZATION                            │
│     └─> POST /credits/confirm                                        │
│         Body: { purchaseId, signature }                             │
│                                                                      │
│  6. SERVER VERIFIES                                                  │
│     └─> Verify EIP-712 signature                                    │
│     └─> Verify recipient is x402 treasury                           │
│     └─> Verify amount >= $5 USDC minimum                            │
│     └─> Verify authorization not expired                            │
│     └─> Verify nonce not used                                        │
│                                                                      │
│  7. SERVER EXECUTES TRANSFER                                         │
│     └─> Call transferWithAuthorization on USDC contract             │
│     └─> Wait for transaction confirmation                           │
│                                                                      │
│  8. ON SUCCESS                                                       │
│     └─> Calculate credits (with volume discount)                    │
│     └─> Add credits to merchant balance                             │
│     └─> Log credit transaction                                       │
│     └─> Send webhook notification                                    │
│     └─> Return success response                                      │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Pricing & Discounts

### Minimum Purchase
- **$5 USDC minimum** per purchase
- Prevents spam and small transaction overhead

### Volume Discounts
```
┌─────────────────────────────────────────────────────────────────┐
│ Purchase Amount (USDC) │ Credits per $1 │ Effective Discount   │
├────────────────────────┼────────────────┼──────────────────────┤
│ $5 - $49               │ 100            │ 0% (base rate)       │
│ $50 - $199             │ 105            │ 5% bonus             │
│ $200 - $499            │ 110            │ 10% bonus            │
│ $500 - $999            │ 115            │ 15% bonus            │
│ $1000+                 │ 120            │ 20% bonus            │
└─────────────────────────────────────────────────────────────────┘

Example:
- Purchase $100 USDC → 100 × 105 = 10,500 credits
- Purchase $500 USDC → 500 × 115 = 57,500 credits
- Purchase $1000 USDC → 1000 × 120 = 120,000 credits
```

### Settlement Credit Cost
- **1 credit = 1 settlement** (fixed rate)
- No variable pricing based on gas (we absorb gas costs)

---

## API Endpoints

### POST /credits/purchase
Initialize a credit purchase.

**Request:**
```json
{
  "amount": "50000000",       // USDC amount in smallest unit (6 decimals)
  "network": "base-sepolia"   // Network to purchase on
}
```

**Response:**
```json
{
  "success": true,
  "purchaseId": "pur_abc123xyz",
  "authorization": {
    "from": "0xMerchantWallet",
    "to": "0xX402Treasury",
    "value": "50000000",
    "validAfter": "1734620270",
    "validBefore": "1734623870",
    "nonce": "0xabc..."
  },
  "domain": {
    "name": "USD Coin",
    "version": "2",
    "chainId": 84532,
    "verifyingContract": "0x036CbD53842c5426634e7929541eC2318f3dCF7e"
  },
  "types": {
    "TransferWithAuthorization": [
      { "name": "from", "type": "address" },
      { "name": "to", "type": "address" },
      { "name": "value", "type": "uint256" },
      { "name": "validAfter", "type": "uint256" },
      { "name": "validBefore", "type": "uint256" },
      { "name": "nonce", "type": "bytes32" }
    ]
  },
  "pricing": {
    "usdcAmount": "50.00",
    "baseCredits": 5000,
    "bonusCredits": 250,
    "totalCredits": 5250,
    "discountTier": "5%"
  },
  "expiresAt": "2024-12-19T17:30:00Z"
}
```

### POST /credits/confirm
Confirm purchase with signed authorization.

**Request:**
```json
{
  "purchaseId": "pur_abc123xyz",
  "signature": "0x..."
}
```

**Response:**
```json
{
  "success": true,
  "purchaseId": "pur_abc123xyz",
  "txHash": "0x...",
  "creditsAdded": 5250,
  "newBalance": 15250,
  "network": "base-sepolia"
}
```

### GET /credits/balance
Get merchant's current credit balance.

**Response:**
```json
{
  "success": true,
  "balance": 15250,
  "lifetimePurchased": 50000,
  "lifetimeUsed": 34750,
  "pendingPurchases": 0
}
```

### GET /credits/history
Get credit transaction history.

**Response:**
```json
{
  "success": true,
  "transactions": [
    {
      "id": "ctx_123",
      "type": "purchase",
      "amount": 5250,
      "balanceBefore": 10000,
      "balanceAfter": 15250,
      "reference": "pur_abc123xyz",
      "description": "Credit purchase: 50 USDC",
      "createdAt": "2024-12-19T16:30:00Z"
    },
    {
      "id": "ctx_122",
      "type": "settlement_fee",
      "amount": -1,
      "balanceBefore": 10001,
      "balanceAfter": 10000,
      "reference": "stl_xyz789",
      "description": "Settlement fee",
      "createdAt": "2024-12-19T16:25:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 150
  }
}
```

---

## Database Tables

### credit_purchases
```sql
CREATE TABLE credit_purchases (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    purchase_id VARCHAR(32) UNIQUE NOT NULL,
    merchant_id BIGINT NOT NULL,
    
    -- Request
    network VARCHAR(30) NOT NULL,
    usdc_amount DECIMAL(18,6) NOT NULL,
    credit_amount INT NOT NULL,
    bonus_credits INT DEFAULT 0,
    
    -- Authorization
    nonce VARCHAR(66) NOT NULL,
    valid_before TIMESTAMP NOT NULL,
    
    -- Status
    status ENUM('pending', 'signed', 'submitted', 'confirmed', 'failed', 'expired') DEFAULT 'pending',
    
    -- Blockchain
    tx_hash VARCHAR(66),
    block_number BIGINT,
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    signed_at TIMESTAMP,
    confirmed_at TIMESTAMP,
    
    INDEX idx_merchant (merchant_id),
    INDEX idx_status (status),
    INDEX idx_purchase_id (purchase_id)
);
```

### credit_transactions
```sql
CREATE TABLE credit_transactions (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    merchant_id BIGINT NOT NULL,
    
    type ENUM('purchase', 'settlement_fee', 'refund', 'bonus', 'adjustment') NOT NULL,
    
    amount INT NOT NULL,                    -- Positive or negative
    balance_before INT NOT NULL,
    balance_after INT NOT NULL,
    
    reference_type VARCHAR(30),             -- 'purchase', 'settlement', 'admin'
    reference_id VARCHAR(64),               -- purchase_id, settlement_id, etc.
    
    description VARCHAR(255),
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    INDEX idx_merchant (merchant_id, created_at DESC),
    INDEX idx_type (type)
);
```

---

## Verification Steps

Before executing the transfer, verify:

1. **Signature Validity**
   - EIP-712 signature recovery matches merchant wallet
   
2. **Recipient Address**
   - Must be x402 treasury wallet (from config)
   
3. **Minimum Amount**
   - Must be >= $5 USDC (5000000 in 6 decimals)
   
4. **Time Window**
   - Current time must be after `validAfter`
   - Current time must be before `validBefore`
   
5. **Nonce Uniqueness**
   - Nonce must not have been used before
   
6. **Purchase ID**
   - Must exist and be in 'pending' status
   - Must not be expired

---

## Security Considerations

1. **Treasury Wallet**
   - Multi-sig wallet recommended for production
   - Only accepts transfers via `transferWithAuthorization`
   
2. **Nonce Management**
   - Store used nonces to prevent replay attacks
   - Use cryptographically random nonces
   
3. **Expiration**
   - Short validity window (1 hour) to prevent stale authorizations
   
4. **Rate Limiting**
   - Limit purchase initiation requests
   - Prevent spam purchase attempts

---

## Future Enhancements

1. **Auto-topup**
   - Merchant can set threshold and auto-purchase amount
   - Requires pre-authorized spending limit
   
2. **Multiple Currencies**
   - Accept USDT, DAI, ETH
   - Convert to credits at market rate
   
3. **Subscription Model**
   - Monthly credit packages
   - Auto-renewal option
   
4. **Referral Bonuses**
   - Bonus credits for referrals
   - Track referral conversions

---

## Implementation Timeline

- **Phase 1**: Basic purchase flow (POST /credits/purchase, /confirm)
- **Phase 2**: History and balance endpoints
- **Phase 3**: Webhook notifications
- **Phase 4**: Auto-topup and advanced features
