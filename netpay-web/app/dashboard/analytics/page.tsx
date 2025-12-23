'use client';

import { useState, useEffect } from 'react';
import { Card, CardHeader, CardContent, Select } from '@/components/ui';
import { StatCard } from '@/components/ui/Stats';
import { DownloadIcon, TransactionsIcon, WalletIcon, RefreshIcon } from '@/components/icons';

interface DistributionItem {
  name: string;
  value: number;
  percentage: number;
  color: string;
}

interface DailyVolume {
  date: string;
  volume: number;
  count: number;
  successRate: number;
}

interface HourlyData {
  hour: number;
  count: number;
}

interface AnalyticsData {
  totalVolume: number;
  totalCount: number;
  avgTransaction: number;
  successRate: number;
  volumeByNetwork: DistributionItem[];
  volumeByAsset: DistributionItem[];
  dailyVolume: DailyVolume[];
  hourlyDistribution: HourlyData[];
}

const networkColors: Record<string, string> = {
  base: '#00ffff',
  'base-sepolia': '#22d3ee',
  ethereum: '#627EEA',
  'eth-sepolia': '#8b5cf6',
};

const assetColors: Record<string, string> = {
  USDC: '#2775CA',
  USDT: '#26A17B',
  ETH: '#627EEA',
};

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [period, setPeriod] = useState('30d');

  const fetchAnalytics = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/dashboard/analytics?period=${period}`);
      if (!res.ok) throw new Error('Failed to fetch');
      const analytics = await res.json();
      
      // Add colors to distributions
      analytics.volumeByNetwork = analytics.volumeByNetwork.map((item: DistributionItem) => ({
        ...item,
        color: networkColors[item.name.toLowerCase()] || '#6b7280',
      }));
      analytics.volumeByAsset = analytics.volumeByAsset.map((item: DistributionItem) => ({
        ...item,
        color: assetColors[item.name] || '#6b7280',
      }));
      
      setData(analytics);
    } catch (error) {
      console.error('Fetch error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();
  }, [period]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const maxVolume = data?.dailyVolume.reduce((max, day) => Math.max(max, day.volume), 0) || 1;
  const maxHourly = data?.hourlyDistribution.reduce((max, h) => Math.max(max, h.count), 0) || 1;
  const peakHour = data?.hourlyDistribution.reduce((peak, h) => h.count > peak.count ? h : peak, { hour: 0, count: 0 });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Analytics</h1>
          <p className="text-gray-400 mt-1">Your payment performance metrics</p>
        </div>
        <div className="flex items-center gap-3">
          <Select
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            options={[
              { value: '7d', label: 'Last 7 days' },
              { value: '30d', label: 'Last 30 days' },
              { value: '90d', label: 'Last 90 days' },
              { value: 'all', label: 'All time' },
            ]}
            className="w-36"
          />
          <button 
            onClick={fetchAnalytics}
            className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm text-gray-300 transition-colors"
          >
            <RefreshIcon className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm text-gray-300 transition-colors">
            <DownloadIcon className="w-4 h-4" />
            Export
          </button>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Volume"
          value={`$${data?.totalVolume.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'}`}
          icon={<WalletIcon className="w-5 h-5" />}
        />
        <StatCard
          title="Total Settlements"
          value={data?.totalCount.toLocaleString() || '0'}
          icon={<TransactionsIcon className="w-5 h-5" />}
        />
        <StatCard
          title="Avg. Transaction"
          value={`$${data?.avgTransaction.toFixed(2) || '0.00'}`}
        />
        <StatCard
          title="Success Rate"
          value={`${data?.successRate.toFixed(1) || '0'}%`}
        />
      </div>

      {/* Volume Chart */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-white">Settlement Volume</h3>
          </div>
        </CardHeader>
        <CardContent>
          {data?.dailyVolume && data.dailyVolume.length > 0 ? (
            <div className="h-64 flex items-end justify-between gap-2">
              {data.dailyVolume.map((day) => (
                <div key={day.date} className="flex-1 flex flex-col items-center gap-2">
                  <div 
                    className="w-full bg-cyan-400/20 rounded-t-lg hover:bg-cyan-400/30 transition-colors relative group"
                    style={{ height: `${(day.volume / maxVolume) * 100}%`, minHeight: day.volume > 0 ? '8px' : '0' }}
                  >
                    <div className="absolute -top-8 left-1/2 -translate-x-1/2 px-2 py-1 bg-gray-800 rounded text-xs text-white opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                      ${day.volume.toLocaleString()}
                    </div>
                  </div>
                  <span className="text-xs text-gray-500">{day.date}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="h-64 flex items-center justify-center text-gray-500">
              No volume data available
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Network Distribution */}
        <Card>
          <CardHeader>
            <h3 className="font-semibold text-white">Volume by Network</h3>
          </CardHeader>
          <CardContent>
            {data?.volumeByNetwork && data.volumeByNetwork.length > 0 ? (
              <div className="flex items-center gap-8">
                <div className="relative w-32 h-32">
                  <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                    {data.volumeByNetwork.map((item, i) => {
                      const offset = data.volumeByNetwork.slice(0, i).reduce((acc, d) => acc + d.percentage, 0);
                      return (
                        <circle
                          key={item.name}
                          cx="50"
                          cy="50"
                          r="40"
                          fill="none"
                          stroke={item.color}
                          strokeWidth="20"
                          strokeDasharray={`${item.percentage * 2.51} 251`}
                          strokeDashoffset={-offset * 2.51}
                        />
                      );
                    })}
                  </svg>
                </div>
                <div className="flex-1 space-y-3">
                  {data.volumeByNetwork.map((item) => (
                    <div key={item.name} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
                        <span className="text-sm text-gray-300 capitalize">{item.name}</span>
                      </div>
                      <span className="text-sm font-medium text-white">{item.percentage.toFixed(1)}%</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="h-32 flex items-center justify-center text-gray-500">
                No network data available
              </div>
            )}
          </CardContent>
        </Card>

        {/* Token Distribution */}
        <Card>
          <CardHeader>
            <h3 className="font-semibold text-white">Volume by Token</h3>
          </CardHeader>
          <CardContent>
            {data?.volumeByAsset && data.volumeByAsset.length > 0 ? (
              <div className="flex items-center gap-8">
                <div className="relative w-32 h-32">
                  <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                    {data.volumeByAsset.map((item, i) => {
                      const offset = data.volumeByAsset.slice(0, i).reduce((acc, d) => acc + d.percentage, 0);
                      return (
                        <circle
                          key={item.name}
                          cx="50"
                          cy="50"
                          r="40"
                          fill="none"
                          stroke={item.color}
                          strokeWidth="20"
                          strokeDasharray={`${item.percentage * 2.51} 251`}
                          strokeDashoffset={-offset * 2.51}
                        />
                      );
                    })}
                  </svg>
                </div>
                <div className="flex-1 space-y-3">
                  {data.volumeByAsset.map((item) => (
                    <div key={item.name} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
                        <span className="text-sm text-gray-300">{item.name}</span>
                      </div>
                      <span className="text-sm font-medium text-white">{item.percentage.toFixed(1)}%</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="h-32 flex items-center justify-center text-gray-500">
                No token data available
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Peak Usage Times */}
      <Card>
        <CardHeader>
          <h3 className="font-semibold text-white">Peak Usage Times (UTC)</h3>
        </CardHeader>
        <CardContent>
          {data?.hourlyDistribution && data.hourlyDistribution.length > 0 ? (
            <>
              <div className="h-40 flex items-end justify-between gap-2">
                {data.hourlyDistribution.map((hour) => (
                  <div key={hour.hour} className="flex-1 flex flex-col items-center gap-2">
                    <div 
                      className="w-full bg-cyan-400/20 rounded-t-lg hover:bg-cyan-400/30 transition-colors"
                      style={{ height: `${(hour.count / maxHourly) * 100}%`, minHeight: hour.count > 0 ? '4px' : '0' }}
                    />
                    <span className="text-xs text-gray-500">{hour.hour.toString().padStart(2, '0')}:00</span>
                  </div>
                ))}
              </div>
              {peakHour && peakHour.count > 0 && (
                <p className="text-xs text-gray-500 mt-4 text-center">
                  Your busiest time is around {peakHour.hour.toString().padStart(2, '0')}:00 UTC with {peakHour.count} settlements
                </p>
              )}
            </>
          ) : (
            <div className="h-40 flex items-center justify-center text-gray-500">
              No hourly data available
            </div>
          )}
        </CardContent>
      </Card>

      {/* Summary Table */}
      <Card>
        <CardHeader>
          <h3 className="font-semibold text-white">Daily Summary</h3>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-800">
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Date</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Settlements</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Volume</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Success Rate</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Avg. Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {data?.dailyVolume && data.dailyVolume.length > 0 ? (
                  data.dailyVolume.map((day) => (
                    <tr key={day.date} className="hover:bg-gray-800/30">
                      <td className="px-4 py-3 text-sm text-white">{day.date}</td>
                      <td className="px-4 py-3 text-sm text-gray-300">{day.count}</td>
                      <td className="px-4 py-3 text-sm text-gray-300">${day.volume.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                      <td className="px-4 py-3 text-sm text-green-400">{day.successRate.toFixed(1)}%</td>
                      <td className="px-4 py-3 text-sm text-gray-300">${day.count > 0 ? (day.volume / day.count).toFixed(2) : '0.00'}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                      No data available
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
