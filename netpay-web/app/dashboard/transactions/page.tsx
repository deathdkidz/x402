'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, Button, Select, Modal } from '@/components/ui';
import { Table, Pagination } from '@/components/ui/Table';
import { StatusBadge } from '@/components/ui/Badge';
import { SearchIcon, DownloadIcon, RefreshIcon, ExternalLinkIcon } from '@/components/icons';

interface Transaction {
  id: number;
  payerAddress: string;
  recipientAddress: string;
  amount: number;
  asset: string;
  network: string;
  status: 'pending' | 'preconfirmed' | 'completed' | 'failed';
  txHash: string | null;
  resource: string | null;
  description: string | null;
  creditCost: number;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

interface Stats {
  total: number;
  confirmed: number;
  pending: number;
  failed: number;
  totalVolume: number;
}

export default function TransactionsPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [stats, setStats] = useState<Stats>({ total: 0, confirmed: 0, pending: 0, failed: 0, totalVolume: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [networkFilter, setNetworkFilter] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);
  const pageSize = 20;

  const fetchTransactions = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        page: currentPage.toString(),
        limit: pageSize.toString(),
      });
      
      if (statusFilter !== 'all') params.append('status', statusFilter);
      if (networkFilter !== 'all') params.append('network', networkFilter);
      if (search) params.append('search', search);

      const res = await fetch(`/api/dashboard/transactions?${params}`);
      if (!res.ok) throw new Error('Failed to fetch');
      
      const data = await res.json();
      setTransactions(data.transactions);
      setTotalPages(data.pagination.totalPages);
      setTotalCount(data.pagination.total);
      
      // Calculate stats from response
      setStats({
        total: data.pagination.total,
        confirmed: data.transactions.filter((tx: Transaction) => tx.status === 'completed').length,
        pending: data.transactions.filter((tx: Transaction) => tx.status === 'pending' || tx.status === 'preconfirmed').length,
        failed: data.transactions.filter((tx: Transaction) => tx.status === 'failed').length,
        totalVolume: data.transactions.filter((tx: Transaction) => tx.status === 'completed').reduce((acc: number, tx: Transaction) => acc + tx.amount, 0),
      });
    } catch (error) {
      console.error('Fetch error:', error);
    } finally {
      setIsLoading(false);
    }
  }, [currentPage, statusFilter, networkFilter, search]);

  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions]);

  useEffect(() => {
    // Reset to page 1 when filters change
    setCurrentPage(1);
  }, [search, statusFilter, networkFilter]);

  const getExplorerUrl = (network: string, txHash: string) => {
    const explorers: Record<string, string> = {
      base: 'https://basescan.org/tx/',
      'base-sepolia': 'https://sepolia.basescan.org/tx/',
      ethereum: 'https://etherscan.io/tx/',
      'eth-sepolia': 'https://sepolia.etherscan.io/tx/',
    };
    return (explorers[network.toLowerCase()] || explorers['base']) + txHash;
  };

  const mapStatus = (status: string): 'pending' | 'preconfirmed' | 'confirmed' | 'failed' => {
    if (status === 'completed') return 'confirmed';
    if (status === 'preconfirmed') return 'preconfirmed';
    if (status === 'failed') return 'failed';
    return 'pending';
  };

  const columns = [
    {
      key: 'id',
      header: 'ID',
      render: (tx: Transaction) => (
        <span className="font-mono text-sm text-white">#{tx.id}</span>
      ),
    },
    {
      key: 'amount',
      header: 'Amount',
      render: (tx: Transaction) => (
        <p className="font-medium text-white">${tx.amount.toFixed(2)}</p>
      ),
    },
    {
      key: 'payerAddress',
      header: 'Payer',
      render: (tx: Transaction) => (
        <span className="font-mono text-sm text-gray-400">
          {tx.payerAddress.slice(0, 6)}...{tx.payerAddress.slice(-4)}
        </span>
      ),
    },
    {
      key: 'network',
      header: 'Network',
      render: (tx: Transaction) => (
        <span className="px-2 py-1 text-xs bg-gray-800 rounded-full capitalize">{tx.network}</span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (tx: Transaction) => <StatusBadge status={mapStatus(tx.status)} />,
    },
    {
      key: 'createdAt',
      header: 'Date',
      render: (tx: Transaction) => (
        <span className="text-sm text-gray-400">
          {new Date(tx.createdAt).toLocaleString()}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      className: 'text-right',
      render: (tx: Transaction) => (
        <button 
          onClick={() => setSelectedTransaction(tx)}
          className="px-3 py-1.5 text-xs bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors"
        >
          Details
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Transactions</h1>
          <p className="text-gray-400 mt-1">View and manage your settlements</p>
        </div>
        <div className="flex items-center gap-3">
          <Button 
            variant="ghost" 
            size="sm" 
            icon={<RefreshIcon className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />}
            onClick={fetchTransactions}
          >
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
            <p className="text-2xl font-bold text-white">{totalCount}</p>
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
            <p className="text-sm text-gray-400">Page Volume</p>
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
                placeholder="Search by address or tx hash..."
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
                { value: 'completed', label: 'Completed' },
                { value: 'failed', label: 'Failed' },
              ]}
              className="w-40"
            />
            <Select
              value={networkFilter}
              onChange={(e) => setNetworkFilter(e.target.value)}
              options={[
                { value: 'all', label: 'All Networks' },
                { value: 'base', label: 'Base' },
                { value: 'base-sepolia', label: 'Base Sepolia' },
                { value: 'ethereum', label: 'Ethereum' },
              ]}
              className="w-40"
            />
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-8 h-8 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <Table
          columns={columns}
          data={transactions}
          keyExtractor={(tx) => tx.id}
        />
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={setCurrentPage}
        />
      )}

      {/* Transaction Detail Modal */}
      <Modal
        isOpen={selectedTransaction !== null}
        onClose={() => setSelectedTransaction(null)}
        title="Transaction Details"
        size="lg"
      >
        {selectedTransaction && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <StatusBadge status={mapStatus(selectedTransaction.status)} />
              {selectedTransaction.txHash && (
                <a
                  href={getExplorerUrl(selectedTransaction.network, selectedTransaction.txHash)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-cyan-400 hover:text-cyan-300 text-sm"
                >
                  View on Explorer
                  <ExternalLinkIcon className="w-4 h-4" />
                </a>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="p-3 bg-gray-800/50 rounded-lg">
                <p className="text-xs text-gray-500 mb-1">Transaction ID</p>
                <p className="text-sm text-white font-mono">#{selectedTransaction.id}</p>
              </div>
              <div className="p-3 bg-gray-800/50 rounded-lg">
                <p className="text-xs text-gray-500 mb-1">Amount</p>
                <p className="text-xl font-bold text-white">${selectedTransaction.amount.toFixed(2)}</p>
              </div>
            </div>

            <div className="p-3 bg-gray-800/50 rounded-lg">
              <p className="text-xs text-gray-500 mb-1">Payer Address</p>
              <p className="text-sm text-white font-mono break-all">{selectedTransaction.payerAddress}</p>
            </div>

            <div className="p-3 bg-gray-800/50 rounded-lg">
              <p className="text-xs text-gray-500 mb-1">Recipient Address</p>
              <p className="text-sm text-white font-mono break-all">{selectedTransaction.recipientAddress}</p>
            </div>

            {selectedTransaction.txHash && (
              <div className="p-3 bg-gray-800/50 rounded-lg">
                <p className="text-xs text-gray-500 mb-1">Transaction Hash</p>
                <p className="text-sm text-white font-mono break-all">{selectedTransaction.txHash}</p>
              </div>
            )}

            <div className="grid grid-cols-3 gap-4">
              <div className="p-3 bg-gray-800/50 rounded-lg">
                <p className="text-xs text-gray-500 mb-1">Network</p>
                <p className="text-sm text-white capitalize">{selectedTransaction.network}</p>
              </div>
              <div className="p-3 bg-gray-800/50 rounded-lg">
                <p className="text-xs text-gray-500 mb-1">Asset</p>
                <p className="text-sm text-white">{selectedTransaction.asset}</p>
              </div>
              <div className="p-3 bg-gray-800/50 rounded-lg">
                <p className="text-xs text-gray-500 mb-1">Credit Cost</p>
                <p className="text-sm text-white">{selectedTransaction.creditCost}</p>
              </div>
            </div>

            {selectedTransaction.resource && (
              <div className="p-3 bg-gray-800/50 rounded-lg">
                <p className="text-xs text-gray-500 mb-1">Resource</p>
                <p className="text-sm text-white">{selectedTransaction.resource}</p>
              </div>
            )}

            {selectedTransaction.errorMessage && (
              <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                <p className="text-xs text-red-400 mb-1">Error</p>
                <p className="text-sm text-red-300">{selectedTransaction.errorMessage}</p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4 text-xs text-gray-500">
              <div>
                <p>Created</p>
                <p className="text-gray-300">{new Date(selectedTransaction.createdAt).toLocaleString()}</p>
              </div>
              <div>
                <p>Updated</p>
                <p className="text-gray-300">{new Date(selectedTransaction.updatedAt).toLocaleString()}</p>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
