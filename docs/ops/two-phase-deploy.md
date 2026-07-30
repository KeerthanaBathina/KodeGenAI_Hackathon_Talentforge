# Two-Phase Deploy Pattern for Breaking Schema Changes

Use this pattern when a migration is not backward-compatible with currently deployed application code.

## Phase 1: Introduce Compatibility

Goal: deploy additive schema changes and dual-compatible application code.

Examples:
- Add new nullable column
- Add new table
- Add non-breaking index

Application behavior:
- Write to old and new structures where needed
- Read from old structure until backfill and traffic stabilize

## Phase 2: Remove Legacy Structure

Goal: remove old schema only after all runtime traffic no longer depends on it.

Examples:
- Drop old column
- Drop old table
- Tighten constraints after backfill

## Worked Example: Rename candidates.phone to candidates.phone_number

Phase 1 migration:

```sql
ALTER TABLE candidates ADD COLUMN phone_number VARCHAR(50);
UPDATE candidates SET phone_number = phone WHERE phone IS NOT NULL;
```

Phase 1 app:
- Write both phone and phone_number
- Read from phone_number with fallback

Phase 2 migration:

```sql
ALTER TABLE candidates DROP COLUMN phone;
ALTER TABLE candidates ALTER COLUMN phone_number SET NOT NULL;
```

Phase 2 app:
- Use phone_number only

## Operational Checks

- Run migrate:diff in CI before merge
- Run zero-downtime health polling during deployment
- Confirm health endpoint remained green
