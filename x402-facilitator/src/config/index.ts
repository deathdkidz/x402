import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';
import { ethers } from 'ethers';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config();

interface TokenConfig {
  symbol: string;
  name: string;
  address: string;
  decimals: number;
  eip712?: {
    name: string;
    version: string;
  };
}

interface NetworkConfig {
  chainId: number;
  rpcUrl: string;
  nativeToken: {
    symbol: string;
    name: string;
    cmcSlug: string;
  };
  tokens: TokenConfig[];
}

interface Config {
  serviceName: string;
  serviceDescription: string;
  port: number;
  httpsPort: number;
  useHttps: boolean;
  sslCertPath?: string;
  sslKeyPath?: string;
  nodeEnv: string;
  paymasterPrivateKeys: string[];
  mainnetNetworks: string[];
  testnetNetworks: string[];
  networks: { [network: string]: NetworkConfig };
  rateLimitWindowMs: number;
  rateLimitMaxRequests: number;
  logLevel: string;
  redisUrl: string;
  coinmarketcapApiKey: string;
  database: {
    host: string;
    port: number;
    database: string;
    user: string;
    password: string;
    connectionLimit: number;
    queueLimit: number;
  };
  transactionMonitorIntervalMs: number;
  transactionTimeoutMs: number;
  settlementGasLimit: number;
  settlementTimeoutMs: number;
  webhookTimeoutMs: number;
  webhookRetryAttempts: number;
  webhookRetryDelays: number[];
  securityBanThreshold: number;
  securityBanDurationMs: number;
  securityCleanupIntervalMs: number;
  gasBufferPercentage: number;
  verifyRateLimitWindowMs: number;
  verifyRateLimitMax: number;
  settleRateLimitWindowMs: number;
  settleRateLimitMax: number;
}

// Validate required environment variables
const requiredEnvVars = ['PAYMASTER_PRIVATE_KEYS'];
const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingEnvVars.length > 0) {
  throw new Error(`Missing required environment variables: ${missingEnvVars.join(', ')}`);
}

// Load paymaster private keys (supports multiple wallets)
// Format: PAYMASTER_PRIVATE_KEYS=key1,key2,key3
const loadPaymasterKeys = (): string[] => {
  const keys = process.env.PAYMASTER_PRIVATE_KEYS!.split(',').map(k => k.trim()).filter(k => k.length > 0);
  if (keys.length === 0) {
    throw new Error('PAYMASTER_PRIVATE_KEYS is set but contains no valid keys');
  }
  return keys;
};

const config: Config = {
  serviceName: process.env.SERVICE_NAME || 'x402 Facilitator',
  serviceDescription: process.env.SERVICE_DESCRIPTION || 'Secure x402 payment facilitator',
  port: parseInt(process.env.PORT || '8080', 10),
  nodeEnv: process.env.NODE_ENV || 'production',
  paymasterPrivateKeys: loadPaymasterKeys(),
  mainnetNetworks: (process.env.MAINNET_NETWORKS || '').split(',').map(n => n.trim()).filter(n => n.length > 0),
  testnetNetworks: (process.env.TESTNET_NETWORKS || '').split(',').map(n => n.trim()).filter(n => n.length > 0),
  networks: {
    'Base': {
      chainId: 8453,
      rpcUrl: process.env.BASE_SEPOLIA_RPC || 'wss://base-mainnet.g.alchemy.com/v2/demo',
      nativeToken: { symbol: 'ETH', name: 'Ethereum', cmcSlug: 'ethereum' },
      tokens: [
        {
          symbol: 'USDC',
          name: 'USD Coin',
          address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
          decimals: 6,
          eip712: {
            name: 'USD Coin',
            version: '2',
          },
        },
      ],
    },
    'Ethereum': {
      chainId: 11155111,
      rpcUrl: process.env.ETHEREUM_SEPOLIA_RPC || 'https://eth-sepolia.g.alchemy.com/v2/demo',
      nativeToken: { symbol: 'ETH', name: 'Ethereum', cmcSlug: 'ethereum' },
      tokens: [
        {
          symbol: 'USDC',
          name: 'USD Coin',
          address: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
          decimals: 6,
          eip712: {
            name: 'USD Coin',
            version: '2',
          },
        },
      ],
    },
    'HyperEVM': {
      chainId: 999,
      rpcUrl: process.env.HYPEREVM_RPC || 'wss://hyperliquid-mainnet.g.alchemy.com/v2/demo',
      nativeToken: { symbol: 'HYPE', name: 'Hyperliquid', cmcSlug: 'hyperliquid' },
      tokens: [
        {
          symbol: 'USDC',
          name: 'USDC',
          address: '0xb88339CB7199b77E23DB6E890353E22632Ba630f',
          decimals: 6,
          eip712: {
            name: 'USDC',
            version: '2',
          },
        },
      ],
    },
    'Base Sepolia': {
      chainId: 84532,
      rpcUrl: process.env.BASE_SEPOLIA_RPC || 'https://base-sepolia.g.alchemy.com/v2/demo',
      nativeToken: { symbol: 'ETH', name: 'Ethereum', cmcSlug: 'ethereum' },
      tokens: [
        {
          symbol: 'USDC',
          name: 'USD Coin',
          address: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
          decimals: 6,
          eip712: {
            name: 'USDC',
            version: '2',
          },
        },
      ],
    },
    'Ethereum Sepolia': {
      chainId: 11155111,
      rpcUrl: process.env.ETHEREUM_SEPOLIA_RPC || 'https://eth-sepolia.g.alchemy.com/v2/demo',
      nativeToken: { symbol: 'ETH', name: 'Ethereum', cmcSlug: 'ethereum' },
      tokens: [
        {
          symbol: 'USDC',
          name: 'USD Coin',
          address: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
          decimals: 6,
          eip712: {
            name: 'USDC',
            version: '2',
          },
        },
      ],
    },
    'HyperEVM Testnet': {
      chainId: 998,
      rpcUrl: process.env.HYPEREVM_TESTNET_RPC || 'wss://hyperliquid-testnet.g.alchemy.com/v2/demo',      nativeToken: { symbol: 'HYPE', name: 'Hyperliquid', cmcSlug: 'hyperliquid' },      tokens: [
        {
          symbol: 'USDC',
          name: 'USDC',
          address: '0x2B3370eE501B4a559b57D449569354196457D8Ab',
          decimals: 6,
          eip712: {
            name: 'USDC',
            version: '2',
          },
        },
      ],
    },
  },
  rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10),
  rateLimitMaxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10),
  logLevel: process.env.LOG_LEVEL || 'info',
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  coinmarketcapApiKey: process.env.COINMARKETCAP_API_KEY || '99ea85515cef40ecb1f0db989a0dc293',
  httpsPort: parseInt(process.env.HTTPS_PORT || '8443', 10),
  useHttps: process.env.USE_HTTPS === 'true',
  sslCertPath: process.env.SSL_CERT_PATH,
  sslKeyPath: process.env.SSL_KEY_PATH,
  database: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    database: process.env.DB_NAME || 'x402_facilitator',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    connectionLimit: parseInt(process.env.DB_CONNECTION_LIMIT || '200', 10),
    queueLimit: parseInt(process.env.DB_QUEUE_LIMIT || '200', 10),
  },
  transactionMonitorIntervalMs: parseInt(process.env.TRANSACTION_MONITOR_INTERVAL_MS || '20000', 10),
  transactionTimeoutMs: parseInt(process.env.TRANSACTION_TIMEOUT_MS || '300000', 10),
  settlementGasLimit: parseInt(process.env.SETTLEMENT_GAS_LIMIT || '200000', 10),
  settlementTimeoutMs: parseInt(process.env.SETTLEMENT_TIMEOUT_MS || '30000', 10),
  webhookTimeoutMs: parseInt(process.env.WEBHOOK_TIMEOUT_MS || '5000', 10),
  webhookRetryAttempts: parseInt(process.env.WEBHOOK_RETRY_ATTEMPTS || '3', 10),
  webhookRetryDelays: (process.env.WEBHOOK_RETRY_DELAYS || '0,5000,15000').split(',').map(d => parseInt(d.trim(), 10)),
  securityBanThreshold: parseInt(process.env.SECURITY_BAN_THRESHOLD || '10', 10),
  securityBanDurationMs: parseInt(process.env.SECURITY_BAN_DURATION_MS || '3600000', 10),
  securityCleanupIntervalMs: parseInt(process.env.SECURITY_CLEANUP_INTERVAL_MS || '600000', 10),
  gasBufferPercentage: parseInt(process.env.GAS_BUFFER_PERCENTAGE || '20', 10),
  verifyRateLimitWindowMs: parseInt(process.env.VERIFY_RATE_LIMIT_WINDOW_MS || '60000', 10),
  verifyRateLimitMax: parseInt(process.env.VERIFY_RATE_LIMIT_MAX || '30', 10),
  settleRateLimitWindowMs: parseInt(process.env.SETTLE_RATE_LIMIT_WINDOW_MS || '60000', 10),
  settleRateLimitMax: parseInt(process.env.SETTLE_RATE_LIMIT_MAX || '10', 10),
};

/**
 * Normalize network name to match configured network names
 * Handles different formats: 'Base Sepolia', 'base-sepolia', 'base sepolia', 'BaSe SePolia', etc.
 * 
 * @param network - Network name in any format
 * @returns Normalized network name that matches config, or original if no match
 */
export const normalizeNetworkName = (network: string): string => {
  const allNetworks = [...config.mainnetNetworks, ...config.testnetNetworks];
  
  // Try exact match first (case-insensitive)
  const exactMatch = allNetworks.find(n => n.toLowerCase() === network.toLowerCase());
  if (exactMatch) {
    return exactMatch;
  }
  
  // Fallback: Normalize to title case (handles hyphens, underscores, spaces)
  // 'base-sepolia' -> 'Base Sepolia'
  // 'base_sepolia' -> 'Base Sepolia'
  // 'BaSe SePolia' -> 'Base Sepolia'
  const normalizedNetwork = network.split(/[-_\s]+/).map(word => 
    word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
  ).join(' ');
  
  // Check if normalized version exists in config
  const normalizedMatch = allNetworks.find(n => n === normalizedNetwork);
  if (normalizedMatch) {
    return normalizedMatch;
  }
  
  // Return original if no match (will fail later with proper error)
  return network;
};

// Helper functions to access network/token data
export const getNetworkConfig = (network: string): NetworkConfig | undefined => {
  const normalizedNetwork = normalizeNetworkName(network);
  return config.networks[normalizedNetwork];
};

export const getTokenByAddress = (network: string, tokenAddress: string): TokenConfig | undefined => {
  const normalizedNetwork = normalizeNetworkName(network);
  const networkConfig = config.networks[normalizedNetwork];
  return networkConfig?.tokens.find(t => t.address.toLowerCase() === tokenAddress.toLowerCase());
};

export const getRpcUrl = (network: string): string => {
  const normalizedNetwork = normalizeNetworkName(network);
  const networkConfig = config.networks[normalizedNetwork];
  if (!networkConfig?.rpcUrl) {
    throw new Error(`No RPC URL configured for network: ${normalizedNetwork}`);
  }
  return networkConfig.rpcUrl;
};

// Create provider with automatic HTTP/WebSocket detection
// NOTE: This creates a NEW connection each time - use providerPool for persistent connections
export const createProvider = (network: string): ethers.JsonRpcProvider | ethers.WebSocketProvider => {
  const rpcUrl = getRpcUrl(network);
  
  if (rpcUrl.startsWith('wss://') || rpcUrl.startsWith('ws://')) {
    return new ethers.WebSocketProvider(rpcUrl);
  }
  
  return new ethers.JsonRpcProvider(rpcUrl);
};

export const getEIP712Domain = (network: string, tokenAddress: string) => {
  const normalizedNetwork = normalizeNetworkName(network);
  const token = getTokenByAddress(network, tokenAddress);
  const networkConfig = config.networks[normalizedNetwork];
  
  if (!token?.eip712 || !networkConfig) {
    return undefined;
  }
  
  return {
    name: token.eip712.name,
    version: token.eip712.version,
    chainId: networkConfig.chainId,
    verifyingContract: token.address,
  };
};

// Helper to get all supported networks (testnet + mainnet)
export const getAllSupportedNetworks = (): string[] => {
  return [...config.testnetNetworks, ...config.mainnetNetworks];
};

export { TokenConfig, NetworkConfig };
export default config;
