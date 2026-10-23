import { readFile } from "node:fs/promises";
import { createPool, ensureSchema } from "../src/db.js";

const pool = createPool();
try {
  await ensureSchema(pool);
  for (const file of ["schema.sql", "seed.sql"]) {
    await pool.query(await readFile(new URL(`../db/${file}`, import.meta.url), "utf8"));
    console.log(`✔ ran db/${file}`);
  }
} catch (error) {
  console.error(`✖ ${error.message}`);
  process.exitCode = 1;
} finally {
  await pool.end();
}
