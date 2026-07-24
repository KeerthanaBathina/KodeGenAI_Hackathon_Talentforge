# Backend Migration Workflow

## Drift Check

Run before pushing schema-related changes:

```bash
npm run migrate:diff
```

Exit 0 means no drift. Non-zero means migration history and database state differ.

## Migration Commands

```bash
npm run migrate:status
npm run migrate:deploy
```

## Seed Behavior by Environment

```bash
NODE_ENV=development npx prisma db seed
NODE_ENV=staging npx prisma db seed
NODE_ENV=production npx prisma db seed
```

- development: shared config + fixture data
- staging: shared config only
- production: shared config only

## Rollback Guard Scripts

```bash
npm run rollback:pre
# apply rollback migration
npm run rollback:post
```

## Zero-Downtime Deployment Probe

```bash
BACKEND_URL=https://your-backend-url npm run zero-downtime:test
```
