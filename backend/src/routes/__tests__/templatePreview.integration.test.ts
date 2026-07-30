import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { app } from '../../app';
import { TemplateType } from '@prisma/client';

// Mock authentication middleware
vi.mock('../../middleware/authenticate', () => ({
  authenticate: (req: any, _res: any, next: any) => {
    req.user = {
      id: 'test-user-id',
      email: 'test@example.com',
      role: 'recruiter',
    };
    next();
  },
}));

describe('Template Preview API Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /api/templates/preview', () => {
    it('should preview template with sample data', async () => {
      const previewData = {
        subject: 'Hello {{candidate_name}}',
        bodyHtml: '<p>Dear {{candidate_name}}, welcome to {{company_name}}</p>',
        bodyText: 'Dear {{candidate_name}}, welcome to {{company_name}}',
        sampleData: {
          candidate_name: 'John Doe',
          company_name: 'TechCorp',
        },
      };

      const response = await request(app)
        .post('/api/templates/preview')
        .send(previewData)
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body).toHaveProperty('subject', 'Hello John Doe');
      expect(response.body).toHaveProperty(
        'bodyHtml',
        '<p>Dear John Doe, welcome to TechCorp</p>'
      );
      expect(response.body).toHaveProperty(
        'bodyText',
        'Dear John Doe, welcome to TechCorp'
      );
      expect(response.body).toHaveProperty('missingTokens');
      expect(response.body.missingTokens).toEqual([]);
    });

    it('should detect missing tokens in preview', async () => {
      const previewData = {
        subject: 'Hello {{candidate_name}}',
        bodyHtml: '<p>Role: {{role_title}}, Salary: {{salary}}</p>',
        bodyText: 'Role: {{role_title}}',
        sampleData: {
          candidate_name: 'John Doe',
        },
      };

      const response = await request(app)
        .post('/api/templates/preview')
        .send(previewData)
        .expect(200);

      expect(response.body.subject).toBe('Hello John Doe');
      expect(response.body.missingTokens).toContain('role_title');
      expect(response.body.missingTokens).toContain('salary');
    });

    it('should use default sample data when template type provided', async () => {
      const previewData = {
        subject: 'Hello {{candidate_name}}',
        bodyHtml: '<p>Role: {{role_title}}</p>',
        bodyText: 'Role: {{role_title}}',
        templateType: 'offer',
      };

      const response = await request(app)
        .post('/api/templates/preview')
        .send(previewData)
        .expect(200);

      expect(response.body.subject).toBe('Hello Alex Johnson');
      expect(response.body.bodyHtml).toBe('<p>Role: Senior Software Engineer</p>');
      expect(response.body.missingTokens).toEqual([]);
    });

    it('should override default sample data with custom data', async () => {
      const previewData = {
        subject: 'Hello {{candidate_name}}',
        bodyHtml: '<p>Role: {{role_title}}</p>',
        bodyText: 'Role: {{role_title}}',
        templateType: 'offer',
        sampleData: {
          candidate_name: 'Jane Smith',
        },
      };

      const response = await request(app)
        .post('/api/templates/preview')
        .send(previewData)
        .expect(200);

      expect(response.body.subject).toBe('Hello Jane Smith');
      expect(response.body.bodyHtml).toBe('<p>Role: Senior Software Engineer</p>');
    });

    it('should return 400 for invalid preview request', async () => {
      const invalidData = {
        subject: 'Test',
        // Missing bodyHtml and bodyText
      };

      const response = await request(app)
        .post('/api/templates/preview')
        .send(invalidData)
        .expect(400);

      expect(response.body.error).toHaveProperty('code', 'INVALID_REQUEST_DATA');
    });

    it('should handle templates with no tokens', async () => {
      const previewData = {
        subject: 'Static Subject',
        bodyHtml: '<p>Static content</p>',
        bodyText: 'Static content',
      };

      const response = await request(app)
        .post('/api/templates/preview')
        .send(previewData)
        .expect(200);

      expect(response.body.subject).toBe('Static Subject');
      expect(response.body.bodyHtml).toBe('<p>Static content</p>');
      expect(response.body.missingTokens).toEqual([]);
    });

    it('should handle empty sample data', async () => {
      const previewData = {
        subject: 'Hello {{candidate_name}}',
        bodyHtml: '<p>{{missing_token}}</p>',
        bodyText: '{{missing_token}}',
        sampleData: {},
      };

      const response = await request(app)
        .post('/api/templates/preview')
        .send(previewData)
        .expect(200);

      expect(response.body.missingTokens.length).toBeGreaterThan(0);
      expect(response.body.missingTokens).toContain('candidate_name');
      expect(response.body.missingTokens).toContain('missing_token');
    });
  });

  describe('GET /api/templates/sample-data/:type', () => {
    it('should return sample data for offer template type', async () => {
      const response = await request(app)
        .get('/api/templates/sample-data/offer')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body).toHaveProperty('type', 'offer');
      expect(response.body).toHaveProperty('sampleData');
      expect(response.body).toHaveProperty('tokenCount');
      expect(response.body.sampleData.candidate_name).toBe('Alex Johnson');
      expect(response.body.sampleData.role_title).toBe('Senior Software Engineer');
      expect(response.body.tokenCount).toBeGreaterThan(0);
    });

    it('should return sample data for interview_invite template type', async () => {
      const response = await request(app)
        .get('/api/templates/sample-data/interview_invite')
        .expect(200);

      expect(response.body.type).toBe('interview_invite');
      expect(response.body.sampleData).toHaveProperty('interview_date');
      expect(response.body.sampleData).toHaveProperty('interview_time');
      expect(response.body.sampleData).toHaveProperty('meeting_link');
    });

    it('should return sample data for assessment_invite template type', async () => {
      const response = await request(app)
        .get('/api/templates/sample-data/assessment_invite')
        .expect(200);

      expect(response.body.sampleData).toHaveProperty('assessment_url');
      expect(response.body.sampleData).toHaveProperty('assessment_deadline');
    });

    it('should return sample data for rejection template type', async () => {
      const response = await request(app)
        .get('/api/templates/sample-data/rejection')
        .expect(200);

      expect(response.body.sampleData).toHaveProperty('candidate_name');
      expect(response.body.sampleData).toHaveProperty('role_title');
    });

    it('should return sample data for all valid template types', async () => {
      const templateTypes: TemplateType[] = [
        'offer',
        'rejection',
        'screening_invite',
        'interview_invite',
        'assessment_invite',
        'withdrawal_ack',
        'general',
      ];

      for (const type of templateTypes) {
        const response = await request(app)
          .get(`/api/templates/sample-data/${type}`)
          .expect(200);

        expect(response.body.type).toBe(type);
        expect(response.body.sampleData).toBeDefined();
        expect(response.body.tokenCount).toBeGreaterThan(0);
      }
    });

    it('should return 400 for invalid template type', async () => {
      const response = await request(app)
        .get('/api/templates/sample-data/invalid_type')
        .expect(400);

      expect(response.body.error).toHaveProperty('code', 'INVALID_TEMPLATE_TYPE');
      expect(response.body.error).toHaveProperty('validTypes');
    });

    it('should include all expected tokens for offer template', async () => {
      const response = await request(app)
        .get('/api/templates/sample-data/offer')
        .expect(200);

      const { sampleData } = response.body;
      expect(sampleData).toHaveProperty('candidate_name');
      expect(sampleData).toHaveProperty('role_title');
      expect(sampleData).toHaveProperty('offer_expiry_date');
      expect(sampleData).toHaveProperty('company_name');
    });

    it('should include all expected tokens for interview_invite template', async () => {
      const response = await request(app)
        .get('/api/templates/sample-data/interview_invite')
        .expect(200);

      const { sampleData } = response.body;
      expect(sampleData).toHaveProperty('candidate_name');
      expect(sampleData).toHaveProperty('interview_date');
      expect(sampleData).toHaveProperty('interview_time');
      expect(sampleData).toHaveProperty('interview_timezone');
      expect(sampleData).toHaveProperty('meeting_link');
    });
  });
});
