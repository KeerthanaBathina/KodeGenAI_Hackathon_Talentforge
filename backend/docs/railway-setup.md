# Railway.app Configuration

- Project Name: ai-interview-backend
- Production Service URL: https://api.ai-interview.railway.app
- Staging Service URL: https://api-staging.ai-interview.railway.app
- Health Check Path: GET /health
- Root Directory: backend/

## Environment Isolation

| Variable Category | Production | Staging |
|---|---|---|
| DATABASE_URL | Supabase project: prod-xxx | Supabase project: staging-xxx |
| Redis | Upstash DB: prod-db | Upstash DB: staging-db |
| FRONTEND_URL | Production Vercel URL | Staging/preview frontend URL |

Environment variables are managed only in Railway dashboard and never committed to source control.
