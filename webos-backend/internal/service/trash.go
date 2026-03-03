package service

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"os/user"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"webos-backend/internal/storage"
)

// trashDirName is the hidden directory name used for per-mountpoint trash.
const trashDirName = ".trash"

// trashMeta stores the original path and deletion time for a trashed item.
type trashMeta struct {
	OriginalPath string `json:"originalPath"`
	DeletedAt    int64  `json:"deletedAt"`
	IsDir        bool   `json:"isDir"`
	Size         int64  `json:"size"`
	Name         string `json:"name"`
}

// TrashItem is the public representation of a trashed item.
type TrashItem struct {
	ID           string `json:"id"`
	Name         string `json:"name"`
	OriginalPath string `json:"originalPath"`
	IsDir        bool   `json:"isDir"`
	Size         int64  `json:"size"`
	DeletedAt    int64  `json:"deletedAt"`
}

// TrashManager handles all recycle-bin operations for a storage node.
type TrashManager struct {
	nodeID string
	driver storage.Driver
}

// NewTrashManager creates a TrashManager for the given storage node.
func NewTrashManager(nodeID string) (*TrashManager, error) {
	driver, err := storage.GetDriver(nodeID)
	if err != nil {
		return nil, err
	}
	return &TrashManager{nodeID: nodeID, driver: driver}, nil
}

// userTrashDir returns the user-level trash directory under $HOME/.webos/trash.
// This is always writable by the current user and avoids permission issues
// with mount-point-level .trash directories.
func userTrashDir() string {
	home, err := os.UserHomeDir()
	if err != nil || home == "" {
		home = "."
	}
	return filepath.Join(home, ".webos", "trash")
}

// isRootUser returns true if the current process is running as root (uid 0).
func isRootUser() bool {
	u, err := user.Current()
	if err != nil {
		return false
	}
	return u.Uid == "0"
}

// canWriteDir checks if the current process can create files in the given directory.
// If the directory doesn't exist, it checks the parent.
func canWriteDir(dir string) bool {
	// Try to stat the directory; if it exists check write permission
	if info, err := os.Stat(dir); err == nil && info.IsDir() {
		// Try creating a temp file to verify actual write access
		testPath := filepath.Join(dir, ".write_test_"+generateTrashID())
		f, err := os.Create(testPath)
		if err != nil {
			return false
		}
		f.Close()
		os.Remove(testPath)
		return true
	}
	// Directory doesn't exist — check if we can create it
	parent := filepath.Dir(dir)
	if parent == dir {
		return false
	}
	return canWriteDir(parent)
}

// trashDirFor returns the trash directory path for the given file.
// Strategy:
//  1. For root user: use mount-point-level .trash (original behavior)
//  2. For non-root user on the home mount point: use ~/.webos/trash
//  3. For non-root user on external mount points: try $mountpoint/.trash,
//     fall back to ~/.webos/trash if not writable
func (tm *TrashManager) trashDirFor(filePath string) string {
	if _, ok := tm.driver.(*storage.LocalDriver); !ok {
		return trashDirName
	}

	// Root user: original mount-point-level behavior
	if isRootUser() {
		mountPoint, err := findMountPoint(filePath)
		if err != nil {
			return filepath.Join("/", trashDirName)
		}
		return filepath.Join(mountPoint, trashDirName)
	}

	// Non-root user: determine if file is on the home mount point
	home, _ := os.UserHomeDir()
	homeMountPoint, _ := findMountPoint(home)
	fileMountPoint, err := findMountPoint(filePath)
	if err != nil {
		return userTrashDir()
	}

	// Same mount point as home → use user trash dir (always writable)
	if fileMountPoint == homeMountPoint {
		return userTrashDir()
	}

	// External mount point → try mount-point-level .trash first
	mpTrash := filepath.Join(fileMountPoint, trashDirName)
	if canWriteDir(mpTrash) || canWriteDir(fileMountPoint) {
		return mpTrash
	}

	// Fall back to user trash dir (cross-device move will use copy+delete)
	return userTrashDir()
}

// allTrashDirs returns all trash directories that the current user can access.
func (tm *TrashManager) allTrashDirs() []string {
	if _, ok := tm.driver.(*storage.LocalDriver); !ok {
		return []string{trashDirName}
	}

	seen := make(map[string]bool)
	var dirs []string

	// Always include user trash dir for non-root users
	if !isRootUser() {
		uDir := userTrashDir()
		if info, err := os.Stat(uDir); err == nil && info.IsDir() {
			dirs = append(dirs, uDir)
			seen[uDir] = true
		}
	}

	// Also scan mount-point-level .trash directories
	for _, mp := range listMountPoints() {
		absTrash := filepath.Join(mp, trashDirName)
		if seen[absTrash] {
			continue
		}
		if info, err := os.Stat(absTrash); err == nil && info.IsDir() {
			dirs = append(dirs, absTrash)
			seen[absTrash] = true
		}
	}

	if len(dirs) == 0 {
		return nil
	}
	return dirs
}

func generateTrashID() string {
	b := make([]byte, 8)
	rand.Read(b)
	return fmt.Sprintf("%d_%s", time.Now().UnixMilli(), hex.EncodeToString(b))
}

// MoveToTrash moves a file or directory into the trash.
func (tm *TrashManager) MoveToTrash(path string) error {
	info, err := tm.driver.Stat(path)
	if err != nil {
		return err
	}

	trashDir := tm.trashDirFor(path)
	trashID := generateTrashID()
	itemDir := filepath.Join(trashDir, trashID)

	if err := tm.driver.CreateDir(itemDir); err != nil {
		return fmt.Errorf("create trash item dir: %w", err)
	}

	destPath := filepath.Join(itemDir, info.Name)
	if err := tm.driver.Move(path, destPath); err != nil {
		// Fallback: copy + delete (e.g. S3 or unexpected cross-device)
		if cpErr := tm.driver.Copy(path, destPath, nil); cpErr != nil {
			return fmt.Errorf("trash move failed: %w, copy also failed: %w", err, cpErr)
		}
		if delErr := tm.driver.Delete(path); delErr != nil {
			return fmt.Errorf("trash cleanup failed: %w", delErr)
		}
	}

	// Write metadata
	meta := trashMeta{
		OriginalPath: path,
		DeletedAt:    time.Now().Unix(),
		IsDir:        info.IsDir,
		Size:         info.Size,
		Name:         info.Name,
	}
	metaBytes, _ := json.Marshal(meta)
	metaPath := filepath.Join(itemDir, ".meta.json")
	if err := tm.driver.Write(metaPath, metaBytes); err != nil {
		fmt.Printf("warning: failed to write trash metadata: %v\n", err)
	}

	return nil
}

// List returns all trashed items across all trash directories.
func (tm *TrashManager) List() ([]TrashItem, error) {
	var items []TrashItem

	for _, tDir := range tm.allTrashDirs() {
		entries, err := tm.driver.List(tDir)
		if err != nil {
			continue
		}
		for _, entry := range entries {
			if !entry.IsDir {
				continue
			}
			trashID := entry.Name
			metaPath := filepath.Join(tDir, trashID, ".meta.json")
			metaBytes, err := tm.driver.Read(metaPath)
			if err != nil {
				continue
			}
			var meta trashMeta
			if json.Unmarshal(metaBytes, &meta) != nil {
				continue
			}
			items = append(items, TrashItem{
				ID:           trashID,
				Name:         meta.Name,
				OriginalPath: meta.OriginalPath,
				IsDir:        meta.IsDir,
				Size:         meta.Size,
				DeletedAt:    meta.DeletedAt,
			})
		}
	}

	sort.Slice(items, func(i, j int) bool {
		return items[i].DeletedAt > items[j].DeletedAt
	})

	if items == nil {
		items = []TrashItem{}
	}
	return items, nil
}

// findTrashItem locates which trash directory contains the given trashID.
func (tm *TrashManager) findTrashItem(trashID string) (string, error) {
	for _, tDir := range tm.allTrashDirs() {
		metaPath := filepath.Join(tDir, trashID, ".meta.json")
		if _, err := tm.driver.Read(metaPath); err == nil {
			return tDir, nil
		}
	}
	return "", fmt.Errorf("trash item %s not found", trashID)
}

// Restore restores a trashed item to its original location.
// Returns the final restored path (may differ if original path is occupied).
func (tm *TrashManager) Restore(trashID string) (string, error) {
	tDir, err := tm.findTrashItem(trashID)
	if err != nil {
		return "", err
	}

	itemDir := filepath.Join(tDir, trashID)
	metaPath := filepath.Join(itemDir, ".meta.json")
	metaBytes, err := tm.driver.Read(metaPath)
	if err != nil {
		return "", fmt.Errorf("trash item not found: %w", err)
	}

	var meta trashMeta
	if err := json.Unmarshal(metaBytes, &meta); err != nil {
		return "", fmt.Errorf("invalid trash metadata: %w", err)
	}

	srcPath := filepath.Join(itemDir, meta.Name)
	destPath := meta.OriginalPath

	// Ensure parent directory exists
	parentDir := filepath.Dir(destPath)
	if parentDir != "" && parentDir != "." && parentDir != "/" {
		tm.driver.CreateDir(parentDir)
	}

	// If destination already exists, add a numeric suffix
	if _, statErr := tm.driver.Stat(destPath); statErr == nil {
		ext := filepath.Ext(meta.Name)
		base := strings.TrimSuffix(meta.Name, ext)
		parentDir := filepath.Dir(destPath)
		for i := 1; ; i++ {
			newName := fmt.Sprintf("%s (%d)%s", base, i, ext)
			destPath = filepath.Join(parentDir, newName)
			if _, statErr := tm.driver.Stat(destPath); statErr != nil {
				break
			}
		}
	}

	if err := tm.driver.Move(srcPath, destPath); err != nil {
		return "", fmt.Errorf("restore failed: %w", err)
	}

	// Clean up the trash item directory
	tm.driver.Delete(itemDir)
	return destPath, nil
}

// DeleteItem permanently deletes a single item from the trash.
func (tm *TrashManager) DeleteItem(trashID string) error {
	tDir, err := tm.findTrashItem(trashID)
	if err != nil {
		return err
	}
	return tm.driver.Delete(filepath.Join(tDir, trashID))
}

// Empty permanently deletes all items in all trash directories.
func (tm *TrashManager) Empty() error {
	var lastErr error
	for _, tDir := range tm.allTrashDirs() {
		if err := tm.driver.Delete(tDir); err != nil {
			lastErr = err
		}
	}
	return lastErr
}

// IsTrashDir returns true if the given directory name is a trash directory.
func IsTrashDir(name string) bool {
	return name == trashDirName
}
