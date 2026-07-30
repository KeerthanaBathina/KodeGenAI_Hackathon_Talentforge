'use client';

import { ReactNode, useEffect, useState } from 'react';
import { NotificationProvider } from '../contexts/NotificationContext';
import { getAuthToken } from '../lib/auth';

/**
 * Notification Provider Wrapper
 * 
 * Client component that wraps NotificationProvider.
 * Automatically retrieves auth token from cookies on mount.
 * 
 * Required because NotificationProvider uses React hooks and state.
 */
interface NotificationProviderWrapperProps {
  children: ReactNode;
}

export function NotificationProviderWrapper({ children }: NotificationProviderWrapperProps) {
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    // Get auth token from cookies on client-side mount
    const token = getAuthToken();
    setAuthToken(token);
    setIsLoaded(true);
  }, []);

  // Don't render NotificationProvider until we've checked for auth token
  // This prevents flash of unauthenticated state
  if (!isLoaded) {
    return <>{children}</>;
  }

  return (
    <NotificationProvider authToken={authToken}>
      {children}
    </NotificationProvider>
  );
}
