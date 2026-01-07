import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";
import { WalletProvider } from "@/app/components/WalletProvider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "NetPay - x402 Payment Protocol",
  description: "Purchase API credits for gasless USDC payment settlements",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Get cookies for SSR hydration
  const headersObj = await headers();
  const cookies = headersObj.get('cookie');

  return (
    <html lang="en">
      <head>
        <link rel="icon" href="/favicon.svg" />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <WalletProvider cookies={cookies}>
          {children}
        </WalletProvider>
      </body>
    </html>
  );
}
