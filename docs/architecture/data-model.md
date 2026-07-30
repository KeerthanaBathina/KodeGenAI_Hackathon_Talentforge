# Data Model Index Coverage

This document tracks the high-frequency query indexes defined in [backend/prisma/schema.prisma](backend/prisma/schema.prisma).

| Index Name | Table | Columns | Query Pattern |
|---|---|---|---|
| idx_applications_requisition_status | applications | (requisition_id, status) | HR review queue by requisition and status |
| idx_applications_candidate_status | applications | (candidate_id, status) | Candidate portal applications by status |
| idx_applications_status_submitted_at | applications | (status, submitted_at desc) | Pipeline dashboard by status sorted by submission time |
| idx_screenings_application_version | screenings | (application_id, version desc) | Latest screening result retrieval |
| idx_reviews_application_decided_at | reviews | (application_id, decided_at desc) | Review history timeline |
| idx_interview_stages_application_type | interview_stages | (application_id, type) | Stage existence check by application/type |
| idx_communications_application_status | communications | (application_id, status) | Communication retry queue |
| idx_audit_events_entity | audit_events | (entity_type, entity_id, created_at desc) | Entity audit feed |
| idx_audit_events_actor | audit_events | (actor_id, created_at desc) | Actor activity feed |
