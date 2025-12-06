'use client';

import { ConnectButton } from '@rainbow-me/rainbowkit';

export default function WalletConnect() {
  return (
    <ConnectButton 
      chainStatus="icon"
      showBalance={false}
    />
  );
}
