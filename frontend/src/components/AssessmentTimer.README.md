# AssessmentTimer Component

Server-synchronized countdown timer for assessment sessions with network resilience and accessibility.

## Features

- ⏱️ **Server-authoritative time tracking** - Fetches remaining time from backend API on mount
- 💓 **Automatic heartbeat** - Sends heartbeat every 30 seconds (only when tab visible)
- 🔄 **Network resilience** - Handles offline/online events, syncs on reconnect
- 🎨 **Visual indicators** - Color coding (normal/warning/critical) and status icons
- ♿ **Accessibility** - ARIA live regions and screen reader announcements at milestones
- 🚨 **Expiry modal** - User-friendly modal when session expires

## Usage

```tsx
import AssessmentTimer from '@/components/AssessmentTimer';

function AssessmentPage({ sessionId, sessionToken }: Props) {
    const handleSessionExpiry = () => {
        // Redirect to completion page or show message
        router.push('/assessment/expired');
    };

    return (
        <div>
            <AssessmentTimer
                sessionId={sessionId}
                sessionToken={sessionToken}
                onExpiry={handleSessionExpiry}
                showWarnings={true}
                autoHide={false}
            />
            {/* Rest of assessment UI */}
        </div>
    );
}
```

## Props

| Prop | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `sessionId` | `string` | Yes | - | Assessment session UUID |
| `sessionToken` | `string` | Yes | - | Authentication token for API calls |
| `onExpiry` | `() => void` | No | - | Callback when session expires |
| `showWarnings` | `boolean` | No | `true` | Show warning icon when < 5 minutes |
| `autoHide` | `boolean` | No | `false` | Hide timer during reconnection |

## Color Coding

- **Normal** (> 5 min): Gray text (#1a1a1a)
- **Warning** (≤ 5 min): Amber text (#f59e0b)
- **Critical** (≤ 2 min): Red text (#dc2626) + pulse animation

## Milestones

Accessibility announcements at:
- 10 minutes remaining
- 5 minutes remaining (warning)
- 2 minutes remaining (critical)
- 1 minute remaining (critical)

## Network Behavior

- **Online → Offline**: Shows "Reconnecting..." status
- **Offline → Online**: Immediately syncs with server to get accurate time
- **Tab Hidden**: Pauses heartbeat, countdown continues
- **Tab Visible**: Resumes heartbeat, syncs with server

## API Integration

Uses the following endpoints from `backend/src/routes/sessionTimer.ts`:

- `GET /api/sessions/:sessionId/timer` - Fetch remaining time
- `POST /api/sessions/:sessionId/heartbeat` - Update activity

See [sessionTimer.ts](../lib/api/sessionTimer.ts) for API service details.

## Implementation Details

### Intervals
- **Countdown**: 1 second (client-side ticks)
- **Heartbeat**: 30 seconds (POST to server)
- **Server Sync**: 5 minutes (GET from server to correct drift)

### Error Handling
- `401 Unauthorized` → Authentication error
- `404 Not Found` → Timer not found
- `410 Gone` → Session expired (shows modal)
- `429 Too Many Requests` → Rate limited (backs off)

### Clock Drift Mitigation
- Server sync every 5 minutes adjusts client countdown
- Heartbeat response optionally updates remaining time
- Page visibility sync prevents drift during background operation

## Testing

### Unit Tests (Manual Validation)
```typescript
// formatTime utility
expect(formatTime(0)).toBe('00:00');
expect(formatTime(59)).toBe('00:59');
expect(formatTime(60)).toBe('01:00');
expect(formatTime(3661)).toBe('61:01');

// getColorClass utility
expect(getColorClass(600)).toContain('text-gray-900'); // > 5 min
expect(getColorClass(300)).toContain('text-amber-600'); // = 5 min
expect(getColorClass(120)).toContain('text-red-600'); // = 2 min
```

### Integration Tests
1. Mount component → Verify GET `/timer` called
2. Wait 30 seconds → Verify POST `/heartbeat` called
3. Go offline → Verify "Reconnecting..." status
4. Go online → Verify GET `/timer` called
5. Hide tab → Verify heartbeat paused
6. Show tab → Verify GET `/timer` called

## Files

- `frontend/src/components/AssessmentTimer.tsx` - Main component (420 lines)
- `frontend/src/lib/api/sessionTimer.ts` - API service (149 lines)
- `frontend/src/components/AssessmentTimer.README.md` - This documentation

## Dependencies

- React 18+ (hooks: `useState`, `useEffect`, `useRef`, `useCallback`)
- Tailwind CSS (utility classes for styling)
- Backend session timer API (TASK-002 endpoints)

## Related Tasks

- TASK-001: Server-Side Session Timer with Redis Storage
- TASK-002: Session Timer API Endpoints
- TASK-003: Frontend Timer Component with Server Sync (this task)
