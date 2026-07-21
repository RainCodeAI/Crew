/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as ai from "../ai.js";
import type * as availability from "../availability.js";
import type * as companies from "../companies.js";
import type * as crewMembers from "../crewMembers.js";
import type * as jobs from "../jobs.js";
import type * as myDay from "../myDay.js";
import type * as packing from "../packing.js";
import type * as schedules from "../schedules.js";
import type * as suggestions from "../suggestions.js";
import type * as users from "../users.js";
import type * as lib_conflicts from "../lib/conflicts.js";
import type * as lib_prompts from "../lib/prompts.js";
import type * as lib_scheduling from "../lib/scheduling.js";
import type * as lib_tenant from "../lib/tenant.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  ai: typeof ai;
  availability: typeof availability;
  companies: typeof companies;
  crewMembers: typeof crewMembers;
  jobs: typeof jobs;
  myDay: typeof myDay;
  packing: typeof packing;
  schedules: typeof schedules;
  suggestions: typeof suggestions;
  users: typeof users;
  "lib/conflicts": typeof lib_conflicts;
  "lib/prompts": typeof lib_prompts;
  "lib/scheduling": typeof lib_scheduling;
  "lib/tenant": typeof lib_tenant;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
