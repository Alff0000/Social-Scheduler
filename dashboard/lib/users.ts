import "server-only";
import { getDb } from "./db";
import { hashPassword } from "./auth";

export interface UserRow {
  id: number;
  email: string;
  is_admin: number;
  is_active: number;
  created_at: string;
}

export function listUsers(): UserRow[] {
  return getDb()
    .prepare(
      "SELECT id, email, is_admin, is_active, created_at FROM users ORDER BY created_at ASC"
    )
    .all() as UserRow[];
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
      "SELECT id, email, is_admin, is_active, created_at FROM users WHERE id = ?"
    )
    .get(info.lastInsertRowid) as UserRow;
}

export function setUserActive(id: number, active: boolean): void {
  getDb().prepare("UPDATE users SET is_active = ? WHERE id = ?").run(active ? 1 : 0, id);
}
