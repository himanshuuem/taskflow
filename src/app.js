import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { FILTERS, PRIORITIES, TaskError, dueLabel } from "./tasks.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

export function createApp({ repo }) {
  const app = express();
  app.disable("x-powered-by");
  app.set("view engine", "ejs");
  app.set("views", path.join(root, "views"));
  app.use(express.static(path.join(root, "public")));
  app.use(express.urlencoded({ extended: false, limit: "4kb" }));
  Object.assign(app.locals, { PRIORITIES, FILTERS, dueLabel });

  const intParam = (value) => (/^\d+$/.test(String(value)) ? Number(value) : null);
  const listUrl = (listId, extra = {}) => `/lists/${listId}?${new URLSearchParams(extra)}`;
  const handle = (fn) => async (req, res, next) => {
    try {
      await fn(req, res);
    } catch (error) {
      if (!(error instanceof TaskError)) return next(error);
      const listId = intParam(req.params.listId) ?? (await repo.listIdForTask(intParam(req.params.id)));
      res.redirect(303, listId ? listUrl(listId, { err: error.message }) : `/?${new URLSearchParams({ err: error.message })}`);
    }
  };

  app.get("/", handle(async (req, res) => {
    const lists = await repo.lists();
    if (!lists.length) return res.render("index", { lists, list: null, tasks: [], filter: "active", error: req.query.err ?? null, editing: null });
    res.redirect(303, listUrl(lists[0].id));
  }));

  app.get("/lists/:listId", handle(async (req, res) => {
    const lists = await repo.lists();
    const list = lists.find((l) => l.id === intParam(req.params.listId));
    if (!list) return res.redirect(303, "/");
    const filter = FILTERS.includes(req.query.filter) ? req.query.filter : "active";
    res.render("index", {
      lists,
      list,
      filter,
      tasks: await repo.tasks(list.id, filter),
      editing: intParam(req.query.edit),
      error: typeof req.query.err === "string" ? req.query.err : null,
    });
  }));

  app.post("/lists", handle(async (req, res) => {
    const id = await repo.createList(req.body.name, req.body.emoji);
    res.redirect(303, listUrl(id));
  }));

  app.post("/lists/:listId/delete", handle(async (req, res) => {
    await repo.deleteList(intParam(req.params.listId));
    res.redirect(303, "/");
  }));

  app.post("/lists/:listId/tasks", handle(async (req, res) => {
    const listId = intParam(req.params.listId);
    await repo.addTask(listId, req.body);
    res.redirect(303, listUrl(listId));
  }));

  app.post("/lists/:listId/clear-done", handle(async (req, res) => {
    const listId = intParam(req.params.listId);
    await repo.clearDone(listId);
    res.redirect(303, listUrl(listId, { filter: "all" }));
  }));

  const taskRoute = (action) => handle(async (req, res) => {
    const id = intParam(req.params.id);
    const listId = await repo.listIdForTask(id);
    if (!listId) return res.redirect(303, "/");
    await action(id, req.body);
    res.redirect(303, listUrl(listId, req.body.filter && FILTERS.includes(req.body.filter) ? { filter: req.body.filter } : {}));
  });

  app.post("/tasks/:id/toggle", taskRoute((id) => repo.toggleTask(id)));
  app.post("/tasks/:id/edit", taskRoute((id, body) => repo.updateTask(id, body)));
  app.post("/tasks/:id/delete", taskRoute((id) => repo.deleteTask(id)));

  app.get("/health", (req, res) => res.json({ status: "ok" }));
  app.use((req, res) => res.redirect(303, "/"));

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).send("Database error. Is Postgres running and set up? Run: npm run db:setup");
  });

  return app;
}
