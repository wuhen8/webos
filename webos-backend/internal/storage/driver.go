package storage

import (
	"io"
	"time"
)

// ProgressFunc is called to report progress during long-running operations.
// written is the number of bytes transferred so far, total is the total size.
// Callers may pass nil if they don't need progress reporting.
type ProgressFunc func(written, total int64)

// FileInfo mirrors the existing FileInfo JSON shape
type FileInfo struct {
	Name          string    `json:"name"`
	Path          string    `json:"path"`
	IsDir         bool      `json:"isDir"`
	Size          int64     `json:"size"`
	Extension     string    `json:"extension"`
	ModifiedTime  time.Time `json:"modifiedTime"`
	ItemCount     *int      `json:"itemCount,omitempty"`
	IsSymlink     bool      `json:"isSymlink,omitempty"`
	SymlinkTarget string    `json:"symlinkTarget,omitempty"`
}

// Driver is the abstraction for different storage backends
type Driver interface {
	List(path string) ([]FileInfo, error)
	Read(path string) ([]byte, error)
	Write(path string, content []byte) error
	CreateDir(path string) error
	Delete(path string) error
	Rename(oldPath, newPath string) error
	Copy(srcPath, dstPath string, onProgress ProgressFunc) error
	Move(srcPath, dstPath string) error
	Stat(path string) (*FileInfo, error)
	ReadStream(path string) (io.ReadCloser, *FileInfo, error)
	WriteStream(path string, reader io.Reader, size int64, onProgress ProgressFunc) error
	PresignGetURL(path string, expires time.Duration) (string, error)
	PresignPutURL(path string, expires time.Duration) (string, error)
}

// UploadedPart describes a completed upload part.
type UploadedPart struct {
	PartNum int    `json:"partNum"`
	Size    int64  `json:"size"`
	ETag    string `json:"etag,omitempty"`
}

// CompletedPart is sent by the client when completing an upload (carries ETag for S3 direct mode).
type CompletedPart struct {
	PartNum int    `json:"partNum"`
	ETag    string `json:"etag"`
}

// ChunkedUploader is an optional interface for drivers that support chunked/resumable uploads.
type ChunkedUploader interface {
	InitUpload(path string, size int64) (uploadID string, err error)
	UploadChunk(uploadID string, partNum int, reader io.Reader, size int64) (*UploadedPart, error)
	CompleteUpload(uploadID string, parts []CompletedPart) error
	AbortUpload(uploadID string) error
	ListUploadedParts(uploadID string) ([]UploadedPart, error)
}

// DirectUploader is an optional interface for drivers that support presigned URL direct upload (e.g. S3).
type DirectUploader interface {
	PresignUploadPart(uploadID string, partNum int, size int64, expires time.Duration) (string, error)
}

// countingReader wraps an io.Reader and reports progress via ProgressFunc.
type countingReader struct {
	reader  io.Reader
	total   int64
	written int64
	onProgress ProgressFunc
}

func (cr *countingReader) Read(p []byte) (int, error) {
	n, err := cr.reader.Read(p)
	cr.written += int64(n)
	if cr.onProgress != nil && n > 0 {
		cr.onProgress(cr.written, cr.total)
	}
	return n, err
}

// NewCountingReader wraps a reader to report progress. If onProgress is nil, returns the original reader.
func NewCountingReader(r io.Reader, total int64, onProgress ProgressFunc) io.Reader {
	if onProgress == nil {
		return r
	}
	return &countingReader{reader: r, total: total, onProgress: onProgress}
}
