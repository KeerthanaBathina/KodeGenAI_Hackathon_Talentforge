# Interview Actions Components

Frontend UI components for managing interview lifecycle operations (cancel, no-show, reschedule).

## Components

### InterviewActions (Main Component)

Central component that orchestrates interview lifecycle management. Displays state-appropriate action buttons and handles dialog orchestration.

**Props:**
- `interview: InterviewDetails` - Current interview data
- `onSuccess?: () => void` - Callback after successful action
- `onError?: (message: string) => void` - Callback on error
- `showStateBadge?: boolean` - Show/hide state badge (default: true)

**Usage:**
```tsx
import { InterviewActions } from '@/components/interviews';
import { useToast } from '@/hooks/useToast';

function InterviewManagement({ interview }: { interview: InterviewDetails }) {
    const { showToast } = useToast();

    const handleSuccess = () => {
        showToast('Interview updated successfully', 'success');
        // Optionally refresh data
    };

    const handleError = (message: string) => {
        showToast(message, 'error');
    };

    return (
        <InterviewActions
            interview={interview}
            onSuccess={handleSuccess}
            onError={handleError}
        />
    );
}
```

### InterviewStateBadge

Visual badge component displaying interview state with color coding.

**Props:**
- `state: InterviewState` - One of: scheduled, completed, cancelled, no_show, rescheduled

**Color Coding:**
- **Scheduled** - Blue (#1976d2)
- **Completed** - Green (#388e3c)
- **Cancelled** - Red (#d32f2f)
- **No Show** - Orange (#f57c00)
- **Rescheduled** - Purple (#7b1fa2)

### CancelDialog

Confirmation dialog for interview cancellation with optional reason.

**Features:**
- Warning message about irreversible action
- Optional reason textarea
- Escape key to close
- Loading state management

### NoShowDialog

Dialog for recording candidate no-show with mandatory reason.

**Features:**
- Warning banner about no-show count increment
- Mandatory reason validation
- Disabled confirm button until reason provided
- Loading state management

### RescheduleModal

Full-featured modal for rescheduling interviews with validation.

**Features:**
- DateTime picker with future date validation
- Duration input (15-480 minutes)
- Meeting link or physical location (one required)
- Optional reason textarea
- Special banner for no-show reschedules
- Loading state management

**Validation Rules:**
1. New scheduled time must be in the future
2. Duration between 15-480 minutes
3. Either meeting link OR location must be provided

## API Functions

Located in `src/lib/api/interviews.ts`:

### transitionInterviewState
```typescript
transitionInterviewState(
    interviewId: string,
    newState: InterviewState,
    reason?: string
): Promise<TransitionStateResponse>
```

### recordNoShow
```typescript
recordNoShow(
    interviewId: string,
    reason: string
): Promise<RecordNoShowResponse>
```

### rescheduleInterview
```typescript
rescheduleInterview(
    interviewId: string,
    data: RescheduleData
): Promise<RescheduleResponse>
```

## State Transition Rules

| Current State | Cancel | No-Show | Reschedule |
|--------------|--------|---------|------------|
| scheduled    | ✅     | ✅      | ✅         |
| completed    | ❌     | ❌      | ❌         |
| cancelled    | ❌     | ❌      | ❌         |
| no_show      | ❌     | ❌      | ✅         |
| rescheduled  | ❌     | ❌      | ❌         |

## UI Components (Primitives)

All primitive components are located in `src/components/ui/`:

- **Button** - Primary, secondary, danger, warning variants
- **Dialog** - Modal with backdrop, escape key support
- **Input** - Text input with error state
- **Textarea** - Multiline text with error state
- **DateTimePicker** - HTML5 datetime-local input wrapper

## Testing

All components have comprehensive tests in `__tests__/` directory:

- `InterviewActions.test.tsx` - Main component integration tests
- `InterviewStateBadge.test.tsx` - Badge rendering tests
- `CancelDialog.test.tsx` - Cancel dialog behavior tests
- `NoShowDialog.test.tsx` - No-show dialog validation tests
- `RescheduleModal.test.tsx` - Reschedule modal validation tests

Run tests:
```bash
cd frontend
npm test -- src/components/interviews
```

## Types

Located in `src/types/interview.ts`:

```typescript
type InterviewState = 'scheduled' | 'completed' | 'cancelled' | 'no_show' | 'rescheduled';

interface InterviewDetails {
    id: string;
    applicationId: string;
    type: InterviewStageType;
    state: InterviewState;
    scheduledAt: string;
    endAt?: string;
    timezone: string;
    duration?: number;
    meetingLink?: string;
    location?: string;
    cancelReason?: string;
    panelMembers: string[];
    panelistConfirmations?: Array<{...}>;
}

interface RescheduleData {
    newScheduledAt: string;
    newEndAt?: string;
    newDuration?: number;
    newMeetingLink?: string;
    newLocation?: string;
    reason?: string;
}
```

## Accessibility

- All buttons have `aria-label` attributes
- Dialog closes with Escape key
- Form labels properly associated with inputs
- Error messages linked to form fields
- Keyboard navigation supported throughout

## Integration Example

```tsx
'use client';

import { useState, useEffect } from 'react';
import { InterviewActions } from '@/components/interviews';
import { InterviewDetails } from '@/types/interview';
import { useToast } from '@/hooks/useToast';

export default function InterviewDetailsPage({ 
    params 
}: { 
    params: { id: string } 
}) {
    const [interview, setInterview] = useState<InterviewDetails | null>(null);
    const { showToast } = useToast();

    useEffect(() => {
        fetchInterviewDetails(params.id).then(setInterview);
    }, [params.id]);

    const handleSuccess = () => {
        showToast('Interview updated successfully', 'success');
        // Refresh interview data
        fetchInterviewDetails(params.id).then(setInterview);
    };

    const handleError = (message: string) => {
        showToast(message, 'error');
    };

    if (!interview) return <div>Loading...</div>;

    return (
        <div>
            <h1>Interview Management</h1>
            <InterviewActions
                interview={interview}
                onSuccess={handleSuccess}
                onError={handleError}
            />
        </div>
    );
}
```

## Notes

- All API calls use `credentials: 'include'` for authentication
- Error handling follows existing API client patterns
- Components use inline styles for simplicity (no external CSS framework)
- Toast notifications recommended for success/error feedback
