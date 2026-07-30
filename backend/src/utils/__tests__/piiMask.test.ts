import { describe, expect, it } from 'vitest';
import { maskEmail, sanitizeRequestBody } from '../piiMask';

describe('maskEmail', () => {
  it('masks standard email to first-char plus stars', () => {
    expect(maskEmail('john.doe@example.com')).toBe('j***@example.com');
  });

  it('works for single-character local part', () => {
    expect(maskEmail('a@b.com')).toBe('a***@b.com');
  });

  it('returns unchanged value when @ is absent', () => {
    expect(maskEmail('notanemail')).toBe('notanemail');
  });

  it('supports subdomain emails', () => {
    expect(maskEmail('user@mail.internal.corp')).toBe('u***@mail.internal.corp');
  });
});

describe('sanitizeRequestBody', () => {
  it('removes password fields and masks email', () => {
    expect(
      sanitizeRequestBody({
        email: 'john.doe@example.com',
        password: 'secret',
        confirmPassword: 'secret',
        name: 'John'
      })
    ).toEqual({ email: 'j***@example.com', name: 'John' });
  });
});
