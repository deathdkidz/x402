// Types for x402 protocol
export interface PaymentRequirements {
  scheme: string;
  network: string;
  asset: string;
  payTo: string;
  maxAmountRequired: string;
  resource: string;
  description: string;
  mimeType: string;
  maxTimeoutSeconds: number;
  outputSchema?: any;
  extra?: Record<string, any>;
}

export interface EIP3009Authorization {
  from: string;
  to: string;
  value: string;
  validAfter: string;
  validBefore: string;
  nonce: string;
  extra?: Record<string, any>;
}

export interface PaymentPayload {
  authorization: EIP3009Authorization;
  signature: string;
}

export interface VerifyResponse {
  isValid: boolean;
  payer?: string;
  invalidReason?: string;
}

export interface SettleResponse {
  success: boolean;
  transaction?: string;
  network: string;
  payer?: string;
  errorReason?: string;
  transactionHash?: string;
  transactionStatus?: string;
  cached?: boolean;
  status?: 'pending' | 'completed' | 'failed' | 'preconfirmed';
  message?: string;
}

export interface VerifyRequest {
  x402Version: number;
  paymentPayload: PaymentPayload;
  paymentRequirements: PaymentRequirements;
}

export interface SettleRequest {
  x402Version: number;
  paymentPayload: PaymentPayload;
  paymentRequirements: PaymentRequirements;
}
