'use client';

import { useCallback } from 'react';
import { useAccount, useSignTypedData, useChainId } from 'wagmi';
import { type Address, keccak256, toHex, encodePacked } from 'viem';

// EIP-712 type definitions for ERC-3009 transferWithAuthorization
const ERC3009_DOMAIN_TYPES = {
  name: 'string',
  version: 'string',
  chainId: 'uint256',
  verifyingContract: 'address',
} as const;

const ERC3009_TYPES = {
  TransferWithAuthorization: [
    { name: 'from', type: 'address' },
    { name: 'to', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'validAfter', type: 'uint256' },
    { name: 'validBefore', type: 'uint256' },
    { name: 'nonce', type: 'bytes32' },
  ],
} as const;

// EIP-712 type definitions for ERC-2612 permit
const ERC2612_TYPES = {
  Permit: [
    { name: 'owner', type: 'address' },
    { name: 'spender', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
} as const;

export interface ERC3009Authorization {
  from: Address;
  to: Address;
  value: bigint;
  validAfter: bigint;
  validBefore: bigint;
  nonce: `0x${string}`;
}

export interface ERC2612Permit {
  owner: Address;
  spender: Address;
  value: bigint;
  nonce: bigint;
  deadline: bigint;
}

export interface TokenDomain {
  name: string;
  version: string;
  chainId: number;
  verifyingContract: Address;
}

export interface SignedAuthorization {
  authorization: ERC3009Authorization;
  signature: `0x${string}`;
}

export interface SignedPermit {
  permit: ERC2612Permit;
  signature: `0x${string}`;
}

/**
 * Generate a random nonce for ERC-3009 authorization
 */
export function generateNonce(): `0x${string}` {
  const randomBytes = new Uint8Array(32);
  if (typeof window !== 'undefined' && window.crypto) {
    window.crypto.getRandomValues(randomBytes);
  } else {
    // Fallback for SSR
    for (let i = 0; i < 32; i++) {
      randomBytes[i] = Math.floor(Math.random() * 256);
    }
  }
  return `0x${Array.from(randomBytes).map(b => b.toString(16).padStart(2, '0')).join('')}`;
}

/**
 * Hook for signing ERC-3009 and ERC-2612 authorizations
 */
export function useTokenAuthorization() {
  const { address } = useAccount();
  const chainId = useChainId();
  const { signTypedDataAsync, isPending, error } = useSignTypedData();

  /**
   * Sign an ERC-3009 transferWithAuthorization
   */
  const signERC3009 = useCallback(async (
    domain: TokenDomain,
    authorization: Omit<ERC3009Authorization, 'from'>
  ): Promise<SignedAuthorization> => {
    if (!address) {
      throw new Error('Wallet not connected');
    }

    const fullAuthorization: ERC3009Authorization = {
      ...authorization,
      from: address,
    };

    const signature = await signTypedDataAsync({
      domain: {
        name: domain.name,
        version: domain.version,
        chainId: BigInt(domain.chainId),
        verifyingContract: domain.verifyingContract,
      },
      types: ERC3009_TYPES,
      primaryType: 'TransferWithAuthorization',
      message: {
        from: fullAuthorization.from,
        to: fullAuthorization.to,
        value: fullAuthorization.value,
        validAfter: fullAuthorization.validAfter,
        validBefore: fullAuthorization.validBefore,
        nonce: fullAuthorization.nonce,
      },
    });

    return {
      authorization: fullAuthorization,
      signature,
    };
  }, [address, signTypedDataAsync]);

  /**
   * Sign an ERC-2612 permit
   */
  const signERC2612 = useCallback(async (
    domain: TokenDomain,
    permit: Omit<ERC2612Permit, 'owner'>
  ): Promise<SignedPermit> => {
    if (!address) {
      throw new Error('Wallet not connected');
    }

    const fullPermit: ERC2612Permit = {
      ...permit,
      owner: address,
    };

    const signature = await signTypedDataAsync({
      domain: {
        name: domain.name,
        version: domain.version,
        chainId: BigInt(domain.chainId),
        verifyingContract: domain.verifyingContract,
      },
      types: ERC2612_TYPES,
      primaryType: 'Permit',
      message: {
        owner: fullPermit.owner,
        spender: fullPermit.spender,
        value: fullPermit.value,
        nonce: fullPermit.nonce,
        deadline: fullPermit.deadline,
      },
    });

    return {
      permit: fullPermit,
      signature,
    };
  }, [address, signTypedDataAsync]);

  /**
   * Create a payment authorization for x402 protocol
   * Uses ERC-3009 by default
   */
  const createPaymentAuthorization = useCallback(async (params: {
    tokenAddress: Address;
    tokenName: string;
    tokenVersion?: string;
    recipient: Address;
    amount: bigint;
    validitySeconds?: number;
  }): Promise<{
    authorization: ERC3009Authorization;
    signature: `0x${string}`;
    chainId: number;
  }> => {
    const {
      tokenAddress,
      tokenName,
      tokenVersion = '2',
      recipient,
      amount,
      validitySeconds = 300, // 5 minutes default
    } = params;

    const now = BigInt(Math.floor(Date.now() / 1000));
    const validAfter = now - 60n; // 1 minute buffer in the past
    const validBefore = now + BigInt(validitySeconds);
    const nonce = generateNonce();

    const domain: TokenDomain = {
      name: tokenName,
      version: tokenVersion,
      chainId,
      verifyingContract: tokenAddress,
    };

    const result = await signERC3009(domain, {
      to: recipient,
      value: amount,
      validAfter,
      validBefore,
      nonce,
    });

    return {
      ...result,
      chainId,
    };
  }, [chainId, signERC3009]);

  return {
    signERC3009,
    signERC2612,
    createPaymentAuthorization,
    generateNonce,
    isPending,
    error,
    isConnected: !!address,
    address,
    chainId,
  };
}

/**
 * Token configuration for supported tokens
 */
export const SUPPORTED_TOKENS: Record<number, Record<string, {
  address: Address;
  name: string;
  version: string;
  decimals: number;
  symbol: string;
  transferType: 'erc3009' | 'erc2612';
}>> = {
  // Base Mainnet
  8453: {
    USDC: {
      address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
      name: 'USD Coin',
      version: '2',
      decimals: 6,
      symbol: 'USDC',
      transferType: 'erc3009',
    },
  },
  // Base Sepolia
  84532: {
    USDC: {
      address: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
      name: 'USDC',
      version: '2',
      decimals: 6,
      symbol: 'USDC',
      transferType: 'erc3009',
    },
  },
  // Ethereum Mainnet
  1: {
    USDC: {
      address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      name: 'USD Coin',
      version: '2',
      decimals: 6,
      symbol: 'USDC',
      transferType: 'erc3009',
    },
  },
  // Ethereum Sepolia
  11155111: {
    USDC: {
      address: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
      name: 'USDC',
      version: '2',
      decimals: 6,
      symbol: 'USDC',
      transferType: 'erc3009',
    },
  },
  // Optimism
  10: {
    USDC: {
      address: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
      name: 'USDC',
      version: '2',
      decimals: 6,
      symbol: 'USDC',
      transferType: 'erc3009',
    },
  },
  // Optimism Sepolia
  11155420: {
    USDC: {
      address: '0x5fd84259d66Cd46123540766Be93DFE6D43130D7',
      name: 'USDC',
      version: '2',
      decimals: 6,
      symbol: 'USDC',
      transferType: 'erc3009',
    },
  },
  // HyperEVM
  999: {
    USDC: {
      address: '0xb88339CB7199b77E23DB6E890353E22632Ba630f',
      name: 'USDC',
      version: '1',
      decimals: 6,
      symbol: 'USDC',
      transferType: 'erc3009',
    },
  },
  // HyperEVM Testnet
  998: {
    USDC: {
      address: '0x2B3370eE501B4a559b57D449569354196457D8Ab',
      name: 'USDC',
      version: '2',
      decimals: 6,
      symbol: 'USDC',
      transferType: 'erc3009',
    },
  },
};

/**
 * Get token info for a specific chain and symbol
 */
export function getTokenInfo(chainId: number, symbol: string) {
  return SUPPORTED_TOKENS[chainId]?.[symbol];
}

/**
 * Get all supported tokens for a chain
 */
export function getSupportedTokens(chainId: number) {
  return SUPPORTED_TOKENS[chainId] || {};
}
