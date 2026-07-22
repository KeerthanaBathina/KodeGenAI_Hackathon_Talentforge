---
id: task_004
us_id: us_002
epic: EP-DATA
title: "Implement Email Template Token Renderer with Unit Tests and Template Seed Data"
status: not-started
layer: backend
effort: 3h
priority: high
created: 2026-07-22
---

# TASK-004 — Implement Email Template Token Renderer with Unit Tests and Template Seed Data

## Context

**User Story**: US-002 — Configuration and Policy Tables — Scoring Thresholds, Reason Codes, and Email Templates  
**Epic**: EP-DATA — Data Foundation  
**Addresses Acceptance Criteria**: Scenario 3 (`offer_extended` template with `{{candidate_name}}` and `{{role_title}}` tokens; rendering replaces both tokens; no raw `{{...}}` strings remain in output)

The `templates` table was defined in EP-DATA / US-001 with columns for `bodyHtml`, `bodyText`, `type`, `locale`, `version`, and `subject`. FR-057 requires 11 named template types covering the full candidate journey. This task adds a typed `renderTemplate` utility that resolves `{{token}}` placeholders and seeds the `offer_extended` template (plus a representative sample of the other 10 types) so downstream feature epics can render email content without a code deploy.

---

## Objective

Create `backend/src/services/templateRenderer.ts` with a `renderTemplate(template, tokens)` function, write ≥ 8 unit tests covering happy-path and edge cases, extend `prisma/seed.ts` to upsert 11 standard templates, and verify that a live render of the `offer_extended` template produces output with no unresolved `{{...}}` placeholders.

---

## Technical Specifications

| Attribute | Value |
|-----------|-------|
| Token syntax | `{{snake_case_key}}` — double curly braces, lowercase, underscore-separated |
| Token match regex | `/\{\{(\w+)\}\}/g` |
| Unknown token behaviour | Leave unresolved — renders as empty string with a logged warning |
| PII safety | `renderTemplate` is pure (no I/O) — caller is responsible for PII logging controls |
| Template types seeded | `offer`, `rejection`, `screening_invite`, `interview_invite`, `assessment_invite`, `withdrawal_ack`, `general` (maps to TemplateType enum) |

---

## Implementation Steps

### Step 1 — Create the token renderer service

Create `backend/src/services/templateRenderer.ts`:

```typescript
import logger from '../utils/logger';

/**
 * Token data map — key is the snake_case token name (without curly braces),
 * value is the resolved string to substitute.
 *
 * Example:
 *   { candidate_name: 'Jane Smith', role_title: 'Senior Engineer' }
 */
export type TokenMap = Readonly<Record<string, string>>;

export interface RenderedTemplate {
  subject: string;
  bodyHtml: string;
  bodyText: string;
}

const TOKEN_REGEX = /\{\{(\w+)\}\}/g;

/**
 * Replaces all `{{token_key}}` placeholders in the template strings with
 * the corresponding values from the token map.
 *
 * - Unknown tokens are replaced with an empty string and logged as warnings.
 * - No HTML escaping is performed here; callers must ensure token values
 *   are safe before passing them (sanitise at the boundary, not here).
 * - This function is pure — no database or network calls.
 *
 * @param template - Raw template strings from the database
 * @param tokens   - Key-value map of token substitutions
 */
export function renderTemplate(
  template: { subject: string; bodyHtml: string; bodyText: string },
  tokens: TokenMap,
): RenderedTemplate {
  const resolve = (text: string): string =>
    text.replace(TOKEN_REGEX, (match, key: string) => {
      const value = tokens[key];
      if (value === undefined) {
        logger.warn({ token: key }, 'Template token not provided — substituting empty string');
        return '';
      }
      return value;
    });

  return {
    subject: resolve(template.subject),
    bodyHtml: resolve(template.bodyHtml),
    bodyText: resolve(template.bodyText),
  };
}

/**
 * Validates that all tokens present in a template body are covered by the
 * provided token map. Returns an array of unresolved token names.
 * Useful for admin preview validation (FR-057).
 */
export function findMissingTokens(
  template: { subject: string; bodyHtml: string; bodyText: string },
  tokens: TokenMap,
): string[] {
  const missing = new Set<string>();
  const allText = `${template.subject}\n${template.bodyHtml}\n${template.bodyText}`;

  for (const match of allText.matchAll(TOKEN_REGEX)) {
    const key = match[1]!;
    if (!(key in tokens)) {
      missing.add(key);
    }
  }

  return Array.from(missing).sort();
}
```

### Step 2 — Write unit tests for the renderer

Create `backend/src/services/__tests__/templateRenderer.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';

// Mock the logger to suppress warning output in tests
vi.mock('../../utils/logger', () => ({
  default: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { renderTemplate, findMissingTokens } from '../templateRenderer';

const offerTemplate = {
  subject: 'Congratulations {{candidate_name}} — Offer for {{role_title}}',
  bodyHtml: '<p>Dear {{candidate_name}},</p><p>We are pleased to offer you the role of {{role_title}}.</p>',
  bodyText: 'Dear {{candidate_name}}, We are pleased to offer you the role of {{role_title}}.',
};

const tokens = { candidate_name: 'Jane Smith', role_title: 'Senior Engineer' };

describe('renderTemplate', () => {
  it('replaces all tokens in subject', () => {
    const { subject } = renderTemplate(offerTemplate, tokens);
    expect(subject).toBe('Congratulations Jane Smith — Offer for Senior Engineer');
  });

  it('replaces all tokens in bodyHtml', () => {
    const { bodyHtml } = renderTemplate(offerTemplate, tokens);
    expect(bodyHtml).toContain('Dear Jane Smith');
    expect(bodyHtml).toContain('role of Senior Engineer');
  });

  it('replaces all tokens in bodyText', () => {
    const { bodyText } = renderTemplate(offerTemplate, tokens);
    expect(bodyText).not.toMatch(/\{\{.*?\}\}/);
  });

  it('leaves no raw {{...}} tokens in any field when all tokens provided', () => {
    const result = renderTemplate(offerTemplate, tokens);
    const allText = `${result.subject} ${result.bodyHtml} ${result.bodyText}`;
    expect(allText).not.toMatch(/\{\{.*?\}\}/);
  });

  it('substitutes empty string for unknown tokens', () => {
    const { subject } = renderTemplate(
      { subject: 'Hello {{unknown_token}}', bodyHtml: '', bodyText: '' },
      {},
    );
    expect(subject).toBe('Hello ');
    expect(subject).not.toContain('{{');
  });

  it('handles a template with no tokens unchanged', () => {
    const plain = { subject: 'No tokens here', bodyHtml: '<p>Plain</p>', bodyText: 'Plain' };
    const result = renderTemplate(plain, tokens);
    expect(result.subject).toBe('No tokens here');
  });

  it('handles the same token appearing multiple times', () => {
    const tmpl = {
      subject: '{{name}} — re: {{name}}',
      bodyHtml: '{{name}} {{name}}',
      bodyText: '{{name}}',
    };
    const result = renderTemplate(tmpl, { name: 'Alice' });
    expect(result.subject).toBe('Alice — re: Alice');
    expect(result.bodyHtml).toBe('Alice Alice');
  });

  it('is case-sensitive: {{Candidate_Name}} is not resolved by candidate_name key', () => {
    const tmpl = { subject: '{{Candidate_Name}}', bodyHtml: '', bodyText: '' };
    const { subject } = renderTemplate(tmpl, { candidate_name: 'Bob' });
    // Unknown token → empty string
    expect(subject).toBe('');
  });
});

describe('findMissingTokens', () => {
  it('returns empty array when all tokens are provided', () => {
    expect(findMissingTokens(offerTemplate, tokens)).toEqual([]);
  });

  it('returns sorted list of missing token names', () => {
    const missing = findMissingTokens(offerTemplate, { candidate_name: 'Alice' });
    expect(missing).toEqual(['role_title']);
  });

  it('returns multiple missing tokens', () => {
    const missing = findMissingTokens(offerTemplate, {});
    expect(missing).toEqual(['candidate_name', 'role_title']);
  });
});
```

### Step 3 — Seed standard email templates

Append to `backend/prisma/seed.ts`:

```typescript
const EMAIL_TEMPLATES: Array<{
  name: string;
  type: string;
  locale: string;
  version: number;
  subject: string;
  bodyHtml: string;
  bodyText: string;
}> = [
  {
    name: 'Registration Welcome',
    type: 'general',
    locale: 'en',
    version: 1,
    subject: 'Welcome to {{platform_name}}, {{candidate_name}}!',
    bodyHtml: '<p>Hi {{candidate_name}},</p><p>Welcome to {{platform_name}}. Your account is ready.</p>',
    bodyText: 'Hi {{candidate_name}}, Welcome to {{platform_name}}. Your account is ready.',
  },
  {
    name: 'Application Confirmation',
    type: 'general',
    locale: 'en',
    version: 1,
    subject: 'Application received — {{role_title}}',
    bodyHtml: '<p>Hi {{candidate_name}},</p><p>We have received your application for <strong>{{role_title}}</strong>.</p>',
    bodyText: 'Hi {{candidate_name}}, We have received your application for {{role_title}}.',
  },
  {
    name: 'Screening Complete',
    type: 'screening_invite',
    locale: 'en',
    version: 1,
    subject: 'Your application for {{role_title}} has been reviewed',
    bodyHtml: '<p>Hi {{candidate_name}},</p><p>Your application for {{role_title}} has completed initial screening. We will be in touch shortly.</p>',
    bodyText: 'Hi {{candidate_name}}, Your application for {{role_title}} has completed initial screening.',
  },
  {
    name: 'Rejection',
    type: 'rejection',
    locale: 'en',
    version: 1,
    subject: 'Update on your application — {{role_title}}',
    bodyHtml: '<p>Dear {{candidate_name}},</p><p>Thank you for applying for {{role_title}}. After careful consideration, we will not be moving forward with your application at this time.</p>',
    bodyText: 'Dear {{candidate_name}}, Thank you for applying for {{role_title}}. We will not be moving forward with your application at this time.',
  },
  {
    name: 'Shortlist Notification',
    type: 'general',
    locale: 'en',
    version: 1,
    subject: 'Congratulations — you have been shortlisted for {{role_title}}',
    bodyHtml: '<p>Dear {{candidate_name}},</p><p>We are pleased to inform you that you have been shortlisted for the {{role_title}} position.</p>',
    bodyText: 'Dear {{candidate_name}}, You have been shortlisted for {{role_title}}.',
  },
  {
    name: 'Aptitude Test Invite',
    type: 'assessment_invite',
    locale: 'en',
    version: 1,
    subject: 'Action required — aptitude assessment for {{role_title}}',
    bodyHtml: '<p>Hi {{candidate_name}},</p><p>Please complete your aptitude assessment by {{assessment_deadline}}. Access your test here: <a href="{{assessment_url}}">Start assessment</a></p>',
    bodyText: 'Hi {{candidate_name}}, Please complete your aptitude assessment by {{assessment_deadline}}. URL: {{assessment_url}}',
  },
  {
    name: 'Technical Interview Invite',
    type: 'interview_invite',
    locale: 'en',
    version: 1,
    subject: 'Interview scheduled — {{role_title}} on {{interview_date}}',
    bodyHtml: '<p>Hi {{candidate_name}},</p><p>Your technical interview for {{role_title}} is scheduled for {{interview_date}} at {{interview_time}} ({{interview_timezone}}).</p>',
    bodyText: 'Hi {{candidate_name}}, Interview for {{role_title}} on {{interview_date}} at {{interview_time}} ({{interview_timezone}}).',
  },
  {
    name: 'Interview Reminder',
    type: 'interview_invite',
    locale: 'en',
    version: 2,
    subject: 'Reminder — interview tomorrow for {{role_title}}',
    bodyHtml: '<p>Hi {{candidate_name}},</p><p>This is a reminder that your interview for {{role_title}} is tomorrow at {{interview_time}}.</p>',
    bodyText: 'Hi {{candidate_name}}, Reminder: interview for {{role_title}} tomorrow at {{interview_time}}.',
  },
  {
    name: 'Offer Extended',
    type: 'offer',
    locale: 'en',
    version: 1,
    subject: 'Congratulations {{candidate_name}} — Offer for {{role_title}}',
    bodyHtml: '<p>Dear {{candidate_name}},</p><p>We are delighted to offer you the position of <strong>{{role_title}}</strong>. Please find your offer letter attached.</p><p>Offer expires: {{offer_expiry_date}}</p>',
    bodyText: 'Dear {{candidate_name}}, We are delighted to offer you the position of {{role_title}}. Offer expires: {{offer_expiry_date}}.',
  },
  {
    name: 'Final Rejection',
    type: 'rejection',
    locale: 'en',
    version: 2,
    subject: 'Final update on your application — {{role_title}}',
    bodyHtml: '<p>Dear {{candidate_name}},</p><p>Thank you for your time throughout the interview process for {{role_title}}. We have decided not to proceed at this stage.</p>',
    bodyText: 'Dear {{candidate_name}}, Thank you for your time. We have decided not to proceed for {{role_title}}.',
  },
  {
    name: 'Withdrawal Acknowledgement',
    type: 'withdrawal_ack',
    locale: 'en',
    version: 1,
    subject: 'Application withdrawal confirmed — {{role_title}}',
    bodyHtml: '<p>Hi {{candidate_name}},</p><p>We have processed your request to withdraw your application for {{role_title}}. We wish you the best in your search.</p>',
    bodyText: 'Hi {{candidate_name}}, Your withdrawal for {{role_title}} has been confirmed.',
  },
];

async function seedEmailTemplates(): Promise<void> {
  console.log('Seeding email templates ...');
  let upserted = 0;

  for (const tmpl of EMAIL_TEMPLATES) {
    await prisma.template.upsert({
      where: {
        type_locale_version: {
          type: tmpl.type as import('@prisma/client').TemplateType,
          locale: tmpl.locale,
          version: tmpl.version,
        },
      },
      update: { name: tmpl.name, subject: tmpl.subject, bodyHtml: tmpl.bodyHtml, bodyText: tmpl.bodyText, active: true },
      create: { ...tmpl, type: tmpl.type as import('@prisma/client').TemplateType, active: true },
    });
    upserted++;
  }

  console.log(`  ${upserted} email templates upserted.`);
}
```

Update `main()` in `seed.ts`:

```typescript
async function main(): Promise<void> {
  await seedReasonCodes();
  await seedApprovalPolicies();
  await seedEmailTemplates();
}
```

---

## Validation

| Check | Method | Expected Result |
|-------|--------|-----------------|
| Renderer replaces `{{candidate_name}}` | Unit test | `Jane Smith` in output |
| Renderer replaces `{{role_title}}` | Unit test | `Senior Engineer` in output |
| No raw `{{...}}` in rendered output | Unit test | Regex `/\{\{.*?\}\}/` does not match |
| Unknown token → empty string | Unit test | `'Hello '` (not `'Hello {{unknown_token}}'`) |
| `findMissingTokens` detects gaps | Unit test | Returns `['role_title']` |
| Seed upserts 11 templates | `npx prisma db seed` | `11 email templates upserted.` |
| `offer_extended` template exists | `SELECT * FROM templates WHERE type = 'offer'` | Row present with correct tokens in body |
| `npm test` | CLI | All 11 unit tests green |
| `npm run type-check` | CLI | Exit 0 |

---

## Dependencies

- **EP-DATA / US-001 / TASK-001** — `templates` table must exist with `@@unique([type, locale, version])`
- **EP-DATA / US-002 / TASK-002** — `seed.ts` and `tsx` dev dependency must be set up

## Security Constraints

- **OWASP A03 (Injection)**: Token values are plain strings and are NOT HTML-escaped inside `renderTemplate`. The function is intentionally pure. **The caller (email service)** must sanitise or escape token values before passing them if there is any risk they contain user-supplied content. See EP-008 (Communication Service) for the sanitisation boundary.
- **OWASP A09 (Security Logging and Monitoring Failures)**: The logger warning for unknown tokens uses structured logging (`{ token: key }`) — the token name is logged, not the template body or the resolved value. This prevents accidentally logging PII that was passed as a token value.
- Template `bodyHtml` fields are stored as raw HTML. Admin access to the template editor must be restricted to the `admin` role (enforced in EP-009). Stored templates are not user-generated content and do not require HTML sanitisation at render time.

---

## Definition of Done

- [ ] `backend/src/services/templateRenderer.ts` committed with `renderTemplate` and `findMissingTokens`
- [ ] `backend/src/services/__tests__/templateRenderer.test.ts` committed (11 tests: 8 render + 3 findMissing)
- [ ] `backend/prisma/seed.ts` extended with `seedEmailTemplates()` (11 templates)
- [ ] `npx prisma db seed` seeds 11 template rows
- [ ] `offer` type template confirmed in database with `{{candidate_name}}` and `{{role_title}}` tokens
- [ ] `npm test` exits 0
- [ ] `npm run type-check` exits 0

## Traceability

| Artefact | ID |
|----------|----|
| User Story | US-002 |
| Epic | EP-DATA |
| Scenario | 3 (`offer_extended` template renders `{{candidate_name}}` and `{{role_title}}`; no raw tokens remain) |
| Spec ref | FR-057, glossary §"Tokenized Template" |
