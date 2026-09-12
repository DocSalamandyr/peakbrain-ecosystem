/**
 * Canonical ecosystem entitlement resolver (pure core).
 *
 * Aligned with the LOCKED pricing model (catalog.ts, 2026-06-15): TWO paid
 * scopes only -- `content` (Member $19.99/mo) and `listing:premium` (Pro listing
 * $49.99/mo, implies content). There is no separate `clinician` scope; the Pro
 * listing serves clinician, vendor, or any profile kind. Org seats fund
 * listing:premium per person.
 *
 * This file is byte-identical across all ecosystem apps (nfbspace, brane-coral,
 * drugs-neurofeedback-space). It is the mirror target. App-specific IO adapters
 * live alongside each app's own ecosystem directory.
 *
 * resolveEntitlements() is PURE: it takes already-fetched rows and returns the
 * resolved set. All Supabase IO lives in per-app IO adapters. That keeps the
 * resolution logic (implications, grace, expiry) unit-testable with no database.
 */

// ----------------------------------------------------------------- vocabulary
export type EcosystemAppId = "path" | "drugs" | "nfbspace" | "coral";

/**
 * Canonical entitlement scopes. Matches catalog.ts Scope plus the derived
 * org-seat scope. Legacy DB values (clinician, all_access, full, trial) are
 * mapped to these two canonical scopes by the resolver.
 */
export type EntitlementScope =
  | "content"
  | "listing:premium"
  | `org:${string}:seat`;

// ------------------------------------------------------------------ row types
// Mirror the real tables as plain data so the core needs no Supabase types.

export interface AppEntitlementRow {
  app: string;
  scope: string; // content | listing:premium | legacy: clinician | all_access | full | trial
  granted_by: string | null;
  expires_at: string | null; // ISO; null = perpetual / while-subscribed
}

export interface EnrollmentRow {
  product_id: string; // book.* | course.* | bundle.series_all | app.your_brain_on_drugs
  status: string;
  expires_at: string | null;
}

export interface MedEntitlementRow {
  app_access_until: string | null;
  granted_via: string | null;
}

/** One confirmed appearance the person holds, joined to its funding org. */
export interface SeatRow {
  org_id: string;
  appearance_id: string;
  seat_funded: boolean;
  addon_status: "none" | "active" | "grace" | "dissolved" | null;
}

export interface ResolveInput {
  userId: string | undefined;
  appEntitlements: AppEntitlementRow[];
  enrollments: EnrollmentRow[];
  medEntitlement: MedEntitlementRow | null;
  seats: SeatRow[];
  /** Which source reads actually succeeded, so we can set `resolved` honestly. */
  sourcesRead: { app: boolean; enrollments: boolean; med: boolean; seats: boolean };
}

// --------------------------------------------------------------- result types
export interface ScopeGrant {
  active: boolean;
  via: string | null;
  expiresAt: string | null;
}

export interface OrgSeat {
  orgId: string;
  appearanceId: string | null;
  active: boolean;
}

export type MembershipKind =
  | "guest"
  | "signed_in"
  | "drugs_only"
  | "book_owner"
  | "pro";

export interface Entitlements {
  signedIn: boolean;
  resolved: boolean;
  kind: MembershipKind;
  scopes: {
    content: ScopeGrant;
    "listing:premium": ScopeGrant;
  };
  orgSeats: OrgSeat[];
  apps: Record<EcosystemAppId, ScopeGrant>;
  can: {
    useContent: boolean;
    havePremiumListing: boolean;
    publishBlog: boolean;
  };
  ownedBookIds: string[];
  ownedCourseIds: string[];
}

const DRUGS_APP_PRODUCT_ID = "app.your_brain_on_drugs";
const ECOSYSTEM_APP_IDS: EcosystemAppId[] = ["path", "drugs", "nfbspace", "coral"];

const inactive = (): ScopeGrant => ({ active: false, via: null, expiresAt: null });
const emptyApps = (): Record<EcosystemAppId, ScopeGrant> => ({
  path: inactive(),
  drugs: inactive(),
  nfbspace: inactive(),
  coral: inactive(),
});

function notExpired(ts: string | null | undefined, now: Date): boolean {
  if (!ts) return true; // null = perpetual / while-subscribed
  return new Date(ts).getTime() > now.getTime();
}

/** Keep the grant with the later expiry (null/perpetual wins). */
function preferLater(a: ScopeGrant, candidate: ScopeGrant): ScopeGrant {
  if (!a.active) return candidate;
  if (a.expiresAt === null) return a;
  if (candidate.expiresAt === null) return candidate;
  return new Date(candidate.expiresAt) > new Date(a.expiresAt) ? candidate : a;
}

/**
 * Map a DB scope value to the canonical scope vocabulary. Legacy values
 * (clinician, all_access, full, trial) are mapped to the two locked scopes.
 * Returns null for unrecognized values (resolver ignores them).
 */
function canonicalScope(dbScope: string): "content" | "listing:premium" | null {
  switch (dbScope) {
    case "content":
    case "all_access":
    case "full":
    case "trial":
      return "content";
    case "listing:premium":
    case "clinician":
      return "listing:premium";
    default:
      return null;
  }
}

// --------------------------------------------------------------- the resolver
export function resolveEntitlements(
  input: ResolveInput,
  now: Date = new Date()
): Entitlements {
  const e: Entitlements = {
    signedIn: false,
    resolved: false,
    kind: "guest",
    scopes: { content: inactive(), "listing:premium": inactive() },
    orgSeats: [],
    apps: emptyApps(),
    can: { useContent: false, havePremiumListing: false, publishBlog: false },
    ownedBookIds: [],
    ownedCourseIds: [],
  };

  if (!input.userId) return e; // guest
  e.signedIn = true;
  e.resolved =
    input.sourcesRead.app ||
    input.sourcesRead.enrollments ||
    input.sourcesRead.med ||
    input.sourcesRead.seats;

  // 1. app_entitlements -> scopes + per-app access
  for (const row of input.appEntitlements) {
    if (!notExpired(row.expires_at, now)) continue;
    const grant: ScopeGrant = {
      active: true,
      via: row.granted_by ?? row.scope,
      expiresAt: row.expires_at,
    };
    const scope = canonicalScope(row.scope);
    if (scope === "content") {
      e.scopes.content = preferLater(e.scopes.content, grant);
    }
    if (scope === "listing:premium") {
      e.scopes["listing:premium"] = preferLater(e.scopes["listing:premium"], grant);
    }
    if ((ECOSYSTEM_APP_IDS as string[]).includes(row.app)) {
      e.apps[row.app as EcosystemAppId] = preferLater(
        e.apps[row.app as EcosystemAppId],
        grant
      );
    }
  }

  // 2. enrollments -> owned products + content (books) + app access
  for (const en of input.enrollments) {
    if (en.status !== "active" || !notExpired(en.expires_at, now)) continue;
    if (en.product_id.startsWith("book.")) {
      e.ownedBookIds.push(en.product_id);
      e.scopes.content = preferLater(e.scopes.content, {
        active: true,
        via: "book_purchase",
        expiresAt: en.expires_at,
      });
    }
    if (
      en.product_id.startsWith("course.") ||
      en.product_id === "bundle.series_all"
    ) {
      e.ownedCourseIds.push(en.product_id);
      e.apps.path = preferLater(e.apps.path, {
        active: true,
        via: "course_enrollment",
        expiresAt: en.expires_at,
      });
    }
    if (en.product_id === DRUGS_APP_PRODUCT_ID) {
      e.apps.drugs = preferLater(e.apps.drugs, {
        active: true,
        via: "path_bundle",
        expiresAt: en.expires_at,
      });
    }
  }

  // 3. med.entitlements -> drugs content
  if (
    input.medEntitlement &&
    notExpired(input.medEntitlement.app_access_until, now) &&
    input.medEntitlement.app_access_until
  ) {
    const grant: ScopeGrant = {
      active: true,
      via: input.medEntitlement.granted_via ?? "med_entitlement",
      expiresAt: input.medEntitlement.app_access_until,
    };
    e.scopes.content = preferLater(e.scopes.content, grant);
    e.apps.drugs = preferLater(e.apps.drugs, grant);
  }

  // 4. org seats -> listing:premium (only while addon is active or in grace)
  for (const s of input.seats) {
    const active =
      s.seat_funded &&
      (s.addon_status === "active" || s.addon_status === "grace");
    e.orgSeats.push({
      orgId: s.org_id,
      appearanceId: s.appearance_id,
      active,
    });
    if (active) {
      e.scopes["listing:premium"] = preferLater(
        e.scopes["listing:premium"],
        { active: true, via: `org:${s.org_id}:seat`, expiresAt: null }
      );
    }
  }

  // 5. implication: listing:premium => content (catalog.expandScopes)
  if (e.scopes["listing:premium"].active && !e.scopes.content.active) {
    e.scopes.content = {
      active: true,
      via: "listing:premium",
      expiresAt: e.scopes["listing:premium"].expiresAt,
    };
  }

  // 6. derive can[] and kind
  e.can = {
    useContent: e.scopes.content.active,
    havePremiumListing: e.scopes["listing:premium"].active,
    publishBlog: e.scopes["listing:premium"].active,
  };

  if (e.scopes["listing:premium"].active) e.kind = "pro";
  else if (e.ownedBookIds.length > 0) e.kind = "book_owner";
  else if (
    e.apps.drugs.active &&
    !e.apps.path.active &&
    !e.apps.coral.active &&
    !e.apps.nfbspace.active
  )
    e.kind = "drugs_only";
  else e.kind = "signed_in";

  return e;
}

/** True if the resolved set satisfies a required scope, applying implications. */
export function hasScope(e: Entitlements, scope: EntitlementScope): boolean {
  if (scope === "content") return e.scopes.content.active;
  if (scope === "listing:premium") return e.scopes["listing:premium"].active;
  // org:<id>:seat
  const orgId = scope.split(":")[1];
  return e.orgSeats.some((s) => s.orgId === orgId && s.active);
}
