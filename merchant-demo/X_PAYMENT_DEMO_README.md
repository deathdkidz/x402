# X-PAYMENT Protocol Demo

Complete implementation of the X-402 payment protocol using X-PAYMENT headers, showing raw data at every step of the flow.

## 📋 Overview

This demo shows **exactly** how the X-402 payment protocol works using HTTP headers instead of direct API calls:

- **Client**: Creates payment, signs with EIP-712, base64 encodes
- **Server**: Decodes header, verifies with facilitator, settles payment
- **Facilitator**: Verifies signature, executes blockchain transaction
- **Response**: Returns content with payment confirmation

## 🚀 Quick Start

### 1. Start Facilitator
```bash
cd /srv/x402/x402-facilitator
npm run dev
```

### 2. Start Merchant Demo
```bash
cd /srv/x402/merchant-demo
npm run dev
```

### 3. Open Demo
Visit: http://localhost:3003/x-payment-demo

## 📊 What You'll See

### Step-by-Step Raw Data Inspection

The demo shows **every byte** of data exchanged:

1. **Client Creates Authorization** (280 bytes JSON)
   - User wallet address
   - Merchant wallet address  
   - Payment amount (0.01 USDC)
   - Time window
   - Random nonce

2. **Client Signs with EIP-712** (65 bytes signature)
   - Domain separator
   - Type structure
   - ECDSA signature (r, s, v)

3. **Client Encodes to Base64** (640 bytes)
   - JSON → UTF-8 → Base64
   - Safe for HTTP headers

4. **Client → Server** (950 bytes HTTP)
   ```http
   GET /api/premium/cat HTTP/1.1
   X-PAYMENT: eyJhdXRob3JpemF0aW9u...
   ```

5. **Server Decodes** (480 bytes JSON)
   - Base64 → UTF-8 → JSON
   - Extract authorization + signature

6. **Server → Facilitator (Verify)** (1,350 bytes HTTP)
   ```json
   {
     "paymentPayload": {...},
     "paymentRequirements": {...}
   }
   ```

7. **Facilitator → Server (Result)** (180 bytes)
   ```json
   {
     "isValid": true,
     "payer": "0x742d..."
   }
   ```

8. **Server → Facilitator (Settle)** (1,350 bytes)
   - Execute blockchain transaction
   - ERC-3009 transferWithAuthorization

9. **Facilitator → Server (TX Hash)** (320 bytes)
   ```json
   {
     "success": true,
     "transaction": "0xabcdef..."
   }
   ```

10. **Server → Client (Content)** (650 bytes)
    ```http
    HTTP/1.1 200 OK
    X-PAYMENT-RESPONSE: eyJzdGF0dXM...
    
    {"imageUrl": "...", "description": "..."}
    ```

## 🔍 Features

### Interactive Demo
- ✅ Connect MetaMask wallet
- ✅ Create payment authorization
- ✅ Sign with EIP-712
- ✅ Encode to base64
- ✅ Send to server via X-PAYMENT header
- ✅ View verification process
- ✅ Watch settlement execution
- ✅ Receive premium content

### Raw Data Inspection
- ✅ See exact JSON at each step
- ✅ View base64 encoding/decoding
- ✅ Inspect HTTP headers
- ✅ Decode X-PAYMENT-RESPONSE
- ✅ Monitor data sizes
- ✅ Track flow direction

### Color-Coded Steps
- 🔵 **Client** - Blue badges
- 🟢 **Server** - Green badges
- 🟣 **Facilitator** - Purple badges

## 📖 Documentation

See complete raw data flow: [X_PAYMENT_RAW_DATA_FLOW.md](/srv/x402/X_PAYMENT_RAW_DATA_FLOW.md)

### Key Documents
- **Protocol Flow**: Step-by-step HTTP/JSON examples
- **Testing Guide**: curl commands and security tests
- **Security Audit**: All validations explained

## 🔐 Security Features

Every step includes validations:

1. ✅ Network validation
2. ✅ EIP-712 signature verification
3. ✅ **Recipient match** (authorization.to === requirements.payTo)
4. ✅ Amount match
5. ✅ Time window check
6. ✅ Balance verification
7. ✅ Nonce replay protection

## 🧪 Testing

### Manual Testing
1. Click "Create & Sign Payment" 
2. Watch raw data log populate
3. Click "Send to Server & Complete"
4. Inspect each step's data
5. View decoded payloads
6. Check final premium content

### Security Testing
Try tampering with data:
- Change recipient address → **Blocked**
- Modify amount → **Blocked**
- Use expired signature → **Rejected**
- Replay nonce → **Detected**

## 🆚 X-PAYMENT vs REST API

| Feature | X-PAYMENT Header | Direct REST API |
|---------|------------------|-----------------|
| **Client Calls** | 1 (GET with header) | 2 (POST verify + POST settle) |
| **Server Logic** | Middleware handles all | Client manages flow |
| **Data Size** | 950 bytes total | 2,700 bytes (2 calls) |
| **Complexity** | Server-side | Client-side |
| **Use Case** | Payment-gated content | Explicit control |

## 📦 Data Size Breakdown

| Step | Size | Description |
|------|------|-------------|
| Authorization | 280 bytes | Payment details |
| Signature | 65 bytes | EIP-712 ECDSA |
| Base64 Encoded | 640 bytes | HTTP-safe format |
| Client → Server | 950 bytes | GET request |
| Server → Facilitator | 1,350 bytes | Verify request |
| Facilitator Response | 180 bytes | Validation result |
| Settlement Request | 1,350 bytes | Execute payment |
| Settlement Response | 320 bytes | TX hash |
| Server → Client | 650 bytes | Content + confirmation |

**Total:** ~6.1 KB for complete payment flow

## 🛠️ Technical Details

### Technologies Used
- **Next.js 15**: Server-side rendering
- **Wagmi**: Wallet connection
- **ethers.js**: EIP-712 signing
- **Express**: Facilitator API
- **MySQL**: Transaction storage
- **Redis**: Nonce caching

### EIP-712 Signature
```typescript
domain = {
  name: "USD Coin",
  version: "2",
  chainId: 84532,
  verifyingContract: "0x036CbD..."
}

types = {
  TransferWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" }
  ]
}
```

### Base64 Encoding
```javascript
// Encode
const json = JSON.stringify(payload);
const base64 = Buffer.from(json).toString('base64');

// Decode
const json = Buffer.from(base64, 'base64').toString('utf-8');
const payload = JSON.parse(json);
```

## 🎯 Use Cases

### Perfect for X-PAYMENT Headers
- ✅ Payment-gated API endpoints
- ✅ Premium content delivery
- ✅ Subscription verification
- ✅ Micropayments per request
- ✅ Content-as-a-service

### Better with Direct REST API
- ✅ Complex payment flows
- ✅ Multi-step checkouts
- ✅ Client-side payment tracking
- ✅ Custom UX requirements

## 🐛 Debugging

### View Logs
```bash
# Facilitator logs
cd /srv/x402/x402-facilitator
npm run dev

# Check for verification logs
tail -f logs/combined.log
```

### Browser DevTools
1. Open Network tab
2. Click "XHR" filter
3. Watch requests to facilitator
4. Inspect X-PAYMENT header
5. View X-PAYMENT-RESPONSE

### Common Issues

**Problem**: Signature verification fails  
**Solution**: Check EIP-712 domain matches network

**Problem**: Recipient mismatch  
**Solution**: Ensure authorization.to === merchant address

**Problem**: Insufficient balance  
**Solution**: Get testnet USDC from faucet

## 📝 Example Code

### Client (Browser)
```typescript
// 1. Create payment
const payment = {
  authorization: { from, to, value, validAfter, validBefore, nonce },
  signature: await signTypedDataAsync(...)
};

// 2. Encode
const xPayment = btoa(JSON.stringify(payment));

// 3. Send request
const response = await fetch('/api/premium/cat', {
  headers: { 'X-PAYMENT': xPayment }
});

// 4. Get response
const xPaymentResponse = response.headers.get('x-payment-response');
const status = JSON.parse(atob(xPaymentResponse));
```

### Server (Next.js)
```typescript
export async function GET(req: NextRequest) {
  // Handle X-402 payment
  const result = await handleX402Payment(req, {
    resource: '/api/premium/cat',
    amount: '10000',
    description: 'Premium content'
  });

  if (result.error) return result.response;

  // Return content
  return NextResponse.json(
    { content: '...' },
    { headers: result.headers }
  );
}
```

## 🌐 Live Demo Flow

```
User clicks "Create & Sign Payment"
  ↓
MetaMask popup appears
  ↓
User signs EIP-712 message
  ↓
Demo shows:
  - Raw authorization JSON
  - EIP-712 domain + types
  - Signature (r, s, v)
  - Base64 encoded payload
  ↓
User clicks "Send to Server"
  ↓
Demo shows:
  - HTTP request with X-PAYMENT header
  - Server decoding process
  - Facilitator verify request/response
  - Facilitator settle request/response
  - Final HTTP response with X-PAYMENT-RESPONSE
  ↓
Premium cat image displayed!
```

## 🚀 Next Steps

1. **Try the Demo**: Visit /x-payment-demo
2. **Read Raw Data Doc**: See exact bytes at each step
3. **Test Security**: Try tampering with data
4. **Integrate**: Use handleX402Payment() in your APIs

## 💡 Pro Tips

- **Development**: Use testnet (base-sepolia)
- **Production**: Switch to mainnet
- **Testing**: Try security attacks (see docs)
- **Monitoring**: Check facilitator logs
- **Optimization**: Cache merchant data in Redis

---

**Your complete X-402 payment system with X-PAYMENT headers is ready!** 🎉
