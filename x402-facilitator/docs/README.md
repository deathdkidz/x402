# X402 Facilitator Documentation

Complete documentation for the X402 Payment Facilitator service.

## Quick Links

### Getting Started
- [Setup Guide](./SETUP.md) - Complete installation and configuration
- [Quick Start](./QUICKSTART.md) - Get running in 5 minutes
- [Environment Configuration](./ENVIRONMENT.md) - Environment variables reference

### Features
- [Multi-Paymaster](./MULTI_PAYMASTER.md) - Parallel settlement processing with multiple paymasters
- [Webhooks](./WEBHOOKS.md) - Payment notification system with HTTPS validation
- [Rate Limiting](./RATE_LIMITING.md) - Tier-based API rate limits
- [Gas Tracking](./GAS_TRACKING.md) - Monitor and analyze gas costs

### Operations
- [Security](./SECURITY.md) - Security best practices and hardening
- [Redis Cache](./REDIS.md) - Redis setup and caching strategy
- [Adding Tokens](./ADDING_TOKENS.md) - How to add new ERC-3009 tokens

### Technical Reference
- [Transaction Status](./TRANSACTION_STATUS.md) - Transaction lifecycle and caching
- [Webhook Resource Tracking](./WEBHOOK_RESOURCE_TRACKING.md) - Resource-based webhook tracking

## Architecture

```
┌─────────────┐
│   Client    │
└──────┬──────┘
       │
       ▼
┌─────────────────┐
│  Rate Limiter   │ ← Redis Cache
└──────┬──────────┘
       │
       ▼
┌─────────────────┐
│   API Routes    │
│  /verify        │
│  /settle        │
└──────┬──────────┘
       │
       ▼
┌─────────────────┐
│   Paymaster     │
│     Pool        │ ← Multiple Wallets
└──────┬──────────┘
       │
       ▼
┌─────────────────┐
│   Blockchain    │
│   (ERC-3009)    │
└─────────────────┘
       │
       ▼
┌─────────────────┐
│   Webhooks      │
│   Delivery      │
└─────────────────┘
```

## API Endpoints

- `GET /health` - Health check
- `GET /networks` - Supported networks and tokens
- `POST /verify` - Verify payment authorization
- `POST /settle` - Execute gasless payment settlement

## Support

For issues and questions, please refer to the specific documentation files above.
