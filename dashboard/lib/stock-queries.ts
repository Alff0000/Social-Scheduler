import "server-only";
import { getDb } from "./db";
import { encryptSecret, decryptSecret } from "./crypto";

/*
  Reads/writes for Estoque (migration 0031). Kept out of queries.ts for the same reason
  insights-queries.ts is: a different table, a different question, no shared helpers.

  The one rule that matters everywhere in this file: a password or 2FA seed is decrypted
  in EXACTLY one place (revealStockSecrets) and never included in any list/row shape
  otherwise. `hasTwofa` says whether a 2FA seed exists without saying what it is.
*/

export interface StockAccountRow {
  id: number;
  folder_id: number | null;
  username: string;
  hasTwofa: boolean;
  notes: string | null;
  is_used: number;
  created_at: string;
}

export function listStockAccounts(): StockAccountRow[] {
  const rows = getDb()
    .prepare(
      `SELECT id, folder_id, username, twofa_enc, notes, is_used, created_at
       FROM stock_accounts ORDER BY created_at DESC, id DESC`,
    )
    .all() as (Omit<StockAccountRow, "hasTwofa"> & { twofa_enc: string | null })[];
  return rows.map((r) => ({
    id: r.id,
    folder_id: r.folder_id,
    username: r.username,
    hasTwofa: r.twofa_enc !== null,
    notes: r.notes,
    is_used: r.is_used,
    created_at: r.created_at,
  }));
}

export interface NewStockAccount {
  username: string;
  password: string;
  /** Empty string treated the same as absent — see createStockAccounts. */
  twofa?: string;
}

/** Bulk insert, encrypting each credential on the way in. Returns how many were created. */
export function createStockAccounts(entries: NewStockAccount[], folderId: number | null): number {
  const db = getDb();
  const insert = db.prepare(
    `INSERT INTO stock_accounts (folder_id, username, password_enc, twofa_enc)
     VALUES (@folder_id, @username, @password_enc, @twofa_enc)`,
  );
  const tx = db.transaction((rows: NewStockAccount[]) => {
    let created = 0;
    for (const r of rows) {
      const username = r.username.trim();
      if (!username || !r.password) continue;
      insert.run({
        folder_id: folderId,
        username,
        password_enc: encryptSecret(r.password),
        twofa_enc: r.twofa ? encryptSecret(r.twofa) : null,
      });
      created += 1;
    }
    return created;
  });
  return tx(entries);
}

/** The ONE place a stored credential is decrypted. Called only from the explicit
 *  "reveal" action — never from a list read. */
export function revealStockSecrets(id: number): { password: string; twofa: string | null } | null {
  const row = getDb()
    .prepare("SELECT password_enc, twofa_enc FROM stock_accounts WHERE id = ?")
    .get(id) as { password_enc: string; twofa_enc: string | null } | undefined;
  if (!row) return null;
  return {
    password: decryptSecret(row.password_enc),
    twofa: row.twofa_enc ? decryptSecret(row.twofa_enc) : null,
  };
}

export function setStockAccountUsed(id: number, used: boolean): void {
  getDb().prepare("UPDATE stock_accounts SET is_used = ? WHERE id = ?").run(used ? 1 : 0, id);
}

export function setStockAccountFolder(id: number, folderId: number | null): void {
  getDb().prepare("UPDATE stock_accounts SET folder_id = ? WHERE id = ?").run(folderId, id);
}

export function deleteStockAccount(id: number): boolean {
  const info = getDb().prepare("DELETE FROM stock_accounts WHERE id = ?").run(id);
  return info.changes > 0;
}

/**
 * Parse the pasted "usuario:senha:2fa" block, one account per line.
 *
 * The 2FA field is optional (`usuario:senha` alone is valid — not every purchased account
 * ships with one), so the split caps at 3 parts: a password containing a literal `:`
 * would otherwise be truncated. Blank lines are skipped rather than rejected, so a
 * trailing newline in a pasted block doesn't fail the whole batch.
 */
export function parseStockAccountLines(raw: string): NewStockAccount[] {
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const [username, password, ...rest] = line.split(":");
      return {
        username: username ?? "",
        password: password ?? "",
        twofa: rest.length > 0 ? rest.join(":") : undefined,
      };
    })
    .filter((e) => e.username && e.password);
}
