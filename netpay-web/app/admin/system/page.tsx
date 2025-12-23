'use client';

import { Card, CardHeader, CardContent, Button } from '@/components/ui';
import { ProgressBar } from '@/components/ui/Stats';
import { RefreshIcon, CheckIcon, WarningIcon } from '@/components/icons';

// Mock system data
const systemStatus = {
  api: { status: 'healthy', latency: 12, uptime: 99.99 },
  database: { status: 'healthy', connections: 24, maxConnections: 100, queryTime: 2.3 },
  redis: { status: 'healthy', memory: 45, maxMemory: 100, hitRate: 98.5 },
  rpcProviders: [
    { name: 'Alchemy', network: 'base', status: 'healthy', latency: 45 },
    { name: 'QuickNode', network: 'base', status: 'degraded', latency: 250 },
    { name: 'Infura', network: 'ethereum', status: 'healthy', latency: 78 },
  ],
};

const serverResources = {
  cpu: { usage: 32, cores: 8 },
  memory: { used: 6.2, total: 16 },
  disk: { used: 45, total: 200 },
  network: { inbound: 125, outbound: 340 },
};

const recentErrors = [
  { time: '2024-12-22 08:15:32', level: 'error', message: 'RPC timeout on QuickNode Base', count: 3 },
  { time: '2024-12-22 07:45:10', level: 'warn', message: 'High latency detected on settlement batch', count: 1 },
  { time: '2024-12-22 06:30:00', level: 'error', message: 'Failed to fetch gas price', count: 2 },
];

export default function SystemPage() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">System Monitor</h1>
          <p className="text-gray-400 mt-1">Server health and performance metrics</p>
        </div>
        <Button variant="ghost" size="sm" icon={<RefreshIcon className="w-4 h-4" />}>
          Refresh
        </Button>
      </div>

      {/* Service Status */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* API Server */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-white">API Server</h3>
              <span className="flex items-center gap-1 text-xs text-green-400">
                <CheckIcon className="w-4 h-4" />
                Healthy
              </span>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Latency</span>
              <span className="text-white">{systemStatus.api.latency}ms</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Uptime</span>
              <span className="text-white">{systemStatus.api.uptime}%</span>
            </div>
          </CardContent>
        </Card>

        {/* Database */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-white">Database</h3>
              <span className="flex items-center gap-1 text-xs text-green-400">
                <CheckIcon className="w-4 h-4" />
                Healthy
              </span>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-gray-400">Connections</span>
                <span className="text-white">{systemStatus.database.connections}/{systemStatus.database.maxConnections}</span>
              </div>
              <ProgressBar 
                value={systemStatus.database.connections} 
                max={systemStatus.database.maxConnections} 
                showPercentage={false}
                color="cyan"
              />
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Avg Query Time</span>
              <span className="text-white">{systemStatus.database.queryTime}ms</span>
            </div>
          </CardContent>
        </Card>

        {/* Redis */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-white">Redis Cache</h3>
              <span className="flex items-center gap-1 text-xs text-green-400">
                <CheckIcon className="w-4 h-4" />
                Healthy
              </span>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-gray-400">Memory Usage</span>
                <span className="text-white">{systemStatus.redis.memory}%</span>
              </div>
              <ProgressBar 
                value={systemStatus.redis.memory} 
                max={100} 
                showPercentage={false}
                color="cyan"
              />
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Hit Rate</span>
              <span className="text-white">{systemStatus.redis.hitRate}%</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* RPC Providers */}
      <Card>
        <CardHeader>
          <h3 className="font-semibold text-white">RPC Providers</h3>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {systemStatus.rpcProviders.map((provider) => (
              <div 
                key={provider.name} 
                className={`p-4 rounded-lg border ${
                  provider.status === 'healthy' 
                    ? 'bg-green-500/5 border-green-500/20' 
                    : 'bg-yellow-500/5 border-yellow-500/20'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium text-white">{provider.name}</span>
                  <span className={`flex items-center gap-1 text-xs ${
                    provider.status === 'healthy' ? 'text-green-400' : 'text-yellow-400'
                  }`}>
                    {provider.status === 'healthy' ? (
                      <CheckIcon className="w-3 h-3" />
                    ) : (
                      <WarningIcon className="w-3 h-3" />
                    )}
                    {provider.status}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Network</span>
                  <span className="text-gray-300 capitalize">{provider.network}</span>
                </div>
                <div className="flex justify-between text-sm mt-1">
                  <span className="text-gray-400">Latency</span>
                  <span className={`${provider.latency > 200 ? 'text-yellow-400' : 'text-gray-300'}`}>
                    {provider.latency}ms
                  </span>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Server Resources */}
      <Card>
        <CardHeader>
          <h3 className="font-semibold text-white">Server Resources</h3>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {/* CPU */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-400">CPU Usage</span>
                <span className="text-sm text-white">{serverResources.cpu.usage}%</span>
              </div>
              <ProgressBar 
                value={serverResources.cpu.usage} 
                max={100} 
                showPercentage={false}
                color={serverResources.cpu.usage > 80 ? 'red' : serverResources.cpu.usage > 60 ? 'yellow' : 'cyan'}
              />
              <p className="text-xs text-gray-500 mt-1">{serverResources.cpu.cores} cores</p>
            </div>

            {/* Memory */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-400">Memory</span>
                <span className="text-sm text-white">{serverResources.memory.used}GB / {serverResources.memory.total}GB</span>
              </div>
              <ProgressBar 
                value={serverResources.memory.used} 
                max={serverResources.memory.total} 
                showPercentage={false}
                color={serverResources.memory.used / serverResources.memory.total > 0.8 ? 'red' : 'cyan'}
              />
              <p className="text-xs text-gray-500 mt-1">{((serverResources.memory.used / serverResources.memory.total) * 100).toFixed(0)}% used</p>
            </div>

            {/* Disk */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-400">Disk</span>
                <span className="text-sm text-white">{serverResources.disk.used}GB / {serverResources.disk.total}GB</span>
              </div>
              <ProgressBar 
                value={serverResources.disk.used} 
                max={serverResources.disk.total} 
                showPercentage={false}
                color="cyan"
              />
              <p className="text-xs text-gray-500 mt-1">{((serverResources.disk.used / serverResources.disk.total) * 100).toFixed(0)}% used</p>
            </div>

            {/* Network */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-400">Network I/O</span>
              </div>
              <div className="flex gap-4">
                <div>
                  <p className="text-xs text-gray-500">In</p>
                  <p className="text-sm text-white">{serverResources.network.inbound} MB/s</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Out</p>
                  <p className="text-sm text-white">{serverResources.network.outbound} MB/s</p>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Recent Errors */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-white">Recent Errors</h3>
            <a href="/admin/logs" className="text-sm text-cyan-400 hover:text-cyan-300">
              View all logs →
            </a>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y divide-gray-800">
            {recentErrors.length > 0 ? (
              recentErrors.map((error, i) => (
                <div key={i} className="px-4 py-3 flex items-start gap-3">
                  <span className={`px-2 py-0.5 text-xs rounded ${
                    error.level === 'error' 
                      ? 'bg-red-500/20 text-red-400' 
                      : 'bg-yellow-500/20 text-yellow-400'
                  }`}>
                    {error.level}
                  </span>
                  <div className="flex-1">
                    <p className="text-sm text-white">{error.message}</p>
                    <p className="text-xs text-gray-500 mt-1">{error.time}</p>
                  </div>
                  {error.count > 1 && (
                    <span className="px-2 py-0.5 text-xs bg-gray-800 text-gray-400 rounded">
                      ×{error.count}
                    </span>
                  )}
                </div>
              ))
            ) : (
              <div className="px-4 py-8 text-center text-gray-500">
                No recent errors
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
