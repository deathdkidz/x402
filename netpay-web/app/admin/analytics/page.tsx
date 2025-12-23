'use client';

import { Card, CardHeader, CardContent, Button, Select } from '@/components/ui';
import { StatCard } from '@/components/ui/Stats';
import { DownloadIcon, RefreshIcon, TransactionsIcon, UsersIcon, WalletIcon } from '@/components/icons';

// Mock chart data
const volumeChartData = [
  { date: '12/16', volume: 32450 },
  { date: '12/17', volume: 28900 },
  { date: '12/18', volume: 45230 },
  { date: '12/19', volume: 51200 },
  { date: '12/20', volume: 38750 },
  { date: '12/21', volume: 42100 },
  { date: '12/22', volume: 45230 },
];

const networkDistribution = [
  { name: 'Base', value: 78, color: '#00ffff' },
  { name: 'Ethereum', value: 22, color: '#627EEA' },
];

const tokenDistribution = [
  { name: 'USDC', value: 85, color: '#2775CA' },
  { name: 'USDT', value: 15, color: '#26A17B' },
];

const topMerchants = [
  { name: 'Acme Corporation', volume: 125430, settlements: 2340, change: 12 },
  { name: 'TechStart Inc', volume: 98200, settlements: 1890, change: 8 },
  { name: 'DataFlow Systems', volume: 76500, settlements: 1450, change: -3 },
  { name: 'AITools Pro', volume: 54300, settlements: 980, change: 15 },
  { name: 'CloudAPI Services', volume: 43200, settlements: 760, change: 5 },
];

export default function AnalyticsPage() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Analytics</h1>
          <p className="text-gray-400 mt-1">Platform performance and metrics</p>
        </div>
        <div className="flex items-center gap-3">
          <Select
            options={[
              { value: '7d', label: 'Last 7 days' },
              { value: '30d', label: 'Last 30 days' },
              { value: '90d', label: 'Last 90 days' },
              { value: 'all', label: 'All time' },
            ]}
            className="w-36"
          />
          <Button variant="ghost" size="sm" icon={<RefreshIcon className="w-4 h-4" />}>
            Refresh
          </Button>
          <Button variant="outline" size="sm" icon={<DownloadIcon className="w-4 h-4" />}>
            Export
          </Button>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Volume"
          value="$284,860"
          icon={<WalletIcon className="w-5 h-5" />}
          change={{ value: 18, type: 'increase' }}
        />
        <StatCard
          title="Total Settlements"
          value="12,450"
          icon={<TransactionsIcon className="w-5 h-5" />}
          change={{ value: 12, type: 'increase' }}
        />
        <StatCard
          title="Active Merchants"
          value="142"
          icon={<UsersIcon className="w-5 h-5" />}
          change={{ value: 5, type: 'increase' }}
        />
        <StatCard
          title="Success Rate"
          value="98.7%"
          change={{ value: 0.5, type: 'increase' }}
        />
      </div>

      {/* Volume Chart */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-white">Settlement Volume</h3>
            <div className="flex gap-2">
              <button className="px-3 py-1 text-xs bg-cyan-400/20 text-cyan-400 rounded-lg">Daily</button>
              <button className="px-3 py-1 text-xs bg-gray-800 text-gray-400 hover:bg-gray-700 rounded-lg">Weekly</button>
              <button className="px-3 py-1 text-xs bg-gray-800 text-gray-400 hover:bg-gray-700 rounded-lg">Monthly</button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="h-64 flex items-end justify-between gap-2">
            {volumeChartData.map((day, i) => (
              <div key={day.date} className="flex-1 flex flex-col items-center gap-2">
                <div 
                  className="w-full bg-cyan-400/20 rounded-t-lg hover:bg-cyan-400/30 transition-colors relative group"
                  style={{ height: `${(day.volume / 60000) * 100}%` }}
                >
                  <div className="absolute -top-8 left-1/2 -translate-x-1/2 px-2 py-1 bg-gray-800 rounded text-xs text-white opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                    ${day.volume.toLocaleString()}
                  </div>
                </div>
                <span className="text-xs text-gray-500">{day.date}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Network Distribution */}
        <Card>
          <CardHeader>
            <h3 className="font-semibold text-white">Volume by Network</h3>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-8">
              {/* Simple pie chart visualization */}
              <div className="relative w-32 h-32">
                <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                  {networkDistribution.map((item, i) => {
                    const offset = networkDistribution.slice(0, i).reduce((acc, d) => acc + d.value, 0);
                    return (
                      <circle
                        key={item.name}
                        cx="50"
                        cy="50"
                        r="40"
                        fill="none"
                        stroke={item.color}
                        strokeWidth="20"
                        strokeDasharray={`${item.value * 2.51} 251`}
                        strokeDashoffset={-offset * 2.51}
                      />
                    );
                  })}
                </svg>
              </div>
              <div className="flex-1 space-y-3">
                {networkDistribution.map((item) => (
                  <div key={item.name} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
                      <span className="text-sm text-gray-300">{item.name}</span>
                    </div>
                    <span className="text-sm font-medium text-white">{item.value}%</span>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Token Distribution */}
        <Card>
          <CardHeader>
            <h3 className="font-semibold text-white">Volume by Token</h3>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-8">
              {/* Simple pie chart visualization */}
              <div className="relative w-32 h-32">
                <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                  {tokenDistribution.map((item, i) => {
                    const offset = tokenDistribution.slice(0, i).reduce((acc, d) => acc + d.value, 0);
                    return (
                      <circle
                        key={item.name}
                        cx="50"
                        cy="50"
                        r="40"
                        fill="none"
                        stroke={item.color}
                        strokeWidth="20"
                        strokeDasharray={`${item.value * 2.51} 251`}
                        strokeDashoffset={-offset * 2.51}
                      />
                    );
                  })}
                </svg>
              </div>
              <div className="flex-1 space-y-3">
                {tokenDistribution.map((item) => (
                  <div key={item.name} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
                      <span className="text-sm text-gray-300">{item.name}</span>
                    </div>
                    <span className="text-sm font-medium text-white">{item.value}%</span>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Top Merchants */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-white">Top Merchants by Volume</h3>
            <a href="/admin/merchants" className="text-sm text-cyan-400 hover:text-cyan-300">
              View all →
            </a>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y divide-gray-800">
            {topMerchants.map((merchant, i) => (
              <div key={merchant.name} className="px-4 py-3 flex items-center justify-between hover:bg-gray-800/30">
                <div className="flex items-center gap-4">
                  <span className="w-6 text-center text-sm font-medium text-gray-500">{i + 1}</span>
                  <div>
                    <p className="font-medium text-white">{merchant.name}</p>
                    <p className="text-xs text-gray-500">{merchant.settlements.toLocaleString()} settlements</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <p className="text-lg font-semibold text-white">${merchant.volume.toLocaleString()}</p>
                  <span className={`text-sm ${merchant.change >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {merchant.change >= 0 ? '↑' : '↓'} {Math.abs(merchant.change)}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Revenue Breakdown */}
      <Card>
        <CardHeader>
          <h3 className="font-semibold text-white">Revenue Breakdown</h3>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            <div className="p-4 bg-gray-800/50 rounded-lg">
              <p className="text-sm text-gray-400 mb-1">Credit Sales</p>
              <p className="text-2xl font-bold text-cyan-400">$12,500</p>
              <p className="text-xs text-gray-500 mt-1">1,250,000 credits sold</p>
            </div>
            <div className="p-4 bg-gray-800/50 rounded-lg">
              <p className="text-sm text-gray-400 mb-1">Settlement Fees</p>
              <p className="text-2xl font-bold text-green-400">$8,940</p>
              <p className="text-xs text-gray-500 mt-1">8,940 settlements processed</p>
            </div>
            <div className="p-4 bg-gray-800/50 rounded-lg">
              <p className="text-sm text-gray-400 mb-1">Gas Costs</p>
              <p className="text-2xl font-bold text-red-400">-$2,340</p>
              <p className="text-xs text-gray-500 mt-1">0.78 ETH @ $3000/ETH</p>
            </div>
          </div>
          <div className="mt-4 p-4 bg-gradient-to-r from-cyan-900/30 to-green-900/30 border border-cyan-500/20 rounded-lg">
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-300">Net Revenue (Period)</p>
              <p className="text-3xl font-bold text-white">$19,100</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
