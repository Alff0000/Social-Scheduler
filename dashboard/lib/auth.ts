import "server-only";
import crypto from "crypto";
import { cookies } from "next/headers";
import { getDb } from "./db";

export const SESSION_COOKIE = "ss_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

function getSessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error(
      "SESSION_SECRET is not set. Add a long random value for the SESSION_SECRET environment variable."
    );
  }
  return secret;
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const check = crypto.scryptSync(password, salt, 64).toString("hex");
  const a = Buffer.from(hash, "hex");
  const b = Buffer.from(check, "hex");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function sign(value: string): string {
  const h = crypto.createHmac("sha256", getSessionSecret()).update(value).digest("hex");
  return `${value}.${h}`;
}

function unsign(signed: string): string | null {
  const idx = signed.lastIndexOf(".");
  if (idx === -1) return null;
  const value = signed.slice(0, idx);
  const sig = signed.slice(idx + 1);
  const expected = crypto.createHmac("sha256", getSessionSecret()).update(value).digest("hex");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  return value;
}

export interface SessionUser {
  id: number;
  email: string;
  is_admin: boolean;
}

/**
 * Pure function (no cookies() call) so it can be used from middleware, which reads
 * the token from the request directly, as well as from server components.
 */
export function readSessionUser(token: string | undefined): SessionUser | null {
  if (!token) return null;
  const raw = unsign(token);
  if (!raw) return null;
  let payload: { id: number; exp: number };
  try {
    payload = JSON.parse(Buffer.from(raw, "base64url").toString());
  } catch {
    return null;
  }
  if (!payload.exp || payload.exp < Date.now()) return null;
  const row = getDb()
    .prepare("SELECT id, email, is_admin, is_active FROM users WHERE id = ?")
    .get(payload.id) as
    | { id: number; email: string; is_admin: number; is_active: number }
    | undefined;
  if (!row || !row.is_active) return null;
  return { id: row.id, email: row.email, is_admin: !!row.is_admin };
}

export async function createSession(userId: number): Promise<void> {
  const payload = JSON.stringify({
    id: userId,
    exp: Date.now() + SESSION_MAX_AGE_SECONDS * 1000,
  });
  const token = sign(Buffer.from(payload).toString("base64url"));
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const store = await cookies();
  return readSessionUser(store.get(SESSION_COOKIE)?.value);
}

export function verifyCredentials(email: string, password: string): SessionUser | null {
  const row = getDb()
    .prepare(
      "SELECT id, email, password_hash, is_admin, is_active FROM users WHERE email = ?"
    )
    .get(email.trim().toLowerCase()) as
    | {
        id: number;
        email: string;
        password_hash: string;
        is_admin: number;
        is_active: number;
      }
    | undefined;
  if (!row || !row.is_active) return null;
  if (!verifyPassword(password, row.password_hash)) return null;
  return { id: row.id, email: row.email, is_admin: !!row.is_admin };
}
