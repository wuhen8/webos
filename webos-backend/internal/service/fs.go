package service

import (
	"archive/tar"
	"archive/zip"
	"compress/bzip2"
	"compress/gzip"
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"encoding/json"
	"fmt"
	"io"
	"mime"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"webos-backend/internal/database"
	"webos-backend/internal/storage"
)

// Archive extraction errors
var (
	ErrPasswordRequired   = errors.New("archive is encrypted and requires a password")
	ErrPasswordIncorrect  = errors.New("incorrect password for encrypted archive")
)

// FileService handles file system business logic
type FileService struct{}

// NewFileService creates a new FileService instance
func NewFileService() *FileService {
	return &FileService{}
}
// CheckArchivePassword checks if an archive requires a password.
// Supports zip, rar, and 7z formats via archiveIsEncrypted.
func (s *FileService) CheckArchivePassword(nodeID, filePath string) (bool, error) {
	driver, err := storage.GetDriver(nodeID)
	if err != nil {
		return false, err
	}
	if _, ok := driver.(*storage.LocalDriver); !ok {
		return false, fmt.Errorf("extract is only supported for local storage")
	}
	ext := strings.ToLower(filepath.Ext(filePath))
	if ext == ".zip" || ext == ".rar" || ext == ".7z" {
		return archiveIsEncrypted(filePath, ext)
	}
	return false, nil
}
// VerifyArchivePassword tests whether the given password can unlock an encrypted archive.
// Returns nil if password is correct, ErrPasswordIncorrect if wrong, or other errors.
// Uses lightweight test commands (list/test) that don't actually extract files.
func (s *FileService) VerifyArchivePassword(nodeID, filePath, password string) error {
	driver, err := storage.GetDriver(nodeID)
	if err != nil {
		return err
	}
	if _, ok := driver.(*storage.LocalDriver); !ok {
		return fmt.Errorf("extract is only supported for local storage")
	}

	ext := strings.ToLower(filepath.Ext(filePath))
	var cmd *exec.Cmd
	var toolName string

	switch ext {
	case ".zip":
		toolName = "unzip"
		// unzip -t -P <password> tests the archive without extracting
		cmd = exec.Command("unzip", "-t", "-P", password, filePath)
	case ".rar":
		toolName = "unrar"
		// unrar t -p<password> tests the archive
		cmd = exec.Command("unrar", "t", "-p"+password, filePath)
	case ".7z":
		toolName = "7z"
		// 7z t -p<password> tests the archive
		cmd = exec.Command("7z", "t", "-p"+password, filePath)
	default:
		return nil // non-encrypted format, skip verification
	}

	if _, err := exec.LookPath(toolName); err != nil {
		return nil // tool not found, skip verification and let Extract handle it
	}

	output, err := cmd.CombinedOutput()
	if err != nil {
		errMsg := strings.ToLower(string(output))
		if strings.Contains(errMsg, "wrong password") || strings.Contains(errMsg, "incorrect password") ||
			strings.Contains(errMsg, "data error") || strings.Contains(errMsg, "crc failed") {
			return ErrPasswordIncorrect
		}
		// unzip exit code 1 = warnings, password is fine
		if toolName == "unzip" {
			if exitErr, ok := err.(*exec.ExitError); ok && exitErr.ExitCode() == 1 {
				return nil
			}
		}
		// Other errors — don't block, let Extract handle it
		return nil
	}
	return nil
}

// List returns a sorted list of files in the given path
func (s *FileService) List(nodeID, path string) ([]storage.FileInfo, error) {
	driver, err := storage.GetDriver(nodeID)
	if err != nil {
		return nil, err
	}

	if path == "" {
		path = "/"
	}

	files, err := driver.List(path)
	if err != nil {
		return nil, err
	}

	if files == nil {
		files = []storage.FileInfo{}
	}

	// Hide .trash directory from listings
	filtered := files[:0]
	for _, f := range files {
		if !IsTrashDir(f.Name) {
			filtered = append(filtered, f)
		}
	}
	files = filtered

	// Sort: directories first, then by name
	sort.Slice(files, func(i, j int) bool {
		if files[i].IsDir && !files[j].IsDir {
			return true
		}
		if !files[i].IsDir && files[j].IsDir {
			return false
		}
		return files[i].Name < files[j].Name
	})

	return files, nil
}

// Read reads the content of a file
func (s *FileService) Read(nodeID, path string) ([]byte, error) {
	driver, err := storage.GetDriver(nodeID)
	if err != nil {
		return nil, err
	}

	return driver.Read(path)
}

// Write writes content to a file
func (s *FileService) Write(nodeID, path string, content []byte) error {
	driver, err := storage.GetDriver(nodeID)
	if err != nil {
		return err
	}

	if err := driver.Write(path, content); err != nil {
		return err
	}

	normalizedPath := storage.NormalizePath(path)
	IndexAdd(nodeID, storage.FileInfo{
		Name: filepath.Base(path), Path: normalizedPath, IsDir: false,
		Size: int64(len(content)), Extension: filepath.Ext(path), ModifiedTime: time.Now(),
	})
	return nil
}

// CreateDir creates a new directory
func (s *FileService) CreateDir(nodeID, path, name string) (string, error) {
	driver, err := storage.GetDriver(nodeID)
	if err != nil {
		return "", err
	}

	fullPath := filepath.Join(path, name)
	normalizedPath := storage.NormalizePath(fullPath)
	if err := driver.CreateDir(fullPath); err != nil {
		return "", err
	}

	IndexAdd(nodeID, storage.FileInfo{
		Name: name, Path: normalizedPath, IsDir: true, ModifiedTime: time.Now(),
	})
	return normalizedPath, nil
}

// Delete moves a file or directory to the trash instead of permanently deleting it.
func (s *FileService) Delete(nodeID, path string) error {
	tm, err := NewTrashManager(nodeID)
	if err != nil {
		return err
	}
	if err := tm.MoveToTrash(path); err != nil {
		return err
	}
	IndexDelete(nodeID, path)
	return nil
}

// PermanentDelete permanently deletes a file or directory (bypasses trash).
func (s *FileService) PermanentDelete(nodeID, path string) error {
	driver, err := storage.GetDriver(nodeID)
	if err != nil {
		return err
	}
	if err := driver.Delete(path); err != nil {
		return err
	}
	IndexDelete(nodeID, path)
	return nil
}

// ListTrash returns all items in the trash for a given storage node.
func (s *FileService) ListTrash(nodeID string) ([]TrashItem, error) {
	tm, err := NewTrashManager(nodeID)
	if err != nil {
		return nil, err
	}
	return tm.List()
}

// RestoreFromTrash restores a trashed item to its original location.
func (s *FileService) RestoreFromTrash(nodeID, trashID string) (string, error) {
	tm, err := NewTrashManager(nodeID)
	if err != nil {
		return "", err
	}
	destPath, err := tm.Restore(trashID)
	if err != nil {
		return "", err
	}
	IndexRefreshDir(nodeID, filepath.Dir(destPath))
	return destPath, nil
}

// TrashDelete permanently deletes a single item from the trash.
func (s *FileService) TrashDelete(nodeID, trashID string) error {
	tm, err := NewTrashManager(nodeID)
	if err != nil {
		return err
	}
	return tm.DeleteItem(trashID)
}

// EmptyTrash permanently deletes all items in the trash.
func (s *FileService) EmptyTrash(nodeID string) error {
	tm, err := NewTrashManager(nodeID)
	if err != nil {
		return err
	}
	return tm.Empty()
}

// Rename renames a file or directory
func (s *FileService) Rename(nodeID, path, oldName, newName string) (string, error) {
	driver, err := storage.GetDriver(nodeID)
	if err != nil {
		return "", err
	}

	oldPath := filepath.Join(path, oldName)
	newPath := filepath.Join(path, newName)

	if err := driver.Rename(oldPath, newPath); err != nil {
		return "", err
	}

	IndexRename(nodeID, oldPath, newPath)
	return storage.NormalizePath(newPath), nil
}

// Copy copies a file or directory
func (s *FileService) Copy(nodeID, from, to string, onProgress storage.ProgressFunc) (string, error) {
	driver, err := storage.GetDriver(nodeID)
	if err != nil {
		return "", err
	}

	dstPath := filepath.Join(to, filepath.Base(from))

	// Resolve to absolute paths for reliable comparison
	absSrc, err1 := filepath.Abs(from)
	absDst, err2 := filepath.Abs(dstPath)
	if err1 == nil && err2 == nil && absSrc == absDst {
		// Same path: generate a deduplicated name like "name (副本)", "name (副本 2)", etc.
		dstPath = deduplicatePath(dstPath)
	}

	if err := driver.Copy(from, dstPath, onProgress); err != nil {
		return "", err
	}

	IndexRefreshDir(nodeID, to)
	return storage.NormalizePath(dstPath), nil
}

// deduplicatePath generates a non-conflicting path by appending " (副本)", " (副本 2)", etc.
func deduplicatePath(p string) string {
	dir := filepath.Dir(p)
	base := filepath.Base(p)

	// Check if this is a directory (no extension splitting for dirs)
	info, statErr := os.Stat(p)
	isDir := statErr == nil && info.IsDir()

	var name, ext string
	if isDir {
		// Directories: don't split on extension
		name = base
		ext = ""
	} else {
		ext = filepath.Ext(base)
		name = strings.TrimSuffix(base, ext)
		// Handle dotfiles like ".gitignore" where ext would eat the whole name
		if name == "" {
			name = base
			ext = ""
		}
	}

	for i := 1; ; i++ {
		var suffix string
		if i == 1 {
			suffix = " (副本)"
		} else {
			suffix = fmt.Sprintf(" (副本 %d)", i)
		}
		candidate := filepath.Join(dir, name+suffix+ext)
		if _, err := os.Stat(candidate); os.IsNotExist(err) {
			return candidate
		}
	}
}

// Move moves a file or directory
func (s *FileService) Move(nodeID, from, to string) (string, error) {
	driver, err := storage.GetDriver(nodeID)
	if err != nil {
		return "", err
	}

	dstPath := filepath.Join(to, filepath.Base(from))

	// Same path: nothing to do
	absSrc, err1 := filepath.Abs(from)
	absDst, err2 := filepath.Abs(dstPath)
	if err1 == nil && err2 == nil && absSrc == absDst {
		return storage.NormalizePath(dstPath), nil
	}

	if err := driver.Move(from, dstPath); err != nil {
		return "", err
	}

	IndexDelete(nodeID, from)
	IndexRefreshDir(nodeID, to)
	return storage.NormalizePath(dstPath), nil
}

// CreateFile creates a new empty file
func (s *FileService) CreateFile(nodeID, path, name string) (string, error) {
	driver, err := storage.GetDriver(nodeID)
	if err != nil {
		return "", err
	}

	fullPath := filepath.Join(path, name)
	normalizedPath := storage.NormalizePath(fullPath)
	if err := driver.Write(fullPath, []byte("")); err != nil {
		return "", err
	}

	IndexAdd(nodeID, storage.FileInfo{
		Name: name, Path: normalizedPath, IsDir: false,
		Size: 0, Extension: filepath.Ext(name), ModifiedTime: time.Now(),
	})
	return normalizedPath, nil
}

// Upload uploads a file from a stream
func (s *FileService) Upload(nodeID, path, filename string, reader io.Reader, size int64, onProgress storage.ProgressFunc) (string, error) {
	driver, err := storage.GetDriver(nodeID)
	if err != nil {
		return "", err
	}

	uploadPath := filepath.Join(path, filename)
	normalizedPath := storage.NormalizePath(uploadPath)
	if err := driver.WriteStream(uploadPath, reader, size, onProgress); err != nil {
		return "", err
	}

	IndexAdd(nodeID, storage.FileInfo{
		Name: filename, Path: normalizedPath, IsDir: false,
		Size: size, Extension: filepath.Ext(filename), ModifiedTime: time.Now(),
	})
	return normalizedPath, nil
}

// CopyAcross copies a file from one storage node to another via streaming.
// Only supports files (not directories).
func (s *FileService) CopyAcross(srcNodeID, srcPath, dstNodeID, dstPath string, onProgress storage.ProgressFunc) error {
	srcDriver, err := storage.GetDriver(srcNodeID)
	if err != nil {
		return fmt.Errorf("source driver: %w", err)
	}
	dstDriver, err := storage.GetDriver(dstNodeID)
	if err != nil {
		return fmt.Errorf("dest driver: %w", err)
	}

	reader, info, err := srcDriver.ReadStream(srcPath)
	if err != nil {
		return fmt.Errorf("read source: %w", err)
	}
	defer reader.Close()

	if info.IsDir {
		return fmt.Errorf("cross-storage copy does not support directories")
	}

	target := filepath.Join(dstPath, filepath.Base(srcPath))
	if err := dstDriver.WriteStream(target, reader, info.Size, onProgress); err != nil {
		return fmt.Errorf("write dest: %w", err)
	}

	IndexRefreshDir(dstNodeID, dstPath)
	return nil
}

// MoveAcross moves a file from one storage node to another (copy + delete source).
// Only supports files (not directories).
func (s *FileService) MoveAcross(srcNodeID, srcPath, dstNodeID, dstPath string, onProgress storage.ProgressFunc) error {
	if err := s.CopyAcross(srcNodeID, srcPath, dstNodeID, dstPath, onProgress); err != nil {
		return err
	}
	srcDriver, err := storage.GetDriver(srcNodeID)
	if err != nil {
		return fmt.Errorf("delete source driver: %w", err)
	}
	if err := srcDriver.Delete(srcPath); err != nil {
		return err
	}

	IndexDelete(srcNodeID, srcPath)
	return nil
}

// Search queries the FTS5 index for files matching the keyword.
// If basePath is not "/", results are filtered to that subtree.
func (s *FileService) Search(nodeID, basePath, keyword string, limit int) ([]storage.FileInfo, error) {
	if basePath == "" {
		basePath = "/"
	}
	if limit <= 0 {
		limit = 50
	}

	results, err := SearchIndex(nodeID, keyword, limit)
	if err != nil {
		return nil, err
	}

	// Filter by basePath if not root
	if basePath != "/" {
		prefix := basePath
		if !strings.HasSuffix(prefix, "/") {
			prefix += "/"
		}
		filtered := results[:0]
		for _, f := range results {
			if strings.HasPrefix(f.Path, prefix) {
				filtered = append(filtered, f)
			}
		}
		results = filtered
	}

	return results, nil
}

// StatBasic returns file metadata without computing directory size.
func (s *FileService) StatBasic(nodeID, path string) (*storage.FileInfo, error) {
	driver, err := storage.GetDriver(nodeID)
	if err != nil {
		return nil, err
	}
	return driver.Stat(path)
}

// Stat returns file metadata. For directories it also computes total size and item count.
func (s *FileService) Stat(nodeID, path string) (*storage.FileInfo, error) {
	info, err := s.StatBasic(nodeID, path)
	if err != nil {
		return nil, err
	}
	if info.IsDir {
		totalSize, itemCount := s.CalcDirSize(context.Background(), nodeID, path)
		info.Size = totalSize
		info.ItemCount = &itemCount
	}
	return info, nil
}

// CalcDirSize recursively calculates total size and item count of a directory.
// For LocalDriver it uses filepath.WalkDir (less GC pressure).
// It respects the provided context for cancellation.
func (s *FileService) CalcDirSize(ctx context.Context, nodeID, dirPath string) (int64, int) {
	driver, err := storage.GetDriver(nodeID)
	if err != nil {
		return 0, 0
	}
	// Use optimized DirSize if available (LocalDriver)
	if ld, ok := driver.(*storage.LocalDriver); ok {
		size, count, _ := ld.DirSize(ctx, dirPath)
		return size, count
	}
	return s.calcDirSizeRecursive(ctx, driver, dirPath)
}

func (s *FileService) calcDirSizeRecursive(ctx context.Context, driver storage.Driver, dirPath string) (int64, int) {
	select {
	case <-ctx.Done():
		return 0, 0
	default:
	}
	files, err := driver.List(dirPath)
	if err != nil {
		return 0, 0
	}
	var totalSize int64
	var count int
	for _, f := range files {
		select {
		case <-ctx.Done():
			return totalSize, count
		default:
		}
		count++
		if f.IsDir {
			subSize, subCount := s.calcDirSizeRecursive(ctx, driver, f.Path)
			totalSize += subSize
			count += subCount
		} else {
			totalSize += f.Size
		}
	}
	return totalSize, count
}

// BatchDelete deletes multiple paths and returns the number of successfully deleted items.
// BatchDelete moves multiple paths to trash and returns the number of successfully trashed items.
func (s *FileService) BatchDelete(nodeID string, paths []string) (int, error) {
	deleted := 0
	var lastErr error
	for _, p := range paths {
		if err := s.Delete(nodeID, p); err != nil {
			lastErr = err
		} else {
			deleted++
		}
	}
	if lastErr != nil && deleted < len(paths) {
		return deleted, fmt.Errorf("deleted %d/%d, last error: %w", deleted, len(paths), lastErr)
	}
	return deleted, nil
}

// Download returns a reader for downloading a file
func (s *FileService) Download(nodeID, path string) (io.ReadCloser, *storage.FileInfo, error) {
	driver, err := storage.GetDriver(nodeID)
	if err != nil {
		return nil, nil, err
	}

	return driver.ReadStream(path)
}

// PresignGetURL generates a presigned URL for downloading
func (s *FileService) PresignGetURL(nodeID, path string, expires time.Duration) (string, error) {
	driver, err := storage.GetDriver(nodeID)
	if err != nil {
		return "", err
	}

	return driver.PresignGetURL(path, expires)
}

// PresignPutURL generates a presigned URL for uploading
func (s *FileService) PresignPutURL(nodeID, path string, expires time.Duration) (string, error) {
	driver, err := storage.GetDriver(nodeID)
	if err != nil {
		return "", err
	}

	return driver.PresignPutURL(path, expires)
}

// ProgressCallback is called during extraction to report progress.
// progress: 0.0 - 1.0, message: current file being extracted
type ProgressCallback func(progress float64, message string)

// Extract extracts an archive file to the specified destination directory.
// Supports .zip, .rar, .tar, .tar.gz/.tgz, .tar.bz2, .tar.xz, .7z
// For encrypted archives (.rar, .7z, .zip), provide the password parameter.
// The onProgress callback is called periodically to report extraction progress.
func (s *FileService) Extract(nodeID, filePath, destDir, password string, onProgress ProgressCallback) error {
	driver, err := storage.GetDriver(nodeID)
	if err != nil {
		return err
	}

	// Only local driver is supported
	if _, ok := driver.(*storage.LocalDriver); !ok {
		return fmt.Errorf("extract is only supported for local storage")
	}

	absPath := filePath
	absDest := destDir

	ext := strings.ToLower(filepath.Ext(absPath))
	name := strings.ToLower(filepath.Base(absPath))

	// Formats that support encryption — pre-check before running commands
	if ext == ".zip" || ext == ".rar" || ext == ".7z" {
		encrypted, checkErr := archiveIsEncrypted(absPath, ext)
		if checkErr != nil {
			return checkErr
		}
		if encrypted && password == "" {
			return ErrPasswordRequired
		}
		// Non-encrypted zip can use Go stdlib (fast, no external deps)
		if ext == ".zip" && !encrypted {
			err = extractZip(absPath, absDest, onProgress)
		} else {
			err = extractWithSystemCmd(absPath, absDest, password)
		}
	} else {
		// Formats without encryption support
		switch {
		case name == ".tar" || ext == ".tar":
			err = extractTar(absPath, absDest, "", onProgress)
		case ext == ".gz" || ext == ".tgz":
			err = extractTar(absPath, absDest, "gz", onProgress)
		case ext == ".bz2":
			err = extractTar(absPath, absDest, "bz2", onProgress)
		default:
			// xz, zst, etc.
			err = extractWithSystemCmd(absPath, absDest, password)
		}
	}

	if err != nil {
		return err
	}

	IndexRefreshDir(nodeID, destDir)
	return nil
}

// Compress creates a ZIP archive from the given source paths.
// The output file is written to outputPath (relative to storage root).
func (s *FileService) Compress(nodeID string, paths []string, outputPath string, onProgress ProgressCallback) error {
	driver, err := storage.GetDriver(nodeID)
	if err != nil {
		return err
	}

	if _, ok := driver.(*storage.LocalDriver); !ok {
		return fmt.Errorf("压缩功能仅支持本地存储")
	}

	absOutput := outputPath
	absPaths := paths

	if err := compressZip(absPaths, absOutput, onProgress); err != nil {
		return err
	}

	// Index the newly created archive file.
	info, statErr := os.Stat(absOutput)
	if statErr == nil {
		IndexAdd(nodeID, storage.FileInfo{
			Name: filepath.Base(outputPath), Path: outputPath, IsDir: false,
			Size: info.Size(), Extension: filepath.Ext(outputPath), ModifiedTime: info.ModTime(),
		})
	}
	return nil
}

func compressZip(sources []string, dest string, onProgress ProgressCallback) error {
	outFile, err := os.Create(dest)
	if err != nil {
		return fmt.Errorf("failed to create zip file: %w", err)
	}
	defer outFile.Close()

	w := zip.NewWriter(outFile)
	defer w.Close()

	// First, count total files to compress
	totalFiles := 0
	for _, src := range sources {
		info, err := os.Stat(src)
		if err != nil {
			return fmt.Errorf("failed to stat %s: %w", src, err)
		}
		if !info.IsDir() {
			totalFiles++
		} else {
			filepath.WalkDir(src, func(path string, d os.DirEntry, err error) error {
				if err == nil && !d.IsDir() {
					totalFiles++
				}
				return nil
			})
		}
	}

	processedFiles := 0
	for _, src := range sources {
		info, err := os.Stat(src)
		if err != nil {
			return fmt.Errorf("failed to stat %s: %w", src, err)
		}

		if !info.IsDir() {
			if err := addFileToZip(w, src, filepath.Base(src)); err != nil {
				return err
			}
			processedFiles++
			if onProgress != nil && totalFiles > 0 {
				onProgress(float64(processedFiles)/float64(totalFiles), filepath.Base(src))
			}
			continue
		}

		baseDir := filepath.Dir(src)
		err = filepath.WalkDir(src, func(path string, d os.DirEntry, err error) error {
			if err != nil {
				return err
			}
			relPath, err := filepath.Rel(baseDir, path)
			if err != nil {
				return err
			}
			if d.IsDir() {
				_, err := w.Create(relPath + "/")
				return err
			}
			if err := addFileToZip(w, path, relPath); err != nil {
				return err
			}
			processedFiles++
			if onProgress != nil && totalFiles > 0 {
				onProgress(float64(processedFiles)/float64(totalFiles), filepath.Base(path))
			}
			return nil
		})
		if err != nil {
			return err
		}
	}
	return nil
}

func addFileToZip(w *zip.Writer, filePath, zipPath string) error {
	file, err := os.Open(filePath)
	if err != nil {
		return err
	}
	defer file.Close()

	info, err := file.Stat()
	if err != nil {
		return err
	}

	header, err := zip.FileInfoHeader(info)
	if err != nil {
		return err
	}
	header.Name = zipPath
	header.Method = zip.Deflate

	writer, err := w.CreateHeader(header)
	if err != nil {
		return err
	}

	_, err = io.Copy(writer, file)
	return err
}

func extractZip(src, dest string, onProgress ProgressCallback) error {
	r, err := zip.OpenReader(src)
	if err != nil {
		return fmt.Errorf("failed to open zip: %w", err)
	}
	defer r.Close()

	totalFiles := len(r.File)

	for i, f := range r.File {
		target := filepath.Join(dest, f.Name)
		// Prevent zip slip
		if !strings.HasPrefix(filepath.Clean(target), filepath.Clean(dest)+string(os.PathSeparator)) && filepath.Clean(target) != filepath.Clean(dest) {
			continue
		}

		if f.FileInfo().IsDir() {
			os.MkdirAll(target, 0755)
			continue
		}

		if err := os.MkdirAll(filepath.Dir(target), 0755); err != nil {
			return err
		}

		rc, err := f.Open()
		if err != nil {
			return err
		}

		outFile, err := os.Create(target)
		if err != nil {
			rc.Close()
			return err
		}

		_, err = io.Copy(outFile, rc)
		outFile.Close()
		rc.Close()
		if err != nil {
			return err
		}

		// Report progress
		if onProgress != nil && totalFiles > 0 {
			progress := float64(i+1) / float64(totalFiles)
			onProgress(progress, f.Name)
		}
	}
	return nil
}
// zipIsEncrypted checks if any file in the zip archive is encrypted.
// archiveIsEncrypted checks if an archive file is encrypted.
// Supports zip (Go stdlib), rar and 7z (via system commands).
func archiveIsEncrypted(src, ext string) (bool, error) {
	switch ext {
	case ".zip":
		r, err := zip.OpenReader(src)
		if err != nil {
			return false, fmt.Errorf("failed to open zip: %w", err)
		}
		defer r.Close()
		for _, f := range r.File {
			if f.Flags&0x1 != 0 {
				return true, nil
			}
		}
		return false, nil

	case ".rar":
		// unrar lt -p- lists files; encrypted archives print "*" prefix or error out
		tool := "unrar"
		if _, err := exec.LookPath(tool); err != nil {
			return false, fmt.Errorf("tool '%s' not found, please install it first (e.g., apt-get install %s)", tool, getPackageName(tool))
		}
		cmd := exec.Command("unrar", "lt", "-p-", src)
		output, err := cmd.CombinedOutput()
		if err != nil {
			msg := strings.ToLower(string(output))
			if strings.Contains(msg, "encrypted") || strings.Contains(msg, "password") {
				return true, nil
			}
		}
		// Also check output for encryption flags
		if strings.Contains(string(output), "encrypted") {
			return true, nil
		}
		return false, nil

	case ".7z":
		// 7z l -slt lists file properties; encrypted files have "Encrypted = +"
		tool := "7z"
		if _, err := exec.LookPath(tool); err != nil {
			return false, fmt.Errorf("tool '%s' not found, please install it first (e.g., apt-get install %s)", tool, getPackageName(tool))
		}
		cmd := exec.Command("7z", "l", "-slt", src)
		output, err := cmd.CombinedOutput()
		outStr := string(output)
		if err != nil {
			msg := strings.ToLower(outStr)
			// 7z errors out on header-encrypted archives
			if strings.Contains(msg, "encrypted") || strings.Contains(msg, "password") || strings.Contains(msg, "wrong password") {
				return true, nil
			}
		}
		// Check for "Encrypted = +" in listing output (file-level encryption)
		if strings.Contains(outStr, "Encrypted = +") {
			return true, nil
		}
		return false, nil
	}

	return false, nil
}

func extractTar(src, dest, compression string, onProgress ProgressCallback) error {
	f, err := os.Open(src)
	if err != nil {
		return fmt.Errorf("failed to open archive: %w", err)
	}
	defer f.Close()

	var reader io.Reader = f

	switch compression {
	case "gz":
		gr, err := gzip.NewReader(f)
		if err != nil {
			return fmt.Errorf("failed to create gzip reader: %w", err)
		}
		defer gr.Close()
		reader = gr
	case "bz2":
		reader = bzip2.NewReader(f)
	}

	tr := tar.NewReader(reader)
	fileCount := 0
	for {
		header, err := tr.Next()
		if err == io.EOF {
			break
		}
		if err != nil {
			return fmt.Errorf("tar read error: %w", err)
		}

		target := filepath.Join(dest, header.Name)
		// Prevent tar slip
		if !strings.HasPrefix(filepath.Clean(target), filepath.Clean(dest)+string(os.PathSeparator)) && filepath.Clean(target) != filepath.Clean(dest) {
			continue
		}

		switch header.Typeflag {
		case tar.TypeDir:
			os.MkdirAll(target, 0755)
		case tar.TypeReg:
			if err := os.MkdirAll(filepath.Dir(target), 0755); err != nil {
				return err
			}
			outFile, err := os.Create(target)
			if err != nil {
				return err
			}
			_, err = io.Copy(outFile, tr)
			outFile.Close()
			if err != nil {
				return err
			}

			// Report progress (indeterminate for tar since we don't know total count)
			if onProgress != nil {
				fileCount++
				onProgress(-1, header.Name) // -1 means indeterminate
			}
		}
	}
	return nil
}

// extractWithSystemCmd uses system commands to extract archives.
// Supports .zip (with password), .rar, .7z, .tar.xz, .tar.zst, etc.
func extractWithSystemCmd(src, dest, password string) error {
	ext := strings.ToLower(filepath.Ext(src))
	name := strings.ToLower(filepath.Base(src))

	var cmd *exec.Cmd
	var toolName string

	switch {
	case ext == ".zip":
		toolName = "unzip"
		if password != "" {
			cmd = exec.Command("unzip", "-o", "-P", password, src, "-d", dest)
		} else {
			cmd = exec.Command("unzip", "-o", src, "-d", dest)
		}

	case ext == ".rar":
		toolName = "unrar"
		if password != "" {
			cmd = exec.Command("unrar", "x", "-o+", "-p"+password, src, dest+"/")
		} else {
			cmd = exec.Command("unrar", "x", "-o+", src, dest+"/")
		}

	case ext == ".7z":
		toolName = "7z"
		args := []string{"x", src, "-o" + dest, "-aoa"}
		if password != "" {
			args = append(args, "-p"+password)
		}
		cmd = exec.Command("7z", args...)

	case ext == ".xz" || (ext == ".tar" && strings.HasSuffix(name, ".tar.xz")):
		toolName = "tar"
		cmd = exec.Command("tar", "-xJf", src, "-C", dest)

	case ext == ".zst" || (ext == ".tar" && strings.HasSuffix(name, ".tar.zst")):
		toolName = "tar"
		cmd = exec.Command("tar", "--zstd", "-xf", src, "-C", dest)

	default:
		return fmt.Errorf("unsupported archive format: %s", ext)
	}

	// Check if tool is available
	if _, err := exec.LookPath(toolName); err != nil {
		return fmt.Errorf("tool '%s' not found, please install it first (e.g., apt-get install %s)", toolName, getPackageName(toolName))
	}

	// Create destination directory
	if err := os.MkdirAll(dest, 0755); err != nil {
		return fmt.Errorf("failed to create destination directory: %w", err)
	}

	// Run command
	output, err := cmd.CombinedOutput()
	if err != nil {
		exitCode := -1
		if exitErr, ok := err.(*exec.ExitError); ok {
			exitCode = exitErr.ExitCode()
		}

		errMsg := strings.ToLower(string(output))

		// Wrong password — the pre-check confirmed encryption, so this means password is incorrect
		if strings.Contains(errMsg, "wrong password") || strings.Contains(errMsg, "incorrect password") ||
			strings.Contains(errMsg, "data error") || strings.Contains(errMsg, "crc failed") {
			return ErrPasswordIncorrect
		}

		// unzip exit code 1 = warnings only, files extracted fine
		if toolName == "unzip" && exitCode == 1 {
			return nil
		}

		return fmt.Errorf("extraction failed: %s", string(output))
	}

	return nil
}

// getPackageName returns the package name for installation hint
func getPackageName(tool string) string {
	packages := map[string]string{
		"unzip": "unzip",
		"unrar": "unrar",
		"7z":    "p7zip-full",
		"tar":   "tar",
	}
	if pkg, ok := packages[tool]; ok {
		return pkg
	}
	return tool
}

// ==================== Share Links ====================

// CreateShareLink generates a share token, persists it, and returns the token + external URL.
// expireSeconds: 0 means no expiry; >0 means expires after that many seconds from now.
func CreateShareLink(nodeID, sharePath string, expireSeconds int64) (map[string]string, error) {
	// Delete existing share link for this file (so we always create fresh with new expiry)
	existing, err := database.GetShareLinkByFile(nodeID, sharePath)
	if err == nil && existing != nil {
		database.DeleteShareLink(existing.Token)
	}

	// Generate token
	b := make([]byte, 16)
	rand.Read(b)
	token := hex.EncodeToString(b)

	filename := filepath.Base(sharePath)
	now := time.Now().Unix()

	row := database.ShareLinkRow{
		Token:     token,
		NodeID:    nodeID,
		Path:      sharePath,
		Filename:  filename,
		CreatedAt: now,
	}
	if expireSeconds > 0 {
		exp := now + expireSeconds
		row.ExpiresAt = &exp
	}
	if err := database.InsertShareLink(row); err != nil {
		return nil, fmt.Errorf("创建分享链接失败: %w", err)
	}

	result := map[string]string{"token": token}

	// Try to build external URL (may fail if externalHost not configured)
	if u, err := BuildShareURL(token, nodeID); err == nil {
		result["url"] = u
	}

	return result, nil
}

// BuildShareURL reads the node's externalHost config and constructs the public URL.
func BuildShareURL(token, nodeID string) (string, error) {
	nodes, err := database.ListStorageNodes()
	if err != nil {
		return "", fmt.Errorf("读取存储节点失败: %w", err)
	}

	var externalHost string
	for _, n := range nodes {
		if n.ID == nodeID {
			var cfg map[string]interface{}
			if json.Unmarshal([]byte(n.Config), &cfg) == nil {
				if v, ok := cfg["externalHost"].(string); ok {
					externalHost = v
				}
			}
			break
		}
	}

	if externalHost == "" {
		return "", fmt.Errorf("该存储节点未配置外部访问地址 (externalHost)")
	}

	return externalHost + "/api/share/" + token, nil
}

// DeleteShareLink deletes a share link by token.
func DeleteShareLink(token string) error {
	return database.DeleteShareLink(token)
}

// ListShareLinks returns all share links with external URLs.
func ListShareLinks() ([]map[string]interface{}, error) {
	links, err := database.ListShareLinks()
	if err != nil {
		return nil, err
	}
	result := make([]map[string]interface{}, 0, len(links))
	for _, l := range links {
		item := map[string]interface{}{
			"token":     l.Token,
			"nodeId":    l.NodeID,
			"path":      l.Path,
			"filename":  l.Filename,
			"createdAt": l.CreatedAt,
		}
		if l.ExpiresAt != nil {
			item["expiresAt"] = *l.ExpiresAt
		}
		if u, err := BuildShareURL(l.Token, l.NodeID); err == nil {
			item["url"] = u
		}
		result = append(result, item)
	}
	return result, nil
}

// ==================== Offline Download ====================

// DoOfflineDownload fetches a URL and writes it to destDir via the storage driver.
func DoOfflineDownload(ctx context.Context, rawURL, nodeID, destDir string, r *ProgressReporter) (string, error) {
	req, err := http.NewRequestWithContext(ctx, "GET", rawURL, nil)
	if err != nil {
		return "", fmt.Errorf("invalid URL: %w", err)
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (compatible; WebOS/1.0)")

	client := &http.Client{
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			if len(via) >= 10 {
				return fmt.Errorf("too many redirects")
			}
			return nil
		},
	}

	resp, err := client.Do(req)
	if err != nil {
		return "", fmt.Errorf("download failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return "", fmt.Errorf("server returned HTTP %d", resp.StatusCode)
	}

	// Resolve filename
	filename := filenameFromDisposition(resp.Header.Get("Content-Disposition"))
	if filename == "" {
		filename = filenameFromURL(rawURL)
	}
	if filename == "" {
		filename = "download"
	}
	filename = sanitizeFilename(filename)

	totalSize := resp.ContentLength // -1 if unknown

	driver, err := storage.GetDriver(nodeID)
	if err != nil {
		return "", fmt.Errorf("storage driver: %w", err)
	}

	dlPath := filepath.Join(destDir, filename)
	// Use path.Join for non-local (e.g. S3) paths that use forward slashes
	if !strings.HasPrefix(destDir, "/") {
		dlPath = path.Join(destDir, filename)
	}

	r.Report(0, 0, 0, 0, totalSize, filename)

	onProgress := func(written, total int64) {
		var progress float64
		if total > 0 {
			progress = float64(written) / float64(total)
		} else {
			progress = -1 // indeterminate
		}
		r.Report(progress, 0, 0, written, total, filename)
	}

	err = driver.WriteStream(dlPath, resp.Body, totalSize, onProgress)
	if err != nil {
		return "", fmt.Errorf("write failed: %w", err)
	}

	return filename, nil
}

func filenameFromDisposition(header string) string {
	if header == "" {
		return ""
	}
	_, params, err := mime.ParseMediaType(header)
	if err != nil {
		return ""
	}
	if name, ok := params["filename"]; ok && name != "" {
		return name
	}
	return ""
}

func filenameFromURL(rawURL string) string {
	u, err := url.Parse(rawURL)
	if err != nil {
		return ""
	}
	p := path.Base(u.Path)
	if p == "." || p == "/" {
		return ""
	}
	if idx := strings.IndexByte(p, '?'); idx >= 0 {
		p = p[:idx]
	}
	decoded, err := url.PathUnescape(p)
	if err != nil {
		return p
	}
	return decoded
}

func sanitizeFilename(name string) string {
	name = strings.ReplaceAll(name, "/", "_")
	name = strings.ReplaceAll(name, "\\", "_")
	name = strings.ReplaceAll(name, "\x00", "")
	name = strings.TrimSpace(name)
	if name == "" || name == "." || name == ".." {
		return "download"
	}
	return name
}
