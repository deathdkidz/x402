import express, { Router, Request, Response } from 'express';
import { validateVerifyRequest, validateSettleRequest } from '../middleware/validation.js';
import { verifyRateLimiter, settleRateLimiter, merchantRateLimiter } from '../middleware/rateLimit.js';
import { apiKeyAuth } from '../middleware/auth.js';
import verificationService from '../services/verification.js';
import settlementService from '../services/settlement.js';
import logger from '../utils/logger.js';
import config from '../config/index.js';

const router: Router = express.Router();

/**
 * Health check endpoint
 */
router.get('/health', (req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    service: 'x402-facilitator',
    timestamp: Date.now(),
    uptime: process.uptime(),
    supportedNetworks: config.supportedNetworks,
  });
});

/**
 * Get supported networks with token information
 * GET /networks
 */
router.get('/networks', (req: Request, res: Response) => {
  const networks = config.supportedNetworks.map(network => {
    const networkConfig = config.networks[network];
    
    if (!networkConfig) {
      return {
        network,
        error: 'Network not configured',
      };
    }
    
    return {
      network,
      chainId: networkConfig.chainId,
      tokens: networkConfig.tokens.map(token => ({
        symbol: token.symbol,
        name: token.name,
        address: token.address,
        decimals: token.decimals,
        eip712: token.eip712 ? {
          name: token.eip712.name,
          version: token.eip712.version,
          verifyingContract: token.address,
        } : undefined,
      })),
      rpcConfigured: !!networkConfig.rpcUrl,
    };
  });

  res.status(200).json({
    success: true,
    networks,
    defaultNetwork: config.network,
  });
});

/**
 * Root endpoint - Service info
 */
router.get('/', (req: Request, res: Response) => {
  res.json({
    name: config.serviceName,
    description: config.serviceDescription,
    endpoints: {
      health: 'GET /health',
      networks: 'GET /networks',
      verify: 'POST /verify',
      settle: 'POST /settle',
    },
    supportedNetworks: config.supportedNetworks,
  });
});

/**
 * Verify payment endpoint
 * POST /verify
 * 
 * Multi-layer verification:
 * 1. Network validation
 * 2. Signature verification
 * 3. Balance verification
 * 4. Allowance verification
 * 5. Amount validation
 * 6. Time window validation
 */
router.post(
  '/verify',
  verifyRateLimiter,
  apiKeyAuth,
  merchantRateLimiter,
  validateVerifyRequest,
  async (req: Request, res: Response) => {
    const startTime = Date.now();
    const { paymentPayload, paymentRequirements } = req.body;

    logger.info('=== VERIFY REQUEST RECEIVED ===');
    logger.info(`From IP: ${req.ip}`);
    logger.info(`Network: ${paymentRequirements.network}`);
    logger.info(`Asset: ${paymentRequirements.asset}`);
    logger.info(`Amount: ${paymentRequirements.maxAmountRequired}`);

    try {
      const result = await verificationService.verify(
        paymentPayload,
        paymentRequirements
      );

      const duration = Date.now() - startTime;
      logger.info(`Verification completed in ${duration}ms: ${result.isValid ? 'SUCCESS' : 'FAILED'}`);

      if (result.isValid) {
        res.status(200).json({
          isValid: true,
          is_valid: true, // Python compatibility
          payer: result.payer,
        });
      } else {
        res.status(200).json({
          isValid: false,
          is_valid: false, // Python compatibility
          invalidReason: result.invalidReason,
          invalid_reason: result.invalidReason, // Python compatibility
          payer: result.payer,
        });
      }
    } catch (error) {
      logger.error('Verification endpoint error:', error);
      res.status(500).json({
        isValid: false,
        is_valid: false,
        invalidReason: 'Internal server error during verification',
        invalid_reason: 'Internal server error during verification',
      });
    }
  }
);

/**
 * Settle payment endpoint
 * POST /settle
 * 
 * Multi-layer settlement with safety checks:
 * 1. Network validation
 * 2. Signature verification (EIP-712)
 * 3. Time window validation
 * 4. Amount matching validation
 * 5. Pre-settlement balance check
 * 6. Duplicate transaction detection
 * 7. Replay attack protection (nonce)
 * 8. Gas estimation
 * 9. Transaction execution
 * 10. Transaction monitoring
 */
router.post(
  '/settle',
  settleRateLimiter,
  apiKeyAuth,
  merchantRateLimiter,
  validateSettleRequest,
  async (req: Request, res: Response) => {
    const startTime = Date.now();
    const { paymentPayload, paymentRequirements } = req.body;

    logger.info('=== SETTLE REQUEST RECEIVED ===');
    logger.info(`From IP: ${req.ip}`);
    logger.info(`Merchant: ${req.merchant?.auth_address}`);
    logger.info(`Network: ${paymentRequirements.network}`);
    logger.info(`Asset: ${paymentRequirements.asset}`);
    logger.info(`Amount: ${paymentRequirements.maxAmountRequired}`);

    if (!req.merchant) {
      res.status(401).json({
        success: false,
        errorReason: 'Authentication required for settlement',
      });
      return;
    }

    try {
      const result = await settlementService.settle(
        paymentPayload,
        paymentRequirements,
        req.merchant.auth_address
      );

      const duration = Date.now() - startTime;
      logger.info(`Settlement completed in ${duration}ms: ${result.success ? 'SUCCESS' : 'FAILED'}`);

      if (result.success) {
        res.status(200).json({
          success: true,
          transaction: result.transaction,
          transactionHash: result.transaction, // Python compatibility
          network: result.network,
          payer: result.payer,
          status: result.status || 'completed',
          message: result.message,
        });
      } else {
        res.status(200).json({
          success: false,
          errorReason: result.errorReason,
          error_reason: result.errorReason, // Python compatibility
          network: result.network,
          payer: result.payer,
          transactionHash: result.transactionHash,
          transactionStatus: result.transactionStatus,
          status: result.status || 'failed',
        });
      }
    } catch (error) {
      logger.error('Settlement endpoint error:', error);
      res.status(500).json({
        success: false,
        errorReason: 'Internal server error during settlement',
        error_reason: 'Internal server error during settlement',
        network: paymentRequirements.network,
      });
    }
  }
);

export default router;
