/**
 * SSO cookie configuration for the neurofeedback.space ecosystem.
 *
 * When deployed to *.neurofeedback.space, the auth cookie is set on the parent
 * domain so all subdomains (path, drugs, coral, the Directory) share the same
 * session. branecoral.com and other non-nfbspace domains keep host-scoped
 * cookies. In development (localhost), no domain restriction and no secure flag.
 */
export function getAuthCookieOptions(hostname?: string): {
  domain?: string;
  path: string;
  sameSite: "lax";
  secure: boolean;
} {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "";
  let host = hostname ?? "";
  if (!host && siteUrl) {
    try {
      host = new URL(siteUrl).hostname;
    } catch {
      host = "";
    }
  }

  const isNfbSpace =
    host === "neurofeedback.space" || host.endsWith(".neurofeedback.space");
  const isLocal = host === "localhost" || host === "127.0.0.1" || host === "";

  return {
    ...(isNfbSpace ? { domain: ".neurofeedback.space" } : {}),
    path: "/",
    sameSite: "lax" as const,
    secure: !isLocal,
  };
}
