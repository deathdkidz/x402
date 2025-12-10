# Merchant Demo - x402 Protocol

A demonstration merchant store application showcasing the x402 payment protocol integration.

## 🔒 Payment Security

Content is delivered only after **blockchain confirmation** (~5-30 seconds). This ensures funds are transferred before serving protected resources.

**One-call payment process:**
1. 💰 **SETTLE**: Single call to facilitator's `/settle` endpoint
2. 🔍 **Verification** (100-300ms): Facilitator validates signature, nonce, balance internally
3. ⛓️ **Blockchain** (5-30s): Execute transaction, wait for confirmation
4. 🎉 **SERVE**: Deliver content after payment confirmed

The `/settle` endpoint does **all verification internally** - no need to call `/verify` first!

See [PERFORMANCE_OPTIMIZATIONS.md](./PERFORMANCE_OPTIMIZATIONS.md) for detailed explanation.

## Features

- Demo product catalog
- x402 payment integration
- Gasless USDC payments via ERC-3009
- Base Sepolia testnet support
- Fast content delivery (~100-300ms)

## Getting Started

### Prerequisites

- Node.js 18+ installed
- MetaMask or compatible Web3 wallet
- Base Sepolia testnet USDC tokens

### Installation

```bash
npm install
```

### Configuration

Create a `.env.local` file in the root directory (or copy from `.env.example`):

```bash
cp .env.example .env.local
```

Configure the facilitator URL:

```env
NEXT_PUBLIC_FACILITATOR_URL=http://localhost:8080
```

### Development

```bash
npm run dev
```

Open [http://localhost:3003](http://localhost:3003) to view the demo store.

## Features & Pages

- **Home** (`/`) - API key configuration and navigation
- **Payment Demo** (`/demo`) - Interactive demo showing x402 payment flow with locked content
- **API Testing** (`/test`) - Test all facilitator endpoints (health, verify, settle, networks)
- **API Documentation** (`/docs`) - Complete API reference with examples and use cases

### Building for Production

```bash
npm run build
npm start
```

## Integration Guide

This demo shows how to integrate x402 payments into your merchant application:

1. **Setup**: Include the x402 client library
2. **Product Display**: Show products with USDC pricing
3. **Payment Flow**: Initiate payment via x402 protocol
4. **Confirmation**: Handle payment success/failure

## Technology Stack

- **Next.js 15**: React framework with App Router
- **TypeScript**: Type-safe development
- **Tailwind CSS**: Utility-first styling
- **Wagmi**: Web3 React hooks (for wallet connection)
- **Ethers.js**: Ethereum library

## Environment

- **Network**: Base Sepolia Testnet
- **Chain ID**: 84532
- **USDC Contract**: 0x036CbD53842c5426634e7929541eC2318f3dCF7e
- **Protocol**: ERC-3009 (Gasless transfers)

## License

MIT
