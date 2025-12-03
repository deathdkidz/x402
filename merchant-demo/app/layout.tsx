import type { Metadata } from "next";
import "./globals.css";
import Web3Provider from "./components/Web3Provider";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Merchant Demo - x402 Protocol",
  description: "Demo merchant application for x402 payment protocol",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        <Web3Provider>
          <nav className="bg-gray-800 text-white p-4 shadow-md">
            <div className="max-w-6xl mx-auto flex space-x-6">
              <Link href="/" className="hover:text-blue-300 font-medium">Home</Link>
              <Link href="/demo" className="hover:text-blue-300 font-medium">REST API Demo</Link>
              <Link href="/x-payment-demo" className="hover:text-blue-300 font-medium">X-PAYMENT Demo</Link>
              <Link href="/docs" className="hover:text-blue-300 font-medium">Docs</Link>
            </div>
          </nav>
          {children}
        </Web3Provider>
      </body>
    </html>
  );
}
