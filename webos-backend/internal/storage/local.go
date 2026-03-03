package storage

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"
)

// LocalDriver implements Driver using the local filesystem.
// Paths starting with "~" are automatically expanded to the user's home directory.
type LocalDriver struct {
	uploadsDir string
	uploads    map[string]*localUploadSession
	uploadMu   sync.Mutex
}

// ExpandHome expands a leading "~" or "~/" to the user's home directory.
func ExpandHome(path string) string {
	if path == "~" {
		h, _ := os.UserHomeDir()
		if h != "" {
			return h
		}
		return path
	}
	if strings.HasPrefix(path, "~/") {
		h, _ := os.UserHomeDir()
		if h != "" {
			return filepath.Join(h, path[2:])
		}
	}
	return path
}

// NewLocalDriver creates a new LocalDriver.
// uploadsDir is the directory for chunked upload temp files.
func NewLocalDriver(uploadsDir string) *LocalDriver {
	d := &LocalDriver{
		uploadsDir: uploadsDir,
		uploads:    make(map[string]*localUploadSession),
	}
	d.recoverUploads()
	return d
}

func (d *LocalDriver) List(path string) ([]FileInfo, error) {
	path = ExpandHome(path)
	entries, err := os.ReadDir(path)
	if err != nil {
		return nil, err
	}

	var files []FileInfo
	for _, entry := range entries {
		fullPath := filepath.Join(path, entry.Name())
		isSymlink := false
		symlinkTarget := ""
		isDir := entry.IsDir()
		var size int64
		var modTime time.Time

		// 用 Lstat 检测符号链接（不跟随链接）
		if linfo, err := os.Lstat(fullPath); err == nil {
			if linfo.Mode()&os.ModeSymlink != 0 {
				isSymlink = true
				symlinkTarget, _ = os.Readlink(fullPath)
				// 跟随链接获取目标的真实属性
				if targetInfo, err := os.Stat(fullPath); err == nil {
					isDir = targetInfo.IsDir()
					size = targetInfo.Size()
					modTime = targetInfo.ModTime()
				} else {
					// 目标不可达（断链），用 lstat 信息兜底
					size = linfo.Size()
					modTime = linfo.ModTime()
				}
			} else {
				size = linfo.Size()
				modTime = linfo.ModTime()
			}
		} else {
			if info, err := entry.Info(); err == nil {
				size = info.Size()
				modTime = info.ModTime()
			} else {
				continue
			}
		}

		ext := ""
		if !isDir {
			ext = filepath.Ext(entry.Name())
		}
		files = append(files, FileInfo{
			Name:          entry.Name(),
			Path:          fullPath,
			IsDir:         isDir,
			Size:          size,
			Extension:     ext,
			ModifiedTime:  modTime,
			IsSymlink:     isSymlink,
			SymlinkTarget: symlinkTarget,
		})
	}
	return files, nil
}

func (d *LocalDriver) Read(path string) ([]byte, error) {
	return os.ReadFile(ExpandHome(path))
}

func (d *LocalDriver) Write(path string, content []byte) error {
	path = ExpandHome(path)
	if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
		return err
	}
	return os.WriteFile(path, content, 0644)
}

func (d *LocalDriver) CreateDir(path string) error {
	return os.MkdirAll(ExpandHome(path), 0755)
}

func (d *LocalDriver) Delete(path string) error {
	path = ExpandHome(path)
	// 符号链接只删链接本身，不跟随到目标
	if linfo, err := os.Lstat(path); err == nil && linfo.Mode()&os.ModeSymlink != 0 {
		return os.Remove(path)
	}
	return os.RemoveAll(path)
}

func (d *LocalDriver) Rename(oldPath, newPath string) error {
	return os.Rename(ExpandHome(oldPath), ExpandHome(newPath))
}

func (d *LocalDriver) Copy(srcPath, dstPath string, onProgress ProgressFunc) error {
	srcPath, dstPath = ExpandHome(srcPath), ExpandHome(dstPath)
	if err := os.MkdirAll(filepath.Dir(dstPath), 0755); err != nil {
		return err
	}
	return copyPath(srcPath, dstPath, onProgress)
}

func (d *LocalDriver) Move(srcPath, dstPath string) error {
	srcPath, dstPath = ExpandHome(srcPath), ExpandHome(dstPath)
	if err := os.MkdirAll(filepath.Dir(dstPath), 0755); err != nil {
		return err
	}
	if err := os.Rename(srcPath, dstPath); err != nil {
		if err := copyPath(srcPath, dstPath, nil); err != nil {
			return err
		}
		return os.RemoveAll(srcPath)
	}
	return nil
}

func (d *LocalDriver) Stat(path string) (*FileInfo, error) {
	path = ExpandHome(path)
	isSymlink := false
	symlinkTarget := ""

	// 先 Lstat 判断是否为符号链接
	linfo, err := os.Lstat(path)
	if err != nil {
		return nil, err
	}
	if linfo.Mode()&os.ModeSymlink != 0 {
		isSymlink = true
		symlinkTarget, _ = os.Readlink(path)
	}

	// Stat 跟随链接获取目标真实属性
	info, err := os.Stat(path)
	if err != nil {
		// 断链：用 lstat 信息兜底
		ext := ""
		if !linfo.IsDir() {
			ext = filepath.Ext(linfo.Name())
		}
		return &FileInfo{
			Name:          linfo.Name(),
			Path:          path,
			IsDir:         false,
			Size:          linfo.Size(),
			Extension:     ext,
			ModifiedTime:  linfo.ModTime(),
			IsSymlink:     isSymlink,
			SymlinkTarget: symlinkTarget,
		}, nil
	}

	ext := ""
	if !info.IsDir() {
		ext = filepath.Ext(info.Name())
	}
	return &FileInfo{
		Name:          info.Name(),
		Path:          path,
		IsDir:         info.IsDir(),
		Size:          info.Size(),
		Extension:     ext,
		ModifiedTime:  info.ModTime(),
		IsSymlink:     isSymlink,
		SymlinkTarget: symlinkTarget,
	}, nil
}

// DirSize calculates total size and item count using filepath.WalkDir.
func (d *LocalDriver) DirSize(ctx context.Context, dirPath string) (int64, int, error) {
	dirPath = ExpandHome(dirPath)
	var totalSize int64
	var count int
	err := filepath.WalkDir(dirPath, func(p string, entry fs.DirEntry, err error) error {
		if err != nil {
			return nil
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
		}
		if p == dirPath {
			return nil
		}
		count++
		if !entry.IsDir() {
			if info, e := entry.Info(); e == nil {
				totalSize += info.Size()
			}
		}
		return nil
	})
	if err != nil && err != context.Canceled {
		return totalSize, count, err
	}
	return totalSize, count, nil
}

func (d *LocalDriver) ReadStream(path string) (io.ReadCloser, *FileInfo, error) {
	path = ExpandHome(path)
	info, err := os.Stat(path)
	if err != nil {
		return nil, nil, err
	}
	if info.IsDir() {
		return nil, nil, fmt.Errorf("cannot read stream from directory")
	}
	f, err := os.Open(path)
	if err != nil {
		return nil, nil, err
	}
	return f, &FileInfo{
		Name:         info.Name(),
		Path:         path,
		IsDir:        false,
		Size:         info.Size(),
		Extension:    filepath.Ext(info.Name()),
		ModifiedTime: info.ModTime(),
	}, nil
}

func (d *LocalDriver) PresignGetURL(path string, expires time.Duration) (string, error) {
	return "", nil
}

func (d *LocalDriver) PresignPutURL(path string, expires time.Duration) (string, error) {
	return "", nil
}

func (d *LocalDriver) WriteStream(path string, reader io.Reader, size int64, onProgress ProgressFunc) error {
	path = ExpandHome(path)
	if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
		return err
	}
	f, err := os.Create(path)
	if err != nil {
		return err
	}
	defer f.Close()
	_, err = io.Copy(f, NewCountingReader(reader, size, onProgress))
	return err
}

// ==================== Copy helpers ====================

func copyPath(src, dst string, onProgress ProgressFunc) error {
	info, err := os.Stat(src)
	if err != nil {
		return err
	}
	if info.IsDir() {
		return copyDir(src, dst, onProgress)
	}
	return copyFile(src, dst, info.Size(), onProgress)
}

func copyFile(src, dst string, size int64, onProgress ProgressFunc) error {
	// Safety: never overwrite source with itself
	absSrc, err1 := filepath.Abs(src)
	absDst, err2 := filepath.Abs(dst)
	if err1 == nil && err2 == nil && absSrc == absDst {
		return fmt.Errorf("source and destination are the same file: %s", src)
	}
	sf, err := os.Open(src)
	if err != nil {
		return err
	}
	defer sf.Close()
	if err := os.MkdirAll(filepath.Dir(dst), 0755); err != nil {
		return err
	}
	df, err := os.Create(dst)
	if err != nil {
		return err
	}
	defer df.Close()
	_, err = io.Copy(df, NewCountingReader(sf, size, onProgress))
	return err
}

func copyDir(src, dst string, onProgress ProgressFunc) error {
	// Safety: prevent copying a directory into itself (infinite recursion)
	absSrc, err1 := filepath.Abs(src)
	absDst, err2 := filepath.Abs(dst)
	if err1 == nil && err2 == nil {
		if absSrc == absDst {
			return fmt.Errorf("source and destination are the same directory: %s", src)
		}
		// dst is inside src → infinite recursion
		if strings.HasPrefix(absDst, absSrc+string(filepath.Separator)) {
			return fmt.Errorf("cannot copy directory into itself: %s -> %s", src, dst)
		}
	}
	entries, err := os.ReadDir(src)
	if err != nil {
		return err
	}
	if err := os.MkdirAll(dst, 0755); err != nil {
		return err
	}
	for _, entry := range entries {
		srcPath := filepath.Join(src, entry.Name())
		dstPath := filepath.Join(dst, entry.Name())
		if entry.IsDir() {
			if err := copyDir(srcPath, dstPath, onProgress); err != nil {
				return err
			}
		} else {
			info, err := entry.Info()
			if err != nil {
				return err
			}
			if err := copyFile(srcPath, dstPath, info.Size(), onProgress); err != nil {
				return err
			}
		}
	}
	return nil
}

// ==================== ChunkedUploader implementation ====================

type localUploadSession struct {
	TargetPath string `json:"targetPath"`
	TotalSize  int64  `json:"totalSize"`
	TempDir    string `json:"-"`
}

type localUploadMeta struct {
	TargetPath string `json:"targetPath"`
	TotalSize  int64  `json:"totalSize"`
}

func (d *LocalDriver) recoverUploads() {
	entries, err := os.ReadDir(d.uploadsDir)
	if err != nil {
		return
	}
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		uploadID := entry.Name()
		metaPath := filepath.Join(d.uploadsDir, uploadID, "meta.json")
		data, err := os.ReadFile(metaPath)
		if err != nil {
			continue
		}
		var meta localUploadMeta
		if json.Unmarshal(data, &meta) != nil {
			continue
		}
		d.uploads[uploadID] = &localUploadSession{
			TargetPath: meta.TargetPath,
			TotalSize:  meta.TotalSize,
			TempDir:    filepath.Join(d.uploadsDir, uploadID),
		}
	}
}

func genUploadID() string {
	b := make([]byte, 8)
	rand.Read(b)
	return "upload_" + hex.EncodeToString(b)
}

func (d *LocalDriver) InitUpload(path string, size int64) (string, error) {
	path = ExpandHome(path)
	uploadID := genUploadID()
	tempDir := filepath.Join(d.uploadsDir, uploadID)
	if err := os.MkdirAll(tempDir, 0755); err != nil {
		return "", fmt.Errorf("create temp dir: %w", err)
	}
	meta := localUploadMeta{TargetPath: path, TotalSize: size}
	data, _ := json.Marshal(meta)
	if err := os.WriteFile(filepath.Join(tempDir, "meta.json"), data, 0644); err != nil {
		os.RemoveAll(tempDir)
		return "", fmt.Errorf("write meta: %w", err)
	}
	d.uploadMu.Lock()
	d.uploads[uploadID] = &localUploadSession{
		TargetPath: path,
		TotalSize:  size,
		TempDir:    tempDir,
	}
	d.uploadMu.Unlock()
	return uploadID, nil
}

func (d *LocalDriver) UploadChunk(uploadID string, partNum int, reader io.Reader, size int64) (*UploadedPart, error) {
	d.uploadMu.Lock()
	sess, ok := d.uploads[uploadID]
	d.uploadMu.Unlock()
	if !ok {
		return nil, fmt.Errorf("upload session %q not found", uploadID)
	}
	partPath := filepath.Join(sess.TempDir, fmt.Sprintf("part_%06d", partNum))
	f, err := os.Create(partPath)
	if err != nil {
		return nil, fmt.Errorf("create part file: %w", err)
	}
	defer f.Close()
	n, err := io.Copy(f, reader)
	if err != nil {
		os.Remove(partPath)
		return nil, fmt.Errorf("write part: %w", err)
	}
	return &UploadedPart{PartNum: partNum, Size: n}, nil
}

func (d *LocalDriver) CompleteUpload(uploadID string, _ []CompletedPart) error {
	d.uploadMu.Lock()
	sess, ok := d.uploads[uploadID]
	d.uploadMu.Unlock()
	if !ok {
		return fmt.Errorf("upload session %q not found", uploadID)
	}
	if err := os.MkdirAll(filepath.Dir(sess.TargetPath), 0755); err != nil {
		return fmt.Errorf("create target dir: %w", err)
	}
	entries, err := os.ReadDir(sess.TempDir)
	if err != nil {
		return fmt.Errorf("read temp dir: %w", err)
	}
	var parts []string
	for _, e := range entries {
		if strings.HasPrefix(e.Name(), "part_") {
			parts = append(parts, e.Name())
		}
	}
	sort.Strings(parts)
	dst, err := os.Create(sess.TargetPath)
	if err != nil {
		return fmt.Errorf("create target: %w", err)
	}
	defer dst.Close()
	for _, p := range parts {
		src, err := os.Open(filepath.Join(sess.TempDir, p))
		if err != nil {
			return fmt.Errorf("open part %s: %w", p, err)
		}
		_, err = io.Copy(dst, src)
		src.Close()
		if err != nil {
			return fmt.Errorf("copy part %s: %w", p, err)
		}
	}
	os.RemoveAll(sess.TempDir)
	d.uploadMu.Lock()
	delete(d.uploads, uploadID)
	d.uploadMu.Unlock()
	return nil
}

func (d *LocalDriver) AbortUpload(uploadID string) error {
	d.uploadMu.Lock()
	sess, ok := d.uploads[uploadID]
	if ok {
		delete(d.uploads, uploadID)
	}
	d.uploadMu.Unlock()
	if !ok {
		return fmt.Errorf("upload session %q not found", uploadID)
	}
	return os.RemoveAll(sess.TempDir)
}

func (d *LocalDriver) ListUploadedParts(uploadID string) ([]UploadedPart, error) {
	d.uploadMu.Lock()
	sess, ok := d.uploads[uploadID]
	d.uploadMu.Unlock()
	if !ok {
		return nil, fmt.Errorf("upload session %q not found", uploadID)
	}
	entries, err := os.ReadDir(sess.TempDir)
	if err != nil {
		return nil, err
	}
	var result []UploadedPart
	for _, e := range entries {
		if !strings.HasPrefix(e.Name(), "part_") {
			continue
		}
		var partNum int
		fmt.Sscanf(e.Name(), "part_%d", &partNum)
		info, err := e.Info()
		if err != nil {
			continue
		}
		result = append(result, UploadedPart{PartNum: partNum, Size: info.Size()})
	}
	sort.Slice(result, func(i, j int) bool { return result[i].PartNum < result[j].PartNum })
	return result, nil
}
