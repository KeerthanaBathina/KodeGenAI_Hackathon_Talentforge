'use client';

import React, { useState } from 'react';
import { Toast as ToastType } from '../types/toast';
import { useToast } from '../contexts/ToastContext';

/**
 * Toast Props
 */
interface ToastProps {
  toast: ToastType;
}

/**
 * Toast Component
 * 
 * Displays a temporary notification with auto-dismiss.
 * Supports manual dismiss and click-to-navigate.
 */
export function Toast({ toast }: ToastProps) {
  const { removeToast } = useToast();
  const [isExiting, setIsExiting] = useState(false);

  /**
   * Handle close button click
   * Triggers exit animation then removes toast
   */
  const handleClose = () => {
    setIsExiting(true);
    setTimeout(() => {
      removeToast(toast.id);
    }, 300); // Match fade-out animation duration
  };

  /**
   * Handle toast click
   * Navigates to actionUrl if provided
   */
  const handleClick = () => {
    if (toast.actionUrl) {
      window.location.href = toast.actionUrl;
      handleClose();
    }
  };

  /**
   * Handle close button click
   * Stop propagation to prevent toast click navigation
   */
  const handleCloseClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    handleClose();
  };

  // Type-specific styling
  const typeStyles = {
    info: 'bg-blue-50 border-blue-500 text-blue-900',
    success: 'bg-green-50 border-green-500 text-green-900',
    warning: 'bg-yellow-50 border-yellow-500 text-yellow-900',
    error: 'bg-red-50 border-red-500 text-red-900'
  };

  const iconStyles = {
    info: 'text-blue-500',
    success: 'text-green-500',
    warning: 'text-yellow-500',
    error: 'text-red-500'
  };

  return (
    <div
      data-testid="toast"
      className={`
        w-[360px] p-4 mb-3 rounded-lg shadow-lg border-l-4
        ${typeStyles[toast.type]}
        ${isExiting ? 'animate-toast-exit' : 'animate-toast-enter'}
        ${toast.actionUrl ? 'cursor-pointer hover:shadow-xl' : ''}
        transition-shadow
      `}
      onClick={handleClick}
      role={toast.actionUrl ? 'button' : 'status'}
      aria-live="polite"
      aria-atomic="true"
      tabIndex={toast.actionUrl ? 0 : undefined}
      onKeyDown={(e) => {
        if (toast.actionUrl && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          handleClick();
        }
      }}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-start flex-1 min-w-0">
          {/* Icon */}
          <div className={`mr-3 flex-shrink-0 ${iconStyles[toast.type]}`}>
            {toast.type === 'success' && (
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            )}
            {toast.type === 'warning' && (
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            )}
            {toast.type === 'error' && (
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            )}
            {toast.type === 'info' && (
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            )}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <h4 className="font-semibold text-sm mb-1">{toast.title}</h4>
            <p className="text-sm break-words">{toast.message}</p>
          </div>
        </div>

        {/* Close button */}
        <button
          onClick={handleCloseClick}
          className="ml-3 flex-shrink-0 text-gray-400 hover:text-gray-600 transition-colors focus:outline-none focus:ring-2 focus:ring-gray-400 rounded"
          aria-label="Close notification"
          type="button"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}

