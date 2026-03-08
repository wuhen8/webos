package service

import (
	"archive/zip"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"time"

	"webos-backend/internal/config"
	"webos-backend/internal/database"
	"webos-backend/internal/wasm"
)

// ==================== Catalog cache ====================

const AppStoreBaseURL = "https://webos.686860.xyz"

var (
	catalogCache       []map[string]interface{}
	skillsCatalogCache []map[string]interface{}
	catalogCacheTime   time.Time
	catalogMu          sync.Mutex
	catalogTTL         = 5 * time.Minute
)

// GetAppsBaseDir returns the compose base directory, derived from DataDir.
func GetAppsBaseDir() string {
	return config.ComposeDir()
}

// InvalidateCatalogCache clears the catalog cache so the next fetch is fresh.
func InvalidateCatalogCache() {
	catalogMu.Lock()
	catalogCache = nil
	skillsCatalogCache = nil
	catalogCacheTime = time.Time{}
	catalogMu.Unlock()
}

// FetchCatalog fetches the remote catalog.json with 5-minute cache.
func FetchCatalog() ([]map[string]interface{}, error) {
	catalogMu.Lock()
	defer catalogMu.Unlock()

	if catalogCache != nil && time.Since(catalogCacheTime) < catalogTTL {
		return catalogCache, nil
	}

	url := AppStoreBaseURL + "/catalog.json"
	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Get(url)
	if err != nil {
		return nil, fmt.Errorf("请求仓库失败: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("仓库返回 %d", resp.StatusCode)
	}

	body, err := io.ReadAll(io.LimitReader(resp.Body, 10<<20))
	if err != nil {
		return nil, fmt.Errorf("读取响应失败: %w", err)
	}

	var catalog struct {
		Apps   []map[string]interface{} `json:"apps"`
		Skills []map[string]interface{} `json:"skills"`
	}
	if err := json.Unmarshal(body, &catalog); err != nil {
		return nil, fmt.Errorf("解析 catalog.json 失败: %w", err)
	}

	catalogCache = catalog.Apps
	skillsCatalogCache = catalog.Skills
	catalogCacheTime = time.Now()
	return catalogCache, nil
}

// FetchSkillsCatalog returns the skills array from the cached catalog.
func FetchSkillsCatalog() ([]map[string]interface{}, error) {
	// Trigger a fetch if needed (FetchCatalog handles its own locking)
	if _, err := FetchCatalog(); err != nil {
		return nil, err
	}
	// Now read the skills cache under lock
	catalogMu.Lock()
	result := skillsCatalogCache
	catalogMu.Unlock()
	if result == nil {
		return []map[string]interface{}{}, nil
	}
	return result, nil
}

// ==================== Skills marketplace ====================

// InstalledSkill represents a skill found on disk.
type InstalledSkill struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description"`
	Version     string `json:"version,omitempty"`
}

// GetSkillsDir returns the skills directory path.
func GetSkillsDir() string {
	return config.SkillsDir()
}

// ListInstalledSkills scans the skills directory and returns installed skills.
func ListInstalledSkills() ([]InstalledSkill, error) {
	dir := GetSkillsDir()
	entries, err := os.ReadDir(dir)
	if err != nil {
		if os.IsNotExist(err) {
			return []InstalledSkill{}, nil
		}
		return nil, err
	}

	var skills []InstalledSkill
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		skillMdPath := filepath.Join(dir, entry.Name(), "SKILL.md")
		data, err := os.ReadFile(skillMdPath)
		if err != nil {
			continue
		}
		s := InstalledSkill{ID: entry.Name()}
		// Parse frontmatter from SKILL.md
		content := string(data)
		if strings.HasPrefix(content, "---\n") {
			if end := strings.Index(content[4:], "\n---"); end >= 0 {
				fm := content[4 : 4+end]
				for _, line := range strings.Split(fm, "\n") {
					line = strings.TrimSpace(line)
					if strings.HasPrefix(line, "name:") {
						s.Name = strings.TrimSpace(strings.TrimPrefix(line, "name:"))
						s.Name = strings.Trim(s.Name, "\"'")
					} else if strings.HasPrefix(line, "description:") {
						s.Description = strings.TrimSpace(strings.TrimPrefix(line, "description:"))
						s.Description = strings.Trim(s.Description, "\"'")
					} else if strings.HasPrefix(line, "version:") {
						s.Version = strings.TrimSpace(strings.TrimPrefix(line, "version:"))
						s.Version = strings.Trim(s.Version, "\"'")
					}
				}
			}
		}
		if s.Name == "" {
			s.Name = entry.Name()
		}
		skills = append(skills, s)
	}
	if skills == nil {
		skills = []InstalledSkill{}
	}
	return skills, nil
}

// InstallSkill downloads a zip and extracts it to the skills directory.
func InstallSkill(ctx context.Context, skillID, zipURL string) error {
	if skillID == "" || zipURL == "" {
		return fmt.Errorf("skillId 和 zipUrl 不能为空")
	}
	if !ValidAppIDRegex.MatchString(skillID) {
		return fmt.Errorf("无效的 skill ID: %s", skillID)
	}

	client := &http.Client{Timeout: 5 * time.Minute}
	req, err := http.NewRequestWithContext(ctx, "GET", zipURL, nil)
	if err != nil {
		return fmt.Errorf("创建下载请求失败: %w", err)
	}
	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("下载失败: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return fmt.Errorf("下载服务器返回 %d", resp.StatusCode)
	}

	tmpFile, err := os.CreateTemp("", "webos-skill-*.zip")
	if err != nil {
		return fmt.Errorf("创建临时文件失败: %w", err)
	}
	tmpPath := tmpFile.Name()
	defer os.Remove(tmpPath)

	if _, err := io.Copy(tmpFile, io.LimitReader(resp.Body, 100<<20)); err != nil {
		tmpFile.Close()
		return fmt.Errorf("下载写入失败: %w", err)
	}
	tmpFile.Close()

	// Extract zip
	r, err := zip.OpenReader(tmpPath)
	if err != nil {
		return fmt.Errorf("无法打开 zip 文件: %w", err)
	}
	defer r.Close()

	// Detect prefix (zip may contain a top-level directory)
	prefix := ""
	for _, f := range r.File {
		name := f.Name
		if name == "SKILL.md" || strings.HasSuffix(name, "/SKILL.md") {
			parts := strings.SplitN(name, "/", 2)
			if len(parts) == 2 && parts[1] == "SKILL.md" {
				prefix = parts[0] + "/"
			}
			break
		}
	}

	targetDir := filepath.Join(GetSkillsDir(), skillID)
	os.RemoveAll(targetDir)
	if err := os.MkdirAll(targetDir, 0755); err != nil {
		return fmt.Errorf("创建目录失败: %w", err)
	}

	for _, f := range r.File {
		name := f.Name
		if prefix != "" {
			if !strings.HasPrefix(name, prefix) {
				continue
			}
			name = strings.TrimPrefix(name, prefix)
		}
		if name == "" {
			continue
		}
		cleanName := filepath.Clean(name)
		if strings.Contains(cleanName, "..") {
			continue
		}
		destPath := filepath.Join(targetDir, cleanName)
		if f.FileInfo().IsDir() {
			os.MkdirAll(destPath, 0755)
			continue
		}
		if err := os.MkdirAll(filepath.Dir(destPath), 0755); err != nil {
			continue
		}
		rc, err := f.Open()
		if err != nil {
			continue
		}
		outFile, err := os.Create(destPath)
		if err != nil {
			rc.Close()
			continue
		}
		io.Copy(outFile, io.LimitReader(rc, 100<<20))
		outFile.Close()
		rc.Close()
	}

	return nil
}

// UninstallSkill removes a skill directory.
func UninstallSkill(skillID string) error {
	if skillID == "" {
		return fmt.Errorf("skillId 不能为空")
	}
	if !ValidAppIDRegex.MatchString(skillID) {
		return fmt.Errorf("无效的 skill ID: %s", skillID)
	}
	dir := filepath.Join(GetSkillsDir(), skillID)
	if _, err := os.Stat(dir); os.IsNotExist(err) {
		return fmt.Errorf("skill %s 未安装", skillID)
	}
	if err := os.RemoveAll(dir); err != nil {
		return fmt.Errorf("删除 skill 目录失败: %w", err)
	}
	return nil
}

// FindCatalogApp finds an app in the catalog by ID.
func FindCatalogApp(appID string) (map[string]interface{}, error) {
	apps, err := FetchCatalog()
	if err != nil {
		return nil, err
	}
	for _, app := range apps {
		if id, _ := app["id"].(string); id == appID {
			return app, nil
		}
	}
	return nil, fmt.Errorf("应用 %s 不在仓库中", appID)
}

// ==================== Installed apps CRUD ====================

// AppManifest is the unified manifest stored as JSON in the DB.
// It holds all metadata and capability declarations for any app type.
type AppManifest struct {
	Name             string                   `json:"name"`
	Description      string                   `json:"description,omitempty"`
	Icon             string                   `json:"icon,omitempty"`
	Version          string                   `json:"version,omitempty"`
	Category         string                   `json:"category,omitempty"`
	ConfigSchema     []map[string]interface{} `json:"configSchema,omitempty"`
	// docker-specific
	AccessMode       string `json:"accessMode,omitempty"`       // "webview"
	AccessUrl        string `json:"accessUrl,omitempty"`        // port or URL
	ComposeTemplate  string `json:"composeTemplate,omitempty"`
	// sideload-specific
	WasmModule       string                   `json:"wasmModule,omitempty"`
	Background       bool                     `json:"background,omitempty"`
	PollInterval     int                      `json:"pollInterval,omitempty"`
	Permissions      []string                 `json:"permissions,omitempty"`
	FileAssociations []WebAppFileAssociation   `json:"fileAssociations,omitempty"`
	DefaultSize      *struct {
		Width  int `json:"width"`
		Height int `json:"height"`
	} `json:"defaultSize,omitempty"`
}

type InstalledApp struct {
	ID          string      `json:"id"`
	AppType     string      `json:"appType"`     // docker | shell | sideload
	Status      string      `json:"status"`
	Config      string      `json:"config"`      // user config values JSON
	Manifest    AppManifest `json:"manifest"`     // full app descriptor
	InstallDir  string      `json:"installDir"`
	InstalledAt int64       `json:"installedAt"`
	UpdatedAt   int64       `json:"updatedAt"`
	Autostart   bool        `json:"autostart"`
}

func ListInstalledApps() ([]InstalledApp, error) {
	db := database.DB()
	rows, err := db.Query(`SELECT id, app_type, status, config, manifest, install_dir,
		installed_at, updated_at, autostart FROM installed_apps ORDER BY installed_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var apps []InstalledApp
	for rows.Next() {
		var a InstalledApp
		var manifestJSON string
		var autostart int
		if err := rows.Scan(&a.ID, &a.AppType, &a.Status, &a.Config, &manifestJSON,
			&a.InstallDir, &a.InstalledAt, &a.UpdatedAt, &autostart); err != nil {
			continue
		}
		json.Unmarshal([]byte(manifestJSON), &a.Manifest)
		a.Autostart = autostart != 0
		apps = append(apps, a)
	}
	if apps == nil {
		apps = []InstalledApp{}
	}
	return apps, nil
}

func GetAppStatus(appID string) (*InstalledApp, error) {
	db := database.DB()
	var a InstalledApp
	var manifestJSON string
	var autostart int
	err := db.QueryRow(`SELECT id, app_type, status, config, manifest, install_dir,
		installed_at, updated_at, autostart FROM installed_apps WHERE id = ?`, appID).Scan(
		&a.ID, &a.AppType, &a.Status, &a.Config, &manifestJSON,
		&a.InstallDir, &a.InstalledAt, &a.UpdatedAt, &autostart)
	if err != nil {
		return nil, fmt.Errorf("应用 %s 未安装", appID)
	}
	json.Unmarshal([]byte(manifestJSON), &a.Manifest)
	a.Autostart = autostart != 0
	return &a, nil
}

func UpdateApp(ctx context.Context, appID string, reporter *ProgressReporter) error {
	app, err := GetAppStatus(appID)
	if err != nil {
		return err
	}

	catalogApp, err := FindCatalogApp(appID)
	if err != nil {
		return err
	}

	switch app.AppType {
	case "docker":
		projectDir := app.InstallDir
		if projectDir == "" {
			projectDir = filepath.Join(GetAppsBaseDir(), appID)
		}

		var userConfig map[string]interface{}
		json.Unmarshal([]byte(app.Config), &userConfig)
		if userConfig == nil {
			userConfig = make(map[string]interface{})
		}

		composeTemplate := app.Manifest.ComposeTemplate
		if ct, ok := catalogApp["composeTemplate"].(string); ok && ct != "" {
			composeTemplate = ct
		}
		if composeTemplate == "" {
			return fmt.Errorf("应用 %s 缺少 composeTemplate", appID)
		}

		mergedConfig := MergeDefaults(catalogApp, userConfig)
		composeContent := RenderTemplate(composeTemplate, mergedConfig)

		composePath := filepath.Join(projectDir, "docker-compose.yml")
		if err := os.WriteFile(composePath, []byte(composeContent), 0644); err != nil {
			return fmt.Errorf("写入 compose 文件失败: %w", err)
		}

		reporter.Report(0.3, 0, 0, 0, 0, "正在拉取新版本镜像...")
		if _, err := GetDockerService().ComposeAction(projectDir, "pull"); err != nil {
			return fmt.Errorf("拉取镜像失败: %w", err)
		}

		reporter.Report(0.7, 0, 0, 0, 0, "正在重启容器...")
		if _, err := GetDockerService().ComposeAction(projectDir, "up"); err != nil {
			return fmt.Errorf("重启失败: %w", err)
		}

	case "shell":
		if shellCfg, ok := catalogApp["shell"].(map[string]interface{}); ok {
			if updateURL, ok := shellCfg["updateScript"].(string); ok && updateURL != "" {
				reporter.Report(0.3, 0, 0, 0, 0, "正在执行更新脚本...")
				if err := RunRemoteScript(ctx, updateURL, appID); err != nil {
					return err
				}
			} else {
				return fmt.Errorf("应用 %s 没有更新脚本", appID)
			}
		}

	case "sideload":
		reporter.Report(0.1, 0, 0, 0, 0, "正在更新应用...")
		// Stop wasm if running
		if app.Manifest.WasmModule != "" {
			wasm.GetRuntime().StopProc(appID)
		}
		if err := InstallWebAppFromCatalog(ctx, appID, catalogApp, reporter); err != nil {
			return err
		}
		// Refresh manifest from disk
		reconcileSideloadApp(appID)
		// Restart wasm if needed
		diskM, _ := loadDiskManifest(appID)
		if diskM != nil && diskM.WasmModule != "" {
			if err := wasm.GetRuntime().StartProc(appID); err != nil {
				log.Printf("[WASM] restart %s after update failed: %v", appID, err)
			}
		}
	}

	// Update manifest from catalog
	newManifest := buildManifestFromCatalog(catalogApp)
	// For sideload, disk manifest was already reconciled above, just update version
	if app.AppType == "sideload" {
		if a, err := GetAppStatus(appID); err == nil {
			newManifest = a.Manifest
		}
	}
	UpdateAppManifest(appID, newManifest)

	return nil
}

func DeleteInstalledApp(appID string) {
	db := database.DB()
	db.Exec("DELETE FROM installed_apps WHERE id = ?", appID)
}

// UpdateAppManifest updates the manifest JSON for an installed app.
func UpdateAppManifest(appID string, m AppManifest) error {
	db := database.DB()
	manifestJSON, err := json.Marshal(m)
	if err != nil {
		return err
	}
	_, err = db.Exec("UPDATE installed_apps SET manifest = ?, updated_at = ? WHERE id = ?",
		string(manifestJSON), time.Now().UnixMilli(), appID)
	return err
}

// UpdateAppConfig updates the config JSON for an installed app.
func UpdateAppConfig(appID string, newConfig map[string]interface{}) error {
	db := database.DB()
	configJSON, err := json.Marshal(newConfig)
	if err != nil {
		return fmt.Errorf("序列化配置失败: %w", err)
	}
	_, err = db.Exec("UPDATE installed_apps SET config = ?, updated_at = ? WHERE id = ?",
		string(configJSON), time.Now().UnixMilli(), appID)
	return err
}

// InsertInstalledApp inserts a new app record.
func InsertInstalledApp(a *InstalledApp) error {
	db := database.DB()
	manifestJSON, _ := json.Marshal(a.Manifest)
	now := time.Now().UnixMilli()
	autostart := 0
	if a.Autostart {
		autostart = 1
	}
	_, err := db.Exec(`INSERT INTO installed_apps (id, app_type, status, config, manifest, install_dir, installed_at, updated_at, autostart)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		a.ID, a.AppType, a.Status, a.Config, string(manifestJSON), a.InstallDir, now, now, autostart)
	return err
}

// ==================== Template rendering ====================

func RenderTemplate(tmpl string, config map[string]interface{}) string {
	result := tmpl
	for k, v := range config {
		result = strings.ReplaceAll(result, "{{"+k+"}}", fmt.Sprintf("%v", v))
	}
	return result
}

// removePortMappings removes the `ports:` section from a docker-compose YAML string.
func removePortMappings(compose string) string {
	lines := strings.Split(compose, "\n")
	var result []string
	inPorts := false
	portsIndent := 0
	for _, line := range lines {
		trimmed := strings.TrimRight(line, " \t")
		stripped := strings.TrimLeft(trimmed, " \t")
		indent := len(trimmed) - len(stripped)

		if !inPorts {
			if stripped == "ports:" {
				inPorts = true
				portsIndent = indent
				continue
			}
			result = append(result, line)
		} else {
			// Still inside ports block if indented deeper or is a continuation line (e.g. "- '8080:80'")
			if indent > portsIndent || (stripped != "" && strings.HasPrefix(stripped, "-")) {
				continue
			}
			// Back to same or lesser indent — ports block ended
			inPorts = false
			result = append(result, line)
		}
	}
	return strings.Join(result, "\n")
}

// ==================== Docker app install ====================

func InstallDockerApp(ctx context.Context, appID string, catalogApp map[string]interface{}, userConfig map[string]interface{}, reporter *ProgressReporter) error {
	composeTemplate, ok := catalogApp["composeTemplate"].(string)
	if !ok || composeTemplate == "" {
		return fmt.Errorf("应用 %s 缺少 composeTemplate", appID)
	}

	// Check external access flag
	externalAccess := true
	if ea, ok := userConfig["_externalAccess"]; ok {
		if v, ok := ea.(bool); ok {
			externalAccess = v
		}
		delete(userConfig, "_externalAccess")
	}

	mergedConfig := MergeDefaults(catalogApp, userConfig)
	composeContent := RenderTemplate(composeTemplate, mergedConfig)

	// Remove port mappings if external access is disabled
	if !externalAccess {
		composeContent = removePortMappings(composeContent)
	}

	projectDir := filepath.Join(GetAppsBaseDir(), appID)
	if err := os.MkdirAll(projectDir, 0755); err != nil {
		return fmt.Errorf("创建目录失败: %w", err)
	}

	composePath := filepath.Join(projectDir, "docker-compose.yml")
	if err := os.WriteFile(composePath, []byte(composeContent), 0644); err != nil {
		return fmt.Errorf("写入 compose 文件失败: %w", err)
	}

	reporter.Report(0.3, 0, 0, 0, 0, "正在拉取镜像并启动容器...")
	if _, err := GetDockerService().ComposeAction(projectDir, "up"); err != nil {
		UpdateAppStatus(appID, "error")
		return fmt.Errorf("启动失败: %w", err)
	}

	// Update manifest with access URL and install dir
	accessURL := ""
	if externalAccess {
		accessURL = fmt.Sprintf("%v", mergedConfig["port"])
	}
	app, _ := GetAppStatus(appID)
	if app != nil {
		m := app.Manifest
		m.AccessUrl = accessURL
		UpdateAppManifest(appID, m)
	}
	db := database.DB()
	db.Exec("UPDATE installed_apps SET status = ?, install_dir = ?, updated_at = ? WHERE id = ?",
		"running", projectDir, time.Now().UnixMilli(), appID)

	return nil
}

// MergeDefaults merges catalog top-level fields + configSchema defaults + user config.
func MergeDefaults(catalogApp map[string]interface{}, userConfig map[string]interface{}) map[string]interface{} {
	merged := make(map[string]interface{})

	for _, key := range []string{"version", "id", "name"} {
		if v, ok := catalogApp[key]; ok {
			merged[key] = v
		}
	}

	if schema, ok := catalogApp["configSchema"].([]interface{}); ok {
		for _, item := range schema {
			if field, ok := item.(map[string]interface{}); ok {
				key, _ := field["key"].(string)
				if key != "" {
					if def, ok := field["default"]; ok {
						merged[key] = def
					}
				}
			}
		}
	}
	for k, v := range userConfig {
		merged[k] = v
	}
	return merged
}

// ==================== Shell app install ====================

func InstallShellApp(ctx context.Context, appID string, catalogApp map[string]interface{}, userConfig map[string]interface{}, reporter *ProgressReporter) error {
	shellCfg, ok := catalogApp["shell"].(map[string]interface{})
	if !ok {
		return fmt.Errorf("应用 %s 缺少 shell 配置", appID)
	}

	installURL, _ := shellCfg["installScript"].(string)
	if installURL == "" {
		return fmt.Errorf("应用 %s 缺少安装脚本", appID)
	}

	mergedConfig := MergeDefaults(catalogApp, userConfig)

	reporter.Report(0.2, 0, 0, 0, 0, "正在下载安装脚本...")

	client := &http.Client{Timeout: 60 * time.Second}
	resp, err := client.Get(installURL)
	if err != nil {
		return fmt.Errorf("下载脚本失败: %w", err)
	}
	defer resp.Body.Close()

	scriptBytes, err := io.ReadAll(io.LimitReader(resp.Body, 10<<20))
	if err != nil {
		return fmt.Errorf("读取脚本失败: %w", err)
	}

	tmpFile, err := os.CreateTemp("", "webos-install-*.sh")
	if err != nil {
		return fmt.Errorf("创建临时文件失败: %w", err)
	}
	defer os.Remove(tmpFile.Name())
	tmpFile.Write(scriptBytes)
	tmpFile.Close()
	os.Chmod(tmpFile.Name(), 0755)

	env := os.Environ()
	for k, v := range mergedConfig {
		env = append(env, fmt.Sprintf("APP_%s=%v", strings.ToUpper(k), v))
	}
	env = append(env, "APP_ID="+appID)

	reporter.Report(0.4, 0, 0, 0, 0, "正在执行安装脚本...")

	cmd := exec.CommandContext(ctx, "/bin/bash", tmpFile.Name())
	cmd.Env = env
	out, err := cmd.CombinedOutput()
	if err != nil {
		UpdateAppStatus(appID, "error")
		return fmt.Errorf("安装脚本执行失败: %s", strings.TrimSpace(string(out)))
	}

	accessURL := fmt.Sprintf("%v", mergedConfig["port"])
	installDir := filepath.Join(GetAppsBaseDir(), appID)

	// Update manifest with accessUrl and set status/install_dir
	app, _ := GetAppStatus(appID)
	if app != nil {
		m := app.Manifest
		m.AccessUrl = accessURL
		UpdateAppManifest(appID, m)
	}
	database.DB().Exec("UPDATE installed_apps SET status = ?, install_dir = ?, updated_at = ? WHERE id = ?",
		"running", installDir, time.Now().UnixMilli(), appID)

	return nil
}

// ==================== Install entry point ====================

func InstallApp(ctx context.Context, appID string, userConfig map[string]interface{}, reporter *ProgressReporter) error {
	catalogApp, err := FindCatalogApp(appID)
	if err != nil {
		return err
	}

	appType, _ := catalogApp["type"].(string)
	configJSON, _ := json.Marshal(userConfig)

	// Build manifest from catalog entry
	manifest := buildManifestFromCatalog(catalogApp)

	// Normalize app_type
	dbAppType := appType

	app := &InstalledApp{
		ID:      appID,
		AppType: dbAppType,
		Status:  "installing",
		Config:  string(configJSON),
		Manifest: manifest,
	}
	if err := InsertInstalledApp(app); err != nil {
		return fmt.Errorf("记录安装信息失败: %w", err)
	}

	switch appType {
	case "docker":
		return InstallDockerApp(ctx, appID, catalogApp, userConfig, reporter)
	case "shell":
		return InstallShellApp(ctx, appID, catalogApp, userConfig, reporter)
	case "sideload":
		if err := InstallWebAppFromCatalog(ctx, appID, catalogApp, reporter); err != nil {
			return err
		}
		// After install, refresh manifest from disk manifest.json
		reconcileSideloadApp(appID)
		// Start wasm process if it has a wasm module
		diskManifest, _ := loadDiskManifest(appID)
		if diskManifest != nil && diskManifest.WasmModule != "" {
			log.Printf("[WASM] install done, starting proc: %s", appID)
			if err := wasm.GetRuntime().StartProc(appID); err != nil {
				log.Printf("[WASM] auto-start %s failed: %v", appID, err)
				UpdateAppStatus(appID, "error")
				return fmt.Errorf("启动 wasm 进程失败: %w", err)
			}
		}
		return nil
	default:
		UpdateAppStatus(appID, "error")
		return fmt.Errorf("不支持的应用类型: %s", appType)
	}
}

// buildManifestFromCatalog extracts an AppManifest from a catalog entry.
func buildManifestFromCatalog(catalogApp map[string]interface{}) AppManifest {
	m := AppManifest{}
	if v, ok := catalogApp["name"].(string); ok { m.Name = v }
	if v, ok := catalogApp["description"].(string); ok { m.Description = v }
	if v, ok := catalogApp["icon"].(string); ok { m.Icon = v }
	if v, ok := catalogApp["version"].(string); ok { m.Version = v }
	if v, ok := catalogApp["category"].(string); ok { m.Category = v }
	if v, ok := catalogApp["accessMode"].(string); ok { m.AccessMode = v }
	if v, ok := catalogApp["composeTemplate"].(string); ok { m.ComposeTemplate = v }
	if v, ok := catalogApp["background"].(bool); ok { m.Background = v }
	if v, ok := catalogApp["pollInterval"].(float64); ok { m.PollInterval = int(v) }
	if v, ok := catalogApp["configSchema"]; ok && v != nil {
		if b, err := json.Marshal(v); err == nil {
			json.Unmarshal(b, &m.ConfigSchema)
		}
	}
	if v, ok := catalogApp["permissions"]; ok && v != nil {
		if b, err := json.Marshal(v); err == nil {
			json.Unmarshal(b, &m.Permissions)
		}
	}
	return m
}

// loadDiskManifest reads manifest.json from the sideload app directory.
func loadDiskManifest(appID string) (*WebAppManifest, error) {
	data, err := os.ReadFile(filepath.Join(GetWebAppsDir(), appID, "manifest.json"))
	if err != nil {
		return nil, err
	}
	var m WebAppManifest
	if err := json.Unmarshal(data, &m); err != nil {
		return nil, err
	}
	return &m, nil
}

// reconcileSideloadApp updates the DB manifest from the disk manifest.json.
func reconcileSideloadApp(appID string) {
	diskM, err := loadDiskManifest(appID)
	if err != nil {
		return
	}
	app, err := GetAppStatus(appID)
	if err != nil {
		return
	}
	// Merge disk manifest into DB manifest (disk is source of truth for sideload metadata)
	m := app.Manifest
	m.Name = diskM.Name
	if diskM.Description != "" { m.Description = diskM.Description }
	if diskM.Icon != "" { m.Icon = diskM.Icon }
	if diskM.Version != "" { m.Version = diskM.Version }
	m.WasmModule = diskM.WasmModule
	m.Background = diskM.Background
	m.PollInterval = diskM.PollInterval
	m.Permissions = diskM.Permissions
	if len(diskM.FileAssociations) > 0 {
		m.FileAssociations = diskM.FileAssociations
	}
	if diskM.DefaultSize.Width > 0 {
		m.DefaultSize = &struct {
			Width  int `json:"width"`
			Height int `json:"height"`
		}{diskM.DefaultSize.Width, diskM.DefaultSize.Height}
	}
	if len(diskM.ConfigSchema) > 0 {
		m.ConfigSchema = diskM.ConfigSchema
	}
	UpdateAppManifest(appID, m)
	installDir := filepath.Join(GetWebAppsDir(), appID)
	database.DB().Exec("UPDATE installed_apps SET install_dir = ?, updated_at = ? WHERE id = ?",
		installDir, time.Now().UnixMilli(), appID)
}

// ==================== Uninstall ====================

func UninstallApp(ctx context.Context, appID string) error {
	app, err := GetAppStatus(appID)
	if err != nil {
		return err
	}

	switch app.AppType {
	case "docker":
		projectDir := app.InstallDir
		if projectDir == "" {
			projectDir = filepath.Join(GetAppsBaseDir(), appID)
		}
		GetDockerService().ComposeAction(projectDir, "down")
		os.RemoveAll(projectDir)

	case "shell":
		catalogApp, err := FindCatalogApp(appID)
		if err == nil {
			if shellCfg, ok := catalogApp["shell"].(map[string]interface{}); ok {
				if uninstallURL, ok := shellCfg["uninstallScript"].(string); ok && uninstallURL != "" {
					RunRemoteScript(ctx, uninstallURL, appID)
				}
			}
		}

	case "sideload":
		// Stop and remove wasm process so it no longer appears in task manager
		if app.Manifest.WasmModule != "" {
			wasm.GetRuntime().RemoveProc(appID)
		}
		UninstallWebApp(appID)
		return nil
	}

	DeleteInstalledApp(appID)
	return nil
}

// ==================== Start / Stop ====================

func StartApp(appID string) error {
	app, err := GetAppStatus(appID)
	if err != nil {
		return err
	}

	switch app.AppType {
	case "docker":
		projectDir := app.InstallDir
		if projectDir == "" {
			projectDir = filepath.Join(GetAppsBaseDir(), appID)
		}
		if _, err := GetDockerService().ComposeAction(projectDir, "up"); err != nil {
			return fmt.Errorf("启动失败: %w", err)
		}
	case "shell":
		return fmt.Errorf("Shell 应用不支持启停控制")
	case "sideload":
		if app.Manifest.WasmModule != "" {
			if err := wasm.GetRuntime().StartProc(appID); err != nil {
				return fmt.Errorf("启动 wasm 进程失败: %w", err)
			}
		}
		// Static-only sideload apps are always available
	}

	UpdateAppStatus(appID, "running")
	SetAppAutostart(appID, true)
	return nil
}

func StopApp(appID string) error {
	app, err := GetAppStatus(appID)
	if err != nil {
		return err
	}

	switch app.AppType {
	case "docker":
		projectDir := app.InstallDir
		if projectDir == "" {
			projectDir = filepath.Join(GetAppsBaseDir(), appID)
		}
		if _, err := GetDockerService().ComposeAction(projectDir, "stop"); err != nil {
			return fmt.Errorf("停止失败: %w", err)
		}
	case "shell":
		return fmt.Errorf("Shell 应用不支持启停控制")
	case "sideload":
		if app.Manifest.WasmModule != "" {
			wasm.GetRuntime().StopProc(appID)
		}
		// Static-only sideload apps are always available
	}

	UpdateAppStatus(appID, "stopped")
	SetAppAutostart(appID, false)
	return nil
}

// UpdateAppStatus updates just the status field.
func UpdateAppStatus(appID, status string) {
	database.DB().Exec("UPDATE installed_apps SET status = ?, updated_at = ? WHERE id = ?",
		status, time.Now().UnixMilli(), appID)
}

// SetAppAutostart sets the autostart flag for an installed app.
func SetAppAutostart(appID string, enabled bool) error {
	val := 0
	status := "stopped"
	if enabled {
		val = 1
		status = "running"
	}
	_, err := database.DB().Exec("UPDATE installed_apps SET autostart = ?, status = ?, updated_at = ? WHERE id = ?",
		val, status, time.Now().UnixMilli(), appID)
	return err
}

// ==================== Helpers ====================

func RunRemoteScript(ctx context.Context, scriptURL, appID string) error {
	client := &http.Client{Timeout: 60 * time.Second}
	resp, err := client.Get(scriptURL)
	if err != nil {
		return fmt.Errorf("下载脚本失败: %w", err)
	}
	defer resp.Body.Close()

	scriptBytes, err := io.ReadAll(io.LimitReader(resp.Body, 10<<20))
	if err != nil {
		return fmt.Errorf("读取脚本失败: %w", err)
	}

	tmpFile, err := os.CreateTemp("", "webos-script-*.sh")
	if err != nil {
		return fmt.Errorf("创建临时文件失败: %w", err)
	}
	defer os.Remove(tmpFile.Name())
	tmpFile.Write(scriptBytes)
	tmpFile.Close()
	os.Chmod(tmpFile.Name(), 0755)

	env := os.Environ()
	env = append(env, "APP_ID="+appID)

	cmd := exec.CommandContext(ctx, "/bin/bash", tmpFile.Name())
	cmd.Env = env
	out, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("脚本执行失败: %s", strings.TrimSpace(string(out)))
	}
	return nil
}

// ==================== Static Apps ====================

// WebAppFileAssociation declares which file extensions an app can open.
type WebAppFileAssociation struct {
	Extensions []string `json:"extensions"`
	Label      string   `json:"label,omitempty"`
	Icon       string   `json:"icon,omitempty"`
}

// WebAppManifest represents an app's manifest.json.
type WebAppManifest struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description"`
	Icon        string `json:"icon"`
	Version     string `json:"version"`
	DefaultSize struct {
		Width  int `json:"width"`
		Height int `json:"height"`
	} `json:"defaultSize"`
	Styles           []string                   `json:"styles,omitempty"`
	FileAssociations []WebAppFileAssociation `json:"fileAssociations,omitempty"`
	WasmModule       string                     `json:"wasmModule,omitempty"`
	Background       bool                       `json:"background,omitempty"`
	PollInterval     int                        `json:"pollInterval,omitempty"`
	Permissions      []string                   `json:"permissions,omitempty"`
	ConfigSchema     []map[string]interface{}   `json:"configSchema,omitempty"`
}

var ValidAppIDRegex = regexp.MustCompile(`^[a-zA-Z0-9][a-zA-Z0-9_-]*$`)

func GetWebAppsDir() string {
	return filepath.Join(config.DataDir(), "webapps")
}

// ScanWebApps scans the webapps directory and returns all valid apps.
func ScanWebApps() ([]WebAppManifest, error) {
	dir := GetWebAppsDir()
	entries, err := os.ReadDir(dir)
	if err != nil {
		if os.IsNotExist(err) {
			return []WebAppManifest{}, nil
		}
		return nil, err
	}

	var apps []WebAppManifest
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		manifestPath := filepath.Join(dir, entry.Name(), "manifest.json")
		data, err := os.ReadFile(manifestPath)
		if err != nil {
			continue
		}
		var m WebAppManifest
		if json.Unmarshal(data, &m) != nil {
			continue
		}
		if m.ID == "" {
			m.ID = entry.Name()
		}
		apps = append(apps, m)
	}
	if apps == nil {
		apps = []WebAppManifest{}
	}
	return apps, nil
}

// InstallWebAppFromZip extracts a zip file into the webapps directory.
func InstallWebAppFromZip(zipPath string) (*WebAppManifest, error) {
	r, err := zip.OpenReader(zipPath)
	if err != nil {
		return nil, fmt.Errorf("无法打开 zip 文件: %w", err)
	}
	defer r.Close()

	var manifestFile *zip.File
	prefix := ""
	for _, f := range r.File {
		name := f.Name
		if name == "manifest.json" || strings.HasSuffix(name, "/manifest.json") {
			parts := strings.SplitN(name, "/", 2)
			if len(parts) == 2 && parts[1] == "manifest.json" {
				prefix = parts[0] + "/"
			}
			manifestFile = f
			break
		}
	}
	if manifestFile == nil {
		return nil, fmt.Errorf("zip 中缺少 manifest.json")
	}

	mrc, err := manifestFile.Open()
	if err != nil {
		return nil, fmt.Errorf("读取 manifest.json 失败: %w", err)
	}
	mData, err := io.ReadAll(io.LimitReader(mrc, 1<<20))
	mrc.Close()
	if err != nil {
		return nil, fmt.Errorf("读取 manifest.json 失败: %w", err)
	}

	var manifest WebAppManifest
	if err := json.Unmarshal(mData, &manifest); err != nil {
		return nil, fmt.Errorf("解析 manifest.json 失败: %w", err)
	}
	if manifest.ID == "" {
		return nil, fmt.Errorf("manifest.json 缺少 id 字段")
	}
	if !ValidAppIDRegex.MatchString(manifest.ID) {
		return nil, fmt.Errorf("无效的应用 ID: %s (只允许字母、数字、连字符和下划线)", manifest.ID)
	}

	// 验证入口文件：wasmModule 和 main.js 至少有一个
	hasMainJS := false
	hasWasm := false
	for _, f := range r.File {
		if f.Name == prefix+"main.js" || f.Name == "main.js" {
			hasMainJS = true
		}
		if manifest.WasmModule != "" && (f.Name == prefix+manifest.WasmModule || f.Name == manifest.WasmModule) {
			hasWasm = true
		}
	}
	if manifest.WasmModule != "" && !hasWasm {
		return nil, fmt.Errorf("zip 中缺少声明的 wasm 文件: %s", manifest.WasmModule)
	}
	if manifest.WasmModule == "" && !hasMainJS {
		return nil, fmt.Errorf("zip 中缺少入口文件 main.js（且未声明 wasmModule）")
	}

	targetDir := filepath.Join(GetWebAppsDir(), manifest.ID)
	os.RemoveAll(targetDir)
	if err := os.MkdirAll(targetDir, 0755); err != nil {
		return nil, fmt.Errorf("创建目录失败: %w", err)
	}

	for _, f := range r.File {
		name := f.Name
		if prefix != "" {
			if !strings.HasPrefix(name, prefix) {
				continue
			}
			name = strings.TrimPrefix(name, prefix)
		}
		if name == "" {
			continue
		}

		cleanName := filepath.Clean(name)
		if strings.Contains(cleanName, "..") {
			continue
		}

		destPath := filepath.Join(targetDir, cleanName)

		if f.FileInfo().IsDir() {
			os.MkdirAll(destPath, 0755)
			continue
		}

		if err := os.MkdirAll(filepath.Dir(destPath), 0755); err != nil {
			continue
		}

		rc, err := f.Open()
		if err != nil {
			continue
		}
		outFile, err := os.Create(destPath)
		if err != nil {
			rc.Close()
			continue
		}
		io.Copy(outFile, io.LimitReader(rc, 100<<20))
		outFile.Close()
		rc.Close()
	}

	RegisterWebAppInDB(&manifest)

	return &manifest, nil
}

// InstallWebAppFromCatalog downloads a zip from the catalog and installs it.
func InstallWebAppFromCatalog(ctx context.Context, appID string, catalogApp map[string]interface{}, reporter *ProgressReporter) error {
	var dlURL string
	if dlCfg, ok := catalogApp["download"].(map[string]interface{}); ok {
		dlURL, _ = dlCfg["zipUrl"].(string)
	}
	if dlURL == "" {
		return fmt.Errorf("应用 %s 缺少下载地址", appID)
	}

	reporter.Report(0.2, 0, 0, 0, 0, "正在下载应用...")

	client := &http.Client{Timeout: 5 * time.Minute}
	req, err := http.NewRequestWithContext(ctx, "GET", dlURL, nil)
	if err != nil {
		return fmt.Errorf("创建下载请求失败: %w", err)
	}
	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("下载失败: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return fmt.Errorf("下载服务器返回 %d", resp.StatusCode)
	}

	tmpFile, err := os.CreateTemp("", "webos-static-app-*.zip")
	if err != nil {
		return fmt.Errorf("创建临时文件失败: %w", err)
	}
	tmpPath := tmpFile.Name()
	defer os.Remove(tmpPath)

	written, err := io.Copy(tmpFile, io.LimitReader(resp.Body, 100<<20))
	tmpFile.Close()
	if err != nil {
		return fmt.Errorf("下载写入失败: %w", err)
	}

	reporter.Report(0.6, written, 0, written, 0, "正在解压安装...")

	manifest, err := InstallWebAppFromZip(tmpPath)
	if err != nil {
		return err
	}

	db := database.DB()
	db.Exec("UPDATE installed_apps SET status = ?, updated_at = ? WHERE id = ?",
		"running", time.Now().UnixMilli(), manifest.ID)

	return nil
}

// UninstallWebApp removes an app's directory and DB record.
func UninstallWebApp(appID string) error {
	dir := filepath.Join(GetWebAppsDir(), appID)
	if err := os.RemoveAll(dir); err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("删除应用目录失败: %w", err)
	}
	DeleteInstalledApp(appID)
	return nil
}

// RegisterWebAppInDB inserts or updates an app record in installed_apps (new schema).
func RegisterWebAppInDB(m *WebAppManifest) {
	installDir := filepath.Join(GetWebAppsDir(), m.ID)

	// Build AppManifest from disk WebAppManifest
	manifest := AppManifest{
		Name:             m.Name,
		Description:      m.Description,
		Icon:             m.Icon,
		Version:          m.Version,
		WasmModule:       m.WasmModule,
		Background:       m.Background,
		PollInterval:     m.PollInterval,
		Permissions:      m.Permissions,
		FileAssociations: m.FileAssociations,
		ConfigSchema:     m.ConfigSchema,
	}
	if m.DefaultSize.Width > 0 {
		manifest.DefaultSize = &struct {
			Width  int `json:"width"`
			Height int `json:"height"`
		}{m.DefaultSize.Width, m.DefaultSize.Height}
	}

	var count int
	database.DB().QueryRow("SELECT COUNT(*) FROM installed_apps WHERE id = ?", m.ID).Scan(&count)
	if count > 0 {
		log.Printf("[WebApp] RegisterWebAppInDB UPDATE (existing): %s", m.ID)
		UpdateAppManifest(m.ID, manifest)
		database.DB().Exec("UPDATE installed_apps SET status = 'running', install_dir = ?, updated_at = ? WHERE id = ?",
			installDir, time.Now().UnixMilli(), m.ID)
	} else {
		log.Printf("[WebApp] RegisterWebAppInDB INSERT (new): %s", m.ID)
		app := &InstalledApp{
			ID:         m.ID,
			AppType:    "sideload",
			Status:     "running",
			Config:     "{}",
			Manifest:   manifest,
			InstallDir: installDir,
			Autostart:  m.Background, // background apps default to autostart
		}
		InsertInstalledApp(app)
	}
}

// ReconcileWebApps syncs disk state with DB on startup.
func ReconcileWebApps() {
	apps, err := ScanWebApps()
	if err != nil {
		return
	}
	for _, app := range apps {
		// Ensure the app exists in DB first
		if _, err := GetAppStatus(app.ID); err != nil {
			// Not in DB yet — register it
			RegisterWebAppInDB(&app)
		} else {
			// Already in DB — reconcile manifest from disk
			reconcileSideloadApp(app.ID)
		}
	}
}
