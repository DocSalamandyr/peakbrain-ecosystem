/**
 * Map a pricing-catalog tier id to the entitlement scope it grants.
 * listing:premium implies content (see catalog.ts expandScopes).
 */
export function scopeForTier(tier: string): string {
  if (tier === "pro" || tier === "organization" || tier === "clinician") {
    return "listing:premium";
  }
  return "content"; // member, book, and default
}
