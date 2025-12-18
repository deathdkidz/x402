import { ethers } from 'ethers';
import { PaymentPayload, PaymentRequirements, VerifyResponse } from '../types/index.js';
import config, { getRpcUrl, getEIP712Domain, getTokenByAddress } from '../config/index.js';
import logger from '../utils/logger.js';
import providerPool from './providerPool.js';

// Standard ERC20 ABI for balance checking
const ERC20_ABI = [
  'function balanceOf(address account) view returns (uint256)',
  'function decimals() view returns (uint8)',
];

/**
 * Multi-layer payment verification service
 * Implements multiple security checks:
 * 1. Network validation
 * 1.5. Token validation
 * 2. Payload extraction and structure validation
 * 3. Signature verification (EIP-712/EIP-191)
 * 3.5. Recipient address validation (prevents payment redirection)
 * 4. Time window validation
 * 5. Balance verification
 * 6. Amount validation
 */
export class VerificationService {
  /**
   * Get provider for specific network (from persistent pool)
   */
  private getProvider(network: string): ethers.JsonRpcProvider | ethers.WebSocketProvider {
    return providerPool.getProvider(network);
  }

  /**
   * Main verification method with multi-layer checks
   */
  async verify(
    payload: PaymentPayload,
    requirements: PaymentRequirements
  ): Promise<VerifyResponse> {
    try {
      // Layer 1: Validate network
      const networkCheck = this.validateNetwork(requirements.network);
      if (!networkCheck.isValid) {
        return networkCheck;
      }
      const normalizedNetwork = networkCheck.normalizedNetwork!;

      logger.info('=== STARTING PAYMENT VERIFICATION ===');
      logger.info(`Network: ${normalizedNetwork}`);
      logger.info(`Asset: ${requirements.asset}`);
      logger.info(`Amount: ${requirements.maxAmountRequired}`);

      // Layer 1.5: Validate token support
      const tokenCheck = this.validateToken(normalizedNetwork, requirements.asset);
      if (!tokenCheck.isValid) {
        return tokenCheck;
      }

      // Layer 2: Extract and validate payload structure
      const extractionResult = this.extractPaymentData(payload);
      if (!extractionResult.isValid) {
        return extractionResult;
      }

      const { payer, signature, authorization } = extractionResult;

      // Layer 3: Reconstruct and verify message signature
      // Use normalized network for domain lookup
      const normalizedRequirements = { ...requirements, network: normalizedNetwork };
      const signatureCheck = await this.verifySignature(
        payer!,
        signature!,
        authorization!,
        normalizedRequirements
      );
      if (!signatureCheck.isValid) {
        return signatureCheck;
      }

      // Layer 3.5: Verify recipient matches (CRITICAL SECURITY)
      const recipientCheck = this.verifyRecipient(authorization!, requirements);
      if (!recipientCheck.isValid) {
        return recipientCheck;
      }

      // Layer 4: Verify time window
      const timeCheck = this.verifyTimeWindow(authorization!);
      if (!timeCheck.isValid) {
        return timeCheck;
      }

      // Layer 5: Verify token balance
      const balanceCheck = await this.verifyBalance(
        payer!,
        requirements.asset,
        requirements.maxAmountRequired,
        normalizedNetwork
      );
      if (!balanceCheck.isValid) {
        return balanceCheck;
      }

      // Layer 6: Verify amounts match
      const amountCheck = this.verifyAmounts(
        authorization!.value,
        requirements.maxAmountRequired
      );
      if (!amountCheck.isValid) {
        return amountCheck;
      }

      logger.info('✅ All verification layers passed successfully');
      return {
        isValid: true,
        payer,
      };

    } catch (error) {
      logger.error('❌ Verification error:', error);
      return {
        isValid: false,
        invalidReason: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Layer 1: Validate network is supported
   */
  private validateNetwork(network: string): VerifyResponse & { normalizedNetwork?: string } {
    const allNetworks = [...config.mainnetNetworks, ...config.testnetNetworks];
    
    // Try exact match first (case-insensitive)
    const exactMatch = allNetworks.find(n => n.toLowerCase() === network.toLowerCase());
    if (exactMatch) {
      logger.debug(`✓ Network validation passed (exact match): ${exactMatch}`);
      return { isValid: true, normalizedNetwork: exactMatch };
    }
    
    // Fallback: Normalize network name to title case for case-insensitive comparison
    const normalizedNetwork = network.split(/[-_\s]+/).map(word => 
      word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    ).join(' ');
    
    if (!allNetworks.includes(normalizedNetwork)) {
      logger.warn(`Unsupported network: ${network}`);
      return {
        isValid: false,
        invalidReason: `Network '${network}' is not supported. Supported networks: ${allNetworks.join(', ')}`,
      };
    }
    logger.debug(`✓ Network validation passed: ${normalizedNetwork}`);
    return { isValid: true, normalizedNetwork };
  }

  /**
   * Layer 1.5: Validate token is supported on the network
   */
  private validateToken(network: string, tokenAddress: string): VerifyResponse {
    const token = getTokenByAddress(network, tokenAddress);
    if (!token) {
      logger.warn(`Unsupported token: ${tokenAddress} on network: ${network}`);
      const networkConfig = config.networks[network];
      const supportedTokens = networkConfig?.tokens.map(t => `${t.symbol} (${t.address})`).join(', ') || 'none';
      return {
        isValid: false,
        invalidReason: `Token '${tokenAddress}' is not supported on network '${network}'. Supported tokens: ${supportedTokens}`,
      };
    }
    logger.debug(`✓ Token validation passed: ${token.symbol} (${token.address})`);
    return { isValid: true };
  }

  /**
   * Layer 2: Extract payment data from payload
   */
  private extractPaymentData(payload: PaymentPayload): VerifyResponse & {
    payer?: string;
    signature?: string;
    authorization?: any;
  } {
    const payer = payload.authorization?.from;
    const signature = payload.signature;
    const authorization = payload.authorization;

    if (!payer || !signature) {
      logger.warn('Missing payer address or signature in payload');
      return {
        isValid: false,
        invalidReason: 'Missing payer address or signature',
      };
    }

    logger.debug(`✓ Payload extraction passed: Payer=${payer}`);
    return {
      isValid: true,
      payer,
      signature,
      authorization,
    };
  }

  /**
   * Layer 3: Verify signature (supports both EIP-191 and EIP-712)
   */
  private async verifySignature(
    payer: string,
    signature: string,
    authorization: any,
    requirements: PaymentRequirements
  ): Promise<VerifyResponse> {
    try {
      let recoveredAddress: string;

      // Try EIP-712 verification first (for ERC-3009 compatibility)
      // Check if we have domain config for this network and token
      const domain = getEIP712Domain(requirements.network, requirements.asset);
      
      if (domain) {
        // This is an ERC-3009 compatible token, use EIP-712
        const types = {
          TransferWithAuthorization: [
            { name: 'from', type: 'address' },
            { name: 'to', type: 'address' },
            { name: 'value', type: 'uint256' },
            { name: 'validAfter', type: 'uint256' },
            { name: 'validBefore', type: 'uint256' },
            { name: 'nonce', type: 'bytes32' },
          ],
        };

        const value = {
          from: authorization.from,
          to: authorization.to,
          value: authorization.value,
          validAfter: parseInt(authorization.validAfter),
          validBefore: parseInt(authorization.validBefore),
          nonce: authorization.nonce,
        };

        try {
          recoveredAddress = ethers.verifyTypedData(domain, types, value, signature);
          logger.debug(`✓ EIP-712 typed data signature verification succeeded`);
        } catch (eip712Error) {
          logger.warn(`EIP-712 verification failed, trying EIP-191: ${eip712Error}`);
          // Fall through to EIP-191 verification
          recoveredAddress = await this.verifyEIP191(authorization, requirements, payer, signature);
        }
      } else {
        // Not an ERC-3009 token or no domain config, use EIP-191
        recoveredAddress = await this.verifyEIP191(authorization, requirements, payer, signature);
      }

      if (recoveredAddress.toLowerCase() !== payer.toLowerCase()) {
        logger.warn(`Signature verification failed. Expected ${payer}, got ${recoveredAddress}`);
        return {
          isValid: false,
          invalidReason: `Invalid signature. Expected signer: ${payer}, got: ${recoveredAddress}`,
        payer,
      };
    }

    logger.debug(`✓ Signature verification passed`);
    return { isValid: true, payer };    } catch (error) {
      logger.error('Signature verification error:', error);
      return {
        isValid: false,
        invalidReason: `Signature verification failed: ${error instanceof Error ? error.message : String(error)}`,
        payer,
      };
    }
  }

  /**
   * EIP-191 message signature verification (fallback)
   */
  private async verifyEIP191(
    authorization: any,
    requirements: PaymentRequirements,
    payer: string,
    signature: string
  ): Promise<string> {
    let messageToVerify = '';

    if (authorization.extra && typeof authorization.extra === 'object' && 'message' in authorization.extra) {
      messageToVerify = authorization.extra.message as string;
      logger.debug(`✓ Using custom EIP-191 message from payload`);
    } else {
      // Default message format
      messageToVerify = `Chain ID: ${requirements.network}
Contract: ${requirements.asset}
User: ${payer}
Receiver: ${requirements.payTo}
Amount: ${requirements.maxAmountRequired}
`;
      logger.debug(`✓ Using default EIP-191 message format`);
    }

    return ethers.verifyMessage(messageToVerify, signature);
  }

  /**
   * Layer 3.5: Verify recipient matches (CRITICAL SECURITY CHECK)
   * Prevents payment redirection attacks where attacker uses valid signature
   * but changes the recipient in paymentRequirements
   */
  private verifyRecipient(authorization: any, requirements: PaymentRequirements): VerifyResponse {
    const authTo = authorization.to.toLowerCase();
    const reqTo = requirements.payTo.toLowerCase();
    
    if (authTo !== reqTo) {
      logger.warn(`⚠️ SECURITY: Recipient mismatch! Signed for: ${authTo}, Required: ${reqTo}`);
      return {
        isValid: false,
        invalidReason: `Recipient mismatch. Payment authorized for ${authTo}, but requirements specify ${reqTo}. Possible attack attempt.`,
      };
    }
    
    logger.debug(`✓ Recipient verification passed: ${reqTo}`);
    return { isValid: true };
  }

  /**
   * Layer 4: Verify time window
   */
  private verifyTimeWindow(authorization: any): VerifyResponse {
    const now = Math.floor(Date.now() / 1000);
    const validAfter = parseInt(authorization.validAfter, 10);
    const validBefore = parseInt(authorization.validBefore, 10);

    if (now < validAfter) {
      logger.warn(`Payment not yet valid. Current: ${now}, Valid after: ${validAfter}`);
      return {
        isValid: false,
        invalidReason: 'Payment authorization not yet valid',
      };
    }

    if (now > validBefore) {
      logger.warn(`Payment expired. Current: ${now}, Valid before: ${validBefore}`);
      return {
        isValid: false,
        invalidReason: 'Payment authorization expired',
      };
    }

    logger.debug(`✓ Time window validation passed`);
    return { isValid: true };
  }

  /**
   * Layer 5: Verify token balance
   */
  private async verifyBalance(
    payer: string,
    asset: string,
    requiredAmount: string,
    network: string
  ): Promise<VerifyResponse> {
    try {
      const provider = this.getProvider(network);
      const tokenContract = new ethers.Contract(asset, ERC20_ABI, provider);
      const balance = await tokenContract.balanceOf(payer);
      const required = BigInt(requiredAmount);

      if (balance < required) {
        logger.warn(`Insufficient balance. Has ${balance.toString()}, needs ${required.toString()}`);
        return {
          isValid: false,
          invalidReason: `Insufficient balance. Has ${balance.toString()}, needs ${required.toString()}`,
        payer,
      };
    }

    logger.debug(`✓ Balance verification passed: ${balance.toString()}`);
    return { isValid: true, payer };    } catch (error) {
      logger.error('Balance check error:', error);
      return {
        isValid: false,
        invalidReason: `Balance check failed: ${error instanceof Error ? error.message : String(error)}`,
        payer,
      };
    }
  }

  /**
   * Layer 6: Verify amounts match
   */
  private verifyAmounts(authAmount: string, requiredAmount: string): VerifyResponse {
    const auth = BigInt(authAmount);
    const required = BigInt(requiredAmount);

    if (auth !== required) {
      logger.warn(`Amount mismatch. Authorization: ${auth.toString()}, Required: ${required.toString()}`);
      return {
        isValid: false,
        invalidReason: `Amount mismatch. Authorization amount (${auth.toString()}) doesn't match required amount (${required.toString()})`,
      };
    }

    logger.debug(`✓ Amount verification passed`);
    return { isValid: true };
  }
}

export default new VerificationService();
