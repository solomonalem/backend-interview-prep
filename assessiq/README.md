# AssessIQ

Proctored, rubric-scored technical assessment platform. Monorepo (npm workspaces).

See [`../docs/`](../docs) for the full specification. Read `docs/README.md` first.

## Layout

```
apps/
  web/        React 18 + Vite + Tailwind frontend
  api/        Express + Prisma + BullMQ backend
packages/
  types/      Shared TypeScript types (imported by both apps)
```

## Local development

Prerequisites: Node 20 LTS, Docker.

```bash
# 1. Start postgres + redis
docker compose up -d

# 2. Install dependencies
npm install

# 3. Configure env (fill in secrets)
cp .env.example apps/api/.env

# 4. Run the migration
npm run db:migrate

# 5. Seed starter questions
npm run db:seed

# 6. Run everything
npm run dev
```

## Status

Week 1 scaffold complete: monorepo, Docker Compose, Prisma schema + migration, seed data.
Routes/services are **not** built yet — see `docs/10-mvp-scope.md` for build order.
