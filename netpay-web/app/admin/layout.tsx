'use client';

import { ReactNode, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/ui';
import {
  DashboardIcon,
  UsersIcon,
  TransactionsIcon,
  ServerIcon,
  AnalyticsIcon,
  SettingsIcon,
  ShieldIcon,
  MonitorIcon,
} from '@/components/icons';

const adminNavItems = [
  { label: 'Overview', href: '/admin', icon: <DashboardIcon /> },
  { label: 'Merchants', href: '/admin/merchants', icon: <UsersIcon /> },
  { label: 'Settlements', href: '/admin/settlements', icon: <TransactionsIcon /> },
  { label: 'Paymasters', href: '/admin/paymasters', icon: <ServerIcon /> },
  { label: 'Analytics', href: '/admin/analytics', icon: <AnalyticsIcon /> },
  { label: 'System', href: '/admin/system', icon: <MonitorIcon /> },
  { label: 'Audit Log', href: '/admin/audit', icon: <ShieldIcon /> },
  { label: 'Settings', href: '/admin/settings', icon: <SettingsIcon /> },
];

interface AdminInfo {
  role: string;
  wallet: string;
}

export default function AdminLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [adminInfo, setAdminInfo] = useState<AdminInfo | null>(null);
  const [isValidating, setIsValidating] = useState(true);

  useEffect(() => {
    const validateAdmin = async () => {
      // Check if user is authenticated and is admin
      try {
        const res = await fetch('/api/auth/me');
        const data = await res.json();
        
        if (!data.authenticated) {
          router.push('/login');
          return;
        }

        // Check if wallet has admin access by checking localStorage flag set during login
        const hasAdminAccess = localStorage.getItem('admin_session_token');
        if (!hasAdminAccess) {
          router.push('/dashboard');
          return;
        }

        setAdminInfo({
          role: 'admin',
          wallet: data.merchant?.address || 'Unknown',
        });
      } catch {
        router.push('/login');
      } finally {
        setIsValidating(false);
      }
    };

    validateAdmin();
  }, [router]);

  const handleLogout = async () => {
    localStorage.removeItem('admin_session_token');
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
  };

  const handleSwitchToMerchant = () => {
    localStorage.removeItem('admin_session_token');
    router.push('/dashboard');
  };

  // Show loading while validating
  if (isValidating) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-400"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white">
      <Sidebar
        items={adminNavItems}
        title="X402 Admin"
        subtitle="Control Panel"
        footer={
          <div className="text-xs text-gray-500 space-y-2">
            <div>
              <p>Logged in as</p>
              <p className="text-cyan-400 font-medium truncate">
                {adminInfo?.wallet ? `${adminInfo.wallet.slice(0, 6)}...${adminInfo.wallet.slice(-4)}` : 'Admin'}
              </p>
            </div>
            <div className="space-y-1">
              <button
                onClick={handleSwitchToMerchant}
                className="block w-full text-left text-gray-400 hover:text-cyan-400 transition-colors"
              >
                → Merchant View
              </button>
              <button
                onClick={handleLogout}
                className="block w-full text-left text-gray-400 hover:text-red-400 transition-colors"
              >
                Sign out
              </button>
            </div>
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
