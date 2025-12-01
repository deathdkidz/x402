import Joi from 'joi';
import { Request, Response, NextFunction } from 'express';
import logger from '../utils/logger.js';

// Validation schemas
const paymentRequirementsSchema = Joi.object({
  scheme: Joi.string().required(),
  network: Joi.string().required(),
  asset: Joi.string().required(),
  payTo: Joi.string().required(),
  maxAmountRequired: Joi.string().required(),
  resource: Joi.string().required(),
  description: Joi.string().required(),
  mimeType: Joi.string().required(),
  maxTimeoutSeconds: Joi.number().required(),
  outputSchema: Joi.any().optional(),
  extra: Joi.object().optional(),
});

const authorizationSchema = Joi.object({
  from: Joi.string().required(),
  to: Joi.string().required(),
  value: Joi.string().required(),
  validAfter: Joi.string().required(),
  validBefore: Joi.string().required(),
  nonce: Joi.string().required(),
  extra: Joi.object().optional(),
});

const paymentPayloadSchema = Joi.object({
  x402Version: Joi.number().required(),
  payload: Joi.object({
    authorization: authorizationSchema.required(),
    signature: Joi.string().required(),
  }).required(),
});

const verifyRequestSchema = Joi.object({
  x402Version: Joi.number().required(),
  paymentPayload: paymentPayloadSchema.required(),
  paymentRequirements: paymentRequirementsSchema.required(),
});

const settleRequestSchema = Joi.object({
  x402Version: Joi.number().required(),
  paymentPayload: paymentPayloadSchema.required(),
  paymentRequirements: paymentRequirementsSchema.required(),
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
      const errors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message,
      }));

      logger.warn('Validation failed', { errors, ip: req.ip });

      res.status(400).json({
        error: 'Validation Error',
        message: 'Invalid request payload',
        details: errors,
      });
      return;
    }

    req.body = value;
    next();
  };
};

export const validateVerifyRequest = validate(verifyRequestSchema);
export const validateSettleRequest = validate(settleRequestSchema);
