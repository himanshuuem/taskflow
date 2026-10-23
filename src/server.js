import { createApp } from "./app.js";
import { createPool } from "./db.js";
import { createTaskRepo } from "./tasks.js";

const pool = createPool();
const port = Number(process.env.PORT ?? 3000);
const server = createApp({ repo: createTaskRepo(pool) }).listen(port, () => console.log(`✅ TaskFlow at http://localhost:${port}`));

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.close(() => pool.end().then(() => process.exit(0))));
}
