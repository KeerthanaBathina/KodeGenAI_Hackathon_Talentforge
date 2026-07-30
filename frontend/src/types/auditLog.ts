export const AUDIT_LOG_DEFAULT_PAGE_SIZE = 50;

export interface AuditLogListItem {
  id: string;
  actorId: string | null;
  actorEmail: string | null;
  eventType: string;
  entityType: string;
  entityId: string;
  payload: Record<string, unknown>;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
}

export interface AuditLogListResponse {
  items: AuditLogListItem[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

export interface AuditLogQueryFilters {
  actorEmail?: string;
  eventTypes?: string[];
  entityType?: string;
  entityId?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

export interface AuditLogFilterFormState {
  actorEmail: string;
  eventTypes: string[];
  entityType: string;
  entityId: string;
  from: string;
  to: string;
}

export interface AuditLogExportResult {
  blob: Blob;
  fileName: string;
}

export const AUDIT_ENTITY_TYPE_OPTIONS = [
  'application',
  'session',
  'user',
  'profile',
  'decision',
  'communication',
  'requisition',
  'interview',
  'config',
  'upload',
  'security'
] as const;

export const AUDIT_EVENT_TYPE_OPTIONS = [
  'auth.login',
  'auth.login_failed',
  'auth.login_blocked',
  'auth.logout',
  'auth.password_reset_requested',
  'auth.password_reset_requested_unknown',
  'auth.password_reset_completed',
  'auth.oauth_account_created',
  'auth.oauth_login',
  'application.draft_saved',
  'application.draft_submitted',
  'application.submitted',
  'application.withdrawn',
  'profile.created',
  'profile.updated',
  'profile.deleted',
  'privacy.consent_accepted',
  'privacy.consent_revoked',
  'interview.scheduled',
  'interview.rescheduled',
  'interview.no_show',
  'decision.application_decision',
  'decision.application_path_override',
  'decision.approval_auto_approved',
  'decision.approval_chain_initiated',
  'decision.approval_chain_terminated',
  'decision.approval_chain_completed',
  'decision.approval_tier_advanced',
  'decision.shortlist',
  'decision.reject',
  'decision.hold',
  'decision.withdraw',
  'decision.offer_generated',
  'decision.offer_processed',
  'decision.offer_accepted',
  'decision.offer_declined',
  'decision.offer_expired',
  'decision.offer_deadline_extended',
  'communication.queued',
  'communication.sent',
  'communication.failed',
  'communication.retry',
  'communication.weekly_digest_sent',
  'communication.weekly_digest_failed',
  'communication.weekly_digest_skipped',
  'upload.resume_started',
  'upload.resume_completed',
  'upload.resume_failed',
  'upload.resume_parsed',
  'upload.requisition_import_started',
  'upload.requisition_import_completed',
  'upload.requisition_import_failed',
  'upload.requisition_bulk_import',
  'config.threshold_version_created',
  'config.scoring_threshold_version_created',
  'config.approval_policy_version_created',
  'config.assessment_provider_created',
  'config.assessment_provider_updated',
  'config.assessment_provider_deleted',
  'security.account_locked',
  'security.rate_limit_exceeded',
  'security.session_expired',
  'security.user_created',
  'security.user_role_updated',
  'security.user_deactivated',
  'security.user_reactivated',
  'security.user_deactivation_blocked'
] as const;
