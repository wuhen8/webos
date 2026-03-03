package database

import (
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"sync"

	_ "modernc.org/sqlite"
)

var (
	db   *sql.DB
	once sync.Once
)

// DB 返回全局数据库实例
func DB() *sql.DB {
	return db
}

// Init 初始化 SQLite 数据库
func Init(configDir string) error {
	var initErr error
	once.Do(func() {
		if err := os.MkdirAll(configDir, 0755); err != nil {
			initErr = fmt.Errorf("create config dir: %w", err)
			return
		}

		dbPath := filepath.Join(configDir, "webos.db")
		conn, err := sql.Open("sqlite", dbPath+"?_pragma=journal_mode(wal)&_pragma=busy_timeout(5000)&_pragma=synchronous(normal)&_pragma=cache_size(-20000)")
		if err != nil {
			initErr = fmt.Errorf("open database: %w", err)
			return
		}

		conn.SetMaxOpenConns(4)

		if err := conn.Ping(); err != nil {
			initErr = fmt.Errorf("ping database: %w", err)
			return
		}

		db = conn

		if err := migrate(); err != nil {
			initErr = fmt.Errorf("migrate database: %w", err)
			return
		}
	})
	return initErr
}

// Close 关闭数据库连接
func Close() {
	if db != nil {
		db.Close()
	}
}
