/**
 * Ecosystem-wide vocabularies: app identifiers, scope names, app metadata,
 * and shared constants used across the neurofeedback.space product family.
 */

// ----------------------------------------------------------------- app ids
/**
 * Every app (or product surface) that the entitlement bridge recognizes.
 * Matches the CHECK constraint on course.app_entitlements.app once ENT-1
 * widens it.
 */
export type EcosystemAppId =
  | "path"
  | "books"
  | "courses"
  | "directory"
  | "drugs"
  | "coral"
  | "nogn";

/**
 * Legacy app id used in the DB before the vocabulary was widened.
 * "nfbspace" maps to "directory" in the canonical vocabulary.
 */
export type LegacyAppId = "nfbspace";

/** All app ids the system may encounter, including legacy values. */
export type AnyAppId = EcosystemAppId | LegacyAppId;

// ----------------------------------------------------------------- scopes
export type EntitlementScope =
  | "content"
  | "listing:premium"
  | `org:${string}:seat`;

// ------------------------------------------------------------ app metadata
export interface EcosystemApp {
  id: EcosystemAppId | LegacyAppId;
  label: string;
  href: string;
  description: string;
}

export const ECOSYSTEM_APPS: EcosystemApp[] = [
  {
    id: "path",
    label: "Path",
    href: "https://path.neurofeedback.space",
    description: "Certification courses & book library",
  },
  {
    id: "drugs",
    label: "Brain on Drugs",
    href: "https://drugs.neurofeedback.space",
    description: "Medication & substance EEG lookup",
  },
  {
    id: "directory",
    label: "Directory",
    href: "https://neurofeedback.space",
    description: "Provider directory",
  },
  {
    id: "coral",
    label: "BraneCoral",
    href: "https://branecoral.com",
    description: "Citation-grounded research chat",
  },
  {
    id: "nogn",
    label: "Nogn",
    href: "https://nogn.app",
    description: "Clinical workspace",
  },
];

// ------------------------------------------------------------ constants
export const ECOSYSTEM_DISCLAIMER_KEY = "nfb_ecosystem_disclaimer_at";
export const DRUGS_APP_PRODUCT_ID = "app.your_brain_on_drugs";
export const BUNDLE_PRODUCT_ID = "bundle.series_all";
export const BOOK_REDEMPTION_TRIAL_SCOPE = "trial";
export const BOOK_REDEMPTION_TRIAL_GRANTED_BY = "book_redemption_trial";
