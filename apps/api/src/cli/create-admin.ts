/**
 * Cria ou recupera uma conta de administrador sem passar por e-mail.
 *
 *   node dist/cli/create-admin.js <email> [nome]
 *
 * A senha é pedida no terminal, sem eco. Se a conta já existir, ela é reativada,
 * confirmada, promovida a administradora e recebe a nova senha.
 */
import "dotenv/config";
import { Client } from "pg";
import { hashPassword, newId, normalizeEmail } from "../application/crypto";

function askHidden(prompt: string): Promise<string> {
  const input = process.stdin;
  process.stdout.write(prompt);
  if (!input.isTTY) {
    return new Promise((resolve) => {
      let data = "";
      input.setEncoding("utf8");
      input.on("data", (chunk) => (data += chunk));
      input.on("end", () => resolve(data.split(/\r?\n/)[0] ?? ""));
    });
  }
  return new Promise((resolve) => {
    let value = "";
    input.setRawMode(true);
    input.resume();
    input.setEncoding("utf8");
    const onData = (chunk: string) => {
      for (const char of chunk) {
        if (char === "\r" || char === "\n") {
          input.setRawMode(false);
          input.pause();
          input.off("data", onData);
          process.stdout.write("\n");
          resolve(value);
          return;
        }
        if (char === "\u0003") {
          process.stdout.write("\n");
          process.exit(130);
        }
        if (char === "\u007f" || char === "\b") value = value.slice(0, -1);
        else value += char;
      }
    };
    input.on("data", onData);
  });
}

async function main() {
  const [rawEmail, ...nameParts] = process.argv.slice(2);
  const email = normalizeEmail(rawEmail ?? "");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    console.error("Uso: node dist/cli/create-admin.js <email> [nome]");
    process.exit(1);
  }
  const name = nameParts.join(" ").trim() || "Administrador";

  const password = await askHidden("Senha (mínimo 8 caracteres): ");
  if (password.length < 8) {
    console.error("A senha precisa ter no mínimo 8 caracteres.");
    process.exit(1);
  }
  if (process.stdin.isTTY && (await askHidden("Repita a senha: ")) !== password) {
    console.error("As senhas não conferem.");
    process.exit(1);
  }

  const db = new Client({
    connectionString: process.env.DATABASE_URL ?? "postgresql://adgenda:adgenda@localhost:5432/adgenda",
  });
  await db.connect();
  try {
    const passwordHash = await hashPassword(password);
    const existing = await db.query<{ id: string; status: string }>(
      "SELECT id, status FROM users WHERE email = $1",
      [email],
    );
    const user = existing.rows[0];
    if (user && user.status !== "removido") {
      await db.query(
        `UPDATE users
           SET password_hash = $2, status = 'ativo', is_admin = true,
               email_verified_at = coalesce(email_verified_at, now())
         WHERE id = $1`,
        [user.id, passwordHash],
      );
      await db.query("DELETE FROM sessions WHERE user_id = $1", [user.id]);
      console.log(`Conta ${email} reativada como administradora, com a nova senha.`);
    } else {
      await db.query(
        `INSERT INTO users (id, name, email, role, status, is_admin, password_hash, email_verified_at)
         VALUES ($1, $2, $3, 'T.I', 'ativo', true, $4, now())`,
        [newId(), name, email, passwordHash],
      );
      console.log(`Conta administradora ${email} criada.`);
    }
  } finally {
    await db.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
