import { Router, Request, Response } from 'express';
import { apiKeyAuth } from '../middleware/auth.js';

const router = Router();

/**
 * GET /merchant
 * Get current authenticated merchant info
 */
router.get('/merchant', apiKeyAuth, async (req: Request, res: Response) => {
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

export default router;

