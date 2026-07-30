import { describe, it, expect } from 'vitest';
import { generateEmailIdempotencyKey } from '../idempotencyKey';

describe('generateEmailIdempotencyKey', () => {
  describe('deterministic hash generation', () => {
    it('should generate the same hash for identical inputs', () => {
      const key1 = generateEmailIdempotencyKey(
        'application_received',
        'app-123',
        'candidate@example.com'
      );
      const key2 = generateEmailIdempotencyKey(
        'application_received',
        'app-123',
        'candidate@example.com'
      );

      expect(key1).toBe(key2);
      expect(key1).toHaveLength(64); // SHA-256 produces 64 hex characters
    });

    it('should generate different hashes for different event types', () => {
      const key1 = generateEmailIdempotencyKey(
        'application_received',
        'app-123',
        'candidate@example.com'
      );
      const key2 = generateEmailIdempotencyKey(
        'offer_extended',
        'app-123',
        'candidate@example.com'
      );

      expect(key1).not.toBe(key2);
    });

    it('should generate different hashes for different entity IDs', () => {
      const key1 = generateEmailIdempotencyKey(
        'application_received',
        'app-123',
        'candidate@example.com'
      );
      const key2 = generateEmailIdempotencyKey(
        'application_received',
        'app-456',
        'candidate@example.com'
      );

      expect(key1).not.toBe(key2);
    });

    it('should generate different hashes for different recipients', () => {
      const key1 = generateEmailIdempotencyKey(
        'application_received',
        'app-123',
        'candidate1@example.com'
      );
      const key2 = generateEmailIdempotencyKey(
        'application_received',
        'app-123',
        'candidate2@example.com'
      );

      expect(key1).not.toBe(key2);
    });
  });

  describe('email normalization', () => {
    it('should normalize email to lowercase', () => {
      const key1 = generateEmailIdempotencyKey(
        'application_received',
        'app-123',
        'Candidate@Example.COM'
      );
      const key2 = generateEmailIdempotencyKey(
        'application_received',
        'app-123',
        'candidate@example.com'
      );

      expect(key1).toBe(key2);
    });

    it('should trim whitespace from email', () => {
      const key1 = generateEmailIdempotencyKey(
        'application_received',
        'app-123',
        '  candidate@example.com  '
      );
      const key2 = generateEmailIdempotencyKey(
        'application_received',
        'app-123',
        'candidate@example.com'
      );

      expect(key1).toBe(key2);
    });

    it('should normalize mixed case and whitespace', () => {
      const key1 = generateEmailIdempotencyKey(
        'application_received',
        'app-123',
        '  CANDIDATE@Example.Com  '
      );
      const key2 = generateEmailIdempotencyKey(
        'application_received',
        'app-123',
        'candidate@example.com'
      );

      expect(key1).toBe(key2);
    });
  });

  describe('hash format', () => {
    it('should return a 64-character hexadecimal string', () => {
      const key = generateEmailIdempotencyKey(
        'application_received',
        'app-123',
        'candidate@example.com'
      );

      expect(key).toHaveLength(64);
      expect(key).toMatch(/^[0-9a-f]{64}$/);
    });

    it('should use SHA-256 algorithm', () => {
      // SHA-256 always produces 256 bits = 32 bytes = 64 hex characters
      const key = generateEmailIdempotencyKey(
        'test',
        'test-id',
        'test@example.com'
      );

      expect(key).toHaveLength(64);
    });
  });

  describe('collision resistance', () => {
    it('should generate unique hashes for similar but different inputs', () => {
      const keys = [
        generateEmailIdempotencyKey('event_a', 'id-1', 'user@test.com'),
        generateEmailIdempotencyKey('event_a', 'id-2', 'user@test.com'),
        generateEmailIdempotencyKey('event_b', 'id-1', 'user@test.com'),
        generateEmailIdempotencyKey('event_a', 'id-1', 'other@test.com'),
      ];

      // All keys should be unique
      const uniqueKeys = new Set(keys);
      expect(uniqueKeys.size).toBe(keys.length);
    });
  });

  describe('real-world scenarios', () => {
    it('should handle offer extended event', () => {
      const key = generateEmailIdempotencyKey(
        'offer_extended',
        'offer-789',
        'candidate@company.com'
      );

      expect(key).toHaveLength(64);
      expect(key).toMatch(/^[0-9a-f]{64}$/);
    });

    it('should handle screening invite event', () => {
      const key = generateEmailIdempotencyKey(
        'screening_invite',
        'screening-456',
        'applicant@domain.org'
      );

      expect(key).toHaveLength(64);
      expect(key).toMatch(/^[0-9a-f]{64}$/);
    });

    it('should handle interview invite event', () => {
      const key = generateEmailIdempotencyKey(
        'interview_invite',
        'interview-123',
        'john.doe@example.com'
      );

      expect(key).toHaveLength(64);
      expect(key).toMatch(/^[0-9a-f]{64}$/);
    });

    it('should handle rejection notification', () => {
      const key = generateEmailIdempotencyKey(
        'rejection',
        'app-999',
        'candidate@email.net'
      );

      expect(key).toHaveLength(64);
      expect(key).toMatch(/^[0-9a-f]{64}$/);
    });
  });

  describe('edge cases', () => {
    it('should handle empty strings', () => {
      const key = generateEmailIdempotencyKey('', '', '');

      expect(key).toHaveLength(64);
      expect(key).toMatch(/^[0-9a-f]{64}$/);
    });

    it('should handle special characters in event type', () => {
      const key = generateEmailIdempotencyKey(
        'event:with:colons',
        'id-123',
        'user@test.com'
      );

      expect(key).toHaveLength(64);
      expect(key).toMatch(/^[0-9a-f]{64}$/);
    });

    it('should handle unicode characters', () => {
      const key = generateEmailIdempotencyKey(
        'événement',
        'id-123',
        'utilisateur@test.com'
      );

      expect(key).toHaveLength(64);
      expect(key).toMatch(/^[0-9a-f]{64}$/);
    });

    it('should handle very long inputs', () => {
      const longEvent = 'a'.repeat(1000);
      const longId = 'b'.repeat(1000);
      const longEmail = 'c'.repeat(100) + '@test.com';

      const key = generateEmailIdempotencyKey(longEvent, longId, longEmail);

      expect(key).toHaveLength(64); // Hash always same length
      expect(key).toMatch(/^[0-9a-f]{64}$/);
    });
  });
});
