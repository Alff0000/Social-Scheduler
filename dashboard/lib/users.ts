import "server-only";
import { getDb } from "./db";
import { hashPassword } from "./auth";

export interface UserRow {
  id: number;
  email: string;
  is_admin: number;
  is_active: number;
  created_at: string;
  /** Migration 0039. Null means no limit — see that migration's own comment for why
   *  this is admin-set, not something a login configures for itself. */
  storage_limit_mb: number | null;
}

export function getUser(id: number): UserRow | undefined {
  return getDb()
    .prepare(
      "SELECT id, email, is_admin, is_active, created_at, storage_limit_mb FROM users WHERE id = ?"
    )
    .get(id) as UserRow | undefined;
}

export function listUsers(): UserRow[] {
  return getDb()
    .prepare(
      "SELECT id, email, is_admin, is_active, created_at, storage_limit_mb FROM users ORDER BY created_at ASC"
    )
    .all() as UserRow[];
}

/** How many bytes of the shared asset store one login's own uploads account for — the
 *  same total the Biblioteca page already shows that login, just addressable by id for
 *  the admin's Usuários page (which needs every login's number, not just the viewer's
 *  own). Deliberately just assets.byte_size, not a live filesystem walk: this is the
 *  number every quota decision (upload route, this page) already reasons about. */
export function getUserStorageUsageBytes(userId: number): number {
  const row = getDb()
    .prepare("SELECT COALESCE(SUM(byte_size), 0) AS bytes FROM assets WHERE owner_user_id = ?")
    .get(userId) as { bytes: number };
  return row.bytes;
}

export function listUsersWithStorage(): (UserRow & { storage_bytes: number })[] {
  return listUsers().map((u) => ({ ...u, storage_bytes: getUserStorageUsageBytes(u.id) }));
}

export function setUserStorageLimit(id: number, limitMb: number | null): void {
  getDb().prepare("UPDATE users SET storage_limit_mb = ? WHERE id = ?").run(limitMb, id);
}

export function createUser(email: string, password: string, isAdmin: boolean): UserRow {
  const db = getDb();
  const normalized = email.trim().toLowerCase();
  const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(normalized);
  if (existing) {
    throw new Error("Já existe uma conta com este email.");
  }
  const hash = hashPassword(password);
  const info = db
    .prepare(
      "INSERT INTO users (email, password_hash, is_admin, is_active) VALUES (?, ?, ?, 1)"
    )
    .run(normalized, hash, isAdmin ? 1 : 0);
  return db
    .prepare(
      "SELECT id, email, is_admin, is_active, created_at, storage_limit_mb FROM users WHERE id = ?"
    )
    .get(info.lastInsertRowid) as UserRow;
}

export function setUserActive(id: number, active: boolean): void {
  getDb().prepare("UPDATE users SET is_active = ? WHERE id = ?").run(active ? 1 : 0, id);
}
