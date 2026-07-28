import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react';
import { ToastProvider, useToast } from '../ToastContext';
import { Toast } from '../../types/toast';

// Test component to access toast context
function TestComponent() {
  const { toasts, addToast, removeToast } = useToast();
  
  return (
    <div>
      <div data-testid="toast-count">{toasts.length}</div>
      {toasts.map((toast) => (
        <div key={toast.id} data-testid={`toast-${toast.id}`}>
          <span data-testid={`toast-title-${toast.id}`}>{toast.title}</span>
          <span data-testid={`toast-message-${toast.id}`}>{toast.message}</span>
          <span data-testid={`toast-type-${toast.id}`}>{toast.type}</span>
          <button 
            data-testid={`remove-${toast.id}`}
            onClick={() => removeToast(toast.id)}
          >
            Remove
          </button>
        </div>
      ))}
      <button 
        data-testid="add-toast"
        onClick={() => addToast({
          title: 'Test Toast',
          message: 'Test message',
          type: 'success'
        })}
      >
        Add Toast
      </button>
      <button 
        data-testid="add-toast-with-action"
        onClick={() => addToast({
          title: 'Action Toast',
          message: 'Click to navigate',
          type: 'info',
          actionUrl: '/test-url'
        })}
      >
        Add Action Toast
      </button>
    </div>
  );
}

describe('ToastContext', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('Provider initialization', () => {
    it('should render children', () => {
      render(
        <ToastProvider>
          <div data-testid="child">Child Content</div>
        </ToastProvider>
      );

      expect(screen.getByTestId('child')).toBeInTheDocument();
    });

    it('should start with empty toast array', () => {
      render(
        <ToastProvider>
          <TestComponent />
        </ToastProvider>
      );

      expect(screen.getByTestId('toast-count')).toHaveTextContent('0');
    });

    it('should throw error when useToast is used outside provider', () => {
      // Suppress console.error for this test
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

      expect(() => {
        render(<TestComponent />);
      }).toThrow('useToast must be used within ToastProvider');

      consoleError.mockRestore();
    });
  });

  describe('addToast', () => {
    it('should add a toast to the queue', async () => {
      render(
        <ToastProvider>
          <TestComponent />
        </ToastProvider>
      );

      const addButton = screen.getByTestId('add-toast');
      
      fireEvent.click(addButton);

      await waitFor(() => {
        expect(screen.getByTestId('toast-count')).toHaveTextContent('1');
      });

      expect(screen.getByText('Test Toast')).toBeInTheDocument();
      expect(screen.getByText('Test message')).toBeInTheDocument();
    });

    it('should generate unique ID for each toast', async () => {
      render(
        <ToastProvider>
          <TestComponent />
        </ToastProvider>
      );

      const addButton = screen.getByTestId('add-toast');
      
      fireEvent.click(addButton);
      fireEvent.click(addButton);

      await waitFor(() => {
        expect(screen.getByTestId('toast-count')).toHaveTextContent('2');
      });

      const toasts = screen.getAllByText('Test Toast');
      expect(toasts).toHaveLength(2);
    });

    it('should add toast with actionUrl', async () => {
      render(
        <ToastProvider>
          <TestComponent />
        </ToastProvider>
      );

      const addButton = screen.getByTestId('add-toast-with-action');
      
      fireEvent.click(addButton);

      await waitFor(() => {
        expect(screen.getByText('Action Toast')).toBeInTheDocument();
      });
    });

    it('should limit queue to 3 toasts maximum', async () => {
      render(
        <ToastProvider>
          <TestComponent />
        </ToastProvider>
      );

      const addButton = screen.getByTestId('add-toast');
      
      fireEvent.click(addButton);
      fireEvent.click(addButton);
      fireEvent.click(addButton);
      fireEvent.click(addButton); // 4th toast should replace oldest

      await waitFor(() => {
        expect(screen.getByTestId('toast-count')).toHaveTextContent('3');
      });
    });

    it('should auto-dismiss toast after duration', async () => {
      render(
        <ToastProvider>
          <TestComponent />
        </ToastProvider>
      );

      const addButton = screen.getByTestId('add-toast');
      
      fireEvent.click(addButton);

      await waitFor(() => {
        expect(screen.getByTestId('toast-count')).toHaveTextContent('1');
      });

      // Fast-forward time by 5 seconds (default duration)
      act(() => {
        vi.advanceTimersByTime(5000);
      });

      await waitFor(() => {
        expect(screen.getByTestId('toast-count')).toHaveTextContent('0');
      });
    });

    it('should not auto-dismiss if duration is 0', async () => {
      function TestComponentNoDuration() {
        const { toasts, addToast } = useToast();
        
        return (
          <div>
            <div data-testid="toast-count">{toasts.length}</div>
            <button 
              data-testid="add-toast-no-duration"
              onClick={() => addToast({
                title: 'Persistent Toast',
                message: 'No auto-dismiss',
                type: 'warning',
                duration: 0
              })}
            >
              Add Persistent Toast
            </button>
          </div>
        );
      }

      render(
        <ToastProvider>
          <TestComponentNoDuration />
        </ToastProvider>
      );

      const addButton = screen.getByTestId('add-toast-no-duration');
      
      fireEvent.click(addButton);

      await waitFor(() => {
        expect(screen.getByTestId('toast-count')).toHaveTextContent('1');
      });

      // Fast-forward time by 10 seconds
      act(() => {
        vi.advanceTimersByTime(10000);
      });

      // Toast should still be there
      expect(screen.getByTestId('toast-count')).toHaveTextContent('1');
    });
  });

  describe('removeToast', () => {
    it('should remove a specific toast', async () => {
      render(
        <ToastProvider>
          <TestComponent />
        </ToastProvider>
      );

      const addButton = screen.getByTestId('add-toast');
      
      fireEvent.click(addButton);

      await waitFor(() => {
        expect(screen.getByTestId('toast-count')).toHaveTextContent('1');
      });

      const toastElement = screen.getByText('Test Toast');
      expect(toastElement).toBeInTheDocument();

      const removeButton = screen.getByTestId(/^remove-toast-/);
      
      fireEvent.click(removeButton);

      await waitFor(() => {
        expect(screen.getByTestId('toast-count')).toHaveTextContent('0');
      });
    });

    it('should remove only the specified toast when multiple exist', async () => {
      function TestComponentMultiple() {
        const { toasts, addToast, removeToast } = useToast();
        
        return (
          <div>
            <div data-testid="toast-count">{toasts.length}</div>
            {toasts.map((toast) => (
              <div key={toast.id} data-testid={`toast-${toast.id}`}>
                <span>{toast.title}</span>
                <button 
                  data-testid={`remove-${toast.id}`}
                  onClick={() => removeToast(toast.id)}
                >
                  Remove
                </button>
              </div>
            ))}
            <button 
              data-testid="add-toast-1"
              onClick={() => addToast({
                title: 'Toast 1',
                message: 'Message 1',
                type: 'success'
              })}
            >
              Add Toast 1
            </button>
            <button 
              data-testid="add-toast-2"
              onClick={() => addToast({
                title: 'Toast 2',
                message: 'Message 2',
                type: 'info'
              })}
            >
              Add Toast 2
            </button>
          </div>
        );
      }

      render(
        <ToastProvider>
          <TestComponentMultiple />
        </ToastProvider>
      );

      const addButton1 = screen.getByTestId('add-toast-1');
      const addButton2 = screen.getByTestId('add-toast-2');
      
      fireEvent.click(addButton1);
      fireEvent.click(addButton2);

      await waitFor(() => {
        expect(screen.getByTestId('toast-count')).toHaveTextContent('2');
      });

      const toast1 = screen.getByText('Toast 1');
      expect(toast1).toBeInTheDocument();

      // Find and click remove button for Toast 1
      const toast1Element = toast1.closest('[data-testid^="toast-"]');
      const removeButton = toast1Element?.querySelector('[data-testid^="remove-"]') as HTMLElement;
      
      fireEvent.click(removeButton);

      await waitFor(() => {
        expect(screen.getByTestId('toast-count')).toHaveTextContent('1');
      });

      expect(screen.queryByText('Toast 1')).not.toBeInTheDocument();
      expect(screen.getByText('Toast 2')).toBeInTheDocument();
    });
  });

  describe('Toast ordering', () => {
    it('should add new toasts to the beginning of the array', async () => {
      function TestComponentOrdering() {
        const { toasts, addToast } = useToast();
        
        return (
          <div>
            <div data-testid="toast-order">
              {toasts.map((toast, index) => (
                <div key={toast.id} data-testid={`toast-position-${index}`}>
                  {toast.title}
                </div>
              ))}
            </div>
            <button 
              data-testid="add-first"
              onClick={() => addToast({
                title: 'First Toast',
                message: 'Added first',
                type: 'success'
              })}
            >
              Add First
            </button>
            <button 
              data-testid="add-second"
              onClick={() => addToast({
                title: 'Second Toast',
                message: 'Added second',
                type: 'info'
              })}
            >
              Add Second
            </button>
          </div>
        );
      }

      render(
        <ToastProvider>
          <TestComponentOrdering />
        </ToastProvider>
      );

      const addFirst = screen.getByTestId('add-first');
      const addSecond = screen.getByTestId('add-second');
      
      fireEvent.click(addFirst);

      await waitFor(() => {
        expect(screen.getByTestId('toast-position-0')).toHaveTextContent('First Toast');
      });

      fireEvent.click(addSecond);

      await waitFor(() => {
        // Second toast should be at position 0 (most recent)
        expect(screen.getByTestId('toast-position-0')).toHaveTextContent('Second Toast');
        // First toast should be at position 1
        expect(screen.getByTestId('toast-position-1')).toHaveTextContent('First Toast');
      });
    });
  });
});
