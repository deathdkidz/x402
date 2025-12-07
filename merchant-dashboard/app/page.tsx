'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface Transaction {
  id: string;
  payer: string;
  amount: string;
  network: string;
  asset: string;
  status: 'pending' | 'completed' | 'failed';
  transactionHash?: string;
  timestamp: string;
}

interface Stats {
  totalTransactions: number;
  totalRevenue: string;
  pendingCount: number;
  completedCount: number;
  failedCount: number;
}

export default function DashboardPage() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [stats, setStats] = useState<Stats>({
    totalTransactions: 0,
    totalRevenue: '0',
    pendingCount: 0,
    completedCount: 0,
    failedCount: 0,
  });
  const [loading, setLoading] = useState(false);
  const [merchantInfo, setMerchantInfo] = useState<any>(null);

  useEffect(() => {
    const auth = sessionStorage.getItem('dashAuth');
    if (auth === 'true') {
      setIsAuthenticated(true);
      loadDashboardData();
    }
  }, []);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (username === 'admin') {
      sessionStorage.setItem('dashAuth', 'true');
      setIsAuthenticated(true);
      loadDashboardData();
    } else {
      setError('Invalid credentials');
    }
  };

  const handleLogout = () => {
    sessionStorage.removeItem('dashAuth');
    setIsAuthenticated(false);
    setUsername('');
    setPassword('');
  };

  const loadDashboardData = async () => {
    setLoading(true);
    try {
      const merchantRes = await fetch('/api/merchant-info');
      if (merchantRes.ok) {
        const merchantData = await merchantRes.json();
        setMerchantInfo(merchantData);
      }

      const mockTransactions: Transaction[] = [
        {
          id: '1',
          payer: '0x67B662afAc6AE778134803aeB9a32d4fF0ECe84C',
          amount: '0.01 USDC',
          network: 'Base Sepolia',
          asset: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
          status: 'completed',
          transactionHash: '0x8f5e9c7b...',
          timestamp: new Date().toISOString(),
        },
      ];

      setTransactions(mockTransactions);
      
      setStats({
        totalTransactions: mockTransactions.length,
        totalRevenue: '0.01',
        pendingCount: mockTransactions.filter(t => t.status === 'pending').length,
        completedCount: mockTransactions.filter(t => t.status === 'completed').length,
        failedCount: mockTransactions.filter(t => t.status === 'failed').length,
      });
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
    } finally {
      setLoading(false);
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center px-6">
        <div className="max-w-md w-full">
          <div className="bg-slate-800/40 border border-slate-700/40 rounded-xl p-8">
            <div className="text-center mb-8">
              <h1 className="text-3xl font-bold text-slate-100 mb-2">Merchant Dashboard</h1>
              <p className="text-slate-400">Sign in to access your dashboard</p>
            </div>

            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Username
                </label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full px-4 py-2 bg-slate-900/60 border border-slate-700/40 rounded-lg text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-2 bg-slate-900/60 border border-slate-700/40 rounded-lg text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  required
                />
              </div>

              {error && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
                  <p className="text-red-300 text-sm">{error}</p>
                </div>
              )}

              <button
                type="submit"
                className="w-full px-6 py-3 bg-cyan-500 hover:bg-cyan-600 text-white font-medium rounded-lg transition-colors"
              >
                Sign In
              </button>
            </form>

            <div className="mt-6 pt-6 border-t border-slate-700/40">
              <p className="text-slate-400 text-sm text-center">
                <Link href="https://demo.novacasino.xyz" className="text-cyan-400 hover:text-cyan-300">
                  View Demo Store
                </Link>
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <div className="border-b border-slate-700/40 bg-slate-900/60 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-slate-100">Merchant Dashboard</h1>
              <p className="text-slate-400 text-sm">X-402 Payment Facilitator</p>
            </div>
            <div className="flex items-center gap-4">
              <Link
                href="https://demo.novacasino.xyz"
                target="_blank"
                className="px-4 py-2 bg-slate-800/40 border border-slate-700/40 rounded-lg text-slate-300 hover:bg-slate-700/60 transition-colors text-sm"
              >
                View Store
              </Link>
              <button
                onClick={handleLogout}
                className="px-4 py-2 bg-red-500/10 border border-red-500/30 rounded-lg text-red-300 hover:bg-red-500/20 transition-colors text-sm"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8">
        {merchantInfo && (
          <div className="mb-8 bg-slate-800/40 border border-slate-700/40 rounded-xl p-6">
            <h2 className="text-lg font-bold text-slate-100 mb-4">Merchant Information</h2>
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <p className="text-slate-400 text-sm">Merchant Address</p>
                <p className="text-slate-100 font-mono text-sm">{merchantInfo.merchant_address}</p>
              </div>
              <div>
                <p className="text-slate-400 text-sm">Status</p>
                <p className="text-green-400 font-medium">
                  {merchantInfo.is_active ? 'Active' : 'Inactive'}
                </p>
              </div>
              <div>
                <p className="text-slate-400 text-sm">Created</p>
                <p className="text-slate-100 text-sm">
                  {new Date(merchantInfo.created_at).toLocaleDateString()}
                </p>
              </div>
              <div>
                <p className="text-slate-400 text-sm">API Endpoint</p>
                <p className="text-slate-100 font-mono text-sm break-all">
                  {process.env.NEXT_PUBLIC_FACILITATOR_URL}
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <div className="bg-slate-800/40 border border-slate-700/40 rounded-xl p-6">
            <p className="text-slate-400 text-sm mb-2">Total Transactions</p>
            <p className="text-3xl font-bold text-slate-100">{stats.totalTransactions}</p>
          </div>

          <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-6">
            <p className="text-green-300 text-sm mb-2">Completed</p>
            <p className="text-3xl font-bold text-green-400">{stats.completedCount}</p>
          </div>

          <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-6">
            <p className="text-amber-300 text-sm mb-2">Pending</p>
            <p className="text-3xl font-bold text-amber-400">{stats.pendingCount}</p>
          </div>

          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-6">
            <p className="text-red-300 text-sm mb-2">Failed</p>
            <p className="text-3xl font-bold text-red-400">{stats.failedCount}</p>
          </div>
        </div>

        <div className="bg-cyan-500/10 border border-cyan-500/30 rounded-xl p-6 mb-8">
          <p className="text-cyan-300 text-sm mb-2">Total Revenue</p>
          <p className="text-4xl font-bold text-cyan-400">{stats.totalRevenue} USDC</p>
        </div>

        <div className="bg-slate-800/40 border border-slate-700/40 rounded-xl p-6">
          <h2 className="text-lg font-bold text-slate-100 mb-4">Recent Transactions</h2>
          
          {loading ? (
            <div className="text-center py-8">
              <p className="text-slate-400">Loading transactions...</p>
            </div>
          ) : transactions.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-slate-400">No transactions yet</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b border-slate-700/40">
                  <tr className="text-left">
                    <th className="pb-3 text-slate-300 font-medium text-sm">Payer</th>
                    <th className="pb-3 text-slate-300 font-medium text-sm">Amount</th>
                    <th className="pb-3 text-slate-300 font-medium text-sm">Network</th>
                    <th className="pb-3 text-slate-300 font-medium text-sm">Status</th>
                    <th className="pb-3 text-slate-300 font-medium text-sm">Time</th>
                    <th className="pb-3 text-slate-300 font-medium text-sm">TX Hash</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((tx) => (
                    <tr key={tx.id} className="border-b border-slate-700/20">
                      <td className="py-4 text-slate-300 font-mono text-xs">
                        {tx.payer.substring(0, 10)}...{tx.payer.substring(38)}
                      </td>
                      <td className="py-4 text-slate-100 font-medium">{tx.amount}</td>
                      <td className="py-4 text-slate-300 text-sm">{tx.network}</td>
                      <td className="py-4">
                        <span className={`px-2 py-1 rounded text-xs font-medium ${
                          tx.status === 'completed' ? 'bg-green-500/20 text-green-400' :
                          tx.status === 'pending' ? 'bg-amber-500/20 text-amber-400' :
                          'bg-red-500/20 text-red-400'
                        }`}>
                          {tx.status}
                        </span>
                      </td>
                      <td className="py-4 text-slate-400 text-sm">
                        {new Date(tx.timestamp).toLocaleString()}
                      </td>
                      <td className="py-4">
                        {tx.transactionHash && (
                          <a
                            href={`https://sepolia.basescan.org/tx/${tx.transactionHash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-cyan-400 hover:text-cyan-300 text-xs font-mono"
                          >
                            View
                          </a>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
