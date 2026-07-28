import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Template, TemplateType, TemplateVersion } from '@prisma/client';
import * as templateService from '../templateService';
import prisma from '../../db/prisma';

// Mock Prisma client
vi.mock('../../db/prisma', () => ({
  default: {
    template: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    templateVersion: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

// Mock logger
vi.mock('../../utils/logger', () => ({
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('templateService', () => {
  const mockUserId = 'user-123';
  const mockTemplateId = 'template-456';

  const mockTemplate: Template = {
    id: mockTemplateId,
    name: 'Test Template',
    type: 'offer' as TemplateType,
    locale: 'en',
    version: 1,
    subject: 'Test Subject {{candidate_name}}',
    bodyHtml: '<p>Hello {{candidate_name}}</p>',
    bodyText: 'Hello {{candidate_name}}',
    active: true,
    createdAt: new Date('2026-07-01'),
  };

  const mockTemplateVersion: TemplateVersion = {
    id: 'version-789',
    templateId: mockTemplateId,
    versionNumber: 1,
    name: 'Test Template',
    type: 'offer' as TemplateType,
    locale: 'en',
    subject: 'Test Subject {{candidate_name}}',
    bodyHtml: '<p>Hello {{candidate_name}}</p>',
    bodyText: 'Hello {{candidate_name}}',
    createdById: mockUserId,
    createdAt: new Date('2026-07-01'),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getTemplates', () => {
    it('should retrieve all active templates by default', async () => {
      vi.mocked(prisma.template.findMany).mockResolvedValue([mockTemplate]);

      const result = await templateService.getTemplates();

      expect(prisma.template.findMany).toHaveBeenCalledWith({
        where: { active: true },
        orderBy: [{ type: 'asc' }, { locale: 'asc' }],
      });
      expect(result).toEqual([mockTemplate]);
    });

    it('should filter templates by type', async () => {
      vi.mocked(prisma.template.findMany).mockResolvedValue([mockTemplate]);

      await templateService.getTemplates({ type: 'offer' });

      expect(prisma.template.findMany).toHaveBeenCalledWith({
        where: { active: true, type: 'offer' },
        orderBy: [{ type: 'asc' }, { locale: 'asc' }],
      });
    });

    it('should filter templates by locale', async () => {
      vi.mocked(prisma.template.findMany).mockResolvedValue([mockTemplate]);

      await templateService.getTemplates({ locale: 'en' });

      expect(prisma.template.findMany).toHaveBeenCalledWith({
        where: { active: true, locale: 'en' },
        orderBy: [{ type: 'asc' }, { locale: 'asc' }],
      });
    });

    it('should include inactive templates when specified', async () => {
      vi.mocked(prisma.template.findMany).mockResolvedValue([mockTemplate]);

      await templateService.getTemplates({ active: false });

      expect(prisma.template.findMany).toHaveBeenCalledWith({
        where: { active: false },
        orderBy: [{ type: 'asc' }, { locale: 'asc' }],
      });
    });
  });

  describe('getTemplateById', () => {
    it('should retrieve template by ID', async () => {
      vi.mocked(prisma.template.findUnique).mockResolvedValue(mockTemplate);

      const result = await templateService.getTemplateById(mockTemplateId);

      expect(prisma.template.findUnique).toHaveBeenCalledWith({
        where: { id: mockTemplateId },
      });
      expect(result).toEqual(mockTemplate);
    });

    it('should return null if template not found', async () => {
      vi.mocked(prisma.template.findUnique).mockResolvedValue(null);

      const result = await templateService.getTemplateById('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('updateTemplate', () => {
    const updateData = {
      name: 'Updated Template',
      subject: 'Updated Subject',
      bodyHtml: '<p>Updated HTML</p>',
      bodyText: 'Updated Text',
    };

    it('should update template and create new version', async () => {
      const updatedTemplate = { ...mockTemplate, ...updateData };

      vi.mocked(prisma.$transaction).mockImplementation(async (callback) => {
        return await callback({
          template: {
            findUnique: vi.fn().mockResolvedValue({
              ...mockTemplate,
              versions: [{ versionNumber: 1 }],
            }),
            update: vi.fn().mockResolvedValue(updatedTemplate),
          },
          templateVersion: {
            create: vi.fn().mockResolvedValue({ versionNumber: 2 }),
          },
        } as any);
      });

      const result = await templateService.updateTemplate(
        mockTemplateId,
        updateData,
        mockUserId
      );

      expect(result).toEqual(updatedTemplate);
    });

    it('should throw error if template not found', async () => {
      vi.mocked(prisma.$transaction).mockImplementation(async (callback) => {
        return await callback({
          template: {
            findUnique: vi.fn().mockResolvedValue(null),
          },
        } as any);
      });

      await expect(
        templateService.updateTemplate(mockTemplateId, updateData, mockUserId)
      ).rejects.toThrow(`Template not found: ${mockTemplateId}`);
    });

    it('should increment version number correctly', async () => {
      const createVersionSpy = vi.fn();

      vi.mocked(prisma.$transaction).mockImplementation(async (callback) => {
        return await callback({
          template: {
            findUnique: vi.fn().mockResolvedValue({
              ...mockTemplate,
              versions: [{ versionNumber: 3 }],
            }),
            update: vi.fn().mockResolvedValue(mockTemplate),
          },
          templateVersion: {
            create: createVersionSpy,
          },
        } as any);
      });

      await templateService.updateTemplate(mockTemplateId, updateData, mockUserId);

      expect(createVersionSpy).toHaveBeenCalledWith({
        data: expect.objectContaining({
          versionNumber: 4,
        }),
      });
    });
  });

  describe('getTemplateVersions', () => {
    it('should retrieve version history ordered by version number', async () => {
      const mockVersionWithAuthor = {
        ...mockTemplateVersion,
        createdBy: {
          id: mockUserId,
          fullName: 'Test User',
          email: 'test@example.com',
        },
      };

      vi.mocked(prisma.templateVersion.findMany).mockResolvedValue([
        mockVersionWithAuthor,
      ] as any);

      const result = await templateService.getTemplateVersions(mockTemplateId);

      expect(prisma.templateVersion.findMany).toHaveBeenCalledWith({
        where: { templateId: mockTemplateId },
        include: {
          createdBy: {
            select: {
              id: true,
              fullName: true,
              email: true,
            },
          },
        },
        orderBy: { versionNumber: 'desc' },
      });
      expect(result).toEqual([mockVersionWithAuthor]);
    });

    it('should return empty array if no versions exist', async () => {
      vi.mocked(prisma.templateVersion.findMany).mockResolvedValue([]);

      const result = await templateService.getTemplateVersions(mockTemplateId);

      expect(result).toEqual([]);
    });
  });

  describe('rollbackTemplate', () => {
    const targetVersionNumber = 2;

    it('should rollback template to specified version', async () => {
      const targetVersion = { ...mockTemplateVersion, versionNumber: targetVersionNumber };
      const rolledBackTemplate = { ...mockTemplate, name: targetVersion.name };

      vi.mocked(prisma.$transaction).mockImplementation(async (callback) => {
        return await callback({
          templateVersion: {
            findUnique: vi.fn().mockResolvedValue(targetVersion),
            findMany: vi.fn().mockResolvedValue([{ versionNumber: 3 }]),
            create: vi.fn().mockResolvedValue({ versionNumber: 4 }),
          },
          template: {
            update: vi.fn().mockResolvedValue(rolledBackTemplate),
          },
        } as any);
      });

      const result = await templateService.rollbackTemplate(
        mockTemplateId,
        targetVersionNumber,
        mockUserId
      );

      expect(result).toEqual(rolledBackTemplate);
    });

    it('should throw error if target version not found', async () => {
      vi.mocked(prisma.$transaction).mockImplementation(async (callback) => {
        return await callback({
          templateVersion: {
            findUnique: vi.fn().mockResolvedValue(null),
          },
        } as any);
      });

      await expect(
        templateService.rollbackTemplate(mockTemplateId, targetVersionNumber, mockUserId)
      ).rejects.toThrow(
        `Version ${targetVersionNumber} not found for template ${mockTemplateId}`
      );
    });

    it('should create new version entry for rollback', async () => {
      const targetVersion = { ...mockTemplateVersion, versionNumber: targetVersionNumber };
      const createVersionSpy = vi.fn();

      vi.mocked(prisma.$transaction).mockImplementation(async (callback) => {
        return await callback({
          templateVersion: {
            findUnique: vi.fn().mockResolvedValue(targetVersion),
            findMany: vi.fn().mockResolvedValue([{ versionNumber: 5 }]),
            create: createVersionSpy,
          },
          template: {
            update: vi.fn().mockResolvedValue(mockTemplate),
          },
        } as any);
      });

      await templateService.rollbackTemplate(
        mockTemplateId,
        targetVersionNumber,
        mockUserId
      );

      expect(createVersionSpy).toHaveBeenCalledWith({
        data: expect.objectContaining({
          templateId: mockTemplateId,
          versionNumber: 6,
          createdById: mockUserId,
        }),
      });
    });
  });

  describe('getCurrentVersionNumber', () => {
    it('should return latest version number', async () => {
      vi.mocked(prisma.templateVersion.findFirst).mockResolvedValue({
        versionNumber: 5,
      } as any);

      const result = await templateService.getCurrentVersionNumber(mockTemplateId);

      expect(prisma.templateVersion.findFirst).toHaveBeenCalledWith({
        where: { templateId: mockTemplateId },
        orderBy: { versionNumber: 'desc' },
        select: { versionNumber: true },
      });
      expect(result).toBe(5);
    });

    it('should return 0 if no versions exist', async () => {
      vi.mocked(prisma.templateVersion.findFirst).mockResolvedValue(null);

      const result = await templateService.getCurrentVersionNumber(mockTemplateId);

      expect(result).toBe(0);
    });
  });

  describe('resolveTemplate', () => {
    const frTemplate: Template = {
      ...mockTemplate,
      id: 'template-fr',
      locale: 'fr',
    };

    const enTemplate: Template = {
      ...mockTemplate,
      id: 'template-en',
      locale: 'en',
    };

    beforeEach(() => {
      // Mock findFirst to return null by default
      vi.mocked(prisma.template.findFirst).mockResolvedValue(null);
    });

    it('should return exact locale match', async () => {
      vi.mocked(prisma.template.findFirst).mockResolvedValue(enTemplate);

      const result = await templateService.resolveTemplate('offer', 'en');

      expect(prisma.template.findFirst).toHaveBeenCalledWith({
        where: { type: 'offer', locale: 'en', active: true },
        orderBy: { version: 'desc' },
      });
      expect(result).toEqual(enTemplate);
    });

    it('should fallback to language code when regional locale not found', async () => {
      vi.mocked(prisma.template.findFirst)
        .mockResolvedValueOnce(null) // fr-CA not found
        .mockResolvedValueOnce(frTemplate); // fr found

      const result = await templateService.resolveTemplate('offer', 'fr-CA');

      expect(prisma.template.findFirst).toHaveBeenCalledTimes(2);
      expect(prisma.template.findFirst).toHaveBeenNthCalledWith(1, {
        where: { type: 'offer', locale: 'fr-CA', active: true },
        orderBy: { version: 'desc' },
      });
      expect(prisma.template.findFirst).toHaveBeenNthCalledWith(2, {
        where: { type: 'offer', locale: 'fr', active: true },
        orderBy: { version: 'desc' },
      });
      expect(result).toEqual(frTemplate);
    });

    it('should fallback to English when requested locale not found', async () => {
      vi.mocked(prisma.template.findFirst)
        .mockResolvedValueOnce(null) // es not found
        .mockResolvedValueOnce(enTemplate); // en found

      const result = await templateService.resolveTemplate('offer', 'es');

      expect(prisma.template.findFirst).toHaveBeenCalledTimes(2);
      expect(prisma.template.findFirst).toHaveBeenNthCalledWith(1, {
        where: { type: 'offer', locale: 'es', active: true },
        orderBy: { version: 'desc' },
      });
      expect(prisma.template.findFirst).toHaveBeenNthCalledWith(2, {
        where: { type: 'offer', locale: 'en', active: true },
        orderBy: { version: 'desc' },
      });
      expect(result).toEqual(enTemplate);
    });

    it('should fallback to English after trying language code', async () => {
      vi.mocked(prisma.template.findFirst)
        .mockResolvedValueOnce(null) // de-DE not found
        .mockResolvedValueOnce(null) // de not found
        .mockResolvedValueOnce(enTemplate); // en found

      const result = await templateService.resolveTemplate('offer', 'de-DE');

      expect(prisma.template.findFirst).toHaveBeenCalledTimes(3);
      expect(prisma.template.findFirst).toHaveBeenNthCalledWith(3, {
        where: { type: 'offer', locale: 'en', active: true },
        orderBy: { version: 'desc' },
      });
      expect(result).toEqual(enTemplate);
    });

    it('should throw error if even English template not found', async () => {
      vi.mocked(prisma.template.findFirst).mockResolvedValue(null);

      await expect(
        templateService.resolveTemplate('offer', 'fr')
      ).rejects.toThrow('Template not found: type=offer, locale=fr');
    });

    it('should respect activeOnly option set to false', async () => {
      const inactiveTemplate = { ...enTemplate, active: false };
      vi.mocked(prisma.template.findFirst).mockResolvedValue(inactiveTemplate);

      const result = await templateService.resolveTemplate('offer', 'en', {
        activeOnly: false,
      });

      expect(prisma.template.findFirst).toHaveBeenCalledWith({
        where: { type: 'offer', locale: 'en', active: false },
        orderBy: { version: 'desc' },
      });
      expect(result).toEqual(inactiveTemplate);
    });

    it('should not fallback to English for English regional variants', async () => {
      vi.mocked(prisma.template.findFirst).mockResolvedValue(null);

      await expect(
        templateService.resolveTemplate('offer', 'en-GB')
      ).rejects.toThrow('Template not found');

      // Should only try en-GB and en, not fallback to en again
      expect(prisma.template.findFirst).toHaveBeenCalledTimes(2);
    });

    it('should return latest version when multiple versions exist', async () => {
      const v2Template = { ...enTemplate, version: 2 };
      vi.mocked(prisma.template.findFirst).mockResolvedValue(v2Template);

      const result = await templateService.resolveTemplate('offer', 'en');

      expect(prisma.template.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { version: 'desc' },
        })
      );
      expect(result.version).toBe(2);
    });
  });

  describe('getFallbackStats', () => {
    it('should return fallback statistics', () => {
      const stats = templateService.getFallbackStats();

      expect(stats).toHaveProperty('totalFallbacks');
      expect(stats).toHaveProperty('byLocale');
      expect(stats).toHaveProperty('byTemplateType');
      expect(stats).toHaveProperty('recentEvents');
      expect(Array.isArray(stats.byLocale)).toBe(true);
      expect(Array.isArray(stats.byTemplateType)).toBe(true);
      expect(Array.isArray(stats.recentEvents)).toBe(true);
    });
  });
});

