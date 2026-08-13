import type { NextFunction, Request, Response } from "express";
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import { findStaffSession, readCookie, SESSION_COOKIE } from "./auth_session.js";
import type { AuthenticatedUser, InternalRole } from "./internal_type.js";

declare global {
  namespace Express {
    interface Request {
      authenticatedUser?: AuthenticatedUser;
      requestId?: string;
    }
  }
}

let remoteKeySet: ReturnType<typeof createRemoteJWKSet> | null = null;

function values(payload: JWTPayload, key: string): string[] {
  const value = payload[key];
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : typeof value === "string" ? [value] : [];
}

function resolveRole(payload: JWTPayload): InternalRole | null {
  const roles = [...values(payload, "roles"), ...values(payload, "cognito:groups")].map((role) => role.toLowerCase());
  if (roles.includes("tan-manager") || roles.includes("manager") || roles.includes("bob")) return "manager";
  return null;
}

export async function authenticateInternal(req: Request, res: Response, next: NextFunction): Promise<void> {
  const sessionUser = findStaffSession(readCookie(req.header("cookie"), SESSION_COOKIE));
  if (sessionUser) {
    req.authenticatedUser = sessionUser;
    next();
    return;
  }
  const token = req.header("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) {
    res.status(401).json({ error: "unauthenticated", message: "Internal access requires an authenticated staff session." });
    return;
  }
  try {
    const jwksUrl = process.env.AUTH_JWKS_URL;
    const issuer = process.env.AUTH_ISSUER;
    const audience = process.env.AUTH_AUDIENCE;
    if (!jwksUrl || !issuer || !audience) throw new Error("Identity provider is not configured");
    remoteKeySet ??= createRemoteJWKSet(new URL(jwksUrl));
    const { payload } = await jwtVerify(token, remoteKeySet, { issuer, audience, algorithms: ["RS256", "ES256"] });
    const role = resolveRole(payload);
    if (!payload.sub || !role) {
      res.status(403).json({ error: "forbidden", message: "Your account does not have access to an internal agent." });
      return;
    }
    req.authenticatedUser = { id: payload.sub, role };
    next();
  } catch (error) {
    console.warn(JSON.stringify({ level: "warn", event: "authentication_failed", requestId: req.requestId, reason: error instanceof Error ? error.name : "UnknownError" }));
    res.status(401).json({ error: "unauthenticated", message: "The staff session is invalid or expired." });
  }
}
