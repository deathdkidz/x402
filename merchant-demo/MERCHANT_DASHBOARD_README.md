# Merchant Dashboard

Wallet-authenticated merchant dashboard for X402 payment system.

## Features

- 🔐 **Wallet Authentication** - Login with MetaMask (no passwords needed)
- 📊 **Transaction History** - View all payment transactions
- ⚙️ **Settings Management** - Configure webhooks, API keys, business info
- 🔔 **Webhook Configuration** - Set up payment notifications
- 📈 **Account Overview** - Monitor tier, limits, and usage

## Database Setup

The merchant dashboard uses the **same database** as x402-facilitator. No separate database needed.

### Tables Used:
- `merchants` - Merchant accounts with topup and auth addresses
- `auth_nonces` - Temporary nonces for wallet authentication
- `merchant_sessions` - Active login sessions
- `transactions` - Payment transaction history

## Environment Configuration

Create `.env.local`:

```bash
# Database (same as x402-facilitator)
DB_HOST=localhost
DB_PORT=3306
DB_NAME=x402_facilitator
DB_USER=root
DB_PASSWORD=your_password_here

# Application
NODE_ENV=development
NEXT_PUBLIC_APP_URL=http://localhost:3001
```

## Installation

```bash
npm install
```

## Running the Dashboard

### Development
```bash
npm run dev
```

### Production with PM2
```bash
npm run pm2:start
npm run pm2:logs
```

## Creating a Merchant Account

Use the facilitator's script to create a merchant with separate addresses:

```bash
cd ../x402-facilitator
npm run generate:merchant
```

This generates:
- **Topup Address** - Receives payments (private key stored in DB)
- **Auth Address** - Used for dashboard login (import to MetaMask)
- **API Key** - For API requests
- **Webhook Secret** - For webhook signature verification

## Authentication Flow

1. User clicks "Connect Wallet"
2. System requests nonce for the wallet address
3. User signs the nonce with MetaMask
4. System verifies signature and creates session
5. Session stored in cookie (30-day expiry)

## API Endpoints

### Authentication
- `POST /api/auth/nonce` - Request authentication nonce
- `POST /api/auth/verify` - Verify signature and create session
- `GET /api/auth/session` - Get current session info
- `POST /api/auth/logout` - Logout and invalidate session

### Dashboard
- `GET /api/dashboard/settings` - Get merchant settings
- `PATCH /api/dashboard/settings` - Update merchant settings
- `GET /api/dashboard/transactions` - Get transaction history

## Security Features

- ✅ Wallet signature verification
- ✅ Nonce expiration (5 minutes)
- ✅ Session expiration (30 days)
- ✅ HTTP-only cookies
- ✅ IP and User-Agent tracking
- ✅ Session invalidation on logout

## Architecture

```
Merchant Dashboard (Port 3001)
    ↓
Database Connection → x402_facilitator DB
    ↓
Tables: merchants, auth_nonces, merchant_sessions, transactions
```

## Key Differences from Old System

### Before (Username/Password):
- Required password hashing
- Password reset flows
- Email verification
- Session management complexity

### Now (Wallet Auth):
- **No passwords** - Cryptographic signatures
- **No email required** - Wallet is identity
- **Simpler sessions** - Sign message to login
- **More secure** - Cannot be phished or brute-forced

## Merchant Account Structure

```typescript
{
  auth_address: "0x..."  // PRIMARY: Login, API identity, payment recipient
  topup_address: "0x..." // OPTIONAL: Deposits only
  business_name: "My Business"
  api_key: "abc123..."   // For API requests
  private_key: "0x..."   // Topup wallet (for deposits)
  tier: "free"           // Account tier
  webhook_url: "https://..."
  webhook_secret: "xyz..."
}
```

## Development

The dashboard is a Next.js app that:
1. Connects to x402-facilitator database
2. Provides wallet authentication
3. Shows merchant account info
4. Manages settings and webhooks

No separate backend needed - uses Next.js API routes.

## Production Deployment

1. Build the application:
```bash
npm run build
```

2. Start with PM2:
```bash
npm run pm2:start
```

3. Configure reverse proxy (nginx) for HTTPS

4. Update environment variables for production database connection

## Troubleshooting

### "No merchant account found"
- Wallet address must match `auth_address` in database
- Check if merchant account is active
- Verify you're using the correct wallet

### "Invalid or expired nonce"
- Nonces expire after 5 minutes
- Request a new nonce and try again

### Session expired
- Sessions last 30 days
- Simply reconnect wallet to login again
