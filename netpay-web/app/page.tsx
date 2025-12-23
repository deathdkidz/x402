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
            <SignInButton size="sm" variant="primary">
              Sign In
            </SignInButton>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-6xl mx-auto px-6 py-16">
        <div className="max-w-2xl mx-auto text-center">
          <h1 className="text-4xl font-bold mb-4">
            Accept crypto payments<span className="text-amber-500"> simply</span>
          </h1>
          <p className="text-neutral-400 mb-8">
            Simple API. Instant settlements. No custody.
          </p>
          <div className="flex justify-center gap-4">
            <SignInButton size="md" variant="primary">
              Get Started
            </SignInButton>
            <Link 
              href="https://demo.netpay.id"
              className="px-6 py-3 border border-neutral-700 hover:border-neutral-600 text-white font-medium rounded-lg transition-colors"
            >
              Demo
            </Link>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="max-w-6xl mx-auto px-6 py-16">
        <div className="grid md:grid-cols-3 gap-6">
          <div className="p-5 bg-neutral-900 border border-neutral-800 rounded-xl">
            <div className="w-8 h-8 bg-amber-500/10 rounded-lg flex items-center justify-center mb-3">
              <svg className="w-4 h-4 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <h3 className="font-semibold mb-1">Instant Settlement</h3>
            <p className="text-neutral-400 text-sm">Payments settled in under 2 seconds.</p>
          </div>
          <div className="p-5 bg-neutral-900 border border-neutral-800 rounded-xl">
            <div className="w-8 h-8 bg-amber-500/10 rounded-lg flex items-center justify-center mb-3">
              <svg className="w-4 h-4 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <h3 className="font-semibold mb-1">Non-Custodial</h3>
            <p className="text-neutral-400 text-sm">Funds go directly to your wallet.</p>
          </div>
          <div className="p-5 bg-neutral-900 border border-neutral-800 rounded-xl">
            <div className="w-8 h-8 bg-amber-500/10 rounded-lg flex items-center justify-center mb-3">
              <svg className="w-4 h-4 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
              </svg>
            </div>
            <h3 className="font-semibold mb-1">Simple API</h3>
            <p className="text-neutral-400 text-sm">Two endpoints. Verify and settle.</p>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="border-t border-neutral-800 bg-neutral-900/30">
        <div className="max-w-6xl mx-auto px-6 py-12">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-4xl font-bold">0.5%</span>
              <span className="text-neutral-400 ml-2">per transaction</span>
            </div>
            <div className="text-neutral-400 text-sm">
              No monthly fees · All networks · 100 free testnet credits
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-neutral-800">
        <div className="max-w-6xl mx-auto px-6 py-6">
          <div className="flex items-center justify-between text-sm text-neutral-500">
            <span>NetPay © 2025</span>
            <div className="flex gap-6">
              <Link href="/dashboard/docs" className="hover:text-white">Docs</Link>
              <a href="https://github.com" className="hover:text-white">GitHub</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
