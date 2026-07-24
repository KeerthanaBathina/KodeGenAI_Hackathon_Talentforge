---
id: task_005
us_id: us_003
epic: EP-001
title: "Implement OAuth Providers (Google & GitHub) Integration"
status: done
layer: backend
effort: 4h
priority: high
created: 2026-07-24
completed: 2026-07-24
---

# TASK-005 — Implement OAuth Providers (Google & GitHub) Integration

## Context

**User Story**: US-003 — Login with Role-Based Routing, Account Lockout, and SSO  
**Epic**: EP-001 — Candidate Onboarding and Identity  
**Addresses Acceptance Criteria**: Scenario 3 (Google/GitHub SSO creates or links accounts)

OAuth integration allows users to authenticate via Google or GitHub. New accounts are auto-created with active status; existing accounts are linked.

---

## Objective

Implement OAuth 2.0 flows for Google and GitHub that:
- Redirect users to provider authentication page
- Handle callback with authorization code
- Exchange code for access token and user profile
- Create new account or link existing account by email
- Issue JWT and redirect to appropriate dashboard

---

## Implementation Steps

### Step 1 — Configure OAuth Providers

Add to `backend/.env`:

```env
# Google OAuth
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_REDIRECT_URI=http://localhost:3000/api/auth/oauth/google/callback

# GitHub OAuth
GITHUB_CLIENT_ID=your-github-client-id
GITHUB_CLIENT_SECRET=your-github-client-secret
GITHUB_REDIRECT_URI=http://localhost:3000/api/auth/oauth/github/callback

# Frontend URL for post-OAuth redirect
FRONTEND_URL=http://localhost:3001
```

### Step 2 — Install OAuth Libraries

```bash
cd backend
npm install axios
```

### Step 3 — Create OAuth Service

Create `backend/src/services/oauthService.ts`:

```typescript
import axios from 'axios';
import { prisma } from '../db/prisma';
import { createAuditEvent } from './auditService';
import logger from '../utils/logger';

export interface OAuthProfile {
  provider: 'google' | 'github';
  providerId: string;
  email: string;
  name?: string;
  avatarUrl?: string;
}

export async function exchangeGoogleCode(code: string): Promise<OAuthProfile> {
  // Exchange code for access token
  const tokenResponse = await axios.post('https://oauth2.googleapis.com/token', {
    code,
    client_id: process.env.GOOGLE_CLIENT_ID,
    client_secret: process.env.GOOGLE_CLIENT_SECRET,
    redirect_uri: process.env.GOOGLE_REDIRECT_URI,
    grant_type: 'authorization_code',
  });

  const { access_token } = tokenResponse.data;

  // Fetch user profile
  const profileResponse = await axios.get('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${access_token}` },
  });

  return {
    provider: 'google',
    providerId: profileResponse.data.id,
    email: profileResponse.data.email,
    name: profileResponse.data.name,
    avatarUrl: profileResponse.data.picture,
  };
}

export async function exchangeGitHubCode(code: string): Promise<OAuthProfile> {
  // Exchange code for access token
  const tokenResponse = await axios.post(
    'https://github.com/login/oauth/access_token',
    {
      code,
      client_id: process.env.GITHUB_CLIENT_ID,
      client_secret: process.env.GITHUB_CLIENT_SECRET,
      redirect_uri: process.env.GITHUB_REDIRECT_URI,
    },
    { headers: { Accept: 'application/json' } }
  );

  const { access_token } = tokenResponse.data;

  // Fetch user profile
  const profileResponse = await axios.get('https://api.github.com/user', {
    headers: { Authorization: `Bearer ${access_token}` },
  });

  // GitHub might not provide email in main profile
  let email = profileResponse.data.email;
  if (!email) {
    const emailResponse = await axios.get('https://api.github.com/user/emails', {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    const primaryEmail = emailResponse.data.find((e: any) => e.primary);
    email = primaryEmail?.email || emailResponse.data[0]?.email;
  }

  return {
    provider: 'github',
    providerId: String(profileResponse.data.id),
    email,
    name: profileResponse.data.name || profileResponse.data.login,
    avatarUrl: profileResponse.data.avatar_url,
  };
}

export async function findOrCreateOAuthUser(profile: OAuthProfile, ipAddress?: string) {
  const { provider, providerId, email, name, avatarUrl } = profile;

  // Check if user exists by email
  let user = await prisma.candidate.findUnique({
    where: { email: email.toLowerCase() },
    select: {
      id: true,
      email: true,
      status: true,
      candidatePublicId: true,
    },
  });

  if (user) {
    // Link OAuth provider if not already linked
    // TODO: Add oauth_providers table to track provider linkage
    
    await createAuditEvent({
      eventType: 'oauth_login',
      userId: user.id,
      ipAddress,
      metadata: { provider, email, action: 'linked_existing_account' },
    });

    logger.info({ userId: user.id, provider }, 'OAuth login - existing account');

    return {
      user,
      isNewUser: false,
      needsOnboarding: user.status === 'pending_verification',
    };
  }

  // Create new user
  user = await prisma.candidate.create({
    data: {
      email: email.toLowerCase(),
      status: 'active', // OAuth users are auto-verified
      // Store OAuth metadata
      // TODO: Add fields or separate table for OAuth data
    },
    select: {
      id: true,
      email: true,
      status: true,
      candidatePublicId: true,
    },
  });

  await createAuditEvent({
    eventType: 'oauth_signup',
    userId: user.id,
    ipAddress,
    metadata: { provider, email, action: 'created_new_account' },
  });

  logger.info({ userId: user.id, provider }, 'OAuth signup - new account created');

  return {
    user,
    isNewUser: true,
    needsOnboarding: true,
  };
}
```

### Step 4 — Create OAuth Routes

Add to `backend/src/routes/auth.ts`:

```typescript
import { exchangeGoogleCode, exchangeGitHubCode, findOrCreateOAuthUser } from '../services/oauthService';
import { JwtService } from '../services/jwtService';

// Google OAuth initiation
router.get('/oauth/google', (req, res) => {
  const googleAuthUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${process.env.GOOGLE_CLIENT_ID}&redirect_uri=${encodeURIComponent(process.env.GOOGLE_REDIRECT_URI!)}&response_type=code&scope=openid%20email%20profile`;
  
  res.redirect(googleAuthUrl);
});

// Google OAuth callback
router.get('/oauth/google/callback', async (req, res) => {
  const { code, error } = req.query;

  if (error) {
    logger.warn({ error }, 'Google OAuth error');
    return res.redirect(`${process.env.FRONTEND_URL}/login?error=oauth_failed`);
  }

  if (!code || typeof code !== 'string') {
    return res.redirect(`${process.env.FRONTEND_URL}/login?error=missing_code`);
  }

  try {
    const profile = await exchangeGoogleCode(code);
    const { user, isNewUser, needsOnboarding } = await findOrCreateOAuthUser(
      profile,
      req.ip || req.socket.remoteAddress
    );

    // Issue JWT
    const { token, options } = JwtService.createAuthCookie({
      sub: user.id,
      role: 'candidate',
      candidateId: user.candidatePublicId || undefined,
    });

    res.cookie('auth_token', token, options);

    // Redirect based on user state
    const redirectUrl = needsOnboarding
      ? `${process.env.FRONTEND_URL}/onboarding/profile`
      : `${process.env.FRONTEND_URL}/candidate/applications`;

    res.redirect(redirectUrl);
  } catch (error) {
    logger.error({ error }, 'Google OAuth callback failed');
    res.redirect(`${process.env.FRONTEND_URL}/login?error=oauth_failed`);
  }
});

// GitHub OAuth initiation
router.get('/oauth/github', (req, res) => {
  const githubAuthUrl = `https://github.com/login/oauth/authorize?client_id=${process.env.GITHUB_CLIENT_ID}&redirect_uri=${encodeURIComponent(process.env.GITHUB_REDIRECT_URI!)}&scope=user:email`;
  
  res.redirect(githubAuthUrl);
});

// GitHub OAuth callback
router.get('/oauth/github/callback', async (req, res) => {
  const { code, error } = req.query;

  if (error) {
    logger.warn({ error }, 'GitHub OAuth error');
    return res.redirect(`${process.env.FRONTEND_URL}/login?error=oauth_failed`);
  }

  if (!code || typeof code !== 'string') {
    return res.redirect(`${process.env.FRONTEND_URL}/login?error=missing_code`);
  }

  try {
    const profile = await exchangeGitHubCode(code);
    const { user, isNewUser, needsOnboarding } = await findOrCreateOAuthUser(
      profile,
      req.ip || req.socket.remoteAddress
    );

    // Issue JWT
    const { token, options } = JwtService.createAuthCookie({
      sub: user.id,
      role: 'candidate',
      candidateId: user.candidatePublicId || undefined,
    });

    res.cookie('auth_token', token, options);

    // Redirect based on user state
    const redirectUrl = needsOnboarding
      ? `${process.env.FRONTEND_URL}/onboarding/profile`
      : `${process.env.FRONTEND_URL}/candidate/applications`;

    res.redirect(redirectUrl);
  } catch (error) {
    logger.error({ error }, 'GitHub OAuth callback failed');
    res.redirect(`${process.env.FRONTEND_URL}/login?error=oauth_failed`);
  }
});
```

### Step 5 — OAuth Provider Setup

**Google Cloud Console**:
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create or select a project
3. Enable Google+ API
4. Create OAuth 2.0 credentials
5. Add authorized redirect URI: `http://localhost:3000/api/auth/oauth/google/callback`
6. Copy Client ID and Client Secret to `.env`

**GitHub Settings**:
1. Go to [GitHub Developer Settings](https://github.com/settings/developers)
2. Create new OAuth App
3. Set Authorization callback URL: `http://localhost:3000/api/auth/oauth/github/callback`
4. Copy Client ID and Client Secret to `.env`

---

## Definition of Done

- [ ] Google OAuth flow implemented (initiation + callback)
- [ ] GitHub OAuth flow implemented (initiation + callback)
- [ ] New OAuth users auto-created with `status = "active"`
- [ ] Existing users linked to OAuth provider
- [ ] JWT issued on successful OAuth authentication
- [ ] OAuth events logged to `audit_events`
- [ ] OAuth credentials configured in `.env`
- [ ] Integration tests cover OAuth flows

## Traceability

- **US**: US-003 — Login with Role-Based Routing, Account Lockout, and SSO
- **Epic**: EP-001 — Candidate Onboarding and Identity
- **AC**: Scenario 3
