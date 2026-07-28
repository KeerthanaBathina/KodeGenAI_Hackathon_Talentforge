import { TemplateType } from '@prisma/client';
import {
  renderTemplate,
  findMissingTokens,
  TemplateFields,
  TokenMap,
} from './templateRenderer';
import { getSampleDataForType, mergeSampleData } from './templateSampleData';
import logger from '../utils/logger';

/**
 * Preview request structure
 */
export interface PreviewRequest {
  subject: string;
  bodyHtml: string;
  bodyText: string;
  sampleData?: Record<string, string>;
  templateType?: TemplateType;
}

/**
 * Preview response structure
 */
export interface PreviewResponse {
  subject: string;
  bodyHtml: string;
  bodyText: string;
  missingTokens: string[];
}

/**
 * Preview a template with token replacement
 * @param request - Preview request with template content and sample data
 * @returns Rendered template with missing token detection
 */
export function previewTemplate(request: PreviewRequest): PreviewResponse {
  const { subject, bodyHtml, bodyText, sampleData = {}, templateType } = request;

  // Create template fields object
  const template: TemplateFields = {
    subject,
    bodyHtml,
    bodyText,
  };

  // Merge sample data with defaults if template type provided
  let tokenData: TokenMap = sampleData;
  if (templateType) {
    tokenData = mergeSampleData(templateType, sampleData);
  }

  // Find missing tokens before rendering
  const missingTokens = findMissingTokens(template, tokenData);

  // Render template with token replacement
  const rendered = renderTemplate(template, tokenData);

  logger.debug(
    {
      templateType,
      missingTokensCount: missingTokens.length,
      hasCustomData: Object.keys(sampleData).length > 0,
    },
    'Template preview generated'
  );

  return {
    subject: rendered.subject,
    bodyHtml: rendered.bodyHtml,
    bodyText: rendered.bodyText,
    missingTokens,
  };
}

/**
 * Get sample data for a specific template type
 * @param type - Template type
 * @returns Sample data tokens for the template type
 */
export function getTemplateSampleData(type: TemplateType): Record<string, string> {
  const sampleData = getSampleDataForType(type);

  logger.debug(
    { templateType: type, tokenCount: Object.keys(sampleData).length },
    'Retrieved sample data for template type'
  );

  return sampleData;
}
