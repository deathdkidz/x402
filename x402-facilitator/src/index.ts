import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import http from 'http';
import https from 'https';
import { ethers } from 'ethers';
import config from './config/index.js';
import logger from './utils/logger.js';
import routes from './routes/index.js';
import { generalRateLimiter } from './middleware/rateLimit.js';
import { securityMiddleware } from './middleware/security.js';
import db from './services/database.js';
import redis from './services/redis.js';
import transactionMonitor from './services/transactionMonitor.js';
import paymasterPool from './services/paymasterPool.js';
import providerPool from './services/providerPool.js';
import priceService from './services/priceService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create logs directory if it doesn't exist
const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

const app: Application = express();

// Trust proxy - Enable for Nginx reverse proxy
// Nginx on localhost will forward real client IP via X-Forwarded-For
app.set('trust proxy', 'loopback');

// Security middleware
app.use(helmet());
app.use(cors({
  origin: '*', // Configure based on your needs
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Body parsing middleware
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Security middleware - block attacks
app.use(securityMiddleware);

// Rate limiting
app.use(generalRateLimiter);

// Request logging middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  logger.http(`${req.method} ${req.path} - ${req.ip}`);
  next();
});

// Routes
app.use('/', routes);

// 404 handler
app.use((req: Request, res: Response) => {
  logger.warn(`404 Not Found: ${req.method} ${req.path}`);
  res.status(404).json({
    error: 'Not Found',
    message: 'The requested endpoint does not exist',
  });
});

// Error handler
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  logger.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Internal Server Error',
    message: config.nodeEnv === 'production' 
      ? 'An unexpected error occurred'
      : err.message,
  });
});

// Start server with both HTTP and HTTPS
const PORT = config.port;
const HTTPS_PORT = config.httpsPort;
const USE_HTTPS = config.useHttps;

// Function to start the server
const startServer = async () => {
  logger.info('='.repeat(60));
  logger.info('🚀 x402 Facilitator Service Started');
  logger.info('='.repeat(60));
  logger.info(`Environment: ${config.nodeEnv}`);
  logger.info(`HTTP Port: ${PORT}`);
  if (USE_HTTPS) {
    logger.info(`HTTPS Port: ${HTTPS_PORT} (⭐ preferred)`);
  }
  logger.info(`Mainnet Networks: ${config.mainnetNetworks.join(', ')}`);
  logger.info(`Testnet Networks: ${config.testnetNetworks.join(', ')}`);
  logger.info(`Database: ${config.database.database}@${config.database.host}:${config.database.port}`);
  logger.info(`Redis: ${config.redisUrl}`);
  logger.info(`Rate Limiting: ${config.rateLimitMaxRequests} req/${config.rateLimitWindowMs}ms`);
  logger.info('='.repeat(60));

  // Initialize provider pool with persistent WebSocket connections
  await providerPool.initialize();
  const poolStats = providerPool.getStats();
  logger.info(`📡 Provider Pool: ${poolStats.websocket} WebSocket, ${poolStats.http} HTTP, ${poolStats.total} total`);
  logger.info('='.repeat(60));

  // Test RPC connections
  logger.info('🔌 Testing RPC connections...');
  const allNetworks = [...config.testnetNetworks, ...config.mainnetNetworks];
  let rpcSuccessCount = 0;
  let rpcFailCount = 0;
  
  for (const network of allNetworks) {
    try {
      const provider = providerPool.getProvider(network);
      const isWebSocket = provider instanceof ethers.WebSocketProvider;
      
      // Test connection with timeout
      const blockNumberPromise = provider.getBlockNumber();
      const timeoutPromise = new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error('Timeout')), 5000)
      );
      
      const startTime = Date.now();
      const blockNumber = await Promise.race([blockNumberPromise, timeoutPromise]) as number;
      const latency = Date.now() - startTime;
      
      // Only show connection type for HTTP connections (WebSocket is already shown in provider pool stats)
      const typeLabel = isWebSocket ? '' : ' HTTP';
      logger.info(`   ✅ ${network}:${typeLabel} Block #${blockNumber} (${latency}ms)`);
      rpcSuccessCount++;
    } catch (error: any) {
      logger.error(`   ❌ ${network}: Connection failed - ${error.message}`);
      rpcFailCount++;
    }
  }
  
  logger.info(`📊 RPC Status: ${rpcSuccessCount}/${allNetworks.length} connected, ${rpcFailCount} failed`);
  logger.info('='.repeat(60));

  // Initialize Redis connection
  try {
    await redis.connect();
    logger.info('✅ Redis connection successful');
  } catch (error) {
    logger.warn('⚠️ Redis connection failed - running without cache:', error);
  }

  // Test database connection
  try {
    await db.testConnection();
    logger.info('✅ Database connection successful');
  } catch (error) {
    logger.error('❌ Database connection failed:', error);
  }

  // Initialize paymaster wallet pool (no provider needed - connects on-demand)
  try {
    await paymasterPool.initialize();
    const poolStats = paymasterPool.getPoolStats();
    logger.info('✅ Paymaster pool initialized');
    logger.info(`   Wallets: ${poolStats.total}`);
    poolStats.addresses.forEach((addr, idx) => {
      logger.info(`   [${idx + 1}] ${addr}`);
    });
  } catch (error) {
    logger.error('❌ Failed to initialize paymaster pool:', error);
    logger.error('❌ Settlement service will not work. Please check PAYMASTER_PRIVATE_KEYS or FACILITATOR_PRIVATE_KEY');
    process.exit(1);
  }

  // Start transaction monitor for pending transactions
  try {
    transactionMonitor.start();
    logger.info('✅ Transaction monitor started');
  } catch (error) {
    logger.warn('⚠️ Transaction monitor failed to start:', error);
  }

  // Start price service for gas cost USD estimates
  try {
    await priceService.start();
  } catch (error) {
    logger.warn('⚠️ Price service failed to start:', error);
  }
};

// Start HTTP server
const httpServer = http.createServer(app);
httpServer.listen(PORT, async () => {
  logger.info(`✅ HTTP Server listening on port ${PORT}`);
  
  // Start HTTPS server and wait for it to be ready before async initialization
  if (USE_HTTPS) {
    try {
      const certPath = config.sslCertPath || path.join(process.cwd(), 'ssl', 'cert.pem');
      const keyPath = config.sslKeyPath || path.join(process.cwd(), 'ssl', 'key.pem');
      
      if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
        const httpsOptions = {
          cert: fs.readFileSync(certPath),
          key: fs.readFileSync(keyPath)
        };
        
        const httpsServer = https.createServer(httpsOptions, app);
        await new Promise<void>((resolve) => {
          httpsServer.listen(HTTPS_PORT, () => {
            logger.info(`✅ HTTPS Server listening on port ${HTTPS_PORT} (⭐ preferred)`);
            resolve();
          });
        });
      } else {
        logger.warn(`⚠️ SSL certificates not found at ${certPath} and ${keyPath}`);
        logger.warn('⚠️ HTTPS server not started. HTTP only available.');
      }
    } catch (error) {
      logger.error('❌ Failed to start HTTPS server:', error);
      logger.warn('⚠️ Continuing with HTTP only');
    }
  }
  
  // Now run async initialization
  await startServer();
});

// Graceful shutdown
const shutdown = async () => {
  logger.info('Shutting down gracefully...');
  transactionMonitor.stop();
  await providerPool.destroy();
  await redis.disconnect();
  await db.close();
  process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

export default app;
