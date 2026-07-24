import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import RegisterPage from '../page';

const pushMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: pushMock
  })
}));

describe('RegisterPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('shows password policy error for weak passwords', async () => {
    render(<RegisterPage />);

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'user@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'weakpass' } });
    fireEvent.click(screen.getByRole('button', { name: 'Register' }));

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Password must be at least 8 characters and include one uppercase letter and one number.'
    );
  });

  it('redirects to verify page after successful registration', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ message: 'If this email is new to us, you will receive a verification code' })
    } as Response);

    render(<RegisterPage />);

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'user@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'ValidPass1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Register' }));

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith('/verify-otp?email=user%40example.com');
    });
  });
});
