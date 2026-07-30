import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import VerifyOtpPage from '../page';

const pushMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: pushMock
  }),
  useSearchParams: () => ({
    get: (key: string) => (key === 'email' ? 'user@example.com' : null)
  })
}));

describe('VerifyOtpPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('redirects to onboarding on successful OTP verification', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ redirectTo: '/onboarding/profile' })
    } as Response);

    render(<VerifyOtpPage />);

    fireEvent.change(screen.getByLabelText('One-time passcode'), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Verify code' }));

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith('/onboarding/profile');
    });
  });

  it('shows expired message and resend button for expired OTP', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      json: async () => ({ message: 'Code expired - please request a new one', canResend: true })
    } as Response);

    render(<VerifyOtpPage />);

    fireEvent.change(screen.getByLabelText('One-time passcode'), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Verify code' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Code expired - please request a new one');
    });

    expect(screen.getByRole('button', { name: 'Resend code' })).toBeInTheDocument();
  });
});
