/**
 * Access client backed by the nogn registry API.
 *
 * hasAccess and resolveEcosystemProfile fetch entitlements from the registry
 * (GET https://members.nogn.app/api/entitlements?email=<email>) and run the
 * pure resolver over the result. The decision logic is identical to the
 * existing resolveEntitlements; only the data source changes.
 *
 * Both functions accept an injected `fetchFn` so tests can mock the network
 * call and the decision table stays pure.
 */

import {
  resolveEntitlements,
  type AppEntitlementRow,
  type Entitlements,
} from "./resolve.js";

// ------------------------------------------------------------ registry types

/** Shape returned by GET /api/entitlements on the nogn registry. */
export interface RegistryEntitlementsResponse {
  email: string;
  entitlements: RegistryEntitlementRow[];
}

export interface RegistryEntitlementRow {
  app: string;
  scope: string;
  expires_at: string | null;
}

// ------------------------------------------------------------ config

export interface AccessClientConfig {
  /** Registry base URL. Defaults to env REGISTRY_BASE_URL. */
  registryUrl?: string;
  /** Service token for the registry API. Read from env REGISTRY_SERVICE_TOKEN when omitted. */
  serviceToken?: string;
  /** Injected fetch for testing. Defaults to globalThis.fetch. */
  fetchFn?: typeof globalThis.fetch;
}

function resolveConfig(cfg?: AccessClientConfig) {
  const registryUrl =
    cfg?.registryUrl ||
    (typeof process !== "undefined"
      ? process.env?.REGISTRY_BASE_URL
      : undefined) ||
    "https://members.nogn.app";
  const serviceToken =
    cfg?.serviceToken ||
    (typeof process !== "undefined"
      ? process.env?.REGISTRY_SERVICE_TOKEN
      : undefined) ||
    "";
  const fetchFn = cfg?.fetchFn ?? globalThis.fetch;
  return { registryUrl, serviceToken, fetchFn };
}

// --------------------------------------------------- fetch entitlements

/**
 * Fetch raw entitlement rows from the registry for a given email.
 * Returns an empty array on network or auth errors (defensive).
 */
export async function fetchEntitlements(
  email: string,
  cfg?: AccessClientConfig
): Promise<RegistryEntitlementRow[]> {
  const { registryUrl, serviceToken, fetchFn } = resolveConfig(cfg);
  const url = `${registryUrl}/api/entitlements?email=${encodeURIComponent(email)}`;
  try {
    const res = await fetchFn(url, {
      headers: {
        Authorization: `Bearer ${serviceToken}`,
        Accept: "application/json",
      },
    });
    if (!res.ok) return [];
    const body = (await res.json()) as RegistryEntitlementsResponse;
    return body.entitlements ?? [];
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------- hasAccess

export interface HasAccessParams {
  userId?: string;
  email?: string;
  app: string;
  scope?: string;
}

/**
 * Check whether a user has access to a specific app (and optionally scope).
 *
 * Calls the registry API to fetch the user's entitlements by email, then
 * checks for an active (non-expired) row matching the requested app.
 * When both userId and email are provided, email is used for the API call.
 */
export async function hasAccess(
  params: HasAccessParams,
  cfg?: AccessClientConfig
): Promise<boolean> {
  const email = params.email;
  if (!email) return false;

  const rows = await fetchEntitlements(email, cfg);
  const now = new Date();

  return rows.some((row) => {
    if (row.app !== params.app) return false;
    if (params.scope && row.scope !== params.scope) return false;
    if (row.expires_at && new Date(row.expires_at).getTime() <= now.getTime())
      return false;
    return true;
  });
}

// -------------------------------------------------------- grantAppAccess

export interface GrantAccessParams {
  userId: string;
  app: string;
  scope?: string;
  grantedBy?: string;
  expiresAt?: string;
}

/**
 * Grant app access via the registry API (server-side, service role only).
 *
 * POST https://members.nogn.app/api/entitlements with the grant payload.
 * The registry route (being built by another coder) accepts the service token
 * and writes to the entitlements table.
 */
export async function grantAppAccess(
  params: GrantAccessParams,
  cfg?: AccessClientConfig
): Promise<{ ok: boolean; error?: string }> {
  const { registryUrl, serviceToken, fetchFn } = resolveConfig(cfg);
  const url = `${registryUrl}/api/entitlements`;
  try {
    const res = await fetchFn(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serviceToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        user_id: params.userId,
        app: params.app,
        scope: params.scope ?? "content",
        granted_by: params.grantedBy ?? "manual",
        expires_at: params.expiresAt ?? null,
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { ok: false, error: `${res.status}: ${text}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

// ----------------------------------------------- resolveEcosystemProfile

/**
 * Resolve a user's full entitlements from the registry, using the pure
 * resolver. Maps the registry's flat entitlement rows to the resolver's
 * AppEntitlementRow format and returns the same Entitlements shape as the
 * existing resolveEntitlements.
 *
 * This replaces per-app IO adapters (coral's resolveEcosystemProfile,
 * drugs' resolveEntitlementsFromDb, nfbspace's getEcosystemAccess) with
 * a single registry-backed call. App-specific UI mapping (upsell text,
 * legacy kind derivation) stays in each app.
 */
export async function resolveEcosystemProfile(
  params: { userId?: string; email?: string },
  cfg?: AccessClientConfig
): Promise<Entitlements> {
  const empty = resolveEntitlements({
    userId: undefined,
    appEntitlements: [],
    enrollments: [],
    medEntitlement: null,
    seats: [],
    sourcesRead: { app: false, enrollments: false, med: false, seats: false },
  });

  const email = params.email;
  if (!email) return empty;

  const rows = await fetchEntitlements(email, cfg);
  if (rows.length === 0 && !params.userId) return empty;

  // Map registry rows to the resolver's AppEntitlementRow format.
  const appEntitlements: AppEntitlementRow[] = rows.map((row) => ({
    app: row.app,
    scope: row.scope,
    granted_by: null,
    expires_at: row.expires_at,
  }));

  return resolveEntitlements({
    userId: params.userId ?? email,
    appEntitlements,
    enrollments: [],
    medEntitlement: null,
    seats: [],
    sourcesRead: { app: rows.length > 0, enrollments: false, med: false, seats: false },
  });
}
