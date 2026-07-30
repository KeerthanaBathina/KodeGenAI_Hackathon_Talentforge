# Vercel Project Configuration

## Project Metadata

- Project Name: ai-interview-app-frontend
- Vercel Project ID: prj_sZVBjBOgnEObO6VZhV5htgFPvu8l
- Vercel Org ID: team_XNgMTTTeuLbbg8lQImuMcn0K
- Production Branch: main
- Preview Branches: all pull requests
- Root Directory: frontend/

## Current Live State (2026-07-23)

- Project exists in Vercel team scope.
- Node.js version in Vercel is currently 24.x and must be changed to 20.x.
- Required environment variables are not yet configured in Vercel.

## Required Environment Variables

Add these in Vercel dashboard under Project -> Settings -> Environment Variables:

- NEXT_PUBLIC_API_URL
  - Production: https://api.ai-interview.railway.app
  - Preview: https://api-staging.ai-interview.railway.app
  - Development: http://localhost:3001
- NEXT_PUBLIC_SUPABASE_URL
  - Production + Preview: https://<project>.supabase.co
- NEXT_PUBLIC_SUPABASE_ANON_KEY
  - Production + Preview: <anon-key>

Environment variables must be managed in Vercel only and never committed in source control.
