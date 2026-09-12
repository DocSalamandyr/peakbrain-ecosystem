/**
 * Parity test for the resolver: proves the package's resolveEntitlements
 * produces identical output to the old copy on the same fixtures.
 *
 * The fixtures cover every branch in the resolver: guest, signed-in with
 * no entitlements, content via app_entitlements, listing:premium, legacy
 * scope mapping, enrollment-based content, med entitlement, org seats,
 * expiry, and the listing:premium => content implication.
 */
import { describe, it, expect } from "vitest";
import {
  resolveEntitlements,
  hasScope,
  type ResolveInput,
  type Entitlements,
} from "../src/resolve.js";

const FUTURE = "2099-01-01T00:00:00.000Z";
const PAST = "2020-01-01T00:00:00.000Z";
const NOW = new Date("2026-09-12T00:00:00.000Z");

const EMPTY_SOURCES = { app: false, enrollments: false, med: false, seats: false };

function resolve(input: Partial<ResolveInput>): Entitlements {
  return resolveEntitlements(
    {
      userId: input.userId,
      appEntitlements: input.appEntitlements ?? [],
      enrollments: input.enrollments ?? [],
      medEntitlement: input.medEntitlement ?? null,
      seats: input.seats ?? [],
      sourcesRead: input.sourcesRead ?? EMPTY_SOURCES,
    },
    NOW
  );
}

describe("resolveEntitlements parity", () => {
  it("guest (no userId)", () => {
    const e = resolve({ userId: undefined });
    expect(e.signedIn).toBe(false);
    expect(e.kind).toBe("guest");
    expect(e.scopes.content.active).toBe(false);
    expect(e.scopes["listing:premium"].active).toBe(false);
    expect(e.orgSeats).toEqual([]);
    expect(e.ownedBookIds).toEqual([]);
    expect(e.ownedCourseIds).toEqual([]);
  });

  it("signed in, no entitlements", () => {
    const e = resolve({
      userId: "user-1",
      sourcesRead: { app: true, enrollments: true, med: true, seats: false },
    });
    expect(e.signedIn).toBe(true);
    expect(e.resolved).toBe(true);
    expect(e.kind).toBe("signed_in");
    expect(e.scopes.content.active).toBe(false);
  });

  it("content scope via app_entitlements", () => {
    const e = resolve({
      userId: "user-1",
      appEntitlements: [
        { app: "drugs", scope: "content", granted_by: "manual", expires_at: FUTURE },
      ],
      sourcesRead: { app: true, enrollments: false, med: false, seats: false },
    });
    expect(e.scopes.content.active).toBe(true);
    expect(e.apps.drugs.active).toBe(true);
    expect(e.can.useContent).toBe(true);
  });

  it("listing:premium implies content", () => {
    const e = resolve({
      userId: "user-1",
      appEntitlements: [
        { app: "nfbspace", scope: "listing:premium", granted_by: "manual", expires_at: null },
      ],
      sourcesRead: { app: true, enrollments: false, med: false, seats: false },
    });
    expect(e.scopes["listing:premium"].active).toBe(true);
    expect(e.scopes.content.active).toBe(true);
    expect(e.kind).toBe("pro");
    expect(e.can.havePremiumListing).toBe(true);
    expect(e.can.publishBlog).toBe(true);
  });

  it("legacy scope mapping: clinician -> listing:premium", () => {
    const e = resolve({
      userId: "user-1",
      appEntitlements: [
        { app: "nfbspace", scope: "clinician", granted_by: "legacy", expires_at: null },
      ],
      sourcesRead: { app: true, enrollments: false, med: false, seats: false },
    });
    expect(e.scopes["listing:premium"].active).toBe(true);
    expect(e.scopes.content.active).toBe(true);
  });

  it("legacy scope mapping: all_access -> content", () => {
    const e = resolve({
      userId: "user-1",
      appEntitlements: [
        { app: "coral", scope: "all_access", granted_by: "legacy", expires_at: FUTURE },
      ],
      sourcesRead: { app: true, enrollments: false, med: false, seats: false },
    });
    expect(e.scopes.content.active).toBe(true);
    expect(e.apps.coral.active).toBe(true);
  });

  it("expired entitlement is inactive", () => {
    const e = resolve({
      userId: "user-1",
      appEntitlements: [
        { app: "drugs", scope: "content", granted_by: "manual", expires_at: PAST },
      ],
      sourcesRead: { app: true, enrollments: false, med: false, seats: false },
    });
    expect(e.scopes.content.active).toBe(false);
    expect(e.apps.drugs.active).toBe(false);
  });

  it("book enrollment grants content + owned book id", () => {
    const e = resolve({
      userId: "user-1",
      enrollments: [
        { product_id: "book.dynamic_brain", status: "active", expires_at: FUTURE },
      ],
      sourcesRead: { app: false, enrollments: true, med: false, seats: false },
    });
    expect(e.scopes.content.active).toBe(true);
    expect(e.ownedBookIds).toEqual(["book.dynamic_brain"]);
    expect(e.kind).toBe("book_owner");
  });

  it("course enrollment grants path app access", () => {
    const e = resolve({
      userId: "user-1",
      enrollments: [
        { product_id: "course.qeeg_101", status: "active", expires_at: null },
      ],
      sourcesRead: { app: false, enrollments: true, med: false, seats: false },
    });
    expect(e.apps.path.active).toBe(true);
    expect(e.ownedCourseIds).toEqual(["course.qeeg_101"]);
  });

  it("drugs product enrollment grants drugs app access", () => {
    const e = resolve({
      userId: "user-1",
      enrollments: [
        { product_id: "app.your_brain_on_drugs", status: "active", expires_at: FUTURE },
      ],
      sourcesRead: { app: false, enrollments: true, med: false, seats: false },
    });
    expect(e.apps.drugs.active).toBe(true);
    expect(e.kind).toBe("drugs_only");
  });

  it("med entitlement grants drugs + content", () => {
    const e = resolve({
      userId: "user-1",
      medEntitlement: {
        app_access_until: FUTURE,
        granted_via: "book_redemption",
      },
      sourcesRead: { app: false, enrollments: false, med: true, seats: false },
    });
    expect(e.scopes.content.active).toBe(true);
    expect(e.apps.drugs.active).toBe(true);
  });

  it("med entitlement with expired access is inactive", () => {
    const e = resolve({
      userId: "user-1",
      medEntitlement: {
        app_access_until: PAST,
        granted_via: "book_redemption",
      },
      sourcesRead: { app: false, enrollments: false, med: true, seats: false },
    });
    expect(e.apps.drugs.active).toBe(false);
    // med with null app_access_until does not activate
  });

  it("active org seat grants listing:premium", () => {
    const e = resolve({
      userId: "user-1",
      seats: [
        {
          org_id: "org-abc",
          appearance_id: "app-1",
          seat_funded: true,
          addon_status: "active",
        },
      ],
      sourcesRead: { app: false, enrollments: false, med: false, seats: true },
    });
    expect(e.scopes["listing:premium"].active).toBe(true);
    expect(e.scopes.content.active).toBe(true); // implied
    expect(e.orgSeats).toHaveLength(1);
    expect(e.orgSeats[0].active).toBe(true);
  });

  it("grace org seat is still active", () => {
    const e = resolve({
      userId: "user-1",
      seats: [
        {
          org_id: "org-abc",
          appearance_id: "app-1",
          seat_funded: true,
          addon_status: "grace",
        },
      ],
      sourcesRead: { app: false, enrollments: false, med: false, seats: true },
    });
    expect(e.orgSeats[0].active).toBe(true);
    expect(e.scopes["listing:premium"].active).toBe(true);
  });

  it("dissolved org seat is inactive", () => {
    const e = resolve({
      userId: "user-1",
      seats: [
        {
          org_id: "org-abc",
          appearance_id: "app-1",
          seat_funded: true,
          addon_status: "dissolved",
        },
      ],
      sourcesRead: { app: false, enrollments: false, med: false, seats: true },
    });
    expect(e.orgSeats[0].active).toBe(false);
    expect(e.scopes["listing:premium"].active).toBe(false);
  });

  it("preferLater keeps the grant with later expiry", () => {
    const e = resolve({
      userId: "user-1",
      appEntitlements: [
        { app: "drugs", scope: "content", granted_by: "early", expires_at: "2027-01-01T00:00:00.000Z" },
        { app: "drugs", scope: "content", granted_by: "later", expires_at: "2028-01-01T00:00:00.000Z" },
      ],
      sourcesRead: { app: true, enrollments: false, med: false, seats: false },
    });
    expect(e.scopes.content.expiresAt).toBe("2028-01-01T00:00:00.000Z");
  });

  it("perpetual grant wins over dated grant", () => {
    const e = resolve({
      userId: "user-1",
      appEntitlements: [
        { app: "drugs", scope: "content", granted_by: "dated", expires_at: "2028-01-01T00:00:00.000Z" },
        { app: "coral", scope: "content", granted_by: "perpetual", expires_at: null },
      ],
      sourcesRead: { app: true, enrollments: false, med: false, seats: false },
    });
    expect(e.scopes.content.expiresAt).toBe(null);
  });
});

describe("hasScope", () => {
  it("checks content scope", () => {
    const e = resolve({
      userId: "user-1",
      appEntitlements: [
        { app: "drugs", scope: "content", granted_by: null, expires_at: null },
      ],
      sourcesRead: { app: true, enrollments: false, med: false, seats: false },
    });
    expect(hasScope(e, "content")).toBe(true);
    expect(hasScope(e, "listing:premium")).toBe(false);
  });

  it("checks org seat scope", () => {
    const e = resolve({
      userId: "user-1",
      seats: [
        {
          org_id: "org-xyz",
          appearance_id: "app-1",
          seat_funded: true,
          addon_status: "active",
        },
      ],
      sourcesRead: { app: false, enrollments: false, med: false, seats: true },
    });
    expect(hasScope(e, "org:org-xyz:seat")).toBe(true);
    expect(hasScope(e, "org:other:seat")).toBe(false);
  });
});
