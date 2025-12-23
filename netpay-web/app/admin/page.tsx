'use client';

import { StatCard, Card, CardHeader, CardContent } from '@/components/ui';
import { StatusBadge } from '@/components/ui/Badge';
import {
  UsersIcon,
  TransactionsIcon,
  WalletIcon,
  AnalyticsIcon,
  RefreshIcon,
} from '@/components/icons';

// Mock data - replace with actual API calls
const mockStats = {
  totalMerchants: 156,
  activeMerchants: 142,
  pendingMerchants: 8,
  suspendedMerchants: 6,
  totalSettlements24h: 1247,
  totalSettlements7d: 8934,
  totalVolume24h: 45230.50,
  totalVolume7d: 312450.75,
  totalCreditsSold: 1250000,
  successRate24h: 98.7,
};

const recentSettlements = [
  { id: 's_001', merchant: 'Acme Corp', amount: 25.00, network: 'Base', status: 'confirmed' as const, time: '2 min ago' },
  { id: 's_002', merchant: 'TechStart', amount: 150.00, network: 'Base', status: 'pending' as const, time: '5 min ago' },
  { id: 's_003', merchant: 'DataFlow', amount: 75.50, network: 'Ethereum', status: 'confirmed' as const, time: '8 min ago' },
  { id: 's_004', merchant: 'AITools', amount: 12.00, network: 'Base', status: 'failed' as const, time: '12 min ago' },
  { id: 's_005', merchant: 'CloudAPI', amount: 200.00, network: 'Base', status: 'confirmed' as const, time: '15 min ago' },
];

const lowBalancePaymasters = [
  { address: '0x1234...5678', balance: 0.05, network: 'Base' },
  { address: '0xabcd...efgh', balance: 0.12, network: 'Ethereum' },
];

export default function AdminDashboard() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Admin Dashboard</h1>
          <p className="text-gray-400 mt-1">Overview of the X402 protocol system</p>
        </div>
        <button className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm text-gray-300 transition-colors">
          <RefreshIcon className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {/* Main Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Merchants"
          value={mockStats.totalMerchants}
          icon={<UsersIcon className="w-5 h-5" />}
          subtitle={`${mockStats.activeMerchants} active`}
          change={{ value: 12, type: 'increase' }}
        />
        <StatCard
          title="Settlements (24h)"
          value={mockStats.totalSettlements24h.toLocaleString()}
          icon={<TransactionsIcon className="w-5 h-5" />}
          subtitle={`${mockStats.successRate24h}% success rate`}
          change={{ value: 8, type: 'increase' }}
        />
        <StatCard
          title="Volume (24h)"
          value={`$${mockStats.totalVolume24h.toLocaleString()}`}
          icon={<WalletIcon className="w-5 h-5" />}
          change={{ value: 15, type: 'increase' }}
        />
        <StatCard
          title="Credits Sold"
          value={mockStats.totalCreditsSold.toLocaleString()}
          icon={<AnalyticsIcon className="w-5 h-5" />}
          change={{ value: 5, type: 'increase' }}
        />
      </div>

      {/* Secondary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-400">Active Merchants</p>
                <p className="text-2xl font-bold text-green-400">{mockStats.activeMerchants}</p>
              </div>
              <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center">
                <span className="text-2xl">✓</span>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-400">Pending Approval</p>
                <p className="text-2xl font-bold text-yellow-400">{mockStats.pendingMerchants}</p>
              </div>
              <div className="w-16 h-16 rounded-full bg-yellow-500/10 flex items-center justify-center">
                <span className="text-2xl">⏳</span>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-400">Suspended</p>
                <p className="text-2xl font-bold text-red-400">{mockStats.suspendedMerchants}</p>
              </div>
              <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center">
                <span className="text-2xl">⚠</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Settlements */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-white">Recent Settlements</h3>
                <a href="/admin/settlements" className="text-sm text-cyan-400 hover:text-cyan-300">
                  View all →
                </a>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-gray-800">
                {recentSettlements.map((settlement) => (
                  <div key={settlement.id} className="px-4 py-3 flex items-center justify-between hover:bg-gray-800/30">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-lg bg-gray-800 flex items-center justify-center">
                        <TransactionsIcon className="w-5 h-5 text-gray-400" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-white">{settlement.merchant}</p>
                        <p className="text-xs text-gray-500">{settlement.id} • {settlement.network}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <p className="text-sm font-medium text-white">${settlement.amount.toFixed(2)}</p>
                      <StatusBadge status={settlement.status} />
                      <p className="text-xs text-gray-500 w-20 text-right">{settlement.time}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Alerts Panel */}
        <div className="space-y-4">
          {/* Low Balance Paymasters */}
          <Card>
            <CardHeader>
              <h3 className="font-semibold text-white flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse"></span>
                Low Balance Alerts
              </h3>
            </CardHeader>
            <CardContent className="space-y-3">
              {lowBalancePaymasters.length > 0 ? (
                lowBalancePaymasters.map((pm) => (
                  <div key={pm.address} className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-300 font-mono">{pm.address}</span>
                      <span className="text-xs text-gray-500">{pm.network}</span>
                    </div>
                    <p className="text-lg font-bold text-red-400 mt-1">{pm.balance} ETH</p>
                  </div>
                ))
              ) : (
                <p className="text-sm text-gray-500">No alerts</p>
              )}
              <a href="/admin/paymasters" className="block text-sm text-cyan-400 hover:text-cyan-300 text-center mt-2">
                Manage Paymasters →
              </a>
            </CardContent>
          </Card>

          {/* Quick Actions */}
          <Card>
            <CardHeader>
              <h3 className="font-semibold text-white">Quick Actions</h3>
            </CardHeader>
            <CardContent className="space-y-2">
              <button className="w-full px-4 py-2 text-sm text-left bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors">
                Add New Paymaster
              </button>
              <button className="w-full px-4 py-2 text-sm text-left bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors">
                Rebalance Wallets
              </button>
              <button className="w-full px-4 py-2 text-sm text-left bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors">
                Export Reports
              </button>
              <button className="w-full px-4 py-2 text-sm text-left bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors">
                View System Logs
              </button>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* System Health */}
      <Card>
        <CardHeader>
          <h3 className="font-semibold text-white">System Health</h3>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-3 bg-gray-800/50 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <span className="w-2 h-2 rounded-full bg-green-400"></span>
                <span className="text-sm text-gray-400">API Server</span>
              </div>
              <p className="text-lg font-semibold text-green-400">Healthy</p>
              <p className="text-xs text-gray-500">Latency: 12ms</p>
            </div>
            <div className="p-3 bg-gray-800/50 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <span className="w-2 h-2 rounded-full bg-green-400"></span>
                <span className="text-sm text-gray-400">Database</span>
              </div>
              <p className="text-lg font-semibold text-green-400">Healthy</p>
              <p className="text-xs text-gray-500">Connections: 24/100</p>
            </div>
            <div className="p-3 bg-gray-800/50 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <span className="w-2 h-2 rounded-full bg-green-400"></span>
                <span className="text-sm text-gray-400">Redis</span>
              </div>
              <p className="text-lg font-semibold text-green-400">Healthy</p>
              <p className="text-xs text-gray-500">Memory: 45%</p>
            </div>
            <div className="p-3 bg-gray-800/50 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <span className="w-2 h-2 rounded-full bg-yellow-400"></span>
                <span className="text-sm text-gray-400">RPC Providers</span>
              </div>
              <p className="text-lg font-semibold text-yellow-400">Degraded</p>
              <p className="text-xs text-gray-500">1 of 3 slow</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
