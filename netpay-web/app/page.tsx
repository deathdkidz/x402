import Link from "next/link";

export default function Home() {
  return (
    <div className="min-h-screen bg-black text-white relative overflow-hidden">
      {/* Animated Grid Background */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#0f172a_1px,transparent_1px),linear-gradient(to_bottom,#0f172a_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_80%_50%_at_50%_0%,#000_70%,transparent_110%)]" />
      
      {/* Glow Effects */}
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-cyan-500/30 rounded-full blur-[120px] animate-pulse" />
      <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-purple-500/20 rounded-full blur-[120px] animate-pulse delay-1000" />
      
      <div className="relative z-10 container mx-auto px-4 py-16">
        {/* Hero Section */}
        <div className="text-center mb-20 pt-12">
          <div className="inline-block mb-6">
            <span className="text-cyan-400 font-mono text-sm tracking-wider border border-cyan-500/30 px-4 py-2 rounded-full bg-cyan-500/10 backdrop-blur-sm">
              &gt; PROTOCOL READY
            </span>
          </div>
          <h1 className="text-7xl font-bold mb-6 bg-gradient-to-r from-cyan-400 via-purple-400 to-pink-400 bg-clip-text text-transparent animate-gradient">
            NetPay
          </h1>
          <div className="text-2xl text-gray-300 mb-4 font-light tracking-wide">
            <span className="text-cyan-400 font-mono">X-402</span> Payment Protocol
          </div>
          <p className="text-gray-500 max-w-2xl mx-auto text-lg">
            Lightning-fast blockchain payments for the decentralized web
          </p>
        </div>

        {/* Feature Cards */}
        <div className="grid md:grid-cols-2 gap-6 max-w-5xl mx-auto mb-20">
          <Link 
            href="https://demo.netpay.id" 
            className="group relative block p-8 bg-gradient-to-br from-slate-900/90 to-slate-800/90 border border-cyan-500/20 rounded-2xl hover:border-cyan-500/50 transition-all duration-300 hover:shadow-[0_0_30px_rgba(34,211,238,0.15)] backdrop-blur-sm"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/0 to-cyan-500/5 opacity-0 group-hover:opacity-100 transition-opacity rounded-2xl" />
            <div className="relative">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center">
                  <svg className="w-6 h-6 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
                <h2 className="text-3xl font-bold text-white">Demo</h2>
              </div>
              <p className="text-gray-400 leading-relaxed">
                Experience X-402 in action. Interactive tutorials and live examples of blockchain-powered micropayments.
              </p>
              <div className="mt-6 flex items-center text-cyan-400 font-mono text-sm">
                <span>Launch Demo</span>
                <svg className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </div>
          </Link>

          <Link 
            href="/dashboard" 
            className="group relative block p-8 bg-gradient-to-br from-slate-900/90 to-slate-800/90 border border-purple-500/20 rounded-2xl hover:border-purple-500/50 transition-all duration-300 hover:shadow-[0_0_30px_rgba(168,85,247,0.15)] backdrop-blur-sm"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-purple-500/0 to-purple-500/5 opacity-0 group-hover:opacity-100 transition-opacity rounded-2xl" />
            <div className="relative">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-xl bg-purple-500/10 border border-purple-500/30 flex items-center justify-center">
                  <svg className="w-6 h-6 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                </div>
                <h2 className="text-3xl font-bold text-white">Dashboard</h2>
              </div>
              <p className="text-gray-400 leading-relaxed">
                Monitor transactions, manage your merchant account, and track payment analytics in real-time.
              </p>
              <div className="mt-6 flex items-center text-purple-400 font-mono text-sm">
                <span>Open Dashboard</span>
                <svg className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </div>
          </Link>
        </div>

        {/* Protocol Info Section */}
        <div className="max-w-4xl mx-auto">
          <div className="relative p-10 bg-gradient-to-br from-slate-900/60 to-slate-800/60 border border-slate-700/50 rounded-2xl backdrop-blur-xl">
            <div className="absolute -top-4 left-8">
              <span className="bg-black border border-cyan-500/50 text-cyan-400 px-4 py-2 rounded-lg text-sm font-mono">
                &lt;/&gt; PROTOCOL.X402
              </span>
            </div>
            <h3 className="text-3xl font-bold text-white mb-6 mt-4">What is X-402?</h3>
            <p className="text-gray-300 text-lg leading-relaxed mb-6">
              X-402 is a revolutionary payment protocol that enables <span className="text-cyan-400 font-semibold">seamless blockchain-based payments</span> for web resources and services. Built for speed, security, and the decentralized future.
            </p>
            <div className="grid sm:grid-cols-3 gap-4 mt-8">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
                <div>
                  <div className="text-white font-semibold mb-1">Instant</div>
                  <div className="text-gray-500 text-sm">Sub-second settlement</div>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg bg-purple-500/10 border border-purple-500/30 flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </div>
                <div>
                  <div className="text-white font-semibold mb-1">Secure</div>
                  <div className="text-gray-500 text-sm">EIP-712 signatures</div>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg bg-pink-500/10 border border-pink-500/30 flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5 text-pink-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                  </svg>
                </div>
                <div>
                  <div className="text-white font-semibold mb-1">Flexible</div>
                  <div className="text-gray-500 text-sm">Multi-chain support</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center mt-20 pb-8">
          <div className="text-gray-600 font-mono text-sm">
            <span className="text-cyan-400">$</span> netpay.protocol --version 1.0.0
          </div>
        </div>
      </div>
    </div>
  );
}
