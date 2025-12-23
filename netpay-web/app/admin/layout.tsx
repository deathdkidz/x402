'use client';

import { ReactNode } from 'react';
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

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-black text-white">
      <Sidebar
        items={adminNavItems}
        title="X402 Admin"
        subtitle="Control Panel"
        footer={
          <div className="text-xs text-gray-500">
            <p>Logged in as</p>
            <p className="text-cyan-400 font-medium">admin@x402.io</p>
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
