import { TemplateType } from '@prisma/client';

/**
 * Sample data tokens for template preview
 * Each template type has a complete set of realistic sample values
 */
export const TEMPLATE_SAMPLE_DATA: Record<TemplateType, Record<string, string>> = {
  general: {
    platform_name: 'TalentForge',
    candidate_name: 'Alex Johnson',
    role_title: 'Senior Software Engineer',
    company_name: 'TechCorp',
  },
  
  screening_invite: {
    candidate_name: 'Alex Johnson',
    role_title: 'Senior Software Engineer',
    screening_deadline: '2026-08-05',
    company_name: 'TechCorp',
  },
  
  assessment_invite: {
    candidate_name: 'Alex Johnson',
    role_title: 'Senior Software Engineer',
    assessment_url: 'https://assessments.example.com/test/abc123',
    assessment_deadline: '2026-08-05',
    assessment_duration: '90 minutes',
    company_name: 'TechCorp',
  },
  
  interview_invite: {
    candidate_name: 'Alex Johnson',
    role_title: 'Senior Software Engineer',
    interview_date: 'Monday, August 10, 2026',
    interview_time: '2:00 PM',
    interview_timezone: 'America/New_York',
    interview_duration: '60 minutes',
    interviewer_name: 'Sarah Chen',
    interview_type: 'Technical Interview',
    meeting_link: 'https://meet.example.com/abc123',
    company_name: 'TechCorp',
  },
  
  offer: {
    candidate_name: 'Alex Johnson',
    role_title: 'Senior Software Engineer',
    offer_expiry_date: 'August 20, 2026',
    salary: '$150,000',
    start_date: 'September 1, 2026',
    company_name: 'TechCorp',
    hiring_manager_name: 'Michael Rodriguez',
  },
  
  rejection: {
    candidate_name: 'Alex Johnson',
    role_title: 'Senior Software Engineer',
    company_name: 'TechCorp',
  },
  
  withdrawal_ack: {
    candidate_name: 'Alex Johnson',
    role_title: 'Senior Software Engineer',
    company_name: 'TechCorp',
  },
};

/**
 * Get sample data for a specific template type
 * @param type - The template type
 * @returns Sample token data for the template type
 */
export function getSampleDataForType(type: TemplateType): Record<string, string> {
  return TEMPLATE_SAMPLE_DATA[type] || {};
}

/**
 * Get all available template types with their sample data
 * @returns Array of template types with their sample data
 */
export function getAllSampleData(): Array<{ type: TemplateType; sampleData: Record<string, string> }> {
  return Object.entries(TEMPLATE_SAMPLE_DATA).map(([type, sampleData]) => ({
    type: type as TemplateType,
    sampleData,
  }));
}

/**
 * Merge user-provided sample data with defaults for a template type
 * @param type - The template type
 * @param customData - User-provided sample data
 * @returns Merged sample data (custom data overrides defaults)
 */
export function mergeSampleData(
  type: TemplateType,
  customData: Record<string, string> = {}
): Record<string, string> {
  const defaults = getSampleDataForType(type);
  return { ...defaults, ...customData };
}
