import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

/**
 * Clerk middleware.
 * - /dashboard/* requires owner/dispatcher authentication.
 * - Marketing + auth routes stay public.
 *
 * TODO (L5): Next.js 16 may migrate the "middleware" file convention to
 * "proxy" — see https://nextjs.org/docs/messages/middleware-to-proxy
 * Do not rewrite until Clerk + Next docs stabilize for App Router + auth.
 */
const isProtectedRoute = createRouteMatcher(["/dashboard(.*)"]);

export default clerkMiddleware(async (auth, req) => {
  if (isProtectedRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
