import { randomBytes, timingSafeEqual } from "node:crypto";
import type { AuthenticatedUser, InternalRole } from "./internal_type.js";

interface DemoIdentity extends AuthenticatedUser {
  email: string;
  password: string;
}

interface SessionRecord {
  user: AuthenticatedUser;
  expiresAt: number;
}

export const SESSION_COOKIE = "tan_staff_session";
export const SESSION_TTL_SECONDS = 8 * 60 * 60;

const sessions = new Map<string, SessionRecord>();

function demoIdentities(): DemoIdentity[] {
  const identities: DemoIdentity[] = [];
  const managerEmail = process.env.MVP_MANAGER_EMAIL ?? (process.env.NODE_ENV === "production" ? undefined : "manager@demo.local");
  const managerPassword = process.env.MVP_MANAGER_PASSWORD ?? (process.env.NODE_ENV === "production" ? undefined : "manager-demo");
  if (managerEmail && managerPassword) {
    identities.push({
      id: "demo-manager",
      email: managerEmail,
      password: managerPassword,
      role: "manager",
    });
  }
  return identities;
}

function equal(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}

function pruneExpiredSessions(now = Date.now()): void {
  for (const [token, session] of sessions) {
    if (session.expiresAt <= now) sessions.delete(token);
  }
}

export function authenticateDemoUser(email: string, password: string): AuthenticatedUser | undefined {
  const normalizedEmail = email.trim().toLowerCase();
  const identity = demoIdentities().find((candidate) => candidate.email.toLowerCase() === normalizedEmail);
  if (!identity || !equal(password, identity.password)) return undefined;
  return { id: identity.id, role: identity.role };
}

export function createStaffSession(user: AuthenticatedUser): string {
  pruneExpiredSessions();
  const token = randomBytes(32).toString("base64url");
  sessions.set(token, { user, expiresAt: Date.now() + SESSION_TTL_SECONDS * 1_000 });
  return token;
}

export function findStaffSession(token: string | undefined): AuthenticatedUser | undefined {
  if (!token) return undefined;
  const session = sessions.get(token);
  if (!session) return undefined;
  if (session.expiresAt <= Date.now()) {
    sessions.delete(token);
    return undefined;
  }
  return session.user;
}

export function destroyStaffSession(token: string | undefined): void {
  if (token) sessions.delete(token);
}

export function readCookie(cookieHeader: string | undefined, name: string): string | undefined {
  if (!cookieHeader) return undefined;
  for (const pair of cookieHeader.split(";")) {
    const separator = pair.indexOf("=");
    if (separator < 0) continue;
    if (pair.slice(0, separator).trim() === name) {
      try { return decodeURIComponent(pair.slice(separator + 1).trim()); }
      catch { return undefined; }
    }
  }
  return undefined;
}

export function roleLabel(role: InternalRole): string {
  return role === "manager" ? "Bob access" : "Internal staff";
}

export function clearStaffSessionsForTests(): void {
  sessions.clear();
}
