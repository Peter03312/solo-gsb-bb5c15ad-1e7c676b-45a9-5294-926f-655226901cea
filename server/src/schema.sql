-- 定向越野打卡争议复核系统 schema
-- 赛事单例 + 修订号（乐观锁）
CREATE TABLE IF NOT EXISTS event (
  id              INTEGER PRIMARY KEY CHECK (id = 1),
  name            TEXT NOT NULL,
  start_point     TEXT NOT NULL,
  finish_point    TEXT NOT NULL,
  finish_cutoff   INTEGER NOT NULL CHECK (finish_cutoff >= 0),
  revision        INTEGER NOT NULL DEFAULT 1
);

-- 按顺序通过的关卡组（seq 决定先后）
CREATE TABLE IF NOT EXISTS checkpoint_group (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  seq         INTEGER NOT NULL,
  name        TEXT NOT NULL,
  cutoff_secs INTEGER CHECK (cutoff_secs IS NULL OR cutoff_secs >= 0)
);

-- 组内可替代点位（任选其一）
CREATE TABLE IF NOT EXISTS group_point (
  group_id INTEGER NOT NULL REFERENCES checkpoint_group(id) ON DELETE CASCADE,
  point    TEXT NOT NULL,
  seq      INTEGER NOT NULL,
  PRIMARY KEY (group_id, point)
);

-- 统一停表区间（天气等原因赛事统一停表）：以「距发枪秒数」表示 [start_secs, end_secs)，
-- 起止非负整数且起点 < 终点；可登记重叠区间，核算时按并集只计一次。
-- 配置整体替换维护；任何变动推进赛事修订号，发布时随配置/成绩一并冻结。
CREATE TABLE IF NOT EXISTS stoppage_interval (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  start_secs INTEGER NOT NULL CHECK (start_secs >= 0),
  end_secs   INTEGER NOT NULL CHECK (end_secs >= 0 AND end_secs > start_secs)
);

CREATE TABLE IF NOT EXISTS runner (
  bib  TEXT PRIMARY KEY,
  name TEXT
);

-- 打卡原始读数。record_no 全局唯一。
-- status: active（有效，含被更正后的现值）| voided（裁判作废，不参与核算）
-- point/seconds/bib/kind 为「现值」（裁判更正会改 point/seconds）；
-- orig_* 为首次入库时的原始读数，永不随更正/作废/重导改变，
-- 是批量重导判定「同号内容是否一致」的唯一依据。
CREATE TABLE IF NOT EXISTS punch (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  record_no  TEXT NOT NULL UNIQUE,
  bib        TEXT NOT NULL REFERENCES runner(bib),
  point      TEXT NOT NULL,
  seconds    INTEGER NOT NULL CHECK (seconds >= 0),
  kind       TEXT NOT NULL CHECK (kind IN ('start','enroute','finish')),
  orig_bib     TEXT NOT NULL,
  orig_point   TEXT NOT NULL,
  orig_seconds INTEGER NOT NULL CHECK (orig_seconds >= 0),
  orig_kind    TEXT NOT NULL CHECK (orig_kind IN ('start','enroute','finish')),
  status     TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','voided')),
  void_reason TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_punch_bib ON punch(bib);

-- 裁判操作审计：作废 / 更正均保留原值与原因（更正只改 point/seconds）
CREATE TABLE IF NOT EXISTS punch_audit (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  punch_id     INTEGER NOT NULL REFERENCES punch(id),
  action       TEXT NOT NULL CHECK (action IN ('void', 'correct')),
  orig_point   TEXT,
  orig_seconds INTEGER,
  new_point    TEXT,
  new_seconds  INTEGER,
  reason       TEXT NOT NULL,
  at           TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 发布快照（冻结，不可变）
CREATE TABLE IF NOT EXISTS publication (
  version        INTEGER PRIMARY KEY,
  event_revision INTEGER NOT NULL,
  published_at   TEXT NOT NULL DEFAULT (datetime('now')),
  note           TEXT,
  config_json    TEXT NOT NULL,
  readings_json  TEXT NOT NULL,
  results_json   TEXT NOT NULL
);

-- 发布版成绩（便于排名查询），历史版永不被后续更正修改
-- net_elapsed 为发布当时冻结的净耗时（原始耗时扣除停表并集与出发-终点区间交长）；
-- 早于停表功能发布的历史版该列为 NULL。
CREATE TABLE IF NOT EXISTS published_result (
  publication_version INTEGER NOT NULL REFERENCES publication(version),
  bib      TEXT NOT NULL,
  name     TEXT,
  status   TEXT NOT NULL,
  elapsed  INTEGER,
  net_elapsed INTEGER,
  fail_at  TEXT,
  detail   TEXT,
  rank_no  INTEGER,
  PRIMARY KEY (publication_version, bib)
);

-- 杂项键值（如 seed 标记）
CREATE TABLE IF NOT EXISTS meta (
  k TEXT PRIMARY KEY,
  v TEXT
);
