'use client';

import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';

interface Merchant {
  id: number;
  address: string;
  businessName: string | null;
  creditBalance: number;
  status: string;
  createdAt: string;
}

interface LoginResult {
  isNewUser: boolean;
  isAdmin: boolean;
  adminRole: string | null;
}

interface AuthContextType {
  merchant: Merchant | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isNewUser: boolean;
  login: (address: string, signMessage: (message: string) => Promise<string>) => Promise<LoginResult>;
  logout: () => Promise<void>;
  refreshMerchant: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [merchant, setMerchant] = useState<Merchant | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isNewUser, setIsNewUser] = useState(false);

  const checkAuth = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/me');
      const data = await res.json();
      
      if (data.authenticated && data.merchant) {
        setMerchant(data.merchant);
      } else {
        setMerchant(null);
      }
    } catch (error) {
      console.error('Auth check failed:', error);
      setMerchant(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  const login = async (address: string, signMessage: (message: string) => Promise<string>): Promise<LoginResult> => {
    setIsLoading(true);
    
    try {
      // Step 1: Get SIWE nonce from server
      const nonceRes = await fetch('/api/auth/siwe/nonce');
      if (!nonceRes.ok) {
        throw new Error('Failed to get nonce');
      }
      const { nonce } = await nonceRes.json();
      
      // Step 2: Create SIWE message (EIP-4361 format)
      const domain = window.location.host;
      const origin = window.location.origin;
      const issuedAt = new Date().toISOString();
      const chainId = 1; // Default to mainnet for SIWE
      
      const siweMessage = `${domain} wants you to sign in with your Ethereum account:
${address}

Sign in to NetPay Dashboard

URI: ${origin}
Version: 1
Chain ID: ${chainId}
Nonce: ${nonce}
Issued At: ${issuedAt}`;
      
      // Step 3: Sign message
      const signature = await signMessage(siweMessage);
      
      // Step 4: Verify with server
      const res = await fetch('/api/auth/siwe/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: siweMessage, signature }),
      });
      
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Authentication failed');
      }
      
      const data = await res.json();
      setIsNewUser(data.isNewUser || false);
      
      // Refresh merchant data
      await checkAuth();
      
      return {
        isNewUser: data.isNewUser || false,
        isAdmin: data.isAdmin || false,
        adminRole: data.adminRole || null,
      };
      
    } catch (error) {
      console.error('Login failed:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      setMerchant(null);
      setIsNewUser(false);
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  const refreshMerchant = async () => {
    await checkAuth();
  };

  return (
    <AuthContext.Provider
      value={{
        merchant,
        isLoading,
        isAuthenticated: !!merchant,
        isNewUser,
        login,
        logout,
        refreshMerchant,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
