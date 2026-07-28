import React from 'react';
import { useToast } from '../contexts/ToastContext';
import { Toast } from './Toast';

/**
 * ToastContainer Component
 * 
 * Renders all active toasts in a fixed position (top-right corner).
 * Toasts are stacked vertically with spacing.
 */
export function ToastContainer() {
  const { toasts } = useToast();

  return (
    <div
      className="fixed top-4 right-4 z-50 pointer-events-none"
      aria-live="polite"
      aria-atomic="false"
    >
      <div className="space-y-3 pointer-events-auto">
        {toasts.map(toast => (
          <Toast key={toast.id} toast={toast} />
        ))}
      </div>
    </div>
  );
}
