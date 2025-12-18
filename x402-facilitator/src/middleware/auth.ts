import { Request, Response, NextFunction } from 'express';
import logger from '../utils/logger.js';
import config from '../config/index.js';
import db, { Merchant } from '../services/database.js';
import redis from '../services/redis.js';

// Extend Express Request to include merchant
declare global {
  namespace Express {
    interface Request {
      merchant?: Merchant;
    }
  }
}

/**
 * API Key Authentication Middleware (Database-backed)
 * Validates the API key against the database and attaches merchant to request
 */
export const apiKeyAuth = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    logger.warn('Authentication failed: No Authorization header');
    res.status(401).json({
      error: 'Unauthorized',
      message: 'Missing Authorization header',
    });
    return;
  }

  // Support both "Bearer TOKEN" and direct token
  const apiKey = authHeader.startsWith('Bearer ')
    ? authHeader.substring(7)
    : authHeader;

  try {
    // Check Redis cache first
    let merchant = await redis.getCachedMerchant(apiKey);

    if (!merchant) {
      // Cache miss - query database
      merchant = await db.getMerchantByApiKey(apiKey);

      if (!merchant) {
        logger.warn('Authentication failed: Invalid API key');
        res.status(401).json({
          error: 'Unauthorized',
          message: 'Invalid API key',
        });
        return;
      }

      // Cache merchant data for 1 hour
      await redis.cacheMerchant(apiKey, merchant, 3600);
      logger.debug(`Cached merchant: ${merchant.auth_address}`);
    }

    // Attach merchant to request for use in routes
    req.merchant = merchant;
    logger.info(`Authenticated merchant: ${merchant.auth_address}`);
    next();
  } catch (error) {
    logger.error('Authentication error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Authentication service unavailable',
    });
    return;
  }
};

/**
 * Optional API Key Authentication
 * Allows requests without auth but validates if provided
 */
export const optionalApiKeyAuth = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    // No auth provided, continue without authentication
    next();
    return;
  }

  // Auth provided, validate it
  const apiKey = authHeader.startsWith('Bearer ')
    ? authHeader.substring(7)
    : authHeader;

  try {
    const merchant = await db.getMerchantByApiKey(apiKey);

    if (merchant) {
      req.merchant = merchant;
      logger.info(`Optionally authenticated merchant: ${merchant.auth_address}`);
    }

    next();
  } catch (error) {
    logger.error('Optional authentication error:', error);
    // Continue anyway for optional auth
    next();
  }
};
