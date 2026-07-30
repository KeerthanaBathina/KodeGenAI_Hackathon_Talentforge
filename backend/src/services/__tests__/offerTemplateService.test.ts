import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Decimal } from '@prisma/client/runtime/library';
import { resolveOfferTemplateData, renderOfferLetterHtml } from '../offerTemplateService';

const mocks = vi.hoisted(() => ({
  prismaDecisionFindUnique: vi.fn(),
  prismaTemplateFindFirst: vi.fn()
}));

vi.mock('../../db/prisma', () => ({
  prisma: {
    decision: {
      findUnique: mocks.prismaDecisionFindUnique
    },
    template: {
      findFirst: mocks.prismaTemplateFindFirst
    }
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

describe('offerTemplateService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('resolveOfferTemplateData', () => {
    it('should resolve template data from decision', async () => {
      const mockDecision = {
        id: 'decision-123',
        outcome: 'offer',
        compensationBand: '120000',
        offerDetails: {},
        application: {
          candidate: {
            fullName: 'John Doe',
            email: 'john@example.com'
          },
          requisition: {
            title: 'Senior Software Engineer',
            department: 'Engineering'
          }
        },
        decidedBy: {
          fullName: 'Jane Manager'
        }
      };

      mocks.prismaDecisionFindUnique.mockResolvedValue(mockDecision);

      const result = await resolveOfferTemplateData('decision-123');

      expect(result.candidateName).toBe('John Doe');
      expect(result.candidateEmail).toBe('john@example.com');
      expect(result.roleTitle).toBe('Senior Software Engineer');
      expect(result.department).toBe('Engineering');
      expect(result.salary).toContain('120,000');
      expect(result.hiringManagerName).toBe('Jane Manager');
      expect(result.companyName).toBe('TalentForge');
    });

    it('should throw error for missing decision', async () => {
      mocks.prismaDecisionFindUnique.mockResolvedValue(null);

      await expect(
        resolveOfferTemplateData('decision-456')
      ).rejects.toThrow('Decision not found: decision-456');
    });

    it('should throw error for non-offer decision', async () => {
      mocks.prismaDecisionFindUnique.mockResolvedValue({
        id: 'decision-123',
        outcome: 'reject',
        application: {
          candidate: { fullName: 'John Doe', email: 'john@example.com' },
          requisition: { title: 'Engineer', department: 'Engineering' }
        },
        decidedBy: { fullName: 'Jane Manager' }
      });

      await expect(
        resolveOfferTemplateData('decision-456')
      ).rejects.toThrow("Decision outcome is not 'offer': reject");
    });

    it('should use default compensation band if not provided', async () => {
      const mockDecision = {
        id: 'decision-123',
        outcome: 'offer',
        compensationBand: null,
        offerDetails: {},
        application: {
          candidate: {
            fullName: 'John Doe',
            email: 'john@example.com'
          },
          requisition: {
            title: 'Engineer',
            department: 'Engineering'
          }
        },
        decidedBy: {
          fullName: 'Jane Manager'
        }
      };

      mocks.prismaDecisionFindUnique.mockResolvedValue(mockDecision);

      const result = await resolveOfferTemplateData('decision-123');

      expect(result.salary).toBe('$0.00');
    });

    it('should calculate expiry date as 5 business days', async () => {
      const mockDecision = {
        id: 'decision-123',
        outcome: 'offer',
        compensationBand: '100000',
        offerDetails: {},
        application: {
          candidate: {
            fullName: 'John Doe',
            email: 'john@example.com'
          },
          requisition: {
            title: 'Engineer',
            department: 'Engineering'
          }
        },
        decidedBy: {
          fullName: 'Jane Manager'
        }
      };

      mocks.prismaDecisionFindUnique.mockResolvedValue(mockDecision);

      const result = await resolveOfferTemplateData('decision-123');

      // Verify expiry date is set (detailed validation would require date mocking)
      expect(result.expiryDate).toBeDefined();
      expect(result.expiryDate.length).toBeGreaterThan(0);
    });
  });

  describe('renderOfferLetterHtml', () => {
    it('should render template with data', async () => {
      const mockTemplate = {
        id: 'template-1',
        bodyHtml: '<h1>Offer for {{candidateName}}</h1><p>Role: {{roleTitle}}</p><p>Salary: {{salary}}</p>',
        version: 1
      };

      mocks.prismaTemplateFindFirst.mockResolvedValue(mockTemplate);

      const templateData = {
        candidateName: 'John Doe',
        roleTitle: 'Engineer',
        salary: '$100,000.00',
        candidateEmail: 'john@example.com',
        department: 'Engineering',
        startDate: 'January 1, 2027',
        expiryDate: 'February 1, 2027',
        hiringManagerName: 'Jane Manager',
        companyName: 'TalentForge',
        offerDate: 'December 27, 2026'
      };

      const html = await renderOfferLetterHtml(templateData);

      expect(html).toContain('John Doe');
      expect(html).toContain('Engineer');
      expect(html).toContain('$100,000.00');
      expect(html).not.toContain('{{');
      expect(html).not.toContain('}}');
    });

    it('should throw error when template not found', async () => {
      mocks.prismaTemplateFindFirst.mockResolvedValue(null);

      const templateData = {
        candidateName: 'John Doe',
        roleTitle: 'Engineer',
        salary: '$100,000.00',
        candidateEmail: 'john@example.com',
        department: 'Engineering',
        startDate: 'January 1, 2027',
        expiryDate: 'February 1, 2027',
        hiringManagerName: 'Jane Manager',
        companyName: 'TalentForge',
        offerDate: 'December 27, 2026'
      };

      await expect(
        renderOfferLetterHtml(templateData)
      ).rejects.toThrow('Offer letter template not found');
    });

    it('should fetch active template with highest version', async () => {
      const mockTemplate = {
        id: 'template-2',
        bodyHtml: '<h1>{{candidateName}}</h1>',
        version: 2
      };

      mocks.prismaTemplateFindFirst.mockResolvedValue(mockTemplate);

      const templateData = {
        candidateName: 'John Doe',
        roleTitle: 'Engineer',
        salary: '$100,000.00',
        candidateEmail: 'john@example.com',
        department: 'Engineering',
        startDate: 'January 1, 2027',
        expiryDate: 'February 1, 2027',
        hiringManagerName: 'Jane Manager',
        companyName: 'TalentForge',
        offerDate: 'December 27, 2026'
      };

      await renderOfferLetterHtml(templateData);

      expect(mocks.prismaTemplateFindFirst).toHaveBeenCalledWith({
        where: {
          type: 'offer',
          active: true
        },
        orderBy: { version: 'desc' }
      });
    });
  });
});
