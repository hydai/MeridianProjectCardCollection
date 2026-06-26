import type { MiddlewareHandler } from "hono";
import { type JWTPayload, createRemoteJWKSet, jwtVerify } from "jose";
import type { Env } from "./index";

interface AccessPayload extends JWTPayload {
  email?: string;
}

// Pure authorization decision: the token's identity must be the owner and the
// token must be issued for this Access application (aud).
export function isAuthorized(
  payload: AccessPayload,
  ownerEmail: string,
  aud: string,
): boolean {
  const auds = Array.isArray(payload.aud)
    ? payload.aud
    : payload.aud
      ? [payload.aud]
      : [];
  return payload.email === ownerEmail && auds.includes(aud);
}

const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

// Cloudflare Access guard. Access already gates these paths at the edge for the
// owner's email; this verifies the signed assertion in-Worker as defense in
// depth. When ACCESS_TEAM_DOMAIN is unset (local dev / tests) it is a no-op.
export const accessGuard: MiddlewareHandler<{ Bindings: Env }> = async (
  c,
  next,
) => {
  const { ACCESS_TEAM_DOMAIN, ACCESS_AUD, OWNER_EMAIL } = c.env;
  if (!ACCESS_TEAM_DOMAIN) return next();

  const token = c.req.header("Cf-Access-Jwt-Assertion");
  if (!token) return c.json({ error: "unauthenticated" }, 403);

  const issuer = `https://${ACCESS_TEAM_DOMAIN}`;
  const certsUrl = `${issuer}/cdn-cgi/access/certs`;
  let jwks = jwksCache.get(certsUrl);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(certsUrl));
    jwksCache.set(certsUrl, jwks);
  }

  try {
    const { payload } = await jwtVerify<AccessPayload>(token, jwks, { issuer });
    if (!isAuthorized(payload, OWNER_EMAIL, ACCESS_AUD)) {
      return c.json({ error: "forbidden" }, 403);
    }
    return next();
  } catch {
    return c.json({ error: "invalid token" }, 403);
  }
};
