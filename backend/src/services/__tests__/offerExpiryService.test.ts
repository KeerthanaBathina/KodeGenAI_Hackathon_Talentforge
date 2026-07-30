import { describe, it, expect, beforeEach, vi } from 'vitest';
import { processOfferExpiry } from '../offerExpiryService';

const mocks = vi.hoisted(() => ({
  prismaOfferFindUnique: vi.fn(),
  prismaOfferUpdate: vi.fn(),
  prismaApplicationUpdate: vi.fn(),
  prismaRequisitionUpdate: vi.fn(),
  prismaTransaction: vi.fn(),
  auditEvent: vi.fn()
}));

vi.mock('../../db/prisma', () => ({
  prisma: {
    offer: {
      findUnique: mocks.prismaOfferFindUnique,
      update: mocks.prismaOfferUpdate
    },
    application: {
      update: mocks.prismaApplicationUpdate
    },
    requisition: {
      update: mocks.prismaRequisitionUpdate
    },
    $transaction: (callback: any) => {
      mocks.prismaTransaction();
      return callback({
        offer: { update: mocks.prismaOfferUpdate },
        application: { update: mocks.prismaApplicationUpdate },
        requisition: { update: mocks.prismaRequisitionUpdate }
      });
    }
  }
}));

vi.mock('../auditService', () => ({
  auditEvent: mocks.auditEvent
}));

vi.mock('../../utils/logger');
vi.mock('../../config/env', () => ({
  env: {
    REDIS_URL: 'redis://localhost:6379'
  }
}));

describe('offerExpiryService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('processOfferExpiry', () => {
    it('should expire pending offer', async () => {
      const mockOffer = {
        id: 'offer-123',
        status: 'pending',
        applicationId: 'app-456',
        expiresAt: new Date(Date.now() - 1000), // Already expired
        application: {
          candidate: {
            fullName: 'John Doe',
            email: 'john@example.com'
          },
          requisition: {
            id: 'req-789',
            title: 'Engineer',
            hiringManager: {
              fullName: 'Jane Manager',
              email: 'jane@example.com'
            }
          }
        }
      };

      mocks.prismaOfferFindUnique.mockResolvedValue(mockOffer);

      await processOfferExpiry('offer-123');

      expect(mocks.prismaTransaction).toHaveBeenCalled();
      expect(mocks.prismaOfferUpdate).toHaveBeenCalledWith({
        where: { id: 'offer-123' },
        data: {
          status: 'expired',
          respondedAt: expect.any(Date)
        }
      });
      expect(mocks.prismaApplicationUpdate).toHaveBeenCalledWith({
        where: { id: 'app-456' },
        data: {
          status: 'offer_expired'
        }
      });
      expect(mocks.prismaRequisitionUpdate).toHaveBeenCalledWith({
        where: { id: 'req-789' },
        data: {
          vacancies: {
            increment: 1
          }
        }
      });
      expect(mocks.auditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'OFFER_EXPIRED',
          entityId: 'offer-123',
          actorId: 'system'
        })
      );
    });

    it('should skip if offer already responded', async () => {
      const mockOffer = {
        id: 'offer-123',
        status: 'accepted',
        expiresAt: new Date(),
        application: {
          candidate: { fullName: 'John', email: 'john@example.com' },
          requisition: { 
            id: 'req-1', 
            title: 'Engineer',
            hiringManager: { fullName: 'Jane', email: 'jane@example.com' }
          }
        }
      };

      mocks.prismaOfferFindUnique.mockResolvedValue(mockOffer);

      await processOfferExpiry('offer-123');

      expect(mocks.prismaTransaction).not.toHaveBeenCalled();
      expect(mocks.auditEvent).not.toHaveBeenCalled();
    });

    it('should skip if expiry time not reached', async () => {
      const mockOffer = {
        id: 'offer-123',
        status: 'pending',
        expiresAt: new Date(Date.now() + 100000), // Future date
        application: {
          candidate: { fullName: 'John', email: 'john@example.com' },
          requisition: { 
            id: 'req-1', 
            title: 'Engineer',
            hiringManager: { fullName: 'Jane', email: 'jane@example.com' }
          }
        }
      };

      mocks.prismaOfferFindUnique.mockResolvedValue(mockOffer);

      await processOfferExpiry('offer-123');

      expect(mocks.prismaTransaction).not.toHaveBeenCalled();
      expect(mocks.auditEvent).not.toHaveBeenCalled();
    });

    it('should skip if offer not found', async () => {
      mocks.prismaOfferFindUnique.mockResolvedValue(null);

      await processOfferExpiry('offer-123');

      expect(mocks.prismaTransaction).not.toHaveBeenCalled();
      expect(mocks.auditEvent).not.toHaveBeenCalled();
    });

    it('should handle declined status', async () => {
      const mockOffer = {
        id: 'offer-123',
        status: 'declined',
        expiresAt: new Date(Date.now() - 1000),
        application: {
          candidate: { fullName: 'John', email: 'john@example.com' },
          requisition: { 
            id: 'req-1', 
            title: 'Engineer',
            hiringManager: { fullName: 'Jane', email: 'jane@example.com' }
          }
        }
      };

      mocks.prismaOfferFindUnique.mockResolvedValue(mockOffer);

      await processOfferExpiry('offer-123');

      expect(mocks.prismaTransaction).not.toHaveBeenCalled();
    });

    it('should handle expired status', async () => {
      const mockOffer = {
        id: 'offer-123',
        status: 'expired',
        expiresAt: new Date(Date.now() - 1000),
        application: {
          candidate: { fullName: 'John', email: 'john@example.com' },
          requisition: { 
            id: 'req-1', 
            title: 'Engineer',
            hiringManager: { fullName: 'Jane', email: 'jane@example.com' }
          }
        }
      };

      mocks.prismaOfferFindUnique.mockResolvedValue(mockOffer);

      await processOfferExpiry('offer-123');

      expect(mocks.prismaTransaction).not.toHaveBeenCalled();
    });
  });
});
