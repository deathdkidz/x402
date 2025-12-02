import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import http from 'http';
import https from 'https';
import config from './config/index.js';
import logger from './utils/logger.js';
import routes from './routes/index.js';
import { generalRateLimiter } from './middleware/rateLimit.js';
import { securityMiddleware } from './middleware/security.js';
import db from './services/database.js';
import redis from './services/redis.js';
import transactionMonitor from './services/transactionMonitor.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create logs directory if it doesn't exist
const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

const app: Application = express();

// Trust proxy - Disabled since Cloudflare proxy is off
// Direct connections for lower latency
app.set('trust proxy', false);

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
  logger.info(`Network: ${config.network}`);
  logger.info(`Supported Networks: ${config.supportedNetworks.join(', ')}`);
  logger.info(`Database: ${config.database.database}@${config.database.host}:${config.database.port}`);
  logger.info(`Redis: ${config.redisUrl}`);
  logger.info(`Rate Limiting: ${config.rateLimitMaxRequests} req/${config.rateLimitWindowMs}ms`);
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

  // Start transaction monitor for pending transactions
  try {
    transactionMonitor.start();
    logger.info('✅ Transaction monitor started');
  } catch (error) {
    logger.warn('⚠️ Transaction monitor failed to start:', error);
  }
};

// Start HTTP server
const httpServer = http.createServer(app);
httpServer.listen(PORT, () => {
  logger.info(`✅ HTTP Server listening on port ${PORT}`);
  startServer();
});

// Start HTTPS server if enabled
if (USE_HTTPS) {
  try {
    const certPath = config.sslCertPath || path.join(process.cwd(), 'ssl', 'cert.pem');
    const keyPath = config.sslKeyPath || path.join(process.cwd(), 'ssl', 'key.pem');
    
    // Check if certificates exist
    if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
      const httpsOptions = {
        cert: fs.readFileSync(certPath),
        key: fs.readFileSync(keyPath)
      };
      
      const httpsServer = https.createServer(httpsOptions, app);
      httpsServer.listen(HTTPS_PORT, () => {
        logger.info(`✅ HTTPS Server listening on port ${HTTPS_PORT} (⭐ use this)`);
      });
    } else {
      logger.warn(`⚠️ SSL certificates not found at ${certPath} and ${keyPath}`);
      logger.warn('⚠️ HTTPS server not started. HTTP only available.');
      logger.info('💡 To generate self-signed certificates, run: ./setup-ssl.sh');
    }
  } catch (error) {
    logger.error('❌ Failed to start HTTPS server:', error);
    logger.warn('⚠️ Continuing with HTTP only');
  }
}

// Graceful shutdown
const shutdown = async () => {
  logger.info('Shutting down gracefully...');
  transactionMonitor.stop();
  await redis.disconnect();
  await db.close();
  process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

export default app;
