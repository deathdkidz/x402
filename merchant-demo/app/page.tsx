'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

export default function HomePage() {
  const [apiKey, setApiKey] = useState('');
  const [savedApiKey, setSavedApiKey] = useState('');

  const handleSaveApiKey = () => {
    if (apiKey.trim()) {
      setSavedApiKey(apiKey.trim());
      localStorage.setItem('x402_api_key', apiKey.trim());
    }
  };

  // Load API key from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem('x402_api_key');
    if (stored) {
      setSavedApiKey(stored);
      setApiKey(stored);
    }
  }, []);

  const handleClearApiKey = () => {
    setApiKey('');
    setSavedApiKey('');
    localStorage.removeItem('x402_api_key');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="inline-block bg-gradient-to-br from-cyan-500 to-blue-600 p-3 rounded-xl shadow-lg shadow-cyan-900/50 mb-4">
            <svg className="w-12 h-12 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <h1 className="text-4xl font-bold text-slate-100 mb-2">
            x402 Facilitator Demo
          </h1>
          <p className="text-slate-400">
            Test and demo application for x402 payment protocol
          </p>
        </div>

        {/* API Key Input */}
        <div className="bg-slate-800/30 backdrop-blur-sm border border-slate-700/30 rounded-xl p-6 mb-8">
          <h2 className="text-xl font-bold text-slate-100 mb-4">API Configuration</h2>
          
          {!savedApiKey ? (
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-slate-400 mb-2">Enter your x402 API Key</label>
                <input
                  type="text"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="your-api-key-here"
                  className="w-full px-4 py-2.5 bg-slate-900/60 border border-slate-700/40 rounded-lg text-slate-100 text-sm placeholder-slate-500 focus:outline-none focus:border-cyan-500/60 focus:ring-1 focus:ring-cyan-500/20 font-mono"
                />
              </div>
              <button
                onClick={handleSaveApiKey}
                disabled={!apiKey.trim()}
                className="btn-primary px-6 py-2.5 rounded-lg font-semibold text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Save API Key
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-3">
                <div className="flex items-center gap-2">
                  <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="text-emerald-300 text-sm font-medium">API Key Configured</span>
                </div>
                <button
                  onClick={handleClearApiKey}
                  className="text-xs text-red-400 hover:text-red-300 transition-colors"
                >
                  Clear
                </button>
              </div>
              <div className="text-xs text-slate-500 font-mono break-all bg-slate-900/60 px-3 py-2 rounded border border-slate-700/40">
                {savedApiKey}
              </div>
            </div>
          )}
        </div>

        {/* Navigation Cards */}
        {savedApiKey && (
          <div className="grid md:grid-cols-2 gap-6">
            {/* Test Page */}
            <Link
              href="/test"
              className="group relative bg-gradient-to-br from-slate-800/80 via-slate-800/60 to-slate-900/80 backdrop-blur-xl border border-cyan-500/20 rounded-xl overflow-hidden shadow-lg transition-all duration-300 hover:scale-105 hover:border-cyan-500/40"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/5 to-transparent pointer-events-none"></div>
              
              <div className="relative p-6">
                <div className="text-5xl mb-4">🧪</div>
                
                <h3 className="text-xl font-bold text-slate-100 mb-2">
                  API Testing
                </h3>
                
                <p className="text-sm text-slate-400 mb-4">
                  Test all x402 facilitator endpoints:
                </p>
                
                <ul className="space-y-2 text-sm text-slate-500">
                  <li className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 bg-cyan-400 rounded-full"></span>
                    Health Check
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 bg-cyan-400 rounded-full"></span>
                    Generate Payment Payload
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 bg-cyan-400 rounded-full"></span>
                    Verify Signature
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 bg-cyan-400 rounded-full"></span>
                    Settle Payment
                  </li>
                </ul>
                
                <div className="mt-4 text-cyan-400 text-sm font-medium group-hover:translate-x-1 transition-transform">
                  Start Testing →
                </div>
              </div>
            </Link>

            {/* Demo Page */}
            <Link
              href="/demo"
              className="group relative bg-gradient-to-br from-slate-800/80 via-slate-800/60 to-slate-900/80 backdrop-blur-xl border border-pink-500/20 rounded-xl overflow-hidden shadow-lg transition-all duration-300 hover:scale-105 hover:border-pink-500/40"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-pink-500/5 to-transparent pointer-events-none"></div>
              
              <div className="relative p-6">
                <div className="text-5xl mb-4">🐱</div>
                
                <h3 className="text-xl font-bold text-slate-100 mb-2">
                  Payment Demo
                </h3>
                
                <p className="text-sm text-slate-400 mb-4">
                  Real payment flow demonstration
                </p>
                
                <ul className="space-y-2 text-sm text-slate-500">
                  <li className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 bg-pink-400 rounded-full"></span>
                    Funny Cat Image (Locked)
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 bg-pink-400 rounded-full"></span>
                    Pay 0.01 USDC to unlock
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 bg-pink-400 rounded-full"></span>
                    x402 Payment Flow
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 bg-pink-400 rounded-full"></span>
                    Base Sepolia Network
                  </li>
                </ul>
                
                <div className="mt-4 text-pink-400 text-sm font-medium group-hover:translate-x-1 transition-transform">
                  Try Demo →
                </div>
              </div>
            </Link>
          </div>
        )}

        {/* Info Section */}
        {!savedApiKey && (
          <div className="mt-8 bg-blue-500/10 border border-blue-500/20 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <svg className="w-5 h-5 text-blue-400 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div className="text-sm text-blue-300">
                <p className="font-semibold mb-1">Get your API Key</p>
                <p className="text-blue-400/70">
                  Visit the merchant registration page or use the facilitator API to register and get your API key.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
