// @vitest-environment edge-runtime
/**
 * Runtime tests for Convex functions using convex-test (in-memory backend).
 *
 * These exercise the actual mutation/query logic — tenant scoping, the conflict
 * lifecycle, and the hardening from the code-review PRs — which the pure-function
 * unit tests in evals/ cannot reach. No live Convex/Clerk deployment required.
 */
import { describe, expect, test } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

// All Convex modules except the Node OpenAI action (its `openai` import fails
// under the edge-runtime test environment; the AI action isn't exercised here).
const modules = import.meta.glob(["./**/*.*s", "!./ai.ts"]);

const MON_UTC = Date.UTC(2026, 6, 13, 0, 0, 0); // a Monday
/** Hour `h` on that Monday, UTC. */
const at = (h: number) => Date.UTC(2026, 6, 13, h, 0, 0);
const HOUR = 60 * 60 * 1000;

type Tester = ReturnType<typeof convexTest>;
type AsUser = ReturnType<Tester["withIdentity"]>;

/** Provision an owner + company, pinned to UTC for deterministic time math. */
async function provisionOwner(
  t: Tester,
  subject: string,
  name = "Olivia Owner",
): Promise<AsUser> {
  const as = t.withIdentity({ subject, name, email: `${subject}@example.com` });
  await as.mutation(api.users.store, {});
  await as.mutation(api.companies.update, { timezone: "UTC" });
  return as;
}

async function addCrew(
  as: AsUser,
  name: string,
  skills: string[],
): Promise<Id<"crewMembers">> {
  return (await as.mutation(api.crewMembers.create, {
    name,
    skills: skills as never,
  })) as Id<"crewMembers">;
}

async function addJob(
  as: AsUser,
  title: string,
  requiredSkills: string[],
): Promise<Id<"jobs">> {
  return (await as.mutation(api.jobs.create, {
    title,
    serviceType: "plumbing",
    estimatedDurationMinutes: 120,
    requiredSkills: requiredSkills as never,
    priority: "medium",
  })) as Id<"jobs">;
}

describe("provisioning", () => {
  test("users.store creates a company + owner and is idempotent", async () => {
    const t = convexTest(schema, modules);
    const as = t.withIdentity({
      subject: "owner1",
      name: "Olivia Owner",
      email: "olivia@example.com",
    });
    const first = await as.mutation(api.users.store, {});
    const second = await as.mutation(api.users.store, {});
    expect(first).toEqual(second);

    const me = await as.query(api.users.current, {});
    expect(me?.role).toBe("owner");
    expect(me?.company?.name).toContain("Olivia");
  });

  test("unauthenticated users.store is rejected", async () => {
    const t = convexTest(schema, modules);
    await expect(t.mutation(api.users.store, {})).rejects.toThrow();
  });
});

describe("tenant isolation", () => {
  test("a user cannot read another company's job", async () => {
    const t = convexTest(schema, modules);
    const a = await provisionOwner(t, "ownerA", "Ann");
    const b = await provisionOwner(t, "ownerB", "Ben");

    const jobA = await addJob(a, "A's job", ["plumbing_rough"]);

    // Owner A can read it; owner B gets a not-found (no cross-tenant leak).
    await expect(a.query(api.jobs.get, { jobId: jobA })).resolves.toBeTruthy();
    await expect(b.query(api.jobs.get, { jobId: jobA })).rejects.toThrow(
      /not found/i,
    );
  });
});

describe("schedule conflicts", () => {
  test("confirming an overlapping crew booking is blocked, override bypasses", async () => {
    const t = convexTest(schema, modules);
    const as = await provisionOwner(t, "owner1");
    const crew = await addCrew(as, "Alex", ["plumbing_rough"]);
    const job1 = await addJob(as, "Job 1", ["plumbing_rough"]);
    const job2 = await addJob(as, "Job 2", ["plumbing_rough"]);

    // First confirmed booking 9–11.
    await as.mutation(api.schedules.create, {
      jobId: job1,
      startAt: at(9),
      endAt: at(11),
      crewMemberIds: [crew],
      confirm: true,
    });

    // Overlapping confirmed booking for the same crew → blocking conflict.
    await expect(
      as.mutation(api.schedules.create, {
        jobId: job2,
        startAt: at(10),
        endAt: at(12),
        crewMemberIds: [crew],
        confirm: true,
      }),
    ).rejects.toThrow(/blocking/i);

    // Owner override lets it through.
    const overridden = await as.mutation(api.schedules.create, {
      jobId: job2,
      startAt: at(10),
      endAt: at(12),
      crewMemberIds: [crew],
      confirm: true,
      ownerOverride: true,
    });
    expect(overridden).toBeTruthy();
  });

  test("confirming a crew that lacks the required skill is blocked", async () => {
    const t = convexTest(schema, modules);
    const as = await provisionOwner(t, "owner1");
    const crew = await addCrew(as, "Alex", ["general_labor"]);
    const job = await addJob(as, "Electrical", ["electrical_finish"]);

    await expect(
      as.mutation(api.schedules.create, {
        jobId: job,
        startAt: at(9),
        endAt: at(11),
        crewMemberIds: [crew],
        confirm: true,
      }),
    ).rejects.toThrow(/blocking/i);
  });

  test("H4: editing a confirmed schedule into a hard conflict is blocked", async () => {
    const t = convexTest(schema, modules);
    const as = await provisionOwner(t, "owner1");
    const crew = await addCrew(as, "Alex", ["plumbing_rough"]);
    const job1 = await addJob(as, "Job 1", ["plumbing_rough"]);
    const job2 = await addJob(as, "Job 2", ["plumbing_rough"]);

    await as.mutation(api.schedules.create, {
      jobId: job1,
      startAt: at(9),
      endAt: at(11),
      crewMemberIds: [crew],
      confirm: true,
    });
    const s2 = await as.mutation(api.schedules.create, {
      jobId: job2,
      startAt: at(13),
      endAt: at(15),
      crewMemberIds: [crew],
      confirm: true,
    });

    // Move S2 on top of S1 (same crew) → blocked.
    await expect(
      as.mutation(api.schedules.update, {
        scheduleId: s2,
        startAt: at(10),
        endAt: at(12),
      }),
    ).rejects.toThrow(/blocking/i);
  });

  test("M5: cancelling a schedule clears a peer's stale overbooking conflict", async () => {
    const t = convexTest(schema, modules);
    const as = await provisionOwner(t, "owner1");
    const crew = await addCrew(as, "Alex", ["plumbing_rough"]);
    const job1 = await addJob(as, "Job 1", ["plumbing_rough"]);
    const job2 = await addJob(as, "Job 2", ["plumbing_rough"]);

    // Two overlapping DRAFTS → soft overbooking warnings (not blocking).
    const s1 = await as.mutation(api.schedules.create, {
      jobId: job1,
      startAt: at(9),
      endAt: at(11),
      crewMemberIds: [crew],
    });
    const s2 = await as.mutation(api.schedules.create, {
      jobId: job2,
      startAt: at(10),
      endAt: at(12),
      crewMemberIds: [crew],
    });

    const before = await as.query(api.schedules.getConflictsForSchedule, {
      scheduleId: s2,
    });
    expect(
      before.some((c) => c.type === "overbooking" && !c.isResolved),
    ).toBe(true);

    // Cancel S1 → S2's overbooking-against-S1 must be refreshed away.
    await as.mutation(api.schedules.cancel, { scheduleId: s1 });

    const after = await as.query(api.schedules.getConflictsForSchedule, {
      scheduleId: s2,
    });
    expect(
      after.some((c) => c.type === "overbooking" && !c.isResolved),
    ).toBe(false);
  });
});

describe("greedy pack + approve", () => {
  test("staffs a multi-person crew and approve confirms the proposals", async () => {
    const t = convexTest(schema, modules);
    const as = await provisionOwner(t, "owner1");
    const rough = await addCrew(as, "Alex", ["plumbing_rough"]);
    const finish = await addCrew(as, "Sam", ["plumbing_finish"]);
    const job = await addJob(as, "Rough + finish", [
      "plumbing_rough",
      "plumbing_finish",
    ]);

    const suggestionId = await as.mutation(api.packing.greedySuggest, {
      jobIds: [job],
      windowStartAt: MON_UTC,
      windowEndAt: MON_UTC + 5 * 24 * HOUR,
    });

    const run = await as.query(api.schedules.listForSuggestion, {
      suggestionId: suggestionId as Id<"scheduleSuggestions">,
    });
    expect(run.schedules).toHaveLength(1);
    expect([...run.schedules[0].crewMemberIds].sort()).toEqual(
      [rough, finish].sort(),
    );
    expect(run.schedules[0].status).toBe("proposed");

    // Approve → the proposal becomes confirmed.
    await as.mutation(api.suggestions.approve, {
      suggestionId: suggestionId as Id<"scheduleSuggestions">,
    });
    const confirmed = await as.query(api.schedules.listForSuggestion, {
      suggestionId: suggestionId as Id<"scheduleSuggestions">,
    });
    expect(confirmed.schedules[0].status).toBe("confirmed");
  });
});

describe("roles + PII", () => {
  /** Provision an owner and a member who joins via the owner's invite code. */
  async function ownerAndMember(t: Tester) {
    const owner = await provisionOwner(t, "owner1", "Olivia");
    const code = await owner.mutation(api.companies.rotateInviteCode, {});
    const member = t.withIdentity({
      subject: "member1",
      name: "Mia Member",
      email: "mia@example.com",
    });
    await member.mutation(api.users.store, { inviteCode: code });
    return { owner, member };
  }

  test("invite code joins the member into the same company", async () => {
    const t = convexTest(schema, modules);
    const { owner, member } = await ownerAndMember(t);
    const ownerMe = await owner.query(api.users.current, {});
    const memberMe = await member.query(api.users.current, {});
    expect(memberMe?.role).toBe("member");
    expect(memberMe?.companyId).toEqual(ownerMe?.companyId);
  });

  test("M9: members do not see crew pay/notes, owners do", async () => {
    const t = convexTest(schema, modules);
    const { owner, member } = await ownerAndMember(t);
    await owner.mutation(api.crewMembers.create, {
      name: "Alex",
      skills: ["plumbing_rough"] as never,
      hourlyRate: 42,
      notes: "prefers mornings",
    });

    const ownerView = await owner.query(api.crewMembers.list, {});
    expect(ownerView[0].hourlyRate).toBe(42);
    expect(ownerView[0].notes).toBe("prefers mornings");

    const memberView = await member.query(api.crewMembers.list, {});
    expect(memberView[0].name).toBe("Alex"); // roster still visible
    expect(memberView[0].hourlyRate).toBeUndefined();
    expect(memberView[0].notes).toBeUndefined();
  });

  test("members cannot change company settings or approve suggestions", async () => {
    const t = convexTest(schema, modules);
    const { owner, member } = await ownerAndMember(t);

    await expect(
      member.mutation(api.companies.update, { name: "Hijacked Co" }),
    ).rejects.toThrow(/owner/i);

    // Owner packs a proposal; only the owner may approve it.
    const crew = await addCrew(owner, "Alex", ["plumbing_rough"]);
    const job = await addJob(owner, "Job", ["plumbing_rough"]);
    void crew;
    const suggestionId = await owner.mutation(api.packing.greedySuggest, {
      jobIds: [job],
      windowStartAt: MON_UTC,
      windowEndAt: MON_UTC + 5 * 24 * HOUR,
    });
    await expect(
      member.mutation(api.suggestions.approve, {
        suggestionId: suggestionId as Id<"scheduleSuggestions">,
      }),
    ).rejects.toThrow(/owner/i);
  });
});

describe("job status sync", () => {
  test("confirming then cancelling a schedule moves the job draft → scheduled → draft", async () => {
    const t = convexTest(schema, modules);
    const as = await provisionOwner(t, "owner1");
    const crew = await addCrew(as, "Alex", ["plumbing_rough"]);
    const job = await addJob(as, "Job", ["plumbing_rough"]);

    expect((await as.query(api.jobs.get, { jobId: job })).status).toBe("draft");

    const s = await as.mutation(api.schedules.create, {
      jobId: job,
      startAt: at(9),
      endAt: at(11),
      crewMemberIds: [crew],
      confirm: true,
    });
    expect((await as.query(api.jobs.get, { jobId: job })).status).toBe(
      "scheduled",
    );

    await as.mutation(api.schedules.cancel, { scheduleId: s });
    expect((await as.query(api.jobs.get, { jobId: job })).status).toBe("draft");
  });
});
