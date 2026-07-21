"use client";

import { ReactNode, useMemo } from "react";
import { ClerkProvider, useAuth } from "@clerk/nextjs";
import { ConvexReactClient } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";

function resolveConvexUrl(): string {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL?.trim();
  if (url) return url;

  // Allow `next build` / local scaffold without secrets.
  const isBuild =
    process.env.NEXT_PHASE === "phase-production-build" ||
    process.env.npm_lifecycle_event === "build";

  if (isBuild || process.env.NODE_ENV !== "production") {
    return "https://placeholder.convex.cloud";
  }

  // Production runtime without a real URL must not silently use a placeholder.
  throw new Error(
    "NEXT_PUBLIC_CONVEX_URL is not set. Refusing to connect to a placeholder Convex deployment.",
  );
}

/**
 * Wires Clerk authentication into the Convex client so every Convex call
 * carries the signed-in user's identity. Wrap the whole app in this provider.
 */
export function Providers({ children }: { children: ReactNode }) {
  const convex = useMemo(() => new ConvexReactClient(resolveConvexUrl()), []);

  return (
    <ClerkProvider>
      <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
        {children}
      </ConvexProviderWithClerk>
    </ClerkProvider>
  );
}
