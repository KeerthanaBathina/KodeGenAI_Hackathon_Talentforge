export const AUDIT_EVENT_TYPES = {
  AUTH_LOGIN: 'auth.login',
  AUTH_LOGIN_FAILED: 'auth.login_failed',
  AUTH_LOGIN_BLOCKED: 'auth.login_blocked',
  AUTH_LOGOUT: 'auth.logout',
  AUTH_PASSWORD_RESET_REQUESTED: 'auth.password_reset_requested',
  AUTH_PASSWORD_RESET_REQUESTED_UNKNOWN: 'auth.password_reset_requested_unknown',
  AUTH_PASSWORD_RESET_COMPLETED: 'auth.password_reset_completed',
  AUTH_OAUTH_ACCOUNT_CREATED: 'auth.oauth_account_created',
  AUTH_OAUTH_LOGIN: 'auth.oauth_login',

  APPLICATION_DRAFT_SAVED: 'application.draft_saved',
  APPLICATION_DRAFT_SUBMITTED: 'application.draft_submitted',
  APPLICATION_SUBMITTED: 'application.submitted',
  APPLICATION_WITHDRAWN: 'application.withdrawn',

  PROFILE_CREATED: 'profile.created',
  PROFILE_UPDATED: 'profile.updated',
  PROFILE_DELETED: 'profile.deleted',

  PRIVACY_CONSENT_ACCEPTED: 'privacy.consent_accepted',
  PRIVACY_CONSENT_REVOKED: 'privacy.consent_revoked',

  INTERVIEW_SCHEDULED: 'interview.scheduled',
  INTERVIEW_RESCHEDULED: 'interview.rescheduled',
  INTERVIEW_NO_SHOW: 'interview.no_show',

  DECISION_APPLICATION_DECISION: 'decision.application_decision',
  DECISION_APPLICATION_PATH_OVERRIDE: 'decision.application_path_override',
  DECISION_APPROVAL_AUTO_APPROVED: 'decision.approval_auto_approved',
  DECISION_APPROVAL_CHAIN_INITIATED: 'decision.approval_chain_initiated',
  DECISION_APPROVAL_CHAIN_TERMINATED: 'decision.approval_chain_terminated',
  DECISION_APPROVAL_CHAIN_COMPLETED: 'decision.approval_chain_completed',
  DECISION_APPROVAL_TIER_ADVANCED: 'decision.approval_tier_advanced',
  DECISION_SHORTLIST: 'decision.shortlist',
  DECISION_REJECT: 'decision.reject',
  DECISION_HOLD: 'decision.hold',
  DECISION_WITHDRAW: 'decision.withdraw',
  DECISION_OFFER_GENERATED: 'decision.offer_generated',
  DECISION_OFFER_PROCESSED: 'decision.offer_processed',
  DECISION_OFFER_ACCEPTED: 'decision.offer_accepted',
  DECISION_OFFER_DECLINED: 'decision.offer_declined',
  DECISION_OFFER_EXPIRED: 'decision.offer_expired',
  DECISION_OFFER_DEADLINE_EXTENDED: 'decision.offer_deadline_extended',

  COMMUNICATION_QUEUED: 'communication.queued',
  COMMUNICATION_SENT: 'communication.sent',
  COMMUNICATION_FAILED: 'communication.failed',
  COMMUNICATION_RETRY: 'communication.retry',
  COMMUNICATION_WEEKLY_DIGEST_SENT: 'communication.weekly_digest_sent',
  COMMUNICATION_WEEKLY_DIGEST_FAILED: 'communication.weekly_digest_failed',
  COMMUNICATION_WEEKLY_DIGEST_SKIPPED: 'communication.weekly_digest_skipped',

  UPLOAD_RESUME_STARTED: 'upload.resume_started',
  UPLOAD_RESUME_COMPLETED: 'upload.resume_completed',
  UPLOAD_RESUME_FAILED: 'upload.resume_failed',
  UPLOAD_RESUME_PARSED: 'upload.resume_parsed',
  UPLOAD_REQUISITION_IMPORT_STARTED: 'upload.requisition_import_started',
  UPLOAD_REQUISITION_IMPORT_COMPLETED: 'upload.requisition_import_completed',
  UPLOAD_REQUISITION_IMPORT_FAILED: 'upload.requisition_import_failed',
  UPLOAD_REQUISITION_BULK_IMPORT: 'upload.requisition_bulk_import',

  CONFIG_THRESHOLD_VERSION_CREATED: 'config.threshold_version_created',
  CONFIG_SCORING_THRESHOLD_VERSION_CREATED: 'config.scoring_threshold_version_created',
  CONFIG_APPROVAL_POLICY_VERSION_CREATED: 'config.approval_policy_version_created',
  CONFIG_ASSESSMENT_PROVIDER_CREATED: 'config.assessment_provider_created',
  CONFIG_ASSESSMENT_PROVIDER_UPDATED: 'config.assessment_provider_updated',
  CONFIG_ASSESSMENT_PROVIDER_DELETED: 'config.assessment_provider_deleted',

  SECURITY_ACCOUNT_LOCKED: 'security.account_locked',
  SECURITY_RATE_LIMIT_EXCEEDED: 'security.rate_limit_exceeded',
  SECURITY_SESSION_EXPIRED: 'security.session_expired',
  SECURITY_USER_CREATED: 'security.user_created',
  SECURITY_USER_ROLE_UPDATED: 'security.user_role_updated',
  SECURITY_USER_DEACTIVATED: 'security.user_deactivated',
  SECURITY_USER_REACTIVATED: 'security.user_reactivated',
  SECURITY_USER_DEACTIVATION_BLOCKED: 'security.user_deactivation_blocked'
} as const;

export type AuditEventType = (typeof AUDIT_EVENT_TYPES)[keyof typeof AUDIT_EVENT_TYPES];

export const CANONICAL_AUDIT_EVENT_PATTERN = /^[a-z][a-z0-9_]*\.[a-z0-9_]+$/;

export const AUDIT_EVENT_TYPE_LIST = Object.freeze(
  Object.values(AUDIT_EVENT_TYPES) as AuditEventType[]
);

const LEGACY_EVENT_TYPE_MAP: Record<string, AuditEventType> = {
  login_success: AUDIT_EVENT_TYPES.AUTH_LOGIN,
  login_failed: AUDIT_EVENT_TYPES.AUTH_LOGIN_FAILED,
  login_blocked: AUDIT_EVENT_TYPES.AUTH_LOGIN_BLOCKED,
  logout: AUDIT_EVENT_TYPES.AUTH_LOGOUT,
  account_locked: AUDIT_EVENT_TYPES.SECURITY_ACCOUNT_LOCKED,
  password_reset_requested_unknown: AUDIT_EVENT_TYPES.AUTH_PASSWORD_RESET_REQUESTED_UNKNOWN,
  password_reset_requested: AUDIT_EVENT_TYPES.AUTH_PASSWORD_RESET_REQUESTED,
  password_reset_completed: AUDIT_EVENT_TYPES.AUTH_PASSWORD_RESET_COMPLETED,
  oauth_account_created: AUDIT_EVENT_TYPES.AUTH_OAUTH_ACCOUNT_CREATED,
  oauth_login_success: AUDIT_EVENT_TYPES.AUTH_OAUTH_LOGIN,

  profile_created: AUDIT_EVENT_TYPES.PROFILE_CREATED,
  profile_updated: AUDIT_EVENT_TYPES.PROFILE_UPDATED,
  profile_deleted: AUDIT_EVENT_TYPES.PROFILE_DELETED,

  privacy_consent_accepted: AUDIT_EVENT_TYPES.PRIVACY_CONSENT_ACCEPTED,
  privacy_consent_revoked: AUDIT_EVENT_TYPES.PRIVACY_CONSENT_REVOKED,

  interview_scheduled: AUDIT_EVENT_TYPES.INTERVIEW_SCHEDULED,
  interview_rescheduled: AUDIT_EVENT_TYPES.INTERVIEW_RESCHEDULED,
  interview_no_show: AUDIT_EVENT_TYPES.INTERVIEW_NO_SHOW,

  application_decision: AUDIT_EVENT_TYPES.DECISION_APPLICATION_DECISION,
  decision_created: AUDIT_EVENT_TYPES.DECISION_APPLICATION_DECISION,
  application_path_override: AUDIT_EVENT_TYPES.DECISION_APPLICATION_PATH_OVERRIDE,
  application_withdrawn: AUDIT_EVENT_TYPES.APPLICATION_WITHDRAWN,
  'application.withdrawn': AUDIT_EVENT_TYPES.APPLICATION_WITHDRAWN,
  'draft.saved': AUDIT_EVENT_TYPES.APPLICATION_DRAFT_SAVED,
  'draft.submitted': AUDIT_EVENT_TYPES.APPLICATION_DRAFT_SUBMITTED,

  approval_auto_approved: AUDIT_EVENT_TYPES.DECISION_APPROVAL_AUTO_APPROVED,
  approval_chain_initiated: AUDIT_EVENT_TYPES.DECISION_APPROVAL_CHAIN_INITIATED,
  approval_chain_terminated: AUDIT_EVENT_TYPES.DECISION_APPROVAL_CHAIN_TERMINATED,
  approval_chain_completed: AUDIT_EVENT_TYPES.DECISION_APPROVAL_CHAIN_COMPLETED,
  approval_tier_advanced: AUDIT_EVENT_TYPES.DECISION_APPROVAL_TIER_ADVANCED,

  offer_generated: AUDIT_EVENT_TYPES.DECISION_OFFER_GENERATED,
  decision_shortlist: AUDIT_EVENT_TYPES.DECISION_SHORTLIST,
  decision_reject: AUDIT_EVENT_TYPES.DECISION_REJECT,
  decision_hold: AUDIT_EVENT_TYPES.DECISION_HOLD,
  decision_withdraw: AUDIT_EVENT_TYPES.DECISION_WITHDRAW,
  offer_accepted: AUDIT_EVENT_TYPES.DECISION_OFFER_ACCEPTED,
  offer_declined: AUDIT_EVENT_TYPES.DECISION_OFFER_DECLINED,
  offer_expired: AUDIT_EVENT_TYPES.DECISION_OFFER_EXPIRED,
  offer_deadline_extended: AUDIT_EVENT_TYPES.DECISION_OFFER_DEADLINE_EXTENDED,
  decision_offer_processed: AUDIT_EVENT_TYPES.DECISION_OFFER_PROCESSED,

  session_expired: AUDIT_EVENT_TYPES.SECURITY_SESSION_EXPIRED,
  user_created: AUDIT_EVENT_TYPES.SECURITY_USER_CREATED,
  user_role_updated: AUDIT_EVENT_TYPES.SECURITY_USER_ROLE_UPDATED,
  user_deactivated: AUDIT_EVENT_TYPES.SECURITY_USER_DEACTIVATED,
  user_reactivated: AUDIT_EVENT_TYPES.SECURITY_USER_REACTIVATED,
  user_deactivation_blocked: AUDIT_EVENT_TYPES.SECURITY_USER_DEACTIVATION_BLOCKED,
  'user.created': AUDIT_EVENT_TYPES.SECURITY_USER_CREATED,
  'user.role_updated': AUDIT_EVENT_TYPES.SECURITY_USER_ROLE_UPDATED,
  'user.deactivated': AUDIT_EVENT_TYPES.SECURITY_USER_DEACTIVATED,
  'user.reactivated': AUDIT_EVENT_TYPES.SECURITY_USER_REACTIVATED,
  'user.deactivation_blocked': AUDIT_EVENT_TYPES.SECURITY_USER_DEACTIVATION_BLOCKED,

  weekly_digest_sent: AUDIT_EVENT_TYPES.COMMUNICATION_WEEKLY_DIGEST_SENT,
  weekly_digest_failed: AUDIT_EVENT_TYPES.COMMUNICATION_WEEKLY_DIGEST_FAILED,
  weekly_digest_skipped: AUDIT_EVENT_TYPES.COMMUNICATION_WEEKLY_DIGEST_SKIPPED,
  communication_queued: AUDIT_EVENT_TYPES.COMMUNICATION_QUEUED,
  communication_sent: AUDIT_EVENT_TYPES.COMMUNICATION_SENT,
  communication_failed: AUDIT_EVENT_TYPES.COMMUNICATION_FAILED,
  communication_retry: AUDIT_EVENT_TYPES.COMMUNICATION_RETRY,

  'threshold.version_created': AUDIT_EVENT_TYPES.CONFIG_THRESHOLD_VERSION_CREATED,
  'scoring_threshold.version_created': AUDIT_EVENT_TYPES.CONFIG_SCORING_THRESHOLD_VERSION_CREATED,
  'approval_policy.version_created': AUDIT_EVENT_TYPES.CONFIG_APPROVAL_POLICY_VERSION_CREATED,
  provider_created: AUDIT_EVENT_TYPES.CONFIG_ASSESSMENT_PROVIDER_CREATED,
  provider_updated: AUDIT_EVENT_TYPES.CONFIG_ASSESSMENT_PROVIDER_UPDATED,
  provider_deleted: AUDIT_EVENT_TYPES.CONFIG_ASSESSMENT_PROVIDER_DELETED,

  'resume.started': AUDIT_EVENT_TYPES.UPLOAD_RESUME_STARTED,
  'resume.completed': AUDIT_EVENT_TYPES.UPLOAD_RESUME_COMPLETED,
  'resume.failed': AUDIT_EVENT_TYPES.UPLOAD_RESUME_FAILED,
  'resume.parsed': AUDIT_EVENT_TYPES.UPLOAD_RESUME_PARSED,
  'requisition.bulk_import_started': AUDIT_EVENT_TYPES.UPLOAD_REQUISITION_IMPORT_STARTED,
  'requisition.bulk_import_completed': AUDIT_EVENT_TYPES.UPLOAD_REQUISITION_IMPORT_COMPLETED,
  'requisition.bulk_import_failed': AUDIT_EVENT_TYPES.UPLOAD_REQUISITION_IMPORT_FAILED,
  'requisition.bulk_import': AUDIT_EVENT_TYPES.UPLOAD_REQUISITION_BULK_IMPORT
};

export const LEGACY_AUDIT_EVENT_TYPE_MAP = Object.freeze(LEGACY_EVENT_TYPE_MAP);

const REGISTERED_AUDIT_EVENT_TYPE_SET = new Set<string>(AUDIT_EVENT_TYPE_LIST);

function sanitizeSegment(segment: string): string {
  const cleaned = segment
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_{2,}/g, '_');

  return cleaned || 'unknown';
}

export function normalizeAuditEventTypeCandidate(rawEventType: string): string {
  const normalizedInput = rawEventType.trim().toLowerCase().replace(/-/g, '_');

  if (!normalizedInput) {
    return 'system.unknown';
  }

  const dotSeparated = normalizedInput
    .split('.')
    .map((part) => sanitizeSegment(part))
    .filter((part) => part.length > 0);

  if (dotSeparated.length >= 2) {
    return `${dotSeparated[0]}.${dotSeparated.slice(1).join('_')}`;
  }

  const underscoreSeparated = sanitizeSegment(normalizedInput)
    .split('_')
    .filter((part) => part.length > 0);

  if (underscoreSeparated.length >= 2) {
    return `${underscoreSeparated[0]}.${underscoreSeparated.slice(1).join('_')}`;
  }

  return `system.${underscoreSeparated[0] ?? 'unknown'}`;
}

export function isRegisteredAuditEventType(eventType: string): eventType is AuditEventType {
  return REGISTERED_AUDIT_EVENT_TYPE_SET.has(eventType);
}

export function resolveCanonicalAuditEventType(rawEventType: string): {
  eventType: string;
  legacyEventType?: string;
  wasMapped: boolean;
  isRegistered: boolean;
} {
  const trimmed = rawEventType.trim();
  const lower = trimmed.toLowerCase();

  const mappedLegacyEventType = LEGACY_AUDIT_EVENT_TYPE_MAP[lower];
  if (mappedLegacyEventType) {
    return {
      eventType: mappedLegacyEventType,
      legacyEventType: trimmed === mappedLegacyEventType ? undefined : trimmed,
      wasMapped: trimmed !== mappedLegacyEventType,
      isRegistered: true
    };
  }

  const normalizedCandidate = normalizeAuditEventTypeCandidate(trimmed);
  return {
    eventType: normalizedCandidate,
    legacyEventType: normalizedCandidate === trimmed ? undefined : trimmed,
    wasMapped: normalizedCandidate !== trimmed,
    isRegistered: isRegisteredAuditEventType(normalizedCandidate)
  };
}