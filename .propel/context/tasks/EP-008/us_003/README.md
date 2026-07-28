# US-003 Implementation Task Breakdown

**User Story**: US-003 — In-App WebSocket Notifications with Badge Count and Toasts  
**Epic**: EP-008 — Communication Service  
**Story Points**: 5 | **Phase**: 4  
**Status**: Draft → Ready for Implementation

---

## Task Overview

US-003 has been decomposed into **5 sequential tasks** spanning backend and frontend layers:

| Task | Title | Layer | Effort | Dependencies |
|------|-------|-------|--------|--------------|
| TASK-001 | Database Schema and Notification Service | Backend | 2h | None |
| TASK-002 | Socket.IO Notification Broadcasting | Backend | 3h | TASK-001 |
| TASK-003 | Notification Context and Socket Client | Frontend | 3h | TASK-002 |
| TASK-004 | Bell Badge and Notification Panel UI | Frontend | 4h | TASK-003 |
| TASK-005 | Toast Notification System | Frontend | 3h | TASK-003 |

**Total Estimated Effort**: 15 hours

---

## Task Sequence and Dependencies

```
┌──────────────┐
│  TASK-001    │  Database Schema + Notification Service
│  (Backend)   │  ➜ Prisma model, migrations, CRUD operations
└──────┬───────┘
       │
       ▼
┌──────────────┐
│  TASK-002    │  Socket.IO Broadcasting
│  (Backend)   │  ➜ User rooms, broadcast function, integration
└──────┬───────┘
       │
       ▼
┌──────────────┐
│  TASK-003    │  React Context + Socket Client
│  (Frontend)  │  ➜ State management, WebSocket listener, actions
└───────┬──────┘
        │
        ├─────────────────┐
        ▼                 ▼
┌──────────────┐  ┌──────────────┐
│  TASK-004    │  │  TASK-005    │
│  (Frontend)  │  │  (Frontend)  │
│  Bell Badge  │  │    Toast     │
│     Panel    │  │  Notifications│
└──────────────┘  └──────────────┘

TASK-004 and TASK-005 can be implemented in parallel after TASK-003
```

---

## Detailed Task Summaries

### TASK-001: Database Schema and Notification Service (Backend, 2h)

**Objective**: Create database persistence layer for notifications

**Key Deliverables**:
- Prisma `Notification` model with fields: id, userId, eventType, payload (JSONB), readAt, createdAt
- Database migration
- `NotificationEventType` enum (9 event types)
- `NotificationService` with CRUD operations:
  - `createNotification()`
  - `getUnreadCount()`
  - `getNotifications()` (paginated, 50 per page)
  - `markAsRead()`
  - `markAllAsRead()`
- Database indexes: (userId, readAt), (userId, createdAt DESC)
- Unit tests (>80% coverage)

**Security**:
- User ownership validation on mark-as-read
- Cascade delete on user deletion
- No PII in payload (use entity IDs)

---

### TASK-002: Socket.IO Notification Broadcasting (Backend, 3h)

**Objective**: Real-time notification delivery via WebSocket

**Key Deliverables**:
- User-specific Socket.IO rooms (`user:<userId>` pattern)
- Auto-join room on connection with JWT authentication
- `notificationBroadcastService`:
  - `broadcastNotificationToUser()` - sends `notification:new` event
  - `createAndBroadcastNotification()` - combined create + broadcast
- Integration with existing Socket.IO setup in `socket/index.ts`
- Admin endpoint for room debugging (optional)
- Integration tests with Socket.IO client

**Event Payload**:
```typescript
{
  notification: Notification,
  unreadCount: number
}
```

**Security**:
- JWT validation before joining room
- Private rooms (cannot subscribe to other user's rooms)
- Best-effort broadcast (failure doesn't block notification creation)

---

### TASK-003: Notification Context and Socket Client (Frontend, 3h)

**Objective**: React state management and WebSocket integration

**Key Deliverables**:
- `NotificationContext` with React Context API
- `useSocketClient` hook with authentication
- Real-time event listener for `notification:new`
- State: notifications array, unreadCount, isLoading
- Actions:
  - `loadNotifications()` - initial fetch from API
  - `markAsRead(notificationId)` - optimistic update
  - `markAllAsRead()` - optimistic batch update
- `NotificationProvider` wraps app layout
- Unit tests with mocked Socket.IO

**State Synchronization**:
- Badge count updates in <1 second via WebSocket payload
- Optimistic UI updates for mark-as-read actions
- Error handling reverts optimistic updates

---

### TASK-004: Bell Badge and Notification Panel UI (Frontend, 4h)

**Objective**: Notification bell icon with dropdown panel

**Key Deliverables**:
- `BellIcon` component with unread badge
  - Badge displays count (max "99+")
  - Red circle on top-right of bell icon
- `NotificationPanel` component (400px wide, 600px max height)
  - Grouped by date: "Today", "Yesterday", "This Week", "Older"
  - Relative timestamps: "Just now", "2 min ago", "1 hour ago"
  - Pagination: 50 notifications per load
  - "Mark all as read" button
  - Empty state when no notifications
- `NotificationItem` component
  - 3-line compact: title, message, timestamp
  - Blue highlight for unread
  - Click marks as read and navigates
- Utility functions:
  - `getRelativeTimeString()`
  - `getDateGroup()`
  - `groupNotificationsByDate()`
- Unit tests (>80% coverage)

**Accessibility**:
- Bell button: descriptive aria-label, aria-expanded
- Badge: aria-live="polite" for screen reader updates
- Panel: role="dialog"
- Keyboard: Tab, Enter, Escape

---

### TASK-005: Toast Notification System (Frontend, 3h)

**Objective**: Temporary toast pop-ups for important events

**Key Deliverables**:
- `ToastContext` and `ToastProvider`
- `Toast` component with 4 types: info, success, warning, error
  - Auto-dismiss after 5 seconds
  - Manual dismiss with close button
  - Click-to-navigate if actionUrl provided
  - Icon based on type
- `ToastContainer` (top-right corner, max 3 toasts)
- Animation: slide-in from right (200ms), fade-out (300ms)
- Integration with NotificationContext:
  - Only show for important events (6 event types):
    - offer_approved → success
    - offer_extended → success
    - interview_scheduled → info
    - sla_warning → warning
    - path_override_requested → info
    - decision_made → info
- Tailwind animation config
- Unit tests (>80% coverage)

**User Experience**:
- Non-blocking (doesn't interrupt workflow)
- Max 3 visible (older toasts removed)
- Clickable for quick navigation

---

## Acceptance Criteria Mapping

| Acceptance Criteria | Primary Task | Supporting Tasks |
|---------------------|--------------|------------------|
| **Scenario 1**: Badge count increments within 1 second | TASK-004 | TASK-002, TASK-003 |
| **Scenario 2**: Toast appears with 5-second auto-dismiss | TASK-005 | TASK-002, TASK-003 |
| **Scenario 3**: Panel shows last 50 notifications, grouped by date | TASK-004 | TASK-001, TASK-003 |
| **Scenario 4**: Mark all as read clears badge and persists | TASK-004 | TASK-001, TASK-003 |

---

## Technical Architecture

### Backend Components

```
┌─────────────────────────────────────┐
│        Notification Table           │
│  (PostgreSQL + Prisma)              │
│  - id, userId, eventType, payload   │
│  - readAt, createdAt                │
└────────────┬────────────────────────┘
             │
             ▼
┌─────────────────────────────────────┐
│     NotificationService             │
│  - createNotification()             │
│  - getUnreadCount()                 │
│  - markAsRead(), markAllAsRead()    │
└────────────┬────────────────────────┘
             │
             ▼
┌─────────────────────────────────────┐
│  NotificationBroadcastService       │
│  - broadcastNotificationToUser()    │
│  - createAndBroadcastNotification() │
└────────────┬────────────────────────┘
             │
             ▼
┌─────────────────────────────────────┐
│        Socket.IO Server             │
│  - User rooms: user:<userId>        │
│  - Event: notification:new          │
│  - Payload: {notification, count}   │
└─────────────────────────────────────┘
```

### Frontend Components

```
┌─────────────────────────────────────┐
│      Socket.IO Client               │
│  (useSocketClient hook)             │
│  - Authenticated connection         │
│  - Reconnection logic               │
└────────────┬────────────────────────┘
             │
             ▼
┌─────────────────────────────────────┐
│    NotificationContext              │
│  (React Context + State)            │
│  - notifications[]                  │
│  - unreadCount                      │
│  - loadNotifications()              │
│  - markAsRead(), markAllAsRead()    │
└───────┬─────────────────────────────┘
        │
        ├────────────────────┬─────────────────┐
        ▼                    ▼                 ▼
┌──────────────┐    ┌──────────────┐   ┌──────────────┐
│  BellIcon +  │    │ ToastContext │   │   Backend    │
│    Panel     │    │   + Toast    │   │  API Routes  │
│ (TASK-004)   │    │  (TASK-005)  │   │ /api/notif*  │
└──────────────┘    └──────────────┘   └──────────────┘
```

---

## Database Schema (TASK-001)

```prisma
model Notification {
  id        String    @id @default(uuid()) @db.Uuid
  userId    String    @db.Uuid
  user      User      @relation("UserNotifications", fields: [userId], references: [id], onDelete: Cascade)
  eventType String    @db.VarChar(100)
  payload   Json      @db.JsonB
  readAt    DateTime?
  createdAt DateTime  @default(now())

  @@index([userId, readAt], name: "notification_user_read_idx")
  @@index([userId, createdAt(sort: Desc)], name: "notification_user_created_idx")
  @@map("notifications")
}
```

**Payload Structure**:
```typescript
{
  title: string;
  message: string;
  entityType: 'application' | 'interview' | 'offer' | 'review';
  entityId: string;
  actionUrl?: string;
}
```

---

## Event Types (9 Total)

| Event Type | Toast Enabled | Toast Type | Example Use Case |
|------------|---------------|------------|------------------|
| application_submitted | ❌ No | - | Candidate submits application |
| review_assigned | ❌ No | - | HR reviewer assigned new application |
| decision_made | ✅ Yes | info | Application approved/rejected |
| interview_scheduled | ✅ Yes | info | Interview slot booked |
| scorecard_submitted | ❌ No | - | Interviewer completes scorecard |
| offer_approved | ✅ Yes | success | Hiring manager approves offer |
| offer_extended | ✅ Yes | success | Offer sent to candidate |
| sla_warning | ✅ Yes | warning | Review deadline approaching |
| path_override_requested | ✅ Yes | info | Fast-track approval needed |

---

## Testing Strategy

### Backend Tests (TASK-001, TASK-002)

**Unit Tests**:
- NotificationService CRUD operations
- User ownership validation
- Pagination logic
- Error handling

**Integration Tests**:
- Socket.IO room joining with JWT
- Notification broadcast to user room
- Multiple connections for same user
- Offline user (notification persists, broadcast fails gracefully)

**Test Coverage Target**: >80% for notification and broadcast services

### Frontend Tests (TASK-003, TASK-004, TASK-005)

**Unit Tests**:
- NotificationContext state updates
- Socket event listener registration
- Optimistic UI updates
- Badge count display logic
- Toast auto-dismiss timer
- Relative timestamp formatting

**Component Tests**:
- BellIcon badge rendering
- NotificationPanel open/close
- Toast click navigation
- Mark all as read action

**Test Coverage Target**: >80% for notification components and contexts

---

## Security Checklist

- [x] **OWASP A01 (Broken Access Control)**:
  - User can only read/mark their own notifications
  - JWT validation before joining Socket.IO room
- [x] **OWASP A07 (Identification Failures)**:
  - Socket.IO connection requires valid JWT
  - Invalid token doesn't join notification room
- [x] **OWASP A09 (Security Logging)**:
  - Log notification creation with userId, eventType
  - Do not log sensitive payload details
- [x] **Data Privacy**:
  - No PII in notification payload (use entity IDs)
  - Cascade delete when user deleted
- [x] **Transport Security**:
  - Use wss:// (secure WebSocket) in production
  - Auth token via httpOnly cookie (preferred) or Bearer token

---

## Performance Considerations

### Backend
- Database indexes on (userId, readAt) and (userId, createdAt DESC)
- Room join is in-memory operation (lightweight)
- Broadcast is fire-and-forget (non-blocking)
- Support multiple connections per user

### Frontend
- Socket connection reused across app (single instance)
- Optimistic updates for perceived performance
- Pagination: load 50 notifications at a time
- Max 3 toasts visible (avoid UI clutter)
- CSS animations (hardware-accelerated)
- Virtualize notification list if >100 items

---

## Accessibility (WCAG 2.1 AA)

### TASK-004 (Bell Badge + Panel)
- Bell button: descriptive aria-label with count
- Badge: aria-live="polite" for screen reader updates
- Panel: role="dialog"
- Keyboard navigation: Tab, Enter, Escape
- Focus management on open/close
- Color contrast ≥4.5:1

### TASK-005 (Toast)
- Toast: role="status" or role="button" if clickable
- aria-live="polite" for announcements
- Close button: descriptive aria-label
- Keyboard support: Tab to close, Enter to activate
- Color contrast ≥4.5:1

---

## Definition of Done (Overall US-003)

- [x] All 5 tasks completed with passing tests
- [x] Socket.IO room per user ID; events scoped to recipient
- [x] Bell badge: count of unread notifications; updates within 1s
- [x] Toast: 5-second auto-dismiss; clickable to navigate
- [x] Notification panel: paginated history (50 per page), grouped by date
- [x] "Mark all as read" action; individual mark-as-read on click
- [x] `notifications` table: `user_id`, `event_type`, `payload` JSONB, `read_at`
- [x] Backend tests >80% coverage
- [x] Frontend tests >80% coverage
- [x] Accessibility: keyboard navigation, ARIA labels
- [x] Security: user ownership validation, JWT authentication
- [x] Performance: optimistic updates, pagination, max 3 toasts

---

## Implementation Order

**Recommended sequence**:

1. **Start with TASK-001** (Backend foundation)
   - Create database schema and service layer
   - Write and validate unit tests
   - Generate Prisma migration

2. **Follow with TASK-002** (Backend real-time)
   - Implement Socket.IO broadcasting
   - Write integration tests
   - Test with Socket.IO client

3. **Move to TASK-003** (Frontend state)
   - Create React context and Socket client
   - Connect to backend WebSocket
   - Implement optimistic updates

4. **Parallel: TASK-004 and TASK-005** (Frontend UI)
   - TASK-004: Bell icon, badge, notification panel
   - TASK-005: Toast system
   - Both depend on TASK-003, can be developed simultaneously

5. **Integration Testing**
   - End-to-end test: notification created → broadcast → badge updates → toast appears
   - Manual testing: verify 1-second update requirement

---

## Next Steps

1. Review this task breakdown with team
2. Confirm effort estimates and priorities
3. Assign tasks to developers
4. Begin implementation with TASK-001
5. Track progress in project management tool

---

**Generated**: 2026-07-28  
**Status**: Ready for Implementation  
**Estimated Completion**: 15 hours (2 days for 1 developer, 1 day for 2 developers)
