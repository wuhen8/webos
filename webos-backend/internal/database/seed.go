package database

import (
	"fmt"
)

func seedDefaults() error {
	// 默认偏好
	prefs := map[string]string{
		"dockSize":    "56",
		"fontSize":    "14",
		"editorTheme": `"vs-dark"`,
	}
	for k, v := range prefs {
		if _, err := db.Exec("INSERT OR IGNORE INTO preferences(key, value) VALUES(?, ?)", k, v); err != nil {
			return fmt.Errorf("seed preference %s: %w", k, err)
		}
	}

	// 默认侧边栏
	type sidebarRow struct {
		ID       string
		ParentID *string
		Name     string
		Icon     string
		Path     *string
		NodeID   string
		Sort     int
	}

	str := func(s string) *string { return &s }
	parentHome := "home"

	items := []sidebarRow{
		{ID: "home", ParentID: nil, Name: "个人收藏", Icon: "star", Path: nil, NodeID: "", Sort: 0},
		{ID: "user_home", ParentID: &parentHome, Name: "用户目录", Icon: "home", Path: str("~"), NodeID: "local_1", Sort: 0},
		{ID: "desktop", ParentID: &parentHome, Name: "桌面", Icon: "monitor", Path: str("~/Desktop"), NodeID: "local_1", Sort: 1},
		{ID: "documents", ParentID: &parentHome, Name: "文档", Icon: "file-text", Path: str("~/Documents"), NodeID: "local_1", Sort: 2},
		{ID: "downloads", ParentID: &parentHome, Name: "下载", Icon: "download", Path: str("~/Downloads"), NodeID: "local_1", Sort: 3},
	}

	for _, item := range items {
		if _, err := db.Exec(
			"INSERT OR IGNORE INTO sidebar_items(id, parent_id, name, icon, path, node_id, sort_order) VALUES(?, ?, ?, ?, ?, ?, ?)",
			item.ID, item.ParentID, item.Name, item.Icon, item.Path, item.NodeID, item.Sort,
		); err != nil {
			return fmt.Errorf("seed sidebar item %s: %w", item.ID, err)
		}
	}

	// 默认存储节点
	defaultNodeConfig := `{}`
	if _, err := db.Exec(
		"INSERT OR IGNORE INTO storage_nodes(id, name, type, config) VALUES(?, ?, ?, ?)",
		"local_1", "本地磁盘", "local", defaultNodeConfig,
	); err != nil {
		return fmt.Errorf("seed storage node: %w", err)
	}

	fmt.Println("Database initialized with default data")
	return nil
}
