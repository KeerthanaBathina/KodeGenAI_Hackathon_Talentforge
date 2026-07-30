import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { app } from '../../app';
import prisma from '../../db/prisma';
import { Template, TemplateType } from '@prisma/client';

// Mock authentication middleware
vi.mock('../../middleware/authenticate', () => ({
  authenticate: (req: any, _res: any, next: any) => {
    req.user = {
      id: 'admin-user-id',
      email: 'admin@example.com',
      role: 'admin',
    };
    next();
  },
}));

describe('Template API Integration Tests', () => {
  const mockTemplateId = 'template-test-id';
  const mockUserId = 'admin-user-id';

  const mockTemplate: Template = {
    id: mockTemplateId,
    name: 'Offer Letter',
    type: 'offer' as TemplateType,
    locale: 'en',
    version: 1,
    subject: 'Congratulations {{candidate_name}}',
    bodyHtml: '<p>Dear {{candidate_name}}, we are pleased to offer...</p>',
    bodyText: 'Dear {{candidate_name}}, we are pleased to offer...',
    active: true,
    createdAt: new Date('2026-07-01'),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('GET /api/templates', () => {
    it('should return list of templates for admin user', async () => {
      vi.spyOn(prisma.template, 'findMany').mockResolvedValue([mockTemplate]);

      const response = await request(app)
        .get('/api/templates')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body).toHaveProperty('templates');
      expect(response.body).toHaveProperty('count', 1);
      expect(response.body.templates).toHaveLength(1);
      expect(response.body.templates[0]).toMatchObject({
        id: mockTemplateId,
        name: 'Offer Letter',
        type: 'offer',
      });
    });

    it('should filter templates by type', async () => {
      vi.spyOn(prisma.template, 'findMany').mockResolvedValue([mockTemplate]);

      const response = await request(app)
        .get('/api/templates?type=offer')
        .expect(200);

      expect(response.body.templates).toHaveLength(1);
    });

    it('should return 400 for invalid query parameters', async () => {
      const response = await request(app)
        .get('/api/templates?type=invalid_type')
        .expect(400);

      expect(response.body.error).toHaveProperty('code', 'INVALID_QUERY_PARAMS');
    });
  });

  describe('GET /api/templates/:id', () => {
    it('should return single template by ID', async () => {
      vi.spyOn(prisma.template, 'findUnique').mockResolvedValue(mockTemplate);

      const response = await request(app)
        .get(`/api/templates/${mockTemplateId}`)
        .expect(200);

      expect(response.body).toHaveProperty('template');
      expect(response.body.template.id).toBe(mockTemplateId);
    });

    it('should return 404 if template not found', async () => {
      vi.spyOn(prisma.template, 'findUnique').mockResolvedValue(null);

      const response = await request(app)
        .get('/api/templates/non-existent-id')
        .expect(404);

      expect(response.body.error).toHaveProperty('code', 'TEMPLATE_NOT_FOUND');
    });
  });

  describe('PUT /api/templates/:id', () => {
    const updateData = {
      name: 'Updated Offer Letter',
      subject: 'Updated Subject {{candidate_name}}',
      bodyHtml: '<p>Updated HTML content</p>',
      bodyText: 'Updated text content',
    };

    it('should update template and create new version', async () => {
      const updatedTemplate = { ...mockTemplate, ...updateData };

      vi.spyOn(prisma, '$transaction').mockImplementation(async (callback: any) => {
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
            findFirst: vi.fn().mockResolvedValue({ versionNumber: 2 }),
          },
        });
      });

      const response = await request(app)
        .put(`/api/templates/${mockTemplateId}`)
        .send(updateData)
        .expect(200);

      expect(response.body).toHaveProperty('template');
      expect(response.body).toHaveProperty('version');
      expect(response.body).toHaveProperty('message');
      expect(response.body.template.name).toBe(updateData.name);
    });

    it('should return 400 for invalid update data', async () => {
      const response = await request(app)
        .put(`/api/templates/${mockTemplateId}`)
        .send({ name: '' }) // Missing required fields
        .expect(400);

      expect(response.body.error).toHaveProperty('code', 'INVALID_REQUEST_DATA');
    });

    it('should return 404 if template not found', async () => {
      vi.spyOn(prisma, '$transaction').mockImplementation(async (callback: any) => {
        return await callback({
          template: {
            findUnique: vi.fn().mockResolvedValue(null),
          },
        });
      });

      const response = await request(app)
        .put('/api/templates/non-existent-id')
        .send(updateData)
        .expect(404);

      expect(response.body.error).toHaveProperty('code', 'TEMPLATE_NOT_FOUND');
    });
  });

  describe('GET /api/templates/:id/versions', () => {
    it('should return version history for template', async () => {
      const mockVersions = [
        {
          id: 'version-1',
          templateId: mockTemplateId,
          versionNumber: 2,
          name: 'Updated Template',
          type: 'offer' as TemplateType,
          locale: 'en',
          subject: 'Updated Subject',
          bodyHtml: '<p>Updated</p>',
          bodyText: 'Updated',
          createdById: mockUserId,
          createdAt: new Date('2026-07-28'),
          createdBy: {
            id: mockUserId,
            fullName: 'Admin User',
            email: 'admin@example.com',
          },
        },
        {
          id: 'version-2',
          templateId: mockTemplateId,
          versionNumber: 1,
          name: 'Original Template',
          type: 'offer' as TemplateType,
          locale: 'en',
          subject: 'Original Subject',
          bodyHtml: '<p>Original</p>',
          bodyText: 'Original',
          createdById: mockUserId,
          createdAt: new Date('2026-07-01'),
          createdBy: {
            id: mockUserId,
            fullName: 'Admin User',
            email: 'admin@example.com',
          },
        },
      ];

      vi.spyOn(prisma.template, 'findUnique').mockResolvedValue(mockTemplate);
      vi.spyOn(prisma.templateVersion, 'findMany').mockResolvedValue(mockVersions as any);

      const response = await request(app)
        .get(`/api/templates/${mockTemplateId}/versions`)
        .expect(200);

      expect(response.body).toHaveProperty('versions');
      expect(response.body).toHaveProperty('count', 2);
      expect(response.body.versions).toHaveLength(2);
      expect(response.body.versions[0].versionNumber).toBe(2);
    });

    it('should return 404 if template not found', async () => {
      vi.spyOn(prisma.template, 'findUnique').mockResolvedValue(null);

      const response = await request(app)
        .get('/api/templates/non-existent-id/versions')
        .expect(404);

      expect(response.body.error).toHaveProperty('code', 'TEMPLATE_NOT_FOUND');
    });
  });

  describe('POST /api/templates/:id/rollback', () => {
    const rollbackData = {
      versionNumber: 1,
    };

    it('should rollback template to specified version', async () => {
      const targetVersion = {
        id: 'version-1',
        templateId: mockTemplateId,
        versionNumber: 1,
        name: 'Original Template',
        type: 'offer' as TemplateType,
        locale: 'en',
        subject: 'Original Subject',
        bodyHtml: '<p>Original</p>',
        bodyText: 'Original',
        createdById: mockUserId,
        createdAt: new Date('2026-07-01'),
      };

      const rolledBackTemplate = {
        ...mockTemplate,
        name: targetVersion.name,
        subject: targetVersion.subject,
        bodyHtml: targetVersion.bodyHtml,
        bodyText: targetVersion.bodyText,
      };

      vi.spyOn(prisma, '$transaction').mockImplementation(async (callback: any) => {
        return await callback({
          templateVersion: {
            findUnique: vi.fn().mockResolvedValue(targetVersion),
            findMany: vi.fn().mockResolvedValue([{ versionNumber: 2 }]),
            create: vi.fn().mockResolvedValue({ versionNumber: 3 }),
            findFirst: vi.fn().mockResolvedValue({ versionNumber: 3 }),
          },
          template: {
            update: vi.fn().mockResolvedValue(rolledBackTemplate),
          },
        });
      });

      const response = await request(app)
        .post(`/api/templates/${mockTemplateId}/rollback`)
        .send(rollbackData)
        .expect(200);

      expect(response.body).toHaveProperty('template');
      expect(response.body).toHaveProperty('restoredFromVersion', 1);
      expect(response.body).toHaveProperty('newVersion');
      expect(response.body.message).toContain('restored to version 1');
    });

    it('should return 400 for invalid rollback request', async () => {
      const response = await request(app)
        .post(`/api/templates/${mockTemplateId}/rollback`)
        .send({ versionNumber: 'invalid' })
        .expect(400);

      expect(response.body.error).toHaveProperty('code', 'INVALID_REQUEST_DATA');
    });

    it('should return 404 if version not found', async () => {
      vi.spyOn(prisma, '$transaction').mockImplementation(async (callback: any) => {
        return await callback({
          templateVersion: {
            findUnique: vi.fn().mockResolvedValue(null),
          },
        });
      });

      const response = await request(app)
        .post(`/api/templates/${mockTemplateId}/rollback`)
        .send(rollbackData)
        .expect(404);

      expect(response.body.error).toHaveProperty('code', 'VERSION_NOT_FOUND');
    });
  });

  describe('GET /api/templates/fallback-stats', () => {
    it('should return fallback statistics for admin user', async () => {
      const response = await request(app)
        .get('/api/templates/fallback-stats')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body).toHaveProperty('totalFallbacks');
      expect(response.body).toHaveProperty('byLocale');
      expect(response.body).toHaveProperty('byTemplateType');
      expect(response.body).toHaveProperty('recentEvents');
      expect(response.body).toHaveProperty('message');
      expect(response.body).toHaveProperty('note');
      
      expect(Array.isArray(response.body.byLocale)).toBe(true);
      expect(Array.isArray(response.body.byTemplateType)).toBe(true);
      expect(Array.isArray(response.body.recentEvents)).toBe(true);
      expect(typeof response.body.totalFallbacks).toBe('number');
    });

    it('should return structured fallback data', async () => {
      const response = await request(app)
        .get('/api/templates/fallback-stats')
        .expect(200);

      // Check structure of byLocale items
      if (response.body.byLocale.length > 0) {
        const localeItem = response.body.byLocale[0];
        expect(localeItem).toHaveProperty('requestedLocale');
        expect(localeItem).toHaveProperty('count');
        expect(localeItem).toHaveProperty('templateTypes');
        expect(Array.isArray(localeItem.templateTypes)).toBe(true);
      }

      // Check structure of byTemplateType items
      if (response.body.byTemplateType.length > 0) {
        const typeItem = response.body.byTemplateType[0];
        expect(typeItem).toHaveProperty('templateType');
        expect(typeItem).toHaveProperty('count');
        expect(typeItem).toHaveProperty('requestedLocales');
        expect(Array.isArray(typeItem.requestedLocales)).toBe(true);
      }

      // Check structure of recentEvents items
      if (response.body.recentEvents.length > 0) {
        const event = response.body.recentEvents[0];
        expect(event).toHaveProperty('templateType');
        expect(event).toHaveProperty('requestedLocale');
        expect(event).toHaveProperty('resolvedLocale');
        expect(event).toHaveProperty('timestamp');
      }
    });
  });
});
