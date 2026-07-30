import { describe, it, expect, beforeEach, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import {
  generateApprovalToken,
  verifyApprovalToken,
  generateApprovalTokens
} from '../approvalTokenService';

// Mock environment
vi.mock('../../config/env', () => ({
  env: {
    APPROVAL_TOKEN_SECRET: 'test-secret-key'
  }
}));

vi.mock('../../utils/logger', () => ({
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}));

describe('approvalTokenService', () => {
  describe('generateApprovalToken', () => {
    it('should generate valid JWT token', () => {
      const payload = {
        approvalId: 'approval-123',
        approverId: 'user-456',
        action: 'approve' as const
      };

      const token = generateApprovalToken(payload);

      expect(token).toBeTruthy();
      expect(typeof token).toBe('string');
      
      // Verify token structure (header.payload.signature)
      const parts = token.split('.');
      expect(parts).toHaveLength(3);
    });

    it('should include correct payload in token', () => {
      const payload = {
        approvalId: 'approval-789',
        approverId: 'user-999',
        action: 'reject' as const
      };

      const token = generateApprovalToken(payload);
      const decoded = jwt.decode(token) as any;

      expect(decoded.approvalId).toBe('approval-789');
      expect(decoded.approverId).toBe('user-999');
      expect(decoded.action).toBe('reject');
      expect(decoded.iss).toBe('ai-interview-platform');
      expect(decoded.aud).toBe('approval-response');
    });

    it('should set expiry to 72 hours', () => {
      const payload = {
        approvalId: 'approval-123',
        approverId: 'user-456',
        action: 'approve' as const
      };

      const beforeGeneration = Date.now();
      const token = generateApprovalToken(payload);
      const afterGeneration = Date.now();

      const decoded = jwt.decode(token) as any;
      const expiryTime = decoded.exp * 1000; // Convert to milliseconds

      const expectedExpiry = beforeGeneration + (72 * 60 * 60 * 1000);
      const tolerance = 5000; // 5 second tolerance

      expect(expiryTime).toBeGreaterThan(expectedExpiry - tolerance);
      expect(expiryTime).toBeLessThan(afterGeneration + (72 * 60 * 60 * 1000) + tolerance);
    });
  });

  describe('verifyApprovalToken', () => {
    it('should verify and decode valid token', () => {
      const payload = {
        approvalId: 'approval-123',
        approverId: 'user-456',
        action: 'approve' as const
      };

      const token = generateApprovalToken(payload);
      const verified = verifyApprovalToken(token);

      expect(verified.approvalId).toBe('approval-123');
      expect(verified.approverId).toBe('user-456');
      expect(verified.action).toBe('approve');
      expect(verified.iat).toBeTruthy();
      expect(verified.exp).toBeTruthy();
    });

    it('should throw error for expired token', () => {
      // Create token with immediate expiry
      const token = jwt.sign(
        {
          approvalId: 'approval-123',
          approverId: 'user-456',
          action: 'approve'
        },
        'test-secret-key',
        {
          expiresIn: '0s', // Immediate expiry
          issuer: 'ai-interview-platform',
          audience: 'approval-response'
        }
      );

      // Wait a moment to ensure expiry
      return new Promise(resolve => {
        setTimeout(() => {
          expect(() => verifyApprovalToken(token)).toThrow('expired');
          resolve(null);
        }, 100);
      });
    });

    it('should throw error for tampered token', () => {
      const payload = {
        approvalId: 'approval-123',
        approverId: 'user-456',
        action: 'approve' as const
      };

      const token = generateApprovalToken(payload);
      
      // Tamper with token by changing a character
      const tamperedToken = token.slice(0, -5) + 'XXXXX';

      expect(() => verifyApprovalToken(tamperedToken)).toThrow('Invalid');
    });

    it('should throw error for token with wrong secret', () => {
      // Create token with different secret
      const token = jwt.sign(
        {
          approvalId: 'approval-123',
          approverId: 'user-456',
          action: 'approve'
        },
        'wrong-secret',
        {
          expiresIn: '72h',
          issuer: 'ai-interview-platform',
          audience: 'approval-response'
        }
      );

      expect(() => verifyApprovalToken(token)).toThrow('Invalid');
    });
  });

  describe('generateApprovalTokens', () => {
    it('should generate both approve and reject tokens', () => {
      const { approveToken, rejectToken } = generateApprovalTokens(
        'approval-123',
        'user-456'
      );

      expect(approveToken).toBeTruthy();
      expect(rejectToken).toBeTruthy();
      expect(approveToken).not.toBe(rejectToken);

      const approveDecoded = jwt.decode(approveToken) as any;
      const rejectDecoded = jwt.decode(rejectToken) as any;

      expect(approveDecoded.action).toBe('approve');
      expect(rejectDecoded.action).toBe('reject');
      expect(approveDecoded.approvalId).toBe('approval-123');
      expect(rejectDecoded.approvalId).toBe('approval-123');
    });
  });
});
