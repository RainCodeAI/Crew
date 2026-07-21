# Crew Architecture

This document explains how Crew is layered: job intake, scheduling board,
deterministic constraint checks, AI suggestion flow, tenant isolation, and the
reliability guarantees that matter for real contractor dispatch.

It is the companion to [README.md](./README.md). Schema and domain vocabulary
live in [`convex/schema.ts`](convex/schema.ts) and [`types/index.ts`](types/index.ts).

---

## 1. Goals and non-goals

### Goals

- **Plan the week without Tetris.** Owners place jobs on a board with clear
  crew, time, and conflict feedback.
- **Right person, right job.** Skills, certifications, and availability are
  first-class inputs — not buried notes.
- **Save first, enrich second.** Jobs and manual schedules are durable even if
  AI or network is flaky afterward.
- **Suggestions are proposals.** AI never silently overwrites confirmed work;
  owners approve, reject, or edit.
- **Multi-tenant isolation.** Company A never reads Company B’s crew, jobs, or
  schedules.
- **Familiar RainCode patterns.** Same Clerk + Convex + tenant helpers as
  SiteAssist and Echo.

### Non-goals (MVP)

- Full CRM / invoicing / payroll / time-clock product surface
- Optimal global OR-Tools-style solver as the only path (heuristics + AI first)
- Live GPS tracking of every truck
- Customer-facing self-booking portal
- Cross-company marketplace or crew lending

---

## 2. System layers

```
┌─────────────────────────────────────────────────────────────────┐
│  Presentation (Next.js App Router)                              │
│  • /dashboard — overview, board, jobs, crew, suggestions        │
│  • shadcn/ui + mobile-first Tailwind                            │
└────────────────────────────┬────────────────────────────────────┘
                             │ Clerk session JWT
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  Client data layer                                              │
│  • ConvexReactClient + ConvexProviderWithClerk                  │
│  • hooks: useQuery / useMutation / useAction                    │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  Convex backend                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐   │
│  │ queries      │  │ mutations    │  │ actions ("use node") │   │
│  │ board/jobs   │  │ create/save  │  │ suggestSchedule      │   │
│  │ tenant-scope │  │ confirm      │  │ (OpenAI only here)   │   │
│  └──────────────┘  └──────┬───────┘  └──────────┬───────────┘   │
│                           │                     │               │
│  ┌────────────────────────▼─────────────────────▼─────────────┐ │
│  │ lib/conflicts.ts · lib/scheduling.ts · lib/prompts.ts      │ │
│  │ Deterministic rules always run; AI proposes, rules verify  │ │
│  └────────────────────────────────────────────────────────────┘ │
│  schema + indexes (company-scoped access patterns)              │
└─────────────────────────────────────────────────────────────────┘
```

| Layer | Responsibility | Must not |
| ----- | -------------- | -------- |
| UI | Board UX, job forms, suggestion review, optimistic feedback | Hold OpenAI keys or trust client-only auth |
| Convex queries/mutations | Auth, tenant checks, durable writes, conflict recompute | Call OpenAI directly |
| Convex actions | Side effects (OpenAI, later weather APIs) | Be the only place a job or schedule is “saved” |
| `lib/conflicts` + `lib/scheduling` | Deterministic feasibility | Depend on model output for hard safety rules |

---

## 3. Auth and multi-tenancy

### Identity path

1. Sign in with **Clerk**.
2. Next.js middleware protects `/dashboard/*`.
3. Convex validates the Clerk JWT via `auth.config.ts` (issuer domain env).
4. First authenticated session runs `users.store` which:
   - finds or creates a `users` row by `clerkUserId`
   - ensures a `companies` workspace exists
   - sets `role` (`owner` on first user, `member` thereafter)

MVP auth is **owners/admins via Clerk only**. Field crew mobile “my day”
views may later use PIN entry (Echo `teamMembers` pattern) or Clerk members —
not required for Phase 1–2.

### Tenant scoping (single chokepoint)

All operational Convex functions go through helpers in
[`convex/lib/tenant.ts`](convex/lib/tenant.ts):

| Helper | Use |
| ------ | --- |
| `getCurrentUser` | Optional identity (nullable) |
| `requireCurrentUser` | Must be signed in + provisioned |
| `requireCompanyId` | Resolve caller’s `companyId` |
| `assertSameCompany` | After `db.get(id)`, prove the doc belongs to caller’s company |

**Rules**

- Every `crewMembers`, `jobs`, `schedules`, `availability`,
  `scheduleSuggestions`, `conflicts` row stores `companyId`.
- List queries always use a `by_company*` index — never full-table scans.
- Fetch-by-id always: `get` → `assertSameCompany`. Return generic `"Not found"`
  on mismatch (no cross-tenant existence leaks).
- Actions that suggest schedules re-check ownership via internal queries that
  still carry `companyId` constraints; public actions never accept a bare id
  without an auth boundary.

This matches SiteAssist and Echo so engineers can move between products without
relearning tenancy.

### Roles (MVP)

| Actor | Auth | Jobs / board | Approve AI | Company settings |
| ----- | ---- | ------------ | ---------- | ---------------- |
| `users.role = owner` | Clerk | Yes | Yes | Yes |
| `users.role = member` | Clerk | Yes | Yes (configurable later) | Limited |
| Crew (no login) | — | View via shared day sheet later | No | No |

---

## 4. Data model relationships

```
companies 1──* users                 (Clerk owners / dispatchers)
    │
    ├──* crewMembers                 (schedulable people)
    │      └──* availability         (overrides: PTO, exceptions)
    │
    ├──* jobs                        (work to place)
    │      └──* schedules            (0..n placements over time; usually 1 active)
    │             └──* conflicts     (persisted findings)
    │
    └──* scheduleSuggestions         (AI runs → draft schedules / proposals)
```

### Core objects

| Object | Meaning |
| ------ | ------- |
| **Job** | What needs doing (customer, site, duration, skills, priority, window) |
| **Crew member** | Who can do it (skills, certs, rate, default hours) |
| **Schedule** | When + who for a job (start/end, crew ids, status, source) |
| **Availability** | Exception to default weekly hours |
| **Suggestion** | Batch AI proposal over a job set + date window |
| **Conflict** | Structured reason a placement is risky or invalid |

### Index strategy (access patterns)

| Access pattern | Index |
| -------------- | ----- |
| Board for a company in a date range | `schedules.by_company_and_start` |
| Unscheduled / by status job queue | `jobs.by_company_and_status` |
| Priority backlog | `jobs.by_company_and_priority` |
| Jobs with preferred window | `jobs.by_company_and_window` |
| Schedules for one job | `schedules.by_job` |
| Schedules involving a crew member | `schedules.by_crew_member` (or query + filter; see note) |
| Active crew roster | `crewMembers.by_company_and_active` |
| Availability for a person | `availability.by_crew_member` |
| Suggestion history | `scheduleSuggestions.by_company_and_created` |
| Open conflicts | `conflicts.by_company_and_severity` |

**Note on multi-crew schedules:** Convex indexes are on scalar fields. Crew
assignments are stored as `crewMemberIds: Id<"crewMembers">[]`. Board-by-crew
views either (a) query company schedules in range and filter client/server, or
(b) maintain denormalized `scheduleAssignments` rows later if volume requires
it. MVP uses (a).

---

## 5. Scheduling engine

The engine has two cooperating paths: **manual placement** and **AI-assisted
batch suggestion**. Both end in the same tables and the same conflict checker.

### 5.1 Placement lifecycle

```
job created (status: ready)
        │
        ▼
 schedule draft  ── source: manual | ai_suggestion
        │
        ├─ conflict recompute (always)
        │
        ▼
   proposed (optional, AI path)
        │
        ▼
   confirmed  ←── owner approve / manual confirm
        │
        ▼
 in_progress → completed
```

**Invariant:** A successful `jobs.create` or `schedules.upsertDraft` leaves a
queryable record even if AI never runs.

### 5.2 Time model

- All absolute times are **epoch milliseconds** (UTC) in storage.
- Display uses `companies.timezone` (IANA, e.g. `America/Chicago`).
- Job duration: `estimatedDurationMinutes`.
- Schedule: `startAt` + `endAt` (end may default to start + duration).
- Preferred window on job: `preferredStartAt` / `preferredEndAt` (soft
  constraints for AI and packing).

### 5.3 Default availability

Each `crewMembers` row carries:

```
defaultWeeklyHours: [{ day: 0–6, start: "HH:mm", end: "HH:mm" }]
```

`availability` rows override a date range:

- `kind: "unavailable"` — hard block (PTO, sick)
- `kind: "available"` — optional extra window (Saturday OT)
- `kind: "preferred"` — soft preference (mornings) for ranking only

### 5.4 Constraint solving (MVP approach)

MVP is **not** a full CP-SAT solver. It is:

1. **Feasibility filters** (hard) — deterministic TypeScript in
   `lib/scheduling.ts` + `lib/conflicts.ts`.
2. **Ranking / packing** (soft) — greedy heuristics + optional AI ranking.
3. **Owner judgment** — board edits and approval.

#### Hard constraints (block confirm if policy says so; always surface)

| Constraint | Rule |
| ---------- | ---- |
| Overbooking | Same crew member’s intervals must not overlap (optionally allow buffer) |
| Outside availability | Placement must fall in default hours minus unavailabilities |
| Skill mismatch | Job `requiredSkills` ⊆ union of assigned crew skills (or warn if partial) |
| Double job | One job should not have two **confirmed** overlapping schedules |
| Inactive crew | Cannot assign `isActive: false` |

#### Soft constraints (score / warn)

| Constraint | Rule |
| ---------- | ---- |
| Priority | Prefer earlier / better crew for `high` / `emergency` |
| Preferred window | Prefer starts inside `preferredStartAt`–`preferredEndAt` |
| Rate / cost | Prefer lower blended rate when skill-equal (optional) |
| Travel risk | Same-day far zip jumps (heuristic miles or zip distance) |
| Weather risk | Outdoor trades on high-risk forecast days (provider later) |
| Continuity | Prefer same crew for multi-day / return visits |

#### Packing heuristic (batch suggest, pre-AI or post-AI validate)

```
sort jobs by priority desc, then preferred window start, then duration
for each job:
  candidate crew sets that satisfy skills
  candidate start slots in window on free intervals
  score(slot, crew) = priority weight + window fit - travel - weather - cost
  pick best feasible; if none, leave unscheduled with reason
run conflict recompute on full proposed set
```

AI may propose a full assignment map; **hard checks still run** before
`status: ready` on the suggestion and before confirm.

### 5.5 Travel and weather (stubs → real)

| Concern | MVP | Later |
| ------- | --- | ----- |
| Travel | Optional `originZip` on company + job address text; simple same-day “far move” flag | Maps API drive minutes, route packing |
| Weather | Optional `weatherRisk` string/score written by AI or stub | Cron + weather API → auto-flag outdoor jobs |

Architecture reserves fields (`travelMinutesEstimate`, `weatherRisk`) so
providers plug in without schema churn.

---

## 6. Conflict detection

### 6.1 Placement

All conflict detection for durable state lives in **`convex/lib/conflicts.ts`**,
called from mutations after schedule writes (and from internal apply after AI).

Actions **may** call pure helpers with prefetched docs, but the mutation path
is the source of truth for what the board shows.

### 6.2 Conflict record shape

Each `conflicts` row:

- `companyId`, `scheduleId`, optional `jobId`, `crewMemberIds`
- `type` (enum)
- `severity`: `info | warning | error`
- `message` (human-readable)
- `isResolved` + timestamps

**Severity policy (default)**

| Type | Severity |
| ---- | -------- |
| Overbooking / double confirmed job | `error` |
| Outside availability | `error` |
| Skill mismatch (missing required) | `error` or `warning` (company policy later) |
| Travel / weather risk | `warning` or `info` |
| Soft window miss | `info` |

### 6.3 When conflicts recompute

- After `schedules.create` / `update` / `confirm` / `cancel`
- After crew availability change that intersects active schedules
- After applying an AI suggestion (on each proposed draft schedule)
- On-demand query for “what if” preview (optional Phase 3): pure function with
  hypothetical intervals, no write

### 6.4 Resolution

- Owner edits time/crew → recompute; auto-resolve stale conflicts.
- Owner may dismiss a soft conflict (`isResolved: true`, `resolvedBy`) without
  changing the schedule — never auto-dismiss hard errors without a change or
  explicit override flag on the schedule (`ownerOverride: true`).

---

## 7. AI suggestion flow

### 7.1 Placement

All OpenAI calls live in **`convex/ai.ts`** with `"use node"`.

- Prompts and JSON schemas: `convex/lib/prompts.ts`
- Apply results: internal mutation `suggestions.applyAiResult`
- Record failures: `suggestions.applyAiFailure`

Mirrors SiteAssist (`convex/ai.ts` + `lib/prompts.ts`) and Echo’s save-first
structuring philosophy.

### 7.2 Lifecycle

```
suggestions.create({ jobIds, windowStart, windowEnd })
   status = pending
   schedules NOT mutated yet
        │
        ▼
scheduler.runAfter(0, internal.ai.suggestSchedule, { suggestionId })
        │
        ▼
status = processing
load company, jobs, crew, existing confirmed schedules, availability
build constraint snapshot (JSON)
call OpenAI → structured proposal
        │
        ├─ success → applyAiResult
        │              create draft schedules (source: ai_suggestion)
        │              recompute conflicts
        │              store rationale + confidence
        │              status = ready
        │
        └─ failure → applyAiFailure
                       status = failed
                       aiErrorMessage set
                       no confirmed schedules touched
```

### 7.3 Input to the model

```
system: trades scheduling assistant + hard/soft constraint rules
user:
  company trade, timezone, default business hours, origin zip
  jobs[]: id, title, duration, skills, priority, address, preferred window
  crew[]: id, name, skills, certs, rate, default hours, active
  existingConfirmedSchedules[] in/near window (busy intervals)
  availability overrides in window
  optional weather summary for outdoor jobs
```

### 7.4 Structured output contract

Rough shape (validators mirror in schema / types):

| Field | Purpose |
| ----- | ------- |
| `assignments` | `{ jobId, startAt, endAt, crewMemberIds, rationale }[]` |
| `unscheduled` | `{ jobId, reason }[]` |
| `notes` | Cross-cutting dispatch notes for the owner |
| `confidence` | 0–1 self-score |
| `warnings` | Soft issues the model noticed |

Invalid model JSON is rejected; suggestion goes `failed` or partial with
sanitized subset — **never** half-writes confirmed rows.

### 7.5 Approval workflow

| Action | Effect |
| ------ | ------ |
| **Approve all** | Draft schedules → `confirmed`; jobs → `scheduled`; suggestion → `approved` |
| **Approve partial** | Selected assignments confirm; rest remain draft or discarded |
| **Edit then confirm** | Mutation updates draft times/crew; recompute conflicts; then confirm |
| **Reject** | Cancel draft schedules for this suggestion; jobs stay unscheduled; suggestion → `rejected` |
| **Retry** | New processing pass; prior drafts for this run cleared or superseded |

**Graceful degradation**

- Missing `OPENAI_API_KEY`: suggestion fails with clear message; manual
  scheduling fully works (SiteAssist pattern).
- Model proposes illegal overlap: conflict engine marks `error`; UI blocks
  bulk approve until fixed or ownerOverride.

### 7.6 What AI must not do

- Auto-confirm schedules in MVP
- Delete or move `confirmed` schedules without an explicit owner action
- Invent crew members or job ids not in the prompt snapshot
- Bypass `assertSameCompany` via client-supplied `companyId`

---

## 8. Calendar / board views

### MVP (list-based week board)

- **Left / top:** unscheduled job queue (filter priority, skills).
- **Main:** columns or sections by day (or by crew), cards for schedules.
- Assign dialog: start datetime, duration, multi-select crew.
- Conflict badges on cards; detail drawer lists conflict messages.
- Mobile: stacked day lists; large tap targets for confirm/edit.

### Near-term calendar

- Day / week grid with time gutters.
- Drag-and-drop reschedule (mutation on drop → conflict recompute).
- Travel buffer visualization.

### View data loading

```
query boardForRange(company, start, end):
  schedules in range (by_company_and_start)
  jobs for those schedules + unscheduled ready jobs
  crewMembers active
  conflicts for schedule ids
  join in query or client — keep payloads lean
```

Reactive subscriptions: when AI finishes writing drafts, the suggestions page
and board update without polling.

---

## 9. Frontend route map (Phase 2+)

| Route | Audience | Purpose |
| ----- | -------- | ------- |
| `/` | Public | Marketing / value prop |
| `/sign-in`, `/sign-up` | Public | Clerk |
| `/dashboard` | Clerk | Overview: today, conflicts, backlog counts |
| `/dashboard/board` | Clerk | Scheduling board |
| `/dashboard/jobs` | Clerk | Job list / create / detail |
| `/dashboard/jobs/[id]` | Clerk | Job detail + schedule history |
| `/dashboard/crew` | Clerk | Roster + default hours + skills |
| `/dashboard/crew/[id]` | Clerk | Member detail + availability overrides |
| `/dashboard/suggestions` | Clerk | AI runs list |
| `/dashboard/suggestions/[id]` | Clerk | Review / approve / reject |
| `/dashboard/settings` | Clerk | Company profile, hours, origin zip |

---

## 10. Integration with SiteAssist and Echo

| Product | Integration style | Data touchpoints |
| ------- | ----------------- | ---------------- |
| SiteAssist | Optional external id on `jobs` | `externalSource`, `externalJobId`; push `scheduledFor` later |
| Echo | Context only in MVP | Link `externalNoteIds` or show notes by shared job id later |
| Shared auth | Same Clerk app optional | Independent workspaces until org graph is unified |

**Principle:** Crew remains useful alone. Integrations are adapters, not hard
dependencies in the schema.

Do not auto-mutate SiteAssist or Echo records from AI without an explicit
owner-triggered sync action.

---

## 11. Security checklist

- [ ] OpenAI key only on Convex env, never `NEXT_PUBLIC_*`
- [ ] Every query/mutation uses `requireCompanyId` / `assertSameCompany`
- [ ] Client cannot set `companyId` arbitrarily on creates
- [ ] Generic not-found errors on cross-tenant access
- [ ] Validate AI JSON against Convex validators before write
- [ ] Approve/reject gated to authenticated company members
- [ ] Rate-limit suggestion actions if abused (later)

---

## 12. Observability and operations

MVP-friendly practices (align with SiteAssist/Echo):

- Structured `console` logs in actions with `suggestionId` + `companyId` (no
  customer PII in third-party tools by default).
- Persist `aiErrorMessage` and attempt counts on suggestion runs for
  owner-visible diagnosis.
- Conflict counts on the dashboard as a health signal for dispatch quality.
- Optional later: events table for `job_created`, `schedule_confirmed`,
  `suggestion_ready` (SiteAssist `events` pattern).

---

## 13. Implementation order

1. Phase 1 — README, ARCHITECTURE, `schema.ts`, `types/`, `lib/tenant.ts`
2. Phase 2 — Next.js + Tailwind + shadcn + Clerk + Convex providers + shell
3. `users` / `companies` provisioning + settings
4. `crewMembers` + `availability` CRUD
5. `jobs` CRUD + queue UI
6. `schedules` manual assign + `lib/conflicts` recompute
7. Board list/week UI + conflict badges
8. `scheduleSuggestions` + `ai.suggestSchedule` + approve/reject
9. Mobile polish, weather/travel enrichment, SiteAssist/Echo links

---

## 14. Cross-product notes

| Concern | SiteAssist | Echo | Crew |
| ------- | ---------- | ---- | ---- |
| Backend | Convex | Convex | Convex |
| Auth | Clerk | Clerk (+ PIN field) | Clerk |
| AI placement | Convex action | Convex action | Convex action |
| Core object | Lead | Voice note | Job + schedule |
| Save-first AI | Yes (triage) | Yes (structure) | Yes (suggest) |
| Tenant key | `companyId` | `companyId` | `companyId` |

Crew should feel like SiteAssist’s sibling for infrastructure and the natural
home for “who is on which job when” once leads convert to work.
