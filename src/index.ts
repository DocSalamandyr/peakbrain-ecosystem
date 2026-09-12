// @peakbrain/ecosystem -- shared entitlement resolver, pricing catalog,
// SSO cookie config, access client and auth types for the
// neurofeedback.space product family.

// Pure resolver (no IO, no network)
export {
  resolveEntitlements,
  hasScope,
  type EcosystemAppId,
  type EntitlementScope,
  type AppEntitlementRow,
  type EnrollmentRow,
  type MedEntitlementRow,
  type SeatRow,
  type ResolveInput,
  type ScopeGrant,
  type OrgSeat,
  type MembershipKind,
  type Entitlements,
} from "./resolve";

// Pricing catalog
export {
  PRICING_TIERS,
  ORG_BANDS,
  BOOK_CONTENT_DAYS,
  expandScopes,
  tierById,
  type Scope,
  type ProfileKind,
  type PricingTier,
} from "./catalog";

// SSO cookie config
export { getAuthCookieOptions } from "./cookie-config";

// Tier-to-scope mapping
export { scopeForTier } from "./scope";

// Vocabulary: app ids, scope names, app metadata, constants
// Note: EcosystemAppId from resolve.ts covers the 4 original apps
// (path, drugs, nfbspace, coral). The vocabulary module extends this to
// the full set including books, courses, directory, nogn.
export {
  ECOSYSTEM_APPS,
  ECOSYSTEM_DISCLAIMER_KEY,
  DRUGS_APP_PRODUCT_ID,
  BUNDLE_PRODUCT_ID,
  BOOK_REDEMPTION_TRIAL_SCOPE,
  BOOK_REDEMPTION_TRIAL_GRANTED_BY,
  type LegacyAppId,
  type AnyAppId,
  type EcosystemApp,
} from "./vocabulary";
export type { EcosystemAppId as WideAppId } from "./vocabulary";

// Registry-backed access client
export {
  hasAccess,
  grantAppAccess,
  fetchEntitlements,
  resolveEcosystemProfile,
  type HasAccessParams,
  type GrantAccessParams,
  type AccessClientConfig,
  type RegistryEntitlementsResponse,
  type RegistryEntitlementRow,
} from "./access";

// Neon Auth configuration and session types
export {
  NEON_AUTH_ENV,
  type EcosystemUser,
  type EcosystemSession,
} from "./auth";
