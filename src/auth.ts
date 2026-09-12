/**
 * Neon Auth client configuration for unified login across the ecosystem.
 *
 * Every site in the neurofeedback.space family uses the same Neon Auth
 * project (provisioned via the Vercel Neon integration on the nogn registry
 * project). One account signs in everywhere; sessions stay per domain
 * (neurofeedback.space subdomains share a cookie via cookie-config.ts;
 * nogn.app is a separate domain and hands off through the registry's
 * magic link).
 *
 * This module exports configuration types and environment variable names.
 * Each consuming app installs @neondatabase/auth (Next.js) or
 * @neondatabase/neon-js (React SPA / Tauri) and calls createNeonAuth or
 * createAuthClient with the exported config.
 *
 * The three calls every site makes:
 *
 *   1. signIn  -- redirect to the Neon Auth sign-in page or call the
 *                 auth handler's sign-in endpoint.
 *   2. session -- auth.getSession() (server) or useSession() (client)
 *                 returns { user: { id, email, name }, session }.
 *   3. signOut -- end the session and clear the cookie.
 *
 * Server setup (Next.js):
 *   import { createNeonAuth } from "@neondatabase/auth/next/server";
 *   import { NEON_AUTH_ENV } from "@peakbrain/ecosystem/auth";
 *   const auth = createNeonAuth({
 *     baseUrl: process.env[NEON_AUTH_ENV.baseUrl]!,
 *     cookies: { secret: process.env[NEON_AUTH_ENV.cookieSecret]! },
 *   });
 *   // auth.handler()     -- mount as API route
 *   // auth.middleware()   -- call from Next.js middleware
 *   // auth.getSession()  -- read current user in server components/actions
 *
 * Client setup (Next.js):
 *   import { createAuthClient } from "@neondatabase/auth/next";
 *   const authClient = createAuthClient();
 *   // In components: const { data } = useSession();
 *
 * Client setup (React SPA / Vite / Tauri):
 *   import { createAuthClient } from "@neondatabase/neon-js";
 *   const authClient = createAuthClient({
 *     baseUrl: import.meta.env[NEON_AUTH_ENV.viteBaseUrl],
 *   });
 */

// ------------------------------------------------------ env var names
/** Environment variable names for Neon Auth configuration. */
export const NEON_AUTH_ENV = {
  /** Server-side base URL for the auth endpoint. */
  baseUrl: "NEON_AUTH_BASE_URL",
  /** Cookie encryption secret (32+ chars). */
  cookieSecret: "NEON_AUTH_COOKIE_SECRET",
  /** Client-side base URL (Vite convention). */
  viteBaseUrl: "VITE_NEON_AUTH_URL",
} as const;

// ------------------------------------------------------ session types
/** The user object in a Neon Auth session. */
export interface EcosystemUser {
  /** Neon Auth user id (the identity key across the ecosystem). */
  id: string;
  /** Email address (used as the registry lookup key). */
  email: string;
  /** Display name, when set. */
  name?: string;
}

/** Shape returned by auth.getSession() or the useSession() hook. */
export interface EcosystemSession {
  user: EcosystemUser | null;
  session: {
    /** Session token id. */
    id: string;
    expiresAt: string;
  } | null;
}
