'use client';

import Link from 'next/link';

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
        {/* Header */}
        <div className="text-center mb-8 sm:mb-10">
          {/* X-402 Logo */}
          <div className="flex items-center justify-center gap-2 sm:gap-3 mb-3 sm:mb-4">
            <div className="relative">
              <div className="absolute inset-0 bg-cyan-500/20 blur-xl"></div>
              <svg className="relative w-8 h-8 sm:w-10 sm:h-10" viewBox="0 0 40 40" fill="none">
                <path d="M8 8L20 20L32 8" stroke="url(#grad1)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M32 32L20 20L8 32" stroke="url(#grad1)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
                <circle cx="20" cy="20" r="3" fill="url(#grad1)"/>
                <defs>
                  <linearGradient id="grad1" x1="8" y1="8" x2="32" y2="32">
                    <stop offset="0%" stopColor="#06b6d4"/>
                    <stop offset="100%" stopColor="#3b82f6"/>
                  </linearGradient>
                </defs>
              </svg>
            </div>
            <h1 className="text-3xl sm:text-4xl font-bold bg-gradient-to-r from-cyan-400 via-blue-400 to-purple-400 bg-clip-text text-transparent">
              X-402 Protocol
            </h1>
          </div>
          <p className="text-sm sm:text-base text-slate-400 max-w-xl mx-auto">
            HTTP 402 Payment Required - Blockchain-powered web payments
          </p>
        </div>

        {/* Navigation Cards */}
        <div className="grid md:grid-cols-2 gap-5 mb-6">
          {/* Tutorial Page */}
          <Link
            href="/tutorial"
            className="group bg-slate-800/40 border border-slate-700/40 rounded-lg p-5 transition-all duration-200 hover:border-cyan-500/40 hover:bg-slate-800/60"
          >
            <div className="flex items-start gap-3">
              <div className="p-2 bg-cyan-500/10 rounded-lg border border-cyan-500/20 flex-shrink-0">
                <svg className="w-5 h-5 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                </svg>
              </div>
              
              <div className="flex-1 min-w-0">
                <h3 className="text-base font-semibold text-slate-100 mb-1 flex items-center gap-2">
                  Interactive Tutorial
                  <span className="text-xs px-1.5 py-0.5 bg-cyan-500/20 text-cyan-300 rounded font-normal">Step-by-Step</span>
                </h3>
                
                <p className="text-xs text-slate-400 mb-2">
                  Learn X-402 protocol with interactive examples
                </p>
                
                <div className="flex flex-wrap gap-1.5">
                  <span className="text-xs px-2 py-0.5 bg-slate-700/50 text-slate-400 rounded">Payment Flow</span>
                  <span className="text-xs px-2 py-0.5 bg-slate-700/50 text-slate-400 rounded">Raw Data</span>
                  <span className="text-xs px-2 py-0.5 bg-slate-700/50 text-slate-400 rounded">Sign & Verify</span>
                </div>
              </div>
              
              <svg className="w-5 h-5 text-cyan-400 flex-shrink-0 mt-1 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </div>
          </Link>

          {/* Demo Page */}
          <Link
            href="/demo"
            className="group bg-slate-800/40 border border-slate-700/40 rounded-lg p-5 transition-all duration-200 hover:border-pink-500/40 hover:bg-slate-800/60"
          >
            <div className="flex items-start gap-3">
              <div className="p-2 bg-pink-500/10 rounded-lg border border-pink-500/20 flex-shrink-0">
                <svg className="w-5 h-5 text-pink-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              
              <div className="flex-1 min-w-0">
                <h3 className="text-base font-semibold text-slate-100 mb-1 flex items-center gap-2">
                  Live Payment Demo
                  <span className="text-xs px-1.5 py-0.5 bg-pink-500/20 text-pink-300 rounded font-normal">Real 402</span>
                </h3>
                
                <p className="text-xs text-slate-400 mb-2">
                  Experience HTTP 402 payment flow in action
                </p>
                
                <div className="flex flex-wrap gap-1.5">
                  <span className="text-xs px-2 py-0.5 bg-slate-700/50 text-slate-400 rounded">Premium Content</span>
                  <span className="text-xs px-2 py-0.5 bg-slate-700/50 text-slate-400 rounded">Crypto Payment</span>
                  <span className="text-xs px-2 py-0.5 bg-slate-700/50 text-slate-400 rounded">Instant Access</span>
                </div>
              </div>
              
              <svg className="w-5 h-5 text-pink-400 flex-shrink-0 mt-1 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </div>
          </Link>
        </div>

        {/* Documentation Link */}
        <div>
          <Link
            href="/docs"
            className="group bg-slate-800/40 border border-slate-700/40 rounded-lg p-5 transition-all duration-200 hover:border-purple-500/40 hover:bg-slate-800/60 block"
          >
            <div className="flex items-start gap-3">
              <div className="p-2 bg-purple-500/10 rounded-lg border border-purple-500/20 flex-shrink-0">
                <svg className="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              
              <div className="flex-1 min-w-0">
                <h3 className="text-base font-semibold text-slate-100 mb-1">
                  API Documentation
                </h3>
                <p className="text-xs text-slate-400">
                  Complete guide to all facilitator endpoints with examples
                </p>
              </div>
              
              <svg className="w-5 h-5 text-purple-400 flex-shrink-0 mt-1 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}
