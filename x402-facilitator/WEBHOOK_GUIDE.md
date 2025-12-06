# Webhook Integration Guide

## Overview

The x402 Facilitator sends real-time webhook notifications to merchants when payment transactions change status. This enables merchants to receive instant updates about payment confirmations, failures, and pending states.

## Security Features

✅ **HTTPS Required** - Webhook URLs must use HTTPS for security  
✅ **HMAC-SHA256 Signature** - Every webhook includes a cryptographic signature  
✅ **Timestamp Headers** - Prevent replay attacks  
✅ **Automatic Retries** - 3 attempts with exponential backoff (0s, 5s, 15s)  
✅ **Delivery Logging** - All attempts are logged in the database  
✅ **SSRF Protection** - Cannot point to localhost or private IPs  

## Configuration

Configure webhooks for your merchant account in the `merchants` table:

```sql
UPDATE merchants 
SET 
  webhook_url = 'https://yoursite.com/api/x402-webhook',
  webhook_secret = 'your_secret_key_min_32_chars',
  webhook_events = 'transaction.completed,transaction.failed,transaction.pending'
WHERE merchant_address = '0xYourAddress';
```

### Fields:

- **`webhook_url`**: Your HTTPS endpoint (required)
- **`webhook_secret`**: Secret key for HMAC signature verification (recommended)
- **`webhook_events`**: Comma-separated list of events to receive:
  - `transaction.completed` - Payment confirmed on blockchain
  - `transaction.failed` - Payment failed or reverted
  - `transaction.pending` - Payment submitted but not confirmed yet (>30s)

## Webhook Payload

### Headers

```
Content-Type: application/json
User-Agent: x402-facilitator/1.0
X-Webhook-Event: transaction.completed
X-Webhook-Timestamp: 1733500000
X-Webhook-Signature: abc123def456...
X-Webhook-Delivery-Attempt: 1
```

### Body

```json
{
  "event": "transaction.completed",
  "transactionId": 123,
  "transactionHash": "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
  "merchantAddress": "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
  "payerAddress": "0x5678567856785678567856785678567856785678",
  "amount": "1000000",
  "asset": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  "network": "base-sepolia",
  "resource": "/premium/content",
  "description": "Premium access",
  "mimeType": "application/json",
  "status": "completed",
  "timestamp": 1733500000
}
```

### Event Types

| Event | When Triggered | Status |
|-------|---------------|--------|
| `transaction.completed` | TX confirmed on blockchain (< 30s) | `completed` |
| `transaction.failed` | TX reverted or failed | `failed` |
| `transaction.pending` | TX submitted but timeout (> 30s) | `pending` |

**Note**: Pending transactions are monitored in the background and will send another webhook when they eventually complete or fail (up to 60 minutes).

## Signature Verification

### Node.js/Express Example

```javascript
import crypto from 'crypto';
import express from 'express';

const WEBHOOK_SECRET = 'your_secret_key_min_32_chars';

app.post('/api/x402-webhook', express.json(), (req, res) => {
  const signature = req.headers['x-webhook-signature'];
  const timestamp = req.headers['x-webhook-timestamp'];
  const body = JSON.stringify(req.body);
  
  // Step 1: Verify signature
  const expectedSignature = crypto
    .createHmac('sha256', WEBHOOK_SECRET)
    .update(body)
    .digest('hex');
  
  if (signature !== expectedSignature) {
    console.error('Invalid webhook signature');
    return res.status(401).send('Invalid signature');
  }
  
  // Step 2: Verify timestamp (reject if > 5 minutes old)
  const age = Date.now() - parseInt(timestamp) * 1000;
  if (age > 300000) {
    console.error('Webhook timestamp too old');
    return res.status(400).send('Webhook too old');
  }
  
  // Step 3: Process the webhook
  const { event, transactionHash, status, amount, payerAddress } = req.body;
  
  console.log(`Payment ${transactionHash}: ${status}`);
  
  if (event === 'transaction.completed') {
    // Grant access to premium content
    grantAccess(payerAddress, req.body.resource);
  } else if (event === 'transaction.failed') {
    // Handle failure (notify user, refund, etc)
    handleFailure(transactionHash);
  } else if (event === 'transaction.pending') {
    // Show pending status to user
    showPendingStatus(transactionHash);
  }
  
  // Step 4: Respond with 200 OK
  res.status(200).send('OK');
});
```

### Python/Flask Example

```python
import hmac
import hashlib
import time
from flask import Flask, request, jsonify

WEBHOOK_SECRET = 'your_secret_key_min_32_chars'

@app.route('/api/x402-webhook', methods=['POST'])
def x402_webhook():
    # Step 1: Verify signature
    signature = request.headers.get('X-Webhook-Signature')
    timestamp = request.headers.get('X-Webhook-Timestamp')
    body = request.get_data().decode('utf-8')
    
    expected_signature = hmac.new(
        WEBHOOK_SECRET.encode(),
        body.encode(),
        hashlib.sha256
    ).hexdigest()
    
    if signature != expected_signature:
        return jsonify({'error': 'Invalid signature'}), 401
    
    # Step 2: Verify timestamp (reject if > 5 minutes old)
    age = time.time() - int(timestamp)
    if age > 300:
        return jsonify({'error': 'Webhook too old'}), 400
    
    # Step 3: Process the webhook
    data = request.get_json()
    event = data['event']
    tx_hash = data['transactionHash']
    status = data['status']
    
    print(f"Payment {tx_hash}: {status}")
    
    if event == 'transaction.completed':
        grant_access(data['payerAddress'], data['resource'])
    elif event == 'transaction.failed':
        handle_failure(tx_hash)
    elif event == 'transaction.pending':
        show_pending_status(tx_hash)
    
    # Step 4: Respond with 200 OK
    return jsonify({'success': True}), 200
```

## Webhook Timeline

### Fast Confirmation (< 30 seconds)
```
0s    → POST /settle (merchant request)
0.4s  → Pre-flight checks complete
0.5s  → Database insert
0.5s  → TX submitted to blockchain
12s   → TX confirmed
12s   → ✅ Webhook sent: transaction.completed
12s   → ← 200 OK response to merchant
```

### Slow Confirmation (> 30 seconds)
```
0s    → POST /settle (merchant request)
0.4s  → Pre-flight checks complete
0.5s  → Database insert
0.5s  → TX submitted to blockchain
30s   → Timeout waiting for confirmation
30s   → ✅ Webhook sent: transaction.pending
30s   → ← 200 OK response to merchant (status: pending)
...
45s   → Background monitor checks TX
45s   → TX confirmed on blockchain
45s   → ✅ Webhook sent: transaction.completed
```

### Failed Transaction
```
0s    → POST /settle (merchant request)
0.4s  → Pre-flight checks complete
0.5s  → Database insert
0.5s  → TX submitted to blockchain
15s   → TX reverted on blockchain
15s   → ✅ Webhook sent: transaction.failed
15s   → ← 200 OK response to merchant
```

## Retry Logic

If webhook delivery fails, the facilitator automatically retries:

1. **Attempt 1**: Immediate
2. **Attempt 2**: +5 seconds
3. **Attempt 3**: +15 seconds (final)

All attempts are logged in the `webhook_deliveries` table.

## Delivery Logs

Query webhook delivery history:

```sql
SELECT * FROM webhook_deliveries
WHERE transaction_id = 123
ORDER BY created_at DESC;
```

Fields:
- `id`: Delivery log ID
- `transaction_id`: Associated transaction
- `webhook_url`: Destination URL
- `event`: Event type
- `status`: `success` or `failed`
- `response_code`: HTTP status code (200, 404, 500, etc)
- `attempts`: Number of retry attempts
- `error_message`: Error details if failed
- `created_at`: Timestamp

## Best Practices

### 1. **Respond Quickly**
Return `200 OK` within 10 seconds. Process heavy work asynchronously.

```javascript
app.post('/webhook', async (req, res) => {
  // Verify signature
  if (!verifySignature(req)) {
    return res.status(401).send('Invalid');
  }
  
  // Respond immediately
  res.status(200).send('OK');
  
  // Process asynchronously
  processWebhookAsync(req.body).catch(console.error);
});
```

### 2. **Use Idempotency**
Store `transactionHash` to avoid processing duplicate webhooks.

```javascript
const processedTxs = new Set();

async function processWebhook(data) {
  if (processedTxs.has(data.transactionHash)) {
    console.log('Already processed, skipping');
    return;
  }
  
  processedTxs.add(data.transactionHash);
  // Process payment...
}
```

### 3. **Handle All Event Types**
Subscribe to all events for complete payment lifecycle tracking.

```javascript
switch (event) {
  case 'transaction.completed':
    // Grant access immediately
    break;
  case 'transaction.pending':
    // Show "Processing..." to user
    break;
  case 'transaction.failed':
    // Show error, offer retry
    break;
}
```

### 4. **Log Everything**
Keep audit logs for compliance and debugging.

```javascript
await db.saveWebhookEvent({
  transactionHash: data.transactionHash,
  event: data.event,
  status: data.status,
  receivedAt: new Date(),
  signature: req.headers['x-webhook-signature']
});
```

### 5. **Monitor Failures**
Set up alerts for webhook delivery failures.

```sql
-- Check recent webhook failures
SELECT * FROM webhook_deliveries
WHERE status = 'failed'
  AND created_at > NOW() - INTERVAL 24 HOUR
ORDER BY created_at DESC;
```

## Testing Webhooks

### Using webhook.site

1. Go to https://webhook.site
2. Copy your unique URL
3. Update your merchant config:
   ```sql
   UPDATE merchants 
   SET webhook_url = 'https://webhook.site/your-unique-id'
   WHERE merchant_address = '0xYourAddress';
   ```
4. Make a test payment
5. See the webhook payload in real-time

### Local Testing with ngrok

```bash
# Start ngrok tunnel
ngrok http 3000

# Update webhook URL
UPDATE merchants 
SET webhook_url = 'https://your-id.ngrok.io/api/webhook'
WHERE merchant_address = '0xYourAddress';
```

## Security Checklist

- [ ] Webhook URL uses HTTPS
- [ ] Signature verification implemented
- [ ] Timestamp validation (< 5 minutes)
- [ ] Idempotency handling
- [ ] Error logging enabled
- [ ] Rate limiting on webhook endpoint
- [ ] Secret key is strong (32+ characters)
- [ ] Secret key stored securely (environment variable)
- [ ] Webhook endpoint not publicly listed
- [ ] Response timeout < 10 seconds

## Troubleshooting

### Webhooks Not Received

1. **Check URL**: Must be HTTPS and publicly accessible
   ```sql
   SELECT webhook_url FROM merchants WHERE merchant_address = '0xYour...';
   ```

2. **Check Events**: Ensure you're subscribed to the event
   ```sql
   SELECT webhook_events FROM merchants WHERE merchant_address = '0xYour...';
   ```

3. **Check Delivery Logs**: See error messages
   ```sql
   SELECT * FROM webhook_deliveries ORDER BY created_at DESC LIMIT 10;
   ```

4. **Check Firewall**: Ensure port 443 allows outbound connections

### Signature Validation Fails

- Verify you're using the exact webhook_secret from database
- Use `JSON.stringify()` on the raw body, not parsed object
- Check for extra whitespace in secret key
- Ensure timing-safe comparison

### Timeouts

- Return 200 OK within 10 seconds
- Process heavy work in background job queue
- Check your server response time

## Support

For issues or questions:
- Check delivery logs: `webhook_deliveries` table
- Review facilitator logs: `pm2 logs x402-facilitator`
- Test with webhook.site first
- Verify signature algorithm matches exactly

---

**Updated**: December 6, 2025  
**Version**: 1.0 with retry logic and HTTPS validation
