---
id: task_007
us_id: us_003
epic: EP-001
title: "Add OAuth Provider Buttons and Handlers"
status: done
layer: frontend
effort: 2h
priority: medium
created: 2026-07-24
completed: 2026-07-24
---

# TASK-007 — Add OAuth Provider Buttons and Handlers

## Context

**User Story**: US-003 — Login with Role-Based Routing, Account Lockout, and SSO  
**Epic**: EP-001 — Candidate Onboarding and Identity  
**Addresses Acceptance Criteria**: Scenario 3 (Google/GitHub SSO)

OAuth buttons redirect users to provider authentication flows. After successful authentication, the backend callback sets the auth cookie and redirects to the appropriate dashboard.

---

## Implementation Steps

### Step 1 — Create OAuth Button Component

Create `frontend/src/components/OAuthButton.tsx`:

```typescript
interface OAuthButtonProps {
  provider: 'google' | 'github';
  onClick: () => void;
}

export function OAuthButton({ provider, onClick }: OAuthButtonProps) {
  const providerConfig = {
    google: {
      name: 'Google',
      icon: (
        <svg className="w-5 h-5" viewBox="0 0 24 24">
          <path
            fill="currentColor"
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
          />
          <path
            fill="currentColor"
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
          />
          <path
            fill="currentColor"
            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
          />
          <path
            fill="currentColor"
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
          />
        </svg>
      ),
    },
    github: {
      name: 'GitHub',
      icon: (
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
        </svg>
      ),
    },
  };

  const config = providerConfig[provider];

  return (
    <button
      type="button"
      onClick={onClick}
      className="oauth-button"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '12px',
        width: '100%',
        padding: '12px 16px',
        border: '1px solid #d1d5db',
        borderRadius: '8px',
        backgroundColor: 'white',
        color: '#374151',
        fontSize: '14px',
        fontWeight: '500',
        cursor: 'pointer',
        transition: 'all 0.2s',
      }}
    >
      {config.icon}
      Continue with {config.name}
    </button>
  );
}
```

### Step 2 — Update Login Page with OAuth Buttons

Add to `frontend/src/app/login/page.tsx`:

```typescript
import { OAuthButton } from '../../components/OAuthButton';

// ... existing imports and component

// Add after the form, before auth-links:
<div className="oauth-divider" style={{ margin: '24px 0', textAlign: 'center' }}>
  <span style={{ backgroundColor: 'white', padding: '0 16px', color: '#9ca3af' }}>
    or continue with
  </span>
</div>

<div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
  <OAuthButton 
    provider="google" 
    onClick={() => window.location.href = getApiUrl('/api/auth/oauth/google')}
  />
  <OAuthButton 
    provider="github" 
    onClick={() => window.location.href = getApiUrl('/api/auth/oauth/github')}
  />
</div>
```

### Step 3 — Handle OAuth Error Query Parameters

Update login page to display OAuth errors:

```typescript
import { useSearchParams } from 'next/navigation';

// In component:
const searchParams = useSearchParams();
const oauthError = searchParams.get('error');

useEffect(() => {
  if (oauthError === 'oauth_failed') {
    setError('OAuth authentication failed. Please try again.');
  }
}, [oauthError]);
```

---

## Definition of Done

- [ ] `OAuthButton` component created with Google and GitHub styling
- [ ] OAuth buttons added to login page
- [ ] Buttons redirect to `/api/auth/oauth/{provider}` endpoints
- [ ] OAuth errors from query parameters displayed to user
- [ ] Visual divider between email/password and OAuth options

## Traceability

- **US**: US-003 — Login with Role-Based Routing, Account Lockout, and SSO
- **Epic**: EP-001 — Candidate Onboarding and Identity
- **AC**: Scenario 3
