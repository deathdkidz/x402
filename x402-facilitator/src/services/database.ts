import mysql from 'mysql2/promise';
import config from '../config/index.js';
import logger from '../utils/logger.js';

export interface Merchant {
  id: number;
  merchant_address: string;
  api_key: string;
  private_key: string;
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
      connectionLimit: 50, // Increased for heavy load
      queueLimit: 0,
      enableKeepAlive: true,
      keepAliveInitialDelay: 10000,
    });

    logger.info('MySQL connection pool created (50 connections)');
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
   * Get merchant by address
   */
  async getMerchantByAddress(address: string): Promise<Merchant | null> {
    try {
      const [rows] = await this.pool.execute<mysql.RowDataPacket[]>(
        'SELECT * FROM merchants WHERE merchant_address = ? AND is_active = TRUE',
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
   * Create new merchant
   */
  async createMerchant(
    merchantAddress: string,
    apiKey: string,
    privateKey: string
  ): Promise<Merchant> {
    try {
      const [result] = await this.pool.execute<mysql.ResultSetHeader>(
        'INSERT INTO merchants (merchant_address, api_key, private_key) VALUES (?, ?, ?)',
        [merchantAddress.toLowerCase(), apiKey, privateKey]
      );

      const merchant = await this.getMerchantByAddress(merchantAddress);
      if (!merchant) {
        throw new Error('Failed to create merchant');
      }

      logger.info(`New merchant created: ${merchantAddress}`);
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
    merchantAddress: string;
    payerAddress: string;
    amount: string;
    asset: string;
    network: string;
    nonce: string;
    validAfter: string;
    validBefore: string;
    signature: string;
    transactionHash?: string;
    status: 'pending' | 'completed' | 'failed';
    timeoutSeconds?: number;
  }): Promise<number> {
    try {
      const timeoutAt = data.timeoutSeconds 
        ? new Date(Date.now() + data.timeoutSeconds * 1000)
        : null;

      const [result] = await this.pool.execute<mysql.ResultSetHeader>(
        `INSERT INTO transactions (merchant_address, payer_address, nonce, valid_after, valid_before, 
         signature, amount, asset, network, transaction_hash, status, timeout_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          data.merchantAddress.toLowerCase(),
          data.payerAddress.toLowerCase(),
          data.nonce,
          data.validAfter,
          data.validBefore,
          data.signature,
          data.amount,
          data.asset.toLowerCase(),
          data.network,
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
   * Update merchant tier and rate limits
   */
  async updateMerchantTier(
    merchantAddress: string,
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

      params.push(merchantAddress);

      await this.pool.execute(
        `UPDATE merchants SET ${updates.join(', ')} WHERE merchant_address = ?`,
        params
      );

      logger.info(`Updated merchant ${merchantAddress} to tier: ${tier}`);
    } catch (error) {
      logger.error('Database error updating merchant tier:', error);
      throw error;
    }
  }

  /**
   * Get merchant rate limits (with Redis caching)
   */
  async getMerchantRateLimits(merchantAddress: string): Promise<{
    verifyLimit: number;
    settleLimit: number;
    window: number;
    tier: string;
  } | null> {
    try {
      const [rows] = await this.pool.execute<mysql.RowDataPacket[]>(
        'SELECT tier, verify_limit, settle_limit, rate_limit_window FROM merchants WHERE merchant_address = ? AND is_active = TRUE',
        [merchantAddress]
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
   * Close connection pool
   */
  async close(): Promise<void> {
    await this.pool.end();
    logger.info('MySQL connection pool closed');
  }
}

export const db = new DatabaseService();
export default db;
