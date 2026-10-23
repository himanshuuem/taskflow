INSERT INTO lists (name, emoji) VALUES ('Today', '☀️'), ('Work', '💼'), ('Learning', '📚')
ON CONFLICT (name) DO NOTHING;

INSERT INTO tasks (list_id, title, priority, due_on)
SELECT l.id, t.title, t.priority::priority, CURRENT_DATE + t.offset_days
FROM (VALUES
  ('Today', 'Push the TaskFlow repo to GitHub', 'high', 0),
  ('Today', 'Go for a 30-minute walk', 'medium', 0),
  ('Work', 'Review pull requests', 'high', 1),
  ('Work', 'Write sprint notes', 'low', 3),
  ('Learning', 'Finish the PostgreSQL joins lesson', 'medium', 2),
  ('Learning', 'Read about database indexes', 'low', NULL)
) AS t(list_name, title, priority, offset_days)
JOIN lists l ON l.name = t.list_name
WHERE NOT EXISTS (SELECT 1 FROM tasks);
