# US-004 — Notification Preference Centre with Per-Channel Opt-In/Out

**Epic**: EP-008 — Communication Service  
**Status**: ✅ Completed  
**Created**: 2026-07-28  
**Completed**: 2026-07-28

---

## Overview

Implement a user-facing notification preference centre that allows users to opt in or out of notifications on a per-type, per-channel basis. Users can control whether they receive email and/or in-app notifications for each notification type (e.g., "Interview Reminder", "Review Assignment"). System-critical notification types cannot be disabled.

---

## Acceptance Criteria

1. **Preference grid**: User can see all notification types with toggle switches for each channel (Email, In-App)
2. **Opt-out takes effect**: When user disables a notification type/channel, no notifications of that type are sent via that channel within 1 send cycle
3. **System-critical types**: Certain notification types (e.g., "Account security alerts") cannot be disabled and show a lock icon
4. **Preferences persist**: Changes are saved to the database and apply immediately; settings persist across sessions

---

## Task Breakdown

| Task ID | Title | Layer | Effort | Status | Dependencies |
|---------|-------|-------|--------|--------|--------------|
| [TASK-001](./task_001.md) | Database Schema | Database | 1h | Completed | None |
| [TASK-002](./task_002.md) | Service Layer | Backend | 2h | Completed | TASK-001 |
| [TASK-003](./task_003.md) | Preference UI | Frontend | 2.5h | Completed | TASK-002 |
| [TASK-004](./task_004.md) | Delivery Integration | Backend | 2h | Completed | TASK-002, US-002, US-003 |
| [TASK-005](./task_005.md) | Validation & Testing | Full Stack | 2.5h | Completed | TASK-001-004 |

**Total Effort**: ~10 hours

---

## Implementation Order

Follow this sequence to ensure proper dependency resolution:

```
TASK-001 (Database Schema)
    ↓
TASK-002 (Service Layer)
    ↓
    ├─→ TASK-003 (Preference UI)
    └─→ TASK-004 (Delivery Integration)
         ↓
      TASK-005 (Validation & Testing)
```

---

## External Dependencies

- **US-002 TASK-002**: Email delivery service (for email channel integration)
- **US-003 TASK-002**: Socket.IO notification broadcasting (for in-app channel integration)

---

## Technical Components

### Database
- `NotificationPreference` model
- Unique constraint: `(userId, notificationType, channel)`
- Seed script for default preferences

### Backend Services
- `notificationPreferenceService.ts`: CRUD operations, preference checking
- API Routes: `GET /api/notification-preferences`, `PATCH /:type/:channel`, `POST /bulk`, `POST /reset`

### Frontend Components
- `NotificationPreferenceGrid.tsx`: Main preference grid UI
- `ToggleSwitch.tsx`: Reusable toggle component
- Page: `/settings/notifications`

### Integration Points
- `notificationService.ts`: Check IN_APP preference before creating notification
- `notificationBroadcastService.ts`: Check IN_APP preference before Socket.IO broadcast
- Email service: Check EMAIL preference before sending email

---

## Testing Strategy

- **Unit Tests**: Service layer (>80% coverage)
- **Integration Tests**: API endpoints, delivery service integration
- **Component Tests**: Frontend preference grid, toggle switch
- **E2E Tests**: Full preference flow (Playwright)
- **Performance Tests**: Preference check latency (<10ms target)

---

## Success Metrics

| Metric | Target |
|--------|--------|
| Test Coverage | >80% |
| Preference Check Latency | <10ms |
| Page Load Time | <2s |
| Save Operation Time | <500ms |

---

## Related Documentation

- [User Story](../../user_stories/ep_008/us_004.md)
- [US-002: Email Notifications](../us_002/)
- [US-003: In-App Notifications](../us_003/)

---

## Notes

- System-critical notification types are defined in `backend/src/config/notificationTypes.ts`
- Default preferences are created automatically when a new user registers
- Preference changes take effect immediately (no delay)
- Email and in-app channels are independent (user can disable one and keep the other)
