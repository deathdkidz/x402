import Joi from 'joi';
import { Request, Response, NextFunction } from 'express';
import logger from '../utils/logger.js';

// Validation schemas
const paymentRequirementsSchema = Joi.object({
  // Currently only 'exact' scheme is supported. Future schemes can be added here (e.g., 'upto', 'deferred')
  scheme: Joi.string().valid('exact').required()
    .messages({
      'any.required': 'scheme is required',
      'any.only': 'scheme must be "exact" (only exact amount matching is currently supported)',
    }),
  network: Joi.string().min(1).required()
    .messages({
      'any.required': 'network is required',
      'string.empty': 'network cannot be empty',
      'string.min': 'network cannot be empty',
    }),
  asset: Joi.string().pattern(/^0x[a-fA-F0-9]{40}$/).required()
    .messages({
      'any.required': 'asset (token address) is required',
      'string.pattern.base': 'asset must be a valid Ethereum address (e.g., 0x036CbD53842c5426634e7929541eC2318f3dCF7e)',
    }),
  payTo: Joi.string().pattern(/^0x[a-fA-F0-9]{40}$/).required()
    .messages({
      'any.required': 'payTo (merchant address) is required',
      'string.pattern.base': 'payTo must be a valid Ethereum address',
    }),
  maxAmountRequired: Joi.string().pattern(/^\d+$/).required()
    .messages({
      'any.required': 'maxAmountRequired is required',
      'string.pattern.base': 'maxAmountRequired must be a numeric string (e.g., "10000" for 0.01 USDC with 6 decimals)',
    }),
  resource: Joi.string().required()
    .messages({
      'any.required': 'resource (path/identifier) is required',
    }),
  description: Joi.string().required()
    .messages({
      'any.required': 'description is required',
    }),
  mimeType: Joi.string().required()
    .messages({
      'any.required': 'mimeType is required',
    }),
  maxTimeoutSeconds: Joi.number().positive().required()
    .messages({
      'any.required': 'maxTimeoutSeconds is required',
      'number.base': 'maxTimeoutSeconds must be a number',
      'number.positive': 'maxTimeoutSeconds must be positive',
    }),
  outputSchema: Joi.any().optional(),
  extra: Joi.object().optional(),
});

const authorizationSchema = Joi.object({
  from: Joi.string().pattern(/^0x[a-fA-F0-9]{40}$/).required()
    .messages({
      'any.required': 'authorization.from (payer address) is required',
      'string.pattern.base': 'authorization.from must be a valid Ethereum address',
    }),
  to: Joi.string().pattern(/^0x[a-fA-F0-9]{40}$/).required()
    .messages({
      'any.required': 'authorization.to (recipient address) is required',
      'string.pattern.base': 'authorization.to must be a valid Ethereum address',
    }),
  value: Joi.string().pattern(/^\d+$/).required()
    .messages({
      'any.required': 'authorization.value (payment amount) is required',
      'string.pattern.base': 'authorization.value must be a numeric string',
    }),
  validAfter: Joi.string().pattern(/^\d+$/).required()
    .messages({
      'any.required': 'authorization.validAfter (unix timestamp) is required',
      'string.pattern.base': 'authorization.validAfter must be a unix timestamp string',
    }),
  validBefore: Joi.string().pattern(/^\d+$/).required()
    .messages({
      'any.required': 'authorization.validBefore (unix timestamp) is required',
      'string.pattern.base': 'authorization.validBefore must be a unix timestamp string',
    }),
  nonce: Joi.string().pattern(/^0x[a-fA-F0-9]+$/).required()
    .messages({
      'any.required': 'authorization.nonce is required',
      'string.pattern.base': 'authorization.nonce must be a hex string (e.g., 0x1234...)',
    }),
  extra: Joi.object().optional(),
});

const paymentPayloadSchema = Joi.object({
  authorization: authorizationSchema.required()
    .messages({
      'any.required': 'paymentPayload.authorization object is required',
    }),
  signature: Joi.string().pattern(/^0x[a-fA-F0-9]+$/).required()
    .messages({
      'any.required': 'paymentPayload.signature is required',
      'string.pattern.base': 'paymentPayload.signature must be a valid hex signature (e.g., 0xabcd...)',
    }),
});

const verifyRequestSchema = Joi.object({
  x402Version: Joi.number().valid(1).required()
    .messages({
      'any.required': 'x402Version is required',
      'number.base': 'x402Version must be a number',
      'any.only': 'x402Version must be 1 (current protocol version)',
    }),
  paymentPayload: paymentPayloadSchema.required()
    .messages({
      'any.required': 'paymentPayload object is required (contains authorization and signature)',
    }),
  paymentRequirements: paymentRequirementsSchema.required()
    .messages({
      'any.required': 'paymentRequirements object is required (contains network, asset, amounts, etc.)',
    }),
});

const settleRequestSchema = Joi.object({
  x402Version: Joi.number().valid(1).required()
    .messages({
      'any.required': 'x402Version is required',
      'number.base': 'x402Version must be a number',
      'any.only': 'x402Version must be 1 (current protocol version)',
    }),
  paymentPayload: paymentPayloadSchema.required()
    .messages({
      'any.required': 'paymentPayload object is required (contains authorization and signature)',
    }),
  paymentRequirements: paymentRequirementsSchema.required()
    .messages({
      'any.required': 'paymentRequirements object is required (contains network, asset, amounts, etc.)',
    }),
});

/**
 * Validation middleware factory
 */
export const validate = (schema: Joi.ObjectSchema) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const { error, value } = schema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true,
    });

    if (error) {
      const errors = error.details.map(detail => {
        const field = detail.path.join('.');
        let friendlyMessage = detail.message;
        
        // Add helpful hints for common errors
        if (field === 'paymentRequirements.network') {
          friendlyMessage += ' (e.g., "Base Sepolia", "base-sepolia", "Ethereum", etc.)';
        } else if (field === 'paymentRequirements.asset') {
          friendlyMessage += ' (must be a valid token address, e.g., "0x036Cb...")';
        } else if (field === 'paymentRequirements.scheme') {
          friendlyMessage += ' (currently only "exact" is supported)';
        } else if (field === 'paymentPayload.authorization.from') {
          friendlyMessage += ' (must be payer wallet address)';
        } else if (field === 'paymentPayload.authorization.to') {
          friendlyMessage += ' (must match paymentRequirements.payTo)';
        } else if (field === 'paymentPayload.authorization.value') {
          friendlyMessage += ' (amount in token smallest unit, e.g., "10000" for 0.01 USDC)';
        }
        
        return {
          field,
          message: friendlyMessage,
          type: detail.type,
        };
      });

      logger.warn('❌ Validation failed', { 
        ip: req.ip,
        errorCount: errors.length,
        fields: errors.map(e => e.field).join(', ')
      });
      
      // Log detailed validation errors
      errors.forEach(err => {
        logger.warn(`  ❌ ${err.field}: ${err.message}`);
      });

      res.status(400).json({
        error: 'Validation Error',
        message: `Invalid request payload: ${errors.length} validation error(s) found`,
        details: errors,
        hint: 'Check the API documentation at /docs for correct payload structure',
      });
      return;
    }

    req.body = value;
    next();
  };
};

export const validateVerifyRequest = validate(verifyRequestSchema);
export const validateSettleRequest = validate(settleRequestSchema);
