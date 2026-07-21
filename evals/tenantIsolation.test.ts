/**
 * Tenant-isolation regression checks (source-level).
 * Locks down that operational Convex modules scope by companyId.
 */

import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function source(path: string): string {
  return readFileSync(join(root, path), "utf8");
}

function compact(s: string): string {
  return s.replace(/\s+/g, " ");
}

const OPERATIONAL_MODULES = [
  "convex/jobs.ts",
  "convex/crewMembers.ts",
  "convex/schedules.ts",
  "convex/availability.ts",
  "convex/suggestions.ts",
  "convex/packing.ts",
  "convex/myDay.ts",
  "convex/companies.ts",
];

describe("tenant isolation guardrails", () => {
  it("shared assertSameCompany denies cross-tenant docs and owner gates exist", () => {
    const tenant = compact(source("convex/lib/tenant.ts"));
    expect(tenant).toContain("export function assertSameCompany");
    expect(tenant).toContain("if (!doc || doc.companyId !== companyId)");
    expect(tenant).toContain("notFound()");
    expect(tenant).toContain("export async function requireOwner");
    expect(tenant).toContain("export function assertCanOwnerOverride");
  });

  it("every operational module imports tenant helpers", () => {
    for (const file of OPERATIONAL_MODULES) {
      const src = source(file);
      expect(src, file).toMatch(/from ["']\.\/lib\/tenant["']/);
      expect(src, file).toMatch(/requireCurrentUser|requireCompanyId/);
    }
  });

  it("list queries use by_company* indexes", () => {
    const jobs = compact(source("convex/jobs.ts"));
    expect(jobs).toMatch(/withIndex\("by_company/);

    const crew = compact(source("convex/crewMembers.ts"));
    expect(crew).toMatch(/withIndex\("by_company/);

    const schedules = compact(source("convex/schedules.ts"));
    expect(schedules).toMatch(/withIndex\("by_company_and_start"/);

    const suggestions = compact(source("convex/suggestions.ts"));
    expect(suggestions).toMatch(/withIndex\("by_company_and_created"/);
  });

  it("get/update paths call assertSameCompany after db.get", () => {
    for (const [file, names] of [
      ["convex/jobs.ts", ["get", "update"]],
      ["convex/crewMembers.ts", ["get", "update"]],
      ["convex/schedules.ts", ["listForJob", "confirm", "cancel"]],
    ] as const) {
      const src = source(file);
      for (const name of names) {
        expect(src, `${file} ${name}`).toContain(`export const ${name}`);
        const start = src.indexOf(`export const ${name}`);
        const next = src.indexOf("\nexport const ", start + 10);
        const body = src.slice(start, next === -1 ? undefined : next);
        expect(compact(body), `${file}.${name}`).toMatch(
          /assertSameCompany|requireCurrentUser/,
        );
      }
    }
  });

  it("no public convex module accepts client-supplied companyId on create", () => {
    const convexDir = join(root, "convex");
    const files = readdirSync(convexDir).filter((f) => f.endsWith(".ts"));
    for (const f of files) {
      if (f === "schema.ts") continue;
      const src = source(join("convex", f));
      // Creates should set companyId from user, not args.companyId
      if (!src.includes("export const create")) continue;
      const start = src.indexOf("export const create");
      const next = src.indexOf("\nexport const ", start + 10);
      const body = src.slice(start, next === -1 ? undefined : next);
      expect(compact(body), f).not.toMatch(
        /args\.companyId|args\["companyId"\]/,
      );
      if (body.includes("db.insert")) {
        expect(compact(body), f).toMatch(/companyId:\s*user\.companyId/);
      }
    }
  });
});
