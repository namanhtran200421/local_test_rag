import type { Request, Response } from "express";
import { z } from "zod";
import {
  authenticateDemoUser,
  createStaffSession,
  destroyStaffSession,
  findStaffSession,
  readCookie,
  roleLabel,
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
} from "./auth_session.js";

const loginSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(1).max(256),
}).strict();

function cookie(value: string, maxAge: number): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${SESSION_COOKIE}=${encodeURIComponent(value)}; HttpOnly; SameSite=Strict; Path=/api; Max-Age=${maxAge}${secure}`;
}

function publicUser(user: { id: string; role: "manager" | "business_user" }) {
  return { id: user.id, role: user.role, label: roleLabel(user.role) };
}

export function login(req: Request, res: Response): void {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_request", message: "Enter a valid email and password." });
    return;
  }
  const user = authenticateDemoUser(parsed.data.email, parsed.data.password);
  if (!user) {
    res.status(401).json({ error: "invalid_credentials", message: "The email or password is incorrect." });
    return;
  }
  const token = createStaffSession(user);
  res.setHeader("set-cookie", cookie(token, SESSION_TTL_SECONDS));
  res.status(200).json({ authenticated: true, user: publicUser(user) });
}

export function currentSession(req: Request, res: Response): void {
  const token = readCookie(req.header("cookie"), SESSION_COOKIE);
  const user = findStaffSession(token);
  res.status(200).json(user
    ? { authenticated: true, user: publicUser(user) }
    : { authenticated: false });
}

export function logout(req: Request, res: Response): void {
  const token = readCookie(req.header("cookie"), SESSION_COOKIE);
  destroyStaffSession(token);
  res.setHeader("set-cookie", cookie("", 0));
  res.status(204).end();
}
