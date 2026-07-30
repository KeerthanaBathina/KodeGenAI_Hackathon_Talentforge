# Audit Event Taxonomy

Version: 1.0
Date: 2026-07-30
Owner: Platform Engineering

## Overview

This document defines the canonical audit event taxonomy for EP-011 US-001 TASK-001.

Goals:

- Keep audit events queryable with a consistent domain.action naming pattern
- Preserve compatibility with legacy event names and payload shapes
- Enforce required write-contract fields for every persisted audit record

## Contract

Every persisted audit record must resolve to the following normalized contract:

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| eventType | string | Yes | Canonical event name in domain.action format |
| entityType | string | Yes | Entity/resource kind associated with the event |
| entityId | string (UUID) | Yes | Raw non-UUID values are converted to deterministic UUIDs and preserved in payload |
| payload | object | Yes | Metadata about the event, including migration hints |
| actorId | string (UUID) \| null | No | Non-UUID actor values are preserved in payload.actorRef |
| ipAddress | string \| null | No | Request or service context IP |
| userAgent | string \| null | No | Truncated to DB-safe length |

## Canonical Naming Rules

- Pattern: domain.action
- Lowercase tokens
- Use underscores inside each token when needed (for example: approval_chain_initiated)
- Keep eventType within 100 characters

Examples:

- auth.login
- decision.offer_accepted
- privacy.consent_revoked

## Canonical Domains

Primary domains introduced in TASK-001:

- auth
- application
- profile
- privacy
- interview
- decision
- communication
- upload
- config
- security

## Legacy Mapping Strategy

Legacy events are normalized before persistence.

Mapping examples:

| Legacy Name | Canonical Name |
| --- | --- |
| login_success | auth.login |
| privacy_consent_accepted | privacy.consent_accepted |
| APPROVAL_CHAIN_INITIATED | decision.approval_chain_initiated |
| draft.saved | application.draft_saved |
| threshold.version_created | config.threshold_version_created |
| OFFER_EXPIRED | decision.offer_expired |

When an incoming event name is not in the explicit map:

1. Normalize to lowercase
2. Convert separators to a canonical domain.action shape
3. Persist with payload.unregisteredEventType=true for governance follow-up

## Request/Service Context Builder

Use the shared audit context builder in backend services:

- buildAuditContextFromRequest(req)
- buildAuditContext({ req, ...overrides })
- buildServiceAuditContext({ actorId, actorRole, ipAddress, userAgent })

This keeps actor/IP/UA extraction consistent between route handlers, services, and worker jobs.

## Migration Notes

- Existing call sites using action, resourceType/resourceId, or metadata remain supported
- Canonicalization adds payload.legacyEventType when the source event name is transformed
- Non-UUID entity IDs are safely hashed into deterministic UUIDs and original values are copied to payload.entityRef

## Validation

Add or maintain unit coverage for:

- Event taxonomy shape and minimum event count
- Legacy-to-canonical mapping behavior
- Request context extraction and override precedence
- Contract normalization edge cases in audit service