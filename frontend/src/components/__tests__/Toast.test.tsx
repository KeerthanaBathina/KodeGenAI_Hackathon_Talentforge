import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { Toast } from '../Toast';
import { ToastProvider } from '../../contexts/ToastContext';
import type { Toast as ToastType } from '../../types/toast';

// Mock window.location.href
const originalLocation = window.location;

describe('Toast Component', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Mock window.location
    delete (window as any).location;
    (window as any).location = { href: '' };
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    window.location = originalLocation;
  });

  const mockToast: ToastType = {
    id: 'test-toast-1',
    title: 'Test Title',
    message: 'Test message content',
    type: 'info',
    duration: 5000
  };

  describe('Rendering', () => {
    it('should render toast with title and message', () => {
      render(
        <ToastProvider>
          <Toast toast={mockToast} />
        </ToastProvider>
      );

      expect(screen.getByText('Test Title')).toBeInTheDocument();
      expect(screen.getByText('Test message content')).toBeInTheDocument();
    });

    it('should render with info styling', () => {
      render(
        <ToastProvider>
          <Toast toast={mockToast} />
        </ToastProvider>
      );

      const toast = screen.getByTestId('toast');
      expect(toast.className).toContain('bg-blue-50');
      expect(toast.className).toContain('border-blue-500');
      expect(toast.className).toContain('text-blue-900');
    });

    it('should render with success styling', () => {
      const successToast: ToastType = {
        ...mockToast,
        type: 'success'
      };

      render(
        <ToastProvider>
          <Toast toast={successToast} />
        </ToastProvider>
      );

      const toast = screen.getByTestId('toast');
      expect(toast.className).toContain('bg-green-50');
      expect(toast.className).toContain('border-green-500');
      expect(toast.className).toContain('text-green-900');
    });

    it('should render with warning styling', () => {
      const warningToast: ToastType = {
        ...mockToast,
        type: 'warning'
      };

      render(
        <ToastProvider>
          <Toast toast={warningToast} />
        </ToastProvider>
      );

      const toast = screen.getByTestId('toast');
      expect(toast.className).toContain('bg-yellow-50');
      expect(toast.className).toContain('border-yellow-500');
      expect(toast.className).toContain('text-yellow-900');
    });

    it('should render with error styling', () => {
      const errorToast: ToastType = {
        ...mockToast,
        type: 'error'
      };

      render(
        <ToastProvider>
          <Toast toast={errorToast} />
        </ToastProvider>
      );

      const toast = screen.getByTestId('toast');
      expect(toast.className).toContain('bg-red-50');
      expect(toast.className).toContain('border-red-500');
      expect(toast.className).toContain('text-red-900');
    });

    it('should render close button', () => {
      render(
        <ToastProvider>
          <Toast toast={mockToast} />
        </ToastProvider>
      );

      const closeButton = screen.getByLabelText('Close notification');
      expect(closeButton).toBeInTheDocument();
    });

    it('should show success icon for success type', () => {
      const successToast: ToastType = {
        ...mockToast,
        type: 'success'
      };

      render(
        <ToastProvider>
          <Toast toast={successToast} />
        </ToastProvider>
      );

      const icon = screen.getByTestId('toast').querySelector('svg');
      expect(icon).toBeInTheDocument();
    });

    it('should show warning icon for warning type', () => {
      const warningToast: ToastType = {
        ...mockToast,
        type: 'warning'
      };

      render(
        <ToastProvider>
          <Toast toast={warningToast} />
        </ToastProvider>
      );

      const icon = screen.getByTestId('toast').querySelector('svg');
      expect(icon).toBeInTheDocument();
    });

    it('should show error icon for error type', () => {
      const errorToast: ToastType = {
        ...mockToast,
        type: 'error'
      };

      render(
        <ToastProvider>
          <Toast toast={errorToast} />
        </ToastProvider>
      );

      const icon = screen.getByTestId('toast').querySelector('svg');
      expect(icon).toBeInTheDocument();
    });

    it('should show info icon for info type', () => {
      render(
        <ToastProvider>
          <Toast toast={mockToast} />
        </ToastProvider>
      );

      const icon = screen.getByTestId('toast').querySelector('svg');
      expect(icon).toBeInTheDocument();
    });
  });

  describe('Close functionality', () => {
    it('should trigger exit animation on close button click', async () => {
      render(
        <ToastProvider>
          <Toast toast={mockToast} />
        </ToastProvider>
      );

      const closeButton = screen.getByLabelText('Close notification');
      const toastElement = screen.getByTestId('toast');
      
      // Initially should have enter animation
      expect(toastElement.className).toContain('animate-toast-enter');
      
      fireEvent.click(closeButton);

      // After clicking close, should have exit animation
      await waitFor(() => {
        expect(toastElement.className).toContain('animate-toast-exit');
      });
    });

    it('should remove toast after exit animation completes', async () => {
      render(
        <ToastProvider>
          <Toast toast={mockToast} />
        </ToastProvider>
      );

      const closeButton = screen.getByLabelText('Close notification');
      
      fireEvent.click(closeButton);

      // Fast-forward past exit animation (300ms)
      act(() => {
        vi.advanceTimersByTime(300);
      });

      await waitFor(() => {
        expect(screen.queryByText('Test Title')).not.toBeInTheDocument();
      });
    });

    it('should not propagate close button click to toast', () => {
      const toastWithAction: ToastType = {
        ...mockToast,
        actionUrl: '/test-url'
      };

      render(
        <ToastProvider>
          <Toast toast={toastWithAction} />
        </ToastProvider>
      );

      const closeButton = screen.getByLabelText('Close notification');
      
      fireEvent.click(closeButton);

      // window.location.href should not be set because stopPropagation prevented toast click
      expect(window.location.href).toBe('');
    });
  });

  describe('Action URL navigation', () => {
    it('should navigate when toast with actionUrl is clicked', () => {
      const toastWithAction: ToastType = {
        ...mockToast,
        actionUrl: '/requisitions/123'
      };

      render(
        <ToastProvider>
          <Toast toast={toastWithAction} />
        </ToastProvider>
      );

      const toast = screen.getByTestId('toast');
      
      fireEvent.click(toast);

      expect(window.location.href).toBe('/requisitions/123');
    });

    it('should not navigate when toast without actionUrl is clicked', () => {
      render(
        <ToastProvider>
          <Toast toast={mockToast} />
        </ToastProvider>
      );

      const toast = screen.getByTestId('toast');
      
      fireEvent.click(toast);

      expect(window.location.href).toBe('');
    });

    it('should add hover styles when actionUrl is present', () => {
      const toastWithAction: ToastType = {
        ...mockToast,
        actionUrl: '/test-url'
      };

      render(
        <ToastProvider>
          <Toast toast={toastWithAction} />
        </ToastProvider>
      );

      const toast = screen.getByTestId('toast');
      
      expect(toast.className).toContain('cursor-pointer');
      expect(toast.className).toContain('hover:shadow-xl');
    });

    it('should not add hover styles when actionUrl is absent', () => {
      render(
        <ToastProvider>
          <Toast toast={mockToast} />
        </ToastProvider>
      );

      const toast = screen.getByTestId('toast');
      
      expect(toast.className).not.toContain('cursor-pointer');
    });
  });

  describe('Keyboard navigation', () => {
    it('should navigate on Enter key when actionUrl is present', () => {
      const toastWithAction: ToastType = {
        ...mockToast,
        actionUrl: '/test-url'
      };

      render(
        <ToastProvider>
          <Toast toast={toastWithAction} />
        </ToastProvider>
      );

      const toast = screen.getByTestId('toast');
      
      fireEvent.keyDown(toast, { key: 'Enter' });

      expect(window.location.href).toBe('/test-url');
    });

    it('should navigate on Space key when actionUrl is present', () => {
      const toastWithAction: ToastType = {
        ...mockToast,
        actionUrl: '/test-url'
      };

      render(
        <ToastProvider>
          <Toast toast={toastWithAction} />
        </ToastProvider>
      );

      const toast = screen.getByTestId('toast');
      
      fireEvent.keyDown(toast, { key: ' ' });

      expect(window.location.href).toBe('/test-url');
    });

    it('should not navigate on other keys', () => {
      const toastWithAction: ToastType = {
        ...mockToast,
        actionUrl: '/test-url'
      };

      render(
        <ToastProvider>
          <Toast toast={toastWithAction} />
        </ToastProvider>
      );

      const toast = screen.getByTestId('toast');
      
      fireEvent.keyDown(toast, { key: 'Escape' });

      expect(window.location.href).toBe('');
    });

    it('should have tabIndex when actionUrl is present', () => {
      const toastWithAction: ToastType = {
        ...mockToast,
        actionUrl: '/test-url'
      };

      render(
        <ToastProvider>
          <Toast toast={toastWithAction} />
        </ToastProvider>
      );

      const toast = screen.getByTestId('toast');
      
      expect(toast).toHaveAttribute('tabIndex', '0');
    });

    it('should not have tabIndex when actionUrl is absent', () => {
      render(
        <ToastProvider>
          <Toast toast={mockToast} />
        </ToastProvider>
      );

      const toast = screen.getByTestId('toast');
      
      expect(toast).not.toHaveAttribute('tabIndex');
    });
  });

  describe('Accessibility', () => {
    it('should have role="button" when actionUrl is present', () => {
      const toastWithAction: ToastType = {
        ...mockToast,
        actionUrl: '/test-url'
      };

      render(
        <ToastProvider>
          <Toast toast={toastWithAction} />
        </ToastProvider>
      );

      const toast = screen.getByTestId('toast');
      
      expect(toast).toHaveAttribute('role', 'button');
    });

    it('should have role="status" when actionUrl is absent', () => {
      render(
        <ToastProvider>
          <Toast toast={mockToast} />
        </ToastProvider>
      );

      const toast = screen.getByTestId('toast');
      
      expect(toast).toHaveAttribute('role', 'status');
    });

    it('should have aria-live="polite"', () => {
      render(
        <ToastProvider>
          <Toast toast={mockToast} />
        </ToastProvider>
      );

      const toast = screen.getByTestId('toast');
      
      expect(toast).toHaveAttribute('aria-live', 'polite');
    });

    it('should have aria-atomic="true"', () => {
      render(
        <ToastProvider>
          <Toast toast={mockToast} />
        </ToastProvider>
      );

      const toast = screen.getByTestId('toast');
      
      expect(toast).toHaveAttribute('aria-atomic', 'true');
    });

    it('should have accessible close button label', () => {
      render(
        <ToastProvider>
          <Toast toast={mockToast} />
        </ToastProvider>
      );

      const closeButton = screen.getByLabelText('Close notification');
      
      expect(closeButton).toBeInTheDocument();
    });
  });

  describe('Animation', () => {
    it('should start with enter animation', () => {
      render(
        <ToastProvider>
          <Toast toast={mockToast} />
        </ToastProvider>
      );

      const toast = screen.getByTestId('toast');
      
      expect(toast.className).toContain('animate-toast-enter');
    });

    it('should switch to exit animation when closing', async () => {
      render(
        <ToastProvider>
          <Toast toast={mockToast} />
        </ToastProvider>
      );

      const closeButton = screen.getByLabelText('Close notification');
      const toast = screen.getByTestId('toast');
      
      fireEvent.click(closeButton);

      await waitFor(() => {
        expect(toast.className).toContain('animate-toast-exit');
      });
    });
  });
});
