import { Template, TemplateType, TemplateVersion, Prisma } from '@prisma/client';
import prisma from '../db/prisma';
import logger from '../utils/logger';

// In-memory tracking of locale fallback events for monitoring
interface FallbackEvent {
  templateType: TemplateType;
  requestedLocale: string;
  resolvedLocale: string;
  timestamp: Date;
}

const fallbackEvents: FallbackEvent[] = [];
const MAX_FALLBACK_EVENTS = 1000; // Keep last 1000 events

/**
 * Record a locale fallback event for monitoring
 */
function recordFallbackEvent(
  templateType: TemplateType,
  requestedLocale: string,
  resolvedLocale: string
): void {
  fallbackEvents.push({
    templateType,
    requestedLocale,
    resolvedLocale,
    timestamp: new Date(),
  });

  // Keep only recent events
  if (fallbackEvents.length > MAX_FALLBACK_EVENTS) {
    fallbackEvents.shift();
  }
}

/**
 * Get locale fallback statistics
 * Returns aggregated data about which locales are being requested but not available
 */
export function getFallbackStats(): {
  totalFallbacks: number;
  byLocale: Array<{
    requestedLocale: string;
    count: number;
    templateTypes: string[];
  }>;
  byTemplateType: Array<{
    templateType: TemplateType;
    count: number;
    requestedLocales: string[];
  }>;
  recentEvents: Array<{
    templateType: TemplateType;
    requestedLocale: string;
    resolvedLocale: string;
    timestamp: string;
  }>;
} {
  // Aggregate by requested locale
  const byLocaleMap = new Map<string, { count: number; templateTypes: Set<string> }>();
  
  for (const event of fallbackEvents) {
    if (event.requestedLocale === event.resolvedLocale) {
      continue; // Skip exact matches (not fallbacks)
    }

    const key = event.requestedLocale;
    const existing = byLocaleMap.get(key) || { count: 0, templateTypes: new Set<string>() };
    existing.count++;
    existing.templateTypes.add(event.templateType);
    byLocaleMap.set(key, existing);
  }

  const byLocale = Array.from(byLocaleMap.entries()).map(([locale, data]) => ({
    requestedLocale: locale,
    count: data.count,
    templateTypes: Array.from(data.templateTypes).sort(),
  })).sort((a, b) => b.count - a.count);

  // Aggregate by template type
  const byTypeMap = new Map<TemplateType, { count: number; locales: Set<string> }>();
  
  for (const event of fallbackEvents) {
    if (event.requestedLocale === event.resolvedLocale) {
      continue;
    }

    const key = event.templateType;
    const existing = byTypeMap.get(key) || { count: 0, locales: new Set<string>() };
    existing.count++;
    existing.locales.add(event.requestedLocale);
    byTypeMap.set(key, existing);
  }

  const byTemplateType = Array.from(byTypeMap.entries()).map(([type, data]) => ({
    templateType: type,
    count: data.count,
    requestedLocales: Array.from(data.locales).sort(),
  })).sort((a, b) => b.count - a.count);

  // Get recent events (last 50)
  const recentEvents = fallbackEvents
    .filter(e => e.requestedLocale !== e.resolvedLocale)
    .slice(-50)
    .reverse()
    .map(e => ({
      templateType: e.templateType,
      requestedLocale: e.requestedLocale,
      resolvedLocale: e.resolvedLocale,
      timestamp: e.timestamp.toISOString(),
    }));

  return {
    totalFallbacks: fallbackEvents.filter(e => e.requestedLocale !== e.resolvedLocale).length,
    byLocale,
    byTemplateType,
    recentEvents,
  };
}

// Type definitions
export interface TemplateFilters {
  type?: TemplateType;
  locale?: string;
  active?: boolean;
}

export interface TemplateUpdateData {
  name: string;
  subject: string;
  bodyHtml: string;
  bodyText: string;
}

export interface TemplateWithVersionInfo extends Template {
  currentVersion?: number;
  totalVersions?: number;
}

export interface TemplateVersionWithAuthor extends TemplateVersion {
  createdBy: {
    id: string;
    fullName: string;
    email: string;
  };
}

/**
 * List all active templates with optional filtering
 */
export async function getTemplates(
  filters: TemplateFilters = {}
): Promise<Template[]> {
  const where: Prisma.TemplateWhereInput = {
    active: filters.active !== undefined ? filters.active : true,
  };

  if (filters.type) {
    where.type = filters.type;
  }

  if (filters.locale) {
    where.locale = filters.locale;
  }

  const templates = await prisma.template.findMany({
    where,
    orderBy: [{ type: 'asc' }, { locale: 'asc' }],
  });

  logger.debug(
    { count: templates.length, filters },
    'Retrieved templates with filters'
  );

  return templates;
}

/**
 * Get single template by ID
 */
export async function getTemplateById(id: string): Promise<Template | null> {
  const template = await prisma.template.findUnique({
    where: { id },
  });

  if (!template) {
    logger.warn({ templateId: id }, 'Template not found');
  }

  return template;
}

/**
 * Update template and create new version
 * @param id - Template ID
 * @param data - Updated template data
 * @param userId - User performing the update
 * @returns Updated template
 */
export async function updateTemplate(
  id: string,
  data: TemplateUpdateData,
  userId: string
): Promise<Template> {
  logger.info({ templateId: id, userId }, 'Updating template');

  const result = await prisma.$transaction(async (tx) => {
    // Get current template
    const currentTemplate = await tx.template.findUnique({
      where: { id },
      include: {
        versions: {
          orderBy: { versionNumber: 'desc' },
          take: 1,
        },
      },
    });

    if (!currentTemplate) {
      throw new Error(`Template not found: ${id}`);
    }

    // Calculate next version number
    const currentVersionNumber = currentTemplate.versions[0]?.versionNumber || 0;
    const nextVersionNumber = currentVersionNumber + 1;

    // Update template
    const updatedTemplate = await tx.template.update({
      where: { id },
      data: {
        name: data.name,
        subject: data.subject,
        bodyHtml: data.bodyHtml,
        bodyText: data.bodyText,
      },
    });

    // Create version entry
    await tx.templateVersion.create({
      data: {
        templateId: id,
        versionNumber: nextVersionNumber,
        name: data.name,
        type: updatedTemplate.type,
        locale: updatedTemplate.locale,
        subject: data.subject,
        bodyHtml: data.bodyHtml,
        bodyText: data.bodyText,
        createdById: userId,
      },
    });

    logger.info(
      {
        templateId: id,
        versionNumber: nextVersionNumber,
        userId,
      },
      'Template updated and version created'
    );

    return updatedTemplate;
  });

  return result;
}

/**
 * Get version history for a template
 */
export async function getTemplateVersions(
  templateId: string
): Promise<TemplateVersionWithAuthor[]> {
  const versions = await prisma.templateVersion.findMany({
    where: { templateId },
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

  logger.debug(
    { templateId, count: versions.length },
    'Retrieved template versions'
  );

  return versions;
}

/**
 * Rollback template to a specific version
 * @param templateId - Template ID
 * @param versionNumber - Version number to restore
 * @param userId - User performing the rollback
 * @returns Updated template
 */
export async function rollbackTemplate(
  templateId: string,
  versionNumber: number,
  userId: string
): Promise<Template> {
  logger.info(
    { templateId, versionNumber, userId },
    'Rolling back template to version'
  );

  const result = await prisma.$transaction(async (tx) => {
    // Get target version
    const targetVersion = await tx.templateVersion.findUnique({
      where: {
        templateId_versionNumber: {
          templateId,
          versionNumber,
        },
      },
    });

    if (!targetVersion) {
      throw new Error(
        `Version ${versionNumber} not found for template ${templateId}`
      );
    }

    // Get current max version number
    const currentVersions = await tx.templateVersion.findMany({
      where: { templateId },
      orderBy: { versionNumber: 'desc' },
      take: 1,
    });

    const nextVersionNumber = (currentVersions[0]?.versionNumber || 0) + 1;

    // Update template with version content
    const updatedTemplate = await tx.template.update({
      where: { id: templateId },
      data: {
        name: targetVersion.name,
        subject: targetVersion.subject,
        bodyHtml: targetVersion.bodyHtml,
        bodyText: targetVersion.bodyText,
      },
    });

    // Create new version entry representing the rollback
    await tx.templateVersion.create({
      data: {
        templateId,
        versionNumber: nextVersionNumber,
        name: targetVersion.name,
        type: targetVersion.type,
        locale: targetVersion.locale,
        subject: targetVersion.subject,
        bodyHtml: targetVersion.bodyHtml,
        bodyText: targetVersion.bodyText,
        createdById: userId,
      },
    });

    logger.info(
      {
        templateId,
        restoredFromVersion: versionNumber,
        newVersionNumber: nextVersionNumber,
        userId,
      },
      'Template rolled back successfully'
    );

    return updatedTemplate;
  });

  return result;
}

/**
 * Get current version number for a template
 */
export async function getCurrentVersionNumber(
  templateId: string
): Promise<number> {
  const latestVersion = await prisma.templateVersion.findFirst({
    where: { templateId },
    orderBy: { versionNumber: 'desc' },
    select: { versionNumber: true },
  });

  return latestVersion?.versionNumber || 0;
}

/**
 * Resolve template with locale fallback logic
 * Implements 3-tier fallback: exact locale → language code → English
 * @param type - Template type to retrieve
 * @param locale - Requested locale (e.g., 'fr-CA', 'fr', 'en')
 * @param options - Optional parameters
 * @returns Resolved template
 * @throws Error if no template found (including English fallback)
 */
export async function resolveTemplate(
  type: TemplateType,
  locale: string = 'en',
  options: { activeOnly?: boolean } = {}
): Promise<Template> {
  const activeOnly = options.activeOnly !== false; // Default to true

  // Helper function to find template
  const findTemplate = async (searchLocale: string): Promise<Template | null> => {
    return await prisma.template.findFirst({
      where: {
        type,
        locale: searchLocale,
        active: activeOnly,
      },
      orderBy: { version: 'desc' }, // Get latest version
    });
  };

  // Step 1: Try exact locale match (e.g., 'fr-CA')
  let template = await findTemplate(locale);
  
  if (template) {
    logger.debug(
      { type, requestedLocale: locale, resolvedLocale: locale },
      'Template resolved with exact locale match'
    );
    return template;
  }

  // Step 2: Try language code only (e.g., 'fr' from 'fr-CA')
  if (locale.includes('-')) {
    const langCode = locale.split('-')[0];
    template = await findTemplate(langCode);
    
    if (template) {
      recordFallbackEvent(type, locale, langCode);
      logger.info(
        { type, requestedLocale: locale, resolvedLocale: langCode },
        'Template resolved with language code fallback'
      );
      return template;
    }
  }

  // Step 3: Fallback to English
  if (locale !== 'en' && !locale.startsWith('en-')) {
    template = await findTemplate('en');
    
    if (template) {
      recordFallbackEvent(type, locale, 'en');
      logger.info(
        { type, requestedLocale: locale, resolvedLocale: 'en' },
        'Template resolved with English fallback'
      );
      return template;
    }
  }

  // Step 4: No template found - this should not happen with proper seeding
  logger.error(
    { type, requestedLocale: locale, activeOnly },
    'Template not found even with English fallback'
  );
  
  throw new Error(
    `Template not found: type=${type}, locale=${locale} (seed data may be missing)`
  );
}
