'use client';

import { useState, useEffect } from 'react';
import { Card, CardHeader, CardContent, Button, CreditBalanceCard } from '@/components/ui';
import { Table } from '@/components/ui/Table';
import { Modal } from '@/components/ui/Modal';
import { WalletIcon, PlusIcon, CopyIcon, CheckIcon, RefreshIcon } from '@/components/icons';

interface CreditTransaction {
  id: number;
  type: 'purchase' | 'settlement_fee' | 'bonus' | 'refund' | 'adjustment';
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  referenceType: string | null;
  referenceId: string | null;
  description: string | null;
  createdAt: string;
}

interface CreditPurchase {
  id: number;
  network: string;
  txHash: string;
  tokenAmount: number;
  creditAmount: number;
  status: 'pending' | 'confirmed' | 'failed';
  createdAt: string;
}

interface CreditsData {
  balance: number;
  lifetimePurchased: number;
  lifetimeUsed: number;
  usedLast30Days: number;
  transactions: CreditTransaction[];
  purchases: CreditPurchase[];
}

const creditPricing = [
  { range: '1 - 100', price: 0.01, bonus: 0 },
  { range: '101 - 1,000', price: 0.009, bonus: 10 },
  { range: '1,001 - 10,000', price: 0.008, bonus: 20 },
  { range: '10,001+', price: 0.007, bonus: 30 },
];

export default function CreditsPage() {
  const [data, setData] = useState<CreditsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showPurchaseModal, setShowPurchaseModal] = useState(false);
  const [purchaseAmount, setPurchaseAmount] = useState<number>(1000);
  const [copied, setCopied] = useState(false);

  const depositAddress = '0x742d35Cc6634C0532925a3b844Bc9e7595f8A72B';

  const fetchCredits = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/dashboard/credits');
      if (!res.ok) throw new Error('Failed to fetch');
      const credits = await res.json();
      setData(credits);
    } catch (error) {
      console.error('Fetch error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchCredits();
  }, []);

  const calculatePrice = (amount: number) => {
    if (amount >= 10001) return amount * 0.007;
    if (amount >= 1001) return amount * 0.008;
    if (amount >= 101) return amount * 0.009;
    return amount * 0.01;
  };

  const calculateBonus = (amount: number) => {
    if (amount >= 10001) return Math.floor(amount * 0.30);
    if (amount >= 1001) return Math.floor(amount * 0.20);
    if (amount >= 101) return Math.floor(amount * 0.10);
    return 0;
  };

  const copyAddress = () => {
    navigator.clipboard.writeText(depositAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Calculate estimated days remaining
  const estDaysRemaining = data && data.usedLast30Days > 0 
    ? Math.round((data.balance / (data.usedLast30Days / 30)))
    : '∞';

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
        };
        return (
          <span className={`px-2 py-1 text-xs rounded ${typeStyles[tx.type] || 'bg-gray-500/20 text-gray-400'}`}>
            {tx.type.replace('_', ' ')}
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
            Purchase Credits
          </Button>
        </div>
      </div>

      {/* Credit Balance */}
      <CreditBalanceCard
        balance={data?.balance || 0}
        lowBalanceThreshold={500}
        onPurchase={() => setShowPurchaseModal(true)}
      />

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="py-3">
            <p className="text-sm text-gray-400">Lifetime Purchased</p>
            <p className="text-2xl font-bold text-white">{data?.lifetimePurchased.toLocaleString() || 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3">
            <p className="text-sm text-gray-400">Lifetime Used</p>
            <p className="text-2xl font-bold text-white">{data?.lifetimeUsed.toLocaleString() || 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3">
            <p className="text-sm text-gray-400">Used (30 days)</p>
            <p className="text-2xl font-bold text-white">{data?.usedLast30Days.toLocaleString() || 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3">
            <p className="text-sm text-gray-400">Est. Days Remaining</p>
            <p className="text-2xl font-bold text-cyan-400">~{estDaysRemaining}</p>
          </CardContent>
        </Card>
      </div>

      {/* Credit Pricing */}
      <Card>
        <CardHeader>
          <h3 className="font-semibold text-white">Credit Pricing</h3>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-4 gap-4">
            {creditPricing.map((tier, i) => (
              <div key={i} className="p-4 bg-gray-800/50 rounded-lg text-center">
                <p className="text-sm text-gray-400 mb-2">{tier.range} credits</p>
                <p className="text-2xl font-bold text-white">${tier.price}</p>
                <p className="text-xs text-gray-500">per credit</p>
                {tier.bonus > 0 && (
                  <p className="mt-2 text-xs text-cyan-400">+{tier.bonus}% bonus</p>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

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
        onClose={() => setShowPurchaseModal(false)}
        title="Purchase Credits"
        size="lg"
      >
        <div className="space-y-6">
          {/* Amount Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Credit Amount
            </label>
            <div className="grid grid-cols-4 gap-2 mb-4">
              {[100, 500, 1000, 5000].map((amount) => (
                <button
                  key={amount}
                  onClick={() => setPurchaseAmount(amount)}
                  className={`p-3 rounded-lg border text-center transition-colors ${
                    purchaseAmount === amount
                      ? 'border-cyan-400 bg-cyan-400/10 text-cyan-400'
                      : 'border-gray-700 bg-gray-800/50 text-gray-300 hover:border-gray-600'
                  }`}
                >
                  {amount.toLocaleString()}
                </button>
              ))}
            </div>
            <input
              type="number"
              value={purchaseAmount}
              onChange={(e) => setPurchaseAmount(Number(e.target.value))}
              min={1}
              className="w-full px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-cyan-400/50"
              placeholder="Custom amount"
            />
          </div>

          {/* Price Calculation */}
          <div className="p-4 bg-gray-800/50 rounded-lg space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Credits</span>
              <span className="text-white">{purchaseAmount.toLocaleString()}</span>
            </div>
            {calculateBonus(purchaseAmount) > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Bonus Credits</span>
                <span className="text-cyan-400">+{calculateBonus(purchaseAmount).toLocaleString()}</span>
              </div>
            )}
            <div className="flex justify-between text-sm pt-2 border-t border-gray-700">
              <span className="text-gray-400">Total Credits</span>
              <span className="text-white font-medium">
                {(purchaseAmount + calculateBonus(purchaseAmount)).toLocaleString()}
              </span>
            </div>
            <div className="flex justify-between text-lg pt-2 border-t border-gray-700">
              <span className="text-gray-300">Total Price</span>
              <span className="text-cyan-400 font-bold">${calculatePrice(purchaseAmount).toFixed(2)} USDC</span>
            </div>
          </div>

          {/* Deposit Instructions */}
          <div className="p-4 bg-cyan-400/5 border border-cyan-400/20 rounded-lg">
            <div className="flex items-center gap-2 mb-3">
              <WalletIcon className="w-5 h-5 text-cyan-400" />
              <span className="font-medium text-white">Send USDC to this address</span>
            </div>
            <div className="flex items-center gap-2">
              <code className="flex-1 p-3 bg-gray-900 rounded-lg text-sm text-gray-300 font-mono overflow-x-auto">
                {depositAddress}
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
              Send exactly ${calculatePrice(purchaseAmount).toFixed(2)} USDC on Base network. 
              Credits will be added automatically after 1 confirmation.
            </p>
          </div>

          {/* Network Selection */}
          <div className="flex gap-2">
            <button className="flex-1 p-3 bg-cyan-400/10 border border-cyan-400/30 rounded-lg text-cyan-400">
              Base
            </button>
            <button className="flex-1 p-3 bg-gray-800 border border-gray-700 rounded-lg text-gray-400 hover:border-gray-600">
              Ethereum
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
