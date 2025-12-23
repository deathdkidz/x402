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

interface AuthContextType {
  merchant: Merchant | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isNewUser: boolean;
  login: (address: string, signMessage: (message: string) => Promise<string>) => Promise<void>;
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

  const login = async (address: string, signMessage: (message: string) => Promise<string>) => {
    setIsLoading(true);
    
    try {
      // Create simple sign message
      const domain = window.location.host;
      const timestamp = new Date().toISOString();
      const message = `Sign in to ${domain}\n\nWallet: ${address}\nTimestamp: ${timestamp}`;
      
      // Sign message
      const signature = await signMessage(message);
      
      // Authenticate (auto-registers if new user)
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address, message, signature }),
      });
      
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Authentication failed');
      }
      
      const data = await res.json();
      setIsNewUser(data.isNewUser || false);
      
      // Refresh merchant data
      await checkAuth();
      
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
