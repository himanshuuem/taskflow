export const PRIORITIES = ["low", "medium", "high"];
export const FILTERS = ["active", "done", "all"];

export class TaskError extends Error {
  constructor(message, status = 422) {
    super(message);
    this.status = status;
  }
}

export function validateTask({ title, priority = "medium", due_on: dueOn = "" }) {
  const cleanTitle = String(title ?? "").trim().replace(/\s+/g, " ");
  if (!cleanTitle) throw new TaskError("A task needs a title.");
  if (cleanTitle.length > 200) throw new TaskError("Keep titles under 200 characters.");
  if (!PRIORITIES.includes(priority)) throw new TaskError("Unknown priority.");
  const due = String(dueOn).trim();
  if (due && (!/^\d{4}-\d{2}-\d{2}$/.test(due) || Number.isNaN(Date.parse(due)))) throw new TaskError("Due date must be a valid date.");
  return { title: cleanTitle, priority, dueOn: due || null };
}

/** Human label for a due date relative to today: Overdue / Today / Tomorrow / Fri 31 Oct. */
export function dueLabel(dueOn, today = new Date()) {
  if (!dueOn) return null;
  const toDay = (d) => Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86_400_000);
  const due = dueOn instanceof Date ? dueOn : new Date(`${dueOn}T00:00:00`);
  const diff = toDay(due) - toDay(today);
  if (diff < 0) return { text: diff === -1 ? "Yesterday" : `${-diff} days overdue`, tone: "overdue" };
  if (diff === 0) return { text: "Today", tone: "today" };
  if (diff === 1) return { text: "Tomorrow", tone: "soon" };
  return { text: due.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" }), tone: "later" };
}

export function createTaskRepo(pool) {
  return {
    async lists() {
      const { rows } = await pool.query(`
        SELECT l.id, l.name, l.emoji,
               count(t.id) FILTER (WHERE NOT t.done)::int AS open,
               count(t.id) FILTER (WHERE NOT t.done AND t.due_on < CURRENT_DATE)::int AS overdue
        FROM lists l LEFT JOIN tasks t ON t.list_id = l.id
        GROUP BY l.id ORDER BY l.id`);
      return rows;
    },

    async createList(name, emoji) {
      const cleanName = String(name ?? "").trim();
      if (!cleanName || cleanName.length > 40) throw new TaskError("List names need 1–40 characters.");
      try {
        const { rows } = await pool.query("INSERT INTO lists (name, emoji) VALUES ($1, $2) RETURNING id", [cleanName, String(emoji || "📝").slice(0, 8)]);
        return rows[0].id;
      } catch (error) {
        if (error.code === "23505") throw new TaskError(`You already have a list called ${cleanName}.`, 409);
        throw error;
      }
    },

    async deleteList(id) {
      await pool.query("DELETE FROM lists WHERE id = $1", [id]);
    },

    /** Open tasks first, then by priority (high→low), then soonest due date, nulls last. */
    async tasks(listId, filter = "active") {
      const where = { active: "AND NOT done", done: "AND done", all: "" }[filter] ?? "AND NOT done";
      const { rows } = await pool.query(
        `SELECT id, title, priority, to_char(due_on, 'YYYY-MM-DD') AS due_on, done
         FROM tasks WHERE list_id = $1 ${where}
         ORDER BY done, priority DESC, due_on NULLS LAST, created_at`,
        [listId],
      );
      return rows;
    },

    async addTask(listId, input) {
      const { title, priority, dueOn } = validateTask(input);
      const { rows } = await pool.query(
        "INSERT INTO tasks (list_id, title, priority, due_on) VALUES ($1, $2, $3, $4) RETURNING id",
        [listId, title, priority, dueOn],
      );
      return rows[0].id;
    },

    async updateTask(id, input) {
      const { title, priority, dueOn } = validateTask(input);
      const { rowCount } = await pool.query("UPDATE tasks SET title = $2, priority = $3, due_on = $4 WHERE id = $1", [id, title, priority, dueOn]);
      if (!rowCount) throw new TaskError("That task no longer exists.", 404);
    },

    async toggleTask(id) {
      await pool.query("UPDATE tasks SET done = NOT done, done_at = CASE WHEN done THEN NULL ELSE now() END WHERE id = $1", [id]);
    },

    async deleteTask(id) {
      await pool.query("DELETE FROM tasks WHERE id = $1", [id]);
    },

    async clearDone(listId) {
      const { rowCount } = await pool.query("DELETE FROM tasks WHERE list_id = $1 AND done", [listId]);
      return rowCount;
    },

    async listIdForTask(id) {
      const { rows } = await pool.query("SELECT list_id FROM tasks WHERE id = $1", [id]);
      return rows[0]?.list_id ?? null;
    },
  };
}
