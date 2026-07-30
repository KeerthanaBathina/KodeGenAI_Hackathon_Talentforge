import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import HomePage from '../page';

describe('HomePage', () => {
  it('renders the main heading', () => {
    render(<HomePage />);
    expect(
      screen.getByRole('heading', {
        name: 'AI Interview Platform'
      })
    ).toBeInTheDocument();
  });

  it('renders the deployment baseline copy', () => {
    render(<HomePage />);
    expect(
      screen.getByText('Frontend baseline is live and ready for Vercel preview deployments.')
    ).toBeInTheDocument();
  });
});
