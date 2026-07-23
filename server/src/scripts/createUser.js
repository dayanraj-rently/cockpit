import readline from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { createUser, findOrCreateTenantByName } from "../auth.js";

const rl = readline.createInterface({ input: stdin, output: stdout });

const tenantName = (await rl.question("Organization name (existing or new): ")).trim();
const username = (await rl.question("Username: ")).trim();
const password = await rl.question("Password: ");
rl.close();

if (!tenantName || !username || !password) {
  console.error("Organization name, username, and password are all required.");
  process.exit(1);
}

try {
  const { id: tenantId, created } = await findOrCreateTenantByName(tenantName);
  console.log(created ? `Created organization "${tenantName}".` : `Adding to existing organization "${tenantName}".`);
  await createUser(username, password, tenantId);
  console.log(`Created user "${username}".`);
  // Unlike the old synchronous better-sqlite3 handle, an open pg.Pool keeps
  // idle connections alive and the process would otherwise hang forever.
  process.exit(0);
} catch (err) {
  // Postgres's SQLSTATE for a unique-violation (was SQLITE_CONSTRAINT_UNIQUE
  // under the old better-sqlite3 backend).
  if (err.code === "23505") {
    console.error(`User "${username}" already exists.`);
  } else {
    console.error(err.message);
  }
  process.exit(1);
}
