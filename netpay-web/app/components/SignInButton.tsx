'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';

declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
      on: (event: string, callback: (...args: unknown[]) => void) => void;
      removeListener: (event: string, callback: (...args: unknown[]) => void) => void;
      isMetaMask?: boolean;
    };
  }
}

interface SignInButtonProps {
  className?: string;
  children?: React.ReactNode;
  variant?: 'primary' | 'secondary';
  size?: 'sm' | 'md' | 'lg';
}

export default function SignInButton({ 
  className = '',
  children,
  variant = 'primary',
  size = 'md',
}: SignInButtonProps) {
  const router = useRouter();
  const { login, isAuthenticated, isLoading: authLoading } = useAuth();
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showError, setShowError] = useState(false);
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [adminRole, setAdminRole] = useState<string | null>(null);

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated && !authLoading && !showAdminModal) {
      router.push('/dashboard');
    }
  }, [isAuthenticated, authLoading, router, showAdminModal]);

  // Auto-hide error after 5 seconds
  useEffect(() => {
    if (error) {
      setShowError(true);
      const timer = setTimeout(() => setShowError(false), 5000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  const handleSignIn = async () => {
    if (!window.ethereum) {
      setError('Please install MetaMask or another Web3 wallet');
      return;
    }

    setIsConnecting(true);
    setError(null);

    try {
      // Request account access
      const accounts = await window.ethereum.request({ 
        method: 'eth_requestAccounts' 
      }) as string[];
      
      if (accounts.length === 0) {
        throw new Error('No accounts found');
      }

      const address = accounts[0];

      // Sign message function
      const signMessage = async (message: string): Promise<string> => {
        const signature = await window.ethereum!.request({
          method: 'personal_sign',
          params: [message, address],
        }) as string;
        return signature;
      };

      // Login
      const result = await login(address, signMessage);

      // If admin, show choice modal
      if (result.isAdmin) {
        setAdminRole(result.adminRole);
        setShowAdminModal(true);
      } else {
        // Regular user - redirect to dashboard
        router.push('/dashboard');
      }
    } catch (err: unknown) {
      console.error('Sign in error:', err);
      if (err instanceof Error) {
        if (err.message.includes('rejected')) {
          setError('Connection request rejected');
        } else {
          setError(err.message);
        }
      } else {
        setError('Failed to connect wallet');
      }
    } finally {
      setIsConnecting(false);
    }
  };

  const handleAdminChoice = (goToAdmin: boolean) => {
    setShowAdminModal(false);
    if (goToAdmin) {
      router.push('/admin');
    } else {
      router.push('/dashboard');
    }
  };

  // Style variants
  const baseStyles = 'font-medium rounded-lg transition-colors inline-flex items-center justify-center gap-2';
  const sizeStyles = {
    sm: 'px-4 py-2 text-sm',
    md: 'px-6 py-3 text-base',
    lg: 'px-8 py-4 text-lg',
  };
  const variantStyles = {
    primary: 'bg-amber-500 hover:bg-amber-400 text-black',
    secondary: 'border border-neutral-700 hover:border-neutral-600 text-white',
  };

  const buttonStyles = `${baseStyles} ${sizeStyles[size]} ${variantStyles[variant]} ${className}`;

  // If already loading or authenticated, show appropriate state
  if (authLoading) {
    return (
      <button className={buttonStyles} disabled>
        <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
        Loading...
      </button>
    );
  }

  if (isAuthenticated) {
    return (
      <button 
        className={buttonStyles}
        onClick={() => router.push('/dashboard')}
      >
        Go to Dashboard
      </button>
    );
  }

  return (
    <>
      <button 
        className={buttonStyles}
        onClick={handleSignIn}
        disabled={isConnecting}
      >
        {isConnecting ? (
          <>
            <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            Connecting...
          </>
        ) : (
          children || 'Sign In with Wallet'
        )}
      </button>

      {/* Error Toast */}
      {showError && error && (
        <div className="fixed bottom-4 right-4 z-50 animate-in slide-in-from-bottom-4">
          <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-3 rounded-lg flex items-center gap-3">
            <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-sm">{error}</span>
            <button 
              onClick={() => setShowError(false)}
              className="text-red-400 hover:text-red-300"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Admin Choice Modal */}
      {showAdminModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6 max-w-md w-full mx-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-amber-500/10 rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </div>
              <div>
                <h3 className="font-semibold">Admin Access</h3>
                <p className="text-sm text-neutral-400">You have {adminRole} privileges</p>
              </div>
            </div>
            <p className="text-neutral-400 text-sm mb-6">
              Your wallet is registered as an admin. Where would you like to go?
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => handleAdminChoice(false)}
                className="flex-1 px-4 py-2 border border-neutral-700 hover:border-neutral-600 rounded-lg transition-colors"
              >
                Merchant Dashboard
              </button>
              <button
                onClick={() => handleAdminChoice(true)}
                className="flex-1 px-4 py-2 bg-amber-500 hover:bg-amber-400 text-black font-medium rounded-lg transition-colors"
              >
                Admin Panel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
