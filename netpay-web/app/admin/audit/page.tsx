'use client';

import { useState } from 'react';
import { Card, CardHeader, CardContent, Select, Input } from '@/components/ui';
import { Table, Pagination } from '@/components/ui/Table';
import { SearchIcon, DownloadIcon } from '@/components/icons';

interface AuditLogEntry {
  id: number;
  adminUsername: string;
  action: string;
  entityType?: string;
  entityId?: string;
  description: string;
  ipAddress: string;
  createdAt: string;
}

// Mock data
const mockAuditLogs: AuditLogEntry[] = [
  {
    id: 1,
    adminUsername: 'admin@x402.io',
    action: 'merchant.suspend',
    entityType: 'merchant',
    entityId: 'm_qrs345tuv678',
    description: 'Suspended merchant "DataFlow Systems" - Reason: Insufficient credits',
    ipAddress: '192.168.1.100',
    createdAt: '2024-12-22T08:15:00Z',
  },
  {
    id: 2,
    adminUsername: 'admin@x402.io',
    action: 'credit.adjustment',
    entityType: 'merchant',
    entityId: 'm_abc123def456',
    description: 'Added 500 bonus credits to "Acme Corporation"',
    ipAddress: '192.168.1.100',
    createdAt: '2024-12-22T07:45:00Z',
  },
  {
    id: 3,
    adminUsername: 'superadmin@x402.io',
    action: 'paymaster.add',
    entityType: 'paymaster',
    entityId: '0xfedcba...',
    description: 'Added new paymaster wallet for Ethereum network',
    ipAddress: '10.0.0.1',
    createdAt: '2024-12-21T16:30:00Z',
  },
  {
    id: 4,
    adminUsername: 'admin@x402.io',
    action: 'merchant.approve',
    entityType: 'merchant',
    entityId: 'm_new001abc',
    description: 'Approved merchant registration for "NewCo AI"',
    ipAddress: '192.168.1.100',
    createdAt: '2024-12-21T14:00:00Z',
  },
  {
    id: 5,
    adminUsername: 'superadmin@x402.io',
    action: 'settings.update',
    entityType: 'settings',
    entityId: 'credit_pricing',
    description: 'Updated credit pricing tiers',
    ipAddress: '10.0.0.1',
    createdAt: '2024-12-20T10:00:00Z',
  },
  {
    id: 6,
    adminUsername: 'admin@x402.io',
    action: 'settlement.retry',
    entityType: 'settlement',
    entityId: 'stl_failed123',
    description: 'Retried failed settlement for "TechStart Inc"',
    ipAddress: '192.168.1.100',
    createdAt: '2024-12-20T09:30:00Z',
  },
];

const actionColors: Record<string, string> = {
  'merchant.suspend': 'bg-red-500/20 text-red-400',
  'merchant.approve': 'bg-green-500/20 text-green-400',
  'merchant.activate': 'bg-green-500/20 text-green-400',
  'credit.adjustment': 'bg-cyan-500/20 text-cyan-400',
  'paymaster.add': 'bg-purple-500/20 text-purple-400',
  'paymaster.deactivate': 'bg-orange-500/20 text-orange-400',
  'settings.update': 'bg-yellow-500/20 text-yellow-400',
  'settlement.retry': 'bg-blue-500/20 text-blue-400',
};

export default function AuditLogPage() {
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 20;

  const filteredLogs = mockAuditLogs.filter((log) => {
    const matchesSearch = 
      log.description.toLowerCase().includes(search.toLowerCase()) ||
      log.adminUsername.toLowerCase().includes(search.toLowerCase()) ||
      (log.entityId && log.entityId.toLowerCase().includes(search.toLowerCase()));
    const matchesAction = actionFilter === 'all' || log.action.startsWith(actionFilter);
    return matchesSearch && matchesAction;
  });

  const columns = [
    {
      key: 'createdAt',
      header: 'Timestamp',
      render: (log: AuditLogEntry) => (
        <span className="text-sm text-gray-400">
          {new Date(log.createdAt).toLocaleString()}
        </span>
      ),
    },
    {
      key: 'adminUsername',
      header: 'Admin',
      render: (log: AuditLogEntry) => (
        <span className="text-sm text-white">{log.adminUsername}</span>
      ),
    },
    {
      key: 'action',
      header: 'Action',
      render: (log: AuditLogEntry) => (
        <span className={`px-2 py-1 text-xs rounded ${actionColors[log.action] || 'bg-gray-500/20 text-gray-400'}`}>
          {log.action}
        </span>
      ),
    },
    {
      key: 'description',
      header: 'Description',
      render: (log: AuditLogEntry) => (
        <p className="text-sm text-gray-300 max-w-md truncate">{log.description}</p>
      ),
    },
    {
      key: 'ipAddress',
      header: 'IP Address',
      render: (log: AuditLogEntry) => (
        <span className="text-sm text-gray-500 font-mono">{log.ipAddress}</span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Audit Log</h1>
          <p className="text-gray-400 mt-1">Track all administrative actions</p>
        </div>
        <button className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm text-gray-300 transition-colors">
          <DownloadIcon className="w-4 h-4" />
          Export
        </button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent>
          <div className="flex items-center gap-4">
            <div className="flex-1 relative">
              <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input
                type="text"
                placeholder="Search by description, admin, or entity..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-cyan-400/50 focus:border-cyan-400"
              />
            </div>
            <Select
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
              options={[
                { value: 'all', label: 'All Actions' },
                { value: 'merchant', label: 'Merchant Actions' },
                { value: 'credit', label: 'Credit Actions' },
                { value: 'paymaster', label: 'Paymaster Actions' },
                { value: 'settlement', label: 'Settlement Actions' },
                { value: 'settings', label: 'Settings Changes' },
              ]}
              className="w-44"
            />
            <Input
              type="date"
              className="w-40"
            />
          </div>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardContent className="py-3">
            <p className="text-sm text-gray-400">Total Entries</p>
            <p className="text-2xl font-bold text-white">{mockAuditLogs.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3">
            <p className="text-sm text-gray-400">Merchant Actions</p>
            <p className="text-2xl font-bold text-cyan-400">
              {mockAuditLogs.filter(l => l.action.startsWith('merchant')).length}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3">
            <p className="text-sm text-gray-400">Credit Adjustments</p>
            <p className="text-2xl font-bold text-green-400">
              {mockAuditLogs.filter(l => l.action.startsWith('credit')).length}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3">
            <p className="text-sm text-gray-400">Settings Changes</p>
            <p className="text-2xl font-bold text-yellow-400">
              {mockAuditLogs.filter(l => l.action.startsWith('settings')).length}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Table */}
      <Table
        columns={columns}
        data={filteredLogs}
        keyExtractor={(log) => log.id}
      />

      {/* Pagination */}
      {filteredLogs.length > pageSize && (
        <Pagination
          currentPage={currentPage}
          totalPages={Math.ceil(filteredLogs.length / pageSize)}
          onPageChange={setCurrentPage}
        />
      )}
    </div>
  );
}
