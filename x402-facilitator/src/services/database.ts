import mysql from 'mysql2/promise';
import crypto from 'crypto';
import { ethers } from 'ethers';
import config from '../config/index.js';
import logger from '../utils/logger.js';

export interface Merchant {
  id: number;
  auth_address: string;
  business_name: string | null;
  api_key: string;
  private_key: string;  // Topup wallet private key (derive address when needed)
  created_at: Date;
  updated_at: Date;
  is_active: boolean;
  tier: string;
  verify_limit: number;
  settle_limit: number;
  rate_limit_window: number;
  webhook_url: string | null;
  webhook_secret: string | null;
  webhook_events: string;
  email: string | null;
  profile_image_url: string | null;
}

export interface AuthNonce {
  id: number;
  auth_address: string;
  nonce: string;
  created_at: Date;
  expires_at: Date;
  used: boolean;
}

export interface MerchantSession {
  id: number;
  merchant_id: number;
  session_token: string;
  auth_address: string;
  nonce: string;
  signature: string | null;
  expires_at: Date;
  created_at: Date;
  last_activity: Date;
  ip_address: string | null;
  user_agent: string | null;
  is_active: boolean;
}

class DatabaseService {
  private pool: mysql.Pool;

  constructor() {
    this.pool = mysql.createPool({
      host: config.database.host,
      port: config.database.port,
      database: config.database.database,
      user: config.database.user,
      password: config.database.password,
      waitForConnections: true,
      connectionLimit: config.database.connectionLimit,
      queueLimit: config.database.queueLimit,
      enableKeepAlive: true,
      keepAliveInitialDelay: 10000,
      // Advanced connection pool optimizations
      maxIdle: 10, // Max idle connections to keep
      idleTimeout: 60000, // Close idle connections after 60s
      timezone: '+00:00', // Use UTC
      connectTimeout: 10000, // 10s connection timeout
      // Performance optimizations
      multipleStatements: false, // Security: prevent SQL injection
      dateStrings: false, // Return dates as Date objects
      supportBigNumbers: true, // Handle BIGINT properly
      bigNumberStrings: false, // Return BigInt as numbers when safe
    });

    logger.info(`MySQL connection pool created (${config.database.connectionLimit} connections, queue limit: ${config.database.queueLimit}, maxIdle: 10)`);
  }

  /**
   * Get merchant by API key
   */
  async getMerchantByApiKey(apiKey: string): Promise<Merchant | null> {
    try {
      const [rows] = await this.pool.execute<mysql.RowDataPacket[]>(
        'SELECT * FROM merchants WHERE api_key = ? AND is_active = TRUE',
        [apiKey]
      );

      if (rows.length === 0) {
        return null;
      }

      return rows[0] as Merchant;
    } catch (error) {
      logger.error('Database error getting merchant by API key:', error);
      throw error;
    }
  }

  /**
   * Get topup address from merchant's private key
   * Only derive when needed (e.g., for deposits)
   */
  getTopupAddress(merchant: Merchant): string {
    try {
      const wallet = new ethers.Wallet(merchant.private_key);
      return wallet.address.toLowerCase();
    } catch (error) {
      logger.error('Error deriving topup address from private key:', error);
      throw new Error('Invalid private key');
    }
  }

  /**
   * Get merchant by address (auth address - primary identifier)
   */
  async getMerchantByAddress(address: string): Promise<Merchant | null> {
    try {
      const [rows] = await this.pool.execute<mysql.RowDataPacket[]>(
        'SELECT * FROM merchants WHERE auth_address = ? AND is_active = TRUE',
        [address.toLowerCase()]
      );

      if (rows.length === 0) {
        return null;
      }

      return rows[0] as Merchant;
    } catch (error) {
      logger.error('Database error getting merchant by address:', error);
      throw error;
    }
  }

  /**
   * Get merchant by auth address
   */
  async getMerchantByAuthAddress(authAddress: string): Promise<Merchant | null> {
    try {
      const [rows] = await this.pool.execute<mysql.RowDataPacket[]>(
        'SELECT * FROM merchants WHERE auth_address = ? AND is_active = TRUE',
        [authAddress.toLowerCase()]
      );

      if (rows.length === 0) {
        return null;
      }

      return rows[0] as Merchant;
    } catch (error) {
      logger.error('Database error getting merchant by auth address:', error);
      throw error;
    }
  }

  /**
   * Get merchant by ID
   */
  async getMerchantById(id: number): Promise<Merchant | null> {
    try {
      const [rows] = await this.pool.execute<mysql.RowDataPacket[]>(
        'SELECT * FROM merchants WHERE id = ? AND is_active = TRUE',
        [id]
      );

      if (rows.length === 0) {
        return null;
      }

      return rows[0] as Merchant;
    } catch (error) {
      logger.error('Database error getting merchant by ID:', error);
      throw error;
    }
  }

  /**
   * Create new merchant
   */
  async createMerchant(
    authAddress: string,
    apiKey: string,
    privateKey: string,
    businessName?: string
  ): Promise<Merchant> {
    try {
      const [result] = await this.pool.execute<mysql.ResultSetHeader>(
        'INSERT INTO merchants (auth_address, api_key, private_key, business_name) VALUES (?, ?, ?, ?)',
        [authAddress.toLowerCase(), apiKey, privateKey, businessName || null]
      );

      const merchant = await this.getMerchantByAddress(authAddress);
      if (!merchant) {
        throw new Error('Failed to create merchant');
      }

      logger.info(`New merchant created: auth=${authAddress}`);
      return merchant;
    } catch (error) {
      logger.error('Database error creating merchant:', error);
      throw error;
    }
  }

  /**
   * Update merchant
   */
  async updateMerchant(id: number, updates: Partial<Omit<Merchant, 'id' | 'created_at'>>): Promise<void> {
    try {
      const fields = Object.keys(updates).map(key => `${key} = ?`).join(', ');
      const values = Object.values(updates);

      await this.pool.execute(
        `UPDATE merchants SET ${fields}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [...values, id]
      );

      logger.info(`Merchant ${id} updated`);
    } catch (error) {
      logger.error('Database error updating merchant:', error);
      throw error;
    }
  }

  /**
   * Deactivate merchant
   */
  async deactivateMerchant(id: number): Promise<void> {
    try {
      await this.pool.execute(
        'UPDATE merchants SET is_active = FALSE, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [id]
      );

      logger.info(`Merchant ${id} deactivated`);
    } catch (error) {
      logger.error('Database error deactivating merchant:', error);
      throw error;
    }
  }

  /**
   * Test database connection
   */
  async testConnection(): Promise<void> {
    const connection = await this.pool.getConnection();
    await connection.ping();
    connection.release();
  }

  /**
   * Get transactions for a merchant
   */
  /**
   * Save a new transaction
   */
  async saveTransaction(data: {
    recipientAddress: string;
    payerAddress: string;
    amount: string;
    asset: string;
    network: string;
    nonce: string;
    validAfter: string;
    validBefore: string;
    signature: string;
    resource?: string;
    description?: string;
    mimeType?: string;
    transactionHash?: string;
    status: 'pending' | 'completed' | 'failed';
    timeoutSeconds?: number;
  }): Promise<number> {
    try {
      const timeoutAt = data.timeoutSeconds 
        ? new Date(Date.now() + data.timeoutSeconds * 1000)
        : null;

      const [result] = await this.pool.execute<mysql.ResultSetHeader>(
        `INSERT INTO transactions (recipient_address, payer_address, nonce, valid_after, valid_before, 
         signature, amount, asset, network, resource, description, mime_type, transaction_hash, status, timeout_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          data.recipientAddress.toLowerCase(),
          data.payerAddress.toLowerCase(),
          data.nonce,
          data.validAfter,
          data.validBefore,
          data.signature,
          data.amount,
          data.asset.toLowerCase(),
          data.network,
          data.resource || null,
          data.description || null,
          data.mimeType || null,
          data.transactionHash || null,
          data.status,
          timeoutAt
        ]
      );

      return result.insertId;
    } catch (error) {
      logger.error('Database error saving transaction:', error);
      throw error;
    }
  }

  /**
   * Update transaction status and hash
   */
  async updateTransaction(
    id: number,
    status: 'pending' | 'completed' | 'failed',
    transactionHash?: string
  ): Promise<void> {
    try {
      await this.pool.execute(
        `UPDATE transactions SET status = ?, transaction_hash = ? WHERE id = ?`,
        [status, transactionHash || null, id]
      );
    } catch (error) {
      logger.error('Database error updating transaction:', error);
      throw error;
    }
  }

  /**
   * Get transaction by payer and nonce (for duplicate detection)
   */
  async getTransactionByNonce(
    payerAddress: string,
    nonce: string
  ): Promise<any | null> {
    try {
      const [rows] = await this.pool.execute<mysql.RowDataPacket[]>(
        `SELECT * FROM transactions WHERE payer_address = ? AND nonce = ? LIMIT 1`,
        [payerAddress.toLowerCase(), nonce]
      );

      return rows.length > 0 ? rows[0] : null;
    } catch (error) {
      logger.error('Database error getting transaction by nonce:', error);
      return null;
    }
  }

  /**
   * Get pending transactions that have timed out (for cleanup)
   */
  async getTimedOutPendingTransactions(): Promise<any[]> {
    try {
      const [rows] = await this.pool.execute<mysql.RowDataPacket[]>(
        `SELECT * FROM transactions 
         WHERE status = 'pending' 
         AND timeout_at IS NOT NULL 
         AND timeout_at < NOW()
         ORDER BY timeout_at ASC
         LIMIT 100`
      );

      return rows;
    } catch (error) {
      logger.error('Database error getting timed out transactions:', error);
      return [];
    }
  }

  /**
   * Get all pending transactions for monitoring
   */
  async getPendingTransactions(limit: number = 50): Promise<any[]> {
    try {
      const [rows] = await this.pool.query<mysql.RowDataPacket[]>(
        `SELECT * FROM transactions 
         WHERE status = 'pending' 
         ORDER BY created_at DESC 
         LIMIT ${limit}`
      );

      return rows;
    } catch (error) {
      logger.error('Database error getting pending transactions:', error);
      return [];
    }
  }

  /**
   * Log transaction lifecycle event (reorg, drop, replacement, status change)
   */
  async logTransactionEvent(data: {
    transactionId: number;
    transactionHash: string;
    eventType: 'submitted' | 'pending' | 'preconfirmed' | 'completed' | 'failed' | 
               'reorg_detected' | 'dropped' | 'replaced' | 'rebroadcast' | 'canonical_confirmed';
    fromStatus?: string;
    toStatus?: string;
    blockNumber?: bigint;
    confirmations?: number;
    replacedByTx?: string;
    gasPriceOld?: string;
    gasPriceNew?: string;
    eventData?: any;
    errorMessage?: string;
  }): Promise<number> {
    try {
      const [result] = await this.pool.execute<mysql.ResultSetHeader>(
        `INSERT INTO transaction_events (
          transaction_id, transaction_hash, event_type, from_status, to_status,
          block_number, confirmations, replaced_by_tx, gas_price_old, gas_price_new,
          event_data, error_message
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          data.transactionId,
          data.transactionHash,
          data.eventType,
          data.fromStatus || null,
          data.toStatus || null,
          data.blockNumber?.toString() || null,
          data.confirmations || null,
          data.replacedByTx || null,
          data.gasPriceOld || null,
          data.gasPriceNew || null,
          data.eventData ? JSON.stringify(data.eventData) : null,
          data.errorMessage || null,
        ]
      );

      return result.insertId;
    } catch (error) {
      logger.error('Database error logging transaction event:', error);
      throw error;
    }
  }

  /**
   * Get transaction event history
   */
  async getTransactionEvents(transactionId: number): Promise<any[]> {
    try {
      const [rows] = await this.pool.execute<mysql.RowDataPacket[]>(
        `SELECT * FROM transaction_events WHERE transaction_id = ? ORDER BY created_at ASC`,
        [transactionId]
      );

      return rows;
    } catch (error) {
      logger.error('Database error getting transaction events:', error);
      return [];
    }
  }

  /**
   * Update merchant tier and rate limits
   */
  async updateMerchantTier(
    authAddress: string,
    tier: string,
    verifyLimit?: number,
    settleLimit?: number,
    rateLimitWindow?: number
  ): Promise<void> {
    try {
      const updates: string[] = ['tier = ?'];
      const params: any[] = [tier];

      if (verifyLimit !== undefined) {
        updates.push('verify_limit = ?');
        params.push(verifyLimit);
      }
      if (settleLimit !== undefined) {
        updates.push('settle_limit = ?');
        params.push(settleLimit);
      }
      if (rateLimitWindow !== undefined) {
        updates.push('rate_limit_window = ?');
        params.push(rateLimitWindow);
      }

      params.push(authAddress.toLowerCase());

      await this.pool.execute(
        `UPDATE merchants SET ${updates.join(', ')} WHERE auth_address = ?`,
        params
      );

      logger.info(`Updated merchant ${authAddress} to tier: ${tier}`);
    } catch (error) {
      logger.error('Database error updating merchant tier:', error);
      throw error;
    }
  }

  /**
   * Get merchant rate limits (with Redis caching)
   */
  async getMerchantRateLimits(authAddress: string): Promise<{
    verifyLimit: number;
    settleLimit: number;
    window: number;
    tier: string;
  } | null> {
    try {
      const [rows] = await this.pool.execute<mysql.RowDataPacket[]>(
        'SELECT tier, verify_limit, settle_limit, rate_limit_window FROM merchants WHERE auth_address = ? AND is_active = TRUE',
        [authAddress.toLowerCase()]
      );

      if (rows.length === 0) {
        return null;
      }

      const row = rows[0];
      return {
        verifyLimit: row.verify_limit,
        settleLimit: row.settle_limit,
        window: row.rate_limit_window,
        tier: row.tier,
      };
    } catch (error) {
      logger.error('Database error getting merchant rate limits:', error);
      throw error;
    }
  }

  /**
   * Save gas tracking data for blockchain operations
   */
  async saveGasTracking(data: {
    transactionId?: number;
    merchantId?: number;
    operationType: string;
    network: string;
    transactionHash?: string;
    gasToken: string;
    gasUsed?: bigint;
    gasPrice?: string;
    gasCostWei?: string;
    gasCostNative?: string;
    gasCostUsd?: number;
    balanceBefore?: string;
    balanceAfter?: string;
    status: 'success' | 'failed' | 'reverted';
    errorMessage?: string;
    blockNumber?: bigint;
  }): Promise<number> {
    try {
      const [result] = await this.pool.execute<mysql.ResultSetHeader>(
        `INSERT INTO gas_tracking (
          transaction_id, merchant_id, operation_type, network, 
          transaction_hash, gas_token, gas_used, gas_price, 
          gas_cost_wei, gas_cost_native, gas_cost_usd,
          balance_before, balance_after, status, error_message, block_number
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          data.transactionId || null,
          data.merchantId || null,
          data.operationType,
          data.network,
          data.transactionHash || null,
          data.gasToken,
          data.gasUsed?.toString() || null,
          data.gasPrice || null,
          data.gasCostWei || null,
          data.gasCostNative || null,
          data.gasCostUsd || null,
          data.balanceBefore || null,
          data.balanceAfter || null,
          data.status,
          data.errorMessage || null,
          data.blockNumber?.toString() || null,
        ]
      );

      return result.insertId;
    } catch (error) {
      logger.error('Database error saving gas tracking:', error);
      throw error;
    }
  }

  /**
   * Get gas usage statistics
   */
  async getGasStats(filters?: {
    network?: string;
    operationType?: string;
    merchantId?: number;
    startDate?: Date;
    endDate?: Date;
  }): Promise<{
    totalTransactions: number;
    totalGasCostUsd: number;
    avgGasCostUsd: number;
    byNetwork: Array<{ network: string; count: number; totalCostUsd: number }>;
    byOperation: Array<{ operationType: string; count: number; totalCostUsd: number }>;
  }> {
    try {
      let whereConditions = ['1=1'];
      let params: any[] = [];

      if (filters?.network) {
        whereConditions.push('network = ?');
        params.push(filters.network);
      }
      if (filters?.operationType) {
        whereConditions.push('operation_type = ?');
        params.push(filters.operationType);
      }
      if (filters?.merchantId) {
        whereConditions.push('merchant_id = ?');
        params.push(filters.merchantId);
      }
      if (filters?.startDate) {
        whereConditions.push('timestamp >= ?');
        params.push(filters.startDate);
      }
      if (filters?.endDate) {
        whereConditions.push('timestamp <= ?');
        params.push(filters.endDate);
      }

      const whereClause = whereConditions.join(' AND ');

      // Overall stats
      const [overallRows] = await this.pool.execute<mysql.RowDataPacket[]>(
        `SELECT 
          COUNT(*) as totalTransactions,
          COALESCE(SUM(gas_cost_usd), 0) as totalGasCostUsd,
          COALESCE(AVG(gas_cost_usd), 0) as avgGasCostUsd
         FROM gas_tracking
         WHERE ${whereClause}`,
        params
      );

      // By network
      const [networkRows] = await this.pool.execute<mysql.RowDataPacket[]>(
        `SELECT 
          network,
          COUNT(*) as count,
          COALESCE(SUM(gas_cost_usd), 0) as totalCostUsd
         FROM gas_tracking
         WHERE ${whereClause}
         GROUP BY network`,
        params
      );

      // By operation type
      const [operationRows] = await this.pool.execute<mysql.RowDataPacket[]>(
        `SELECT 
          operation_type as operationType,
          COUNT(*) as count,
          COALESCE(SUM(gas_cost_usd), 0) as totalCostUsd
         FROM gas_tracking
         WHERE ${whereClause}
         GROUP BY operation_type`,
        params
      );

      return {
        totalTransactions: overallRows[0].totalTransactions,
        totalGasCostUsd: parseFloat(overallRows[0].totalGasCostUsd),
        avgGasCostUsd: parseFloat(overallRows[0].avgGasCostUsd),
        byNetwork: networkRows as any,
        byOperation: operationRows as any,
      };
    } catch (error) {
      logger.error('Database error getting gas stats:', error);
      throw error;
    }
  }

  /**
   * Save webhook delivery attempt
   */
  async saveWebhookDelivery(data: {
    transactionId: number;
    webhookUrl: string;
    event: string;
    status: 'success' | 'failed';
    responseCode: number | undefined;
    attempts: number;
    errorMessage?: string;
  }): Promise<void> {
    try {
      await this.pool.execute(
        `INSERT INTO webhook_deliveries 
        (transaction_id, webhook_url, event, status, response_code, attempts, error_message)
        VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          data.transactionId,
          data.webhookUrl,
          data.event,
          data.status,
          data.responseCode || null,
          data.attempts,
          data.errorMessage || null,
        ]
      );
    } catch (error) {
      logger.error('Database error saving webhook delivery:', error);
      throw error;
    }
  }

  /**
   * Get webhook delivery logs for a transaction
   */
  async getWebhookDeliveries(transactionId: number): Promise<any[]> {
    try {
      const [rows] = await this.pool.execute<mysql.RowDataPacket[]>(
        `SELECT * FROM webhook_deliveries 
         WHERE transaction_id = ? 
         ORDER BY created_at DESC`,
        [transactionId]
      );
      return rows;
    } catch (error) {
      logger.error('Database error getting webhook deliveries:', error);
      throw error;
    }
  }

  // ============ Auth Nonce Methods ============

  /**
   * Create auth nonce for wallet authentication
   */
  async createAuthNonce(authAddress: string): Promise<AuthNonce> {
    try {
      const nonce = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

      const [result] = await this.pool.execute<mysql.ResultSetHeader>(
        `INSERT INTO auth_nonces (auth_address, nonce, expires_at) 
         VALUES (?, ?, ?)`,
        [authAddress.toLowerCase(), nonce, expiresAt]
      );

      return {
        id: result.insertId,
        auth_address: authAddress.toLowerCase(),
        nonce,
        created_at: new Date(),
        expires_at: expiresAt,
        used: false,
      };
    } catch (error) {
      logger.error('Database error creating auth nonce:', error);
      throw error;
    }
  }

  /**
   * Get auth nonce
   */
  async getAuthNonce(nonce: string): Promise<AuthNonce | null> {
    try {
      const [rows] = await this.pool.execute<mysql.RowDataPacket[]>(
        `SELECT * FROM auth_nonces 
         WHERE nonce = ? AND used = FALSE AND expires_at > NOW()`,
        [nonce]
      );

      if (rows.length === 0) {
        return null;
      }

      return rows[0] as AuthNonce;
    } catch (error) {
      logger.error('Database error getting auth nonce:', error);
      throw error;
    }
  }

  /**
   * Mark nonce as used
   */
  async markNonceUsed(nonce: string): Promise<void> {
    try {
      await this.pool.execute(
        'UPDATE auth_nonces SET used = TRUE WHERE nonce = ?',
        [nonce]
      );
    } catch (error) {
      logger.error('Database error marking nonce used:', error);
      throw error;
    }
  }

  /**
   * Clean up expired nonces (should be run periodically)
   */
  async cleanupExpiredNonces(): Promise<void> {
    try {
      await this.pool.execute(
        'DELETE FROM auth_nonces WHERE expires_at < NOW()'
      );
    } catch (error) {
      logger.error('Database error cleaning up expired nonces:', error);
      throw error;
    }
  }

  // ============ Merchant Session Methods ============

  /**
   * Create merchant session
   */
  async createMerchantSession(data: {
    merchantId: number;
    authAddress: string;
    nonce: string;
    signature: string;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<MerchantSession> {
    try {
      const sessionToken = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

      const [result] = await this.pool.execute<mysql.ResultSetHeader>(
        `INSERT INTO merchant_sessions 
         (merchant_id, session_token, auth_address, nonce, signature, expires_at, ip_address, user_agent) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          data.merchantId,
          sessionToken,
          data.authAddress.toLowerCase(),
          data.nonce,
          data.signature,
          expiresAt,
          data.ipAddress || null,
          data.userAgent || null,
        ]
      );

      return {
        id: result.insertId,
        merchant_id: data.merchantId,
        session_token: sessionToken,
        auth_address: data.authAddress.toLowerCase(),
        nonce: data.nonce,
        signature: data.signature,
        expires_at: expiresAt,
        created_at: new Date(),
        last_activity: new Date(),
        ip_address: data.ipAddress || null,
        user_agent: data.userAgent || null,
        is_active: true,
      };
    } catch (error) {
      logger.error('Database error creating merchant session:', error);
      throw error;
    }
  }

  /**
   * Get session by token
   */
  async getSessionByToken(sessionToken: string): Promise<MerchantSession | null> {
    try {
      const [rows] = await this.pool.execute<mysql.RowDataPacket[]>(
        `SELECT * FROM merchant_sessions 
         WHERE session_token = ? AND is_active = TRUE AND expires_at > NOW()`,
        [sessionToken]
      );

      if (rows.length === 0) {
        return null;
      }

      // Update last activity
      await this.pool.execute(
        'UPDATE merchant_sessions SET last_activity = NOW() WHERE id = ?',
        [rows[0].id]
      );

      return rows[0] as MerchantSession;
    } catch (error) {
      logger.error('Database error getting session by token:', error);
      throw error;
    }
  }

  /**
   * Invalidate session
   */
  async invalidateSession(sessionToken: string): Promise<void> {
    try {
      await this.pool.execute(
        'UPDATE merchant_sessions SET is_active = FALSE WHERE session_token = ?',
        [sessionToken]
      );
    } catch (error) {
      logger.error('Database error invalidating session:', error);
      throw error;
    }
  }

  /**
   * Get all active sessions for merchant
   */
  async getMerchantSessions(merchantId: number): Promise<MerchantSession[]> {
    try {
      const [rows] = await this.pool.execute<mysql.RowDataPacket[]>(
        `SELECT * FROM merchant_sessions 
         WHERE merchant_id = ? AND is_active = TRUE AND expires_at > NOW()
         ORDER BY last_activity DESC`,
        [merchantId]
      );

      return rows as MerchantSession[];
    } catch (error) {
      logger.error('Database error getting merchant sessions:', error);
      throw error;
    }
  }

  /**
   * Clean up expired sessions (should be run periodically)
   */
  async cleanupExpiredSessions(): Promise<void> {
    try {
      await this.pool.execute(
        'UPDATE merchant_sessions SET is_active = FALSE WHERE expires_at < NOW()'
      );
    } catch (error) {
      logger.error('Database error cleaning up expired sessions:', error);
      throw error;
    }
  }

  /**
   * Close connection pool
   */
  async close(): Promise<void> {
    await this.pool.end();
    logger.info('MySQL connection pool closed');
  }
}

export const db = new DatabaseService();
export default db;
