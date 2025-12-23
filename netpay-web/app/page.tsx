import Link from "next/link";

export default function Home() {
  return (
    <div className="min-h-screen bg-neutral-950 text-white">
      {/* Navigation */}
      <nav className="border-b border-neutral-800">
        <div className="max-w-6xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <Link href="/" className="flex items-center gap-2">
              <div className="w-8 h-8 bg-amber-500 rounded-lg flex items-center justify-center">
                <span className="text-black font-bold text-sm">N</span>
              </div>
              <span className="text-xl font-semibold text-white">NetPay</span>
            </Link>
            <div className="flex items-center gap-6">
              <Link href="#features" className="text-neutral-400 hover:text-white transition-colors text-sm">
                Features
              </Link>
              <Link href="#pricing" className="text-neutral-400 hover:text-white transition-colors text-sm">
                Pricing
              </Link>
              <Link href="/login" className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-black font-medium rounded-lg transition-colors text-sm">
                Get Started
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-6xl mx-auto px-6 py-24">
        <div className="max-w-3xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-amber-500/10 border border-amber-500/20 rounded-full text-amber-500 text-xs font-medium mb-6">
            <span className="w-1.5 h-1.5 bg-amber-500 rounded-full"></span>
            Now supporting Base, Ethereum, Optimism
          </div>
          <h1 className="text-5xl font-bold mb-6 leading-tight">
            Accept crypto payments
            <span className="text-amber-500"> without the complexity</span>
          </h1>
          <p className="text-neutral-400 text-lg mb-8 leading-relaxed">
            NetPay handles blockchain transactions so you don&apos;t have to. 
            Simple API, instant settlements, and enterprise-grade security.
          </p>
          <div className="flex gap-4">
            <Link 
              href="/login"
              className="px-6 py-3 bg-amber-500 hover:bg-amber-400 text-black font-semibold rounded-lg transition-colors"
            >
              Start Integration
            </Link>
            <Link 
              href="https://demo.netpay.id"
              className="px-6 py-3 border border-neutral-700 hover:border-neutral-600 text-white font-medium rounded-lg transition-colors"
            >
              View Demo
            </Link>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="border-y border-neutral-800 bg-neutral-900/50">
        <div className="max-w-6xl mx-auto px-6 py-12">
          <div className="grid grid-cols-4 gap-8">
            <div>
              <div className="text-3xl font-bold text-white mb-1">&lt;2s</div>
              <div className="text-neutral-500 text-sm">Settlement Time</div>
            </div>
            <div>
              <div className="text-3xl font-bold text-white mb-1">0.5%</div>
              <div className="text-neutral-500 text-sm">Transaction Fee</div>
            </div>
            <div>
              <div className="text-3xl font-bold text-white mb-1">5+</div>
              <div className="text-neutral-500 text-sm">Networks</div>
            </div>
            <div>
              <div className="text-3xl font-bold text-white mb-1">24/7</div>
              <div className="text-neutral-500 text-sm">Uptime</div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="max-w-6xl mx-auto px-6 py-24">
        <div className="text-center mb-16">
          <h2 className="text-3xl font-bold mb-4">Built for developers</h2>
          <p className="text-neutral-400">Everything you need to accept crypto payments</p>
        </div>
        <div className="grid md:grid-cols-3 gap-6">
          <div className="p-6 bg-neutral-900 border border-neutral-800 rounded-xl">
            <div className="w-10 h-10 bg-amber-500/10 rounded-lg flex items-center justify-center mb-4">
              <svg className="w-5 h-5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold mb-2">Instant Settlement</h3>
            <p className="text-neutral-400 text-sm">Payments confirmed and settled in under 2 seconds with our optimized infrastructure.</p>
          </div>
          <div className="p-6 bg-neutral-900 border border-neutral-800 rounded-xl">
            <div className="w-10 h-10 bg-amber-500/10 rounded-lg flex items-center justify-center mb-4">
              <svg className="w-5 h-5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold mb-2">Non-Custodial</h3>
            <p className="text-neutral-400 text-sm">Funds go directly to your wallet. We never hold your crypto.</p>
          </div>
          <div className="p-6 bg-neutral-900 border border-neutral-800 rounded-xl">
            <div className="w-10 h-10 bg-amber-500/10 rounded-lg flex items-center justify-center mb-4">
              <svg className="w-5 h-5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold mb-2">Simple API</h3>
            <p className="text-neutral-400 text-sm">Two endpoints. That&apos;s it. Verify payment, settle funds.</p>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="border-t border-neutral-800 bg-neutral-900/30">
        <div className="max-w-6xl mx-auto px-6 py-24">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold mb-4">How it works</h2>
            <p className="text-neutral-400">Three steps to accept payments</p>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            <div className="text-center">
              <div className="w-12 h-12 bg-amber-500 text-black font-bold text-xl rounded-full flex items-center justify-center mx-auto mb-4">1</div>
              <h3 className="font-semibold mb-2">Customer pays</h3>
              <p className="text-neutral-400 text-sm">Customer signs a payment authorization from their wallet</p>
            </div>
            <div className="text-center">
              <div className="w-12 h-12 bg-amber-500 text-black font-bold text-xl rounded-full flex items-center justify-center mx-auto mb-4">2</div>
              <h3 className="font-semibold mb-2">You verify</h3>
              <p className="text-neutral-400 text-sm">Call our API to verify the payment signature is valid</p>
            </div>
            <div className="text-center">
              <div className="w-12 h-12 bg-amber-500 text-black font-bold text-xl rounded-full flex items-center justify-center mx-auto mb-4">3</div>
              <h3 className="font-semibold mb-2">Instant settlement</h3>
              <p className="text-neutral-400 text-sm">We settle the funds directly to your wallet</p>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="max-w-6xl mx-auto px-6 py-24">
        <div className="text-center mb-16">
          <h2 className="text-3xl font-bold mb-4">Simple pricing</h2>
          <p className="text-neutral-400">Pay per transaction. No monthly fees.</p>
        </div>
        <div className="max-w-md mx-auto">
          <div className="p-8 bg-neutral-900 border border-neutral-800 rounded-xl text-center">
            <div className="text-5xl font-bold mb-2">0.5%</div>
            <div className="text-neutral-400 mb-6">per successful transaction</div>
            <ul className="text-left space-y-3 mb-8">
              <li className="flex items-center gap-3 text-sm">
                <svg className="w-5 h-5 text-amber-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-neutral-300">Unlimited transactions</span>
              </li>
              <li className="flex items-center gap-3 text-sm">
                <svg className="w-5 h-5 text-amber-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-neutral-300">All networks included</span>
              </li>
              <li className="flex items-center gap-3 text-sm">
                <svg className="w-5 h-5 text-amber-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-neutral-300">Dashboard &amp; analytics</span>
              </li>
              <li className="flex items-center gap-3 text-sm">
                <svg className="w-5 h-5 text-amber-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-neutral-300">100 free testnet credits</span>
              </li>
            </ul>
            <Link 
              href="/login"
              className="block w-full py-3 bg-amber-500 hover:bg-amber-400 text-black font-semibold rounded-lg transition-colors"
            >
              Get Started Free
            </Link>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-neutral-800">
        <div className="max-w-6xl mx-auto px-6 py-16">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold mb-2">Ready to accept crypto?</h2>
              <p className="text-neutral-400">Set up in minutes with our simple API.</p>
            </div>
            <Link 
              href="/login"
              className="px-6 py-3 bg-amber-500 hover:bg-amber-400 text-black font-semibold rounded-lg transition-colors"
            >
              Start Integration
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-neutral-800 bg-neutral-900/50">
        <div className="max-w-6xl mx-auto px-6 py-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 bg-amber-500 rounded flex items-center justify-center">
                <span className="text-black font-bold text-xs">N</span>
              </div>
              <span className="text-sm text-neutral-500">NetPay © 2025</span>
            </div>
            <div className="flex items-center gap-6 text-sm text-neutral-500">
              <Link href="/dashboard/docs" className="hover:text-white transition-colors">Documentation</Link>
              <a href="https://github.com/anthropics/x402" className="hover:text-white transition-colors">GitHub</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
