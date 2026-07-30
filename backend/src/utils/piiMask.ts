export function maskEmail(email: string): string {
  const atIndex = email.indexOf('@');
  if (atIndex < 1) {
    return email;
  }

  const localStart = email.slice(0, 1);
  const domain = email.slice(atIndex);
  return `${localStart}***${domain}`;
}

export function sanitizeRequestBody(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return {};
  }

  const source = body as Record<string, unknown>;
  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(source)) {
    if (key === 'password' || key === 'confirmPassword' || key === 'currentPassword') {
      continue;
    }

    if (key.toLowerCase() === 'email' && typeof value === 'string') {
      sanitized[key] = maskEmail(value);
      continue;
    }

    sanitized[key] = value;
  }

  return sanitized;
}
