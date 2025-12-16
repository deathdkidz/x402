/**
 * Protected Resources Configuration
 * 
 * Add any resource path here to automatically protect it with X-402 payment protocol.
 * Works for static files, images, API routes, or any server-rendered content.
 */

export interface ProtectedResource {
  amount: string;           // Amount in smallest unit (e.g., 10000 = 0.01 USDC)
  description: string;      // Description shown in payment UI
  network?: string;         // Network name - accepts any format: 'Base Sepolia', 'base-sepolia', 'BASE-SEPOLIA', etc.
  asset?: string;          // Token address, default: USDC on Base Sepolia
}

export const protectedResources: Record<string, ProtectedResource> = {
  // Protected dancing cat GIF
  '/dancing-cat.gif': {
    amount: '10000',              // 0.01 USDC
    description: 'Premium Dancing Cat GIF',
    // No network/asset restriction - client can choose any supported network
  },
  '/data': {
    amount: '15000',              // 0.015 USDC
    description: 'Access to Protected API Data',
    // No network/asset restriction - client can choose any supported network
  },
  
  // Additional protected resources can be added here
  // '/dog.jpg': {
  //   amount: '20000',            // 0.02 USDC
  //   description: 'Premium Dog Photo',
  // },
  // '/api/premium/article': {
  //   amount: '50000',            // 0.05 USDC
  //   description: 'Premium Article Access',
  //   network: 'base-sepolia',
  // },
};

/**
 * Default configuration for protected resources
 */
export const defaultConfig = {
  network: 'Base Sepolia', // Flexible format: 'Base Sepolia', 'base-sepolia', 'BASE SEPOLIA', etc.
  asset: '0x036CbD53842c5426634e7929541eC2318f3dCF7e', // USDC on Base Sepolia
  scheme: 'exact',
  maxTimeoutSeconds: 3600,
};
