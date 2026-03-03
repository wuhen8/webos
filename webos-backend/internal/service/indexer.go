package service

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"
	"runtime"
	"sync"
	"time"

	"webos-backend/internal/database"
	"webos-backend/internal/storage"
)

const indexBatchSize = 500

// ==================== parent_id tree helpers ====================

// parentCache caches directory id lookups to avoid repeated DB queries.
// Key format: "nodeID\x00parentID\x00name" (parentID is "" for root).
type parentCache struct {
	m map[string]int64
}

func newParentCache() *parentCache {
	return &parentCache{m: make(map[string]int64)}
}

func (c *parentCache) key(nodeID string, parentID *int64, name string) string {
	pid := ""
	if parentID != nil {
		pid = fmt.Sprintf("%d", *parentID)
	}
	return nodeID + "\x00" + pid + "\x00" + name
}

func (c *parentCache) get(nodeID string, parentID *int64, name string) (int64, bool) {
	id, ok := c.m[c.key(nodeID, parentID, name)]
	return id, ok
}

func (c *parentCache) set(nodeID string, parentID *int64, name string, id int64) {
	c.m[c.key(nodeID, parentID, name)] = id
}

// ensureDir finds or creates a directory row, returns its id.
func ensureDir(tx *sql.Tx, nodeID string, parentID *int64, name string, modTime time.Time, cache *parentCache) (int64, error) {
	if id, ok := cache.get(nodeID, parentID, name); ok {
		return id, nil
	}

	var id int64
	var err error
	if parentID == nil {
		err = tx.QueryRow("SELECT id FROM file_index WHERE node_id = ? AND parent_id IS NULL AND name = ?", nodeID, name).Scan(&id)
	} else {
		err = tx.QueryRow("SELECT id FROM file_index WHERE node_id = ? AND parent_id = ? AND name = ?", nodeID, *parentID, name).Scan(&id)
	}
	if err == nil {
		cache.set(nodeID, parentID, name, id)
		return id, nil
	}

	var res sql.Result
	if parentID == nil {
		res, err = tx.Exec("INSERT INTO file_index(node_id, parent_id, name, is_dir, size, extension, modified_time, indexed_at) VALUES(?, NULL, ?, 1, 0, '', ?, CURRENT_TIMESTAMP)",
			nodeID, name, modTime)
	} else {
		res, err = tx.Exec("INSERT INTO file_index(node_id, parent_id, name, is_dir, size, extension, modified_time, indexed_at) VALUES(?, ?, ?, 1, 0, '', ?, CURRENT_TIMESTAMP)",
			nodeID, *parentID, name, modTime)
	}
	if err != nil {
		return 0, err
	}
	id, err = res.LastInsertId()
	if err != nil {
		return 0, err
	}
	cache.set(nodeID, parentID, name, id)
	return id, nil
}

// resolveParentID ensures all ancestor directories for relPath exist and returns the direct parent's id.
// relPath is like "/foo/bar/baz.txt"; returns the id of the "/foo/bar" directory node.
// For a file directly under root ("/baz.txt"), returns the root node's id.
func resolveParentID(tx *sql.Tx, nodeID, relPath string, cache *parentCache) (*int64, error) {
	parts := strings.Split(strings.TrimPrefix(relPath, "/"), "/")
	if len(parts) == 0 {
		return nil, nil
	}

	// Ensure root node exists.
	rootID, err := ensureDir(tx, nodeID, nil, "/", time.Time{}, cache)
	if err != nil {
		return nil, err
	}

	// For a top-level entry like "/foo.txt", parent is root.
	if len(parts) == 1 {
		return &rootID, nil
	}

	// Walk intermediate directories (all parts except the last which is the file/dir itself).
	currentID := rootID
	for _, dirName := range parts[:len(parts)-1] {
		currentID, err = ensureDir(tx, nodeID, &currentID, dirName, time.Time{}, cache)
		if err != nil {
			return nil, err
		}
	}
	return &currentID, nil
}

// findNodeByPath walks the tree from root to find the node at relPath, returns its id.
func findNodeByPath(db *sql.DB, nodeID, relPath string) (int64, error) {
	if relPath == "/" {
		var id int64
		err := db.QueryRow("SELECT id FROM file_index WHERE node_id = ? AND parent_id IS NULL AND name = '/'", nodeID).Scan(&id)
		return id, err
	}

	// Start from root.
	var currentID int64
	err := db.QueryRow("SELECT id FROM file_index WHERE node_id = ? AND parent_id IS NULL AND name = '/'", nodeID).Scan(&currentID)
	if err != nil {
		return 0, err
	}

	parts := strings.Split(strings.TrimPrefix(relPath, "/"), "/")
	for _, name := range parts {
		var nextID int64
		err = db.QueryRow("SELECT id FROM file_index WHERE node_id = ? AND parent_id = ? AND name = ?", nodeID, currentID, name).Scan(&nextID)
		if err != nil {
			return 0, err
		}
		currentID = nextID
	}
	return currentID, nil
}

// buildPath reconstructs the full path from a node id by walking up the tree.
func buildPath(db *sql.DB, id int64) string {
	var parts []string
	currentID := id
	for {
		var name string
		var parentID sql.NullInt64
		err := db.QueryRow("SELECT name, parent_id FROM file_index WHERE id = ?", currentID).Scan(&name, &parentID)
		if err != nil {
			break
		}
		if !parentID.Valid {
			// This is the root node (name="/"), stop.
			break
		}
		parts = append(parts, name)
		currentID = parentID.Int64
	}
	// Reverse parts to get top-down order.
	for i, j := 0, len(parts)-1; i < j; i, j = i+1, j-1 {
		parts[i], parts[j] = parts[j], parts[i]
	}
	if len(parts) == 0 {
		return "/"
	}
	return "/" + strings.Join(parts, "/")
}

// parentOfPath returns the parent directory of a path string.
// Used only for resolving parent paths from FileInfo.Path in callers.
func parentOfPath(p string) string {
	if p == "/" {
		return ""
	}
	i := strings.LastIndex(p, "/")
	if i <= 0 {
		return "/"
	}
	return p[:i]
}

// defaultSkipDirs are directory names skipped by default during indexing.
var defaultSkipDirs = []string{
	// --- VCS ---
	".git",
	".svn",
	".hg",
	".bzr",

	// --- IDE / Editor ---
	".idea",
	".vscode",
	".vs",
	".eclipse",
	".settings",
	".project",

	// --- OS generated ---
	".DS_Store",
	".Spotlight-V100",
	".fseventsd",
	".Trashes",
	".Trash",
	".Trash-1000",
	".trash",
	"$RECYCLE.BIN",
	"System Volume Information",
	"Thumbs.db",
	"desktop.ini",
	"lost+found",
	"Library",

	// --- Linux virtual / system ---
	"proc",
	"sys",
	"dev",
	"run",
	"snap",
	"mnt",
	"media",

	// --- Log / temp / cache ---
	"tmp",
	"temp",
	"log",
	"logs",
	"cache",
	".cache",
	".tmp",
	".temp",
	".log",

	// --- JavaScript / Node ---
	"node_modules",
	".npm",
	".yarn",
	".pnpm-store",
	"bower_components",
	".next",
	".nuxt",
	".output",
	".parcel-cache",
	".turbo",

	// --- Python ---
	"__pycache__",
	".venv",
	"venv",
	"env",
	".env",
	".tox",
	".mypy_cache",
	".pytest_cache",
	".ruff_cache",
	"*.egg-info",
	"dist",
	"build",

	// --- Go ---
	"vendor",

	// --- Rust ---
	"target",

	// --- Java / Kotlin / Android ---
	".gradle",
	".m2",
	".mvn",
	"Pods",

	// --- .NET / C# ---
	"bin",
	"obj",
	"packages",

	// --- Ruby ---
	".bundle",

	// --- PHP ---
	".phpunit.cache",

	// --- Docker ---
	".docker",

	// --- Misc build / CI ---
	".terraform",
	".serverless",
	".sass-cache",
	"coverage",
	".nyc_output",
	"__MACOSX",
}

// skipRules holds parsed exclusion rules: directory names and absolute path prefixes.
type skipRules struct {
	names map[string]bool // exact directory name match
	paths []string        // absolute path prefix match (entries starting with "/")
}

// parseSkipRules builds a skipRules from a string slice.
// Entries starting with "/" are treated as absolute path prefixes; others as directory names.
func parseSkipRules(dirs []string) *skipRules {
	sr := &skipRules{names: make(map[string]bool)}
	for _, d := range dirs {
		d = strings.TrimSpace(d)
		if d == "" {
			continue
		}
		if strings.HasPrefix(d, "/") {
			sr.paths = append(sr.paths, d)
		} else {
			sr.names[d] = true
		}
	}
	return sr
}

// ShouldSkipDir returns true if the directory should be excluded from indexing.
// name is the directory's base name; relPath is its path relative to the storage root (e.g. "/foo/bar").
func (sr *skipRules) ShouldSkipDir(name, relPath string) bool {
	if sr.names[name] {
		return true
	}
	for _, prefix := range sr.paths {
		if relPath == prefix || strings.HasPrefix(relPath, prefix+"/") {
			return true
		}
	}
	return false
}

// getSkipRules returns the merged skip rules: user-configured list from preferences,
// falling back to defaultSkipDirs if not configured.
// Stored in preferences as key "indexSkipDirs" (JSON string array).
func getSkipRules() *skipRules {
	db := database.DB()
	if db == nil {
		return parseSkipRules(defaultSkipDirs)
	}

	var raw string
	err := db.QueryRow("SELECT value FROM preferences WHERE key = 'indexSkipDirs'").Scan(&raw)
	if err != nil {
		return parseSkipRules(defaultSkipDirs)
	}

	var dirs []string
	if err := json.Unmarshal([]byte(raw), &dirs); err != nil {
		return parseSkipRules(defaultSkipDirs)
	}

	return parseSkipRules(dirs)
}

// InitDefaultSkipDirs writes the default skip-dirs list into preferences
// if the key does not exist yet, so the frontend can display/edit it.
func InitDefaultSkipDirs() {
	db := database.DB()
	if db == nil {
		return
	}
	var exists int
	err := db.QueryRow("SELECT 1 FROM preferences WHERE key = 'indexSkipDirs'").Scan(&exists)
	if err == nil {
		return // already set
	}
	data, _ := json.Marshal(defaultSkipDirs)
	db.Exec("INSERT INTO preferences(key, value) VALUES('indexSkipDirs', ?)", string(data))
}

// getIndexDirs returns the list of directories to index from preferences.
// An empty list means "index everything" (the storage root).
// Stored in preferences as key "indexDirs" (JSON string array of absolute paths).
func getIndexDirs() []string {
	db := database.DB()
	if db == nil {
		return nil
	}
	var raw string
	err := db.QueryRow("SELECT value FROM preferences WHERE key = 'indexDirs'").Scan(&raw)
	if err != nil {
		return nil
	}
	var dirs []string
	if err := json.Unmarshal([]byte(raw), &dirs); err != nil {
		return nil
	}
	return dirs
}

// indexingMu guards the indexing map to prevent concurrent indexing of the same node.
var indexingMu sync.Mutex
var indexing = make(map[string]bool)

// ==================== Operation-driven index updates ====================

// IndexAdd adds or updates a single file/directory in the index.
// Runs asynchronously so it does not block the caller.
func IndexAdd(nodeID string, f storage.FileInfo) {
	go func() {
		db := database.DB()
		if db == nil {
			return
		}
		ext := ""
		if !f.IsDir {
			ext = filepath.Ext(f.Name)
		}
		if f.Extension == "" {
			f.Extension = ext
		}

		tx, err := db.Begin()
		if err != nil {
			return
		}
		defer tx.Rollback()

		cache := newParentCache()
		parentID, err := resolveParentID(tx, nodeID, f.Path, cache)
		if err != nil {
			return
		}

		// Check if entry already exists; if so, delete its subtree and re-insert.
		var existingID int64
		if parentID == nil {
			err = tx.QueryRow("SELECT id FROM file_index WHERE node_id = ? AND parent_id IS NULL AND name = ?", nodeID, f.Name).Scan(&existingID)
		} else {
			err = tx.QueryRow("SELECT id FROM file_index WHERE node_id = ? AND parent_id = ? AND name = ?", nodeID, *parentID, f.Name).Scan(&existingID)
		}
		if err == nil {
			// Delete subtree recursively.
			tx.Exec(`WITH RECURSIVE subtree AS (
				SELECT id FROM file_index WHERE id = ?
				UNION ALL
				SELECT fi.id FROM file_index fi JOIN subtree s ON fi.parent_id = s.id
			) DELETE FROM file_index WHERE id IN (SELECT id FROM subtree)`, existingID)
		}

		isDir := 0
		if f.IsDir {
			isDir = 1
		}
		if parentID == nil {
			tx.Exec(`INSERT INTO file_index(node_id, parent_id, name, is_dir, size, extension, modified_time, indexed_at)
				VALUES(?, NULL, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
				nodeID, f.Name, isDir, f.Size, f.Extension, f.ModifiedTime)
		} else {
			tx.Exec(`INSERT INTO file_index(node_id, parent_id, name, is_dir, size, extension, modified_time, indexed_at)
				VALUES(?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
				nodeID, *parentID, f.Name, isDir, f.Size, f.Extension, f.ModifiedTime)
		}
		if err := tx.Commit(); err != nil {
			log.Printf("[indexer] IndexAdd commit: %v", err)
		}
	}()
}

// IndexDelete removes a path (and all children if it is a directory) from the index.
// Runs asynchronously.
func IndexDelete(nodeID, path string) {
	go func() {
		db := database.DB()
		if db == nil {
			return
		}
		removeIndexedPath(db, nodeID, path)
	}()
}

// IndexRename removes the old path from the index and refreshes the parent directory
// of the new path so all children are correctly re-indexed.
// Runs asynchronously.
func IndexRename(nodeID, oldPath, newPath string) {
	go func() {
		db := database.DB()
		if db == nil {
			return
		}
		removeIndexedPath(db, nodeID, oldPath)
		refreshDir(nodeID, parentOfPath(newPath))
	}()
}

// IndexRefreshDir re-syncs a directory's direct children against the filesystem.
// Useful after bulk operations (extract, compress, copy).
// Runs asynchronously.
func IndexRefreshDir(nodeID, dirPath string) {
	go func() {
		refreshDir(nodeID, dirPath)
	}()
}

// refreshDir performs the actual directory sync against the filesystem.
func refreshDir(nodeID, dirPath string) {
	driver, err := storage.GetDriver(nodeID)
	if err != nil {
		return
	}
	if _, ok := driver.(*storage.LocalDriver); !ok {
		return
	}
	root := storage.GetNodeRootPath(nodeID)

	absDir := filepath.Join(root, filepath.FromSlash(dirPath))
	info, err := os.Stat(absDir)
	if err != nil {
		return
	}

	db := database.DB()
	skip := getSkipRules()

	// Find or create the directory node in the tree.
	dirID, err := findNodeByPath(db, nodeID, dirPath)
	if err != nil {
		// Directory not in index yet; create it via a transaction.
		tx, txErr := db.Begin()
		if txErr != nil {
			return
		}
		defer tx.Rollback()
		cache := newParentCache()
		parentID, pErr := resolveParentID(tx, nodeID, dirPath+"/placeholder", cache)
		if pErr != nil {
			return
		}
		dirName := filepath.Base(dirPath)
		if dirPath == "/" {
			dirName = "/"
		}
		var res sql.Result
		if parentID == nil {
			res, err = tx.Exec("INSERT OR IGNORE INTO file_index(node_id, parent_id, name, is_dir, modified_time, indexed_at) VALUES(?, NULL, ?, 1, ?, CURRENT_TIMESTAMP)",
				nodeID, dirName, info.ModTime())
		} else {
			res, err = tx.Exec("INSERT OR IGNORE INTO file_index(node_id, parent_id, name, is_dir, modified_time, indexed_at) VALUES(?, ?, ?, 1, ?, CURRENT_TIMESTAMP)",
				nodeID, *parentID, dirName, info.ModTime())
		}
		if err != nil {
			return
		}
		if err := tx.Commit(); err != nil {
			log.Printf("[indexer] refreshDir commit: %v", err)
			return
		}
		dirID, _ = res.LastInsertId()
		if dirID == 0 {
			// INSERT OR IGNORE didn't insert, try to find it again.
			dirID, err = findNodeByPath(db, nodeID, dirPath)
			if err != nil {
				return
			}
		}
	}

	syncDirectoryIncremental(db, nodeID, root, absDir, dirPath, dirID, info.ModTime(), skip)
}

// NodeHasIndex checks whether the DB already contains index entries for this node.
func NodeHasIndex(nodeID string) bool {
	var x int
	err := database.DB().QueryRow("SELECT 1 FROM file_index WHERE node_id = ? LIMIT 1", nodeID).Scan(&x)
	return err == nil
}

// ==================== Full index build (streaming, batched) ====================

// BuildFullIndex rebuilds the entire index for a storage node.
func BuildFullIndex(ctx context.Context, nodeID, nodeType string) {
	indexingMu.Lock()
	if indexing[nodeID] {
		indexingMu.Unlock()
		return
	}
	indexing[nodeID] = true
	indexingMu.Unlock()
	defer func() {
		indexingMu.Lock()
		delete(indexing, nodeID)
		indexingMu.Unlock()
	}()

	start := time.Now()

	if err := clearNodeIndex(ctx, nodeID); err != nil {
		log.Printf("[indexer] clear index for %s: %v", nodeID, err)
		return
	}

	var total int64
	var err error

	switch nodeType {
	case "local":
		driver, dErr := storage.GetDriver(nodeID)
		if dErr != nil {
			log.Printf("[indexer] driver %s: %v", nodeID, dErr)
			return
		}
		if _, ok := driver.(*storage.LocalDriver); !ok {
			return
		}
		root := storage.GetNodeRootPath(nodeID)
		skip := getSkipRules()
		indexDirs := getIndexDirs()
		if len(indexDirs) > 0 {
			// Only index specified directories
			for _, dir := range indexDirs {
				if ctx.Err() != nil {
					break
				}
				absDir := filepath.Join(root, filepath.FromSlash(dir))
				if _, err := os.Stat(absDir); err != nil {
					continue
				}
				n, e := streamIndexLocalDir(ctx, nodeID, root, absDir, dir, skip)
				total += n
				if e != nil {
					err = e
					break
				}
			}
		} else {
			total, err = streamIndexLocal(ctx, nodeID, root, skip)
		}
	case "s3":
		driver, dErr := storage.GetDriver(nodeID)
		if dErr != nil {
			log.Printf("[indexer] driver %s: %v", nodeID, dErr)
			return
		}
		s3Driver, ok := driver.(*storage.S3Driver)
		if !ok {
			return
		}
		total, err = streamIndexS3(ctx, nodeID, s3Driver)
	default:
		return
	}

	if err != nil {
		log.Printf("[indexer] build index %s: %v", nodeID, err)
		return
	}
	log.Printf("[indexer] indexed %d files for node %s in %v", total, nodeID, time.Since(start).Round(time.Millisecond))
}

func clearNodeIndex(ctx context.Context, nodeID string) error {
	db := database.DB()
	for {
		if ctx.Err() != nil {
			return ctx.Err()
		}
		res, err := db.Exec(
			"DELETE FROM file_index WHERE id IN (SELECT id FROM file_index WHERE node_id = ? LIMIT 500)",
			nodeID)
		if err != nil {
			return err
		}
		n, _ := res.RowsAffected()
		if n == 0 {
			break
		}
		runtime.Gosched()
		time.Sleep(100 * time.Millisecond)
	}
	return nil
}

func flushBatch(ctx context.Context, nodeID string, batch []storage.FileInfo, cache *parentCache) error {
	if ctx.Err() != nil {
		return ctx.Err()
	}
	db := database.DB()
	tx, err := db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	stmt, err := tx.Prepare(`INSERT INTO file_index(node_id, parent_id, name, is_dir, size, extension, modified_time, indexed_at)
		VALUES(?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`)
	if err != nil {
		return err
	}
	defer stmt.Close()

	for _, f := range batch {
		if ctx.Err() != nil {
			return ctx.Err() // rollback via defer
		}
		parentID, pErr := resolveParentID(tx, nodeID, f.Path, cache)
		if pErr != nil {
			continue
		}
		isDir := 0
		if f.IsDir {
			isDir = 1
		}
		if parentID == nil {
			stmt.Exec(nodeID, nil, f.Name, isDir, f.Size, f.Extension, f.ModifiedTime)
		} else {
			stmt.Exec(nodeID, *parentID, f.Name, isDir, f.Size, f.Extension, f.ModifiedTime)
		}
	}
	return tx.Commit()
}

func streamIndexLocal(ctx context.Context, nodeID, root string, skip *skipRules) (int64, error) {
	cache := newParentCache()

	// Create root node first.
	db := database.DB()
	tx, err := db.Begin()
	if err != nil {
		return 0, err
	}
	_, err = ensureDir(tx, nodeID, nil, "/", time.Time{}, cache)
	if err != nil {
		tx.Rollback()
		return 0, err
	}
	if err := tx.Commit(); err != nil {
		return 0, err
	}

	var batch []storage.FileInfo
	var total int64

	err = filepath.WalkDir(root, func(p string, d os.DirEntry, err error) error {
		if err != nil {
			return nil
		}
		if ctx.Err() != nil {
			return ctx.Err()
		}
		name := d.Name()
		rel, relErr := filepath.Rel(root, p)
		if relErr != nil || rel == "." {
			return nil
		}
		relPath := "/" + filepath.ToSlash(rel)
		if d.IsDir() && skip.ShouldSkipDir(name, relPath) {
			return filepath.SkipDir
		}
		info, infoErr := d.Info()
		if infoErr != nil {
			return nil
		}
		ext := ""
		if !d.IsDir() {
			ext = filepath.Ext(name)
		}
		batch = append(batch, storage.FileInfo{
			Name: name, Path: relPath, IsDir: d.IsDir(),
			Size: info.Size(), Extension: ext, ModifiedTime: info.ModTime(),
		})
		if len(batch) >= indexBatchSize {
			if err := flushBatch(ctx, nodeID, batch, cache); err != nil {
				log.Printf("[indexer] flush batch: %v", err)
			}
			total += int64(len(batch))
			batch = batch[:0]
			runtime.Gosched()
		}
		return nil
	})
	if err != nil {
		return total, err
	}
	if len(batch) > 0 {
		if err := flushBatch(ctx, nodeID, batch, cache); err != nil {
			return total, err
		}
		total += int64(len(batch))
	}
	return total, nil
}

// streamIndexLocalDir indexes a specific subdirectory under root.
// dirRelPath is like "/Documents" or "/home/user/photos".
func streamIndexLocalDir(ctx context.Context, nodeID, root, absDir, dirRelPath string, skip *skipRules) (int64, error) {
	cache := newParentCache()

	// Ensure root node exists.
	db := database.DB()
	tx, err := db.Begin()
	if err != nil {
		return 0, err
	}
	_, err = ensureDir(tx, nodeID, nil, "/", time.Time{}, cache)
	if err != nil {
		tx.Rollback()
		return 0, err
	}
	if err := tx.Commit(); err != nil {
		return 0, err
	}

	var batch []storage.FileInfo
	var total int64

	err = filepath.WalkDir(absDir, func(p string, d os.DirEntry, err error) error {
		if err != nil {
			return nil
		}
		if ctx.Err() != nil {
			return ctx.Err()
		}
		name := d.Name()
		rel, relErr := filepath.Rel(root, p)
		if relErr != nil || rel == "." {
			return nil
		}
		relPath := "/" + filepath.ToSlash(rel)
		if d.IsDir() && skip.ShouldSkipDir(name, relPath) {
			return filepath.SkipDir
		}
		info, infoErr := d.Info()
		if infoErr != nil {
			return nil
		}
		ext := ""
		if !d.IsDir() {
			ext = filepath.Ext(name)
		}
		batch = append(batch, storage.FileInfo{
			Name: name, Path: relPath, IsDir: d.IsDir(),
			Size: info.Size(), Extension: ext, ModifiedTime: info.ModTime(),
		})
		if len(batch) >= indexBatchSize {
			if err := flushBatch(ctx, nodeID, batch, cache); err != nil {
				log.Printf("[indexer] flush batch: %v", err)
			}
			total += int64(len(batch))
			batch = batch[:0]
			runtime.Gosched()
		}
		return nil
	})
	if err != nil {
		return total, err
	}
	if len(batch) > 0 {
		if err := flushBatch(ctx, nodeID, batch, cache); err != nil {
			return total, err
		}
		total += int64(len(batch))
	}
	return total, nil
}

func streamIndexS3(ctx context.Context, nodeID string, s3Driver *storage.S3Driver) (int64, error) {
	cache := newParentCache()

	// Create root node first.
	db := database.DB()
	tx, err := db.Begin()
	if err != nil {
		return 0, err
	}
	_, err = ensureDir(tx, nodeID, nil, "/", time.Time{}, cache)
	if err != nil {
		tx.Rollback()
		return 0, err
	}
	if err := tx.Commit(); err != nil {
		return 0, err
	}

	var total int64
	err = s3Driver.WalkAllObjects(func(batch []storage.FileInfo) error {
		if ctx.Err() != nil {
			return ctx.Err()
		}
		if err := flushBatch(ctx, nodeID, batch, cache); err != nil {
			return err
		}
		total += int64(len(batch))
		runtime.Gosched()
		return nil
	})
	return total, err
}

// ==================== Incremental polling ====================

// IncrementalIndexLocal only scans directory mtimes (~56K dirs) instead of all files (~2M).
// When a directory's mtime changes, its direct children are diffed against the DB.
func IncrementalIndexLocal(ctx context.Context, nodeID string) {
	indexingMu.Lock()
	if indexing[nodeID] {
		indexingMu.Unlock()
		return
	}
	indexing[nodeID] = true
	indexingMu.Unlock()
	defer func() {
		indexingMu.Lock()
		delete(indexing, nodeID)
		indexingMu.Unlock()
	}()

	driver, err := storage.GetDriver(nodeID)
	if err != nil {
		return
	}
	if _, ok := driver.(*storage.LocalDriver); !ok {
		return
	}
	root := storage.GetNodeRootPath(nodeID)

	start := time.Now()
	skip := getSkipRules()
	indexDirs := getIndexDirs()

	// Phase 1: Walk only directories, collect their mtime.
	type dirInfo struct {
		absPath string
		relPath string // e.g. "/" or "/Documents"
		modTime time.Time
	}
	var fsDirs []dirInfo

	walkDirCollect := func(startAbs string) {
		filepath.WalkDir(startAbs, func(p string, d os.DirEntry, err error) error {
			if err != nil {
				return nil
			}
			if ctx.Err() != nil {
				return ctx.Err()
			}
			if !d.IsDir() {
				return nil
			}
			rel, relErr := filepath.Rel(root, p)
			if relErr != nil {
				return nil
			}
			relPath := "/" + filepath.ToSlash(rel)
			if relPath == "/." {
				relPath = "/"
			}
			if d.Name() != "." && skip.ShouldSkipDir(d.Name(), relPath) {
				return filepath.SkipDir
			}
			info, infoErr := d.Info()
			if infoErr != nil {
				return nil
			}
			fsDirs = append(fsDirs, dirInfo{absPath: p, relPath: relPath, modTime: info.ModTime()})
			return nil
		})
	}

	if len(indexDirs) > 0 {
		// Only walk specified directories
		for _, dir := range indexDirs {
			if ctx.Err() != nil {
				break
			}
			absDir := filepath.Join(root, filepath.FromSlash(dir))
			if _, err := os.Stat(absDir); err != nil {
				continue
			}
			walkDirCollect(absDir)
		}
	} else {
		walkDirCollect(root)
	}

	if ctx.Err() != nil {
		return
	}

	// Phase 2: Load indexed directories from DB and reconstruct paths in memory.
	db := database.DB()
	type dbDirInfo struct {
		id      int64
		modTime time.Time
	}
	dbDirMap := make(map[string]dbDirInfo, len(fsDirs))

	type rawDir struct {
		id       int64
		parentID sql.NullInt64
		name     string
		modTime  time.Time
	}
	rows, err := db.Query(
		"SELECT id, parent_id, name, modified_time FROM file_index WHERE node_id = ? AND is_dir = 1",
		nodeID,
	)
	if err != nil {
		return
	}
	idMap := make(map[int64]rawDir)
	for rows.Next() {
		var r rawDir
		var modTime sql.NullTime
		if err := rows.Scan(&r.id, &r.parentID, &r.name, &modTime); err != nil {
			continue
		}
		if modTime.Valid {
			r.modTime = modTime.Time
		}
		idMap[r.id] = r
	}
	rows.Close()

	// Build full paths in memory by walking up the parent chain.
	pathCache := make(map[int64]string, len(idMap))
	var resolvePath func(int64) string
	resolvePath = func(id int64) string {
		if p, ok := pathCache[id]; ok {
			return p
		}
		r, ok := idMap[id]
		if !ok {
			return "/"
		}
		if !r.parentID.Valid {
			// Root node
			pathCache[id] = "/"
			return "/"
		}
		parent := resolvePath(r.parentID.Int64)
		var p string
		if parent == "/" {
			p = "/" + r.name
		} else {
			p = parent + "/" + r.name
		}
		pathCache[id] = p
		return p
	}

	for id, r := range idMap {
		path := resolvePath(id)
		dbDirMap[path] = dbDirInfo{id: r.id, modTime: r.modTime}
	}

	// Phase 3: Find changed/new/deleted directories.
	fsDirSet := make(map[string]bool, len(fsDirs))
	var changedDirs []dirInfo
	for _, d := range fsDirs {
		fsDirSet[d.relPath] = true
		if dbDir, exists := dbDirMap[d.relPath]; !exists {
			changedDirs = append(changedDirs, d)
		} else if !d.modTime.Truncate(time.Second).Equal(dbDir.modTime.Truncate(time.Second)) {
			changedDirs = append(changedDirs, d)
		}
	}

	// Deleted directories: in DB but not on filesystem.
	var deletedDirPaths []string
	for dbPath := range dbDirMap {
		if !fsDirSet[dbPath] {
			deletedDirPaths = append(deletedDirPaths, dbPath)
		}
	}

	// Phase 4: Remove entries under deleted directories.
	totalDel := 0
	for _, dirPath := range deletedDirPaths {
		n := removeIndexedPath(db, nodeID, dirPath)
		totalDel += n
	}

	// Phase 5: For each changed directory, diff its direct children against DB.
	totalAdd, totalUpd, totalChildDel := 0, 0, 0
	for _, d := range changedDirs {
		// Find or create the directory node.
		dirID, ok := dbDirMap[d.relPath]
		var did int64
		if ok {
			did = dirID.id
		} else {
			// New directory — create it.
			tx, txErr := db.Begin()
			if txErr != nil {
				continue
			}
			cache := newParentCache()
			// Pre-populate cache with known dirs from dbDirMap.
			parentID, pErr := resolveParentID(tx, nodeID, d.relPath+"/placeholder", cache)
			if pErr != nil {
				tx.Rollback()
				continue
			}
			dirName := filepath.Base(d.relPath)
			if d.relPath == "/" {
				dirName = "/"
			}
			var res sql.Result
			if parentID == nil {
				res, err = tx.Exec("INSERT INTO file_index(node_id, parent_id, name, is_dir, modified_time, indexed_at) VALUES(?, NULL, ?, 1, ?, CURRENT_TIMESTAMP)",
					nodeID, dirName, d.modTime)
			} else {
				res, err = tx.Exec("INSERT INTO file_index(node_id, parent_id, name, is_dir, modified_time, indexed_at) VALUES(?, ?, ?, 1, ?, CURRENT_TIMESTAMP)",
					nodeID, *parentID, dirName, d.modTime)
			}
			if err != nil {
				tx.Rollback()
				continue
			}
			if err := tx.Commit(); err != nil {
				log.Printf("[indexer] incremental dir commit: %v", err)
				continue
			}
			did, _ = res.LastInsertId()
		}

		a, u, del := syncDirectoryIncremental(db, nodeID, root, d.absPath, d.relPath, did, d.modTime, skip)
		totalAdd += a
		totalUpd += u
		totalChildDel += del
		runtime.Gosched() // yield to other goroutines between directory syncs
	}

	totalDel += totalChildDel

	if totalAdd > 0 || totalUpd > 0 || totalDel > 0 || len(deletedDirPaths) > 0 {
		log.Printf("[indexer] incremental update for %s: +%d ~%d -%d (scanned %d/%d dirs) in %v",
			nodeID, totalAdd, totalUpd, totalDel,
			len(changedDirs), len(fsDirs),
			time.Since(start).Round(time.Millisecond))
	}
}

// removeIndexedPath removes a node and all its descendants from the index using tree traversal.
func removeIndexedPath(db *sql.DB, nodeID, path string) int {
	id, err := findNodeByPath(db, nodeID, path)
	if err != nil {
		return 0
	}
	res, err := db.Exec(`WITH RECURSIVE subtree AS (
		SELECT id FROM file_index WHERE id = ?
		UNION ALL
		SELECT fi.id FROM file_index fi JOIN subtree s ON fi.parent_id = s.id
	) DELETE FROM file_index WHERE id IN (SELECT id FROM subtree)`, id)
	if err != nil {
		return 0
	}
	n, _ := res.RowsAffected()
	return int(n)
}

// syncDirectoryIncremental diffs a single directory's direct children against the DB.
// dirID is the file_index id of the directory node.
// Returns (added, updated, deleted) counts.
func syncDirectoryIncremental(db *sql.DB, nodeID, root, absDir, dirPath string, dirID int64, dirModTime time.Time, skip *skipRules) (int, int, int) {
	// Read filesystem children.
	entries, err := os.ReadDir(absDir)
	type fsEntry struct {
		name    string
		isDir   bool
		size    int64
		ext     string
		modTime time.Time
	}
	fsMap := make(map[string]fsEntry)
	if err == nil {
		for _, e := range entries {
			name := e.Name()
			var fPath string
			if dirPath == "/" {
				fPath = "/" + name
			} else {
				fPath = dirPath + "/" + name
			}
			if e.IsDir() && skip.ShouldSkipDir(name, fPath) {
				continue
			}
			info, err := e.Info()
			if err != nil {
				continue
			}
			ext := ""
			if !e.IsDir() {
				ext = filepath.Ext(name)
			}
			fsMap[name] = fsEntry{
				name: name, isDir: e.IsDir(),
				size: info.Size(), ext: ext, modTime: info.ModTime(),
			}
		}
	}

	// Read DB children using parent_id.
	type dbEntry struct {
		id      int64
		name    string
		isDir   bool
		modTime time.Time
		size    int64
	}
	dbMap := make(map[string]dbEntry)

	dbRows, err := db.Query(
		"SELECT id, name, is_dir, modified_time, size FROM file_index WHERE parent_id = ?",
		dirID,
	)
	if err == nil {
		for dbRows.Next() {
			var e dbEntry
			var modTime sql.NullTime
			if err := dbRows.Scan(&e.id, &e.name, &e.isDir, &modTime, &e.size); err != nil {
				continue
			}
			if modTime.Valid {
				e.modTime = modTime.Time
			}
			dbMap[e.name] = e
		}
		dbRows.Close()
	}

	// Diff.
	var toAdd []fsEntry
	var toUpdate []fsEntry
	var toDelete []dbEntry

	for name, fsFile := range fsMap {
		if dbE, exists := dbMap[name]; !exists {
			toAdd = append(toAdd, fsFile)
		} else if !fsFile.modTime.Truncate(time.Second).Equal(dbE.modTime.Truncate(time.Second)) || fsFile.size != dbE.size {
			toUpdate = append(toUpdate, fsFile)
		}
	}
	for name, dbE := range dbMap {
		if _, exists := fsMap[name]; !exists {
			toDelete = append(toDelete, dbE)
		}
	}

	tx, err := db.Begin()
	if err != nil {
		return 0, 0, 0
	}
	defer tx.Rollback()

	// Update directory mtime.
	tx.Exec("UPDATE file_index SET modified_time = ?, indexed_at = CURRENT_TIMESTAMP WHERE id = ?", dirModTime, dirID)

	// Prepare reusable statements.
	delStmt, err := tx.Prepare(`WITH RECURSIVE subtree AS (
		SELECT id FROM file_index WHERE id = ?
		UNION ALL
		SELECT fi.id FROM file_index fi JOIN subtree s ON fi.parent_id = s.id
	) DELETE FROM file_index WHERE id IN (SELECT id FROM subtree)`)
	if err != nil {
		return 0, 0, 0
	}
	defer delStmt.Close()

	insStmt, err := tx.Prepare(`INSERT INTO file_index(node_id, parent_id, name, is_dir, size, extension, modified_time, indexed_at)
		VALUES(?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`)
	if err != nil {
		return 0, 0, 0
	}
	defer insStmt.Close()

	// Apply child diffs — delete subtrees for removed/updated entries.
	for _, e := range toDelete {
		delStmt.Exec(e.id)
	}
	for _, f := range toUpdate {
		if e, ok := dbMap[f.name]; ok {
			delStmt.Exec(e.id)
		}
		isDir := 0
		if f.isDir {
			isDir = 1
		}
		insStmt.Exec(nodeID, dirID, f.name, isDir, f.size, f.ext, f.modTime)
	}
	for _, f := range toAdd {
		isDir := 0
		if f.isDir {
			isDir = 1
		}
		insStmt.Exec(nodeID, dirID, f.name, isDir, f.size, f.ext, f.modTime)
	}

	if err := tx.Commit(); err != nil {
		log.Printf("[indexer] syncDirectoryIncremental commit: %v", err)
		return 0, 0, 0
	}
	return len(toAdd), len(toUpdate), len(toDelete)
}

// ==================== Search ====================

// SearchIndex searches file_index.name using LIKE.
// Results are ordered: exact match > prefix match > contains match, then by name length.
// For each result, the full path is reconstructed by walking up the tree.
func SearchIndex(nodeID, keyword string, limit int) ([]storage.FileInfo, error) {
	if limit <= 0 {
		limit = 50
	}
	keyword = strings.TrimSpace(keyword)
	if keyword == "" {
		return nil, nil
	}
	db := database.DB()

	pattern := "%" + keyword + "%"
	rows, err := db.Query(
		`SELECT id, name, is_dir, size, extension, modified_time FROM file_index
		 WHERE node_id = ? AND name LIKE ?
		 ORDER BY CASE WHEN name = ? THEN 0 WHEN name LIKE ? THEN 1 ELSE 2 END, length(name)
		 LIMIT ?`,
		nodeID, pattern, keyword, keyword+"%", limit,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	type resultItem struct {
		id int64
		f  storage.FileInfo
	}
	var items []resultItem
	for rows.Next() {
		var item resultItem
		var modTime sql.NullTime
		if err := rows.Scan(&item.id, &item.f.Name, &item.f.IsDir, &item.f.Size, &item.f.Extension, &modTime); err != nil {
			continue
		}
		if modTime.Valid {
			item.f.ModifiedTime = modTime.Time
		}
		items = append(items, item)
	}

	if len(items) == 0 {
		return nil, nil
	}

	// Batch-build paths: collect all ancestor IDs by walking up the tree,
	// then assemble paths in memory.
	// Step 1: Seed with result IDs.
	needed := make(map[int64]bool)
	for _, item := range items {
		needed[item.id] = true
	}

	type nodeInfo struct {
		name     string
		parentID sql.NullInt64
	}
	nodeMap := make(map[int64]nodeInfo)

	// Step 2: Walk up parent chains, loading nodes in batches.
	toLoad := make([]int64, 0, len(needed))
	for id := range needed {
		toLoad = append(toLoad, id)
	}

	for len(toLoad) > 0 {
		// Build query for this batch.
		placeholders := make([]string, len(toLoad))
		args := make([]interface{}, len(toLoad))
		for i, id := range toLoad {
			placeholders[i] = "?"
			args[i] = id
		}
		query := "SELECT id, name, parent_id FROM file_index WHERE id IN (" + strings.Join(placeholders, ",") + ")"
		batchRows, err := db.Query(query, args...)
		if err != nil {
			break
		}
		var nextLoad []int64
		for batchRows.Next() {
			var id int64
			var name string
			var parentID sql.NullInt64
			if err := batchRows.Scan(&id, &name, &parentID); err != nil {
				continue
			}
			nodeMap[id] = nodeInfo{name: name, parentID: parentID}
			if parentID.Valid {
				if _, loaded := nodeMap[parentID.Int64]; !loaded {
					nodeMap[parentID.Int64] = nodeInfo{} // placeholder
					nextLoad = append(nextLoad, parentID.Int64)
				}
			}
		}
		batchRows.Close()
		toLoad = nextLoad
	}

	// Step 3: Build paths from nodeMap.
	pathCache := make(map[int64]string, len(nodeMap))
	var resolvePath func(int64) string
	resolvePath = func(id int64) string {
		if p, ok := pathCache[id]; ok {
			return p
		}
		n, ok := nodeMap[id]
		if !ok {
			return "/"
		}
		if !n.parentID.Valid {
			pathCache[id] = "/"
			return "/"
		}
		parent := resolvePath(n.parentID.Int64)
		var p string
		if parent == "/" {
			p = "/" + n.name
		} else {
			p = parent + "/" + n.name
		}
		pathCache[id] = p
		return p
	}

	results := make([]storage.FileInfo, 0, len(items))
	for _, item := range items {
		item.f.Path = resolvePath(item.id)
		results = append(results, item.f)
	}
	return results, nil
}
