'use client';

import { useState } from 'react';
import { Card, CardHeader, CardContent, Button, Input, Select, Textarea } from '@/components/ui';
import { Modal } from '@/components/ui/Modal';

export default function SettingsPage() {
  const [showAddAdminModal, setShowAddAdminModal] = useState(false);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Settings</h1>
        <p className="text-gray-400 mt-1">Configure system settings and preferences</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Credit Pricing */}
        <Card>
          <CardHeader>
            <h3 className="font-semibold text-white">Credit Pricing</h3>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div className="font-medium text-gray-400">Credits Range</div>
              <div className="font-medium text-gray-400">Price per Credit</div>
              <div className="font-medium text-gray-400">Bonus %</div>
            </div>
            {[
              { range: '1 - 100', price: '$0.01', bonus: '0%' },
              { range: '101 - 1,000', price: '$0.009', bonus: '10%' },
              { range: '1,001 - 10,000', price: '$0.008', bonus: '20%' },
              { range: '10,001+', price: '$0.007', bonus: '30%' },
            ].map((tier, i) => (
              <div key={i} className="grid grid-cols-3 gap-4 text-sm py-2 border-b border-gray-800">
                <div className="text-gray-300">{tier.range}</div>
                <div className="text-white">{tier.price}</div>
                <div className="text-cyan-400">{tier.bonus}</div>
              </div>
            ))}
            <Button variant="outline" size="sm" className="mt-4">
              Edit Pricing
            </Button>
          </CardContent>
        </Card>

        {/* Rate Limits */}
        <Card>
          <CardHeader>
            <h3 className="font-semibold text-white">Rate Limits</h3>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div className="font-medium text-gray-400">Endpoint</div>
              <div className="font-medium text-gray-400">Limit</div>
              <div className="font-medium text-gray-400">Cost</div>
            </div>
            {[
              { endpoint: 'GET /health', limit: '1000/min', cost: 'Free' },
              { endpoint: 'GET /networks', limit: '100/min', cost: 'Free' },
              { endpoint: 'POST /verify', limit: '10000/min', cost: 'Free' },
              { endpoint: 'POST /settle', limit: 'Unlimited', cost: '1 credit' },
            ].map((rate, i) => (
              <div key={i} className="grid grid-cols-3 gap-4 text-sm py-2 border-b border-gray-800">
                <div className="text-gray-300 font-mono text-xs">{rate.endpoint}</div>
                <div className="text-white">{rate.limit}</div>
                <div className="text-cyan-400">{rate.cost}</div>
              </div>
            ))}
            <Button variant="outline" size="sm" className="mt-4">
              Edit Limits
            </Button>
          </CardContent>
        </Card>

        {/* Supported Networks */}
        <Card>
          <CardHeader>
            <h3 className="font-semibold text-white">Supported Networks</h3>
          </CardHeader>
          <CardContent className="space-y-4">
            {[
              { name: 'Base', chainId: 8453, status: 'active', tokens: ['USDC', 'USDT'] },
              { name: 'Ethereum', chainId: 1, status: 'active', tokens: ['USDC', 'USDT', 'DAI'] },
              { name: 'Arbitrum', chainId: 42161, status: 'coming_soon', tokens: [] },
            ].map((network, i) => (
              <div key={i} className="flex items-center justify-between p-3 bg-gray-800/50 rounded-lg">
                <div>
                  <p className="font-medium text-white">{network.name}</p>
                  <p className="text-xs text-gray-500">Chain ID: {network.chainId}</p>
                </div>
                <div className="flex items-center gap-3">
                  {network.tokens.length > 0 && (
                    <div className="flex gap-1">
                      {network.tokens.map(token => (
                        <span key={token} className="px-2 py-0.5 text-xs bg-gray-700 rounded">{token}</span>
                      ))}
                    </div>
                  )}
                  <span className={`px-2 py-1 text-xs rounded ${
                    network.status === 'active' 
                      ? 'bg-green-500/20 text-green-400' 
                      : 'bg-yellow-500/20 text-yellow-400'
                  }`}>
                    {network.status === 'active' ? 'Active' : 'Coming Soon'}
                  </span>
                </div>
              </div>
            ))}
            <Button variant="outline" size="sm">
              Add Network
            </Button>
          </CardContent>
        </Card>

        {/* Webhook Configuration */}
        <Card>
          <CardHeader>
            <h3 className="font-semibold text-white">Default Webhook Events</h3>
          </CardHeader>
          <CardContent className="space-y-3">
            {[
              { event: 'settlement.submitted', description: 'When a settlement is submitted', enabled: true },
              { event: 'settlement.confirmed', description: 'When a settlement is confirmed', enabled: true },
              { event: 'settlement.failed', description: 'When a settlement fails', enabled: true },
              { event: 'credit.low', description: 'When credit balance is low', enabled: true },
              { event: 'credit.purchased', description: 'When credits are purchased', enabled: false },
            ].map((webhook, i) => (
              <div key={i} className="flex items-center justify-between p-3 bg-gray-800/50 rounded-lg">
                <div>
                  <p className="font-medium text-white font-mono text-sm">{webhook.event}</p>
                  <p className="text-xs text-gray-500">{webhook.description}</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" defaultChecked={webhook.enabled} className="sr-only peer" />
                  <div className="w-9 h-5 bg-gray-700 rounded-full peer peer-checked:bg-cyan-400 after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-full" />
                </label>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Admin Users */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-white">Admin Users</h3>
              <Button size="sm" onClick={() => setShowAddAdminModal(true)}>
                Add Admin
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {[
              { username: 'superadmin@x402.io', role: 'super_admin', lastLogin: '2024-12-22 08:00', twoFa: true },
              { username: 'admin@x402.io', role: 'admin', lastLogin: '2024-12-22 07:45', twoFa: true },
              { username: 'viewer@x402.io', role: 'viewer', lastLogin: '2024-12-20 14:30', twoFa: false },
            ].map((admin, i) => (
              <div key={i} className="flex items-center justify-between p-3 bg-gray-800/50 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center">
                    <span className="text-sm font-medium text-gray-300">
                      {admin.username.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <p className="font-medium text-white">{admin.username}</p>
                    <p className="text-xs text-gray-500">Last login: {admin.lastLogin}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-1 text-xs rounded ${
                    admin.role === 'super_admin' 
                      ? 'bg-purple-500/20 text-purple-400' 
                      : admin.role === 'admin'
                      ? 'bg-cyan-500/20 text-cyan-400'
                      : 'bg-gray-500/20 text-gray-400'
                  }`}>
                    {admin.role.replace('_', ' ')}
                  </span>
                  {admin.twoFa && (
                    <span className="px-2 py-1 text-xs bg-green-500/20 text-green-400 rounded">
                      2FA
                    </span>
                  )}
                  <button className="px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 rounded transition-colors">
                    Edit
                  </button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* System Configuration */}
        <Card>
          <CardHeader>
            <h3 className="font-semibold text-white">System Configuration</h3>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input
              label="Credit Deposit Address"
              value="0x742d35Cc6634C0532925a3b844Bc9e7595f..."
              disabled
              hint="USDC deposits to this address will be converted to credits"
            />
            <Input
              label="Low Credit Alert Threshold"
              type="number"
              defaultValue={100}
              hint="Send alerts when merchant credits fall below this value"
            />
            <Input
              label="Default Paymaster Gas Buffer"
              type="number"
              defaultValue={1.2}
              step={0.1}
              hint="Multiplier for estimated gas to ensure transactions succeed"
            />
            <div className="pt-4">
              <Button>Save Changes</Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Add Admin Modal */}
      <Modal
        isOpen={showAddAdminModal}
        onClose={() => setShowAddAdminModal(false)}
        title="Add Admin User"
        footer={
          <>
            <Button variant="ghost" onClick={() => setShowAddAdminModal(false)}>Cancel</Button>
            <Button>Create Admin</Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input label="Email/Username" placeholder="admin@example.com" type="email" />
          <Input label="Password" placeholder="••••••••" type="password" />
          <Input label="Confirm Password" placeholder="••••••••" type="password" />
          <Select
            label="Role"
            options={[
              { value: 'viewer', label: 'Viewer - Read-only access' },
              { value: 'admin', label: 'Admin - Manage merchants and settlements' },
              { value: 'super_admin', label: 'Super Admin - Full access' },
            ]}
          />
          <div className="flex items-center gap-2 p-3 bg-gray-800/50 rounded-lg">
            <input type="checkbox" id="require2fa" className="rounded" />
            <label htmlFor="require2fa" className="text-sm text-gray-300">
              Require 2FA setup on first login
            </label>
          </div>
        </div>
      </Modal>
    </div>
  );
}
