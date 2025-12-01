import express, { Request, Response } from 'express';
import { ethers } from 'ethers';
import db from '../services/database.js';
import logger from '../utils/logger.js';

const router = express.Router();

/**
 * POST /merchants/auth
 * Authenticate merchant by verifying signed message
 */
router.post('/auth', async (req: Request, res: Response) => {
  try {
    const { address, message, signature } = req.body;

    if (!address || !message || !signature) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Verify signature
    const recoveredAddress = ethers.verifyMessage(message, signature);
    
    if (recoveredAddress.toLowerCase() !== address.toLowerCase()) {
      logger.warn(`Authentication failed: signature mismatch for ${address}`);
      return res.status(401).json({ error: 'Invalid signature' });
    }

    // Fetch merchant from database
    const merchant = await db.getMerchantByAddress(address);
    
    if (!merchant) {
      logger.warn(`Authentication failed: merchant not found for ${address}`);
      return res.status(404).json({ error: 'Merchant not registered' });
    }

    logger.info(`Merchant authenticated: ${address}`);

    res.json({
      success: true,
      merchant: {
        merchant_address: merchant.merchant_address,
        api_key: merchant.api_key,
        created_at: merchant.created_at
      }
    });
  } catch (error) {
    logger.error('Merchant authentication error:', error);
    res.status(500).json({ error: 'Authentication failed' });
  }
});

/**
 * GET /merchants/transactions
 * Get transaction history for authenticated merchant
 */
router.get('/transactions', async (req: Request, res: Response) => {
  try {
    // Get merchant from auth middleware
    const merchantAddress = (req as any).merchantAddress;
    
    if (!merchantAddress) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    // Fetch transactions from database
    const transactions = await db.getMerchantTransactions(merchantAddress);

    res.json({
      success: true,
      transactions: transactions || []
    });
  } catch (error) {
    logger.error('Fetch transactions error:', error);
    res.status(500).json({ error: 'Failed to fetch transactions' });
  }
});

export default router;
