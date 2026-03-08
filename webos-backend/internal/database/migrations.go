package database

import (
	"fmt"
)

var migrations = []string{
	// version 1: 完整 schema（合并所有历史迁移）
	`CREATE TABLE IF NOT EXISTS preferences (
		key   TEXT PRIMARY KEY,
		value TEXT NOT NULL
	);

	CREATE TABLE IF NOT EXISTS sidebar_items (
		id         TEXT PRIMARY KEY,
		parent_id  TEXT,
		name       TEXT NOT NULL,
		icon       TEXT,
		path       TEXT,
		node_id    TEXT,
		sort_order INTEGER NOT NULL DEFAULT 0
	);

	CREATE TABLE IF NOT EXISTS app_overrides (
		app_id    TEXT PRIMARY KEY,
		overrides TEXT NOT NULL
	);

	CREATE TABLE IF NOT EXISTS file_index (
		id            INTEGER PRIMARY KEY AUTOINCREMENT,
		node_id       TEXT    NOT NULL,
		parent_id     INTEGER REFERENCES file_index(id),
		name          TEXT    NOT NULL,
		is_dir        INTEGER NOT NULL DEFAULT 0,
		size          INTEGER NOT NULL DEFAULT 0,
		extension     TEXT    NOT NULL DEFAULT '',
		modified_time DATETIME,
		indexed_at    DATETIME DEFAULT CURRENT_TIMESTAMP
	);

	CREATE UNIQUE INDEX idx_fi_unique_child ON file_index(node_id, parent_id, name) WHERE parent_id IS NOT NULL;
	CREATE UNIQUE INDEX idx_fi_unique_root  ON file_index(node_id, name) WHERE parent_id IS NULL;
	CREATE INDEX idx_fi_parent ON file_index(parent_id);
	CREATE INDEX idx_fi_name   ON file_index(name);
	CREATE INDEX idx_fi_ext    ON file_index(extension);
	CREATE INDEX idx_fi_node   ON file_index(node_id);
	CREATE INDEX idx_fi_node_isdir ON file_index(node_id, is_dir);

	CREATE TABLE IF NOT EXISTS upload_sessions (
		upload_id    TEXT PRIMARY KEY,
		node_id      TEXT NOT NULL,
		path         TEXT NOT NULL,
		filename     TEXT NOT NULL,
		total_size   INTEGER NOT NULL,
		chunk_size   INTEGER NOT NULL,
		total_parts  INTEGER NOT NULL,
		direct       INTEGER NOT NULL DEFAULT 0,
		s3_upload_id TEXT NOT NULL DEFAULT '',
		s3_key       TEXT NOT NULL DEFAULT '',
		created_at   INTEGER NOT NULL,
		updated_at   INTEGER NOT NULL
	);
	CREATE INDEX idx_upload_sessions_lookup ON upload_sessions(node_id, path, filename, total_size);

	CREATE TABLE IF NOT EXISTS scheduled_jobs (
		id            TEXT PRIMARY KEY,
		name          TEXT NOT NULL,
		job_type      TEXT NOT NULL,
		config        TEXT NOT NULL DEFAULT '{}',
		cron_expr     TEXT NOT NULL DEFAULT '0 */1 * * * *',
		enabled       INTEGER NOT NULL DEFAULT 1,
		silent        INTEGER NOT NULL DEFAULT 0,
		schedule_type TEXT NOT NULL DEFAULT 'cron',
		run_at        INTEGER NOT NULL DEFAULT 0,
		last_run_at   INTEGER,
		last_status   TEXT,
		last_message  TEXT,
		created_at    INTEGER NOT NULL,
		updated_at    INTEGER NOT NULL
	);

	CREATE TABLE IF NOT EXISTS storage_nodes (
		id     TEXT PRIMARY KEY,
		name   TEXT NOT NULL,
		type   TEXT NOT NULL,
		config TEXT NOT NULL DEFAULT '{}'
	);

	CREATE TABLE IF NOT EXISTS installed_apps (
		id           TEXT PRIMARY KEY,
		app_type     TEXT NOT NULL,
		status       TEXT NOT NULL DEFAULT 'installing',
		config       TEXT NOT NULL DEFAULT '{}',
		manifest     TEXT NOT NULL DEFAULT '{}',
		install_dir  TEXT NOT NULL DEFAULT '',
		autostart    INTEGER NOT NULL DEFAULT 0,
		installed_at INTEGER NOT NULL,
		updated_at   INTEGER NOT NULL
	);

	CREATE TABLE IF NOT EXISTS ai_conversations (
		id         TEXT PRIMARY KEY,
		title      TEXT NOT NULL DEFAULT '',
		created_at INTEGER NOT NULL,
		updated_at INTEGER NOT NULL
	);

	CREATE TABLE IF NOT EXISTS ai_messages (
		id              INTEGER PRIMARY KEY AUTOINCREMENT,
		conversation_id TEXT NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
		role            TEXT NOT NULL,
		content         TEXT NOT NULL DEFAULT '',
		tool_calls      TEXT,
		tool_call_id    TEXT,
		token_usage     TEXT,
		thinking        TEXT NOT NULL DEFAULT '',
		created_at      INTEGER NOT NULL
	);
	CREATE INDEX idx_ai_msg_conv ON ai_messages(conversation_id, id);

	CREATE TABLE IF NOT EXISTS ai_queue (
		id         INTEGER PRIMARY KEY AUTOINCREMENT,
		conv_id    TEXT NOT NULL,
		content    TEXT NOT NULL,
		status     TEXT NOT NULL DEFAULT 'pending',
		client_id  TEXT NOT NULL DEFAULT 'web',
		created_at INTEGER NOT NULL
	);
	CREATE INDEX idx_ai_queue_status ON ai_queue(status, id);

	CREATE TABLE IF NOT EXISTS api_tokens (
		id         INTEGER PRIMARY KEY AUTOINCREMENT,
		token      TEXT NOT NULL UNIQUE,
		name       TEXT NOT NULL DEFAULT '',
		expires_at INTEGER NOT NULL DEFAULT 0,
		created_at INTEGER NOT NULL
	);

	CREATE TABLE IF NOT EXISTS wasm_kv (
		app_id     TEXT NOT NULL,
		key        TEXT NOT NULL,
		value      BLOB,
		updated_at INTEGER NOT NULL,
		PRIMARY KEY (app_id, key)
	);
	CREATE INDEX idx_wasm_kv_app ON wasm_kv(app_id);

	CREATE TABLE IF NOT EXISTS share_links (
		token      TEXT PRIMARY KEY,
		node_id    TEXT NOT NULL,
		path       TEXT NOT NULL,
		filename   TEXT NOT NULL,
		created_at INTEGER NOT NULL,
		expires_at INTEGER
	);

	CREATE TABLE IF NOT EXISTS ai_summaries (
		id              INTEGER PRIMARY KEY AUTOINCREMENT,
		conversation_id TEXT NOT NULL,
		content         TEXT NOT NULL,
		up_to_msg_id    INTEGER NOT NULL,
		created_at      INTEGER NOT NULL
	);
	CREATE INDEX idx_ai_summary_conv ON ai_summaries(conversation_id);`,
}

func migrate() error {
	// 创建 schema_version 表
	if _, err := db.Exec(`CREATE TABLE IF NOT EXISTS schema_version (version INTEGER PRIMARY KEY)`); err != nil {
		return fmt.Errorf("create schema_version table: %w", err)
	}

	// 获取当前版本
	var current int
	row := db.QueryRow("SELECT COALESCE(MAX(version), 0) FROM schema_version")
	if err := row.Scan(&current); err != nil {
		return fmt.Errorf("get schema version: %w", err)
	}

	// 执行未应用的迁移
	for i := current; i < len(migrations); i++ {
		tx, err := db.Begin()
		if err != nil {
			return fmt.Errorf("begin tx for migration %d: %w", i+1, err)
		}

		if _, err := tx.Exec(migrations[i]); err != nil {
			tx.Rollback()
			return fmt.Errorf("migration %d: %w", i+1, err)
		}

		if _, err := tx.Exec("INSERT INTO schema_version(version) VALUES(?)", i+1); err != nil {
			tx.Rollback()
			return fmt.Errorf("update schema version to %d: %w", i+1, err)
		}

		if err := tx.Commit(); err != nil {
			return fmt.Errorf("commit migration %d: %w", i+1, err)
		}

		fmt.Printf("Applied migration %d\n", i+1)
	}

	// 首次初始化时写入默认数据
	if current == 0 {
		if err := seedDefaults(); err != nil {
			return fmt.Errorf("seed defaults: %w", err)
		}
	}

	return nil
}
