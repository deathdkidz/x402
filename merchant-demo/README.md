# Merchant Demo - x402 Protocol

A demonstration merchant store application showcasing the x402 payment protocol integration.

## Features

- Demo product catalog
- x402 payment integration
- Gasless USDC payments via ERC-3009
- Base Sepolia testnet support

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
