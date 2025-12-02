import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

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
  tokens: TokenConfig[];
}

interface Config {
  port: number;
  httpsPort: number;
  useHttps: boolean;
  sslCertPath?: string;
  sslKeyPath?: string;
  nodeEnv: string;
  facilitatorPrivateKey: string;
  network: string;
  supportedNetworks: string[];
  networks: { [network: string]: NetworkConfig };
  rateLimitWindowMs: number;
  rateLimitMaxRequests: number;
  logLevel: string;
  redisUrl: string;
  database: {
    host: string;
    port: number;
    database: string;
    user: string;
    password: string;
  };
}

// Validate required environment variables
const requiredEnvVars = ['FACILITATOR_PRIVATE_KEY', 'SUPPORTED_NETWORKS'];
const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingEnvVars.length > 0) {
  throw new Error(`Missing required environment variables: ${missingEnvVars.join(', ')}`);
}

const config: Config = {
  port: parseInt(process.env.PORT || '8080', 10),
  nodeEnv: process.env.NODE_ENV || 'production',
  facilitatorPrivateKey: process.env.FACILITATOR_PRIVATE_KEY!,
  network: process.env.NETWORK || 'Base Sepolia',
  supportedNetworks: (process.env.SUPPORTED_NETWORKS || 'Base Sepolia').split(',').map(n => n.trim()),
  networks: {
    'Base Sepolia': {
      chainId: 84532,
      rpcUrl: process.env.BASE_SEPOLIA_RPC || 'https://base-sepolia.g.alchemy.com/v2/demo',
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
    'BSC Testnet': {
      chainId: 97,
      rpcUrl: process.env.BSC_TESTNET_RPC || 'https://bnb-testnet.g.alchemy.com/v2/demo',
      tokens: [
        {
          symbol: 'USDT',
          name: 'USDT Token',
          address: '0x337610d27c682E347C9cD60BD4b3b107C9d34dDd',
          decimals: 18,
          eip712: {
            name: 'USDT Token',
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
  },
};

// Helper functions to access network/token data
export const getNetworkConfig = (network: string): NetworkConfig | undefined => {
  return config.networks[network];
};

export const getTokenByAddress = (network: string, tokenAddress: string): TokenConfig | undefined => {
  const networkConfig = config.networks[network];
  return networkConfig?.tokens.find(t => t.address.toLowerCase() === tokenAddress.toLowerCase());
};

export const getRpcUrl = (network: string): string => {
  const networkConfig = config.networks[network];
  if (!networkConfig?.rpcUrl) {
    throw new Error(`No RPC URL configured for network: ${network}`);
  }
  return networkConfig.rpcUrl;
};

export const getEIP712Domain = (network: string, tokenAddress: string) => {
  const token = getTokenByAddress(network, tokenAddress);
  const networkConfig = config.networks[network];
  
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

export { TokenConfig, NetworkConfig };
export default config;
