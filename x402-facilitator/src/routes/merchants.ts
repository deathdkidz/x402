import { Router, Request, Response } from 'express';
import { ethers } from 'ethers';
import crypto from 'crypto';
import db from '../services/database.js';
import logger from '../utils/logger.js';
import { apiKeyAuth } from '../middleware/auth.js';

const router = Router();

/**
 * POST /api/merchants
 * Register a new merchant with their wallet private key
 * If the private key is already registered, return the existing merchant
 */
router.post('/merchants', async (req: Request, res: Response) => {
  try {
    const { privateKey } = req.body;

    if (!privateKey) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'privateKey is required',
      });
      return;
    }

    // Validate private key format and derive address
    let wallet: ethers.Wallet;
    try {
      const formattedKey = privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`;
      wallet = new ethers.Wallet(formattedKey);
    } catch (error) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Invalid private key format',
      });
      return;
    }

    const merchantAddress = wallet.address;

    // Check if merchant already exists
    const existing = await db.getMerchantByAddress(merchantAddress);
    if (existing) {
      logger.info(`Merchant already registered, returning existing: ${merchantAddress}`);
      res.status(200).json({
        success: true,
        message: 'Merchant already registered',
        merchant: {
          id: existing.id,
          merchant_address: existing.merchant_address,
          api_key: existing.api_key,
          created_at: existing.created_at,
        },
        isExisting: true,
      });
      return;
    }

    // Generate API key for new merchant
    const apiKey = `sk_live_${crypto.randomBytes(32).toString('hex')}`;

    // Create merchant
    const merchant = await db.createMerchant(merchantAddress, apiKey, privateKey);

    logger.info(`New merchant registered: ${merchantAddress}`);

    res.status(201).json({
      success: true,
      message: 'Merchant registered successfully',
      merchant: {
        id: merchant.id,
        merchant_address: merchant.merchant_address,
        api_key: merchant.api_key,
        created_at: merchant.created_at,
      },
      isExisting: false,
    });
  } catch (error) {
    logger.error('Error registering merchant:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to register merchant',
    });
  }
});

/**
 * GET /api/merchants/me
 * Get current authenticated merchant info
 */
router.get('/merchants/me', apiKeyAuth, async (req: Request, res: Response) => {
  if (!req.merchant) {
    res.status(401).json({
      error: 'Unauthorized',
      message: 'Authentication required',
    });
    return;
  }

  res.status(200).json({
    success: true,
    merchant: {
      id: req.merchant.id,
      merchant_address: req.merchant.merchant_address,
      created_at: req.merchant.created_at,
      updated_at: req.merchant.updated_at,
      is_active: req.merchant.is_active,
    },
  });
});

/**
 * POST /api/merchants/regenerate-key
 * Regenerate API key for current merchant
 */
router.post('/merchants/regenerate-key', apiKeyAuth, async (req: Request, res: Response) => {
  if (!req.merchant) {
    res.status(401).json({
      error: 'Unauthorized',
      message: 'Authentication required',
    });
    return;
  }

  try {
    const newApiKey = `sk_live_${crypto.randomBytes(32).toString('hex')}`;
    
    await db.updateMerchant(req.merchant.id, {
      api_key: newApiKey,
    });

    logger.info(`API key regenerated for merchant: ${req.merchant.merchant_address}`);

    res.status(200).json({
      success: true,
      api_key: newApiKey,
      message: 'API key regenerated successfully',
    });
  } catch (error) {
    logger.error('Error regenerating API key:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to regenerate API key',
    });
  }
});

export default router;
