package service

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"strings"

	"webos-backend/internal/config"
	"webos-backend/internal/database"
	"webos-backend/internal/storage"
)

// StorageNodeResp is the response DTO for a storage node.
type StorageNodeResp struct {
	ID     string                 `json:"id"`
	Name   string                 `json:"name"`
	Type   string                 `json:"type"`
	Config map[string]interface{} `json:"config"`
}

// ListStorageNodes returns all storage nodes with masked secrets.
func ListStorageNodes() ([]StorageNodeResp, error) {
	rows, err := database.ListStorageNodes()
	if err != nil {
		return nil, err
	}

	nodes := make([]StorageNodeResp, 0, len(rows))
	for _, row := range rows {
		cfg := make(map[string]interface{})
		_ = json.Unmarshal([]byte(row.Config), &cfg)
		masked := make(map[string]interface{}, len(cfg))
		for k, v := range cfg {
			if strings.ToLower(k) == "secretkey" || strings.ToLower(k) == "secret_key" {
				masked[k] = "********"
			} else {
				masked[k] = v
			}
		}
		nodes = append(nodes, StorageNodeResp{ID: row.ID, Name: row.Name, Type: row.Type, Config: masked})
	}
	return nodes, nil
}

// AddStorageNode adds a new storage node. The ID is generated automatically
// using the pattern "{type}_{n}" to avoid conflicts.
func AddStorageNode(name, typ string, cfg map[string]interface{}) (string, error) {
	if name == "" || typ == "" {
		return "", fmt.Errorf("name and type are required")
	}

	// Generate a unique ID like "s3_1", "s3_2", "local_2", etc.
	id, err := nextStorageNodeID(typ)
	if err != nil {
		return "", err
	}

	cfgBytes, _ := json.Marshal(cfg)
	if err := database.InsertStorageNode(database.StorageNodeRow{
		ID: id, Name: name, Type: typ, Config: string(cfgBytes),
	}); err != nil {
		return "", err
	}
	if err := storage.ReloadDrivers(); err != nil {
		_ = database.DeleteStorageNode(id)
		return "", fmt.Errorf("driver init failed: %w", err)
	}
	return id, nil
}

// nextStorageNodeID finds the next available ID for the given type.
func nextStorageNodeID(typ string) (string, error) {
	rows, err := database.ListStorageNodes()
	if err != nil {
		return "", err
	}
	max := 0
	prefix := typ + "_"
	for _, r := range rows {
		if strings.HasPrefix(r.ID, prefix) {
			numStr := strings.TrimPrefix(r.ID, prefix)
			var n int
			if _, err := fmt.Sscanf(numStr, "%d", &n); err == nil && n > max {
				max = n
			}
		}
	}
	return fmt.Sprintf("%s%d", prefix, max+1), nil
}

// UpdateStorageNode updates an existing storage node.
func UpdateStorageNode(id, name, typ string, cfg map[string]interface{}) error {
	if cfg != nil {
		existing, err := database.ListStorageNodes()
		if err == nil {
			for _, row := range existing {
				if row.ID == id {
					var oldCfg map[string]interface{}
					_ = json.Unmarshal([]byte(row.Config), &oldCfg)
					for k, v := range cfg {
						if (strings.ToLower(k) == "secretkey" || strings.ToLower(k) == "secret_key") && v == "********" {
							cfg[k] = oldCfg[k]
						}
					}
					break
				}
			}
		}
	}

	cfgBytes, _ := json.Marshal(cfg)
	if err := database.UpdateStorageNode(database.StorageNodeRow{
		ID: id, Name: name, Type: typ, Config: string(cfgBytes),
	}); err != nil {
		return err
	}
	if err := storage.ReloadDrivers(); err != nil {
		return fmt.Errorf("driver reload failed after update: %w", err)
	}
	return nil
}

// DeleteStorageNode deletes a storage node.
func DeleteStorageNode(id string) error {
	if err := database.DeleteStorageNode(id); err != nil {
		return err
	}
	if err := storage.ReloadDrivers(); err != nil {
		return fmt.Errorf("driver reload failed after delete: %w", err)
	}
	return nil
}

// ==================== Preferences ====================

// GetPreferences returns all preferences as a map.
func GetPreferences() (map[string]interface{}, error) {
	db := database.DB()
	rows, err := db.Query("SELECT key, value FROM preferences")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	result := make(map[string]interface{})
	for rows.Next() {
		var key, val string
		if err := rows.Scan(&key, &val); err != nil {
			continue
		}
		var parsed interface{}
		if err := json.Unmarshal([]byte(val), &parsed); err != nil {
			parsed = val
		}
		result[key] = parsed
	}

	// 注入服务端目录配置（只读，由 WEBOS_DATA_DIR 环境变量决定）
	result["dataDir"] = config.DataDir()

	return result, nil
}

// SavePreferences partially updates preferences.
func SavePreferences(incoming map[string]interface{}) error {
	db := database.DB()
	tx, err := db.Begin()
	if err != nil {
		return err
	}

	for key, val := range incoming {
		jsonVal, err := json.Marshal(val)
		if err != nil {
			tx.Rollback()
			return err
		}
		if _, err := tx.Exec(
			"INSERT INTO preferences(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
			key, string(jsonVal),
		); err != nil {
			tx.Rollback()
			return err
		}
	}

	return tx.Commit()
}

// GetPreferenceString reads a single preference value from SQLite.
// Returns defaultVal if the key does not exist.
func GetPreferenceString(key, defaultVal string) string {
	db := database.DB()
	var val string
	err := db.QueryRow("SELECT value FROM preferences WHERE key = ?", key).Scan(&val)
	if err != nil {
		return defaultVal
	}
	var parsed string
	if err := json.Unmarshal([]byte(val), &parsed); err != nil {
		return val
	}
	return parsed
}

// ResetPreferences resets preferences to defaults and returns the result.
func ResetPreferences() (map[string]interface{}, error) {
	db := database.DB()
	if _, err := db.Exec("DELETE FROM preferences"); err != nil {
		return nil, err
	}

	defaults := map[string]string{
		"dockSize":    "56",
		"fontSize":    "14",
		"editorTheme": `"vs-dark"`,
	}
	for k, v := range defaults {
		db.Exec("INSERT INTO preferences(key, value) VALUES(?, ?)", k, v)
	}

	return GetPreferences()
}

// ==================== Sidebar ====================

// SidebarItemDTO represents a sidebar item.
type SidebarItemDTO struct {
	ID       string            `json:"id"`
	ParentID *string           `json:"parentId"`
	Name     string            `json:"name"`
	Icon     string            `json:"icon"`
	Path     *string           `json:"path"`
	NodeID   string            `json:"nodeId"`
	Sort     int               `json:"sortOrder"`
	Children []*SidebarItemDTO `json:"children,omitempty"`
}

// GetSidebar returns the sidebar tree.
func GetSidebar() ([]*SidebarItemDTO, error) {
	db := database.DB()
	rows, err := db.Query("SELECT id, parent_id, name, icon, path, node_id, sort_order FROM sidebar_items ORDER BY sort_order")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var all []*SidebarItemDTO
	itemMap := make(map[string]*SidebarItemDTO)

	for rows.Next() {
		var item SidebarItemDTO
		var parentID, path, nodeID sql.NullString
		if err := rows.Scan(&item.ID, &parentID, &item.Name, &item.Icon, &path, &nodeID, &item.Sort); err != nil {
			continue
		}
		if parentID.Valid {
			item.ParentID = &parentID.String
		}
		if path.Valid {
			item.Path = &path.String
		}
		if nodeID.Valid {
			item.NodeID = nodeID.String
		}
		item.Children = []*SidebarItemDTO{}
		all = append(all, &item)
		itemMap[item.ID] = &item
	}

	var roots []*SidebarItemDTO
	for _, item := range all {
		if item.ParentID == nil {
			roots = append(roots, item)
		} else if parent, ok := itemMap[*item.ParentID]; ok {
			parent.Children = append(parent.Children, item)
		} else {
			roots = append(roots, item)
		}
	}

	if roots == nil {
		roots = []*SidebarItemDTO{}
	}
	return roots, nil
}

// SaveSidebar replaces all sidebar items.
func SaveSidebar(items []*SidebarItemDTO) error {
	db := database.DB()
	tx, err := db.Begin()
	if err != nil {
		return err
	}

	if _, err := tx.Exec("DELETE FROM sidebar_items"); err != nil {
		tx.Rollback()
		return err
	}

	if err := insertSidebarItems(tx, items, nil); err != nil {
		tx.Rollback()
		return err
	}

	return tx.Commit()
}

func insertSidebarItems(tx *sql.Tx, items []*SidebarItemDTO, parentID *string) error {
	for _, item := range items {
		if _, err := tx.Exec(
			"INSERT INTO sidebar_items(id, parent_id, name, icon, path, node_id, sort_order) VALUES(?, ?, ?, ?, ?, ?, ?)",
			item.ID, parentID, item.Name, item.Icon, item.Path, item.NodeID, item.Sort,
		); err != nil {
			return err
		}
		if len(item.Children) > 0 {
			if err := insertSidebarItems(tx, item.Children, &item.ID); err != nil {
				return err
			}
		}
	}
	return nil
}

// ==================== App Overrides ====================

// GetAppOverrides returns all app overrides.
func GetAppOverrides() (map[string]map[string]interface{}, error) {
	db := database.DB()
	rows, err := db.Query("SELECT app_id, overrides FROM app_overrides")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	result := make(map[string]map[string]interface{})
	for rows.Next() {
		var appID, raw string
		if err := rows.Scan(&appID, &raw); err != nil {
			continue
		}
		var overrides map[string]interface{}
		if err := json.Unmarshal([]byte(raw), &overrides); err != nil {
			continue
		}
		result[appID] = overrides
	}
	return result, nil
}

// SaveAppOverride saves overrides for a single app.
func SaveAppOverride(appID string, overrides map[string]interface{}) error {
	jsonData, err := json.Marshal(overrides)
	if err != nil {
		return err
	}

	db := database.DB()
	_, err = db.Exec(
		"INSERT INTO app_overrides(app_id, overrides) VALUES(?, ?) ON CONFLICT(app_id) DO UPDATE SET overrides=excluded.overrides",
		appID, string(jsonData),
	)
	return err
}

// DeleteAppOverride deletes overrides for a single app.
func DeleteAppOverride(appID string) error {
	db := database.DB()
	_, err := db.Exec("DELETE FROM app_overrides WHERE app_id=?", appID)
	return err
}
