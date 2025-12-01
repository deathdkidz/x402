import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import config from './config/index.js';
import logger from './utils/logger.js';
import routes from './routes/index.js';
import { generalRateLimiter } from './middleware/rateLimit.js';
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

// Start server
const PORT = config.port;
app.listen(PORT, async () => {
  logger.info('='.repeat(60));
  logger.info('🚀 x402 Facilitator Service Started');
  logger.info('='.repeat(60));
  logger.info(`Environment: ${config.nodeEnv}`);
  logger.info(`Port: ${PORT}`);
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
});

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
