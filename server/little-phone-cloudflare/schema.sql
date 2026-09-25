-- 小手机 v0.5.1 Cloudflare D1 schema
-- worker.js 会自动 CREATE TABLE IF NOT EXISTS；本文件用于人工检查/初始化。

CREATE TABLE IF NOT EXISTS lp_commands (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  action TEXT NOT NULL,
  command_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL,
  dispatched_at TEXT,
  completed_at TEXT,
  result TEXT
);
CREATE INDEX IF NOT EXISTS idx_lp_commands_pending ON lp_commands(device_id,status,created_at);

CREATE TABLE IF NOT EXISTS lp_visits (
  id TEXT PRIMARY KEY,
  command_id TEXT NOT NULL UNIQUE,
  device_id TEXT NOT NULL,
  visitor TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  expires_at_epoch INTEGER NOT NULL,
  snapshot_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_lp_visits_device_created ON lp_visits(device_id,created_at DESC);

CREATE TABLE IF NOT EXISTS lp_events (
  id TEXT PRIMARY KEY,
  actor TEXT NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  expires_at_epoch INTEGER NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_lp_events_expiry ON lp_events(expires_at_epoch);
CREATE INDEX IF NOT EXISTS idx_lp_events_created ON lp_events(created_at DESC);

CREATE TABLE IF NOT EXISTS lp_papers (
  id TEXT PRIMARY KEY,
  author TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_lp_papers_created ON lp_papers(created_at DESC);

CREATE TABLE IF NOT EXISTS lp_mail (
  id TEXT PRIMARY KEY,
  author TEXT NOT NULL,
  content TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'letter',
  reply_to TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  seen INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_lp_mail_created ON lp_mail(created_at DESC);

CREATE TABLE IF NOT EXISTS lp_capsules (
  id TEXT PRIMARY KEY,
  author TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL,
  unlock_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_lp_capsules_created ON lp_capsules(created_at DESC);

CREATE TABLE IF NOT EXISTS lp_dailybook (
  id TEXT PRIMARY KEY,
  author TEXT NOT NULL,
  title TEXT NOT NULL,
  mood TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL DEFAULT '',
  event_date TEXT NOT NULL,
  created_at TEXT NOT NULL,
  images_json TEXT NOT NULL DEFAULT '[]'
);
CREATE INDEX IF NOT EXISTS idx_lp_dailybook_date ON lp_dailybook(event_date DESC,created_at DESC);

CREATE TABLE IF NOT EXISTS lp_todos (
  id TEXT PRIMARY KEY,
  author TEXT NOT NULL,
  title TEXT NOT NULL,
  due_at TEXT NOT NULL DEFAULT '',
  remind_at TEXT NOT NULL DEFAULT '',
  done INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_lp_todos_created ON lp_todos(created_at DESC);

CREATE TABLE IF NOT EXISTS lp_dates (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  event_date TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'important',
  remind_days INTEGER NOT NULL DEFAULT 3,
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_lp_dates_date ON lp_dates(event_date ASC);

CREATE TABLE IF NOT EXISTS lp_cycle_settings (
  id TEXT PRIMARY KEY,
  enabled INTEGER NOT NULL DEFAULT 0,
  last_start TEXT NOT NULL DEFAULT '',
  cycle_length INTEGER NOT NULL DEFAULT 30,
  period_length INTEGER NOT NULL DEFAULT 6,
  remind_before INTEGER NOT NULL DEFAULT 3,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS lp_cycle_records (
  id TEXT PRIMARY KEY,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_lp_cycle_records_start ON lp_cycle_records(start_date DESC);
