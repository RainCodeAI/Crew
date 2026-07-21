"use client";

import { useMemo } from "react";
import { weekRangeContaining } from "@/lib/date";

/** Stable week [from, to) for the current local week (Monday-based). */
export function useWeekRange(anchor?: Date) {
  return useMemo(
    () => weekRangeContaining(anchor ?? new Date()),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally freeze on mount
    [],
  );
}
