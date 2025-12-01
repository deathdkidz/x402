'use client';

import { useAccount, useConnect, useDisconnect } from 'wagmi';

export default function WalletConnect() {
  const { address, isConnected } = useAccount();
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();

  if (isConnected && address) {
    return (
      <div className="flex items-center gap-3">
        <div className="bg-slate-800/60 px-3 py-2 rounded-lg border border-slate-700/40">
          <div className="text-xs text-slate-400 mb-0.5">Connected</div>
          <div className="text-slate-100 font-mono text-sm">
            {address.substring(0, 6)}...{address.substring(38)}
          </div>
        </div>
        <button
          onClick={() => disconnect()}
          className="text-xs text-red-400 hover:text-red-300 transition-colors"
        >
          Disconnect
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => connect({ connector: connectors[0] })}
      className="btn-primary px-4 py-2 rounded-lg font-semibold text-sm"
    >
      Connect Wallet
    </button>
  );
}
