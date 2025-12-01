import type { Metadata } from "next";
import "./globals.css";
import Web3Provider from "./components/Web3Provider";

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
          {children}
        </Web3Provider>
      </body>
    </html>
  );
}
