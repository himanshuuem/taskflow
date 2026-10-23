import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createApp } from "../src/app.js";
import { createPool } from "../src/db.js";
import { createTaskRepo, validateTask, dueLabel } from "../src/tasks.js";

test("validateTask trims, collapses spaces and checks fields", () => {
  assert.deepEqual(validateTask({ title: "  Buy   milk ", priority: "high", due_on: "2026-11-01" }), { title: "Buy milk", priority: "high", dueOn: "2026-11-01" });
  assert.throws(() => validateTask({ title: "   " }), /needs a title/);
  assert.throws(() => validateTask({ title: "x", priority: "urgent" }), /priority/);
  assert.throws(() => validateTask({ title: "x", due_on: "31/10/2026" }), /valid date/);
});

test("dueLabel describes dates relative to today", () => {
  const today = new Date("2026-10-24T10:00:00");
  assert.equal(dueLabel("2026-10-24", today).tone, "today");
  assert.equal(dueLabel("2026-10-25", today).text, "Tomorrow");
  assert.equal(dueLabel("2026-10-21", today).text, "3 days overdue");
  assert.equal(dueLabel(null, today), null);
});

describe("TaskFlow with PostgreSQL", { skip: !process.env.DATABASE_URL && "DATABASE_URL not set" }, () => {
  let pool;
  let repo;
  let server;
  let base;

  before(async () => {
    pool = createPool();
    await pool.query("DROP TABLE IF EXISTS tasks, lists; DROP TYPE IF EXISTS priority");
    for (const file of ["schema.sql", "seed.sql"]) await pool.query(await readFile(new URL(`../db/${file}`, import.meta.url), "utf8"));
    repo = createTaskRepo(pool);
    server = createApp({ repo }).listen(0);
    await new Promise((resolve) => server.once("listening", resolve));
    base = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    server?.close();
    await pool?.end();
  });

  const post = (path, body = {}) => fetch(`${base}${path}`, {
    method: "POST",
    redirect: "manual",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
  });

  test("seed creates lists with open counts", async () => {
    const lists = await repo.lists();
    assert.deepEqual(lists.map((l) => l.name), ["Today", "Work", "Learning"]);
    assert.equal(lists[0].open, 2);
  });

  test("tasks sort by priority then due date", async () => {
    const [work] = (await repo.lists()).filter((l) => l.name === "Work");
    const tasks = await repo.tasks(work.id);
    assert.deepEqual(tasks.map((t) => t.priority), ["high", "low"]);
  });

  test("add, toggle, filter, edit, delete over HTTP", async () => {
    const created = await post("/lists", { name: "Errands", emoji: "🛒" });
    const listId = created.headers.get("location").match(/\/lists\/(\d+)/)[1];

    await post(`/lists/${listId}/tasks`, { title: "Buy bread", priority: "low" });
    let [task] = await repo.tasks(listId);
    assert.equal(task.title, "Buy bread");

    await post(`/tasks/${task.id}/toggle`);
    assert.equal((await repo.tasks(listId, "active")).length, 0);
    assert.equal((await repo.tasks(listId, "done")).length, 1);

    await post(`/tasks/${task.id}/edit`, { title: "Buy sourdough", priority: "high", due_on: "2030-01-01" });
    [task] = await repo.tasks(listId, "all");
    assert.equal(task.title, "Buy sourdough");
    assert.equal(task.due_on, "2030-01-01");

    const html = await (await fetch(`${base}/lists/${listId}?filter=all`)).text();
    assert.match(html, /Buy sourdough/);

    await post(`/lists/${listId}/clear-done`);
    assert.equal((await repo.tasks(listId, "all")).length, 0);
  });

  test("invalid input redirects back with an error", async () => {
    const [today] = await repo.lists();
    const res = await post(`/lists/${today.id}/tasks`, { title: "   " });
    assert.equal(res.status, 303);
    assert.match(new URL(res.headers.get("location"), base).searchParams.get("err"), /needs a title/);
  });

  test("duplicate list names are rejected; deleting a list cascades", async () => {
    await assert.rejects(repo.createList("Today", "☀️"), /already have a list/);
    const id = await repo.createList("Temp", "🧪");
    await repo.addTask(id, { title: "temp task" });
    await post(`/lists/${id}/delete`);
    const { rows } = await pool.query("SELECT count(*)::int AS n FROM tasks WHERE list_id = $1", [id]);
    assert.equal(rows[0].n, 0);
  });
});
