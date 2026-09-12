/**
 * Canonical Peak Brain pricing + entitlement catalog — the SINGLE SOURCE OF TRUTH
 * for the pricing matrix across every app (Directory, Path, Drugs, BraneCoral).
 *
 * The pricing was fractured (coral 3 tiers, drugs 2, nfbspace 4, path none; "$29.99"
 * meant three different things). This file collapses all of it into two scopes and
 * one ladder. Mirror this file into each app's src/lib/pricing/ (or consume from a
 * shared package once one exists); each app's pricing page renders from PRICING_TIERS.
 *
 * Two scopes only: `content` (chat + database + Path tracking) and `listing:premium`
 * (premium directory listing). listing:premium IMPLIES content (Pro includes Member).
 */

export type Scope = "content" | "listing:premium";

/**
 * A directory listing's kind. The free basic listing AND the $49.99 Pro upgrade apply
 * across ALL of these; "organization" is the container that holds member listings.
 */
export type ProfileKind =
  | "consumer"
  | "student"
  | "clinician"
  | "vendor"
  | "product"
  | "organization";

export interface PricingTier {
  id: "free" | "member" | "pro" | "organization";
  name: string;
  priceMonthly: number | null; // null = $0 or custom/banded
  priceYearly: number | null;
  grants: Scope[]; // listing:premium implies content (see expandScopes)
  badge?: string;
  blurb: string;
  features: string[];
  forKinds: ProfileKind[];
  /** LemonSqueezy variant ids — STUBS to fill in once the LS store exists. */
  lemonSqueezy: { monthly?: string; yearly?: string };
}

/** Buying a book grants `content` for this many days, by format. */
export const BOOK_CONTENT_DAYS = { ebook: 180, paperback: 365 } as const;

/** Organization add-on: bundled Pro seats under one transferable billing owner. */
export const ORG_BANDS = [
  { seats: 3, priceMonthly: 129, lemonSqueezy: "org-3-monthly" },
  { seats: 10, priceMonthly: 399, lemonSqueezy: "org-10-monthly" },
  { seats: 25, priceMonthly: 899, lemonSqueezy: "org-25-monthly" },
] as const;

export const PRICING_TIERS: PricingTier[] = [
  {
    id: "free",
    name: "Free",
    priceMonthly: 0,
    priceYearly: 0,
    grants: [],
    blurb: "Track your learning and sample the tools.",
    features: [
      "Guest-limited BraneCoral chat",
      "Guest-limited drug + EEG lookup",
      "Free Path courses and learning tracking",
      "Your owned-books shelf",
      "Free basic directory listing for verified clinicians and vendors",
    ],
    forKinds: ["consumer", "clinician", "vendor"],
    lemonSqueezy: {},
  },
  {
    id: "member",
    name: "Member",
    priceMonthly: 19.99,
    priceYearly: 199,
    grants: ["content"],
    badge: "Most popular",
    blurb: "Full access to the chat and the database, for anyone.",
    features: [
      "Full BraneCoral research chat",
      "Full drug and EEG lookup database",
      "Path tracking and all free courses",
      "Saved chats and reports",
      "Same price for consumers and clinicians",
    ],
    forKinds: ["consumer", "clinician", "vendor"],
    lemonSqueezy: { monthly: "member-monthly", yearly: "member-yearly" },
  },
  {
    id: "pro",
    name: "Pro listing",
    priceMonthly: 49.99,
    priceYearly: 499,
    grants: ["listing:premium"],
    blurb: "Premium directory listing for any kind of profile.",
    features: [
      "Everything in Member",
      "Premium directory listing",
      "Contact form and booking link",
      "Map, hours, and priority placement",
      "Pro badge",
      "One blog post per month",
    ],
    forKinds: ["clinician", "vendor", "product", "student", "consumer"],
    lemonSqueezy: { monthly: "pro-monthly", yearly: "pro-yearly" },
  },
  {
    id: "organization",
    name: "Organization",
    priceMonthly: null,
    priceYearly: null,
    grants: ["listing:premium"],
    badge: "For groups",
    blurb: "One transferable account that lists a whole practice or company.",
    features: [
      "Everything in Pro for each seat",
      "One transferable billing owner",
      "Add clinician or vendor profiles as seats",
      "Multiple locations",
      "Seat bands: 3, 10, or 25",
    ],
    forKinds: ["organization"],
    lemonSqueezy: {},
  },
];

/** listing:premium implies content; expand a tier's granted scopes to the full set. */
export function expandScopes(grants: Scope[]): Set<Scope> {
  const out = new Set<Scope>(grants);
  if (out.has("listing:premium")) out.add("content");
  return out;
}

export function tierById(id: PricingTier["id"]): PricingTier | undefined {
  return PRICING_TIERS.find((t) => t.id === id);
}
