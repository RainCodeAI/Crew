"use client";

import { useEffect, useState } from "react";
import { useConvexAuth, useMutation } from "convex/react";
import { useUser } from "@clerk/nextjs";
import { api } from "@/convex/_generated/api";

function readInviteCode(): string | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const fromQuery = new URLSearchParams(window.location.search).get("invite");
    if (fromQuery?.trim()) {
      const code = fromQuery.trim().toUpperCase();
      sessionStorage.setItem("crew_invite_code", code);
      return code;
    }
    return sessionStorage.getItem("crew_invite_code")?.trim() || undefined;
  } catch {
    return undefined;
  }
}

/**
 * Ensures the signed-in Clerk user has a corresponding Convex `users` record
 * (and a company). Call once near the top of the authenticated app.
 * Supports `?invite=CODE` for joining an existing workspace on first provision.
 */
export function useStoreUser() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const { isLoaded: isUserLoaded, user } = useUser();
  const storeUser = useMutation(api.users.store);
  const [isStored, setIsStored] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);

  useEffect(() => {
    if (!isAuthenticated) {
      setIsStored(false);
      setError(null);
      return;
    }
    if (!isUserLoaded) return;

    let cancelled = false;
    setIsStored(false);
    setError(null);
    void (async () => {
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          await storeUser({
            name: user?.fullName ?? undefined,
            email: user?.primaryEmailAddress?.emailAddress ?? undefined,
            inviteCode: readInviteCode(),
          });
          try {
            sessionStorage.removeItem("crew_invite_code");
          } catch {
            /* ignore */
          }
          if (!cancelled) setIsStored(true);
          return;
        } catch (err) {
          if (attempt < 2) {
            await new Promise((resolve) =>
              setTimeout(resolve, 400 * 2 ** attempt),
            );
          } else if (!cancelled) {
            setError(
              err instanceof Error
                ? err
                : new Error(
                    "Workspace setup could not be completed. Check the production configuration or try again.",
                  ),
            );
            return;
          }
        }
      }
      if (!cancelled) {
        setError(
          new Error(
            "Workspace setup could not be completed. Check the production configuration or try again.",
          ),
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, isUserLoaded, retryNonce, storeUser, user?.id]);

  return {
    error,
    isLoading: isLoading || !isUserLoaded,
    isAuthenticated,
    isReady: isAuthenticated && isStored && !error,
    retry: () => setRetryNonce((value) => value + 1),
  };
}
