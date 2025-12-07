# Webhook Resource Tracking

## Overview

The facilitator now tracks and sends **resource**, **description**, and **mimeType** information in webhooks, enabling merchants to identify exactly which item/resource was purchased.

## Database Changes

The `transactions` table now includes:

```sql
resource VARCHAR(255) -- e.g., "/premium/article-123", "/api/data/export"
description TEXT      -- e.g., "Premium Article Access", "Data Export Service"
mime_type VARCHAR(100) -- e.g., "text/html", "application/json", "image/jpeg"
```

## Enhanced Webhook Payload

### Previous Format (Limited)
```json
{
  "event": "transaction.completed",
  "payerAddress": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
  "amount": "10000",
  "transactionHash": "0xabcd...",
  "network": "base-sepolia"
}
```

### New Format (With Resource Tracking)
```json
{
  "event": "transaction.completed",
  "transactionId": 123,
  "transactionHash": "0xabcd1234...blockchain_tx_hash",
  "merchantAddress": "0x1234...merchant_wallet",
  "payerAddress": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
  "amount": "10000",
  "asset": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  "network": "base-sepolia",
  "resource": "/premium/article-123",
  "description": "Premium Article Access",
  "mimeType": "text/html",
  "status": "completed",
  "timestamp": 1733270500
}
```

## Use Cases

### 1. Multiple Resources with Same Price

**Problem:** Two different items both cost 0.01 USDC
- Premium Article ($0.01)
- Cat Image ($0.01)

**Solution:** Use `resource` field to distinguish:

```typescript
// Merchant webhook handler
app.post('/webhook', (req, res) => {
  const { payerAddress, resource, status } = req.body;
  
  if (status === 'completed') {
    switch (resource) {
      case '/premium/article-123':
        await grantArticleAccess(payerAddress, 123);
        break;
      case '/demo/cat':
        await unlockCatImage(payerAddress);
        break;
      case '/api/data/export':
        await generateExport(payerAddress);
        break;
    }
  }
});
```

### 2. User Purchases Multiple Items

**Scenario:** User buys 3 different articles in quick succession

```json
// Webhook 1
{
  "payerAddress": "0x742d...",
  "resource": "/articles/ai-trends-2025",
  "amount": "5000"
}

// Webhook 2
{
  "payerAddress": "0x742d...",
  "resource": "/articles/blockchain-guide",
  "amount": "5000"
}

// Webhook 3
{
  "payerAddress": "0x742d...",
  "resource": "/articles/web3-security",
  "amount": "5000"
}
```

Each webhook clearly identifies which article was purchased.

### 3. Dynamic Pricing

```typescript
// Different resources, different prices
const resources = {
  '/basic/article': { price: '5000', description: 'Basic Article' },
  '/premium/video': { price: '50000', description: 'Premium Video Course' },
  '/exclusive/data': { price: '100000', description: 'Exclusive Dataset' }
};

// Merchant can validate both amount AND resource
if (webhook.resource === '/premium/video' && webhook.amount === '50000') {
  grantVideoAccess(webhook.payerAddress);
}
```

## Example Merchant Webhook Handler

```typescript
import crypto from 'crypto';
import express from 'express';

const app = express();
app.use(express.json());

const WEBHOOK_SECRET = 'your-webhook-secret';

function verifySignature(body: string, signature: string): boolean {
  const expected = crypto
    .createHmac('sha256', WEBHOOK_SECRET)
    .update(body)
    .digest('hex');
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

app.post('/api/webhooks/x402', async (req, res) => {
  const signature = req.headers['x-webhook-signature'] as string;
  const body = JSON.stringify(req.body);
  
  // 1. Verify signature
  if (!verifySignature(body, signature)) {
    return res.status(401).json({ error: 'Invalid signature' });
  }
  
  const {
    event,
    payerAddress,
    resource,
    description,
    mimeType,
    amount,
    transactionHash,
    status
  } = req.body;
  
  // 2. Handle different events
  if (event === 'transaction.completed' && status === 'completed') {
    console.log(`Payment completed: ${payerAddress} paid for ${resource}`);
    
    // 3. Grant access based on resource
    await grantAccess({
      userWallet: payerAddress,
      resource: resource,
      description: description,
      transactionHash: transactionHash,
      paidAmount: amount
    });
    
    // 4. Send confirmation email
    const user = await getUserByWallet(payerAddress);
    if (user) {
      await sendEmail(user.email, {
        subject: `Access Granted: ${description}`,
        body: `Your payment for ${description} (${resource}) has been confirmed.\n\nTransaction: ${transactionHash}`
      });
    }
  }
  
  res.status(200).json({ received: true });
});

async function grantAccess(data: {
  userWallet: string;
  resource: string;
  description: string;
  transactionHash: string;
  paidAmount: string;
}) {
  // Find user by wallet
  const user = await db.users.findOne({ wallet: data.userWallet });
  if (!user) {
    console.warn(`Unknown wallet: ${data.userWallet}`);
    return;
  }
  
  // Record purchase
  await db.purchases.create({
    userId: user.id,
    resource: data.resource,
    description: data.description,
    amount: data.paidAmount,
    transactionHash: data.transactionHash,
    purchasedAt: new Date()
  });
  
  // Grant access
  await db.accessGrants.create({
    userId: user.id,
    resource: data.resource,
    grantedAt: new Date(),
    expiresAt: null // Permanent access
  });
  
  console.log(`✅ Access granted to user ${user.id} for resource: ${data.resource}`);
}
```

## Payment Flow with Resource Tracking

```
1. User selects resource to purchase
   ↓
2. Merchant creates payment request with resource info:
   {
     paymentRequirements: {
       resource: "/premium/article-123",
       description: "Premium Article: AI Trends 2025",
       mimeType: "text/html",
       maxAmountRequired: "10000"
     }
   }
   ↓
3. User signs and payment is settled
   ↓
4. Facilitator stores resource info in database
   ↓
5. Transaction confirmed on blockchain
   ↓
6. Facilitator sends webhook with resource info:
   {
     payerAddress: "0x742d...",
     resource: "/premium/article-123",
     description: "Premium Article: AI Trends 2025",
     mimeType: "text/html"
   }
   ↓
7. Merchant grants access to specific resource
```

## Benefits

✅ **Precise Resource Identification** - No ambiguity about what was purchased  
✅ **Multiple Items Support** - Handle concurrent purchases of different items  
✅ **Same Price Items** - Distinguish items with identical prices  
✅ **Better UX** - Show descriptive names in confirmation emails  
✅ **Audit Trail** - Full resource tracking in database  
✅ **Type Information** - MIME type helps with content delivery

## Backward Compatibility

The new fields are **optional** and will be `null` for:
- Old transactions created before this update
- Payments where `resource` wasn't specified

Merchants should handle both cases:

```typescript
if (webhook.resource) {
  // New flow - precise resource tracking
  grantAccessToResource(webhook.payerAddress, webhook.resource);
} else {
  // Fallback - use amount or other logic
  grantAccessByAmount(webhook.payerAddress, webhook.amount);
}
```

## Migration Status

✅ Database schema updated  
✅ Transaction storage includes resource fields  
✅ Webhook payload includes resource fields  
✅ Settlement service passes resource data  
✅ Backward compatible with existing transactions
