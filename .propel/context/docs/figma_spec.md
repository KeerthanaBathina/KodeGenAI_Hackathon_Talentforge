# AI Interview Application — UI/UX Specification

## Document Control

| Field | Value |
| --- | --- |
| Document ID | FIGMA-SPEC-AI-INTERVIEW-001 |
| Version | 1.0 |
| Date | 2026-07-22 |
| Source Input | SPEC-AI-INTERVIEW-001 v1.0, DESIGN-AI-INTERVIEW-001 v1.0, AI_Interview_Workflow_BRD.md v3.0 |
| Status | Draft for Product and Design Sign-Off |

---

## 1. Overview

This document provides comprehensive UI/UX specifications for the AI Interview Application, translating functional requirements into concrete screen layouts, component states, interaction patterns, and design system tokens. It serves as the single source of truth for designers implementing screens in Figma and developers building production UI.

### 1.1 Design Philosophy

**Theme**: "Signal and Speed"

The platform prioritizes **decision-first layouts**, **progressive disclosure**, and **status always visible**. Every screen communicates state instantly and surfaces the next action without hunting.

### 1.2 Scope

- 45+ unique screens across 7 user roles
- 52 reusable UI components
- Complete design token system (colors, typography, spacing, motion)
- Accessibility compliance (WCAG 2.2 AA)
- Responsive breakpoints (mobile, tablet, desktop)
- Business rules integration (BR-01 to BR-18)
- Complete functional requirements traceability (FR-001 to FR-073)

### 1.3 Stakeholder Roles

| Role | Description | Primary Screens |
| --- | --- | --- |
| Applicant | External candidate who registers, applies, and completes assessments | Candidate Portal (Dashboard, Job Search, Application, Timeline, Assessment, Offer Review) |
| Recruiter | Internal staff who manage interview plans, communications, and routing overrides | HR Dashboard, Interview Planner, Communication Log, Requisition Management |
| HR Reviewer | Internal staff who validate AI screening output and submit shortlist/reject decisions | HR Dashboard, Review Queue, Candidate Detail & Decision Panel |
| Technical Interviewer | Internal staff who conduct technical interviews and submit rubric scorecards | Scorecard Form, Interview Panel View |
| HR Manager | Internal staff who conduct HR rounds and make final hiring decisions | Decision Workbench, Pipeline Analytics |
| System Admin | Internal staff who manage users, policies, thresholds, and integrations | Admin Dashboard, User Management, Threshold Config, Audit Log, Template Management |
| System | Automated processes including AI workers, job queues, and event handlers | N/A (backend processes) |

---

## 2. Design Token System

### 2.1 Color Tokens

#### 2.1.1 Brand Colors

| Token | Light Mode | Dark Mode | Usage |
| --- | --- | --- | --- |
| `--color-brand-primary` | `#6366F1` (indigo-500) | `#818CF8` (indigo-400) | Primary CTAs, active navigation, focused states |
| `--color-brand-primary-hover` | `#4F46E5` (indigo-600) | `#6366F1` (indigo-500) | Hover state for primary buttons |
| `--color-brand-primary-active` | `#4338CA` (indigo-700) | `#4F46E5` (indigo-600) | Active/pressed state for primary buttons |
| `--color-brand-accent` | `#06B6D4` (cyan-500) | `#22D3EE` (cyan-400) | Highlights, confidence meters, charts |
| `--color-brand-accent-hover` | `#0891B2` (cyan-600) | `#06B6D4` (cyan-500) | Hover state for accent elements |

#### 2.1.2 Semantic Colors

| Token | Light Mode | Dark Mode | Usage |
| --- | --- | --- | --- |
| `--color-success` | `#10B981` (emerald-500) | `#34D399` (emerald-400) | Shortlisted, passed, delivered, completed |
| `--color-success-surface` | `#D1FAE5` (emerald-100) | `#064E3B` (emerald-900) | Success badge background |
| `--color-success-border` | `#6EE7B7` (emerald-300) | `#065F46` (emerald-800) | Success badge border |
| `--color-warning` | `#F59E0B` (amber-500) | `#FBBF24` (amber-400) | Pending, SLA approaching, review needed |
| `--color-warning-surface` | `#FEF3C7` (amber-100) | `#78350F` (amber-900) | Warning badge background |
| `--color-warning-border` | `#FCD34D` (amber-300) | `#92400E` (amber-800) | Warning badge border |
| `--color-danger` | `#EF4444` (red-500) | `#F87171` (red-400) | Rejected, failed, error, SLA breached |
| `--color-danger-surface` | `#FEE2E2` (red-100) | `#7F1D1D` (red-900) | Danger badge background |
| `--color-danger-border` | `#FCA5A5` (red-300) | `#991B1B` (red-800) | Danger badge border |
| `--color-info` | `#3B82F6` (blue-500) | `#60A5FA` (blue-400) | Informational messages, neutral states |
| `--color-info-surface` | `#DBEAFE` (blue-100) | `#1E3A8A` (blue-900) | Info badge background |
| `--color-info-border` | `#93C5FD` (blue-300) | `#1E40AF` (blue-800) | Info badge border |

#### 2.1.3 Surface Colors

| Token | Light Mode | Dark Mode | Usage |
| --- | --- | --- | --- |
| `--color-surface-0` | `#FFFFFF` | `#0F172A` (slate-900) | Page background, outermost layer |
| `--color-surface-1` | `#F8FAFC` (slate-50) | `#1E293B` (slate-800) | Card and panel backgrounds |
| `--color-surface-2` | `#F1F5F9` (slate-100) | `#334155` (slate-700) | Secondary panels, alternating table rows |
| `--color-surface-3` | `#E2E8F0` (slate-200) | `#475569` (slate-600) | Tertiary backgrounds, hover states |
| `--color-border` | `#E2E8F0` (slate-200) | `#334155` (slate-700) | All border and divider lines |
| `--color-border-focus` | `#6366F1` (indigo-500) | `#818CF8` (indigo-400) | Focus ring color |

#### 2.1.4 Text Colors

| Token | Light Mode | Dark Mode | Usage |
| --- | --- | --- | --- |
| `--color-ink-primary` | `#0F172A` (slate-900) | `#F8FAFC` (slate-50) | Primary headings and body text |
| `--color-ink-secondary` | `#64748B` (slate-500) | `#94A3B8` (slate-400) | Supporting text, labels, placeholders |
| `--color-ink-tertiary` | `#94A3B8` (slate-400) | `#64748B` (slate-500) | Disabled text, de-emphasized content |
| `--color-ink-inverse` | `#FFFFFF` | `#0F172A` (slate-900) | Text on dark backgrounds |

### 2.2 Typography Tokens

#### 2.2.1 Font Families

| Token | Value | Usage |
| --- | --- | --- |
| `--font-display` | `'Clash Display', sans-serif` | Hero headings, large display text |
| `--font-heading` | `'Plus Jakarta Sans', sans-serif` | Section headings, card titles |
| `--font-body` | `'Inter', sans-serif` | Body text, labels, buttons |
| `--font-mono` | `'JetBrains Mono', monospace` | IDs, code snippets, technical references |

#### 2.2.2 Font Sizes

| Token | Value | Usage |
| --- | --- | --- |
| `--font-size-xs` | `0.75rem` (12px) | Captions, small labels, metadata |
| `--font-size-sm` | `0.875rem` (14px) | Secondary text, table cells |
| `--font-size-base` | `1rem` (16px) | Body text, form labels |
| `--font-size-lg` | `1.125rem` (18px) | Large body text, card subtitles |
| `--font-size-xl` | `1.25rem` (20px) | Card titles, section headings |
| `--font-size-2xl` | `1.5rem` (24px) | Page headings |
| `--font-size-3xl` | `2rem` (32px) | Hero headings (mobile) |
| `--font-size-4xl` | `2.5rem` (40px) | Hero headings (tablet) |
| `--font-size-5xl` | `3.5rem` (56px) | Hero headings (desktop) |

#### 2.2.3 Font Weights

| Token | Value | Usage |
| --- | --- | --- |
| `--font-weight-normal` | `400` | Body text |
| `--font-weight-medium` | `500` | Labels, emphasized text |
| `--font-weight-semibold` | `600` | Buttons, table headers |
| `--font-weight-bold` | `700` | Headings, important labels |

#### 2.2.4 Line Heights

| Token | Value | Usage |
| --- | --- | --- |
| `--line-height-tight` | `1.25` | Headings, compact text |
| `--line-height-normal` | `1.5` | Body text |
| `--line-height-relaxed` | `1.75` | Long-form content |

### 2.3 Spacing Tokens

| Token | Value | Usage |
| --- | --- | --- |
| `--space-0` | `0` | Reset margins/padding |
| `--space-1` | `0.25rem` (4px) | Micro spacing, icon gaps |
| `--space-2` | `0.5rem` (8px) | Tight padding, chip spacing |
| `--space-3` | `0.75rem` (12px) | Form field vertical spacing |
| `--space-4` | `1rem` (16px) | Standard padding, gap between elements |
| `--space-5` | `1.25rem` (20px) | Card padding (mobile) |
| `--space-6` | `1.5rem` (24px) | Card padding (desktop), section spacing |
| `--space-8` | `2rem` (32px) | Large section spacing |
| `--space-10` | `2.5rem` (40px) | Page section dividers |
| `--space-12` | `3rem` (48px) | Hero section spacing |
| `--space-16` | `4rem` (64px) | Extra large section spacing |

### 2.4 Border Radius Tokens

| Token | Value | Usage |
| --- | --- | --- |
| `--radius-sm` | `6px` | Small elements, chips, badges |
| `--radius-md` | `10px` | Buttons, form fields, small cards |
| `--radius-lg` | `16px` | Large cards, modals, panels |
| `--radius-xl` | `24px` | Hero sections, feature cards |
| `--radius-pill` | `9999px` | Pill-shaped buttons, badges |

### 2.5 Shadow Tokens

| Token | Value | Usage |
| --- | --- | --- |
| `--shadow-xs` | `0 1px 2px rgba(0,0,0,.04)` | Subtle depth, input fields |
| `--shadow-sm` | `0 1px 3px rgba(0,0,0,.08), 0 1px 2px rgba(0,0,0,.06)` | Small cards, dropdowns |
| `--shadow-md` | `0 4px 6px rgba(0,0,0,.08), 0 2px 4px rgba(0,0,0,.06)` | Cards, raised buttons |
| `--shadow-lg` | `0 10px 15px rgba(0,0,0,.1), 0 4px 6px rgba(0,0,0,.08)` | Modals, popovers |
| `--shadow-xl` | `0 20px 25px rgba(0,0,0,.12), 0 8px 10px rgba(0,0,0,.08)` | Large modals, overlays |
| `--shadow-focus` | `0 0 0 3px rgba(99,102,241,.3)` | Focus ring for accessibility |

### 2.6 Motion Tokens

| Token | Value | Usage |
| --- | --- | --- |
| `--motion-instant` | `80ms cubic-bezier(0.2,0,0.2,1)` | Micro-interactions, hover states |
| `--motion-fast` | `120ms cubic-bezier(0.2,0,0.2,1)` | Button clicks, transitions |
| `--motion-medium` | `200ms cubic-bezier(0.2,0,0.2,1)` | Panel slides, modal open |
| `--motion-slow` | `300ms cubic-bezier(0.2,0,0.2,1)` | Page transitions, complex animations |
| `--motion-spring` | `cubic-bezier(0.34,1.56,0.64,1)` | Bouncy animations (celebrations) |

---

## 3. Component Library

### 3.1 Buttons

#### 3.1.1 Primary Button

**Variants**: Default, Hover, Active, Disabled, Loading

**Specifications**:
- Height: `40px` (small), `48px` (medium), `56px` (large)
- Padding: `--space-4` horizontal, `--space-3` vertical
- Border Radius: `--radius-md`
- Font: `--font-body`, `--font-weight-semibold`, `--font-size-base`
- Background: `--color-brand-primary`
- Text Color: `--color-ink-inverse`
- Shadow: `--shadow-sm`
- Transition: `--motion-fast`

**States**:
```
Default:
  background: var(--color-brand-primary)
  shadow: var(--shadow-sm)

Hover:
  background: var(--color-brand-primary-hover)
  shadow: var(--shadow-md)
  transform: translateY(-1px)

Active:
  background: var(--color-brand-primary-active)
  shadow: var(--shadow-xs)
  transform: translateY(0)

Disabled:
  background: var(--color-surface-2)
  color: var(--color-ink-tertiary)
  cursor: not-allowed
  shadow: none

Loading:
  cursor: wait
  opacity: 0.7
  + Spinner icon (16px, centered)
```

#### 3.1.2 Secondary Button

**Specifications**:
- Height: `40px` (small), `48px` (medium), `56px` (large)
- Padding: `--space-4` horizontal, `--space-3` vertical
- Border Radius: `--radius-md`
- Background: Transparent
- Border: `1px solid var(--color-border)`
- Text Color: `--color-ink-primary`
- Font: `--font-body`, `--font-weight-semibold`, `--font-size-base`
- Transition: `--motion-fast`

**States**:
```
Default:
  background: transparent
  border: 1px solid var(--color-border)
  color: var(--color-ink-primary)

Hover:
  background: var(--color-surface-2)
  border: 1px solid var(--color-brand-primary)

Active:
  background: var(--color-surface-3)

Disabled:
  opacity: 0.5
  cursor: not-allowed
```

#### 3.1.3 Danger Button

**Specifications**: Same as Primary Button, but:
- Background: `--color-danger`
- Hover: Darker shade of danger color
- Use for destructive actions (reject, delete, withdraw)

#### 3.1.4 Ghost Button (Icon Only)

**Specifications**:
- Size: `32px` × `32px` (small), `40px` × `40px` (medium)
- Border Radius: `--radius-md`
- Background: Transparent
- Icon: 16px (small), 20px (medium)
- Transition: `--motion-fast`

**States**:
```
Default:
  background: transparent
  color: var(--color-ink-secondary)

Hover:
  background: var(--color-surface-2)
  color: var(--color-ink-primary)

Active:
  background: var(--color-surface-3)
```

### 3.2 Form Components

#### 3.2.1 Text Input

**Specifications**:
- Height: `48px`
- Padding: `--space-4` horizontal, `--space-3` vertical
- Border Radius: `--radius-md`
- Border: `1px solid var(--color-border)`
- Font: `--font-body`, `--font-size-base`
- Background: `--color-surface-0`
- Shadow: `--shadow-xs`
- Transition: `--motion-fast`

**States**:
```
Default:
  border: 1px solid var(--color-border)
  background: var(--color-surface-0)

Focus:
  border: 2px solid var(--color-brand-primary)
  box-shadow: var(--shadow-focus)
  outline: none

Error:
  border: 2px solid var(--color-danger)
  background: var(--color-danger-surface)

Disabled:
  background: var(--color-surface-2)
  color: var(--color-ink-tertiary)
  cursor: not-allowed
```

**Label**:
- Font: `--font-body`, `--font-weight-medium`, `--font-size-sm`
- Color: `--color-ink-primary`
- Margin Bottom: `--space-2`
- Required indicator: Red asterisk `*` appended

**Helper Text**:
- Font: `--font-body`, `--font-size-xs`
- Color: `--color-ink-secondary`
- Margin Top: `--space-2`

**Error Message**:
- Font: `--font-body`, `--font-size-xs`
- Color: `--color-danger`
- Margin Top: `--space-2`
- Icon: Error icon (16px) prepended

#### 3.2.2 Textarea

**Specifications**: Same as Text Input, but:
- Height: Auto (min `96px`, max `240px`)
- Resize: Vertical only

#### 3.2.3 Select Dropdown

**Specifications**:
- Height: `48px`
- Padding: `--space-4` horizontal, `--space-3` vertical
- Border Radius: `--radius-md`
- Border: `1px solid var(--color-border)`
- Font: `--font-body`, `--font-size-base`
- Background: `--color-surface-0`
- Chevron Icon: 16px, positioned right with `--space-4` margin

**States**: Same as Text Input

**Dropdown Menu**:
- Background: `--color-surface-1`
- Border: `1px solid var(--color-border)`
- Border Radius: `--radius-md`
- Shadow: `--shadow-lg`
- Max Height: `320px` with scroll
- Padding: `--space-2`

**Option Item**:
- Height: `40px`
- Padding: `--space-3` horizontal
- Border Radius: `--radius-sm`
- Font: `--font-body`, `--font-size-base`

**Option States**:
```
Default:
  background: transparent
  color: var(--color-ink-primary)

Hover:
  background: var(--color-surface-2)
  cursor: pointer

Selected:
  background: var(--color-brand-primary)
  color: var(--color-ink-inverse)
  font-weight: var(--font-weight-semibold)

Disabled:
  color: var(--color-ink-tertiary)
  cursor: not-allowed
```

#### 3.2.4 Checkbox

**Specifications**:
- Size: `20px` × `20px`
- Border Radius: `--radius-sm`
- Border: `2px solid var(--color-border)`
- Background: `--color-surface-0`
- Transition: `--motion-fast`

**States**:
```
Unchecked:
  background: var(--color-surface-0)
  border: 2px solid var(--color-border)

Checked:
  background: var(--color-brand-primary)
  border: 2px solid var(--color-brand-primary)
  + Checkmark icon (white, 12px)

Indeterminate:
  background: var(--color-brand-primary)
  border: 2px solid var(--color-brand-primary)
  + Horizontal line icon (white, 12px)

Focus:
  box-shadow: var(--shadow-focus)

Disabled:
  opacity: 0.5
  cursor: not-allowed
```

**Label**:
- Font: `--font-body`, `--font-size-base`
- Color: `--color-ink-primary`
- Margin Left: `--space-3`
- Clickable to toggle checkbox

#### 3.2.5 Radio Button

**Specifications**:
- Size: `20px` × `20px`
- Border Radius: `--radius-pill` (circular)
- Border: `2px solid var(--color-border)`
- Background: `--color-surface-0`
- Transition: `--motion-fast`

**States**:
```
Unselected:
  background: var(--color-surface-0)
  border: 2px solid var(--color-border)

Selected:
  background: var(--color-surface-0)
  border: 6px solid var(--color-brand-primary)

Focus:
  box-shadow: var(--shadow-focus)

Disabled:
  opacity: 0.5
  cursor: not-allowed
```

**Label**: Same as Checkbox label

#### 3.2.6 Toggle Switch

**Specifications**:
- Width: `44px`
- Height: `24px`
- Border Radius: `--radius-pill`
- Background: `--color-surface-3` (off), `--color-brand-primary` (on)
- Knob: `20px` circle, white, `2px` margin
- Transition: `--motion-medium`

**States**:
```
Off:
  background: var(--color-surface-3)
  knob position: left

On:
  background: var(--color-brand-primary)
  knob position: right

Disabled:
  opacity: 0.5
  cursor: not-allowed
```

### 3.3 Data Display Components

#### 3.3.1 Badge

**Variants**: Success, Warning, Danger, Info, Neutral

**Specifications**:
- Height: `24px` (small), `28px` (medium)
- Padding: `--space-2` horizontal
- Border Radius: `--radius-sm`
- Font: `--font-body`, `--font-weight-medium`, `--font-size-xs`
- Border: `1px solid`

**Variants**:
```
Success:
  background: var(--color-success-surface)
  color: var(--color-success)
  border: 1px solid var(--color-success-border)

Warning:
  background: var(--color-warning-surface)
  color: var(--color-warning)
  border: 1px solid var(--color-warning-border)

Danger:
  background: var(--color-danger-surface)
  color: var(--color-danger)
  border: 1px solid var(--color-danger-border)

Info:
  background: var(--color-info-surface)
  color: var(--color-info)
  border: 1px solid var(--color-info-border)

Neutral:
  background: var(--color-surface-2)
  color: var(--color-ink-secondary)
  border: 1px solid var(--color-border)
```

#### 3.3.2 Card

**Specifications**:
- Padding: `--space-6`
- Border Radius: `--radius-lg`
- Background: `--color-surface-1`
- Border: `1px solid var(--color-border)`
- Shadow: `--shadow-sm`
- Transition: `--motion-fast`

**Variants**:
```
Default:
  shadow: var(--shadow-sm)

Hover (if interactive):
  shadow: var(--shadow-md)
  transform: translateY(-2px)

Active/Selected:
  border: 2px solid var(--color-brand-primary)
  shadow: var(--shadow-md)
```

**Card Header**:
- Padding Bottom: `--space-4`
- Border Bottom: `1px solid var(--color-border)`
- Title Font: `--font-heading`, `--font-weight-bold`, `--font-size-xl`

**Card Body**:
- Padding Top: `--space-4`

**Card Footer**:
- Padding Top: `--space-4`
- Border Top: `1px solid var(--color-border)`
- Display: flex, justify-content: space-between

#### 3.3.3 Table

**Specifications**:
- Border: `1px solid var(--color-border)`
- Border Radius: `--radius-lg`
- Background: `--color-surface-0`
- Font: `--font-body`, `--font-size-sm`

**Table Header**:
- Background: `--color-surface-1`
- Border Bottom: `1px solid var(--color-border)`
- Padding: `--space-3` horizontal, `--space-3` vertical
- Font: `--font-weight-semibold`
- Color: `--color-ink-primary`

**Table Row**:
- Height: `56px`
- Padding: `--space-3` horizontal
- Border Bottom: `1px solid var(--color-border)`
- Transition: `--motion-fast`

**Row States**:
```
Default:
  background: var(--color-surface-0)

Hover (if interactive):
  background: var(--color-surface-2)
  cursor: pointer

Selected:
  background: var(--color-brand-accent) with 10% opacity
  border-left: 4px solid var(--color-brand-primary)

Alternate Row (optional):
  background: var(--color-surface-1)
```

**Table Cell**:
- Padding: `--space-3`
- Font: `--font-body`, `--font-size-sm`
- Color: `--color-ink-primary`
- Overflow: ellipsis with tooltip on hover

#### 3.3.4 Progress Bar

**Specifications**:
- Height: `8px` (thin), `12px` (medium), `16px` (thick)
- Border Radius: `--radius-pill`
- Background: `--color-surface-2`
- Fill: `--color-brand-primary` (default), semantic colors (success/warning/danger)
- Transition: `width 300ms ease-out`

**States**:
```
Default:
  background: var(--color-surface-2)
  fill: var(--color-brand-primary)

Success (complete):
  fill: var(--color-success)

Warning (near deadline):
  fill: var(--color-warning)

Danger (overdue):
  fill: var(--color-danger)

Indeterminate (loading):
  fill: animated gradient shimmer
```

#### 3.3.5 Confidence Meter (Circular)

**Specifications**:
- Size: `80px` × `80px` (small), `120px` × `120px` (large)
- Stroke Width: `8px`
- Background Ring: `--color-surface-2`
- Fill Ring: Semantic color based on confidence band
- Transition: `stroke-dashoffset 500ms ease-out`

**Confidence Bands**:
```
High (>80%):
  fill: var(--color-success)
  label: "High Confidence"

Medium (50-80%):
  fill: var(--color-warning)
  label: "Medium Confidence"

Low (<50%):
  fill: var(--color-danger)
  label: "Low Confidence"
```

**Center Label**:
- Font: `--font-heading`, `--font-weight-bold`, `--font-size-xl`
- Color: Matches fill ring color
- Format: `85%`

### 3.4 Navigation Components

#### 3.4.1 Sidebar Navigation

**Specifications**:
- Width: `240px` (collapsed), `280px` (expanded)
- Background: `--color-surface-1`
- Border Right: `1px solid var(--color-border)`
- Padding: `--space-6` vertical
- Transition: `width 200ms ease-out`

**Nav Item**:
- Height: `40px`
- Padding: `--space-3` horizontal, `--space-2` vertical
- Border Radius: `--radius-md`
- Margin: `--space-1` horizontal, `--space-1` vertical
- Font: `--font-body`, `--font-weight-medium`, `--font-size-base`
- Icon: 20px, `--space-3` margin right
- Transition: `--motion-fast`

**Nav Item States**:
```
Default:
  background: transparent
  color: var(--color-ink-secondary)

Hover:
  background: var(--color-surface-2)
  color: var(--color-ink-primary)

Active:
  background: var(--color-brand-primary) with 10% opacity
  color: var(--color-brand-primary)
  font-weight: var(--font-weight-semibold)
  border-left: 3px solid var(--color-brand-primary)

Focus:
  box-shadow: var(--shadow-focus)
```

**Badge (notification count)**:
- Size: `20px` × `20px`
- Background: `--color-danger`
- Color: `--color-ink-inverse`
- Font: `--font-body`, `--font-weight-bold`, `--font-size-xs`
- Border Radius: `--radius-pill`
- Position: Absolute, top-right of nav item

#### 3.4.2 Breadcrumb

**Specifications**:
- Height: `32px`
- Font: `--font-body`, `--font-size-sm`
- Color: `--color-ink-secondary`
- Separator: `/` or chevron icon (12px)

**Item States**:
```
Default (non-interactive):
  color: var(--color-ink-secondary)

Link (interactive):
  color: var(--color-brand-primary)
  text-decoration: none

Link Hover:
  text-decoration: underline

Current Page:
  color: var(--color-ink-primary)
  font-weight: var(--font-weight-semibold)
```

#### 3.4.3 Tabs

**Specifications**:
- Height: `44px`
- Border Bottom: `2px solid var(--color-border)`
- Font: `--font-body`, `--font-weight-medium`, `--font-size-base`
- Padding: `--space-4` horizontal

**Tab Item States**:
```
Default:
  color: var(--color-ink-secondary)
  border-bottom: 2px solid transparent

Hover:
  color: var(--color-ink-primary)
  border-bottom: 2px solid var(--color-surface-3)

Active:
  color: var(--color-brand-primary)
  border-bottom: 2px solid var(--color-brand-primary)
  font-weight: var(--font-weight-semibold)

Disabled:
  color: var(--color-ink-tertiary)
  cursor: not-allowed
```

### 3.5 Feedback Components

#### 3.5.1 Toast Notification

**Specifications**:
- Width: `360px` (mobile), `400px` (desktop)
- Height: Auto (min `72px`)
- Padding: `--space-4`
- Border Radius: `--radius-lg`
- Shadow: `--shadow-xl`
- Position: Fixed, top-right (desktop), top-center (mobile)
- Animation: Slide in from top + fade in, `--motion-medium`
- Auto Dismiss: 5 seconds (configurable)

**Variants**:
```
Success:
  background: var(--color-surface-1)
  border-left: 4px solid var(--color-success)
  icon: checkmark (20px, success color)

Error:
  background: var(--color-surface-1)
  border-left: 4px solid var(--color-danger)
  icon: error (20px, danger color)

Warning:
  background: var(--color-surface-1)
  border-left: 4px solid var(--color-warning)
  icon: warning (20px, warning color)

Info:
  background: var(--color-surface-1)
  border-left: 4px solid var(--color-info)
  icon: info (20px, info color)
```

**Close Button**:
- Size: `24px` × `24px`
- Position: Absolute, top-right, `--space-2` margin
- Icon: × (16px)

#### 3.5.2 Modal

**Specifications**:
- Width: `480px` (small), `600px` (medium), `800px` (large), `90vw` (full)
- Max Width: `90vw`
- Max Height: `90vh`
- Border Radius: `--radius-lg`
- Background: `--color-surface-1`
- Shadow: `--shadow-xl`
- Animation: Fade in + scale up, `--motion-medium`

**Backdrop**:
- Background: `rgba(0,0,0,.6)`
- Animation: Fade in, `--motion-medium`

**Modal Header**:
- Padding: `--space-6`
- Border Bottom: `1px solid var(--color-border)`
- Title Font: `--font-heading`, `--font-weight-bold`, `--font-size-2xl`

**Modal Body**:
- Padding: `--space-6`
- Max Height: `60vh` with scroll

**Modal Footer**:
- Padding: `--space-6`
- Border Top: `1px solid var(--color-border)`
- Display: flex, justify-content: flex-end
- Button Gap: `--space-3`

**Close Button**:
- Position: Absolute, top-right, `--space-6` margin
- Size: `32px` × `32px`
- Icon: × (20px)

#### 3.5.3 Popover

**Specifications**:
- Max Width: `320px`
- Padding: `--space-4`
- Border Radius: `--radius-md`
- Background: `--color-surface-1`
- Border: `1px solid var(--color-border)`
- Shadow: `--shadow-lg`
- Animation: Fade in + scale up from trigger, `--motion-fast`

**Arrow**:
- Size: `8px` × `8px`
- Fill: `--color-surface-1`
- Border: `1px solid var(--color-border)` (matching sides)

#### 3.5.4 Tooltip

**Specifications**:
- Max Width: `240px`
- Padding: `--space-2` horizontal, `--space-1` vertical
- Border Radius: `--radius-sm`
- Background: `--color-ink-primary` with 90% opacity
- Color: `--color-ink-inverse`
- Font: `--font-body`, `--font-size-xs`
- Shadow: `--shadow-md`
- Animation: Fade in, `--motion-fast`
- Delay: 500ms before showing

**Arrow**:
- Size: `6px` × `6px`
- Fill: Matches background

### 3.6 Loading Components

#### 3.6.1 Spinner

**Specifications**:
- Size: `16px` (small), `24px` (medium), `40px` (large)
- Stroke Width: `2px`
- Color: `--color-brand-primary`
- Animation: 360° rotation, 800ms linear infinite

#### 3.6.2 Skeleton Loader

**Specifications**:
- Border Radius: Matches component being loaded
- Background: `--color-surface-2`
- Animation: Shimmer gradient moving left to right, 1.5s ease-in-out infinite

**Shimmer Gradient**:
```
background: linear-gradient(
  90deg,
  var(--color-surface-2) 0%,
  var(--color-surface-3) 50%,
  var(--color-surface-2) 100%
)
background-size: 200% 100%
```

**Variants**:
- Text Line: Height `16px`, width varies
- Card: Full card dimensions with rounded corners
- Circle: Avatar/profile picture placeholder
- Rectangle: Image placeholder

---

## 4. Screen Inventory

### 4.1 Public Screens (Unauthenticated)

#### 4.1.1 Landing Page

**Route**: `/`

**Purpose**: Marketing page explaining the platform value proposition

**Components**:
- Hero section with gradient mesh background
- Feature highlights (3 columns)
- CTA buttons: "Apply as Candidate", "Login"
- Footer with links

**Layout**:
- Full-width hero (min-height: 600px)
- Max content width: 1280px
- Responsive: Stack columns on mobile

#### 4.1.2 Registration Page

**Route**: `/register`

**Purpose**: Candidate self-registration with email/phone OTP

**Components**:
- Multi-step form (3 steps)
- Progress indicator (rail at top)
- OTP input (6-digit code)
- Consent checkboxes
- Submit button

**States**:
- Step 1: Contact details (email, phone, password)
- Step 2: OTP verification
- Step 3: Consent and onboarding checklist preview

**Validation**:
- Real-time password strength meter
- Email format validation on blur
- Phone format validation with country code selector

**FR Traceability**: FR-001, FR-003, FR-006, FR-007, FR-008

#### 4.1.3 Login Page

**Route**: `/login`

**Purpose**: Authentication for all user roles

**Layout**:
- Centered login card (max-width: 400px)
- Form fields stacked vertically
- SSO section with divider
- Footer with registration link

**Components**:
- Email/username input
  - Label: "Email or Username"
  - Autofocus on page load
  - Autocomplete: "username"
- Password input with show/hide toggle
  - Label: "Password"
  - Toggle icon button (eye/eye-off)
  - Autocomplete: "current-password"
- "Remember me" checkbox
  - Label: "Keep me logged in for 30 days"
  - Unchecked by default
- "Forgot password?" link
  - Positioned right of "Remember me"
- Submit button
  - Text: "Log in"
  - Primary style, full-width
  - Loading spinner replaces text during authentication

**SSO Section**:
- Horizontal divider with "Or continue with" text
- SSO provider buttons (horizontal stack on desktop, vertical on mobile):
  - **Google button**:
    - White background, gray border
    - Google logo (20px) + "Continue with Google" text
    - OAuth2 redirect to Google Identity Platform
    - Domain restriction: Only @company.com emails (for internal users)
  - **GitHub button**:
    - Black background, white text
    - GitHub logo (20px) + "Continue with GitHub" text
    - OAuth2 redirect to GitHub OAuth App
    - Requires organization membership verification

**States**:
- **Default**: All fields empty, buttons enabled
- **Validation errors**: 
  - Email format: "Please enter a valid email address"
  - Required fields: "This field is required"
  - Wrong credentials: "Email or password is incorrect"
- **Account locked** (after 5 failed attempts):
  - Red banner above form
  - Message: "Your account has been temporarily locked due to multiple failed login attempts."
  - CTA: "Reset password" or "Wait 30 minutes"
  - Redirects to Account Lockout Screen (4.1.3.2)
- **Loading** (during authentication):
  - Submit button shows spinner
  - All inputs disabled
  - SSO buttons disabled

**SSO Flow Details**:
1. User clicks SSO button
2. Redirect to provider authorization page
3. User authorizes (if not already logged in to provider)
4. Provider redirects to callback URL with authorization code
5. Backend exchanges code for token and creates/updates user session
6. User redirected to role-specific dashboard
7. **Error handling**:
   - Authorization denied: "You cancelled the login process. [Try again]"
   - Invalid domain: "Your email domain is not authorized. Only @company.com emails are allowed for staff login."
   - Network error: "Unable to connect to [provider]. Please try again or use email/password."

**Footer**:
- Text: "Don't have an account? [Sign up]"
- Sign up link routes to Registration Page (4.1.2)

**FR Traceability**: FR-002, FR-004, FR-005, FR-009

#### 4.1.3.1 Session Timeout Warning Modal

**Trigger**: 25 minutes after last user activity (5 minutes before forced logout)

**Purpose**: Warn user of impending session expiration

**Components**:
- Modal overlay (cannot be dismissed by clicking backdrop)
- Warning icon (amber)
- Title: "Your session is about to expire"
- Message: "You will be automatically logged out in 5 minutes due to inactivity."
- Countdown timer (MM:SS format, updates every second)
- Action buttons:
  - "Stay logged in" (primary, refreshes session)
  - "Log out now" (secondary)

**Behavior**:
- Appears at 25-minute mark of inactivity
- Countdown starts at 5:00 and decrements
- If user clicks "Stay logged in", modal closes and session refreshes
- If countdown reaches 0:00, user is logged out and redirected to login page with message
- Keyboard shortcut: Enter = Stay logged in, Esc = Log out

**FR Traceability**: FR-009

#### 4.1.3.2 Account Lockout Screen

**Route**: `/login?locked=true`

**Purpose**: Inform user of account lockout after 5 failed attempts

**Components**:
- Lock icon (red)
- Error message: "Account Temporarily Locked"
- Explanation: "Your account has been locked due to 5 failed login attempts within 15 minutes for security reasons."
- Recovery instructions:
  - "A password reset link has been sent to your registered email."
  - "Or wait 30 minutes for automatic unlock."
- Unlock countdown timer (if within lockout window)
- Contact support link
- Back to login button

**FR Traceability**: FR-002, BR-08

#### 4.1.4 Forgot Password Page

**Route**: `/forgot-password`

**Purpose**: Password reset request

**Components**:
- Email input
- Submit button
- Back to login link

**States**:
- Default
- Email sent confirmation
- Error (email not found)

#### 4.1.5 Reset Password Page

**Route**: `/reset-password?token=xxx`

**Purpose**: Set new password after reset email

**Components**:
- New password input
- Confirm password input
- Password strength meter
- Submit button

**Validation**:
- Password policy enforcement (min 10 chars, 1 uppercase, 1 number, 1 special)
- Passwords match

### 4.2 Candidate Portal Screens

#### 4.2.1 Candidate Dashboard

**Route**: `/candidate/dashboard`

**Role**: Applicant

**Purpose**: Overview of active applications and next actions

**Layout**:
- Top: Welcome message + profile completion checklist
- Middle: Active applications grid (cards)
- Bottom: Recommended jobs carousel

**Components**:
- Profile completion card (progress bar + pending steps)
- Application card (per application)
  - Job title
  - Current stage badge
  - Status (submitted, screening, interview, etc.)
  - Next action button (if applicable)
  - Timeline icon
- Job recommendation card
  - Job title, department, location
  - Match score (if resume uploaded)
  - Apply button

**Empty State**:
- Illustration + "No active applications"
- CTA: "Browse open positions"

**FR Traceability**: FR-007, FR-011

#### 4.2.2 Job Search & Browse

**Route**: `/candidate/jobs`

**Role**: Applicant

**Purpose**: Search and filter open requisitions

**Layout**:
- Left: Filters sidebar (collapsible on mobile)
- Right: Job list (grid or list view toggle)

**Filters**:
- Search input (job title, keywords)
- Department (multi-select)
- Location (multi-select)
- Experience level (checkboxes: entry, mid, senior)
- Job type (checkboxes: full-time, part-time, contract)

**Job Card**:
- Job title (link to detail page)
- Department, location, job type
- Eligibility criteria (brief)
- Apply button
- Save/bookmark icon

**Empty State**:
- "No jobs match your filters"
- Reset filters button

**FR Traceability**: FR-011

#### 4.2.3 Job Detail Page

**Route**: `/candidate/jobs/:id`

**Role**: Applicant

**Purpose**: View full job description and apply

**Layout**:
- Top: Job header (title, department, location, status)
- Middle: Sections (tabs): Description, Eligibility, Interview Process, Benefits
- Bottom: Apply button (sticky on mobile)

**Components**:
- Job header card
  - Title, department, location, job type
  - Status badge (open, closing soon)
  - Slots remaining (if visible)
- Description section (rich text)
- Eligibility checklist
- Interview process timeline (visual)
- Apply button (primary, large)

**States**:
- Already applied: Button disabled, show "Application submitted on [date]"
- Duplicate within cooling period: Button disabled, show "Cooling period ends on [date]"
- Requisition closed: Show "This position is no longer accepting applications"

**FR Traceability**: FR-011, FR-012

#### 4.2.4 Application Form

**Route**: `/candidate/apply/:jobId`

**Role**: Applicant

**Purpose**: Submit job application

**Layout**:
- Multi-step form (4 steps)
- Progress rail at top
- Auto-save indicator (timestamp)
- Estimated completion time

**Steps**:
1. Personal Information (pre-filled from profile)
2. Resume Upload
3. Additional Questions (job-specific)
4. Review & Submit

**Components**:
- Progress rail (4 dots, current step highlighted)
- Step indicator (e.g., "Step 2 of 4")
- Auto-save timestamp ("Last saved: 2 minutes ago")
- Estimated time ("~5 minutes remaining")
- Navigation buttons (Back, Next, Submit)

**Resume Upload Section**:
- Drag-and-drop zone
- File picker button
- Supported formats: PDF, DOCX (max 10MB)
- Upload progress bar
- Malware scan status indicator
- Parse preview (after upload)
  - Extracted fields shown in cards
  - Edit button per field

**Validation**:
- Required field indicators (red asterisks)
- Real-time character count (for text areas)
- Inline validation on blur
- Submission blocked until all required fields valid

**FR Traceability**: FR-013, FR-014, FR-015, FR-016, FR-017, FR-018, FR-019

#### 4.2.5 Application Confirmation Page

**Route**: `/candidate/applications/:id/confirmation`

**Role**: Applicant

**Purpose**: Confirm application submission

**Layout**:
- Centered card with success icon
- Application summary
- Next steps

**Components**:
- Success icon (checkmark with celebration animation)
- Confirmation message
- Application ID (monospaced font, copyable)
- Job title
- Next steps timeline
  - Step 1: AI screening (expected within 3 minutes)
  - Step 2: HR review (within 48 hours)
  - Step 3: Interview invitation (if shortlisted)
- Action buttons:
  - View application timeline
  - Browse more jobs
  - Return to dashboard

**FR Traceability**: FR-019

#### 4.2.6 Application Timeline Page

**Route**: `/candidate/applications/:id`

**Role**: Applicant

**Purpose**: View application status and history

**Layout**:
- Top: Application header (job title, current status, submitted date)
- Middle: Vertical timeline
- Bottom: Action buttons (context-dependent)

**Components**:
- Application header card
  - Job title
  - Current stage badge
  - Submitted date
  - Withdraw button (if eligible)
- Timeline component
  - Vertical line connecting stages
  - Stage node (circle icon)
    - Completed: Checkmark, green
    - In Progress: Pulsing dot, blue
    - Pending: Empty circle, gray
  - Stage details per node:
    - Stage name (e.g., "AI Screening", "HR Review")
    - Status (completed, in progress, pending)
    - Timestamp (if completed)
    - Notes/comments (if any)
- Action button section
  - Context-dependent buttons:
    - Schedule interview
    - Complete assessment
    - Accept/Decline offer
    - Withdraw application

**States**:
- Screening: Show AI confidence meter + factors
- Interview scheduled: Show date, time, timezone, join link
- Offer received: Show offer details + accept/decline buttons
- Rejected: Show rejection reason (if provided)
- Withdrawn: Show withdrawal acknowledgment

**FR Traceability**: FR-020, FR-027

#### 4.2.7 Assessment Console

**Route**: `/candidate/assessments/:id`

**Role**: Applicant

**Purpose**: Take aptitude or coding assessment

**Layout**:
- Full-screen immersive mode
- Top bar: Timer, question navigator, submit button
- Middle: Question content
- Bottom: Navigation buttons (Previous, Next, Mark for Review)

**Components**:
- Header bar (sticky)
  - Assessment title
  - Timer (countdown, color-coded)
    - Green: > 10 minutes remaining
    - Yellow: 5–10 minutes
    - Red + pulsing: < 5 minutes
  - Question navigator (grid of question numbers)
    - Answered: Green checkmark
    - Marked for review: Yellow flag
    - Unanswered: Gray
  - Submit button
- Question pane
  - Question number + text
  - Answer choices (radio or checkboxes)
  - Code editor (for coding questions)
    - Syntax highlighting
    - Auto-complete
    - Run code button
    - Output console
- Footer navigation
  - Previous button
  - Next button
  - Mark for review toggle
  - Progress indicator (e.g., "Question 5 of 20")

**States**:
- Timer running
- Timer paused (if session suspended)
- Session reconnect (if disconnected)
- Submit confirmation modal

**FR Traceability**: FR-037, FR-044

#### 4.2.8 Interview Confirmation Page

**Route**: `/candidate/interviews/:id/confirm`

**Role**: Applicant

**Purpose**: Confirm or reschedule interview

**Layout**:
- Centered card
- Interview details
- Confirm/Reschedule/Decline buttons

**Components**:
- Interview details card
  - Stage name (e.g., "Technical Interview")
  - Date and time (candidate's timezone)
  - Duration
  - Interviewer names
  - Meeting link or location
  - Add to calendar button (iCal, Google Calendar)
- Action buttons
  - Confirm attendance (primary)
  - Request reschedule (secondary)
  - Decline (ghost, danger)

**FR Traceability**: FR-037, FR-043

#### 4.2.9 Offer Review Page

**Route**: `/candidate/offers/:id`

**Role**: Applicant

**Purpose**: Review and respond to offer

**Layout**:
- Top: Offer summary card
- Middle: Offer letter (embedded PDF viewer or rich text)
- Bottom: Accept/Decline buttons

**Components**:
- Offer summary card
  - Job title
  - Start date
  - Salary
  - Offer expiry date (countdown)
- Offer letter viewer
  - Download PDF button
  - Print button
- Response deadline countdown
  - Format: "Respond by [date] ([X] days remaining)"
  - Color-coded: Green (> 7 days), Yellow (3–7 days), Red (< 3 days)
- Action buttons
  - Accept offer (primary, large)
  - Decline offer (secondary)
  - Request extension (ghost)

**Confirmation Modal**:
- "Are you sure you want to accept/decline?"
- Summary of consequences
- Confirm/Cancel buttons

**FR Traceability**: FR-053, FR-056

#### 4.2.10 Application Blocked Screen (Cooling Period)

**Route**: `/candidate/apply/:jobId?blocked=cooling_period`

**Purpose**: Prevent duplicate applications within cooling period

**Components**:
- Warning icon (amber)
- Message: "You've recently applied for this position"
- Explanation: "You can reapply after the cooling period ends."
- Cooling period end date (formatted: "Available to reapply on July 25, 2026")
- Countdown timer showing days/hours remaining
- Suggested actions:
  - "View your application" button (links to application timeline)
  - "Browse other jobs" button
- Back button

**FR Traceability**: FR-012, BR-03

#### 4.2.11 Requisition Closed Screen

**Route**: `/candidate/jobs/:id?status=closed`

**Purpose**: Inform candidate that job is no longer accepting applications

**Components**:
- Info icon (gray)
- Message: "This Position is No Longer Available"
- Explanation: "This job posting has been closed and is no longer accepting applications."
- Reasons shown (if applicable):
  - "All positions have been filled"
  - "Requisition deadline has passed"
  - "Position has been put on hold"
- Suggested actions:
  - "View similar jobs" button (shows related requisitions)
  - "Browse all open positions" button
- Save job for future openings checkbox

**FR Traceability**: BR-17

#### 4.2.12 Consent & Privacy Management

**Route**: `/candidate/privacy`

**Purpose**: View and manage data privacy consents

**Layout**:
- Top: Privacy policy summary
- Middle: Consent history
- Bottom: Data subject rights section

**Components**:
- **Active Consents Card**:
  - Privacy Policy (version, date accepted)
  - AI Processing Notice (version, date accepted)
  - Communication preferences
  - View full text buttons
- **Consent History Timeline**:
  - List of all consent events
  - Each item: Consent type, version, timestamp, IP address
  - Download consent receipt button
- **Data Subject Rights Section**:
  - "Download my data" button (GDPR right to access)
  - "Request data deletion" button (GDPR right to be forgotten)
  - Status of pending requests (if any)

**Data Deletion Request Flow**:
1. Click "Request data deletion"
2. Modal appears with warnings:
   - "This action will permanently delete your profile and all associated applications."
   - "Active applications will be withdrawn."
   - "Deletion completes within 30 days per regulatory requirements."
3. Confirm email input (for verification)
4. Reason dropdown (optional)
5. Confirm button
6. Email confirmation sent
7. Status shown: "Deletion request pending - Completes by [date]"

**FR Traceability**: FR-003, BR-15

#### 4.2.13 OTP Rate Limit Screen

**Route**: Embedded in registration/verification flow

**Purpose**: Inform user when OTP resend limit is reached

**Components**:
- Warning icon (amber)
- Message: "Resend limit reached"
- Explanation: "You've requested too many OTP codes. For security reasons, please wait before requesting another."
- Next available time: "You can request a new code at [time]"
- Countdown timer
- Alternative actions:
  - "Try a different email/phone" button
  - "Contact support" link
- Back button

**FR Traceability**: FR-008

### 4.3 Recruiter & HR Screens

#### 4.3.1 HR Dashboard (Home)

**Route**: `/hr/dashboard`

**Role**: HR Reviewer, Recruiter

**Purpose**: Overview of queue, metrics, and alerts

**Layout**:
- Top: Metrics cards (4 columns)
- Middle: Alerts section
- Bottom: Recent activity feed

**Metrics Cards**:
1. Pending Reviews
   - Count (large number)
   - Subtitle: "Awaiting your decision"
   - Icon: Clipboard
2. SLA Breaches
   - Count (large number, red if > 0)
   - Subtitle: "Overdue candidates"
   - Icon: Clock
3. Active Interviews
   - Count
   - Subtitle: "Scheduled this week"
   - Icon: Calendar
4. Offers Pending Response
   - Count
   - Subtitle: "Awaiting candidate reply"
   - Icon: Envelope

**Alerts Section**:
- List of critical alerts (max 5)
- Alert card per item
  - Icon (color-coded by severity)
  - Message
  - Action button (e.g., "Review now")
  - Dismiss icon

**Activity Feed**:
- Timeline of recent events
  - Candidate shortlisted
  - Interview completed
  - Offer accepted/declined
- Each item: Avatar, event description, timestamp, link to details

**FR Traceability**: FR-029, FR-034, FR-036

### 4.3.1.1 System-Wide Alert Banners

**Purpose**: Communicate critical system status to all internal users

**Placement**: Top of page, below header navigation, across all HR/Recruiter/Admin screens

**Types**:

1. **AI Fallback Mode Banner**:
   - Background: Amber warning surface
   - Icon: Alert triangle (amber)
   - Message: "AI Screening Service Degraded"
   - Details: "Resume screening is currently in fallback mode. New applications are queued for batch processing. Auto-advance is temporarily disabled."
   - CTA: "View system health" button (links to `/admin/health`)
   - Dismiss icon (but persists on page refresh while fallback active)
   - **FR Traceability**: FR-025, BR-16

2. **Communication Service Degraded Banner**:
   - Background: Red danger surface
   - Icon: X circle (red)
   - Message: "Email Delivery Service Offline"
   - Details: "Candidate communications are queued but not being sent. Manual follow-up may be required."
   - CTA: "View failed messages" button
   - Dismiss icon
   - **FR Traceability**: BR-10

3. **SLA Breach Alert Banner**:
   - Background: Red danger surface
   - Icon: Clock (red)
   - Message: "5 candidates have breached review SLA"
   - CTA: "View overdue queue" button (filters queue to show only breached)
   - Dismiss icon
   - **FR Traceability**: FR-034, FR-060

4. **WebSocket Connection Status**:
   - **Location**: Top-right corner of header (small indicator)
   - Connected: Green dot + tooltip "Real-time updates active"
   - Reconnecting: Yellow dot + "Reconnecting..." + spinner
   - Disconnected: Red dot + "Connection lost. Page may show stale data. Refresh to reconnect."
   - **Behavior**:
     - When disconnected, show non-dismissible banner: "Real-time updates unavailable. Data may be stale. [Refresh page] button"
   - **FR Traceability**: DQ-006 (Design Question)

#### 4.3.2 HR Review Queue

**Route**: `/hr/queue`

**Role**: HR Reviewer

**Purpose**: Review AI-screened candidates and make shortlist/reject decisions

**Layout**:
- Left: Filters sidebar (collapsible)
- Right: Candidate table or kanban view (toggle)

**Filters**:
- Requisition (multi-select dropdown)
- Stage (multi-select: screening, review, interview)
- SLA status (checkboxes: on track, approaching, breached)
- AI confidence band (checkboxes: high, medium, low)
- Model version (dropdown)
- Date range (date picker)

**Table View Columns**:
1. Candidate Name (link to detail)
2. Job Title (link to requisition)
3. Submitted Date
4. AI Score (confidence meter)
5. SLA Deadline (countdown timer, color-coded)
6. Status (badge)
7. Actions (dropdown: View, Shortlist, Reject)

**Kanban View Columns**:
- Pending Review
- Shortlisted
- Rejected
- Drag and drop between columns triggers decision modal

**Candidate Card (in table or kanban)**:
- Candidate name
- Job title
- AI score (circular confidence meter)
- Top 3 positive factors (chips)
- SLA countdown (color-coded)
- Status badge
- Action buttons

**Bulk Actions**:
- Select multiple candidates (checkboxes)
- Bulk reject button
- Requires reason code selection
- Confirmation modal

**FR Traceability**: FR-029, FR-030, FR-034, FR-035, FR-036

#### 4.3.3 Candidate Detail & Decision Panel

**Route**: `/hr/candidates/:id`

**Role**: HR Reviewer, Recruiter

**Purpose**: View full candidate profile and make decision

**Layout**:
- Left sidebar: Candidate summary + AI insights
- Middle: Tabs (Resume, Timeline, Screening Details, Interviews, Notes)
- Right sidebar: Decision panel

**Left Sidebar Components**:
- Candidate avatar + name
- Contact info (email, phone)
- Submitted date
- Current stage badge
- AI confidence meter (large)
- Top 5 positive factors (chips)
- Top 5 skill gaps (chips with x icon)

**Tabs**:
1. Resume: Embedded PDF viewer or parsed text
2. Timeline: Vertical timeline of all events
3. Screening Details: AI model version, raw score, factors breakdown
4. Interviews: List of completed/scheduled interviews with scorecards
5. Notes: Internal notes (add/edit)

**Right Sidebar (Decision Panel)**:
- Shortlist button (primary, large)
- Reject button (danger, large)
- Reason code dropdown (required)
- Justification textarea (optional)
- Submit decision button
- Override path classification section (if shortlisted)
  - Current path badge (fresher/experienced)
  - Override toggle
  - Justification input (if override)

**Modals**:
- Shortlist confirmation: "Are you sure?"
- Reject confirmation: "Are you sure? This will trigger rejection email."
- Override approval: "Request sent to [manager]"

**FR Traceability**: FR-027, FR-029, FR-030, FR-032, FR-033

#### 4.3.4 Interview Planner

**Route**: `/hr/interviews/:applicationId`

**Role**: Recruiter

**Purpose**: Schedule interviews and manage panel

**Layout**:
- Top: Application summary
- Middle: Interview stages (cards, one per stage)
- Bottom: Save changes button

**Application Summary Card**:
- Candidate name
- Job title
- Current stage
- Path classification (fresher/experienced)

**Interview Stage Card**:
- Stage name (e.g., "Aptitude Test", "Technical Interview", "HR Round")
- Status badge (scheduled, completed, pending)
- Schedule section (if not scheduled)
  - Date picker (calendar view)
  - Time slot selector (dropdown)
  - Duration dropdown
  - Timezone display (candidate's timezone)
  - Conflict indicator (if slot conflicts with panel availability)
- Panel section (if applicable)
  - Add interviewer button
  - Interviewer list
    - Name, role
    - Confirmation status badge (pending, accepted, declined)
    - Remove button
- Assessment link section (if assessment stage)
  - "Generate assessment link" button
  - Link display (copyable)
  - Session status (active, expired)
- Scorecard section (if completed)
  - View scorecard button
  - Recommendation badge

**Calendar View (embedded)**:
- Month view by default
- Day cells show available/conflicting slots
- Color-coded: Available (green), Conflicting (red), Selected (blue)

**FR Traceability**: FR-037, FR-038, FR-039, FR-044, FR-047, FR-048

#### 4.3.5 Scorecard Form

**Route**: `/hr/interviews/:stageId/scorecard`

**Role**: Technical Interviewer

**Purpose**: Submit interview scorecard

**Layout**:
- Top: Candidate context panel (read-only)
- Middle: Rubric sections
- Bottom: Overall recommendation + submit

**Candidate Context Panel** (Collapsible):
- Candidate name, job title
- Resume (download link)
- AI screening score + factors
- Previous interview recommendations (if any)

**Rubric Sections** (one per dimension):
- Dimension name (e.g., "Problem Solving")
- Rating scale (1–5 radio buttons with labels)
  - 1: Poor
  - 2: Below expectations
  - 3: Meets expectations
  - 4: Exceeds expectations
  - 5: Outstanding
- Comments textarea (optional)

**Mandatory Dimensions** (per spec):
- Problem Solving
- Technical Depth
- Communication
- Code Quality
- System Design

**Overall Recommendation Section**:
- Radio buttons:
  - Strong Hire
  - Hire
  - No Hire
  - Strong No Hire
- Final comments textarea (optional)

**Validation**:
- All mandatory dimensions must be rated
- Submission blocked with error if any missing

**FR Traceability**: FR-041, FR-045

#### 4.3.6 Decision Workbench

**Route**: `/hr/decisions/:applicationId`

**Role**: HR Manager

**Purpose**: Make final hiring decision

**Layout**:
- Top: Candidate summary
- Middle: Stage summary cards
- Bottom: Decision section

**Candidate Summary Card**:
- Name, job title
- Application submitted date
- Current stage badge
- Withdrawal button (if applicable)

**Stage Summary Cards** (one per stage):
- Stage name
- Status badge (completed, pending)
- Completion date
- Score/recommendation
- View details button

**Prerequisite Checklist** (if incomplete):
- List of incomplete mandatory stages
- Each item: Stage name, status
- Decision controls disabled until all complete

**Decision Section** (enabled when prerequisites met):
- Compensation band display
  - Band tier (e.g., "Tier 3")
  - Approval matrix note (e.g., "Requires CFO approval")
- Decision outcome radio buttons:
  - Offer
  - Reject
  - Hold
  - Withdraw
- Reason code dropdown (required)
- Justification textarea (optional)
- Submit decision button (primary, large)

**Offer Flow** (if "Offer" selected):
- Additional fields appear:
  - Salary input
  - Start date picker
  - Offer expiry date picker
- "Generate offer letter" button
- Offer letter preview (after generation)
- Token validation status (all tokens resolved: green checkmark)
- Dispatch offer button

**Approval Chain Section** (if required):
- List of required approvers
- Each approver: Name, role, status badge (pending, approved, rejected)
- "Send for approval" button
- Status: "Awaiting approval from [name]"

**FR Traceability**: FR-049, FR-050, FR-051, FR-052, FR-056

#### 4.3.7 Communication Log

**Route**: `/hr/communications/:applicationId`

**Role**: Recruiter

**Purpose**: View all communications sent to candidate

**Layout**:
- Timeline of communication events
- Filter by type, status

**Timeline Item**:
- Communication type (e.g., "Application Confirmation", "Rejection", "Offer")
- Template used (name + version)
- Sent timestamp
- Delivery status badge (queued, sent, delivered, bounced, failed)
- Retry count (if retried)
- View message button (opens modal with full content)
- Resend button (if failed)

**Filters**:
- Type (dropdown: all, confirmation, rejection, interview, offer)
- Status (checkboxes: sent, delivered, bounced, failed)
- Date range

**FR Traceability**: FR-054, FR-058, FR-059

### 4.4 Admin Screens

#### 4.4.1 Admin Dashboard

**Route**: `/admin/dashboard`

**Role**: System Admin

**Purpose**: Platform health and quick access to admin tools

**Layout**:
- Top: Health metrics cards
- Middle: Recent configuration changes
- Bottom: Quick actions

**Health Metrics Cards**:
1. BullMQ Queue Depth
   - Current depth (number)
   - Trend chart (sparkline)
   - Status indicator (green: < 100, yellow: 100–500, red: > 500)
2. AI Worker Status
   - Status badge (operational, degraded, offline)
   - Last health check timestamp
3. Email Delivery Rate
   - Success rate percentage (last 24h)
   - Trend chart (sparkline)
4. Database Performance
   - P95 query latency
   - Connection pool usage

**Recent Configuration Changes**:
- Table of last 10 changes
- Columns: Author, Change type, Timestamp, View details

**Quick Actions**:
- Manage users
- Configure thresholds
- View audit log
- Manage templates

**FR Traceability**: FR-067

#### 4.4.2 User Management

**Route**: `/admin/users`

**Role**: System Admin

**Purpose**: Create, deactivate, assign roles

**Layout**:
- Top: Search bar + "Create user" button
- Middle: User table
- Right sidebar: User detail panel (when user selected)

**User Table Columns**:
1. Name
2. Email
3. Role (badge)
4. Status (badge: active, deactivated)
5. Created date
6. Actions (dropdown: Edit, Deactivate, Reset password)

**Create User Modal**:
- Name input
- Email input
- Role dropdown (applicant, recruiter, hr-reviewer, technical-interviewer, hr-manager, admin)
- Send invitation email checkbox
- Create button

**User Detail Panel** (right sidebar):
- Avatar + name
- Email, role, status
- Created date, last login
- Edit role button
- Deactivate/Reactivate button
- Reset password button
- Activity log (last 10 events)

**FR Traceability**: FR-063

#### 4.4.3 Threshold Configuration

**Route**: `/admin/thresholds`

**Role**: System Admin

**Purpose**: Configure AI match score thresholds per job family

**Layout**:
- Top: Job family selector (dropdown)
- Middle: Threshold editor
- Bottom: Save changes button

**Threshold Editor** (per job family):
- Auto-shortlist threshold (slider, 0–100)
  - Label: "Candidates scoring above this will auto-advance to HR review"
  - Current value display
- Low confidence threshold (slider, 0–100)
  - Label: "Candidates with confidence below this will be flagged for manual review"
  - Current value display
- Effective date picker
- Change history table
  - Columns: Author, Old value, New value, Effective date, Timestamp

**Save Confirmation Modal**:
- "This change will apply to new evaluations only. Existing evaluations will retain the previous threshold."
- Confirm/Cancel buttons

**FR Traceability**: FR-024, FR-065

#### 4.4.4 Audit Log Viewer

**Route**: `/admin/audit`

**Role**: System Admin

**Purpose**: Search and export audit events

**Layout**:
- Top: Search filters
- Middle: Event table
- Bottom: Export button

**Search Filters**:
- Actor (autocomplete input)
- Event type (multi-select dropdown: login, logout, decision, communication, etc.)
- Entity (autocomplete: candidate name, application ID)
- Date range (date picker)

**Event Table Columns**:
1. Timestamp
2. Actor (name + role)
3. Event type (badge)
4. Entity (link to detail)
5. IP address
6. Actions (View details button)

**Event Detail Modal**:
- Full event payload (JSON formatted)
- Copy JSON button
- Close button

**Export Button**:
- Exports visible results to CSV
- Shows loading spinner during export
- Download starts automatically when ready

**FR Traceability**: FR-066

#### 4.4.5 Template Management

**Route**: `/admin/templates`

**Role**: System Admin

**Purpose**: Create and edit email templates

**Layout**:
- Left: Template list (sidebar)
- Right: Template editor

**Template List**:
- Filter by type (dropdown: all, confirmation, rejection, interview, offer)
- Template item per template
  - Name
  - Type badge
  - Active indicator (green dot)
  - Edit button

**Template Editor**:
- Template name input
- Type dropdown
- Locale dropdown
- Subject line input
- Body editor (rich text)
  - Token picker button (inserts tokens like `{{candidate.firstName}}`)
  - Preview button
- Active toggle
- Save button

**Token Picker Modal**:
- List of available tokens grouped by entity
- Click to insert at cursor position

**Preview Modal**:
- Shows template with sample data
- Tabs: Desktop view, Mobile view
- Close button

**FR Traceability**: FR-057

#### 4.4.6 Business Rules Configuration

**Route**: `/admin/business-rules`

**Role**: System Admin

**Purpose**: Configure platform business rules

**Layout**:
- Tabbed interface for different rule categories
- Save changes button (applies to all tabs)

**Tabs**:

1. **Application Rules Tab**:
   - Cooling period duration (slider: 0-365 days)
     - Current value: 30 days
     - Label: "Prevent duplicate applications within X days"
   - Max resume file size (slider: 1-20 MB)
   - Allowed resume formats (checkboxes: PDF, DOCX)
   - Malware scanning toggle

2. **Path Assignment Rules Tab**:
   - Experience threshold for fresher path (slider: 0-5 years)
     - Current value: 2 years
     - Label: "Candidates with ≤ X years go to fresher path"
   - Auto-path assignment toggle (if off, requires manual classification)

3. **SLA Configuration Tab**:
   - HR review SLA (input: hours)
     - Default: 48 hours
   - Interview scheduling SLA (input: hours)
     - Default: 24 hours
   - Final decision SLA (input: hours)
     - Default: 24 hours
   - SLA warning threshold percentage (slider: 50-95%)
     - Default: 80% (alerts when 80% of SLA time consumed)

4. **Communication Rules Tab**:
   - Max communication retry attempts (slider: 1-10)
     - Default: 5
   - Retry intervals configuration (exponential backoff)
   - Email delivery timeout (seconds)

5. **Security Rules Tab**:
   - Max login attempts before lockout (slider: 3-10)
     - Default: 5
   - Lockout duration (minutes: 15-60)
     - Default: 30
   - Session timeout (minutes: 15-60)
     - Default: 30
   - Session warning time before logout (minutes: 1-10)
     - Default: 5

**Change History Panel** (bottom):
- Shows last 10 rule changes
- Columns: Rule, Old value, New value, Changed by, Timestamp

**FR Traceability**: FR-024, FR-064, BR-03, BR-04, BR-05, BR-08

#### 4.4.7 Approval Matrix Configuration

**Route**: `/admin/approval-matrix`

**Role**: System Admin

**Purpose**: Configure offer approval chains by compensation band

**Layout**:
- Top: "Add compensation band" button
- Middle: Compensation band table
- Right sidebar: Selected band detail editor

**Compensation Band Table**:
- Columns:
  1. Band name (e.g., "Tier 1", "Tier 2")
  2. Salary range (min-max)
  3. Approval levels required
  4. Active status toggle
  5. Actions (Edit, Delete)

**Band Detail Editor** (right sidebar):
- Band name input
- Salary range inputs (min, max)
- Currency dropdown
- Approval chain builder:
  - Add approver button
  - Approver list (drag to reorder)
  - Each approver item:
    - Role dropdown (HR Manager, Director, VP, CFO, CEO)
    - Required toggle (if on, offer cannot proceed without approval)
    - Remove button
- Active toggle
- Save button

**Approval Flow Preview**:
- Visual flow diagram showing approval sequence
- Displays for the selected band

**FR Traceability**: FR-051, BR-07

#### 4.4.8 AI Model Configuration

**Route**: `/admin/ai-config`

**Role**: System Admin

**Purpose**: Configure AI screening model settings

**Layout**:
- Top: Current model version card
- Middle: Configuration panels
- Bottom: Model version history

**Current Model Version Card**:
- Model ID and version
- Deployment date
- Status badge (active, testing, deprecated)
- Performance metrics:
  - Accuracy rate
  - Agreement rate with HR decisions
  - Average confidence score

**Configuration Panels**:

1. **Model Selection**:
   - Available models dropdown
   - Deploy button
   - Rollback button

2. **Confidence Thresholds**:
   - Low confidence threshold (slider: 0-100%)
     - Default: 50%
     - Label: "Below this, flag for manual review"
   - Auto-advance threshold (slider: 0-100%)
     - Default: 80%
     - Label: "Above this, auto-advance to HR queue"

3. **Fallback Configuration**:
   - Fallback mode toggle
   - Fallback behavior dropdown:
     - Queue for batch processing
     - Route all to manual review
     - Pause new screenings
   - Notification recipients (multi-select: roles to notify)

**Model Version History Table**:
- Columns: Version, Deployed date, Retired date, Evaluations count, Agreement rate
- View details button per version

**FR Traceability**: FR-024, FR-025, FR-026, BR-02, BR-16

#### 4.4.9 System Health & Monitoring

**Route**: `/admin/health`

**Role**: System Admin

**Purpose**: Monitor platform health and service status

**Layout**:
- Top: Service status grid
- Middle: Queue metrics
- Bottom: Recent incidents

**Service Status Grid** (4 columns):
1. **AI Worker**
   - Status badge (operational, degraded, offline)
   - Last health check: timestamp
   - Avg response time: ms
   - Fallback mode indicator (if active)
   - View logs button

2. **Email Service**
   - Status badge
   - Delivery rate (last 24h): percentage
   - Bounce rate: percentage
   - Failed messages count
   - View queue button

3. **Database**
   - Status badge
   - Connection pool: X/Y active
   - P95 query latency: ms
   - Long-running queries: count
   - View slow queries button

4. **Background Jobs**
   - Status badge
   - Active jobs: count
   - Failed jobs: count
   - Oldest pending job: age
   - View BullMQ dashboard button

**Queue Metrics Panel**:
- BullMQ queue depth chart (line chart, last 24h)
- Queue breakdown by type (pie chart):
  - Screening queue
  - Communication queue
  - Notification queue
  - Scheduled tasks queue
- Alert threshold indicator (red line on chart)

**Recent Incidents Table**:
- Columns: Severity, Service, Description, Started, Resolved, Duration
- Severity badges: Critical (red), Warning (yellow), Info (blue)
- Filter by severity and service

**Auto-refresh toggle**: Refreshes every 60 seconds when enabled

**FR Traceability**: FR-067, BR-16

### 4.5 Analytics Screens

#### 4.5.1 Pipeline Analytics Dashboard

**Route**: `/analytics/pipeline`

**Role**: Recruiter, HR Manager

**Purpose**: View pipeline metrics and funnels

**Layout**:
- Top: KPI cards
- Middle: Funnel chart + filters
- Bottom: Stage conversion table

**KPI Cards** (4 columns):
1. Total Applications
   - Count (last 30 days)
   - Trend indicator (↑/↓ vs. previous 30 days)
2. Shortlist Rate
   - Percentage
   - Trend indicator
3. Avg. Time to Hire
   - Days
   - Trend indicator
4. AI-Human Agreement Rate
   - Percentage
   - Trend indicator

**Funnel Chart**:
- Stages on Y-axis (submitted, screened, reviewed, interviewed, offered, hired)
- Candidate count per stage (horizontal bars)
- Drop-off percentage between stages
- Filter by requisition (dropdown)

**Stage Conversion Table**:
- Columns: Stage, Count, Conversion rate, Avg. time in stage
- Export as CSV button

**FR Traceability**: FR-069, FR-070, FR-071

#### 4.5.2 AI Accuracy Dashboard

**Route**: `/analytics/ai-accuracy`

**Role**: HR Manager, System Admin

**Purpose**: Track AI model accuracy over time

**Layout**:
- Top: Model version selector + date range
- Middle: Accuracy chart
- Bottom: Confusion matrix

**Accuracy Chart**:
- Line chart showing human-AI agreement rate over time
- X-axis: Date
- Y-axis: Agreement rate (0–100%)
- Filter by model version (dropdown)

**Confusion Matrix**:
- 2×2 grid:
  - True Positive (AI: Shortlist, HR: Shortlist)
  - False Positive (AI: Shortlist, HR: Reject)
  - False Negative (AI: Reject, HR: Shortlist)
  - True Negative (AI: Reject, HR: Reject)
- Cell values: Count + percentage
- Color-coded: Green (correct), Red (incorrect)

**FR Traceability**: FR-071

---

## 5. User Flows

### 5.1 Candidate Registration & Application Flow

```
Landing Page
    │
    ▼
Registration Page (Step 1: Enter contact details)
    │
    ▼
Registration Page (Step 2: OTP verification)
    │
    ▼
Registration Page (Step 3: Consent)
    │
    ▼
Candidate Dashboard (Welcome + onboarding checklist)
    │
    ▼
Job Search & Browse (Filter and search)
    │
    ▼
Job Detail Page (View full description)
    │
    ▼
Application Form (Step 1: Personal info)
    │
    ▼
Application Form (Step 2: Resume upload)
    │
    ▼
Application Form (Step 3: Additional questions)
    │
    ▼
Application Form (Step 4: Review & submit)
    │
    ▼
Application Confirmation Page
    │
    ▼
Application Timeline Page (Track progress)
```

### 5.2 HR Review & Decision Flow

```
HR Dashboard (View pending reviews count)
    │
    ▼
HR Review Queue (Filter and sort)
    │
    ▼
Candidate Detail & Decision Panel (Review AI insights)
    │
    ▼
Decision: Shortlist or Reject
    │
    ├─ Reject ─▶ Rejection email sent ─▶ Workflow closed
    │
    └─ Shortlist ─▶ Path classification (Fresher/Experienced)
                       │
                       ▼
              Interview Planner (Schedule stages)
                       │
                       ▼
              Interview Confirmation (Candidate confirms)
                       │
                       ▼
              Assessment/Interview (Candidate completes)
                       │
                       ▼
              Scorecard Submission (Interviewer submits)
                       │
                       ▼
              Decision Workbench (HR Manager makes final decision)
                       │
                       ├─ Reject ─▶ Rejection email ─▶ Closed
                       │
                       └─ Offer ─▶ Approval chain (if required)
                                      │
                                      ▼
                              Offer letter generated
                                      │
                                      ▼
                              Offer sent to candidate
                                      │
                                      ▼
                              Offer Review Page (Candidate)
                                      │
                                      ├─ Decline ─▶ Closed
                                      │
                                      └─ Accept ─▶ Requisition slot decremented ─▶ Onboarding
```

### 5.3 Interview Scheduling Flow

```
Recruiter Dashboard
    │
    ▼
Interview Planner (Select application)
    │
    ▼
Select stage (Aptitude, Technical, HR Round)
    │
    ▼
Choose date & time (Calendar view, check conflicts)
    │
    ▼
Add panel members (If applicable)
    │
    ▼
Send invitations (Email to candidate and panel)
    │
    ▼
Candidate confirms attendance
    │
    ▼
Panel members confirm availability
    │
    ▼
Interview conducted
    │
    ▼
Scorecard submitted by interviewer
    │
    ▼
Recruiter notified
    │
    ▼
Next stage enabled or final decision triggered
```

---

## 6. Responsive Breakpoints

| Breakpoint | Width | Target Device | Layout Adjustments |
| --- | --- | --- | --- |
| `xs` (mobile) | `< 640px` | Smartphones | Single column, stacked navigation, bottom tabs |
| `sm` (mobile) | `640px – 767px` | Large phones | Single column, collapsible filters |
| `md` (tablet) | `768px – 1023px` | Tablets | Two-column layouts, sidebar toggles |
| `lg` (desktop) | `1024px – 1279px` | Laptops | Multi-column, fixed sidebars |
| `xl` (desktop) | `1280px – 1535px` | Desktop monitors | Max content width, larger cards |
| `2xl` (large desktop) | `≥ 1536px` | Large monitors | Max content width with side margins |

### 6.1 Responsive Patterns

**Navigation**:
- Mobile: Bottom tab bar (candidate portal), hamburger menu (internal portal)
- Tablet: Collapsible sidebar
- Desktop: Fixed sidebar, always visible

**Tables**:
- Mobile: Card view (one card per row)
- Tablet: Horizontal scroll
- Desktop: Full table

**Modals**:
- Mobile: Full-screen (100vw × 100vh)
- Tablet: 90% width
- Desktop: Fixed width (480px, 600px, 800px)

**Forms**:
- Mobile: Single column
- Tablet: Two-column for shorter fields (e.g., first name, last name side-by-side)
- Desktop: Two-column layouts

---

## 7. Accessibility Requirements (WCAG 2.2 AA)

### 7.1 Color & Contrast

| Requirement | Standard | Implementation |
| --- | --- | --- |
| Text contrast | 4.5:1 (normal text), 3:1 (large text) | All color tokens meet contrast ratios |
| UI component contrast | 3:1 | Buttons, form borders, focus indicators meet 3:1 |
| Color not sole indicator | Status always paired with icon + text | Badges include icon + label, not just color |

### 7.2 Keyboard Navigation

| Element | Keyboard Support |
| --- | --- |
| All interactive elements | Focusable via Tab, activated via Enter/Space |
| Modals | Trap focus, close via Esc, restore focus on close |
| Dropdowns | Arrow keys navigate options, Enter selects |
| Tables | Arrow keys navigate cells (if interactive) |
| Skip navigation | Skip to main content link at page top |

### 7.3 Focus Indicators

- All focusable elements show visible focus ring: `box-shadow: var(--shadow-focus)`
- Focus ring color: `--color-border-focus` (indigo)
- Minimum thickness: 2px
- Focus indicator never hidden (via `outline: none` without replacement)

### 7.4 ARIA Attributes

| Component | ARIA Attributes |
| --- | --- |
| Buttons | `role="button"`, `aria-label` (if icon-only), `aria-pressed` (toggles) |
| Form inputs | `aria-required`, `aria-invalid`, `aria-describedby` (for error messages) |
| Modals | `role="dialog"`, `aria-modal="true"`, `aria-labelledby`, `aria-describedby` |
| Tabs | `role="tablist"`, `role="tab"`, `role="tabpanel"`, `aria-selected` |
| Alerts | `role="alert"` or `role="status"`, `aria-live="polite|assertive"` |
| Progress bars | `role="progressbar"`, `aria-valuenow`, `aria-valuemin`, `aria-valuemax` |
| Loading spinners | `role="status"`, `aria-live="polite"`, `aria-label="Loading"` |

### 7.5 Screen Reader Support

- All images have meaningful `alt` text (or `alt=""` if decorative)
- Form labels always associated with inputs (via `for` attribute or wrapping)
- Dynamic content changes announced via ARIA live regions
- Loading states announced (e.g., "Loading candidates")
- Landmarks for page regions: `<header>`, `<nav>`, `<main>`, `<aside>`, `<footer>`

### 7.6 Motion & Animation

- All animations respect `prefers-reduced-motion` media query
- If `prefers-reduced-motion: reduce`, disable non-essential animations
- Essential animations (loading indicators) remain but with reduced motion

### 7.7 Non-Functional UI Requirements

#### 7.7.1 Performance Indicators

All time-sensitive operations must display clear progress and completion feedback:

| Operation | SLA Target | UI Indicator | Progress Feedback |
| --- | --- | --- | --- |
| Resume upload | < 30 seconds | Upload progress bar (0-100%) | File size, upload speed, time remaining |
| AI resume screening | < 3 minutes | Animated spinner + status message | "Parsing resume...", "Analyzing skills...", "Generating score..." |
| Application auto-save | 60 seconds (background) | Auto-save indicator with timestamp | "Saved 2 minutes ago", "Saving..." |
| Communication send | < 5 minutes | Delivery status badge | "Queued" → "Sent" → "Delivered" |
| Decision PDF generation | < 10 seconds | Loading spinner | "Generating document..." |
| Page load (first contentful paint) | < 2 seconds | Skeleton loaders | Shimmer effect on cards/tables |
| API response time | < 500ms (p95) | Loading spinner on slow requests | Appears if request takes > 300ms |

**Loading State Standards**:
- Inline loading: Small spinner (16px) for buttons and small actions
- Card loading: Skeleton loader matching card dimensions
- Page loading: Full-page spinner with app logo
- Background operations: Toast notification on completion

#### 7.7.2 Error Handling & Resilience

**Error Message Hierarchy**:
1. **Inline field errors**: Red text below input with specific error (e.g., "Email format invalid")
2. **Form-level errors**: Error summary card at top of form with error count and list
3. **Page-level errors**: Banner across top with icon, message, and retry/dismiss actions
4. **Modal errors**: Error modal for critical failures (e.g., "Payment failed")

**Error Message Content**:
- **User-friendly language**: No technical jargon or stack traces
- **Actionable**: Tell user what to do next (e.g., "Try again" vs. "Refresh page" vs. "Contact support")
- **Context**: Explain what went wrong (e.g., "Your session expired" vs. "Network error")
- **Error ID**: For support reference (e.g., "Error ID: ERR-2026-07-22-12345")

**Network Failure Handling**:
- Show offline indicator when network lost
- Queue actions for retry when reconnected
- Show "You're offline" banner with offline capabilities (if any)
- Graceful degradation: Read-only mode if backend unavailable

**Timeout Handling**:
- API timeout: 30 seconds → Show timeout message with retry button
- Session timeout: 30 minutes inactivity → Show 5-minute warning modal (FR-009)
- Upload timeout: 60 seconds → Cancel upload + show retry option

#### 7.7.3 Security & Privacy UI Elements

**Mandatory Security Indicators**:
- HTTPS lock icon in browser (enforced by HSTS headers)
- Password strength meter with real-time feedback:
  - Red (weak): < 8 characters or missing requirements
  - Yellow (fair): 8-10 characters, meets some requirements
  - Green (strong): 10+ characters, meets all requirements
- Two-factor authentication badge (if enabled)
- Active sessions list with device, location, last active

**Privacy Indicators**:
- Cookie consent banner (first visit only, dismissible)
  - "Accept all", "Reject non-essential", "Customize" buttons
- Data processing notices at point of collection:
  - Registration: "By registering, you consent to our Privacy Policy and AI Processing Notice"
  - Resume upload: "Your resume will be analyzed by AI. We do not share your data with third parties."
- Privacy policy version and last updated date (footer link)

**Audit Trail Access (for candidates)**:
- "View my data" link in profile
- Shows: Applications, communications, decisions, AI scores
- Download data button (JSON export)
- Delete account request button with confirmation flow

#### 7.7.4 Offline & Degraded State UI

**Offline Capability**:
- Candidate Portal: Read-only access to application timeline (cached)
- HR Portal: No offline capability (requires real-time data)

**Degraded Service States**:
- AI fallback mode: Banner + "Screening delayed" badges (covered in 4.3.1.1)
- Email service down: Banner + manual follow-up notice
- Database slow: "Loading" states persist longer + "System experiencing delays" notice

**Progressive Enhancement**:
- Core functionality works without JavaScript (forms submit via POST)
- Enhanced features (real-time updates, animations) layer on top
- Fallback to static rendering if client-side rendering fails

---

## 8. Design Handoff Notes

### 8.1 Figma File Structure

**Recommended page organization**:
1. **🎨 Design System**
   - Color palette
   - Typography scale
   - Component library
   - Iconography
2. **📱 Candidate Portal**
   - Registration & login
   - Dashboard & job search
   - Application & timeline
   - Assessment & offers
3. **💼 Recruiter & HR Portal**
   - Dashboard & queue
   - Candidate detail & decision
   - Interview planner
   - Communication log
4. **⚙️ Admin Portal**
   - User management
   - Threshold configuration
   - Audit log & templates
5. **📊 Analytics**
   - Pipeline dashboard
   - AI accuracy dashboard
6. **📐 Responsive Views**
   - Mobile variants (375px, 414px)
   - Tablet variants (768px)
   - Desktop variants (1440px)

### 4.2.10 Profile Management Page

**Route**: `/candidate/profile`

**Role**: Applicant

**Purpose**: Edit profile information and notification preferences

**Layout**:
- Top: Profile header with avatar
- Middle: Tabs (Personal Info, Preferences, Security)
- Bottom: Save changes button

**Tabs**:

1. **Personal Info Tab**:
   - Name (read-only after verification)
   - Email (read-only after verification)
   - Phone
   - Experience years
   - Skills (multi-select tags)
   - Education history
   - Previous employers

2. **Preferences Tab**:
   - Email notifications toggle
   - SMS notifications toggle (per FR-062)
   - Communication preferences per type:
     - Application updates
     - Interview reminders
     - Offer communications
   - Weekly digest opt-in

3. **Security Tab**:
   - Change password section
   - Two-factor authentication toggle
   - Active sessions list
   - Account deletion request button

**FR Traceability**: FR-015, FR-062

#### 4.2.11 Notification Center

**Route**: `/candidate/notifications` (or as a dropdown panel)

**Role**: All authenticated users

**Purpose**: View all in-app notifications

**Layout**:
- Header with "Mark all as read" button
- Notification list (grouped by date)
- Filter tabs: All, Unread, Alerts

**Notification Item**:
- Icon (color-coded by type)
- Title and message
- Timestamp (relative: "2 hours ago")
- Read/Unread indicator (blue dot)
- Action button (if applicable)
- Dismiss icon

**Types**:
- Application status change
- Interview reminder
- SLA breach alert (for HR)
- Communication failure (for recruiters)
- System announcements

**Empty State**:
- Illustration + "No notifications"

**FR Traceability**: FR-036, FR-046, FR-060

#### 4.2.12 Error Pages

**4.2.12.1 404 Page Not Found**

**Route**: `/*` (catch-all)

**Purpose**: Handle invalid routes

**Components**:
- Error code (404)
- Friendly message: "Page not found"
- Illustration
- Suggested actions:
  - Return to dashboard
  - Browse jobs
  - Contact support

**4.2.12.2 500 Server Error**

**Purpose**: Handle unexpected errors

**Components**:
- Error code (500)
- Friendly message: "Something went wrong"
- Illustration
- Error ID (for support reference)
- Actions:
  - Try again button
  - Return to dashboard
  - Report issue

**4.2.12.3 403 Forbidden**

**Purpose**: Handle unauthorized access

**Components**:
- Error code (403)
- Message: "You don't have permission to access this page"
- Illustration
- Actions:
  - Return to your dashboard
  - Contact admin

### 4.6 Additional Screens

#### 4.6.1 Requisition Management (for Recruiters)

**Route**: `/hr/requisitions`

**Role**: Recruiter

**Purpose**: Manage job requisitions

**Layout**:
- Top: "Create Requisition" button + search bar
- Middle: Requisition table
- Filters sidebar

**Requisition Table Columns**:
1. Job Title (link to detail)
2. Department
3. Open Slots / Total Slots
4. Status (badge: open, closed, on hold)
5. Posted Date
6. Applications Count
7. Actions (Edit, Close, View Analytics)

**FR Traceability**: FR-064, FR-068

#### 4.6.2 No-Show Management Screen

**Route**: `/hr/interviews/:stageId/no-show`

**Role**: Recruiter

**Purpose**: Handle interview no-show events

**Components**:
- Candidate info card
- Interview details (date, time, stage)
- Action options:
  - Reschedule (opens calendar)
  - Mark as withdrawn
  - Proceed with rejection
- Reason code dropdown
- Notes textarea
- Submit button

**FR Traceability**: FR-042, BR-09

---

## 5. User Flows

### 5.4 Password Reset Flow

```
Login Page
    │
    ▼
Click "Forgot Password?"
    │
    ▼
Forgot Password Page (Enter email)
    │
    ▼
Email Sent Confirmation
    │
    ▼
User clicks link in email
    │
    ▼
Reset Password Page (Enter new password)
    │
    ▼
Password Changed Confirmation
    │
    ▼
Login Page (with success message)
```

### 5.5 Profile Edit Flow

```
Candidate Dashboard
    │
    ▼
Click "Edit Profile" or Avatar
    │
    ▼
Profile Management Page (Personal Info Tab)
    │
    ▼
Make changes
    │
    ▼
Save Changes button
    │
    ▼
Validation + Save
    │
    ▼
Success toast notification
    │
    ▼
Return to Dashboard or stay on Profile
```

### 5.6 Notification Management Flow

```
Any authenticated screen
    │
    ▼
Click notification bell icon (shows badge count)
    │
    ▼
Notification dropdown/panel opens
    │
    ▼
View notifications list
    │
    ├─ Click notification ─▶ Navigate to relevant screen
    │
    ├─ Mark as read ─▶ Remove unread indicator
    │
    └─ View all ─▶ Full Notification Center page
```

---

## 6. Responsive Breakpoints

| Breakpoint | Width | Target Device | Layout Adjustments |
| --- | --- | --- | --- |
| `xs` (mobile) | `< 640px` | Smartphones | Single column, stacked navigation, bottom tabs |
| `sm` (mobile) | `640px – 767px` | Large phones | Single column, collapsible filters |
| `md` (tablet) | `768px – 1023px` | Tablets | Two-column layouts, sidebar toggles |
| `lg` (desktop) | `1024px – 1279px` | Laptops | Multi-column, fixed sidebars |
| `xl` (desktop) | `1280px – 1535px` | Desktop monitors | Max content width, larger cards |
| `2xl` (large desktop) | `≥ 1536px` | Large monitors | Max content width with side margins |

### 6.1 Responsive Patterns

**Navigation**:
- Mobile: Bottom tab bar (candidate portal), hamburger menu (internal portal)
- Tablet: Collapsible sidebar
- Desktop: Fixed sidebar, always visible

**Tables**:
- Mobile: Card view (one card per row)
- Tablet: Horizontal scroll
- Desktop: Full table

**Modals**:
- Mobile: Full-screen (100vw × 100vh)
- Tablet: 90% width
- Desktop: Fixed width (480px, 600px, 800px)

**Forms**:
- Mobile: Single column
- Tablet: Two-column for shorter fields (e.g., first name, last name side-by-side)
- Desktop: Two-column layouts

---

## 6.2 Interaction Patterns

### 6.2.1 Keyboard Shortcuts (Power Users)

**Candidate Portal**:
- `/` — Focus search input
- `n` — View notifications
- `Esc` — Close modal/drawer

**HR Review Queue**:
- `s` — Shortlist selected candidate
- `r` — Reject selected candidate
- `]` — Next candidate
- `[` — Previous candidate
- `Space` — Expand/collapse candidate card
- `Cmd/Ctrl + K` — Open command palette (quick actions)

**Global**:
- `g d` — Go to dashboard
- `g h` — Go to home
- `?` — Show keyboard shortcuts help

### 6.2.2 Drag-and-Drop Patterns

**Resume Upload**:
- Drag PDF/DOCX over drop zone
- Drop zone highlights on hover
- File validation on drop
- Upload progress indicator
- Success/error feedback

**Kanban Board (HR Queue)**:
- Drag candidate card between columns
- Column highlights on hover
- Drop triggers decision modal (with reason code)
- Optimistic UI update with rollback on error

**Interview Scheduling (Calendar)**:
- Drag to select time slot range
- Snap to 15-minute intervals
- Conflict detection on drag
- Visual feedback (green: available, red: conflict)

### 6.2.3 Swipe Gestures (Mobile)

**Candidate Timeline**:
- Swipe left: View next stage
- Swipe right: View previous stage

**Notification List**:
- Swipe left: Mark as read / Delete
- Swipe right: View details

**HR Queue Cards**:
- Swipe right: Quick shortlist
- Swipe left: Quick reject
- Full swipe triggers confirmation modal

### 6.2.4 Real-Time Update Indicators

**WebSocket Connection Status**:
- Connected: Green dot in header
- Disconnected: Yellow dot + "Reconnecting..." message
- Failed: Red dot + "Connection lost. Refresh page"

**Live Data Updates** (via WebSocket):
- New candidate in queue: Slide-in animation + highlight
- Status change: Pulse animation on status badge
- SLA timer update: Real-time countdown (no refresh needed)
- Queue position change: Smooth reorder animation

**Update Toast**:
- Appears when data changes
- Format: "New candidate added to queue" with "View" button
- Auto-dismiss after 5 seconds
- Can be dismissed manually

---

## 7. Accessibility Requirements (WCAG 2.2 AA)

### 7.1 Color & Contrast

| Requirement | Standard | Implementation |
| --- | --- | --- |
| Text contrast | 4.5:1 (normal text), 3:1 (large text) | All color tokens meet contrast ratios |
| UI component contrast | 3:1 | Buttons, form borders, focus indicators meet 3:1 |
| Color not sole indicator | Status always paired with icon + text | Badges include icon + label, not just color |

### 7.2 Keyboard Navigation

| Element | Keyboard Support |
| --- | --- |
| All interactive elements | Focusable via Tab, activated via Enter/Space |
| Modals | Trap focus, close via Esc, restore focus on close |
| Dropdowns | Arrow keys navigate options, Enter selects |
| Tables | Arrow keys navigate cells (if interactive) |
| Skip navigation | Skip to main content link at page top |
| Keyboard shortcuts | Documented and discoverable via `?` key |

### 7.3 Focus Indicators

- All focusable elements show visible focus ring: `box-shadow: var(--shadow-focus)`
- Focus ring color: `--color-border-focus` (indigo)
- Minimum thickness: 2px
- Focus indicator never hidden (via `outline: none` without replacement)

### 7.4 ARIA Attributes

| Component | ARIA Attributes |
| --- | --- |
| Buttons | `role="button"`, `aria-label` (if icon-only), `aria-pressed` (toggles) |
| Form inputs | `aria-required`, `aria-invalid`, `aria-describedby` (for error messages) |
| Modals | `role="dialog"`, `aria-modal="true"`, `aria-labelledby`, `aria-describedby` |
| Tabs | `role="tablist"`, `role="tab"`, `role="tabpanel"`, `aria-selected` |
| Alerts | `role="alert"` or `role="status"`, `aria-live="polite|assertive"` |
| Progress bars | `role="progressbar"`, `aria-valuenow`, `aria-valuemin`, `aria-valuemax` |
| Loading spinners | `role="status"`, `aria-live="polite"`, `aria-label="Loading"` |
| Drag-and-drop | `aria-grabbed`, `aria-dropeffect` for accessible drag feedback |
| Real-time updates | `aria-live="polite"` for non-critical, `aria-live="assertive"` for critical |

### 7.5 Screen Reader Support

- All images have meaningful `alt` text (or `alt=""` if decorative)
- Form labels always associated with inputs (via `for` attribute or wrapping)
- Dynamic content changes announced via ARIA live regions
- Loading states announced (e.g., "Loading candidates")
- Landmarks for page regions: `<header>`, `<nav>`, `<main>`, `<aside>`, `<footer>`
- Keyboard shortcuts announced when help is requested

### 7.6 Motion & Animation

- All animations respect `prefers-reduced-motion` media query
- If `prefers-reduced-motion: reduce`, disable non-essential animations
- Essential animations (loading indicators) remain but with reduced motion
- Swipe gestures have keyboard alternatives

---

## 8. Design Handoff Notes

### 8.1 Figma File Structure

**Recommended page organization**:
1. **🎨 Design System**
   - Color palette
   - Typography scale
   - Component library
   - Iconography
2. **📱 Candidate Portal**
   - Registration & login
   - Dashboard & job search
   - Application & timeline
   - Assessment & offers
   - Profile & notifications
3. **💼 Recruiter & HR Portal**
   - Dashboard & queue
   - Candidate detail & decision
   - Interview planner
   - Communication log
   - Requisition management
4. **⚙️ Admin Portal**
   - User management
   - Threshold configuration
   - Audit log & templates
5. **📊 Analytics**
   - Pipeline dashboard
   - AI accuracy dashboard
6. **📐 Responsive Views**
   - Mobile variants (375px, 414px)
   - Tablet variants (768px)
   - Desktop variants (1440px)
7. **🚫 Error & Empty States**
   - 404, 500, 403 pages
   - Empty states for all screens
   - Loading states

### 8.2 Component Variants in Figma

Each component should have all states as variants:
- Buttons: Default, Hover, Active, Disabled, Loading
- Inputs: Default, Focus, Error, Disabled
- Badges: All 5 semantic types (success, warning, danger, info, neutral)
- Cards: Default, Hover (if interactive), Selected
- Table rows: Default, Hover, Selected

### 8.3 Auto-Layout & Constraints

- Use auto-layout for all components (for flexible sizing)
- Set constraints for responsive behavior (e.g., "Stretch" for full-width inputs)
- Use min/max width constraints where appropriate

### 8.4 Naming Conventions

**Components**: `ComponentName/Variant/State`
- Example: `Button/Primary/Default`, `Button/Primary/Hover`

**Screens**: `Role/ScreenName`
- Example: `Candidate/Dashboard`, `HR/Queue`

**Colors**: `Color/Token`
- Example: `Color/Brand/Primary`, `Color/Surface/1`

---

## 8.5 Business Rules Impact on UI

This section maps business rules from the BRD to UI implementation requirements.

| Rule ID | Business Rule | UI Implementation | Affected Screens |
| --- | --- | --- | --- |
| BR-01 | Resume missing or scan failed | Show error message + re-upload prompt | Application Form (4.2.4) |
| BR-02 | AI confidence below threshold | Display warning badge + route to manual queue | HR Review Queue (4.3.2) |
| BR-03 | Duplicate application within cooling period | Show blocking screen with countdown | Application Blocked Screen (4.2.10) |
| BR-04 | Fresher path requires aptitude first | Disable coding assessment until aptitude complete | Assessment Console (4.2.7), Interview Planner (4.3.4) |
| BR-05 | Experienced path: direct to technical | Show technical interview option without aptitude | Interview Planner (4.3.4) |
| BR-06 | Missing mandatory stages | Disable decision button + show checklist | Decision Workbench (4.3.6) |
| BR-07 | Compensation exceeds tier threshold | Show approval chain + pending approvers | Decision Workbench (4.3.6) |
| BR-08 | OTP verification fails 5 times | Lock account + show lockout screen | Account Lockout Screen (4.1.3.2) |
| BR-09 | Interview no-show recorded | Show no-show flag + reschedule options | No-Show Management (4.6.2) |
| BR-10 | Email delivery fails after max retries | Create recruiter task + show failure badge | Communication Log (4.3.7) |
| BR-11 | Shortlist override requested | Show override request form + approval status | Candidate Detail (4.3.3) |
| BR-12 | Offer response deadline passes | Auto-expire + notify HR Manager | Offer Review (4.2.9), HR Dashboard (4.3.1) |
| BR-13 | Candidate withdraws application | Show withdrawal confirmation + release slot | Application Timeline (4.2.6) |
| BR-14 | Admin changes scoring threshold | Show version effective date + impact notice | Threshold Config (4.4.3), AI Model Config (4.4.8) |
| BR-15 | Data deletion request received | Show deletion request form + 30-day timeline | Privacy Management (4.2.12) |
| BR-16 | AI service degraded | Show system-wide banner + queue status | All HR/Admin screens (4.3.1.1) |
| BR-17 | Requisition closed | Block new applications + show closed message | Requisition Closed Screen (4.2.11) |
| BR-18 | Offer accepted | Decrement slot + close other applications | Requisition Management (4.6.1) |

---

## 8.6 Complete Functional Requirements Traceability Matrix

This matrix ensures all functional requirements have corresponding UI implementations.

### Authentication & Identity (FR-001 to FR-010)

| FR ID | Requirement | Primary Screens | UI Components |
| --- | --- | --- | --- |
| FR-001 | OTP verification | Registration (4.1.2) | OTP input, resend button, verification status |
| FR-002 | Password policy & lockout | Login (4.1.3), Account Lockout (4.1.3.2) | Password strength meter, lockout screen, recovery link |
| FR-003 | Consent version capture | Registration (4.1.2), Privacy Management (4.2.12) | Consent checkboxes, version stamps, consent history |
| FR-004 | Role-based routing | Login (4.1.3) | Role selector (if multi-role), dashboard routing |
| FR-005 | SSO authentication | Login (4.1.3) | SSO provider buttons (Google, GitHub) |
| FR-006 | Unique candidate ID | All candidate screens | ID displayed in monospaced font, copyable |
| FR-007 | Onboarding checklist | Candidate Dashboard (4.2.1) | Progress checklist card, completion animations |
| FR-008 | OTP rate limiting | Registration (4.1.2), OTP Rate Limit Screen (4.2.13) | Resend button with cooldown, rate limit message |
| FR-009 | Session timeout | Session Timeout Modal (4.1.3.1) | Warning modal, countdown timer, refresh button |
| FR-010 | Authentication audit log | Admin Audit Log (4.4.4) | Event table, IP address column, timestamp |

### Application & Resume (FR-011 to FR-020)

| FR ID | Requirement | Primary Screens | UI Components |
| --- | --- | --- | --- |
| FR-011 | Display open requisitions | Job Search (4.2.2), Job Detail (4.2.3) | Job cards, filters, eligibility criteria |
| FR-012 | Prevent duplicate applications | Application Blocked Screen (4.2.10) | Blocking message, cooling period countdown |
| FR-013 | Resume upload & scan | Application Form (4.2.4) | Drag-drop zone, file picker, upload progress, scan status |
| FR-014 | Resume parsing | Application Form (4.2.4) | Parsing progress, extracted fields preview |
| FR-015 | Edit parsed fields | Application Form (4.2.4) | Edit buttons, field-level edit indicators |
| FR-016 | Auto-save application | Application Form (4.2.4) | Auto-save indicator, last saved timestamp |
| FR-017 | Real-time validation | Application Form (4.2.4) | Character count, inline validation messages |
| FR-018 | Progress bar & completion time | Application Form (4.2.4) | Progress rail, step indicator, time estimate |
| FR-019 | Confirmation email | Application Confirmation (4.2.5) | Success message, next steps timeline |
| FR-020 | Withdraw application | Application Timeline (4.2.6) | Withdraw button, confirmation modal |

### AI Screening (FR-021 to FR-028)

| FR ID | Requirement | Primary Screens | UI Components |
| --- | --- | --- | --- |
| FR-021 | Match score calculation | HR Review Queue (4.3.2), Candidate Detail (4.3.3) | Score badge, confidence meter |
| FR-022 | Positive factors & gaps | Candidate Detail (4.3.3) | Factor chips, skill gap badges |
| FR-023 | Low confidence flagging | HR Review Queue (4.3.2) | Warning badges, manual review indicator |
| FR-024 | Configurable thresholds | Threshold Config (4.4.3), AI Model Config (4.4.8) | Sliders, effective date picker |
| FR-025 | AI fallback mode | System Alert Banners (4.3.1.1), Admin Health (4.4.9) | Fallback banner, queue status indicators |
| FR-026 | Re-evaluation on threshold change | Candidate Detail (4.3.3) | Version comparison view, re-evaluate button |
| FR-027 | AI confidence meter | HR Review Queue (4.3.2), Candidate Detail (4.3.3) | Circular meter, color bands, accessibility labels |
| FR-028 | Model version filtering | HR Review Queue (4.3.2), Audit Log (4.4.4) | Model version dropdown filter |

### HR Review & Decision (FR-029 to FR-036)

| FR ID | Requirement | Primary Screens | UI Components |
| --- | --- | --- | --- |
| FR-029 | HR review dashboard | HR Review Queue (4.3.2) | Queue table/kanban, filters, SLA timers |
| FR-030 | Mandatory reason codes | Candidate Detail (4.3.3) | Reason dropdown (required field), validation |
| FR-031 | Auto-trigger rejection email | Communication Log (4.3.7) | Email sent indicator, timestamp |
| FR-032 | Path classification | Candidate Detail (4.3.3), Interview Planner (4.3.4) | Path badges (fresher/experienced) |
| FR-033 | Path override workflow | Candidate Detail (4.3.3) | Override toggle, justification field, approval status |
| FR-034 | SLA countdown & alerts | HR Review Queue (4.3.2), System Banners (4.3.1.1) | Color-coded timers, breach banner |
| FR-035 | Bulk reject action | HR Review Queue (4.3.2) | Checkbox selection, bulk action button, confirmation |
| FR-036 | Queue notification | HR Dashboard (4.3.1), Notification Center (4.2.14) | In-app badge, notification items |

### Interviews & Assessments (FR-037 to FR-048)

| FR ID | Requirement | Primary Screens | UI Components |
| --- | --- | --- | --- |
| FR-037 | Timezone-aware scheduling | Interview Planner (4.3.4), Interview Confirmation (4.2.8) | Timezone display, localized times |
| FR-038 | Fresher aptitude enforcement | Assessment Console (4.2.7) | Disabled link with prerequisite notice |
| FR-039 | Experienced direct path | Interview Planner (4.3.4) | Technical interview without aptitude |
| FR-040 | Assessment score ingestion | Application Timeline (4.2.6) | Score badges, provider callback status |
| FR-041 | Scorecard rubric capture | Scorecard Form (4.3.5) | Rubric dimensions, rating scales, validation |
| FR-042 | No-show/reschedule tracking | No-Show Management (4.6.2), Application Timeline (4.2.6) | Status badges, reason codes, timeline entries |
| FR-043 | Interview reminders | Notification Center (4.2.14) | 24h and 1h reminder notifications |
| FR-044 | Live coding environment | Assessment Console (4.2.7) | Session link, timer, code editor |
| FR-045 | Interviewer context panel | Scorecard Form (4.3.5) | Read-only resume, AI insights panel |
| FR-046 | Scorecard completion notification | HR Dashboard (4.3.1), Notification Center | Completion badges, notifications |
| FR-047 | Scheduling conflict detection | Interview Planner (4.3.4) | Conflict indicators on calendar cells |
| FR-048 | Panel member confirmation | Interview Planner (4.3.4) | Confirmation status per panel member |

### Final Decision & Offers (FR-049 to FR-056)

| FR ID | Requirement | Primary Screens | UI Components |
| --- | --- | --- | --- |
| FR-049 | Prerequisite enforcement | Decision Workbench (4.3.6) | Disabled controls, prerequisite checklist |
| FR-050 | Decision outcomes | Decision Workbench (4.3.6) | Outcome radio buttons, status updates |
| FR-051 | Offer approval matrix | Decision Workbench (4.3.6), Approval Matrix Config (4.4.7) | Approval chain, approver status badges |
| FR-052 | Decision summary PDF | Decision Workbench (4.3.6) | Download PDF button, summary generation |
| FR-053 | Offer response tracking | Offer Review (4.2.9), HR Dashboard (4.3.1) | Response deadline countdown, reminder status |
| FR-054 | Communication audit trail | Communication Log (4.3.7) | Template version, delivery status, timestamps |
| FR-055 | Slot decrement on acceptance | Requisition Management (4.6.1) | Slot counter, status updates |
| FR-056 | Offer letter token resolution | Decision Workbench (4.3.6) | Token validation, preview, dispatch controls |

### Communication (FR-057 to FR-062)

| FR ID | Requirement | Primary Screens | UI Components |
| --- | --- | --- | --- |
| FR-057 | Tokenized templates | Template Management (4.4.5) | Template editor, token picker, preview |
| FR-058 | Communication logging | Communication Log (4.3.7) | Event timeline, delivery status badges |
| FR-059 | Retry with backoff | Communication Log (4.3.7) | Retry count, attempt timestamps, failure tasks |
| FR-060 | Multi-channel alerts | System Banners (4.3.1.1), Notification Center | In-app badges, email notifications |
| FR-061 | Localization support | Template Management (4.4.5) | Locale selector, fallback indicator |
| FR-062 | Notification preferences | Profile Management (4.2.14) | Channel toggles, preference checkboxes |

### Administration (FR-063 to FR-068)

| FR ID | Requirement | Primary Screens | UI Components |
| --- | --- | --- | --- |
| FR-063 | User management | User Management (4.4.2) | User table, create/deactivate controls, role assignment |
| FR-064 | Policy configuration | Business Rules Config (4.4.6) | Policy editors, version tracking, effective dates |
| FR-065 | Threshold editor | Threshold Config (4.4.3), AI Model Config (4.4.8) | Sliders, change history table |
| FR-066 | Audit log viewer | Audit Log (4.4.4) | Search filters, event table, CSV export |
| FR-067 | Platform health dashboard | Admin Health (4.4.9) | Service status grid, queue metrics, incident table |
| FR-068 | Bulk requisition import | Requisition Management (4.6.1) | CSV upload, validation, error report |

### Analytics (FR-069 to FR-073)

| FR ID | Requirement | Primary Screens | UI Components |
| --- | --- | --- | --- |
| FR-069 | Pipeline metrics | Pipeline Analytics (4.5.1) | KPI cards, trend indicators, refresh indicator |
| FR-070 | Stage conversion funnels | Pipeline Analytics (4.5.1) | Funnel chart, export buttons |
| FR-071 | AI accuracy tracking | AI Accuracy Dashboard (4.5.2) | Agreement rate chart, confusion matrix |
| FR-072 | No-show & cancellation rates | Pipeline Analytics (4.5.1) | Rate displays, trend lines |
| FR-073 | Weekly digest | Notification Preferences (4.2.14) | Digest opt-in toggle, schedule selector |

---

## 9. Open Design Questions

| Question ID | Question | Owner | Target Resolution |
| --- | --- | --- | --- |
| DQ-001 | Should the candidate portal use light mode by default and HR portal use dark mode, or allow toggle? | Product | Sprint 1 |
| DQ-002 | Should the confidence meter be circular or linear bar? Both accessible, preference? | Design | Sprint 1 |
| DQ-003 | Should mobile candidates see full interview scheduling or simplified "Confirm" flow only? | Product | Sprint 2 |
| DQ-004 | Should SLA countdown show exact hours:minutes or friendly format (e.g., "Due in 3 hours")? | Product | Sprint 2 |
| DQ-005 | Should rejected candidates see the rejection reason or just generic message? | Legal + Product | Sprint 3 |
| DQ-006 | Should HR reviewers see real-time updates via WebSocket or require manual refresh? | Engineering + Product | Sprint 2 |
| DQ-007 | Should offer letters be embedded in-page or always open as PDF download? | Product | Sprint 4 |
| DQ-008 | Should audit log be real-time or batch-refreshed every 10 seconds? | Engineering | Sprint 5 |

---

## 10. Appendices

### Appendix A: Icon Library

**Recommended icon library**: Lucide React (https://lucide.dev)

**Icon sizes**:
- Small: 16px
- Medium: 20px
- Large: 24px
- Hero: 32px

**Frequently used icons**:
- Checkmark: Success states, completed stages
- X (Close): Modals, toasts, dismissible alerts
- Chevron Down: Dropdowns, collapsible sections
- Calendar: Date pickers, interview scheduling
- Clock: Timers, SLA countdowns, deadlines
- User: Profiles, candidate avatars
- Briefcase: Jobs, requisitions
- File: Resumes, documents
- Bell: Notifications, alerts
- Settings: Configuration, admin
- Search: Search inputs, filters
- Filter: Filter panels
- Download: Export, PDF download
- Upload: File upload
- Edit: Edit actions
- Trash: Delete actions
- Eye: View details
- Eye Off: Hide details
- Check Circle: Completed, success
- Alert Circle: Warnings
- X Circle: Errors, failures
- Info: Informational messages

### Appendix B: Animation Library

**Recommended animation library**: Framer Motion (https://www.framer.com/motion/)

**Common animations**:
- Fade in: `initial={{ opacity: 0 }}, animate={{ opacity: 1 }}, exit={{ opacity: 0 }}`
- Slide in from top: `initial={{ y: -20, opacity: 0 }}, animate={{ y: 0, opacity: 1 }}`
- Scale up: `initial={{ scale: 0.95 }}, animate={{ scale: 1 }}`
- Stagger children: `variants` with `staggerChildren: 0.1`

### Appendix C: Illustration Guidelines

**Illustration style**: Modern, minimal, geometric
**Color palette**: Use brand colors + semantic colors
**Use cases**:
- Empty states
- Error states (404, 500)
- Success confirmations (offer accepted, application submitted)
- Onboarding checklist completion

**Recommended sources**:
- Undraw (https://undraw.co) — customizable, free
- Humaaans (https://www.humaaans.com) — mix-and-match characters
- Icons8 Illustrations (https://icons8.com/illustrations) — diverse styles

---

## Appendix D: Document Revision History & Additions

### Version 1.0 - Comprehensive Gap Analysis & Enhancement (2026-07-22)

This version integrates all missing content identified through comprehensive comparison with SPEC-AI-INTERVIEW-001 and AI_Interview_Workflow_BRD.md v3.0.

**Major Additions:**

1. **Stakeholder Roles Section (1.3)**
   - Added comprehensive role definitions table
   - Mapped each role to their primary screens

2. **Enhanced Authentication & Security Screens**
   - Session Timeout Warning Modal (4.1.3.1) - FR-009
   - Account Lockout Screen (4.1.3.2) - FR-002, BR-08
   - Enhanced Login Page with detailed SSO specifications (4.1.3) - FR-005
   - OTP Rate Limit Screen (4.2.13) - FR-008

3. **Business Rule-Driven Screens**
   - Application Blocked Screen / Cooling Period (4.2.10) - BR-03
   - Requisition Closed Screen (4.2.11) - BR-17
   - Consent & Privacy Management (4.2.12) - FR-003, BR-15

4. **System Status & Monitoring**
   - System-Wide Alert Banners (4.3.1.1) - BR-16, BR-10
   - AI Fallback Mode indicators
   - WebSocket connection status indicators
   - Communication service degraded banners

5. **Admin Configuration Screens**
   - Business Rules Configuration (4.4.6) - BR-03, BR-04, BR-05, BR-08
   - Approval Matrix Configuration (4.4.7) - FR-051, BR-07
   - AI Model Configuration (4.4.8) - FR-024, FR-025, FR-026, BR-16
   - System Health & Monitoring (4.4.9) - FR-067, BR-16

6. **Enhanced Documentation Sections**
   - Section 7.7: Non-Functional UI Requirements
     - Performance indicators with SLA targets
     - Error handling hierarchy and standards
     - Security & privacy UI elements
     - Offline & degraded state handling
   - Section 8.5: Business Rules Impact on UI (complete mapping table)
   - Section 8.6: Complete FR Traceability Matrix (FR-001 to FR-073)

7. **Enhanced Interaction Patterns (6.2)**
   - Keyboard shortcuts for power users
   - Drag-and-drop specifications
   - Swipe gestures for mobile
   - Real-time update indicators

**Content Completeness:**

- ✅ All 73 functional requirements (FR-001 to FR-073) mapped to UI screens
- ✅ All 18 business rules (BR-01 to BR-18) mapped to UI behavior
- ✅ All 7 stakeholder roles documented with screen mappings
- ✅ All 20 workflow steps (WF-01 to WF-20) have corresponding UI screens
- ✅ Security & compliance UI elements (GDPR, consent management, audit trail)
- ✅ Performance SLAs translated to UI indicators
- ✅ Error handling and degraded state specifications
- ✅ SSO integration details (Google, GitHub OAuth2)

**Traceability Coverage:**

| Category | Count | Status |
| --- | --- | --- |
| Functional Requirements | 73 | ✅ 100% covered |
| Business Rules | 18 | ✅ 100% covered |
| Workflow Steps | 20 | ✅ 100% covered |
| Stakeholder Roles | 7 | ✅ 100% covered |
| Screen Specifications | 45+ | ✅ Complete |
| Component Specifications | 52 | ✅ Complete |

**Quality Assurance:**

- All screens include FR traceability references
- All business rule-driven UI includes BR traceability
- All time-sensitive operations include performance indicators
- All error states documented with user-friendly messaging
- All security and privacy requirements translated to UI elements
- Complete accessibility coverage (WCAG 2.2 AA)

---

**End of Document**

**Approval Sign-Off:**

| Role | Name | Signature | Date |
| --- | --- | --- | --- |
| Product Owner | _______________ | _______________ | _______________ |
| Lead Designer | _______________ | _______________ | _______________ |
| Frontend Lead | _______________ | _______________ | _______________ |
| Accessibility Specialist | _______________ | _______________ | _______________ |
