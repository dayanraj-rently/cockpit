import readline from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { createUser } from "../auth.js";

const rl = readline.createInterface({ input: stdin, output: stdout });

const username = (await rl.question("Username: ")).trim();
const password = await rl.question("Password: ");
rl.close();

if (!username || !password) {
  console.error("Username and password are both required.");
  process.exit(1);
}

try {
  createUser(username, password);
  console.log(`Created user "${username}".`);
} catch (err) {
  if (err.code === "SQLITE_CONSTRAINT_UNIQUE") {
    console.error(`User "${username}" already exists.`);
  } else {
    console.error(err.message);
  }
  process.exit(1);
}
