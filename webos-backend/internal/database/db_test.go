package database

import (
	"os"
	"path/filepath"
	"sync"
	"testing"
)

func TestInitAndSeed(t *testing.T) {
	tmpDir := filepath.Join(os.TempDir(), "webos-db-test")
	os.RemoveAll(tmpDir)
	defer os.RemoveAll(tmpDir)

	// 重置全局状态以便测试
	db = nil
	once = sync.Once{}

	if err := Init(tmpDir); err != nil {
		t.Fatalf("Init failed: %v", err)
	}
	defer func() {
		Close()
		db = nil
		once = sync.Once{}
	}()

	// 验证 preferences
	var count int
	if err := db.QueryRow("SELECT COUNT(*) FROM preferences").Scan(&count); err != nil {
		t.Fatalf("query preferences: %v", err)
	}
	if count != 3 {
		t.Errorf("expected 3 preferences, got %d", count)
	}

	// 验证具体偏好值
	var val string
	if err := db.QueryRow("SELECT value FROM preferences WHERE key='dockSize'").Scan(&val); err != nil {
		t.Fatalf("query dockSize: %v", err)
	}
	if val != "56" {
		t.Errorf("expected dockSize=56, got %s", val)
	}

	// 验证 sidebar_items
	if err := db.QueryRow("SELECT COUNT(*) FROM sidebar_items").Scan(&count); err != nil {
		t.Fatalf("query sidebar_items: %v", err)
	}
	if count != 5 {
		t.Errorf("expected 5 sidebar_items, got %d", count)
	}

	// 验证 schema_version
	var ver int
	if err := db.QueryRow("SELECT MAX(version) FROM schema_version").Scan(&ver); err != nil {
		t.Fatalf("query schema_version: %v", err)
	}
	if ver != 1 {
		t.Errorf("expected schema version 1, got %d", ver)
	}

	// 验证空表存在
	if err := db.QueryRow("SELECT COUNT(*) FROM app_overrides").Scan(&count); err != nil {
		t.Fatalf("query app_overrides: %v", err)
	}
	if count != 0 {
		t.Errorf("expected 0 app_overrides, got %d", count)
	}

	if err := db.QueryRow("SELECT COUNT(*) FROM file_index").Scan(&count); err != nil {
		t.Fatalf("query file_index: %v", err)
	}
	if count != 0 {
		t.Errorf("expected 0 file_index, got %d", count)
	}

	// 验证 db 文件存在
	dbPath := filepath.Join(tmpDir, "webos.db")
	if _, err := os.Stat(dbPath); os.IsNotExist(err) {
		t.Error("database file not created")
	}
}
