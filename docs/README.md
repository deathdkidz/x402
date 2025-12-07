# X402 Project Documentation

Documentation for the complete X402 payment system including the facilitator service and merchant demo.

## Project Overview

The X402 project implements a gasless payment system using ERC-3009 (transferWithAuthorization) for USDC transfers.

## Components

### 1. x402-facilitator
Backend service that handles payment verification and settlement.
- [Facilitator Documentation](../x402-facilitator/docs/)

### 2. merchant-demo  
Frontend demo application for merchants to accept X402 payments.
- [Demo Documentation](../merchant-demo/)

## Technical Guides

- [Protocol Flow](./X402_PROTOCOL_FLOW.md) - How X402 payments work end-to-end
- [Testing Guide](./X402_TESTING_GUIDE.md) - Testing the X402 implementation
- [Quick Reference](./QUICK_REFERENCE.md) - Quick API reference
- [Implementation Summary](./IMPLEMENTATION_SUMMARY.md) - Technical implementation details
- [Security Audit](./SECURITY_AUDIT_SUMMARY.md) - Security review findings

## X-Payment Integration

- [X-Payment Implementation](./X_PAYMENT_IMPLEMENTATION_SUMMARY.md) - Twitter/X payment integration
- [X-Payment Data Flow](./X_PAYMENT_RAW_DATA_FLOW.md) - Data flow diagrams

## Getting Started

1. **Set up the facilitator**: Follow [x402-facilitator setup guide](../x402-facilitator/docs/SETUP.md)
2. **Run the demo**: Follow [merchant-demo README](../merchant-demo/README.md)
3. **Test payments**: Use the [testing guide](./X402_TESTING_GUIDE.md)

## Architecture

```
┌──────────────┐
│   Browser    │
│ (Merchant)   │
└──────┬───────┘
       │ Payment Request
       ▼
┌──────────────┐
│  Wallet      │
│  (MetaMask)  │
└──────┬───────┘
       │ Sign Authorization
       ▼
┌──────────────┐
│ x402         │
│ Facilitator  │ ← Verify & Settle
└──────┬───────┘
       │ ERC-3009
       ▼
┌──────────────┐
│  Blockchain  │
│  (USDC)      │
└──────────────┘
```

## Support

- Facilitator issues: [x402-facilitator/docs](../x402-facilitator/docs/)
- Demo issues: [merchant-demo/README.md](../merchant-demo/README.md)
