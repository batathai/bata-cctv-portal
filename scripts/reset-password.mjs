// Sets a new password for an existing portal user (Supabase Auth), for when
// someone forgets theirs — the portal has no "forgot password" page.
//
// Uses the service_role key from .env.local (admin API), so run it only on a
// trusted machine. The new password is typed at a hidden prompt: it is never
// passed on the command line, printed, or written to disk.
//
// Run from the project root:
//   node ./scripts/reset-password.mjs batasupport.thailand@gmail.com
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import readline from "readline";

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnv(path) {
  const text = readFileSync(path, "utf8");
  const out = {};
  for (const line of text.split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}

function askHidden(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    let muted = false;
    rl._writeToOutput = (s) => {
      if (!muted) rl.output.write(s);
      else if (s.includes("\n") || s.includes("\r")) rl.output.write("\n");
    };
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
    muted = true;
  });
}

async function main() {
  const email = (process.argv[2] || "").trim().toLowerCase();
  if (!email || !email.includes("@")) {
    console.log("Usage: node ./scripts/reset-password.mjs <email>");
    process.exit(1);
  }

  const env = loadEnv(join(__dirname, "..", ".env.local"));
  const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Find the user by email (paged list — the project has only a handful of users).
  let user = null;
  for (let page = 1; page <= 10 && !user; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    user = data.users.find((u) => (u.email || "").toLowerCase() === email) || null;
    if (data.users.length < 200) break;
  }
  if (!user) {
    console.log(`No portal user with email ${email}.`);
    process.exit(1);
  }

  const pw1 = await askHidden(`New password for ${email} (hidden, min 8 chars): `);
  if (pw1.length < 8) {
    console.log("Too short — use at least 8 characters. Nothing changed.");
    process.exit(1);
  }
  const pw2 = await askHidden("Type it again: ");
  if (pw1 !== pw2) {
    console.log("The two entries don't match. Nothing changed.");
    process.exit(1);
  }

  const { error } = await supabase.auth.admin.updateUserById(user.id, { password: pw1 });
  if (error) throw error;
  console.log(`Done. Sign in to the portal as ${email} with the new password.`);
}

main().catch((err) => {
  console.error("Failed:", err.message || err);
  process.exit(1);
});
