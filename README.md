# x402 - HTTP 402 Payment Required Implementation

A complete implementation of HTTP 402 Payment Required using ERC-3009 gasless USDC transfers on EVM-compatible blockchains.

## 📚 Documentation

Complete documentation is available in the [docs/](./docs/) folder:
- [Protocol Flow](./docs/X402_PROTOCOL_FLOW.md) - How X402 works
- [Testing Guide](./docs/X402_TESTING_GUIDE.md) - Testing the system  
- [Implementation Details](./docs/IMPLEMENTATION_SUMMARY.md) - Technical details
- [Security Audit](./docs/SECURITY_AUDIT_SUMMARY.md) - Security review

## Overview

x402 enables seamless micropayments for API access using USDC transfers. Merchants can require payment for API endpoints without users needing ETH for gas fees.

## Components

### 1. x402-facilitator
Backend service that handles payment verification and settlement.

**Features:**
- ERC-3009 gasless payment processing
- Multi-network support (Base Sepolia, Ethereum Sepolia, BSC Testnet)
- Merchant authentication and management
- Redis caching for performance
- Per-merchant rate limiting
- Gas tracking and monitoring
- Transaction status caching

**Tech Stack:**
- Node.js + TypeScript + Express
- MySQL database
- Redis for caching
- ethers.js for blockchain interaction

[View Documentation →](./x402-facilitator/README.md)

### 2. merchant-demo
Next.js demo application showing merchant integration.

**Features:**
- Payment UI with MetaMask integration
- Multi-network support
- Real-time payment status
- Test mode for development

**Tech Stack:**
- Next.js 15 + TypeScript
- TailwindCSS
- ethers.js

[View Documentation →](./merchant-demo/README.md)

## Quick Start

### 1. Start Facilitator

**Ubuntu/Linux:**
```bash
# Install dependencies
cd x402-facilitator
npm install

# Configure environment
cp .env.example .env
nano .env  # Edit with your configuration

# Install and start MySQL
sudo apt install mysql-server -y
sudo systemctl start mysql

# Install and start Redis
sudo apt install redis-server -y
sudo systemctl start redis-server

# Or use Docker for MySQL + Redis
docker-compose up -d

# Run migrations
mysql -u root -p x402_facilitator < migrations/*.sql

# Start facilitator
npm run dev
```

**Windows:**
```powershell
cd x402-facilitator
npm install
copy .env.example .env
# Edit .env with your configuration
docker-compose up -d  # Start MySQL + Redis
npm run dev
```

### 2. Start Merchant Demo

```bash
cd merchant-demo
npm install
cp .env.example .env
# Edit .env with facilitator URL
npm run dev
```

### 3. Test Payment Flow

1. Open http://localhost:3001
2. Connect MetaMask
3. Click "Pay with USDC"
4. Approve payment in MetaMask
5. Access protected content

## Documentation

- **[Facilitator Setup Guide](./x402-facilitator/SETUP_GUIDE.md)** - Complete setup instructions
- **[Facilitator Quickstart](./x402-facilitator/QUICKSTART.md)** - Get started quickly
- **[Security Guide](./x402-facilitator/SECURITY.md)** - Security best practices
- **[Redis Integration](./x402-facilitator/REDIS.md)** - Caching and performance
- **[Rate Limiting](./x402-facilitator/RATE_LIMITING.md)** - Tier-based rate limits
- **[Gas Tracking](./x402-facilitator/GAS_TRACKING.md)** - Monitor gas costs

## Supported Networks

| Network | Gas Token | USDC Address |
|---------|-----------|--------------|
| Base Sepolia | ETH | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` |
| Ethereum Sepolia | ETH | `0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238` |
| BSC Testnet | BNB | (custom deployment) |

## Architecture

```
┌─────────────┐      ┌──────────────┐      ┌─────────────┐
│   Browser   │─────▶│  Facilitator │─────▶│ Blockchain  │
│  (MetaMask) │      │   (Backend)  │      │   (USDC)    │
└─────────────┘      └──────────────┘      └─────────────┘
       │                     │                      │
       │                     ▼                      │
       │              ┌──────────┐                  │
       │              │  MySQL   │                  │
       │              └──────────┘                  │
       │                     │                      │
       │              ┌──────────┐                  │
       │              │  Redis   │                  │
       │              └──────────┘                  │
       │                                            │
       └────────────────────────────────────────────┘
                  (ERC-3009 Signature)
```

## Payment Flow

1. **Merchant requests payment** - Returns 402 with payment details
2. **User signs ERC-3009 authorization** - MetaMask signature (no gas)
3. **Facilitator verifies signature** - Validates authorization validity
4. **User accesses API** - Include authorization in request
5. **Facilitator settles on-chain** - Executes transfer and captures gas
6. **Merchant receives USDC** - Payment confirmed

## Features

### For Merchants
- ✅ Easy integration with REST API
- ✅ No blockchain knowledge required
- ✅ Automatic payment verification
- ✅ Multi-network support
- ✅ Tier-based rate limiting
- ✅ Real-time payment status

### For Users
- ✅ No ETH needed for gas
- ✅ Simple MetaMask signature
- ✅ Fast payment confirmation
- ✅ Multi-network support
- ✅ Transparent pricing

### For Operators
- ✅ Gas cost tracking
- ✅ Redis performance optimization
- ✅ Rate limiting per merchant
- ✅ Transaction monitoring
- ✅ Comprehensive logging

## Development

### Requirements
- Node.js 18+
- MySQL 8+
- Redis 7+
- Docker (optional)

### Testing

```bash
# Facilitator tests
cd x402-facilitator
npm test

# Test merchant registration
node test-merchant-registration.mjs

# Test full payment flow
node test-full-flow.mjs

# View gas statistics
node view-gas-stats.mjs --today
```

## Production Deployment

See [Facilitator Setup Guide](./x402-facilitator/SETUP_GUIDE.md) for production deployment instructions.

**Key considerations:**
- Use environment variables for secrets
- Enable SSL/TLS
- Configure rate limits per merchant tier
- Set up Redis for caching
- Monitor gas costs
- Implement backup strategies

## Security

- ✅ API key authentication
- ✅ Request signature verification
- ✅ Nonce replay protection
- ✅ Rate limiting per merchant
- ✅ Input validation
- ✅ Secure credential management

See [Security Guide](./x402-facilitator/SECURITY.md) for details.

## Contributing

Contributions welcome! Please:
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## License

MIT License - see LICENSE file for details

## Support

- GitHub Issues: [Report bugs or request features](https://github.com/deathdkidz/x402/issues)
- Documentation: See individual component READMEs
- Examples: Check `merchant-demo` for integration examples

## Roadmap

- [ ] Multi-token support (USDT, DAI)
- [ ] Subscription payments
- [ ] Payment analytics dashboard
- [ ] Webhook notifications
- [ ] Additional blockchain networks
- [ ] Mobile SDK

---

Built with ❤️ for the HTTP 402 community
