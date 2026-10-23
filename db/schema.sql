CREATE TABLE IF NOT EXISTS lists (
  id     SERIAL       PRIMARY KEY,
  name   VARCHAR(40)  NOT NULL UNIQUE CHECK (char_length(trim(name)) >= 1),
  emoji  VARCHAR(8)   NOT NULL DEFAULT '📝'
);

DO $$ BEGIN
  CREATE TYPE priority AS ENUM ('low', 'medium', 'high');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS tasks (
  id          SERIAL       PRIMARY KEY,
  list_id     INTEGER      NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
  title       VARCHAR(200) NOT NULL CHECK (char_length(trim(title)) >= 1),
  priority    priority     NOT NULL DEFAULT 'medium',
  due_on      DATE,
  done        BOOLEAN      NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  done_at     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS tasks_list_idx ON tasks (list_id, done, due_on);
