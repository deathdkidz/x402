'use client';

import { ReactNode } from 'react';

interface StatCardProps {
  title: string;
  value: string | number;
  change?: {
    value: number;
    type: 'increase' | 'decrease' | 'neutral';
  };
  icon?: ReactNode;
  subtitle?: string;
}

export function StatCard({ title, value, change, icon, subtitle }: StatCardProps) {
  return (
    <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-4 hover:border-gray-700 transition-colors">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-sm text-gray-400 mb-1">{title}</p>
          <p className="text-2xl font-bold text-white">{value}</p>
          {subtitle && <p className="text-xs text-gray-500 mt-1">{subtitle}</p>}
          {change && (
            <div className="flex items-center gap-1 mt-2">
              <span
                className={`text-sm font-medium ${
                  change.type === 'increase'
                    ? 'text-green-400'
                    : change.type === 'decrease'
                    ? 'text-red-400'
                    : 'text-gray-400'
                }`}
              >
                {change.type === 'increase' ? '↑' : change.type === 'decrease' ? '↓' : '•'}
                {Math.abs(change.value)}%
              </span>
              <span className="text-xs text-gray-500">vs last period</span>
            </div>
          )}
        </div>
        {icon && (
          <div className="p-2 bg-cyan-400/10 rounded-lg text-cyan-400">
            {icon}
          </div>
        )}
      </div>
    </div>
  );
}

interface CreditBalanceCardProps {
  balance: number;
  lowBalanceThreshold?: number;
  onPurchase?: () => void;
}

export function CreditBalanceCard({ balance, lowBalanceThreshold = 100, onPurchase }: CreditBalanceCardProps) {
  const isLow = balance < lowBalanceThreshold;

  return (
    <div
      className={`bg-gradient-to-br rounded-xl p-6 border ${
        isLow
          ? 'from-red-900/30 to-red-950/30 border-red-500/30'
          : 'from-cyan-900/30 to-cyan-950/30 border-cyan-500/30'
      }`}
    >
      <div className="flex items-center justify-between mb-4">
        <span className="text-sm font-medium text-gray-300">Credit Balance</span>
        {isLow && (
          <span className="px-2 py-1 text-xs bg-red-500/20 text-red-400 rounded-full border border-red-500/30">
            Low Balance
          </span>
        )}
      </div>
      <div className="flex items-end justify-between">
        <div>
          <p className={`text-4xl font-bold ${isLow ? 'text-red-400' : 'text-cyan-400'}`}>
            {balance.toLocaleString()}
          </p>
          <p className="text-sm text-gray-500 mt-1">credits available</p>
        </div>
        {onPurchase && (
          <button
            onClick={onPurchase}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              isLow
                ? 'bg-red-500 text-white hover:bg-red-400'
                : 'bg-cyan-400 text-black hover:bg-cyan-300'
            }`}
          >
            Purchase Credits
          </button>
        )}
      </div>
    </div>
  );
}

interface ProgressBarProps {
  value: number;
  max: number;
  label?: string;
  showPercentage?: boolean;
  color?: 'cyan' | 'green' | 'yellow' | 'red';
}

export function ProgressBar({ value, max, label, showPercentage = true, color = 'cyan' }: ProgressBarProps) {
  const percentage = Math.min(100, (value / max) * 100);
  
  const colorStyles = {
    cyan: 'bg-cyan-400',
    green: 'bg-green-400',
    yellow: 'bg-yellow-400',
    red: 'bg-red-400',
  };

  return (
    <div className="w-full">
      {(label || showPercentage) && (
        <div className="flex items-center justify-between mb-1.5">
          {label && <span className="text-sm text-gray-400">{label}</span>}
          {showPercentage && <span className="text-sm text-gray-500">{percentage.toFixed(0)}%</span>}
        </div>
      )}
      <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
        <div
          className={`h-full ${colorStyles[color]} rounded-full transition-all duration-500`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}
