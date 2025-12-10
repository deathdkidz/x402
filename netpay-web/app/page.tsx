import Link from "next/link";

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="container mx-auto px-4 py-16">
        <div className="text-center mb-16">
          <h1 className="text-5xl font-bold text-gray-900 mb-4">NetPay</h1>
          <p className="text-xl text-gray-600">X-402 Payment Protocol</p>
        </div>

        <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
          <Link href="https://demo.netpay.id" className="block p-8 bg-white rounded-lg shadow-lg hover:shadow-xl transition-shadow">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Demo</h2>
            <p className="text-gray-600">Try out the X-402 payment protocol with interactive examples and tutorials.</p>
          </Link>

          <Link href="/dashboard" className="block p-8 bg-white rounded-lg shadow-lg hover:shadow-xl transition-shadow">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Dashboard</h2>
            <p className="text-gray-600">Manage your merchant account and view payment analytics.</p>
          </Link>
        </div>

        <div className="mt-16 text-center">
          <div className="inline-block p-8 bg-white rounded-lg shadow-lg">
            <h3 className="text-xl font-semibold text-gray-900 mb-4">What is X-402?</h3>
            <p className="text-gray-600 max-w-2xl">
              X-402 is a payment protocol that enables seamless blockchain-based payments 
              for web resources and services. Pay for content, APIs, and more using cryptocurrency.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
