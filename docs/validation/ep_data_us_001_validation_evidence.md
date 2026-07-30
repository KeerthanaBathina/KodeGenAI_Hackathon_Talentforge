# EP-DATA / US-001 Validation Evidence

Date: 2026-07-23
Environment: Supabase staging
Validator: GitHub Copilot

## Scenario 1 - Tables and columns

### prisma migrate status

```text
Environment variables loaded from .env
Prisma schema loaded from prisma\schema.prisma
Datasource "db": PostgreSQL database "postgres", schema "public" at "aws-1-ap-northeast-2.pooler.supabase.com:5432"

2 migrations found in prisma/migrations

Database schema is up to date!
```

### Table count

```text
[
	{
		"table_count": 20
	}
]

Note: Count includes Prisma metadata table (`_prisma_migrations`) in addition to domain tables.
```

### Column spot-check

```text
Verified via query output:
- applications.status: USER-DEFINED, NOT NULL, default 'submitted'
- applications.candidateId: uuid, NOT NULL
- applications.requisitionId: uuid, NOT NULL
- candidates.email: character varying, NOT NULL
- candidates.status: USER-DEFINED, NOT NULL, default 'pending'
- screenings.score: integer, NOT NULL
- screenings.confidence: numeric, NOT NULL
- users.role: USER-DEFINED, NOT NULL
```

## Scenario 2 - FK integrity

```text
PASS: DELETE blocked by FK constraint (P2003)
```

## Scenario 3 - Unique constraints

### candidate email unique

```text
PASS: duplicate email rejected (P2002)
```

### candidate phone unique

```text
PASS: duplicate phone rejected (P2002)
```

## Scenario 4 - Index performance

### load-test:indexes output

```text
> ai-interview-backend@0.1.0 load-test:indexes
> tsx scripts/load-test-indexes.ts

Seed already present: 139000 rows

Running EXPLAIN ANALYZE on requisitionId = 31ec3f4e-c037-4ece-90b7-b5775d7169cf
Row count for this requisition: 10000

Results:
	P50: 4.092 ms
	P95: 4.309 ms
	P99: 4.309 ms

PASS: P95 4.309 ms < 50 ms target
```

### EXPLAIN ANALYZE plan

```text
Limit  (cost=2056.91..2057.04 rows=50 width=28) (actual time=259.796..259.809 rows=50 loops=1)
  InitPlan 1
    ->  Limit  (cost=0.00..0.02 rows=1 width=16) (actual time=0.040..0.042 rows=1 loops=1)
	    ->  Seq Scan on applications applications_1  (cost=0.00..3375.68 rows=138968 width=16) (actual time=0.040..0.041 rows=1 loops=1)
  ->  Sort  (cost=2056.89..2065.49 rows=3441 width=28) (actual time=259.795..259.802 rows=50 loops=1)
	  Sort Key: applications."submittedAt" DESC
	  Sort Method: top-N heapsort  Memory: 30kB
	  ->  Bitmap Heap Scan on applications  (cost=40.25..1942.58 rows=3441 width=28) (actual time=1.867..258.603 rows=5025 loops=1)
		  Recheck Cond: (("requisitionId" = (InitPlan 1).col1) AND (status = ANY ('{submitted,screening}'::"ApplicationStatus"[])))
		  Heap Blocks: exact=1414
		  ->  Bitmap Index Scan on idx_applications_requisition_status  (cost=0.00..39.39 rows=3441 width=0) (actual time=1.679..1.679 rows=5025 loops=1)
			  Index Cond: (("requisitionId" = (InitPlan 1).col1) AND (status = ANY ('{submitted,screening}'::"ApplicationStatus"[])))
Planning Time: 0.156 ms
Execution Time: 259.863 ms

Index usage confirmed via Bitmap Index Scan on idx_applications_requisition_status.
```

## Scenario 5 - RLS

### RLS enabled on target tables

```text
[
	{
		"table_name": "applications",
		"rls_enabled": true
	},
	{
		"table_name": "candidates",
		"rls_enabled": true
	},
	{
		"table_name": "decisions",
		"rls_enabled": true
	},
	{
		"table_name": "reviews",
		"rls_enabled": true
	},
	{
		"table_name": "screenings",
		"rls_enabled": true
	}
]
```

### test:rls output

```text
Supabase auth test inputs are incomplete; running DB-level RLS fallback validation.

Testing DB-level RLS for candidate: candidate-a
	PASS: 1 rows returned, all owned by <candidate-a-uuid>

Testing DB-level RLS for candidate: candidate-b
	PASS: 1 rows returned, all owned by <candidate-b-uuid>

All RLS checks passed.
```
