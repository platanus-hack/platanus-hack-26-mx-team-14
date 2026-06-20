---
name: project-auth-implementation
description: Auth system implementation for SATI — JWT login/register, protected routes, axios client
metadata:
  type: project
---

Auth system was implemented (2026-06-20) connecting frontend and backend.

**Why:** Hackathon project needed real auth instead of mock state.

**How to apply:** When debugging auth issues, refer to these files and endpoints.

## Backend (apps/api)
- `src/routes/auth.ts` — POST /auth/register, POST /auth/login, GET /auth/me
- `src/types.ts` — FastifyJWT module augmentation + `app.authenticate` decorator
- `src/server.ts` — registers fastifyJwt + authRoutes
- JWT_SECRET env var (defaults to "dev-jwt-secret-change-in-prod" if not set)
- Password hashing: Node.js built-in `crypto.scrypt` (no extra deps)
- DB schema: `users.passwordHash` column added via migration `drizzle/0001_even_marrow.sql`

## Frontend (apps/web)
- `src/lib/api.ts` — axios instance with JWT Bearer interceptor, auto-logout on 401
- `src/lib/auth.ts` — localStorage helpers: `sati_token` and `sati_user` keys
- `App.tsx` — restores auth from localStorage on mount, guards dashboard route
- `AuthPage.tsx` — step 2 no longer requires .cer/.key files, just optional RFC
- `DashboardPage.tsx` — onLogout prop clears token and navigates to landing

## Packages installed
- `@fastify/jwt@10.1.0` in apps/api
- `axios` in apps/web
- `drizzle-orm` direct dep in apps/api (for type resolution)

## Docker note
When rebuilding after adding new packages, must use:
```
docker compose down api && docker compose build --no-cache api && docker compose up -d api
```
(force-recreate alone isn't enough if the old container is still using a cached layer)
