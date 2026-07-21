# Crew

**Smart scheduling and crew assignment for contractors and trades businesses.**

Crew is a focused scheduling tool for landscaping, roofing, HVAC, plumbing,
electrical, painting, fence & deck, concrete, pressure washing, security/camera
install, and general contracting. It removes the calendar Tetris by suggesting
job schedules, assigning the right crew members, detecting conflicts, and
adjusting for availability, skills, weather risk, and job priorities.

It is **not** a full CRM, accounting suite, payroll system, or generic project
manager. It's a **scheduling and crew assignment layer** — built so owners can
plan the week in minutes, crews know where to be, and last-minute changes don't
cascade into chaos.

Crew is designed as a natural extension of the RainCode AI product family:

| Product | Role |
| ------- | ---- |
| **SiteAssist** | AI ops assistant — leads, follow-ups, messaging, jobs |
| **Echo** | Voice field notes → structured operational data |
| **Relay** | Shift handoffs for small teams |
| **Quill** | Lead capture, estimates, and quote delivery |
| **Crew** | Job scheduling + crew assignment + conflict-aware AI |

---

## Value proposition

| Who | Problem today | Crew |
| --- | ------------- | ---- |
| Owner / dispatcher | Spreadsheet + texts; who is free, skilled, and nearby? | Board + AI: “best crew for these 5 jobs this week” |
| Crew lead | Overbooking, skill mismatches, surprise weather | Conflicts surfaced before confirmation |
| Field worker | Unclear start times and site addresses | Confirmed schedule with job context |
| Office | Manual reshuffles after one cancel | Manual override + re-suggest without losing data |

**Elevator pitch:** *Tell Crew which jobs need to land this week. It proposes
who, when, and where — flags overbooking, skill gaps, and weather risk — and
you approve or drag to fix. Scheduling stops being Tetris.*

---

## Core user flows

### 1. Owner setup

1. Sign in with Clerk (Google or email).
2. Workspace is provisioned automatically (`users` + `companies`).
3. Complete company profile (trade, timezone, default work hours, home base).
4. Add **crew members** (skills, certifications, hourly rate, weekly availability).
5. Land on the owner dashboard: unscheduled jobs, today’s board, open conflicts.

### 2. Job creation

1. Create a job: title, customer, address, service type, estimated duration.
2. Set **required skills**, **priority**, preferred date window, notes.
3. Job lands as `unscheduled` (or `ready_to_schedule`) — **saved first**, not
   blocked on AI.
4. Optionally link an external SiteAssist job / Echo note later.

### 3. Scheduling board

1. Open the board (week list for MVP; day/week calendar views next).
2. See unscheduled jobs in a queue; scheduled work on crew rows or time buckets.
3. Drag or assign manually: pick start time + crew members.
4. On save, **conflict detection** runs (overbooking, skill mismatch, outside
   availability, travel/weather heuristics when configured).
5. Confirm placements; status moves `draft → confirmed`.

### 4. AI suggestions

1. Select jobs (or “this week’s backlog”) and a date window.
2. Run **Suggest schedule** — mutation records a suggestion run
   (`pending`), then a Convex action calls OpenAI with constraints.
3. Results write as **proposals** (`scheduleSuggestions` + draft
   `schedules`) — never auto-overwrite confirmed work without approval.
4. Owner reviews rationale, conflicts, and alternatives; **Approve** or
   **Reject**, or edit then confirm.

```
Owner dashboard                 Convex                         Board UI
───────────────                 ──────                         ────────
Create jobs ─────────────────► jobs.create (durable)
Select week + “Suggest” ─────► scheduleSuggestions.create
                               │
                               ▼
                          ai.suggestSchedule (OpenAI)
                               │
                               ▼
                          applySuggestion  ── reactive ──► proposals + conflicts
Owner Approve / edit ────────► schedules.confirm
```

### 5. Crew management

1. Roster: active/inactive, skills, certs, default weekly hours, rate.
2. One-off availability: PTO, half-days, “prefer mornings.”
3. Filters on the board by skill, crew, status.

---

## Tech stack

| Layer | Choice |
| ----- | ------ |
| Framework | Next.js 16 (App Router) + TypeScript |
| Styling | Tailwind CSS + shadcn/ui (Radix) |
| Backend / DB | Convex (reactive database + functions) |
| Auth | Clerk (multi-tenant via `companyId`) |
| AI | OpenAI API (Convex action, server-side only) |
| Mobile | Mobile-first UI for on-site schedule checks |

Same core stack as **SiteAssist** and **Echo**, so patterns, env setup, and
tenant helpers stay familiar across RainCode apps.

---

## Architecture overview

```
Browser (Next.js App Router, React Server + Client Components)
   │  Clerk session  ─────────────────────────────┐
   ▼                                               │
ConvexProviderWithClerk  ── reactive queries ──►  Convex
   │                                               │  • queries   (board, crew, jobs)
   │                                               │  • mutations (save-first writes)
   │                                               │  • actions   (OpenAI suggestions)
   ▼                                               ▼
shadcn/ui + board UI                         OpenAI API (server-side only)
```

**Key ideas**

- **Multi-tenant from day one.** Every operational record carries a
  `companyId`. Tenant scoping + auth live in
  [`convex/lib/tenant.ts`](convex/lib/tenant.ts) (same pattern as SiteAssist/Echo).
- **Save first, enrich second.** Jobs and manual schedules always persist
  before AI runs. AI failure never loses operational data — suggestion status
  becomes retryable.
- **AI is isolated.** OpenAI lives only in Convex actions (`"use node"`).
  Prompts and JSON schemas live in `convex/lib/prompts.ts`.
- **Suggestions are proposals.** Confirmed schedules are the source of truth;
  AI writes drafts until an owner approves.
- **Conflicts are first-class.** Deterministic checks run on every assignment;
  AI can explain and propose fixes, but rules are not “vibes-only.”

See [ARCHITECTURE.md](./ARCHITECTURE.md) for layer-by-layer detail (scheduling
engine, constraint solving, AI flow, calendar views, tenancy, conflicts).

---

## Folder structure

```
Crew/
├── app/                          # Next.js App Router (Phase 2+)
│   ├── layout.tsx                # Root layout + providers
│   ├── providers.tsx             # Clerk + Convex client wiring
│   ├── page.tsx                  # Public marketing / landing
│   ├── globals.css               # Tailwind + design tokens
│   ├── sign-in/ | sign-up/       # Clerk auth (owners / dispatchers)
│   └── dashboard/                # Authenticated app
│       ├── layout.tsx            # Auth gate + sidebar/topbar shell
│       ├── page.tsx              # Overview (stats, conflicts, today)
│       ├── board/                # Scheduling board (week list / calendar)
│       ├── jobs/                 # Job list, create, detail
│       ├── crew/                 # Crew roster + availability
│       ├── suggestions/          # AI suggestion review + approve
│       └── settings/             # Company profile + work hours
│
├── components/
│   ├── ui/                       # shadcn/ui primitives
│   ├── dashboard/                # Sidebar, topbar, stat cards
│   ├── board/                    # Board lanes, job cards, assign dialogs
│   ├── jobs/                     # Job form, table, priority badges
│   ├── crew/                     # Roster cards, skills, availability editors
│   └── suggestions/              # Proposal review, conflict list, approve
│
├── convex/                       # Backend (database + functions)
│   ├── schema.ts                 # Tables, validators, indexes
│   ├── auth.config.ts            # Trust Clerk-issued JWTs (Phase 2)
│   ├── users.ts                  # Provisioning (Clerk → user/company)
│   ├── companies.ts              # Company profile
│   ├── crewMembers.ts            # Crew CRUD + skills/availability
│   ├── jobs.ts                   # Job CRUD + board queue
│   ├── schedules.ts              # Assignments, confirm, conflicts
│   ├── availability.ts           # Overrides (PTO, exceptions)
│   ├── suggestions.ts            # Suggestion runs + approve/reject
│   ├── ai.ts                     # OpenAI schedule suggestion action
│   └── lib/
│       ├── tenant.ts             # Auth + tenant-scoping helpers
│       ├── conflicts.ts          # Deterministic conflict detection
│       ├── scheduling.ts         # Windows, travel heuristics, packing
│       └── prompts.ts            # AI prompt + JSON schema construction
│
├── hooks/                        # Client hooks (useJobs, useBoard, …)
├── lib/                          # cn() util + shared constants
├── types/                        # Domain types (mirrors schema unions)
├── ARCHITECTURE.md               # Deep-dive: engine, AI, tenancy, conflicts
└── middleware.ts                 # Clerk route protection (Phase 2)
```

---

## Data model

| Table | Purpose | Key indexes |
| ----- | ------- | ----------- |
| `companies` | Trades business / workspace (tenant) | — |
| `users` | Owner/dispatcher linked to Clerk | `by_clerk_id`, `by_company` |
| `crewMembers` | Schedulable people (skills, rate, default hours) | `by_company`, `by_company_and_active` |
| `jobs` | Work to place on the calendar | `by_company`, `by_company_and_status`, `by_company_and_priority`, `by_company_and_window` |
| `schedules` | Time placement + crew assignment for a job | `by_company`, `by_company_and_start`, `by_job`, `by_company_and_status`, `by_crew_member` |
| `availability` | One-off overrides (PTO, partial days, preferences) | `by_company`, `by_crew_member`, `by_company_and_range` |
| `scheduleSuggestions` | AI suggestion runs (proposals + lifecycle) | `by_company`, `by_company_and_status`, `by_company_and_created` |
| `conflicts` | Persisted conflict records for board badges / history | `by_company`, `by_schedule`, `by_company_and_severity` |

**Job status**: `draft | scheduled | in_progress | completed | cancelled`.

**Schedule status**: `draft | proposed | confirmed | cancelled` (AI only writes
`draft`/`proposed`; owner confirms).

**Suggestion status** (owner decision): `pending | approved | rejected`.

**Suggestion AI status** (independent): `pending → processing → completed | failed`.

**Priority**: `low | medium | high | emergency`.

**Conflict types**: `overbooking | skill_mismatch | outside_availability |
travel_risk | weather_risk | priority_violation | missing_certification |
inactive_crew`.

String unions in [`convex/schema.ts`](convex/schema.ts) mirror
[`types/index.ts`](types/index.ts) — keep them in sync.

---

## Getting started

### Prerequisites

- Node.js 18+ (recommend Node 20 or 24)
- Accounts: [Convex](https://convex.dev), [Clerk](https://clerk.com),
  [OpenAI](https://platform.openai.com)

### 1. Install dependencies

```bash
npm install
```

*(Phase 2 scaffolds `package.json` and the Next.js app. Schema and types in
this repo are ready to drop into that scaffold.)*

### 2. Configure environment

```bash
cp .env.local.example .env.local
```

On Windows PowerShell:

```powershell
Copy-Item .env.local.example .env.local
```

Fill in values as you complete the steps below.

### 3. Set up Convex

```bash
npx convex dev
```

This logs you in, creates a dev deployment, **generates `convex/_generated`**
(required — TypeScript errors on `./_generated/*` until this runs once), and
writes `NEXT_PUBLIC_CONVEX_URL` into `.env.local`. Leave it running for
backend hot-reload.

### 4. Set up Clerk

> **Production:** use a **dedicated** Clerk application for Crew. Reusing
> SiteAssist/Echo keys is fine for local smoke tests only.

1. Create a Clerk application; copy the **Publishable key** and **Secret key**
   into `.env.local`.
2. In Clerk → **JWT Templates** → **New template → Convex**. Copy the
   **Issuer** URL from the `convex` template.
3. Point Convex at that issuer:

   ```bash
   npx convex env set CLERK_JWT_ISSUER_DOMAIN https://your-app.clerk.accounts.dev
   ```

4. Allow `http://localhost:3001` (or your port) in Clerk redirect URLs.

   See `convex/auth.config.ts`.

### 5. Set up OpenAI

Give the **Convex deployment** the key (actions run server-side only):

```bash
npx convex env set OPENAI_API_KEY sk-...
# optional: npx convex env set OPENAI_MODEL gpt-4o-mini
```

Without this key the app still runs — jobs and manual schedules save; AI
suggestions show a clear “configure key” / retry state instead of blocking
operations.

### 6. Run the app

Two processes (Next.js + Convex). Preferred after Phase 2 scaffold:

```bash
npm run dev:all      # next dev + convex dev
```

or separately:

```bash
npm run dev          # Next.js  → http://localhost:3000
npm run dev:convex   # Convex backend
```

Open <http://localhost:3000>, sign up, and land on a freshly provisioned workspace.

### Scripts

| Script | Does |
| ------ | ---- |
| `npm run dev` | Next.js dev server |
| `npm run dev:convex` | Convex backend (codegen + hot reload) |
| `npm run dev:all` | Both in parallel |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` (run `convex dev` first) |
| `npm run verify` | typecheck + unit tests + `npm audit --audit-level=high` |

---

## Environment variables

| Variable | Required | Used by | Notes |
| -------- | -------- | ------- | ----- |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Yes | Browser / server | Clerk publishable key |
| `CLERK_SECRET_KEY` | Yes | Next.js server | Clerk secret key |
| `CLERK_JWT_ISSUER_DOMAIN` | Yes | Convex auth | Set on Convex deployment; must match Clerk JWT template issuer |
| `NEXT_PUBLIC_CONVEX_URL` | Yes | Browser / server | Written by `npx convex dev` |
| `CONVEX_DEPLOYMENT` | Recommended | Convex CLI | Dev/prod deployment id |
| `OPENAI_API_KEY` | Yes for AI | Convex actions only | Never expose to the browser |
| `OPENAI_MODEL` | Optional | Convex AI | Defaults to `gpt-4o-mini` |
| `NEXT_PUBLIC_APP_URL` | Recommended | Links | e.g. `http://localhost:3000` |
| `WEATHER_API_KEY` | Optional (later) | Convex actions | Weather risk enrichment |

---

## MVP feature checklist

1. **Crew profiles** — skills, certifications, hourly rate, weekly availability, active flag
2. **Job creation** — duration, required skills, priority, preferred date window
3. **Scheduling board** — list/week view; assign start time + crew (drag-and-drop optional polish)
4. **AI suggestion engine** — “best crew for these N jobs in this window”
5. **Conflict detection** — overbooking, skill mismatch, outside availability (+ weather/travel stubs)
6. **Manual override + approval** — edit proposals; approve/reject suggestion runs
7. **Tenant scoping** — `companyId` isolation via `convex/lib/tenant.ts`
8. **Mobile-friendly board** — readable on phone for on-site schedule checks

---

## Integration points (Echo / SiteAssist)

Crew is shippable standalone. Integration is **optional and progressive**:

| Direction | Behavior |
| --------- | -------- |
| **SiteAssist → Crew** | Import or deep-link a SiteAssist `jobs` row into Crew (`externalJobId` / `source: siteassist`) when the product graph matures |
| **Crew → SiteAssist** | On confirm, optional webhook/sync of `scheduledFor` + crew names back to SiteAssist job status |
| **Echo → Crew** | Field notes on a job surface as schedule context (address changes, materials, urgency) without auto-moving times |
| **Shared tenancy** | Same `companyId` mental model; future shared workspace mapping if apps share Clerk orgs |

MVP stores optional external ids on `jobs` so linking does not require a shared database day one.

---

## Recommended future expansion

Rough priority after MVP:

1. **True drag-and-drop calendar** — day/week/month with travel buffers on the map.
2. **Weather provider** — outdoor-trade rules (roofing/landscaping) auto-flag high-risk days.
3. **Travel / route packing** — cluster jobs by zip or lat/lng; estimate drive minutes.
4. **Crew mobile view** — “my day” list with addresses and job notes (PIN or Clerk).
5. **Deep SiteAssist / Echo sync** — bi-directional job ids and field-note context panels.
6. **Recurring jobs** — maintenance contracts with series templates.
7. **Clerk Organizations** — multi-admin dispatch seats + roles.
8. **Billing** — Stripe plan gating once the scheduling loop is proven with real crews.

Because AI, auth, tenancy, conflict rules, and schedule writes are isolated,
these can land incrementally without large refactors.

---

## Design notes

Crew should feel **professional, operational, and trustworthy** — the same
design language as SiteAssist: neutral slate surfaces, confident work-ready
blue accent, strong typography, generous spacing, minimal animation. No neon,
no “AI startup” gimmickry.

Priority and conflict severity share one color language with SiteAssist/Echo
where practical (`lib/constants.ts` + `app/globals.css` in Phase 2).

Dispatch priority: **save the job → place the work → confirm**. AI suggestions
accelerate placement; they never gate creating or manually scheduling a job.

---

## Phase status

| Phase | Status |
| ----- | ------ |
| 1 — Architecture & documentation (README, ARCHITECTURE, schema, types, tenant) | Done |
| 2 — App scaffold (Next.js, Clerk, Convex providers, UI shell, CRUD functions) | Done |
| 3 — Board assign/confirm, conflicts, crew/jobs depth, suggestions, greedy pack, my-day | Done |
| 3b — Security audit High/Medium/Low hardening | Done |
| 4 — Real Clerk/Convex smoke + board polish + job detail | Not started (tomorrow) |
| 5 — Drag-drop calendar, weather/travel providers, field PIN | Later |

**Stop after Phase 1 for alignment** before scaffolding the Next.js app and
implementing Convex functions in Phase 2.
