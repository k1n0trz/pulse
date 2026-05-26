# Pulse

> AI agent for Meta Ads management and optimization.

Pulse audits, recommends and (when authorized) executes optimizations on Meta Ads campaigns under explicit policy guardrails. Three operating modes — **read · assisted · autopilot** — give the operator full control over how much the agent is allowed to do.

This repository is a pnpm + Turborepo monorepo.

```
pulse/
├── apps/
│   ├── web/        React 19 + Vite frontend
│   └── api/        Fastify 5 + Prisma backend
└── packages/
    └── shared/     Cross-cutting TypeScript types (domain + Meta contracts)
```

## Phase status

| Phase | Scope | State |
|---|---|---|
| **0** | Monorepo, backend skeleton, Prisma schema, shared types, CI | ✅ In this commit |
| 1 | Real Meta integration (OAuth + Ads CLI/MCP adapters + sync jobs) | ⏳ Next |
| 2 | AI brain (Claude tool calling, streaming chat, learning loop) | — |
| 3 | Multi-tenant auth, scheduler, notifications, audit log | — |
| 4 | Reports (PDF / CSV / XLSX), dashboards, polished UX | — |
| 5 | Landing, Stripe billing, legal pack | — |
| 6 | Closed beta → launch | — |

## Requirements

- Node `>=20.18.0` (see `.nvmrc`)
- pnpm `>=9` (enable via `corepack enable`)
- A Postgres database (Neon, Supabase or local docker)

## Quick start

```bash
# 1. Enable pnpm (one-time)
corepack enable

# 2. Install dependencies
pnpm install

# 3. Configure env
cp .env.example .env
# edit .env with your DATABASE_URL (Neon or Supabase connection string)

# 4. Generate Prisma client + create tables
pnpm db:generate
pnpm db:migrate

# 5. Run everything in dev
pnpm dev
```

The web app runs on `http://127.0.0.1:5173`; the API on `http://127.0.0.1:4000`.

## Useful commands

```bash
pnpm dev                 # all apps in dev mode
pnpm build               # build all packages
pnpm typecheck           # tsc --noEmit across the monorepo
pnpm test                # vitest across the monorepo
pnpm lint                # currently aliased to typecheck

pnpm db:generate         # regenerate Prisma client
pnpm db:migrate          # create + apply a migration
pnpm db:studio           # open Prisma Studio
```

## What lives where

- **`apps/web`** — the existing Pulse UI (dashboards, autopilot panel, chat, reports). Still demo-data driven; wired to real API in Phase 1.
- **`apps/api`** — Fastify server exposing `/health`, `/v1/meta/*` (stubbed in Phase 0). Where OAuth, sync jobs, AI orchestration and exports will land.
- **`packages/shared`** — domain types (Campaign, AutopilotPolicy, …) and Meta connector contracts (the 29 official tools).

## Data model

The Prisma schema in [`apps/api/prisma/schema.prisma`](apps/api/prisma/schema.prisma) covers:

- **Identity & tenancy** — `User`, `Session`, `Organization`, `Membership`
- **Meta integration** — `MetaConnection`, `MetaAdAccount` (with encrypted tokens at rest)
- **Snapshots** — `CampaignSnapshot`, `DailyMetricSnapshot`
- **Decision loop** — `Policy`, `Recommendation`, `Decision`, `ActionLog`
- **Compliance** — `AuditEvent`, `Notification`

## Meta Ads integration plan

Pulse integrates with Meta through three providers, behind a single `MetaConnector` interface:

| Provider | When it's used | Pros |
|---|---|---|
| **Ads CLI** | Scripted execution (autopilot jobs) | npm-installed, OAuth without App Review |
| **Ads MCP** | Conversational tool calling from Claude | Same 29-tool surface, ideal for chat UX |
| **Marketing API** | Anything CLI/MCP doesn't cover (Advantage+, lead forms, heavy reporting) | Full API surface; requires App Review |

All 29 tools are enumerated in [`packages/shared/src/meta.ts`](packages/shared/src/meta.ts).

> Per Meta's design, **every entity created via CLI/MCP lands in `PAUSED` status**. There is no override. This matches Pulse's "approval required for new entities" guardrail by default.

## Security & guardrails (built-in)

- **Modes** — read · assisted · autopilot, configurable per organization.
- **Policies** — target CPA/ROAS, max daily budget delta, max daily changes, kill switch.
- **Critical campaigns** are excluded from autopilot by default.
- **Audit log** of every API/CLI/MCP call against Meta, tied to organization + user + decision.
- **Encrypted tokens** at rest (Meta access/refresh tokens).
- Dry-run mode available on every executable action.

## Contributing / development tips

- Source of truth for runtime contracts: `packages/shared`.
- DB modeling: only Prisma; never raw SQL except for read-only diagnostics.
- New API routes go under `apps/api/src/routes` and are registered in `server.ts`.
- New Meta tools: add the tool name to `META_TOOLS` in shared, then implement under the connector.

## License

Private. © Pulse.
