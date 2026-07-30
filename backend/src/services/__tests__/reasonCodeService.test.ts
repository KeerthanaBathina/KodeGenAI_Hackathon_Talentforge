import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReasonCodeCategory } from '@prisma/client';

vi.mock('../../db/prisma', () => ({
  default: {
    reasonCode: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn()
    }
  }
}));

vi.mock('../../utils/logger', () => ({
  default: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn()
  }
}));

import prisma from '../../db/prisma';
import logger from '../../utils/logger';
import { 
  getReasonCodesByCategory, 
  validateReasonCode,
  getReasonCodeById
} from '../reasonCodeService';

const mockFindMany = vi.mocked(prisma.reasonCode.findMany);
const mockFindFirst = vi.mocked(prisma.reasonCode.findFirst);
const mockFindUnique = vi.mocked(prisma.reasonCode.findUnique);
const mockLogError = vi.mocked(logger.error);
const mockLogDebug = vi.mocked(logger.debug);
const mockLogInfo = vi.mocked(logger.info);

const mockRejectReasonCodes = [
  {
    id: '11111111-1111-1111-1111-111111111111',
    category: 'reject_decision' as ReasonCodeCategory,
    code: 'skills_gap',
    displayText: 'Skills Gap',
    active: true
  },
  {
    id: '22222222-2222-2222-2222-222222222222',
    category: 'reject_decision' as ReasonCodeCategory,
    code: 'experience_insufficient',
    displayText: 'Insufficient Experience',
    active: true
  }
];

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ReasonCodeService', () => {
  describe('getReasonCodesByCategory', () => {
    it('should return active reason codes for reject_decision category', async () => {
      mockFindMany.mockResolvedValue(mockRejectReasonCodes as any);

      const codes = await getReasonCodesByCategory('reject_decision');

      expect(codes).toBeInstanceOf(Array);
      expect(codes.length).toBe(2);
      expect(codes.every(c => c.category === 'reject_decision')).toBe(true);
      expect(codes.every(c => c.active)).toBe(true);

      expect(mockFindMany).toHaveBeenCalledWith({
        where: {
          category: 'reject_decision',
          active: true
        },
        orderBy: {
          code: 'asc'
        },
        select: {
          id: true,
          category: true,
          code: true,
          displayText: true,
          active: true
        }
      });

      expect(mockLogDebug).toHaveBeenCalledWith('Fetching reason codes', { 
        category: 'reject_decision' 
      });
      expect(mockLogInfo).toHaveBeenCalledWith('Retrieved reason codes', {
        category: 'reject_decision',
        count: 2
      });
    });

    it('should return codes in alphabetical order by code', async () => {
      const unorderedCodes = [
        { ...mockRejectReasonCodes[1] },
        { ...mockRejectReasonCodes[0] }
      ];
      mockFindMany.mockResolvedValue(unorderedCodes as any);

      const codes = await getReasonCodesByCategory('reject_decision');

      expect(codes.length).toBe(2);
      // Prisma orderBy handles ordering, we just verify the query was made correctly
      expect(mockFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { code: 'asc' }
        })
      );
    });

    it('should return empty array when no reason codes found', async () => {
      mockFindMany.mockResolvedValue([]);

      const codes = await getReasonCodesByCategory('offer_decision');

      expect(codes).toEqual([]);
      expect(mockLogInfo).toHaveBeenCalledWith('Retrieved reason codes', {
        category: 'offer_decision',
        count: 0
      });
    });

    it('should log and throw error on database failure', async () => {
      const dbError = new Error('Database connection failed');
      mockFindMany.mockRejectedValue(dbError);

      await expect(
        getReasonCodesByCategory('reject_decision')
      ).rejects.toThrow('Database connection failed');

      expect(mockLogError).toHaveBeenCalledWith('Error fetching reason codes', {
        category: 'reject_decision',
        error: 'Database connection failed'
      });
    });
  });

  describe('validateReasonCode', () => {
    it('should return true for valid reason code with matching category', async () => {
      mockFindFirst.mockResolvedValue(mockRejectReasonCodes[0] as any);

      const isValid = await validateReasonCode(
        '11111111-1111-1111-1111-111111111111',
        'reject_decision'
      );

      expect(isValid).toBe(true);

      expect(mockFindFirst).toHaveBeenCalledWith({
        where: {
          id: '11111111-1111-1111-1111-111111111111',
          category: 'reject_decision',
          active: true
        }
      });

      expect(mockLogDebug).toHaveBeenCalledWith('Validating reason code', {
        reasonCodeId: '11111111-1111-1111-1111-111111111111',
        expectedCategory: 'reject_decision'
      });
    });

    it('should return false for mismatched category', async () => {
      mockFindFirst.mockResolvedValue(null);

      const isValid = await validateReasonCode(
        '11111111-1111-1111-1111-111111111111',
        'offer_decision'
      );

      expect(isValid).toBe(false);

      expect(mockFindFirst).toHaveBeenCalledWith({
        where: {
          id: '11111111-1111-1111-1111-111111111111',
          category: 'offer_decision',
          active: true
        }
      });
    });

    it('should return false for non-existent code', async () => {
      mockFindFirst.mockResolvedValue(null);

      const isValid = await validateReasonCode(
        'non-existent-id',
        'reject_decision'
      );

      expect(isValid).toBe(false);
    });

    it('should return false for inactive reason code', async () => {
      mockFindFirst.mockResolvedValue(null);

      const isValid = await validateReasonCode(
        '11111111-1111-1111-1111-111111111111',
        'reject_decision'
      );

      expect(isValid).toBe(false);
      // The service queries for active=true, so inactive codes won't be found
    });

    it('should return false and log error on database failure', async () => {
      const dbError = new Error('Database query failed');
      mockFindFirst.mockRejectedValue(dbError);

      const isValid = await validateReasonCode(
        '11111111-1111-1111-1111-111111111111',
        'reject_decision'
      );

      expect(isValid).toBe(false);
      expect(mockLogError).toHaveBeenCalledWith('Error validating reason code', {
        reasonCodeId: '11111111-1111-1111-1111-111111111111',
        expectedCategory: 'reject_decision',
        error: 'Database query failed'
      });
    });
  });

  describe('getReasonCodeById', () => {
    it('should return reason code by ID', async () => {
      mockFindUnique.mockResolvedValue(mockRejectReasonCodes[0] as any);

      const reasonCode = await getReasonCodeById('11111111-1111-1111-1111-111111111111');

      expect(reasonCode).toEqual(mockRejectReasonCodes[0]);

      expect(mockFindUnique).toHaveBeenCalledWith({
        where: { id: '11111111-1111-1111-1111-111111111111' },
        select: {
          id: true,
          category: true,
          code: true,
          displayText: true,
          active: true
        }
      });

      expect(mockLogDebug).toHaveBeenCalledWith('Fetching reason code by ID', {
        reasonCodeId: '11111111-1111-1111-1111-111111111111'
      });
    });

    it('should return null when reason code not found', async () => {
      mockFindUnique.mockResolvedValue(null);

      const reasonCode = await getReasonCodeById('non-existent-id');

      expect(reasonCode).toBeNull();
    });

    it('should log and throw error on database failure', async () => {
      const dbError = new Error('Database connection lost');
      mockFindUnique.mockRejectedValue(dbError);

      await expect(
        getReasonCodeById('11111111-1111-1111-1111-111111111111')
      ).rejects.toThrow('Database connection lost');

      expect(mockLogError).toHaveBeenCalledWith('Error fetching reason code by ID', {
        reasonCodeId: '11111111-1111-1111-1111-111111111111',
        error: 'Database connection lost'
      });
    });
  });
});
