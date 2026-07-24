---
id: task_003
us_id: us_003
epic: EP-001
title: "Create JWT Service with RS256 Signing and HttpOnly Cookie Storage"
status: done
layer: backend
effort: 3h
priority: critical
created: 2026-07-24
completed: 2026-07-24
---

# TASK-003 — Create JWT Service with RS256 Signing and HttpOnly Cookie Storage

## Context

**User Story**: US-003 — Login with Role-Based Routing, Account Lockout, and SSO  
**Epic**: EP-001 — Candidate Onboarding and Identity  
**Addresses Acceptance Criteria**: Scenario 4 (JWT with correct claims, RS256, httpOnly cookie, 24h expiry)

JWT tokens must use RS256 asymmetric signing for enhanced security, include all required claims for authorization decisions, and be stored in httpOnly cookies to prevent XSS attacks.

---

## Objective

Create a JWT service that:
- Signs tokens with RS256 using a private key
- Includes claims: `sub`, `role`, `candidateId`, `iat`, `exp`
- Sets 24-hour expiry
- Returns cookie configuration for httpOnly, secure, sameSite
- Provides token verification with public key

---

## Technical Specifications

| Aspect | Specification | Rationale |
|--------|--------------|-----------|
| Algorithm | RS256 (RSA + SHA256) | Asymmetric signing prevents token forgery |
| Expiry | 24 hours | Balance security vs. UX; OWASP recommendation |
| Cookie Flags | httpOnly, secure, sameSite=lax | XSS mitigation, CSRF protection |
| Claims | sub, role, candidateId, iat, exp | Authorization decision data |
| Key Storage | Environment variables (PEM format) | Never commit keys to git |

**JWT Payload Structure**:
```json
{
  "sub": "user-uuid",
  "role": "candidate",
  "candidateId": "CAND-12345",
  "iat": 1674567890,
  "exp": 1674654290
}
```

---

## Implementation Steps

### Step 1 — Generate RS256 Key Pair

Generate production keys (do NOT commit to git):

```bash
# Generate private key
openssl genrsa -out private_key.pem 2048

# Generate public key
openssl rsa -in private_key.pem -pubout -out public_key.pem

# Convert to single-line format for .env
cat private_key.pem | tr '\n' '|'
cat public_key.pem | tr '\n' '|'
```

Add to `backend/.env`:
```env
JWT_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----|...|-----END RSA PRIVATE KEY-----"
JWT_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----|...|-----END PUBLIC KEY-----"
JWT_EXPIRES_IN=24h
```

Add to `backend/.env.example` (with placeholder):
```env
JWT_PRIVATE_KEY="<your-rsa-private-key>"
JWT_PUBLIC_KEY="<your-rsa-public-key>"
JWT_EXPIRES_IN=24h
```

### Step 2 — Create JWT Service

Create `backend/src/services/jwtService.ts`:

```typescript
import jwt from 'jsonwebtoken';
import { env } from '../config/env';

export interface JwtPayload {
  sub: string; // User ID
  role: string;
  candidateId?: string;
}

export interface JwtCookieOptions {
  httpOnly: boolean;
  secure: boolean;
  sameSite: 'strict' | 'lax' | 'none';
  maxAge: number; // milliseconds
  path: string;
}

const EXPIRY_24H = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

export class JwtService {
  private static privateKey: string;
  private static publicKey: string;

  static initialize() {
    // Convert pipe-separated format back to newlines
    this.privateKey = env.JWT_PRIVATE_KEY.replace(/\|/g, '\n');
    this.publicKey = env.JWT_PUBLIC_KEY.replace(/\|/g, '\n');
  }

  /**
   * Generate JWT with RS256 signing
   */
  static sign(payload: JwtPayload): string {
    if (!this.privateKey) this.initialize();

    return jwt.sign(payload, this.privateKey, {
      algorithm: 'RS256',
      expiresIn: env.JWT_EXPIRES_IN || '24h',
    });
  }

  /**
   * Verify and decode JWT
   */
  static verify(token: string): JwtPayload {
    if (!this.publicKey) this.initialize();

    try {
      const decoded = jwt.verify(token, this.publicKey, {
        algorithms: ['RS256'],
      }) as JwtPayload & { iat: number; exp: number };

      return {
        sub: decoded.sub,
        role: decoded.role,
        candidateId: decoded.candidateId,
      };
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw new Error('Token expired');
      }
      if (error instanceof jwt.JsonWebTokenError) {
        throw new Error('Invalid token');
      }
      throw error;
    }
  }

  /**
   * Get cookie configuration for httpOnly JWT storage
   */
  static getCookieOptions(): JwtCookieOptions {
    return {
      httpOnly: true,
      secure: env.NODE_ENV === 'production', // HTTPS only in production
      sameSite: 'lax',
      maxAge: EXPIRY_24H,
      path: '/',
    };
  }

  /**
   * Generate token and cookie options in one call
   */
  static createAuthCookie(payload: JwtPayload): { token: string; options: JwtCookieOptions } {
    return {
      token: this.sign(payload),
      options: this.getCookieOptions(),
    };
  }
}

// Initialize on module load
JwtService.initialize();
```

### Step 3 — Update Environment Config

Add to `backend/src/config/env.ts`:

```typescript
export const env = {
  // ... existing config
  JWT_PRIVATE_KEY: process.env.JWT_PRIVATE_KEY || '',
  JWT_PUBLIC_KEY: process.env.JWT_PUBLIC_KEY || '',
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '24h',
};

// Validation
if (!env.JWT_PRIVATE_KEY || !env.JWT_PUBLIC_KEY) {
  throw new Error('JWT keys must be configured');
}
```

### Step 4 — Create Auth Middleware

Create `backend/src/middleware/authMiddleware.ts`:

```typescript
import { Request, Response, NextFunction } from 'express';
import { JwtService } from '../services/jwtService';
import logger from '../utils/logger';

export interface AuthenticatedRequest extends Request {
  user?: {
    sub: string;
    role: string;
    candidateId?: string;
  };
}

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const token = req.cookies['auth_token'];

    if (!token) {
      res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        },
      });
      return;
    }

    const payload = JwtService.verify(token);
    req.user = payload;
    next();
  } catch (error) {
    logger.warn({ error }, 'JWT verification failed');
    res.status(401).json({
      error: {
        code: 'INVALID_TOKEN',
        message: 'Invalid or expired token',
      },
    });
  }
}

export function requireRole(...allowedRoles: string[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        },
      });
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: 'Insufficient permissions',
        },
      });
      return;
    }

    next();
  };
}
```

### Step 5 — Add Unit Tests

Create `backend/src/services/__tests__/jwtService.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { JwtService } from '../jwtService';

describe('JwtService', () => {
  it('should sign and verify JWT', () => {
    const payload = {
      sub: 'user-123',
      role: 'candidate',
      candidateId: 'CAND-456',
    };

    const token = JwtService.sign(payload);
    expect(token).toBeTruthy();

    const decoded = JwtService.verify(token);
    expect(decoded.sub).toBe('user-123');
    expect(decoded.role).toBe('candidate');
    expect(decoded.candidateId).toBe('CAND-456');
  });

  it('should throw error on invalid token', () => {
    expect(() => JwtService.verify('invalid-token')).toThrow('Invalid token');
  });

  it('should return httpOnly cookie options', () => {
    const options = JwtService.getCookieOptions();
    expect(options.httpOnly).toBe(true);
    expect(options.sameSite).toBe('lax');
    expect(options.maxAge).toBe(24 * 60 * 60 * 1000);
  });

  it('should create auth cookie with token and options', () => {
    const payload = { sub: 'user-123', role: 'candidate' };
    const { token, options } = JwtService.createAuthCookie(payload);

    expect(token).toBeTruthy();
    expect(options.httpOnly).toBe(true);
  });
});
```

---

## Validation

| Check | Method | Expected Result |
|-------|--------|-----------------|
| Token signed with RS256 | Decode JWT header | `"alg": "RS256"` |
| Token includes all claims | Decode JWT payload | Contains sub, role, candidateId, iat, exp |
| Token expires in 24h | Check exp claim | `exp - iat = 86400` (seconds) |
| Cookie is httpOnly | Inspect cookie config | `httpOnly: true` |
| Cookie is secure in production | Check NODE_ENV=production | `secure: true` |
| Invalid token rejected | Verify tampered token | Throws error |

---

## Dependencies

- `jsonwebtoken` npm package
- RS256 key pair generated and stored in environment

## Security Constraints

- **OWASP A02**: Private key must never be committed to git or exposed in logs
- **OWASP A05**: httpOnly flag prevents XSS token theft
- **OWASP A07**: RS256 prevents token forgery (unlike HS256 symmetric signing)

---

## Definition of Done

- [ ] JWT service created with RS256 signing
- [ ] Private/public key pair generated and stored in environment
- [ ] Token includes sub, role, candidateId, iat, exp claims
- [ ] Token expires after 24 hours
- [ ] Cookie options include httpOnly, secure (prod), sameSite
- [ ] Auth middleware created for protected routes
- [ ] Unit tests cover sign, verify, and cookie options

## Traceability

- **US**: US-003 — Login with Role-Based Routing, Account Lockout, and SSO
- **Epic**: EP-001 — Candidate Onboarding and Identity
- **AC**: Scenario 4
