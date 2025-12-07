'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ethers } from 'ethers';

interface MerchantData {
  id: number;
  authAddress: string;
  businessName: string | null;
  email: string | null;
  tier: string;
}

export default function DashboardPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [merchant, setMerchant] = useState<MerchantData | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    checkSession();
  }, []);

  const checkSession = async () => {
    try {
      const response = await fetch('/api/auth/session');
      const data = await response.json();

      if (data.authenticated) {
        setMerchant(data.merchant);
      }
    } catch (error) {
      console.error('Error checking session:', error);
    } finally {
      setLoading(false);
    }
  };

  const connectWallet = async () => {
    setIsConnecting(true);
    setError('');

    try {
      if (!window.ethereum) {
        setError('Please install MetaMask to use this feature');
        setIsConnecting(false);
        return;
      }

      const provider = new ethers.BrowserProvider(window.ethereum);
      
      // Request account access
      const accounts = await provider.send('eth_requestAccounts', []);
      const authAddress = accounts[0];

      // Request nonce
      const nonceResponse = await fetch('/api/auth/nonce', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ authAddress }),
      });

      const nonceData = await nonceResponse.json();

      if (!nonceData.success) {
        setError(nonceData.error || 'Failed to get authentication nonce');
        setIsConnecting(false);
        return;
      }

      // Sign message
      const signer = await provider.getSigner();
      const signature = await signer.signMessage(nonceData.nonce);

      // Verify signature and create session
      const verifyResponse = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          authAddress,
          nonce: nonceData.nonce,
          signature,
        }),
      });

      const verifyData = await verifyResponse.json();

      if (!verifyData.success) {
        setError(verifyData.error || 'Authentication failed');
        setIsConnecting(false);
        return;
      }

      // Set merchant data
      setMerchant(verifyData.merchant);
      setError('');
    } catch (error: any) {
      console.error('Error connecting wallet:', error);
      setError(error.message || 'Failed to connect wallet');
    } finally {
      setIsConnecting(false);
    }
  };

  const logout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      setMerchant(null);
    } catch (error) {
      console.error('Error logging out:', error);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (!merchant) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8">
          <div className="text-center">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              Merchant Dashboard
            </h1>
            <p className="text-gray-600 mb-8">
              Connect your wallet to access your merchant account
            </p>

            {error && (
              <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
                {error}
              </div>
            )}

            <button
              onClick={connectWallet}
              disabled={isConnecting}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-lg transition duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isConnecting ? (
                <span className="flex items-center justify-center">
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Connecting...
                </span>
              ) : (
                'Connect Wallet'
              )}
            </button>

            <p className="mt-4 text-sm text-gray-500">
              Use the wallet address registered as your auth address
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <h1 className="text-xl font-bold text-gray-900">
                Merchant Dashboard
              </h1>
            </div>
            <div className="flex items-center space-x-4">
              <span className="text-sm text-gray-600">
                {merchant.authAddress.slice(0, 6)}...{merchant.authAddress.slice(-4)}
              </span>
              <button
                onClick={logout}
                className="text-sm text-red-600 hover:text-red-700 font-medium"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-sm font-medium text-gray-500 mb-2">Business Name</h3>
            <p className="text-2xl font-bold text-gray-900">
              {merchant.businessName || 'Not set'}
            </p>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-sm font-medium text-gray-500 mb-2">Account Tier</h3>
            <p className="text-2xl font-bold text-gray-900 capitalize">{merchant.tier}</p>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-sm font-medium text-gray-500 mb-2">Auth Address</h3>
            <p className="text-sm font-mono text-gray-900">
              {merchant.authAddress.slice(0, 10)}...{merchant.authAddress.slice(-8)}
            </p>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Quick Actions</h2>
          </div>
          <div className="p-6 space-y-4">
            <button
              onClick={() => router.push('/dashboard/settings')}
              className="w-full text-left px-4 py-3 bg-gray-50 hover:bg-gray-100 rounded-lg transition duration-200"
            >
              <h4 className="font-medium text-gray-900">Settings</h4>
              <p className="text-sm text-gray-600">Manage your account settings and webhooks</p>
            </button>

            <button
              onClick={() => router.push('/dashboard/transactions')}
              className="w-full text-left px-4 py-3 bg-gray-50 hover:bg-gray-100 rounded-lg transition duration-200"
            >
              <h4 className="font-medium text-gray-900">Transactions</h4>
              <p className="text-sm text-gray-600">View your payment transaction history</p>
            </button>

            <button
              onClick={() => router.push('/dashboard/api-keys')}
              className="w-full text-left px-4 py-3 bg-gray-50 hover:bg-gray-100 rounded-lg transition duration-200"
            >
              <h4 className="font-medium text-gray-900">API Keys</h4>
              <p className="text-sm text-gray-600">View and manage your API credentials</p>
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
