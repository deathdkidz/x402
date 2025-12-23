'use client';

import { useState, useEffect } from 'react';
import { Card, CardHeader, CardContent, Button } from '@/components/ui';
import { Table } from '@/components/ui/Table';
import { Modal } from '@/components/ui/Modal';
import { WalletIcon, PlusIcon, CopyIcon, CheckIcon, RefreshIcon } from '@/components/icons';
import { useAuth } from '@/lib/auth-context';

interface CreditTransaction {
  id: number;
  type: string;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  description: string | null;
  createdAt: string;
}

interface TopupPackage {
  id: string;
  name: string;
  creditAmount: number;
  bonusCredits: number;
  totalCredits: number;
  priceUsdc: number;
  isPopular: boolean;
}

interface TopupOrder {
  orderId: string;
  totalCredits: number;
  priceUsdc: number;
  network: string;
  paymentAddress: string;
  expiresAt: string;
}

interface CreditsData {
  balance: number;
  mainnetBalance: number;
  testnetRemaining: number;
  testnetUsed: number;
  testnetAllocated: number;
  currentPeriod: { start: string; end: string } | null;
  lifetimePurchased: number;
  lifetimeUsed: number;
  usedLast30Days: number;
  transactions: CreditTransaction[];
}

export default function CreditsPage() {
  const { merchant } = useAuth();
  const [data, setData] = useState<CreditsData | null>(null);
  const [packages, setPackages] = useState<TopupPackage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showPurchaseModal, setShowPurchaseModal] = useState(false);
  const [selectedPackage, setSelectedPackage] = useState<TopupPackage | null>(null);
  const [customAmount, setCustomAmount] = useState<number>(1000);
  const [selectedNetwork, setSelectedNetwork] = useState<'base' | 'ethereum'>('base');
  const [createdOrder, setCreatedOrder] = useState<TopupOrder | null>(null);
  const [orderLoading, setOrderLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const fetchCredits = async () => {
    if (!merchant?.id) return;
    setIsLoading(true);
    setError(null);
    try {
      const [creditsRes, packagesRes] = await Promise.all([
        fetch('/api/dashboard/credits'),
        fetch('/api/dashboard/credits/packages'),
      ]);
      
      if (creditsRes.ok) {
        const creditsData = await creditsRes.json();
        setData(creditsData);
      } else {
        const errorData = await creditsRes.json().catch(() => ({}));
        setError(errorData.error || 'Failed to load credits');
      }
      
      if (packagesRes.ok) {
        const packagesData = await packagesRes.json();
        setPackages(packagesData.packages || []);
      }
    } catch (err) {
      console.error('Fetch error:', err);
      setError('Failed to load credits data');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (merchant?.id) {
      fetchCredits();
    }
  }, [merchant?.id]);

  const handleCreateOrder = async () => {
    if (!merchant?.id) return;
    setOrderLoading(true);
    try {
      const res = await fetch('/api/dashboard/credits/topup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          packageId: selectedPackage?.id,
          customAmount: selectedPackage ? undefined : customAmount,
          network: selectedNetwork,
        }),
      });
      
      const result = await res.json();
      if (res.ok && result.orderId) {
        setCreatedOrder(result);
      } else {
        alert(result.error || 'Failed to create order');
      }
    } catch (err) {
      alert('Failed to create order');
    } finally {
      setOrderLoading(false);
    }
  };

  const copyAddress = () => {
    if (createdOrder?.paymentAddress) {
      navigator.clipboard.writeText(createdOrder.paymentAddress);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // Calculate days remaining in testnet period
  const testnetDaysRemaining = data?.currentPeriod 
    ? Math.max(0, Math.ceil((new Date(data.currentPeriod.end).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : 0;

  const columns = [
    {
      key: 'createdAt',
      header: 'Date',
      render: (tx: CreditTransaction) => (
        <span className="text-sm text-gray-400">
          {new Date(tx.createdAt).toLocaleString()}
        </span>
      ),
    },
    {
      key: 'type',
      header: 'Type',
      render: (tx: CreditTransaction) => {
        const typeStyles: Record<string, string> = {
          purchase: 'bg-green-500/20 text-green-400',
          settlement_fee: 'bg-gray-500/20 text-gray-400',
          bonus: 'bg-cyan-500/20 text-cyan-400',
          refund: 'bg-yellow-500/20 text-yellow-400',
          adjustment: 'bg-purple-500/20 text-purple-400',
          testnet_allocation: 'bg-blue-500/20 text-blue-400',
        };
        return (
          <span className={`px-2 py-1 text-xs rounded ${typeStyles[tx.type] || 'bg-gray-500/20 text-gray-400'}`}>
            {tx.type.replace(/_/g, ' ')}
          </span>
        );
      },
    },
    {
      key: 'amount',
      header: 'Amount',
      render: (tx: CreditTransaction) => (
        <span className={`font-medium ${tx.amount >= 0 ? 'text-green-400' : 'text-white'}`}>
          {tx.amount >= 0 ? '+' : ''}{tx.amount.toLocaleString()}
        </span>
      ),
    },
    {
      key: 'balanceAfter',
      header: 'Balance',
      render: (tx: CreditTransaction) => (
        <span className="text-gray-300">{tx.balanceAfter.toLocaleString()}</span>
      ),
    },
    {
      key: 'description',
      header: 'Description',
      render: (tx: CreditTransaction) => (
        <span className="text-sm text-gray-400">{tx.description || '-'}</span>
      ),
    },
  ];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 space-y-4">
        <p className="text-red-400">{error}</p>
        <Button onClick={fetchCredits}>Try Again</Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Credits</h1>
          <p className="text-gray-400 mt-1">Manage your credit balance and purchases</p>
        </div>
        <div className="flex items-center gap-3">
          <Button 
            variant="ghost" 
            size="sm" 
            icon={<RefreshIcon className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />}
            onClick={fetchCredits}
          >
            Refresh
          </Button>
          <Button icon={<PlusIcon className="w-4 h-4" />} onClick={() => setShowPurchaseModal(true)}>
            Buy Mainnet Credits
          </Button>
        </div>
      </div>

      {/* Credit Balances - Two Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Mainnet Credits */}
        <Card className="border-green-500/30">
          <CardHeader>
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-white">Mainnet Credits</h3>
              <span className="px-2 py-1 text-xs bg-green-500/20 text-green-400 rounded">Production</span>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-4xl font-bold text-green-400">{(data?.mainnetBalance || 0).toLocaleString()}</p>
            <p className="text-sm text-gray-400 mt-2">For settlements on Ethereum & Base mainnet</p>
            <button
              onClick={() => setShowPurchaseModal(true)}
              className="mt-4 w-full py-2 bg-green-500/20 hover:bg-green-500/30 text-green-400 rounded-lg transition-colors"
            >
              Purchase Credits
            </button>
          </CardContent>
        </Card>

        {/* Testnet Credits */}
        <Card className="border-blue-500/30">
          <CardHeader>
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-white">Testnet Credits</h3>
              <span className="px-2 py-1 text-xs bg-blue-500/20 text-blue-400 rounded">Free Monthly</span>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-4xl font-bold text-blue-400">{(data?.testnetRemaining || 0).toLocaleString()}</p>
            <p className="text-sm text-gray-400 mt-2">
              {(data?.testnetUsed || 0).toLocaleString()} used of {(data?.testnetAllocated || 0).toLocaleString()} allocated
            </p>
            <div className="mt-2 w-full bg-gray-700 rounded-full h-2">
              <div 
                className="bg-blue-400 h-2 rounded-full"
                style={{ width: `${data?.testnetAllocated ? ((data.testnetRemaining / data.testnetAllocated) * 100) : 0}%` }}
              />
            </div>
            <p className="text-xs text-gray-500 mt-2">
              Resets in {testnetDaysRemaining} days • For Sepolia & Base Sepolia
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="py-3">
            <p className="text-sm text-gray-400">Lifetime Purchased</p>
            <p className="text-2xl font-bold text-white">{(data?.lifetimePurchased || 0).toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3">
            <p className="text-sm text-gray-400">Lifetime Used</p>
            <p className="text-2xl font-bold text-white">{(data?.lifetimeUsed || 0).toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3">
            <p className="text-sm text-gray-400">Used (30 days)</p>
            <p className="text-2xl font-bold text-white">{(data?.usedLast30Days || 0).toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3">
            <p className="text-sm text-gray-400">Testnet Period Ends</p>
            <p className="text-2xl font-bold text-cyan-400">
              {data?.currentPeriod ? new Date(data.currentPeriod.end).toLocaleDateString() : 'N/A'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Available Packages */}
      {packages.length > 0 && (
        <Card>
          <CardHeader>
            <h3 className="font-semibold text-white">Credit Packages</h3>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {packages.map((pkg) => (
                <div 
                  key={pkg.id} 
                  className={`relative p-4 bg-gray-800/50 rounded-lg text-center cursor-pointer transition-all hover:bg-gray-800 ${pkg.isPopular ? 'ring-2 ring-cyan-400' : ''}`}
                  onClick={() => {
                    setSelectedPackage(pkg);
                    setShowPurchaseModal(true);
                  }}
                >
                  {pkg.isPopular && (
                    <span className="absolute -top-2 left-1/2 -translate-x-1/2 px-2 py-0.5 text-xs bg-cyan-400 text-black rounded">
                      Popular
                    </span>
                  )}
                  <p className="font-medium text-white">{pkg.name}</p>
                  <p className="text-3xl font-bold text-white mt-2">{pkg.creditAmount.toLocaleString()}</p>
                  <p className="text-xs text-gray-400">credits</p>
                  {pkg.bonusCredits > 0 && (
                    <p className="text-sm text-cyan-400 mt-1">+{pkg.bonusCredits.toLocaleString()} bonus</p>
                  )}
                  <p className="text-lg font-medium text-gray-300 mt-2">${pkg.priceUsdc}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Credit History */}
      <Card>
        <CardHeader>
          <h3 className="font-semibold text-white">Credit History</h3>
        </CardHeader>
        <CardContent className="p-0">
          {data?.transactions && data.transactions.length > 0 ? (
            <Table
              columns={columns}
              data={data.transactions}
              keyExtractor={(tx) => tx.id}
            />
          ) : (
            <div className="text-center py-8 text-gray-500">
              No credit history yet
            </div>
          )}
        </CardContent>
      </Card>

      {/* Purchase Modal */}
      <Modal
        isOpen={showPurchaseModal}
        onClose={() => { setShowPurchaseModal(false); setCreatedOrder(null); setSelectedPackage(null); }}
        title="Purchase Mainnet Credits"
        size="lg"
      >
        {!createdOrder ? (
          <div className="space-y-6">
            {/* Package Selection */}
            {packages.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Select Package
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {packages.map((pkg) => (
                    <button
                      key={pkg.id}
                      onClick={() => setSelectedPackage(pkg)}
                      className={`p-3 rounded-lg border text-center transition-colors ${
                        selectedPackage?.id === pkg.id
                          ? 'border-cyan-400 bg-cyan-400/10 text-cyan-400'
                          : 'border-gray-700 bg-gray-800/50 text-gray-300 hover:border-gray-600'
                      }`}
                    >
                      <p className="font-medium">{pkg.name}</p>
                      <p className="text-sm text-gray-400">{pkg.totalCredits.toLocaleString()} credits</p>
                      <p className="text-lg font-bold">${pkg.priceUsdc}</p>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Custom Amount */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Or enter custom amount
              </label>
              <input
                type="number"
                value={customAmount}
                onChange={(e) => { setCustomAmount(Number(e.target.value)); setSelectedPackage(null); }}
                min={100}
                className="w-full px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-cyan-400/50"
                placeholder="Minimum 100 credits"
              />
              <p className="text-xs text-gray-500 mt-1">$0.01 per credit (minimum 100)</p>
            </div>

            {/* Summary */}
            <div className="p-4 bg-gray-800/50 rounded-lg space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Credits</span>
                <span className="text-white">
                  {selectedPackage ? selectedPackage.creditAmount.toLocaleString() : customAmount.toLocaleString()}
                </span>
              </div>
              {(selectedPackage?.bonusCredits || 0) > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Bonus</span>
                  <span className="text-cyan-400">+{selectedPackage!.bonusCredits.toLocaleString()}</span>
                </div>
              )}
              <div className="flex justify-between text-lg pt-2 border-t border-gray-700">
                <span className="text-gray-300">Total</span>
                <span className="text-cyan-400 font-bold">
                  ${selectedPackage ? selectedPackage.priceUsdc.toFixed(2) : (customAmount * 0.01).toFixed(2)} USDC
                </span>
              </div>
            </div>

            {/* Network Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Payment Network
              </label>
              <div className="flex gap-2">
                <button 
                  onClick={() => setSelectedNetwork('base')}
                  className={`flex-1 p-3 rounded-lg border transition-colors ${
                    selectedNetwork === 'base' 
                      ? 'bg-cyan-400/10 border-cyan-400/30 text-cyan-400' 
                      : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600'
                  }`}
                >
                  Base
                </button>
                <button 
                  onClick={() => setSelectedNetwork('ethereum')}
                  className={`flex-1 p-3 rounded-lg border transition-colors ${
                    selectedNetwork === 'ethereum' 
                      ? 'bg-cyan-400/10 border-cyan-400/30 text-cyan-400' 
                      : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600'
                  }`}
                >
                  Ethereum
                </button>
              </div>
            </div>

            <Button 
              onClick={handleCreateOrder}
              disabled={orderLoading || (!selectedPackage && customAmount < 100)}
              className="w-full"
            >
              {orderLoading ? 'Creating Order...' : 'Get Payment Address'}
            </Button>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="text-center">
              <p className="text-green-400 font-medium">Order Created!</p>
              <p className="text-sm text-gray-400 mt-1">Send payment to complete your purchase</p>
            </div>

            {/* Order Details */}
            <div className="p-4 bg-gray-800/50 rounded-lg space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Order ID</span>
                <span className="text-white font-mono">{createdOrder.orderId}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Credits</span>
                <span className="text-white">{createdOrder.totalCredits.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Amount</span>
                <span className="text-cyan-400 font-bold">${createdOrder.priceUsdc} USDC</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Network</span>
                <span className="text-white capitalize">{createdOrder.network}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Expires</span>
                <span className="text-white">{new Date(createdOrder.expiresAt).toLocaleString()}</span>
              </div>
            </div>

            {/* Payment Address */}
            <div className="p-4 bg-cyan-400/5 border border-cyan-400/20 rounded-lg">
              <div className="flex items-center gap-2 mb-3">
                <WalletIcon className="w-5 h-5 text-cyan-400" />
                <span className="font-medium text-white">Send USDC to:</span>
              </div>
              <div className="flex items-center gap-2">
                <code className="flex-1 p-3 bg-gray-900 rounded-lg text-sm text-gray-300 font-mono overflow-x-auto">
                  {createdOrder.paymentAddress}
                </code>
                <button
                  onClick={copyAddress}
                  className="p-3 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors"
                >
                  {copied ? (
                    <CheckIcon className="w-5 h-5 text-green-400" />
                  ) : (
                    <CopyIcon className="w-5 h-5 text-gray-400" />
                  )}
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-3">
                Send exactly ${createdOrder.priceUsdc} USDC on {createdOrder.network}. 
                Credits will be added automatically after confirmation.
              </p>
            </div>

            <Button 
              variant="outline"
              onClick={() => { setShowPurchaseModal(false); setCreatedOrder(null); setSelectedPackage(null); }}
              className="w-full"
            >
              Close
            </Button>
          </div>
        )}
      </Modal>
    </div>
  );
}
