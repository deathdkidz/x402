import rateLimit from 'express-rate-limit';
import { Request, Response, NextFunction } from 'express';
import config from '../config/index.js';
import logger from '../utils/logger.js';
import redis from '../services/redis.js';
import db from '../services/database.js';

/**
 * Rate limiter for general API endpoints
 */
export const generalRateLimiter = rateLimit({
  windowMs: config.rateLimitWindowMs,
  max: config.rateLimitMaxRequests,
  message: {
    error: 'Too Many Requests',
    message: 'Rate limit exceeded. Please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn(`Rate limit exceeded for IP: ${req.ip}`);
    res.status(429).json({
      error: 'Too Many Requests',
      message: 'Rate limit exceeded. Please try again later.',
    });
  },
});

/**
 * Strict rate limiter for payment verification endpoints
 */
export const verifyRateLimiter = rateLimit({
  windowMs: config.verifyRateLimitWindowMs,
  max: config.verifyRateLimitMax,
  message: {
    error: 'Too Many Requests',
    message: 'Verification rate limit exceeded.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn(`Verify rate limit exceeded for IP: ${req.ip}`);
    res.status(429).json({
      error: 'Too Many Requests',
      message: 'Verification rate limit exceeded.',
    });
  },
});

/**
 * Very strict rate limiter for settlement endpoints
 */
export const settleRateLimiter = rateLimit({
  windowMs: config.settleRateLimitWindowMs,
  max: config.settleRateLimitMax,
  message: {
    error: 'Too Many Requests',
    message: 'Settlement rate limit exceeded.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn(`Settle rate limit exceeded for IP: ${req.ip}`);
    res.status(429).json({
      error: 'Too Many Requests',
      message: 'Settlement rate limit exceeded.',
    });
  },
});

/**
 * Merchant-specific rate limiting using Redis and database-backed limits
 * Each merchant can have custom rate limits based on their tier
 */
export const merchantRateLimiter = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  // Only apply to authenticated merchants
  if (!req.merchant) {
    next();
    return;
  }

  const authAddress = req.merchant.auth_address;
  const endpoint = req.path;

  try {
    const client = redis.getClient();
    if (!client) {
      // Redis unavailable, skip merchant rate limiting
      logger.warn('Redis unavailable, skipping merchant rate limit');
      next();
      return;
    }

    // Get merchant-specific rate limits (cached or from database)
    let merchantLimits = await redis.getCachedMerchantRateLimits(authAddress);
    
    if (!merchantLimits) {
      // Cache miss - query database
      merchantLimits = await db.getMerchantRateLimits(authAddress);
      
      if (!merchantLimits) {
        // Merchant not found, use default limits
        logger.warn(`No rate limits found for merchant ${authAddress}, using defaults`);
        merchantLimits = {
          verifyLimit: 60,
          settleLimit: 20,
          window: 60,
          tier: 'free',
        };
      }
      
      // Cache for 1 hour
      await redis.cacheMerchantRateLimits(authAddress, merchantLimits, 3600);
    }

    // Determine limit based on endpoint
    let limit: { max: number; window: number };
    if (endpoint === '/verify') {
      limit = { max: merchantLimits.verifyLimit, window: merchantLimits.window };
    } else if (endpoint === '/settle') {
      limit = { max: merchantLimits.settleLimit, window: merchantLimits.window };
    } else {
      // For other endpoints, use verify limit as default
      limit = { max: merchantLimits.verifyLimit, window: merchantLimits.window };
    }

    const key = `ratelimit:merchant:${authAddress}:${endpoint}`;

    // Increment counter
    const current = await client.incr(key);

    // Set expiry on first request
    if (current === 1) {
      await client.expire(key, limit.window);
    }

    // Get TTL for rate limit reset header
    const ttl = await client.ttl(key);

    // Set rate limit headers
    res.setHeader('X-RateLimit-Limit', limit.max.toString());
    res.setHeader('X-RateLimit-Remaining', Math.max(0, limit.max - current).toString());
    res.setHeader('X-RateLimit-Reset', (Date.now() + ttl * 1000).toString());
    res.setHeader('X-RateLimit-Tier', merchantLimits.tier);

    // Check if limit exceeded
    if (current > limit.max) {
      logger.warn(
        `Merchant rate limit exceeded: ${authAddress} (${merchantLimits.tier}) on ${endpoint} (${current}/${limit.max})`
      );
      res.status(429).json({
        error: 'Too Many Requests',
        message: `Merchant rate limit exceeded. Max ${limit.max} requests per ${limit.window} seconds.`,
        tier: merchantLimits.tier,
        retryAfter: ttl,
      });
      return;
    }

    logger.debug(
      `Merchant ${authAddress} (${merchantLimits.tier}) on ${endpoint}: ${current}/${limit.max} requests`
    );
    next();
  } catch (error) {
    logger.error('Error in merchant rate limiter:', error);
    // On error, allow request through (fail open)
    next();
  }
};
