import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TemplateType } from '@prisma/client';
import * as templatePreviewService from '../templatePreviewService';
import * as templateRenderer from '../templateRenderer';
import * as templateSampleData from '../templateSampleData';

// Mock logger
vi.mock('../../utils/logger', () => ({
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('templatePreviewService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('previewTemplate', () => {
    it('should render template with provided sample data', () => {
      const request: templatePreviewService.PreviewRequest = {
        subject: 'Hello {{candidate_name}}',
        bodyHtml: '<p>Dear {{candidate_name}}, welcome to {{company_name}}</p>',
        bodyText: 'Dear {{candidate_name}}, welcome to {{company_name}}',
        sampleData: {
          candidate_name: 'John Doe',
          company_name: 'TechCorp',
        },
      };

      const result = templatePreviewService.previewTemplate(request);

      expect(result.subject).toBe('Hello John Doe');
      expect(result.bodyHtml).toBe('<p>Dear John Doe, welcome to TechCorp</p>');
      expect(result.bodyText).toBe('Dear John Doe, welcome to TechCorp');
      expect(result.missingTokens).toEqual([]);
    });

    it('should detect missing tokens', () => {
      const request: templatePreviewService.PreviewRequest = {
        subject: 'Hello {{candidate_name}}',
        bodyHtml: '<p>Role: {{role_title}}</p>',
        bodyText: 'Role: {{role_title}}',
        sampleData: {
          candidate_name: 'John Doe',
        },
      };

      const result = templatePreviewService.previewTemplate(request);

      expect(result.subject).toBe('Hello John Doe');
      expect(result.bodyHtml).toBe('<p>Role: </p>'); // Missing token replaced with empty string
      expect(result.missingTokens).toEqual(['role_title']);
    });

    it('should merge default sample data when template type provided', () => {
      const request: templatePreviewService.PreviewRequest = {
        subject: 'Hello {{candidate_name}}',
        bodyHtml: '<p>Role: {{role_title}}</p>',
        bodyText: 'Role: {{role_title}}',
        templateType: 'offer' as TemplateType,
        sampleData: {}, // Empty custom data
      };

      const result = templatePreviewService.previewTemplate(request);

      // Should use default sample data from templateSampleData
      expect(result.subject).toBe('Hello Alex Johnson');
      expect(result.bodyHtml).toBe('<p>Role: Senior Software Engineer</p>');
      expect(result.missingTokens).toEqual([]);
    });

    it('should override default sample data with custom data', () => {
      const request: templatePreviewService.PreviewRequest = {
        subject: 'Hello {{candidate_name}}',
        bodyHtml: '<p>Role: {{role_title}}</p>',
        bodyText: 'Role: {{role_title}}',
        templateType: 'offer' as TemplateType,
        sampleData: {
          candidate_name: 'Jane Smith', // Override default
        },
      };

      const result = templatePreviewService.previewTemplate(request);

      expect(result.subject).toBe('Hello Jane Smith'); // Custom value
      expect(result.bodyHtml).toBe('<p>Role: Senior Software Engineer</p>'); // Default value
    });

    it('should handle templates with no tokens', () => {
      const request: templatePreviewService.PreviewRequest = {
        subject: 'Static Subject',
        bodyHtml: '<p>Static content</p>',
        bodyText: 'Static content',
        sampleData: {
          candidate_name: 'John Doe',
        },
      };

      const result = templatePreviewService.previewTemplate(request);

      expect(result.subject).toBe('Static Subject');
      expect(result.bodyHtml).toBe('<p>Static content</p>');
      expect(result.bodyText).toBe('Static content');
      expect(result.missingTokens).toEqual([]);
    });

    it('should handle empty sample data gracefully', () => {
      const request: templatePreviewService.PreviewRequest = {
        subject: 'Hello {{candidate_name}}',
        bodyHtml: '<p>{{missing_token}}</p>',
        bodyText: '{{missing_token}}',
      };

      const result = templatePreviewService.previewTemplate(request);

      expect(result.subject).toBe('Hello ');
      expect(result.bodyHtml).toBe('<p></p>');
      expect(result.missingTokens).toContain('candidate_name');
      expect(result.missingTokens).toContain('missing_token');
    });

    it('should handle multiple occurrences of same token', () => {
      const request: templatePreviewService.PreviewRequest = {
        subject: '{{candidate_name}} - {{candidate_name}}',
        bodyHtml: '<p>{{candidate_name}} {{candidate_name}}</p>',
        bodyText: '{{candidate_name}}',
        sampleData: {
          candidate_name: 'John Doe',
        },
      };

      const result = templatePreviewService.previewTemplate(request);

      expect(result.subject).toBe('John Doe - John Doe');
      expect(result.bodyHtml).toBe('<p>John Doe John Doe</p>');
      expect(result.bodyText).toBe('John Doe');
    });
  });

  describe('getTemplateSampleData', () => {
    it('should return sample data for offer template type', () => {
      const sampleData = templatePreviewService.getTemplateSampleData('offer' as TemplateType);

      expect(sampleData).toBeDefined();
      expect(sampleData.candidate_name).toBe('Alex Johnson');
      expect(sampleData.role_title).toBe('Senior Software Engineer');
      expect(sampleData.offer_expiry_date).toBeDefined();
    });

    it('should return sample data for interview_invite template type', () => {
      const sampleData = templatePreviewService.getTemplateSampleData(
        'interview_invite' as TemplateType
      );

      expect(sampleData).toBeDefined();
      expect(sampleData.candidate_name).toBe('Alex Johnson');
      expect(sampleData.interview_date).toBeDefined();
      expect(sampleData.interview_time).toBeDefined();
      expect(sampleData.meeting_link).toBeDefined();
    });

    it('should return sample data for assessment_invite template type', () => {
      const sampleData = templatePreviewService.getTemplateSampleData(
        'assessment_invite' as TemplateType
      );

      expect(sampleData).toBeDefined();
      expect(sampleData.assessment_url).toBeDefined();
      expect(sampleData.assessment_deadline).toBeDefined();
    });

    it('should return sample data for rejection template type', () => {
      const sampleData = templatePreviewService.getTemplateSampleData(
        'rejection' as TemplateType
      );

      expect(sampleData).toBeDefined();
      expect(sampleData.candidate_name).toBe('Alex Johnson');
      expect(sampleData.role_title).toBe('Senior Software Engineer');
    });

    it('should return sample data for all template types', () => {
      const templateTypes: TemplateType[] = [
        'offer',
        'rejection',
        'screening_invite',
        'interview_invite',
        'assessment_invite',
        'withdrawal_ack',
        'general',
      ];

      templateTypes.forEach((type) => {
        const sampleData = templatePreviewService.getTemplateSampleData(type);
        expect(sampleData).toBeDefined();
        expect(Object.keys(sampleData).length).toBeGreaterThan(0);
      });
    });
  });
});
