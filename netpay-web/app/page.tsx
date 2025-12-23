import Link from "next/link";
import SignInButton from "./components/SignInButton";

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
            <div className="flex items-center gap-4">
              <Link href="/demo" className="text-sm text-neutral-400 hover:text-white transition-colors">
                Demo
              </Link>
              <Link href="/dashboard/docs" className="text-sm text-neutral-400 hover:text-white transition-colors">
                Docs
              </Link>
              <SignInButton size="sm" variant="primary">
                Sign In
              </SignInButton>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-6xl mx-auto px-6 py-20">
        <div className="max-w-3xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-amber-500/10 border border-amber-500/20 rounded-full text-amber-500 text-sm mb-6">
            <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
            Powered by HTTP 402
          </div>
          <h1 className="text-5xl font-bold mb-6 leading-tight">
            Accept USDC payments<br/>
            <span className="text-amber-500">in seconds</span>
          </h1>
          <p className="text-xl text-neutral-400 mb-8 max-w-xl mx-auto">
            The simplest way to monetize APIs with stablecoin payments. 
            Non-custodial, instant settlement, credit-based pricing.
          </p>
          <div className="flex justify-center gap-4">
            <SignInButton size="md" variant="primary">
              Get Started Free
            </SignInButton>
            <Link 
              href="/demo"
              className="px-6 py-3 border border-neutral-700 hover:border-neutral-600 text-white font-medium rounded-lg transition-colors inline-flex items-center gap-2"
            >
              Try Demo
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            </Link>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="border-t border-neutral-800 bg-neutral-900/30">
        <div className="max-w-6xl mx-auto px-6 py-16">
          <h2 className="text-2xl font-bold text-center mb-12">How It Works</h2>
          <div className="grid md:grid-cols-3 gap-8">
            <div className="text-center">
              <div className="w-12 h-12 bg-amber-500/10 rounded-xl flex items-center justify-center mx-auto mb-4">
                <span className="text-amber-500 font-bold">1</span>
              </div>
              <h3 className="font-semibold mb-2">Request Payment</h3>
              <p className="text-neutral-400 text-sm">
                Your API returns HTTP 402 with payment requirements. 
                Client signs ERC-3009 authorization.
              </p>
            </div>
            <div className="text-center">
              <div className="w-12 h-12 bg-amber-500/10 rounded-xl flex items-center justify-center mx-auto mb-4">
                <span className="text-amber-500 font-bold">2</span>
              </div>
              <h3 className="font-semibold mb-2">Verify & Settle</h3>
              <p className="text-neutral-400 text-sm">
                Call our /settle endpoint with the signed authorization. 
                We execute the transfer on-chain.
              </p>
            </div>
            <div className="text-center">
              <div className="w-12 h-12 bg-amber-500/10 rounded-xl flex items-center justify-center mx-auto mb-4">
                <span className="text-amber-500 font-bold">3</span>
              </div>
              <h3 className="font-semibold mb-2">Receive Funds</h3>
              <p className="text-neutral-400 text-sm">
                USDC is sent directly to your wallet. 
                No custody, no delays.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="max-w-6xl mx-auto px-6 py-16">
        <h2 className="text-2xl font-bold text-center mb-12">Why NetPay</h2>
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="p-5 bg-neutral-900 border border-neutral-800 rounded-xl">
            <div className="w-10 h-10 bg-amber-500/10 rounded-lg flex items-center justify-center mb-3">
              <svg className="w-5 h-5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <h3 className="font-semibold mb-1">Sub-Second Settlement</h3>
            <p className="text-neutral-400 text-sm">Flashblock-optimized for Base. Payments confirm in under 500ms.</p>
          </div>
          <div className="p-5 bg-neutral-900 border border-neutral-800 rounded-xl">
            <div className="w-10 h-10 bg-amber-500/10 rounded-lg flex items-center justify-center mb-3">
              <svg className="w-5 h-5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <h3 className="font-semibold mb-1">Non-Custodial</h3>
            <p className="text-neutral-400 text-sm">We never hold your funds. Payments go directly to your wallet.</p>
          </div>
          <div className="p-5 bg-neutral-900 border border-neutral-800 rounded-xl">
            <div className="w-10 h-10 bg-amber-500/10 rounded-lg flex items-center justify-center mb-3">
              <svg className="w-5 h-5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <h3 className="font-semibold mb-1">EIP-712 Secure</h3>
            <p className="text-neutral-400 text-sm">Standard ERC-3009 authorizations. Typed data signing for clarity.</p>
          </div>
          <div className="p-5 bg-neutral-900 border border-neutral-800 rounded-xl">
            <div className="w-10 h-10 bg-amber-500/10 rounded-lg flex items-center justify-center mb-3">
              <svg className="w-5 h-5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h3 className="font-semibold mb-1">Multi-Chain</h3>
            <p className="text-neutral-400 text-sm">Base, Ethereum, Optimism. Mainnet and testnet support.</p>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="border-t border-neutral-800 bg-neutral-900/30">
        <div className="max-w-6xl mx-auto px-6 py-16">
          <h2 className="text-2xl font-bold text-center mb-12">Simple Pricing</h2>
          <div className="max-w-lg mx-auto bg-neutral-900 border border-neutral-800 rounded-xl p-8">
            <div className="text-center mb-8">
              <div className="text-5xl font-bold mb-2">1 credit</div>
              <div className="text-neutral-400">per settlement</div>
            </div>
            <div className="space-y-3 mb-8">
              <div className="flex items-center gap-3">
                <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-neutral-300">1,000 credits for $10 (~$0.01 each)</span>
              </div>
              <div className="flex items-center gap-3">
                <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-neutral-300">100 free testnet credits monthly</span>
              </div>
              <div className="flex items-center gap-3">
                <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-neutral-300">No monthly fees or minimums</span>
              </div>
              <div className="flex items-center gap-3">
                <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-neutral-300">Volume discounts available</span>
              </div>
            </div>
            <SignInButton size="md" variant="primary" className="w-full">
              Start Free
            </SignInButton>
          </div>
        </div>
      </section>

      {/* Code Example */}
      <section className="max-w-6xl mx-auto px-6 py-16">
        <h2 className="text-2xl font-bold text-center mb-4">Two Lines of Code</h2>
        <p className="text-neutral-400 text-center mb-8">Add payments to any API endpoint</p>
        <div className="max-w-2xl mx-auto bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden">
          <div className="px-4 py-2 bg-neutral-800/50 border-b border-neutral-800">
            <span className="text-neutral-400 text-sm">api/premium/route.ts</span>
          </div>
          <pre className="p-4 overflow-x-auto text-sm">
            <code className="text-neutral-300">{`const payment = await fetch('https://x402.netpay.id/settle', {
  method: 'POST',
  headers: { 'X-API-Key': API_KEY },
  body: JSON.stringify({ xPayment, paymentRequirements })
});

if (payment.success) {
  return premiumContent();
}`}</code>
          </pre>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-neutral-800">
        <div className="max-w-6xl mx-auto px-6 py-16 text-center">
          <h2 className="text-3xl font-bold mb-4">Ready to accept USDC?</h2>
          <p className="text-neutral-400 mb-8">Get started in minutes. No credit card required.</p>
          <SignInButton size="lg" variant="primary">
            Create Free Account
          </SignInButton>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-neutral-800 bg-neutral-900/30">
        <div className="max-w-6xl mx-auto px-6 py-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 bg-amber-500 rounded flex items-center justify-center">
                <span className="text-black font-bold text-xs">N</span>
              </div>
              <span className="text-neutral-400 text-sm">NetPay © 2025</span>
            </div>
            <div className="flex items-center gap-6 text-sm text-neutral-500">
              <Link href="/demo" className="hover:text-white transition-colors">Demo</Link>
              <Link href="/dashboard/docs" className="hover:text-white transition-colors">Documentation</Link>
              <a href="https://github.com" className="hover:text-white transition-colors">GitHub</a>
              <a href="mailto:support@netpay.id" className="hover:text-white transition-colors">Support</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
