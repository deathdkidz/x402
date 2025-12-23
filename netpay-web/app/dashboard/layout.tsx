'use client';

import { ReactNode, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/ui';
import { useAuth } from '@/lib/auth-context';
import {
  DashboardIcon,
  TransactionsIcon,
  WalletIcon,
  AnalyticsIcon,
  ResourcesIcon,
  SettingsIcon,
  DocumentationIcon,
  LogoutIcon,
} from '@/components/icons';

const merchantNavItems = [
  { label: 'Overview', href: '/dashboard', icon: <DashboardIcon /> },
  { label: 'Transactions', href: '/dashboard/transactions', icon: <TransactionsIcon /> },
  { label: 'Credits', href: '/dashboard/credits', icon: <WalletIcon /> },
  { label: 'Analytics', href: '/dashboard/analytics', icon: <AnalyticsIcon /> },
  { label: 'Resources', href: '/dashboard/resources', icon: <ResourcesIcon /> },
  { label: 'Settings', href: '/dashboard/settings', icon: <SettingsIcon /> },
  { label: 'Documentation', href: '/dashboard/docs', icon: <DocumentationIcon /> },
];

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { merchant, isAuthenticated, isLoading, logout } = useAuth();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push('/login');
    }
  }, [isLoading, isAuthenticated, router]);

  const handleLogout = async () => {
    await logout();
    router.push('/login');
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-2 border-cyan-400 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!isAuthenticated || !merchant) {
    return null;
  }

  return (
    <div className="min-h-screen bg-black text-white">
      <Sidebar
        items={merchantNavItems}
        title="NetPay"
        subtitle="Merchant Dashboard"
        footer={
          <div className="space-y-3">
            <div className="text-xs text-gray-500">
              <p>Logged in as</p>
              <p className="text-cyan-400 font-medium truncate">
                {merchant.businessName || `${merchant.address.slice(0, 6)}...${merchant.address.slice(-4)}`}
              </p>
              <p className="text-gray-600 mt-1 truncate text-[10px] font-mono">
                {merchant.address}
              </p>
            </div>
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
            >
              <LogoutIcon className="w-4 h-4" />
              Sign Out
            </button>
          </div>
        }
      />
      <main className="ml-64 min-h-screen">
        <div className="p-6">
          {children}
        </div>
      </main>
    </div>
  );
}
