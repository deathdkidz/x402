'use client';

import { useState } from 'react';
import { Card, CardHeader, CardContent, Button, Input, Select } from '@/components/ui';
import { Table, Pagination } from '@/components/ui/Table';
import { StatusBadge } from '@/components/ui/Badge';
import { SearchIcon, PlusIcon, DownloadIcon } from '@/components/icons';
import type { Merchant } from '@/types';

// Mock data
const mockMerchants: Merchant[] = [
  {
    id: 1,
    merchantId: 'm_abc123def456',
    authAddress: '0x1234567890abcdef1234567890abcdef12345678',
    businessName: 'Acme Corporation',
    description: 'Leading AI solutions provider',
    websiteUrl: 'https://acme.com',
    contactEmail: 'support@acme.com',
    creditBalance: 5420.50,
    lifetimeCreditsPurchased: 15000,
    lifetimeCreditsUsed: 9579.50,
    isMarketplaceVisible: true,
    marketplaceCategory: 'AI',
    status: 'active',
    createdAt: '2024-01-15T10:00:00Z',
    updatedAt: '2024-12-20T14:30:00Z',
    lastActiveAt: '2024-12-22T08:15:00Z',
  },
  {
    id: 2,
    merchantId: 'm_xyz789ghi012',
    authAddress: '0xabcdef1234567890abcdef1234567890abcdef12',
    businessName: 'TechStart Inc',
    description: 'API integration platform',
    websiteUrl: 'https://techstart.io',
    contactEmail: 'hello@techstart.io',
    creditBalance: 150.00,
    lifetimeCreditsPurchased: 2000,
    lifetimeCreditsUsed: 1850,
    isMarketplaceVisible: false,
    status: 'active',
    createdAt: '2024-03-20T15:00:00Z',
    updatedAt: '2024-12-18T09:00:00Z',
    lastActiveAt: '2024-12-21T16:45:00Z',
  },
  {
    id: 3,
    merchantId: 'm_qrs345tuv678',
    authAddress: '0x9876543210fedcba9876543210fedcba98765432',
    businessName: 'DataFlow Systems',
    description: 'Real-time data streaming',
    creditBalance: 0,
    lifetimeCreditsPurchased: 500,
    lifetimeCreditsUsed: 500,
    isMarketplaceVisible: false,
    status: 'suspended',
    statusReason: 'Insufficient credits',
    createdAt: '2024-06-01T12:00:00Z',
    updatedAt: '2024-12-15T11:00:00Z',
  },
  {
    id: 4,
    merchantId: 'm_new001abc',
    authAddress: '0xfedcba0987654321fedcba0987654321fedcba09',
    businessName: 'NewCo AI',
    description: 'Machine learning APIs',
    creditBalance: 1000,
    lifetimeCreditsPurchased: 1000,
    lifetimeCreditsUsed: 0,
    isMarketplaceVisible: false,
    status: 'pending',
    createdAt: '2024-12-20T08:00:00Z',
    updatedAt: '2024-12-20T08:00:00Z',
  },
];

export default function MerchantsPage() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  const filteredMerchants = mockMerchants.filter((m) => {
    const matchesSearch = m.businessName.toLowerCase().includes(search.toLowerCase()) ||
      m.merchantId.toLowerCase().includes(search.toLowerCase()) ||
      m.authAddress.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === 'all' || m.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const columns = [
    {
      key: 'businessName',
      header: 'Merchant',
      render: (merchant: Merchant) => (
        <div>
          <p className="font-medium text-white">{merchant.businessName}</p>
          <p className="text-xs text-gray-500 font-mono">{merchant.merchantId}</p>
        </div>
      ),
    },
    {
      key: 'creditBalance',
      header: 'Credits',
      render: (merchant: Merchant) => (
        <div>
          <p className={`font-medium ${merchant.creditBalance < 100 ? 'text-red-400' : 'text-white'}`}>
            {merchant.creditBalance.toLocaleString()}
          </p>
          <p className="text-xs text-gray-500">
            Used: {merchant.lifetimeCreditsUsed.toLocaleString()}
          </p>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (merchant: Merchant) => <StatusBadge status={merchant.status} />,
    },
    {
      key: 'isMarketplaceVisible',
      header: 'Marketplace',
      render: (merchant: Merchant) => (
        <span className={`text-sm ${merchant.isMarketplaceVisible ? 'text-green-400' : 'text-gray-500'}`}>
          {merchant.isMarketplaceVisible ? 'Visible' : 'Hidden'}
        </span>
      ),
    },
    {
      key: 'lastActiveAt',
      header: 'Last Active',
      render: (merchant: Merchant) => (
        <span className="text-sm text-gray-400">
          {merchant.lastActiveAt 
            ? new Date(merchant.lastActiveAt).toLocaleDateString()
            : 'Never'}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      className: 'text-right',
      render: (merchant: Merchant) => (
        <div className="flex items-center justify-end gap-2">
          <a
            href={`/admin/merchants/${merchant.merchantId}`}
            className="px-3 py-1.5 text-xs bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors"
          >
            View
          </a>
          {merchant.status === 'pending' && (
            <button className="px-3 py-1.5 text-xs bg-cyan-400/20 text-cyan-400 hover:bg-cyan-400/30 rounded-lg transition-colors">
              Approve
            </button>
          )}
          {merchant.status === 'active' && (
            <button className="px-3 py-1.5 text-xs bg-red-500/20 text-red-400 hover:bg-red-500/30 rounded-lg transition-colors">
              Suspend
            </button>
          )}
          {merchant.status === 'suspended' && (
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
          <h1 className="text-2xl font-bold text-white">Merchants</h1>
          <p className="text-gray-400 mt-1">Manage merchant accounts and credits</p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" icon={<DownloadIcon className="w-4 h-4" />}>
            Export
          </Button>
          <Button size="sm" icon={<PlusIcon className="w-4 h-4" />}>
            Add Merchant
          </Button>
        </div>
      </div>

      {/* Stats Summary */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardContent className="py-3">
            <p className="text-sm text-gray-400">Total Merchants</p>
            <p className="text-2xl font-bold text-white">{mockMerchants.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3">
            <p className="text-sm text-gray-400">Active</p>
            <p className="text-2xl font-bold text-green-400">
              {mockMerchants.filter(m => m.status === 'active').length}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3">
            <p className="text-sm text-gray-400">Pending</p>
            <p className="text-2xl font-bold text-yellow-400">
              {mockMerchants.filter(m => m.status === 'pending').length}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3">
            <p className="text-sm text-gray-400">Suspended</p>
            <p className="text-2xl font-bold text-red-400">
              {mockMerchants.filter(m => m.status === 'suspended').length}
            </p>
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
                placeholder="Search by name, ID, or address..."
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
                { value: 'active', label: 'Active' },
                { value: 'pending', label: 'Pending' },
                { value: 'suspended', label: 'Suspended' },
                { value: 'banned', label: 'Banned' },
              ]}
              className="w-40"
            />
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Table
        columns={columns}
        data={filteredMerchants}
        keyExtractor={(m) => m.id}
        onRowClick={(m) => window.location.href = `/admin/merchants/${m.merchantId}`}
      />

      {/* Pagination */}
      {filteredMerchants.length > pageSize && (
        <Pagination
          currentPage={currentPage}
          totalPages={Math.ceil(filteredMerchants.length / pageSize)}
          onPageChange={setCurrentPage}
        />
      )}
    </div>
  );
}
