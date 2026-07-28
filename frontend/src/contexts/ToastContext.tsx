import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { Toast } from '../types/toast';

/**
 * Toast Context Value
 * 
 * Provides toast queue state and actions.
 */
interface ToastContextValue {
  /** Array of active toasts */
  toasts: Toast[];

  /** Add a new toast to the queue */
  addToast: (toast: Omit<Toast, 'id'>) => void;

  /** Remove a toast from the queue */
  removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

/**
 * useToast Hook
 * 
 * Access toast context from any component.
 * Must be used within ToastProvider.
 */
export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within ToastProvider');
  }
  return context;
}

/**
 * ToastProvider Props
 */
interface ToastProviderProps {
  children: ReactNode;
}

/**
 * ToastProvider
 * 
 * Manages toast notification queue with auto-dismiss timers.
 * Limits visible toasts to 3 at a time.
 */
export function ToastProvider({ children }: ToastProviderProps) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  /**
   * Add a new toast to the queue
   * 
   * Automatically generates ID and sets up auto-dismiss timer.
   * Limits queue to max 3 toasts.
   */
  const addToast = useCallback((toast: Omit<Toast, 'id'>) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const newToast: Toast = {
      id,
      duration: 5000, // Default 5 seconds
      ...toast
    };

    setToasts(prev => {
      // Add new toast to beginning (top of stack)
      // Keep max 3 toasts visible
      const updated = [newToast, ...prev];
      return updated.slice(0, 3);
    });

    // Auto-dismiss after duration
    if (newToast.duration && newToast.duration > 0) {
      setTimeout(() => {
        removeToast(id);
      }, newToast.duration);
    }
  }, []);

  /**
   * Remove a toast from the queue
   * 
   * Called by auto-dismiss timer or manual close button.
   */
  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const value: ToastContextValue = {
    toasts,
    addToast,
    removeToast
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
    </ToastContext.Provider>
  );
}
