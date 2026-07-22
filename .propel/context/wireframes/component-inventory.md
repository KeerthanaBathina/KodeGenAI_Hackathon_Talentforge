# Component Inventory

## Document Control

| Field | Value |
| --- | --- |
| Artifact | wireframe / component-inventory |
| Project | AI Interview Application |
| Source | FIGMA-SPEC-AI-INTERVIEW-001 v1.0 |
| Date | 2026-07-22 |
| Status | Draft |

---

## 1. Button Components

| ID | Component Name | Variant | Used In |
| --- | --- | --- | --- |
| BTN-001 | Primary Button | Default / Hover / Active / Disabled / Loading | SCR-002, SCR-003, SCR-013, SCR-032, SCR-035 |
| BTN-002 | Secondary Button | Default / Hover / Active / Disabled | SCR-002, SCR-013, SCR-017, SCR-018 |
| BTN-003 | Danger Button | Default / Hover / Active / Disabled | SCR-032, SCR-035 |
| BTN-004 | Ghost Icon Button | Default / Hover / Active | SCR-031, SCR-053, SCR-054 |
| BTN-005 | SSO Button — Google | Default / Hover | SCR-003 |
| BTN-006 | SSO Button — GitHub | Default / Hover | SCR-003 |

---

## 2. Form Components

| ID | Component Name | States | Used In |
| --- | --- | --- | --- |
| FRM-001 | Text Input | Default / Focus / Error / Disabled | SCR-002, SCR-003, SCR-004, SCR-013 |
| FRM-002 | Password Input (with show/hide) | Default / Focus / Error | SCR-002, SCR-003, SCR-005 |
| FRM-003 | Textarea | Default / Focus / Error / Disabled | SCR-032, SCR-034, SCR-035 |
| FRM-004 | Select Dropdown | Default / Open / Selected / Disabled | SCR-011, SCR-033, SCR-035, SCR-052 |
| FRM-005 | Multi-Select Dropdown | Default / Open / Selected | SCR-011, SCR-031, SCR-053 |
| FRM-006 | Checkbox | Unchecked / Checked / Indeterminate / Disabled | SCR-002, SCR-011, SCR-031 |
| FRM-007 | Radio Button | Unselected / Selected / Disabled | SCR-016, SCR-034, SCR-035 |
| FRM-008 | Toggle Switch | Off / On / Disabled | SCR-052, SCR-054, SCR-055 |
| FRM-009 | Date Picker | Default / Open / Selected | SCR-033, SCR-035, SCR-053 |
| FRM-010 | OTP Input (6-digit) | Empty / Filling / Filled / Error | SCR-002 |
| FRM-011 | File Upload (drag-and-drop) | Empty / Dragging / Uploading / Uploaded / Error | SCR-013 |
| FRM-012 | Slider | Default / Hover / Dragging | SCR-052, SCR-055 |
| FRM-013 | Country Code Selector | Default / Open | SCR-002 |
| FRM-014 | Search Input | Default / Focus / Active | SCR-011, SCR-031, SCR-051 |
| FRM-015 | Rich Text Editor | Default / Formatting toolbar | SCR-054 |

---

## 3. Data Display Components

| ID | Component Name | Variants | Used In |
| --- | --- | --- | --- |
| DAT-001 | Badge / Status Chip | Success / Warning / Danger / Info / Neutral | All screens |
| DAT-002 | Card (generic) | Default / Hover / Selected | SCR-010, SCR-011, SCR-030 |
| DAT-003 | Data Table | Default / Hover row / Selected row / Sorted column | SCR-031, SCR-051, SCR-053 |
| DAT-004 | Confidence Meter (circular) | Low / Medium / High | SCR-031, SCR-032 |
| DAT-005 | Progress Bar (linear) | Filled (0–100%) | SCR-010, SCR-013, SCR-016 |
| DAT-006 | Timeline Component (vertical) | Completed / In-progress / Pending nodes | SCR-015, SCR-032, SCR-036 |
| DAT-007 | Avatar | With initials / With image | SCR-030, SCR-032, SCR-051 |
| DAT-008 | Metric Card | With sparkline / Count-only | SCR-030, SCR-050 |
| DAT-009 | Sparkline Chart | Up-trend / Down-trend / Flat | SCR-050 |
| DAT-010 | Application Card (candidate-facing) | Active / Completed / Rejected | SCR-010 |
| DAT-011 | Job Card | Default / Saved | SCR-011 |
| DAT-012 | Stage Summary Card | Pending / Completed | SCR-035 |
| DAT-013 | Approval Chain Row | Pending / Approved / Rejected | SCR-035 |
| DAT-014 | Communication Timeline Item | Sent / Delivered / Bounced / Failed | SCR-036 |
| DAT-015 | AI Factors Chip Set | Positive (green) / Gap (red with ×) | SCR-032 |

---

## 4. Navigation Components

| ID | Component Name | Variants | Used In |
| --- | --- | --- | --- |
| NAV-001 | Top Navigation Bar (candidate) | Default / Scrolled | SCR-010–SCR-019 |
| NAV-002 | Left Sidebar Navigation (internal) | Expanded / Collapsed | SCR-030–SCR-036 |
| NAV-003 | Left Sidebar Navigation (admin) | Expanded / Collapsed | SCR-050–SCR-056 |
| NAV-004 | Breadcrumb | 2–4 levels | SCR-012, SCR-032, SCR-034 |
| NAV-005 | Tab Bar | Default / Active tab | SCR-012, SCR-032, SCR-055 |
| NAV-006 | Step Progress Rail | Active step / Completed / Pending | SCR-002, SCR-013 |
| NAV-007 | Question Navigator Grid | Answered / Marked / Unanswered | SCR-016 |
| NAV-008 | Assessment Header Bar | Timer / Navigator / Submit | SCR-016 |
| NAV-009 | Pagination Controls | Default / Page active | SCR-031, SCR-051, SCR-053 |

---

## 5. Feedback Components

| ID | Component Name | Variants | Used In |
| --- | --- | --- | --- |
| FBK-001 | Toast Notification | Success / Warning / Error / Info | All authenticated screens |
| FBK-002 | Inline Field Error | — | All forms |
| FBK-003 | Empty State Illustration | — | SCR-010, SCR-011, SCR-031 |
| FBK-004 | Alert Banner (system-wide) | AI Fallback / Email Degraded / SLA Breach | SCR-030–SCR-036 |
| FBK-005 | Confirmation Modal | Success icon + summary | SCR-014, SCR-018 |
| FBK-006 | Destructive Action Modal | Warning icon + consequences | SCR-019, SCR-031, SCR-032 |
| FBK-007 | SLA Countdown Timer | On-track / Approaching / Breached | SCR-031, SCR-032 |
| FBK-008 | Password Strength Meter | Weak / Fair / Strong | SCR-002, SCR-005 |
| FBK-009 | Upload Progress Indicator | Uploading / Scan in progress / Complete | SCR-013 |
| FBK-010 | Auto-Save Timestamp | — | SCR-013 |
| FBK-011 | WebSocket Connection Indicator | Connected / Reconnecting / Disconnected | SCR-030–SCR-056 |
| FBK-012 | Assessment Timer | Running / Warning (yellow) / Critical (red) | SCR-016 |
| FBK-013 | Cooldown Countdown | Days / Hours / Minutes | SCR-013a, SCR-003b |

---

## 6. Loading Components

| ID | Component Name | Variants | Used In |
| --- | --- | --- | --- |
| LDG-001 | Spinner (inline) | Small (16px) / Medium (24px) / Large (40px) | Buttons, page centers |
| LDG-002 | Skeleton Screen | Card / Table row / Text block | SCR-010, SCR-011, SCR-031 |
| LDG-003 | Progress Bar (upload) | 0–100% with scan state | SCR-013 |

---

## 7. Overlay Components

| ID | Component Name | Size | Used In |
| --- | --- | --- | --- |
| OVL-001 | Modal (small) | 400px max-width | Confirmations, simple forms |
| OVL-002 | Modal (large) | 640px max-width | Preview, detail views |
| OVL-003 | Right Drawer | 480px width | Candidate detail panel, user detail |
| OVL-004 | Dropdown Menu | Auto-width | Action menus, selects |
| OVL-005 | Tooltip | Auto-width | Icon hints, truncated text |
| OVL-006 | Notification Drawer | 400px width | Notification bell |

---

## 8. Page Layout Scaffolds

| ID | Layout Name | Regions | Used By |
| --- | --- | --- | --- |
| LAY-001 | PublicLayout | Header (logo), centered content card, footer | SCR-001–SCR-005 |
| LAY-002 | CandidateLayout | Top nav, page header, main content | SCR-010–SCR-019 |
| LAY-003 | InternalLayout | Left sidebar, top bar + alert banners, content | SCR-030–SCR-036 |
| LAY-004 | AdminLayout | Left sidebar (admin), top bar, content | SCR-050–SCR-056 |
| LAY-005 | FullscreenLayout | Minimal header bar only | SCR-016 |
| LAY-006 | SplitLayout | Left sidebar + main content | SCR-032, SCR-051, SCR-054 |

---

## 9. Component Usage Frequency

| Rank | Component | Screen Count |
| --- | --- | --- |
| 1 | Badge / Status Chip (DAT-001) | 20+ |
| 2 | Primary Button (BTN-001) | 18 |
| 3 | Text Input (FRM-001) | 15 |
| 4 | Data Table (DAT-003) | 8 |
| 5 | Card (DAT-002) | 12 |
| 6 | Toast Notification (FBK-001) | All authenticated |
| 7 | Left Sidebar Navigation (NAV-002) | 7 |
| 8 | Timeline Component (DAT-006) | 4 |
| 9 | Alert Banner (FBK-004) | 7 |
| 10 | Select Dropdown (FRM-004) | 10 |
