/**
 * Decision table for hasAccess -- tested against a mocked fetch,
 * no network calls.
 */
import { describe, it, expect } from "vitest";
import { hasAccess, resolveEcosystemProfile } from "../src/access.js";
import type { RegistryEntitlementsResponse } from "../src/access.js";

/** Build a mock fetch that returns the given registry response. */
function mockFetch(response: RegistryEntitlementsResponse): typeof globalThis.fetch {
  return async (_url: string | URL | Request, _init?: RequestInit) => {
    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
}

/** Mock fetch that returns a non-200 status. */
function mockFetchError(status = 500): typeof globalThis.fetch {
  return async () => new Response("error", { status });
}

/** Mock fetch that throws a network error. */
function mockFetchThrow(): typeof globalThis.fetch {
  return async () => {
    throw new Error("network error");
  };
}

const FUTURE = new Date(Date.now() + 86400000 * 365).toISOString();
const PAST = new Date(Date.now() - 86400000).toISOString();

describe("hasAccess decision table", () => {
  it("returns true for an active entitlement matching app", async () => {
    const result = await hasAccess(
      { email: "user@example.com", app: "drugs" },
      {
        fetchFn: mockFetch({
          email: "user@example.com",
          entitlements: [{ app: "drugs", scope: "content", expires_at: FUTURE }],
        }),
      }
    );
    expect(result).toBe(true);
  });

  it("returns true for a perpetual entitlement (null expires_at)", async () => {
    const result = await hasAccess(
      { email: "user@example.com", app: "coral" },
      {
        fetchFn: mockFetch({
          email: "user@example.com",
          entitlements: [{ app: "coral", scope: "content", expires_at: null }],
        }),
      }
    );
    expect(result).toBe(true);
  });

  it("returns false for an expired entitlement", async () => {
    const result = await hasAccess(
      { email: "user@example.com", app: "drugs" },
      {
        fetchFn: mockFetch({
          email: "user@example.com",
          entitlements: [{ app: "drugs", scope: "content", expires_at: PAST }],
        }),
      }
    );
    expect(result).toBe(false);
  });

  it("returns false when no entitlements exist", async () => {
    const result = await hasAccess(
      { email: "user@example.com", app: "drugs" },
      {
        fetchFn: mockFetch({
          email: "user@example.com",
          entitlements: [],
        }),
      }
    );
    expect(result).toBe(false);
  });

  it("returns false for wrong app", async () => {
    const result = await hasAccess(
      { email: "user@example.com", app: "coral" },
      {
        fetchFn: mockFetch({
          email: "user@example.com",
          entitlements: [{ app: "drugs", scope: "content", expires_at: FUTURE }],
        }),
      }
    );
    expect(result).toBe(false);
  });

  it("returns false when no email is provided", async () => {
    const result = await hasAccess(
      { userId: "some-uuid", app: "drugs" },
      { fetchFn: mockFetch({ email: "", entitlements: [] }) }
    );
    expect(result).toBe(false);
  });

  it("uses email for the lookup (email fallback)", async () => {
    let requestedUrl = "";
    const fetchFn: typeof globalThis.fetch = async (url) => {
      requestedUrl = typeof url === "string" ? url : url.toString();
      return new Response(
        JSON.stringify({
          email: "user@example.com",
          entitlements: [{ app: "path", scope: "content", expires_at: null }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    };

    const result = await hasAccess(
      { userId: "some-uuid", email: "user@example.com", app: "path" },
      { fetchFn }
    );
    expect(result).toBe(true);
    expect(requestedUrl).toContain("email=user%40example.com");
  });

  it("returns true when scope matches", async () => {
    const result = await hasAccess(
      { email: "user@example.com", app: "directory", scope: "listing:premium" },
      {
        fetchFn: mockFetch({
          email: "user@example.com",
          entitlements: [
            { app: "directory", scope: "listing:premium", expires_at: null },
          ],
        }),
      }
    );
    expect(result).toBe(true);
  });

  it("returns false when scope does not match", async () => {
    const result = await hasAccess(
      { email: "user@example.com", app: "directory", scope: "listing:premium" },
      {
        fetchFn: mockFetch({
          email: "user@example.com",
          entitlements: [
            { app: "directory", scope: "content", expires_at: null },
          ],
        }),
      }
    );
    expect(result).toBe(false);
  });

  it("returns true among multiple entitlements when one matches", async () => {
    const result = await hasAccess(
      { email: "user@example.com", app: "coral" },
      {
        fetchFn: mockFetch({
          email: "user@example.com",
          entitlements: [
            { app: "drugs", scope: "content", expires_at: PAST },
            { app: "coral", scope: "content", expires_at: FUTURE },
            { app: "path", scope: "content", expires_at: null },
          ],
        }),
      }
    );
    expect(result).toBe(true);
  });

  it("returns false on API error", async () => {
    const result = await hasAccess(
      { email: "user@example.com", app: "drugs" },
      { fetchFn: mockFetchError(500) }
    );
    expect(result).toBe(false);
  });

  it("returns false on network error", async () => {
    const result = await hasAccess(
      { email: "user@example.com", app: "drugs" },
      { fetchFn: mockFetchThrow() }
    );
    expect(result).toBe(false);
  });
});

describe("resolveEcosystemProfile via registry", () => {
  it("returns guest entitlements when no email is provided", async () => {
    const result = await resolveEcosystemProfile(
      { userId: undefined },
      { fetchFn: mockFetch({ email: "", entitlements: [] }) }
    );
    expect(result.signedIn).toBe(false);
    expect(result.kind).toBe("guest");
  });

  it("resolves content scope from active registry rows", async () => {
    const result = await resolveEcosystemProfile(
      { email: "user@example.com", userId: "uuid-1" },
      {
        fetchFn: mockFetch({
          email: "user@example.com",
          entitlements: [
            { app: "drugs", scope: "content", expires_at: FUTURE },
            { app: "coral", scope: "content", expires_at: null },
          ],
        }),
      }
    );
    expect(result.signedIn).toBe(true);
    expect(result.resolved).toBe(true);
    expect(result.scopes.content.active).toBe(true);
    expect(result.apps.drugs.active).toBe(true);
    expect(result.apps.coral.active).toBe(true);
  });

  it("ignores expired registry rows", async () => {
    const result = await resolveEcosystemProfile(
      { email: "user@example.com", userId: "uuid-1" },
      {
        fetchFn: mockFetch({
          email: "user@example.com",
          entitlements: [
            { app: "drugs", scope: "content", expires_at: PAST },
          ],
        }),
      }
    );
    expect(result.apps.drugs.active).toBe(false);
    expect(result.scopes.content.active).toBe(false);
  });
});
