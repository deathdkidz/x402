'use client';

import { useState } from 'react';
import { Card, CardHeader, CardContent, Button, Input, Select } from '@/components/ui';
import { Table, Pagination } from '@/components/ui/Table';
import { StatusBadge } from '@/components/ui/Badge';
import { SearchIcon, DownloadIcon, RefreshIcon, ExternalLinkIcon } from '@/components/icons';
import type { Settlement } from '@/types';

// Mock data
const mockSettlements: Settlement[] = [
  {
    id: 1,
    settlementId: 'stl_abc123def456',
    merchantId: 1,
    network: 'base',
    tokenAddress: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    payerAddress: '0x1234567890abcdef1234567890abcdef12345678',
    recipientAddress: '0xabcdef1234567890abcdef1234567890abcdef12',
    amount: 25.50,
    nonce: '0x123456',
    validAfter: Date.now() - 60000,
    validBefore: Date.now() + 3600000,
    signature: '0x...',
    txHash: '0x9876543210fedcba9876543210fedcba9876543210fedcba9876543210fedcba',
    blockNumber: 12345678,
    gasUsed: 65000,
    gasPrice: 1000000000,
    creditCost: 1,
    gasCostUsd: 0.008,
    status: 'confirmed',
    createdAt: '2024-12-22T08:00:00Z',
    submittedAt: '2024-12-22T08:00:05Z',
    confirmedAt: '2024-12-22T08:00:15Z',
  },
  {
    id: 2,
    settlementId: 'stl_xyz789ghi012',
    merchantId: 2,
    network: 'base',
    tokenAddress: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    payerAddress: '0x9876543210fedcba9876543210fedcba98765432',
    recipientAddress: '0xfedcba0987654321fedcba0987654321fedcba09',
    amount: 150.00,
    nonce: '0x789012',
    validAfter: Date.now() - 30000,
    validBefore: Date.now() + 3600000,
    signature: '0x...',
    creditCost: 1,
    status: 'pending',
    createdAt: '2024-12-22T08:05:00Z',
  },
  {
    id: 3,
    settlementId: 'stl_qrs345tuv678',
    merchantId: 1,
    network: 'ethereum',
    tokenAddress: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    payerAddress: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    recipientAddress: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    amount: 75.25,
    nonce: '0x345678',
    validAfter: Date.now() - 120000,
    validBefore: Date.now() + 3600000,
    signature: '0x...',
    creditCost: 1,
    status: 'failed',
    errorMessage: 'Insufficient allowance',
    createdAt: '2024-12-22T07:45:00Z',
    submittedAt: '2024-12-22T07:45:05Z',
  },
  {
    id: 4,
    settlementId: 'stl_mno901pqr234',
    merchantId: 3,
    network: 'base',
    tokenAddress: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    payerAddress: '0xcccccccccccccccccccccccccccccccccccccccc',
    recipientAddress: '0xdddddddddddddddddddddddddddddddddddddddd',
    amount: 12.00,
    nonce: '0x901234',
    validAfter: Date.now() - 60000,
    validBefore: Date.now() + 3600000,
    signature: '0x...',
    txHash: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
    blockNumber: 12345700,
    creditCost: 1,
    status: 'preconfirmed',
    createdAt: '2024-12-22T08:10:00Z',
    submittedAt: '2024-12-22T08:10:02Z',
  },
];

const merchantNames: Record<number, string> = {
  1: 'Acme Corporation',
  2: 'TechStart Inc',
  3: 'DataFlow Systems',
};

export default function SettlementsPage() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [networkFilter, setNetworkFilter] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 20;

  const filteredSettlements = mockSettlements.filter((s) => {
    const matchesSearch = s.settlementId.toLowerCase().includes(search.toLowerCase()) ||
      s.payerAddress.toLowerCase().includes(search.toLowerCase()) ||
      (s.txHash && s.txHash.toLowerCase().includes(search.toLowerCase()));
    const matchesStatus = statusFilter === 'all' || s.status === statusFilter;
    const matchesNetwork = networkFilter === 'all' || s.network === networkFilter;
    return matchesSearch && matchesStatus && matchesNetwork;
  });

  const columns = [
    {
      key: 'settlementId',
      header: 'Settlement ID',
      render: (s: Settlement) => (
        <div>
          <p className="font-mono text-sm text-white">{s.settlementId.slice(0, 16)}...</p>
          <p className="text-xs text-gray-500">{merchantNames[s.merchantId] || 'Unknown'}</p>
        </div>
      ),
    },
    {
      key: 'amount',
      header: 'Amount',
      render: (s: Settlement) => (
        <p className="font-medium text-white">${s.amount.toFixed(2)}</p>
      ),
    },
    {
      key: 'network',
      header: 'Network',
      render: (s: Settlement) => (
        <span className="px-2 py-1 text-xs bg-gray-800 rounded-full capitalize">{s.network}</span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (s: Settlement) => <StatusBadge status={s.status} />,
    },
    {
      key: 'txHash',
      header: 'Transaction',
      render: (s: Settlement) => (
        s.txHash ? (
          <a
            href={`https://basescan.org/tx/${s.txHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-cyan-400 hover:text-cyan-300 text-sm font-mono"
            onClick={(e) => e.stopPropagation()}
          >
            {s.txHash.slice(0, 10)}...
            <ExternalLinkIcon className="w-3 h-3" />
          </a>
        ) : (
          <span className="text-gray-500 text-sm">—</span>
        )
      ),
    },
    {
      key: 'createdAt',
      header: 'Created',
      render: (s: Settlement) => (
        <span className="text-sm text-gray-400">
          {new Date(s.createdAt).toLocaleString()}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      className: 'text-right',
      render: (s: Settlement) => (
        <div className="flex items-center justify-end gap-2">
          <button className="px-3 py-1.5 text-xs bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors">
            Details
          </button>
          {s.status === 'failed' && (
            <button className="px-3 py-1.5 text-xs bg-cyan-400/20 text-cyan-400 hover:bg-cyan-400/30 rounded-lg transition-colors">
              Retry
            </button>
          )}
        </div>
      ),
    },
  ];

  const stats = {
    total: mockSettlements.length,
    confirmed: mockSettlements.filter(s => s.status === 'confirmed').length,
    pending: mockSettlements.filter(s => s.status === 'pending' || s.status === 'preconfirmed').length,
    failed: mockSettlements.filter(s => s.status === 'failed').length,
    totalVolume: mockSettlements.filter(s => s.status === 'confirmed').reduce((acc, s) => acc + s.amount, 0),
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Settlements</h1>
          <p className="text-gray-400 mt-1">Monitor and manage payment settlements</p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" icon={<RefreshIcon className="w-4 h-4" />}>
            Refresh
          </Button>
          <Button variant="outline" size="sm" icon={<DownloadIcon className="w-4 h-4" />}>
            Export CSV
          </Button>
        </div>
      </div>

      {/* Stats Summary */}
      <div className="grid grid-cols-5 gap-4">
        <Card>
          <CardContent className="py-3">
            <p className="text-sm text-gray-400">Total</p>
            <p className="text-2xl font-bold text-white">{stats.total}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3">
            <p className="text-sm text-gray-400">Confirmed</p>
            <p className="text-2xl font-bold text-green-400">{stats.confirmed}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3">
            <p className="text-sm text-gray-400">Pending</p>
            <p className="text-2xl font-bold text-yellow-400">{stats.pending}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3">
            <p className="text-sm text-gray-400">Failed</p>
            <p className="text-2xl font-bold text-red-400">{stats.failed}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3">
            <p className="text-sm text-gray-400">Volume</p>
            <p className="text-2xl font-bold text-cyan-400">${stats.totalVolume.toFixed(2)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent>
          <div className="flex items-center gap-4">
            <div className="flex-1 relative">
              <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input
                type="text"
                placeholder="Search by ID, address, or tx hash..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-cyan-400/50 focus:border-cyan-400"
              />
            </div>
            <Select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              options={[
                { value: 'all', label: 'All Status' },
                { value: 'pending', label: 'Pending' },
                { value: 'preconfirmed', label: 'Preconfirmed' },
                { value: 'confirmed', label: 'Confirmed' },
                { value: 'failed', label: 'Failed' },
                { value: 'expired', label: 'Expired' },
              ]}
              className="w-40"
            />
            <Select
              value={networkFilter}
              onChange={(e) => setNetworkFilter(e.target.value)}
              options={[
                { value: 'all', label: 'All Networks' },
                { value: 'base', label: 'Base' },
                { value: 'ethereum', label: 'Ethereum' },
              ]}
              className="w-40"
            />
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Table
        columns={columns}
        data={filteredSettlements}
        keyExtractor={(s) => s.id}
      />

      {/* Pagination */}
      {filteredSettlements.length > pageSize && (
        <Pagination
          currentPage={currentPage}
          totalPages={Math.ceil(filteredSettlements.length / pageSize)}
          onPageChange={setCurrentPage}
        />
      )}
    </div>
  );
}
