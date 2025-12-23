'use client';

import { useState } from 'react';
import { Card, CardHeader, CardContent, Button, Input, Modal } from '@/components/ui';
import { Table } from '@/components/ui/Table';
import { ProgressBar } from '@/components/ui/Stats';
import { PlusIcon, RefreshIcon, ServerIcon, WarningIcon } from '@/components/icons';
import type { Paymaster } from '@/types';

// Mock data
const mockPaymasters: Paymaster[] = [
  {
    id: 1,
    address: '0x1234567890abcdef1234567890abcdef12345678',
    name: 'Primary Base',
    networks: ['base'],
    lastKnownBalance: 0.85,
    lastBalanceCheck: '2024-12-22T08:00:00Z',
    lowBalanceThreshold: 0.5,
    totalTransactions: 15234,
    totalGasSpent: 2.45,
    isActive: true,
    priority: 10,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-12-22T08:00:00Z',
  },
  {
    id: 2,
    address: '0xabcdef1234567890abcdef1234567890abcdef12',
    name: 'Secondary Base',
    networks: ['base'],
    lastKnownBalance: 1.25,
    lastBalanceCheck: '2024-12-22T08:00:00Z',
    lowBalanceThreshold: 0.5,
    totalTransactions: 8945,
    totalGasSpent: 1.32,
    isActive: true,
    priority: 5,
    createdAt: '2024-03-15T00:00:00Z',
    updatedAt: '2024-12-22T08:00:00Z',
  },
  {
    id: 3,
    address: '0x9876543210fedcba9876543210fedcba98765432',
    name: 'Primary Ethereum',
    networks: ['ethereum'],
    lastKnownBalance: 0.15,
    lastBalanceCheck: '2024-12-22T08:00:00Z',
    lowBalanceThreshold: 0.3,
    totalTransactions: 2345,
    totalGasSpent: 0.89,
    isActive: true,
    priority: 10,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-12-22T08:00:00Z',
  },
  {
    id: 4,
    address: '0xfedcba0987654321fedcba0987654321fedcba09',
    name: 'Backup Ethereum',
    networks: ['ethereum'],
    lastKnownBalance: 0.05,
    lastBalanceCheck: '2024-12-22T08:00:00Z',
    lowBalanceThreshold: 0.1,
    totalTransactions: 567,
    totalGasSpent: 0.23,
    isActive: false,
    priority: 1,
    createdAt: '2024-06-01T00:00:00Z',
    updatedAt: '2024-12-22T08:00:00Z',
  },
];

export default function PaymastersPage() {
  const [showAddModal, setShowAddModal] = useState(false);
  const [showRebalanceModal, setShowRebalanceModal] = useState(false);

  const lowBalancePaymasters = mockPaymasters.filter(
    (pm) => pm.lastKnownBalance !== undefined && 
           pm.lowBalanceThreshold !== undefined && 
           pm.lastKnownBalance < pm.lowBalanceThreshold
  );

  const totalBalance = mockPaymasters.reduce((acc, pm) => acc + (pm.lastKnownBalance || 0), 0);
  const totalTransactions = mockPaymasters.reduce((acc, pm) => acc + pm.totalTransactions, 0);
  const totalGasSpent = mockPaymasters.reduce((acc, pm) => acc + pm.totalGasSpent, 0);

  const columns = [
    {
      key: 'name',
      header: 'Paymaster',
      render: (pm: Paymaster) => (
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
            pm.isActive ? 'bg-cyan-400/10' : 'bg-gray-800'
          }`}>
            <ServerIcon className={`w-5 h-5 ${pm.isActive ? 'text-cyan-400' : 'text-gray-500'}`} />
          </div>
          <div>
            <p className="font-medium text-white">{pm.name || 'Unnamed'}</p>
            <p className="text-xs text-gray-500 font-mono">{pm.address.slice(0, 10)}...{pm.address.slice(-8)}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'networks',
      header: 'Networks',
      render: (pm: Paymaster) => (
        <div className="flex gap-1">
          {pm.networks.map((network) => (
            <span key={network} className="px-2 py-1 text-xs bg-gray-800 rounded-full capitalize">
              {network}
            </span>
          ))}
        </div>
      ),
    },
    {
      key: 'balance',
      header: 'Balance',
      render: (pm: Paymaster) => {
        const isLow = pm.lastKnownBalance !== undefined && 
                      pm.lowBalanceThreshold !== undefined && 
                      pm.lastKnownBalance < pm.lowBalanceThreshold;
        return (
          <div className="flex items-center gap-2">
            {isLow && <WarningIcon className="w-4 h-4 text-red-400" />}
            <span className={`font-medium ${isLow ? 'text-red-400' : 'text-white'}`}>
              {pm.lastKnownBalance?.toFixed(4) || '—'} ETH
            </span>
          </div>
        );
      },
    },
    {
      key: 'transactions',
      header: 'Transactions',
      render: (pm: Paymaster) => (
        <span className="text-gray-300">{pm.totalTransactions.toLocaleString()}</span>
      ),
    },
    {
      key: 'gasSpent',
      header: 'Gas Spent',
      render: (pm: Paymaster) => (
        <span className="text-gray-300">{pm.totalGasSpent.toFixed(4)} ETH</span>
      ),
    },
    {
      key: 'priority',
      header: 'Priority',
      render: (pm: Paymaster) => (
        <span className="text-gray-400">{pm.priority}</span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (pm: Paymaster) => (
        <span className={`px-2 py-1 text-xs rounded-full ${
          pm.isActive 
            ? 'bg-green-500/20 text-green-400 border border-green-500/30' 
            : 'bg-gray-500/20 text-gray-400 border border-gray-500/30'
        }`}>
          {pm.isActive ? 'Active' : 'Inactive'}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      className: 'text-right',
      render: (pm: Paymaster) => (
        <div className="flex items-center justify-end gap-2">
          <button className="px-3 py-1.5 text-xs bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors">
            Edit
          </button>
          {pm.isActive ? (
            <button className="px-3 py-1.5 text-xs bg-red-500/20 text-red-400 hover:bg-red-500/30 rounded-lg transition-colors">
              Deactivate
            </button>
          ) : (
            <button className="px-3 py-1.5 text-xs bg-green-500/20 text-green-400 hover:bg-green-500/30 rounded-lg transition-colors">
              Activate
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Paymasters</h1>
          <p className="text-gray-400 mt-1">Manage paymaster wallets and balances</p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" icon={<RefreshIcon className="w-4 h-4" />}>
            Refresh Balances
          </Button>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => setShowRebalanceModal(true)}
          >
            Rebalance
          </Button>
          <Button 
            size="sm" 
            icon={<PlusIcon className="w-4 h-4" />}
            onClick={() => setShowAddModal(true)}
          >
            Add Paymaster
          </Button>
        </div>
      </div>

      {/* Low Balance Alert */}
      {lowBalancePaymasters.length > 0 && (
        <Card className="border-red-500/30 bg-red-500/5">
          <CardContent>
            <div className="flex items-start gap-3">
              <div className="p-2 bg-red-500/10 rounded-lg">
                <WarningIcon className="w-5 h-5 text-red-400" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-red-400">Low Balance Warning</h3>
                <p className="text-sm text-gray-400 mt-1">
                  {lowBalancePaymasters.length} paymaster(s) have balance below threshold. 
                  Consider rebalancing or adding funds.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {lowBalancePaymasters.map((pm) => (
                    <span key={pm.id} className="px-2 py-1 text-xs bg-red-500/20 text-red-400 rounded-lg">
                      {pm.name}: {pm.lastKnownBalance?.toFixed(4)} ETH
                    </span>
                  ))}
                </div>
              </div>
              <Button variant="danger" size="sm" onClick={() => setShowRebalanceModal(true)}>
                Rebalance Now
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stats Summary */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardContent className="py-3">
            <p className="text-sm text-gray-400">Total Paymasters</p>
            <p className="text-2xl font-bold text-white">{mockPaymasters.length}</p>
            <p className="text-xs text-gray-500 mt-1">
              {mockPaymasters.filter(pm => pm.isActive).length} active
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3">
            <p className="text-sm text-gray-400">Total Balance</p>
            <p className="text-2xl font-bold text-cyan-400">{totalBalance.toFixed(4)} ETH</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3">
            <p className="text-sm text-gray-400">Total Transactions</p>
            <p className="text-2xl font-bold text-white">{totalTransactions.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3">
            <p className="text-sm text-gray-400">Total Gas Spent</p>
            <p className="text-2xl font-bold text-white">{totalGasSpent.toFixed(4)} ETH</p>
          </CardContent>
        </Card>
      </div>

      {/* Balance Distribution */}
      <Card>
        <CardHeader>
          <h3 className="font-semibold text-white">Balance Distribution</h3>
        </CardHeader>
        <CardContent className="space-y-4">
          {mockPaymasters.filter(pm => pm.isActive).map((pm) => (
            <div key={pm.id}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm text-gray-300">{pm.name}</span>
                <span className="text-sm text-gray-400">{pm.lastKnownBalance?.toFixed(4)} ETH</span>
              </div>
              <ProgressBar
                value={pm.lastKnownBalance || 0}
                max={2}
                showPercentage={false}
                color={pm.lastKnownBalance && pm.lowBalanceThreshold && pm.lastKnownBalance < pm.lowBalanceThreshold ? 'red' : 'cyan'}
              />
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Table */}
      <Table
        columns={columns}
        data={mockPaymasters}
        keyExtractor={(pm) => pm.id}
      />

      {/* Add Paymaster Modal */}
      <Modal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        title="Add New Paymaster"
        footer={
          <>
            <Button variant="ghost" onClick={() => setShowAddModal(false)}>Cancel</Button>
            <Button>Add Paymaster</Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input label="Wallet Address" placeholder="0x..." />
          <Input label="Name" placeholder="Primary Base" />
          <div className="grid grid-cols-2 gap-4">
            <Input label="Low Balance Threshold (ETH)" placeholder="0.5" type="number" step="0.1" />
            <Input label="Priority" placeholder="10" type="number" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Networks</label>
            <div className="flex gap-2">
              <label className="flex items-center gap-2 px-3 py-2 bg-gray-800 rounded-lg cursor-pointer">
                <input type="checkbox" className="rounded" />
                <span className="text-sm text-gray-300">Base</span>
              </label>
              <label className="flex items-center gap-2 px-3 py-2 bg-gray-800 rounded-lg cursor-pointer">
                <input type="checkbox" className="rounded" />
                <span className="text-sm text-gray-300">Ethereum</span>
              </label>
            </div>
          </div>
        </div>
      </Modal>

      {/* Rebalance Modal */}
      <Modal
        isOpen={showRebalanceModal}
        onClose={() => setShowRebalanceModal(false)}
        title="Rebalance Paymasters"
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setShowRebalanceModal(false)}>Cancel</Button>
            <Button>Execute Rebalance</Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-gray-400">
            Transfer ETH between paymaster wallets to ensure all have adequate balance for operations.
          </p>
          
          <div className="p-4 bg-gray-800/50 rounded-lg">
            <h4 className="text-sm font-medium text-gray-300 mb-3">Source Wallet (High Balance)</h4>
            <select className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white">
              {mockPaymasters
                .filter(pm => pm.isActive && pm.lastKnownBalance && pm.lastKnownBalance > 0.5)
                .map(pm => (
                  <option key={pm.id} value={pm.address}>
                    {pm.name} - {pm.lastKnownBalance?.toFixed(4)} ETH
                  </option>
                ))}
            </select>
          </div>

          <div className="p-4 bg-gray-800/50 rounded-lg">
            <h4 className="text-sm font-medium text-gray-300 mb-3">Target Wallets (Low Balance)</h4>
            <div className="space-y-2">
              {lowBalancePaymasters.map(pm => (
                <div key={pm.id} className="flex items-center justify-between p-2 bg-gray-900 rounded-lg">
                  <div className="flex items-center gap-2">
                    <input type="checkbox" defaultChecked className="rounded" />
                    <span className="text-sm text-gray-300">{pm.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-red-400">{pm.lastKnownBalance?.toFixed(4)} ETH</span>
                    <span className="text-xs text-gray-500">→</span>
                    <Input 
                      className="w-24 py-1 text-xs" 
                      placeholder="0.5" 
                      type="number" 
                      step="0.1"
                      defaultValue={pm.lowBalanceThreshold}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="p-4 bg-cyan-400/10 border border-cyan-400/20 rounded-lg">
            <h4 className="text-sm font-medium text-cyan-400 mb-2">Estimated Transaction</h4>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-gray-400">Total Transfer:</span>
                <span className="text-white ml-2">0.45 ETH</span>
              </div>
              <div>
                <span className="text-gray-400">Estimated Gas:</span>
                <span className="text-white ml-2">~0.001 ETH</span>
              </div>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
