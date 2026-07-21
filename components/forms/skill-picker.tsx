"use client";

import { SKILLS } from "@/lib/constants";
import type { Skill } from "@/types";
import { Label } from "@/components/ui/label";

type Props = {
  value: Skill[];
  onChange: (next: Skill[]) => void;
  label?: string;
  className?: string;
};

/** Multi-select skill chips shared by Jobs and Crew forms. */
export function SkillPicker({
  value,
  onChange,
  label = "Skills",
  className,
}: Props) {
  function toggle(s: Skill) {
    onChange(
      value.includes(s) ? value.filter((x) => x !== s) : [...value, s],
    );
  }

  return (
    <div className={className}>
      {label ? <Label className="mb-2 block">{label}</Label> : null}
      <div className="flex max-h-32 flex-wrap gap-1.5 overflow-y-auto rounded-md border p-2">
        {SKILLS.map((s) => {
          const on = value.includes(s.value);
          return (
            <button
              key={s.value}
              type="button"
              onClick={() => toggle(s.value)}
              className={`rounded-full px-2.5 py-0.5 text-xs ring-1 ring-inset ${
                on
                  ? "bg-primary/10 text-primary ring-primary/30"
                  : "bg-muted text-muted-foreground ring-border"
              }`}
            >
              {s.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
