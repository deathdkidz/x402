# WalletConnect Setup Guide

The wallet connection has been upgraded to **RainbowKit**, which provides support for multiple wallets and devices.

## Supported Wallets

### Browser Extensions (Work Without Additional Setup)
- ✅ **MetaMask** - Desktop browser extension
- ✅ **Coinbase Wallet** - Desktop browser extension  
- ✅ **Rainbow** - Desktop browser extension
- ✅ **Trust Wallet** - Desktop browser extension
- ✅ **Brave Wallet** - Built into Brave browser
- ✅ **Any injected wallet**

### Mobile Wallets (Requires WalletConnect Project ID)
- 📱 **MetaMask Mobile** - iOS/Android app
- 📱 **Coinbase Wallet Mobile** - iOS/Android app
- 📱 **Rainbow Mobile** - iOS/Android app
- 📱 **Trust Wallet Mobile** - iOS/Android app
- 📱 **Argent** - iOS/Android app
- 📱 **Zerion** - iOS/Android app
- 📱 **100+ other mobile wallets** via WalletConnect

## Setup Instructions

### Quick Start (Browser Extension Wallets Only)
No additional setup needed! The app works immediately with browser extension wallets like MetaMask.

### Full Setup (Enable Mobile Wallet Support)

1. **Get a WalletConnect Project ID** (Free)
   - Visit: https://cloud.walletconnect.com
   - Sign up for a free account
   - Create a new project
   - Copy your Project ID

2. **Add to Environment Variables**
   ```bash
   # Edit .env.local
   NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=your_actual_project_id_here
   ```

3. **Restart the Application**
   ```bash
   npm run pm2:restart
   # or for dev:
   npm run dev
   ```

## Features

### Dark Theme
RainbowKit is configured with a custom dark theme matching your site's design:
- Cyan accent color (#06b6d4)
- Medium border radius
- System font stack

### Chain Support
The app supports multiple networks:
- **Base Sepolia** (testnet) - Primary testing network
- **Sepolia** (testnet) - Ethereum testnet
- **Base** (mainnet) - Layer 2 network
- **Ethereum Mainnet** - Main network

Users can easily switch between networks using the RainbowKit interface.

### Responsive Design
- Desktop: Full modal with wallet options
- Mobile: Bottom sheet drawer optimized for touch
- Tablet: Adaptive layout

## Benefits Over Previous Implementation

| Feature | Old | New |
|---------|-----|-----|
| Wallet Options | 1 (injected only) | 15+ wallets |
| Mobile Support | Limited | Full WalletConnect support |
| UI/UX | Basic button | Professional modal |
| Chain Switching | Manual | Built-in UI |
| Device Support | Desktop only | Desktop + Mobile + Tablet |
| QR Code | No | Yes (for mobile) |
| Recent Wallets | No | Yes (remembers) |

## Testing

### Desktop Testing
1. Install MetaMask or Coinbase Wallet browser extension
2. Click "Connect Wallet"
3. Select your wallet from the modal
4. Approve the connection

### Mobile Testing  
1. Set up WalletConnect Project ID (see above)
2. Open the site on mobile browser
3. Click "Connect Wallet"
4. Select "WalletConnect"
5. Scan QR code with mobile wallet app
6. Approve the connection

## Troubleshooting

### "Failed to fetch remote project configuration"
This warning appears during build if no valid WalletConnect Project ID is set. It's harmless - browser extension wallets will still work. To fix:
- Add a valid `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` to `.env.local`

### Wallet not appearing in list
- For browser extensions: Make sure the extension is installed and enabled
- For mobile: Make sure WalletConnect Project ID is configured

### Connection fails
- Check that you're on a supported network
- Make sure the wallet app is up to date
- Try disconnecting and reconnecting

## Documentation

- RainbowKit Docs: https://www.rainbowkit.com/docs/introduction
- WalletConnect: https://cloud.walletconnect.com
- Wagmi (underlying library): https://wagmi.sh
