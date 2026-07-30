/**
 * useReasonCodes Hook
 * 
 * Fetches reason codes for a specific decision outcome category.
 * Supports dynamic loading when outcome selection changes.
 * 
 * @param category - Decision outcome category (offer_decision, reject_decision, hold_decision, withdraw_decision)
 * @returns Reason codes array, loading state, and error
 */

import { useState, useEffect } from 'react';

export interface ReasonCode {
  id: string;
  code: string;
  displayText: string;
  description: string | null;
  category: string;
  displayOrder: number;
}

export interface UseReasonCodesResult {
  reasonCodes: ReasonCode[];
  loading: boolean;
  error: string | null;
}

export function useReasonCodes(category: string | null): UseReasonCodesResult {
  const [reasonCodes, setReasonCodes] = useState<ReasonCode[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Reset state if no category selected
    if (!category) {
      setReasonCodes([]);
      setLoading(false);
      setError(null);
      return;
    }

    const fetchReasonCodes = async () => {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(`/api/reason-codes?category=${category}`, {
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json'
          }
        });

        if (!response.ok) {
          throw new Error(`Failed to load reason codes: ${response.statusText}`);
        }

        const data = await response.json();
        
        if (!data.success || !Array.isArray(data.data)) {
          throw new Error('Invalid response format');
        }

        setReasonCodes(data.data);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to load reason codes';
        setError(errorMessage);
        setReasonCodes([]);
      } finally {
        setLoading(false);
      }
    };

    fetchReasonCodes();
  }, [category]);

  return { reasonCodes, loading, error };
}
