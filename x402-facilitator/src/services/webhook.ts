import crypto from 'crypto';
import logger from '../utils/logger.js';
import db from './database.js';

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

interface WebhookDeliveryResult {
  success: boolean;
  statusCode?: number;
  attempts: number;
  error?: string;
}

/**
 * Service to send webhooks to merchants with retry logic and delivery tracking
 */
export class WebhookService {
  private readonly maxRetries = 3;
  private readonly retryDelays = [0, 5000, 15000]; // 0s, 5s, 15s

  /**
   * Validate webhook URL security
   */
  private validateWebhookUrl(url: string): void {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'https:') {
        throw new Error('Webhook URL must use HTTPS for security');
      }
      // Prevent SSRF attacks - block localhost and private IPs
      const hostname = parsed.hostname.toLowerCase();
      if (
        hostname === 'localhost' ||
        hostname === '127.0.0.1' ||
        hostname === '::1' ||
        hostname.startsWith('192.168.') ||
        hostname.startsWith('10.') ||
        hostname.startsWith('172.16.') ||
        hostname.endsWith('.local')
      ) {
        throw new Error('Webhook URL cannot point to private/local addresses');
      }
    } catch (error) {
      if (error instanceof TypeError) {
        throw new Error('Invalid webhook URL format');
      }
      throw error;
    }
  }

  /**
   * Send webhook notification to merchant with retry logic
   */
  async sendWebhook(
    webhookUrl: string,
    webhookSecret: string | null,
    payload: WebhookPayload
  ): Promise<WebhookDeliveryResult> {
    // Validate URL security
    try {
      this.validateWebhookUrl(webhookUrl);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Invalid webhook URL';
      logger.error(`🚫 Webhook URL validation failed: ${errorMsg}`);
      await this.logDelivery(payload.transactionId, webhookUrl, payload.event, 'failed', 0, 1, errorMsg);
      return { success: false, attempts: 1, error: errorMsg };
    }

    let lastError: string = '';
    let lastStatusCode: number | undefined;

    // Retry loop with exponential backoff
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        // Wait before retry (skip for first attempt)
        if (attempt > 1) {
          await this.sleep(this.retryDelays[attempt - 1]);
          logger.info(`🔄 Retrying webhook (attempt ${attempt}/${this.maxRetries})...`);
        }

        const body = JSON.stringify(payload);
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          'User-Agent': 'x402-facilitator/1.0',
          'X-Webhook-Event': payload.event,
          'X-Webhook-Timestamp': payload.timestamp.toString(),
          'X-Webhook-Delivery-Attempt': attempt.toString(),
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

        lastStatusCode = response.status;

        if (response.ok) {
          logger.info(`✅ Webhook sent successfully to ${webhookUrl} (${payload.event}) - attempt ${attempt}`);
          await this.logDelivery(payload.transactionId, webhookUrl, payload.event, 'success', response.status, attempt);
          return { success: true, statusCode: response.status, attempts: attempt };
        } else {
          lastError = `HTTP ${response.status} ${response.statusText}`;
          logger.warn(`⚠️ Webhook failed (attempt ${attempt}/${this.maxRetries}): ${lastError}`);
        }
      } catch (error) {
        lastError = error instanceof Error ? error.message : 'Unknown error';
        logger.error(`❌ Webhook error (attempt ${attempt}/${this.maxRetries}):`, error);
      }
    }

    // All retries failed
    logger.error(`🔴 Webhook delivery failed after ${this.maxRetries} attempts to ${webhookUrl}`);
    await this.logDelivery(payload.transactionId, webhookUrl, payload.event, 'failed', lastStatusCode, this.maxRetries, lastError);
    return { success: false, statusCode: lastStatusCode, attempts: this.maxRetries, error: lastError };
  }

  /**
   * Log webhook delivery attempt to database
   */
  private async logDelivery(
    transactionId: number,
    webhookUrl: string,
    event: string,
    status: 'success' | 'failed',
    responseCode: number | undefined,
    attempts: number,
    errorMessage?: string
  ): Promise<void> {
    try {
      await db.saveWebhookDelivery({
        transactionId,
        webhookUrl,
        event,
        status,
        responseCode,
        attempts,
        errorMessage,
      });
    } catch (error) {
      logger.warn('Failed to log webhook delivery:', error);
    }
  }

  /**
   * Sleep utility for retry delays
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
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
