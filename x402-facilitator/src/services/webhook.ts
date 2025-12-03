import crypto from 'crypto';
import logger from '../utils/logger.js';

interface WebhookPayload {
  event: 'transaction.completed' | 'transaction.failed' | 'transaction.pending';
  transactionId: number;
  transactionHash: string;
  merchantAddress: string;
  payerAddress: string;
  amount: string;
  asset: string;
  network: string;
  resource?: string;
  description?: string;
  mimeType?: string;
  status: 'pending' | 'completed' | 'failed';
  timestamp: number;
}

/**
 * Service to send webhooks to merchants
 */
export class WebhookService {
  /**
   * Send webhook notification to merchant
   */
  async sendWebhook(
    webhookUrl: string,
    webhookSecret: string | null,
    payload: WebhookPayload
  ): Promise<boolean> {
    try {
      const body = JSON.stringify(payload);
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-Webhook-Event': payload.event,
        'X-Webhook-Timestamp': payload.timestamp.toString(),
      };

      // Add signature if secret is configured
      if (webhookSecret) {
        const signature = this.generateSignature(body, webhookSecret);
        headers['X-Webhook-Signature'] = signature;
      }

      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers,
        body,
        signal: AbortSignal.timeout(10000), // 10 second timeout
      });

      if (response.ok) {
        logger.info(`✅ Webhook sent successfully to ${webhookUrl} (${payload.event})`);
        return true;
      } else {
        logger.warn(`⚠️ Webhook failed: ${response.status} ${response.statusText}`);
        return false;
      }
    } catch (error) {
      logger.error(`❌ Webhook error for ${webhookUrl}:`, error);
      return false;
    }
  }

  /**
   * Generate HMAC signature for webhook verification
   */
  private generateSignature(payload: string, secret: string): string {
    return crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex');
  }

  /**
   * Verify webhook signature (for merchants to use)
   */
  verifySignature(payload: string, signature: string, secret: string): boolean {
    const expectedSignature = this.generateSignature(payload, secret);
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  }
}

const webhookService = new WebhookService();
export default webhookService;
