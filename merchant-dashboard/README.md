# X-402 Merchant Dashboard

Admin dashboard for monitoring X-402 payment facilitator transactions and merchant information.

## Features

- **Authentication**: Simple login system for merchant access
- **Transaction Monitoring**: View all payment transactions with status tracking
- **Revenue Analytics**: Track total revenue and transaction counts
- **Merchant Information**: View merchant account details and configuration
- **Real-time Stats**: Pending, completed, and failed transaction counts

## Setup

1. **Install dependencies**:
```bash
npm install
```

2. **Configure environment variables**:
Create `.env.local` with:
```env
NEXT_PUBLIC_FACILITATOR_URL=https://api.novacasino.xyz
X402_API_KEY=your_api_key_here
NEXT_PUBLIC_MERCHANT_ADDRESS=your_merchant_address_here
```

3. **Development**:
```bash
npm run dev
```

4. **Production Build**:
```bash
npm run build
npm start
```

## PM2 Deployment

The dashboard runs on port 3001 alongside the demo app (port 3000).

```bash
# Build for production
npm run build

# Start with PM2
pm2 start ecosystem.config.js

# View logs
pm2 logs merchant-dashboard
```

## Domain Setup

Configure your domain (dash.novacasino.xyz) to point to this app on port 3001.

## Default Login

- **Username**: `admin`
- **Password**: (any password)

⚠️ **Important**: Implement proper authentication in production!
