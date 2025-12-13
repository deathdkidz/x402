import Link from "next/link";

export default function Home() {
  return (
    <div className="min-h-screen bg-black text-white relative overflow-hidden">
      {/* Hexagonal Pattern Background */}
      <div className="absolute inset-0 opacity-20">
        <div className="absolute inset-0" style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='52' viewBox='0 0 60 52' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M30 0l25.98 15v22L30 52 4.02 37V15z' fill='none' stroke='%2300ffff' stroke-width='0.5'/%3E%3C/svg%3E")`,
          backgroundSize: '60px 52px'
        }} />
      </div>

      {/* Subtle Border Frame */}
      <div className="fixed inset-0 pointer-events-none z-50">
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-cyan-400/40 to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-cyan-400/40 to-transparent" />
        <div className="absolute top-0 left-0 bottom-0 w-px bg-gradient-to-b from-transparent via-cyan-400/40 to-transparent" />
        <div className="absolute top-0 right-0 bottom-0 w-px bg-gradient-to-b from-transparent via-cyan-400/40 to-transparent" />
        
        {/* Corner indicators */}
        <div className="absolute top-0 left-0 w-12 h-12 border-t-2 border-l-2 border-cyan-400/50" />
        <div className="absolute top-0 right-0 w-12 h-12 border-t-2 border-r-2 border-cyan-400/50" />
        <div className="absolute bottom-0 left-0 w-12 h-12 border-b-2 border-l-2 border-cyan-400/50" />
        <div className="absolute bottom-0 right-0 w-12 h-12 border-b-2 border-r-2 border-cyan-400/50" />
      </div>
      
      {/* Navigation */}
      <nav className="relative z-20 container mx-auto px-16 pt-8 pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-3xl font-bold tracking-tight">
              <span className="text-cyan-400">X402</span>{' '}
              <span className="text-white font-light">PROTOCOL</span>
            </span>
          </div>
          <div className="flex items-center gap-8">
            <Link href="#technology" className="text-gray-300 hover:text-cyan-400 transition-colors text-sm">Technology</Link>
            <Link href="#security" className="text-gray-300 hover:text-cyan-400 transition-colors text-sm">Security</Link>
            <Link href="#assets" className="text-gray-300 hover:text-cyan-400 transition-colors text-sm">Assets</Link>
            <Link href="/blog" className="text-gray-300 hover:text-cyan-400 transition-colors text-sm">Blog</Link>
            <Link 
              href="https://demo.netpay.id"
              className="px-5 py-2 border border-cyan-400 text-cyan-400 hover:bg-cyan-400 hover:text-black transition-all text-sm font-medium"
            >
              Launch App
            </Link>
          </div>
        </div>
      </nav>

      <div className="relative z-10 container mx-auto px-16 py-12">
        {/* Hero Section */}
        <div className="grid lg:grid-cols-2 gap-20 items-center mb-32 mt-12">
          <div>
            <div className="inline-block mb-6 px-4 py-2 border border-cyan-400/40 text-cyan-400 text-xs font-mono tracking-wider">
              PROTOCOL v1.0
            </div>
            <h1 className="text-6xl font-bold mb-8 leading-tight text-white">
              THE X402 PROTOCOL
            </h1>
            <p className="text-gray-400 text-xl leading-relaxed mb-8 max-w-xl">
              Enterprise-grade payment infrastructure enabling instant, secure blockchain transactions for web3 applications.
            </p>
            <div className="flex gap-4">
              <Link 
                href="https://demo.netpay.id"
                className="px-8 py-4 bg-cyan-400 text-black hover:bg-cyan-300 transition-colors font-semibold"
              >
                Get Started
              </Link>
              <Link 
                href="#technology"
                className="px-8 py-4 border border-gray-700 text-gray-300 hover:border-cyan-400/50 hover:text-cyan-400 transition-all font-semibold"
              >
                Learn More
              </Link>
            </div>
            
            {/* Stats */}
            <div className="grid grid-cols-3 gap-8 mt-16 pt-12 border-t border-gray-800">
              <div>
                <div className="text-3xl font-bold text-cyan-400 mb-1">&lt;100ms</div>
                <div className="text-gray-500 text-sm">Transaction Time</div>
              </div>
              <div>
                <div className="text-3xl font-bold text-cyan-400 mb-1">256-bit</div>
                <div className="text-gray-500 text-sm">Encryption</div>
              </div>
              <div>
                <div className="text-3xl font-bold text-cyan-400 mb-1">Multi-Chain</div>
                <div className="text-gray-500 text-sm">Support</div>
              </div>
            </div>
          </div>
          
          {/* 3D Cube Wireframe - More subtle */}
          <div className="relative h-96 flex items-center justify-center">
            <div className="relative w-80 h-80">
              <svg viewBox="0 0 200 200" className="w-full h-full opacity-60">
                <defs>
                  <linearGradient id="cubeGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#00ffff" stopOpacity="0.4" />
                    <stop offset="100%" stopColor="#00ffff" stopOpacity="0.1" />
                  </linearGradient>
                </defs>
                <path d="M60 40 L140 40 L140 120 L60 120 Z" fill="none" stroke="url(#cubeGrad)" strokeWidth="1" opacity="0.3" />
                <path d="M40 80 L120 80 L120 160 L40 160 Z" fill="none" stroke="#00ffff" strokeWidth="1.5" />
                <line x1="40" y1="80" x2="60" y2="40" stroke="#00ffff" strokeWidth="1" opacity="0.4" />
                <line x1="120" y1="80" x2="140" y2="40" stroke="#00ffff" strokeWidth="1" opacity="0.4" />
                <line x1="120" y1="160" x2="140" y2="120" stroke="#00ffff" strokeWidth="1" opacity="0.4" />
                <line x1="40" y1="160" x2="60" y2="120" stroke="#00ffff" strokeWidth="1" opacity="0.4" />
              </svg>
              <div className="absolute inset-0 bg-cyan-400/5 blur-[100px]" />
            </div>
          </div>
        </div>

        {/* Core Features */}
        <div className="mb-32">
          <h2 className="text-4xl font-bold text-white mb-16 text-center">Core Capabilities</h2>
          <div className="grid md:grid-cols-3 gap-8">
            {/* High-Performance Transactions */}
            <div className="p-10 bg-gradient-to-br from-gray-900 to-black border border-gray-800 hover:border-cyan-400/40 transition-all">
              <div className="w-14 h-14 mb-6 flex items-center justify-center border border-cyan-400/50">
                <svg className="w-8 h-8 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <h3 className="text-white text-2xl font-semibold mb-4">High-Performance Transactions</h3>
              <p className="text-gray-400 leading-relaxed mb-6">
                Sub-100ms transaction processing with optimized gas routing across multiple chains.
              </p>
              <ul className="space-y-2 text-gray-500 text-sm">
                <li className="flex items-start gap-2">
                  <span className="text-cyan-400 mt-1">▹</span>
                  <span>Instant verification via EIP-712 signatures</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-cyan-400 mt-1">▹</span>
                  <span>Automatic failover and retry mechanisms</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-cyan-400 mt-1">▹</span>
                  <span>Real-time settlement tracking</span>
                </li>
              </ul>
            </div>

            {/* Enterprise Security */}
            <div className="p-10 bg-gradient-to-br from-gray-900 to-black border border-gray-800 hover:border-cyan-400/40 transition-all">
              <div className="w-14 h-14 mb-6 flex items-center justify-center border border-cyan-400/50">
                <svg className="w-8 h-8 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <h3 className="text-white text-2xl font-semibold mb-4">Enterprise Security</h3>
              <p className="text-gray-400 leading-relaxed mb-6">
                Military-grade encryption with S256 standards and comprehensive audit trails.
              </p>
              <ul className="space-y-2 text-gray-500 text-sm">
                <li className="flex items-start gap-2">
                  <span className="text-cyan-400 mt-1">▹</span>
                  <span>End-to-end encrypted payment flows</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-cyan-400 mt-1">▹</span>
                  <span>Non-custodial architecture</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-cyan-400 mt-1">▹</span>
                  <span>SOC 2 compliant infrastructure</span>
                </li>
              </ul>
            </div>

            {/* Multi-Chain Support */}
            <div className="p-10 bg-gradient-to-br from-gray-900 to-black border border-gray-800 hover:border-cyan-400/40 transition-all">
              <div className="w-14 h-14 mb-6 flex items-center justify-center border border-cyan-400/50">
                <svg className="w-8 h-8 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                </svg>
              </div>
              <h3 className="text-white text-2xl font-semibold mb-4">Multi-Chain Support</h3>
              <p className="text-gray-400 leading-relaxed mb-6">
                Unified API across Ethereum, Base, Polygon, and other EVM-compatible chains.
              </p>
              <ul className="space-y-2 text-gray-500 text-sm">
                <li className="flex items-start gap-2">
                  <span className="text-cyan-400 mt-1">▹</span>
                  <span>Automatic chain selection and routing</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-cyan-400 mt-1">▹</span>
                  <span>Cross-chain transaction monitoring</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-cyan-400 mt-1">▹</span>
                  <span>Unified settlement reporting</span>
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* How It Works */}
        <div id="technology" className="mb-32">
          <h2 className="text-4xl font-bold text-white mb-4 text-center">How It Works</h2>
          <p className="text-gray-500 text-center mb-16 max-w-2xl mx-auto">
            X-402 protocol implements a streamlined payment flow that balances security with user experience
          </p>
          
          <div className="grid md:grid-cols-4 gap-8">
            <div className="text-center">
              <div className="w-16 h-16 mx-auto mb-6 flex items-center justify-center border border-cyan-400/50 text-cyan-400 text-2xl font-bold">
                01
              </div>
              <h3 className="text-white font-semibold mb-3">Request Resource</h3>
              <p className="text-gray-500 text-sm">
                Client attempts to access protected content or API endpoint
              </p>
            </div>
            
            <div className="text-center">
              <div className="w-16 h-16 mx-auto mb-6 flex items-center justify-center border border-cyan-400/50 text-cyan-400 text-2xl font-bold">
                02
              </div>
              <h3 className="text-white font-semibold mb-3">Sign Payment</h3>
              <p className="text-gray-500 text-sm">
                User signs EIP-712 typed data with wallet, no gas required
              </p>
            </div>
            
            <div className="text-center">
              <div className="w-16 h-16 mx-auto mb-6 flex items-center justify-center border border-cyan-400/50 text-cyan-400 text-2xl font-bold">
                03
              </div>
              <h3 className="text-white font-semibold mb-3">Verify & Settle</h3>
              <p className="text-gray-500 text-sm">
                Facilitator validates signature and executes on-chain transfer
              </p>
            </div>
            
            <div className="text-center">
              <div className="w-16 h-16 mx-auto mb-6 flex items-center justify-center border border-cyan-400/50 text-cyan-400 text-2xl font-bold">
                04
              </div>
              <h3 className="text-white font-semibold mb-3">Access Granted</h3>
              <p className="text-gray-500 text-sm">
                Content delivered with transaction receipt in response header
              </p>
            </div>
          </div>
        </div>

        {/* Security Architecture */}
        <div id="security" className="mb-32 bg-gradient-to-br from-gray-900/50 to-black border border-gray-800 p-16">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div>
              <div className="inline-block mb-6 px-4 py-2 border border-emerald-400/40 text-emerald-400 text-xs font-mono tracking-wider">
                SECURITY
              </div>
              <h2 className="text-4xl font-bold text-white mb-6">Enterprise-Grade Security Architecture</h2>
              <p className="text-gray-400 text-lg leading-relaxed mb-8">
                Built on S256-bit encryption standards with proprietary X402 validation engine. Every transaction is cryptographically signed and verified before settlement.
              </p>
              
              <div className="space-y-4">
                <div className="flex items-start gap-4">
                  <div className="w-6 h-6 flex items-center justify-center border border-cyan-400/50 text-cyan-400 text-xs font-mono flex-shrink-0 mt-1">✓</div>
                  <div>
                    <div className="text-white font-semibold mb-1">EIP-712 Typed Signatures</div>
                    <div className="text-gray-500 text-sm">Human-readable signature prompts with replay protection</div>
                  </div>
                </div>
                
                <div className="flex items-start gap-4">
                  <div className="w-6 h-6 flex items-center justify-center border border-cyan-400/50 text-cyan-400 text-xs font-mono flex-shrink-0 mt-1">✓</div>
                  <div>
                    <div className="text-white font-semibold mb-1">Non-Custodial Model</div>
                    <div className="text-gray-500 text-sm">Users maintain full control of private keys and assets</div>
                  </div>
                </div>
                
                <div className="flex items-start gap-4">
                  <div className="w-6 h-6 flex items-center justify-center border border-cyan-400/50 text-cyan-400 text-xs font-mono flex-shrink-0 mt-1">✓</div>
                  <div>
                    <div className="text-white font-semibold mb-1">Real-Time Monitoring</div>
                    <div className="text-gray-500 text-sm">Comprehensive audit logs and anomaly detection</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="relative h-96 bg-black/40 border border-gray-800 p-8 flex items-center justify-center">
              <svg viewBox="0 0 300 300" className="w-full h-full opacity-40">
                <defs>
                  <linearGradient id="secGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#00ffff" stopOpacity="0.6" />
                    <stop offset="100%" stopColor="#10b981" stopOpacity="0.3" />
                  </linearGradient>
                </defs>
                <circle cx="150" cy="150" r="80" fill="none" stroke="url(#secGrad)" strokeWidth="2" />
                <circle cx="150" cy="150" r="100" fill="none" stroke="url(#secGrad)" strokeWidth="1" opacity="0.5" />
                <circle cx="150" cy="150" r="120" fill="none" stroke="url(#secGrad)" strokeWidth="1" opacity="0.3" />
                <circle cx="150" cy="70" r="8" fill="#00ffff" opacity="0.8" />
                <circle cx="210" cy="110" r="8" fill="#00ffff" opacity="0.8" />
                <circle cx="210" cy="190" r="8" fill="#00ffff" opacity="0.8" />
                <circle cx="150" cy="230" r="8" fill="#00ffff" opacity="0.8" />
                <circle cx="90" cy="190" r="8" fill="#00ffff" opacity="0.8" />
                <circle cx="90" cy="110" r="8" fill="#00ffff" opacity="0.8" />
                <line x1="150" y1="150" x2="150" y2="70" stroke="#00ffff" strokeWidth="1" opacity="0.4" />
                <line x1="150" y1="150" x2="210" y2="110" stroke="#00ffff" strokeWidth="1" opacity="0.4" />
                <line x1="150" y1="150" x2="210" y2="190" stroke="#00ffff" strokeWidth="1" opacity="0.4" />
                <line x1="150" y1="150" x2="150" y2="230" stroke="#00ffff" strokeWidth="1" opacity="0.4" />
                <line x1="150" y1="150" x2="90" y2="190" stroke="#00ffff" strokeWidth="1" opacity="0.4" />
                <line x1="150" y1="150" x2="90" y2="110" stroke="#00ffff" strokeWidth="1" opacity="0.4" />
                <circle cx="150" cy="150" r="12" fill="#000" stroke="#00ffff" strokeWidth="2" />
                <circle cx="150" cy="150" r="5" fill="#00ffff" />
              </svg>
            </div>
          </div>
        </div>

        {/* CTA Section */}
        <div className="text-center mb-32 py-20 border-t border-b border-gray-800">
          <h2 className="text-4xl font-bold text-white mb-6">Ready to Get Started?</h2>
          <p className="text-gray-400 text-lg mb-10 max-w-2xl mx-auto">
            Join the future of blockchain payments. Integrate X-402 into your application in minutes.
          </p>
          <div className="flex gap-4 justify-center">
            <Link 
              href="https://demo.netpay.id"
              className="px-8 py-4 bg-cyan-400 text-black hover:bg-cyan-300 transition-colors font-semibold"
            >
              Try Live Demo
            </Link>
            <Link 
              href="/dashboard"
              className="px-8 py-4 border border-gray-700 text-gray-300 hover:border-cyan-400/50 hover:text-cyan-400 transition-all font-semibold"
            >
              View Dashboard
            </Link>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center pb-12 pt-8 border-t border-cyan-400/20">
          <div className="text-gray-500 text-sm">
            © 2025 X402 Systems | <Link href="#" className="hover:text-cyan-400 transition-colors">Privacy Policy</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
