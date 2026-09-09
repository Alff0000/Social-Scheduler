// Cria (ou atualiza) a conta de administrador a partir de variáveis de ambiente.
// Rode uma vez pelo Console do Railway: node scripts/seed-admin.mjs
// Antes disso, defina ADMIN_EMAIL e ADMIN_PASSWORD nas Variables do serviço.
import Database from "better-sqlite3";
import crypto from "crypto";

const email = (process.env.ADMIN_EMAIL || "").trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD || "";
const dbPath = process.env.DATABASE_PATH || "./data/socialscheduler.db";

if (!email || !password) {
  console.error(
    "Defina ADMIN_EMAIL e ADMIN_PASSWORD nas variáveis de ambiente antes de rodar este script."
  );
  process.exit(1);
}

function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(pw, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

const db = new Database(dbPath);
const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
const hash = hashPassword(password);

if (existing) {
  db.prepare(
    "UPDATE users SET password_hash = ?, is_admin = 1, is_active = 1 WHERE id = ?"
  ).run(hash, existing.id);
  console.log(`Conta de administrador atualizada: ${email}`);
} else {
  db.prepare(
    "INSERT INTO users (email, password_hash, is_admin, is_active) VALUES (?, ?, 1, 1)"
  ).run(email, hash);
  console.log(`Conta de administrador criada: ${email}`);
}
