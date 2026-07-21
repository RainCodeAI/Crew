import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merge Tailwind class names without specificity conflicts.
 * Standard shadcn/ui helper used by every UI primitive.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
