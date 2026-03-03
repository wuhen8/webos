package storage

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"path"
	"strings"
	"sync"
	"time"

	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
)

// S3Driver implements Driver for S3-compatible object storage
type S3Driver struct {
	client   *minio.Client
	core     minio.Core
	bucket   string
	uploads  map[string]*s3UploadSession
	uploadMu sync.Mutex
}

type s3UploadSession struct {
	S3UploadID string
	Key        string
	CreatedAt  time.Time
}

// NewS3Driver creates a new S3Driver
func NewS3Driver(endpoint, accessKey, secretKey, bucket, region string, useSSL bool) (*S3Driver, error) {
	opts := &minio.Options{
		Creds:  credentials.NewStaticV4(accessKey, secretKey, ""),
		Secure: useSSL,
		Region: region,
	}
	client, err := minio.New(endpoint, opts)
	if err != nil {
		return nil, fmt.Errorf("failed to create S3 client: %w", err)
	}
	core, err := minio.NewCore(endpoint, opts)
	if err != nil {
		return nil, fmt.Errorf("failed to create S3 core client: %w", err)
	}

	ctx := context.Background()
	exists, err := client.BucketExists(ctx, bucket)
	if err != nil {
		return nil, fmt.Errorf("failed to check bucket: %w", err)
	}
	if !exists {
		return nil, fmt.Errorf("bucket %q does not exist", bucket)
	}

	return &S3Driver{
		client:  client,
		core:    *core,
		bucket:  bucket,
		uploads: make(map[string]*s3UploadSession),
	}, nil
}

func (d *S3Driver) normalizePath(p string) string {
	p = strings.TrimPrefix(p, "/")
	p = strings.ReplaceAll(p, "\\", "/")
	return p
}

func (d *S3Driver) prefixForDir(p string) string {
	p = d.normalizePath(p)
	if p != "" && !strings.HasSuffix(p, "/") {
		p += "/"
	}
	return p
}

func (d *S3Driver) List(dirPath string) ([]FileInfo, error) {
	ctx := context.Background()
	prefix := d.prefixForDir(dirPath)

	opts := minio.ListObjectsOptions{
		Prefix:    prefix,
		Recursive: false,
	}

	var files []FileInfo
	for obj := range d.client.ListObjects(ctx, d.bucket, opts) {
		if obj.Err != nil {
			return nil, obj.Err
		}

		if obj.Key == prefix {
			continue
		}

		name := strings.TrimPrefix(obj.Key, prefix)
		isDir := strings.HasSuffix(name, "/")
		if isDir {
			name = strings.TrimSuffix(name, "/")
		}
		if name == "" {
			continue
		}

		ext := ""
		if !isDir {
			ext = path.Ext(name)
		}

		filePath := "/" + strings.TrimSuffix(obj.Key, "/")

		modTime := obj.LastModified
		if modTime.IsZero() {
			modTime = time.Now()
		}

		files = append(files, FileInfo{
			Name:         name,
			Path:         filePath,
			IsDir:        isDir,
			Size:         obj.Size,
			Extension:    ext,
			ModifiedTime: modTime,
		})
	}

	return files, nil
}

// WalkAllObjects iterates all objects in the bucket in batches, calling fn for each batch.
// Used by the indexer to build the search index without loading everything into memory.
func (d *S3Driver) WalkAllObjects(fn func([]FileInfo) error) error {
	ctx := context.Background()
	opts := minio.ListObjectsOptions{
		Recursive: true,
	}

	var batch []FileInfo
	for obj := range d.client.ListObjects(ctx, d.bucket, opts) {
		if obj.Err != nil {
			return obj.Err
		}
		if strings.HasSuffix(obj.Key, "/") {
			continue
		}

		name := path.Base(obj.Key)
		ext := path.Ext(name)
		filePath := "/" + obj.Key
		modTime := obj.LastModified
		if modTime.IsZero() {
			modTime = time.Now()
		}

		batch = append(batch, FileInfo{
			Name:         name,
			Path:         filePath,
			IsDir:        false,
			Size:         obj.Size,
			Extension:    ext,
			ModifiedTime: modTime,
		})

		if len(batch) >= 5000 {
			if err := fn(batch); err != nil {
				return err
			}
			batch = batch[:0]
		}
	}
	if len(batch) > 0 {
		if err := fn(batch); err != nil {
			return err
		}
	}
	return nil
}

func (d *S3Driver) Read(filePath string) ([]byte, error) {
	ctx := context.Background()
	key := d.normalizePath(filePath)

	obj, err := d.client.GetObject(ctx, d.bucket, key, minio.GetObjectOptions{})
	if err != nil {
		return nil, err
	}
	defer obj.Close()

	data, err := io.ReadAll(obj)
	if err != nil {
		return nil, err
	}
	return data, nil
}

func (d *S3Driver) Write(filePath string, content []byte) error {
	ctx := context.Background()
	key := d.normalizePath(filePath)

	reader := bytes.NewReader(content)
	_, err := d.client.PutObject(ctx, d.bucket, key, reader, int64(len(content)), minio.PutObjectOptions{})
	return err
}

func (d *S3Driver) CreateDir(dirPath string) error {
	ctx := context.Background()
	key := d.normalizePath(dirPath)
	if !strings.HasSuffix(key, "/") {
		key += "/"
	}

	_, err := d.client.PutObject(ctx, d.bucket, key, strings.NewReader(""), 0, minio.PutObjectOptions{})
	return err
}

func (d *S3Driver) Delete(filePath string) error {
	ctx := context.Background()
	key := d.normalizePath(filePath)

	err := d.client.RemoveObject(ctx, d.bucket, key, minio.RemoveObjectOptions{})
	if err != nil {
		return err
	}

	prefix := key
	if !strings.HasSuffix(prefix, "/") {
		prefix += "/"
	}

	objectsCh := make(chan minio.ObjectInfo)
	go func() {
		defer close(objectsCh)
		for obj := range d.client.ListObjects(ctx, d.bucket, minio.ListObjectsOptions{
			Prefix:    prefix,
			Recursive: true,
		}) {
			if obj.Err != nil {
				return
			}
			objectsCh <- obj
		}
	}()

	for err := range d.client.RemoveObjects(ctx, d.bucket, objectsCh, minio.RemoveObjectsOptions{}) {
		if err.Err != nil {
			return err.Err
		}
	}

	return nil
}

func (d *S3Driver) Rename(oldPath, newPath string) error {
	if err := d.Copy(oldPath, newPath, nil); err != nil {
		return err
	}
	return d.Delete(oldPath)
}

func (d *S3Driver) Copy(srcPath, dstPath string, onProgress ProgressFunc) error {
	ctx := context.Background()
	srcKey := d.normalizePath(srcPath)
	dstKey := d.normalizePath(dstPath)

	src := minio.CopySrcOptions{
		Bucket: d.bucket,
		Object: srcKey,
	}
	dst := minio.CopyDestOptions{
		Bucket: d.bucket,
		Object: dstKey,
	}

	info, err := d.client.CopyObject(ctx, dst, src)
	if err != nil {
		// Might be a directory — copy all objects under prefix
		prefix := srcKey
		if !strings.HasSuffix(prefix, "/") {
			prefix += "/"
		}
		dstPrefix := dstKey
		if !strings.HasSuffix(dstPrefix, "/") {
			dstPrefix += "/"
		}

		for obj := range d.client.ListObjects(ctx, d.bucket, minio.ListObjectsOptions{
			Prefix:    prefix,
			Recursive: true,
		}) {
			if obj.Err != nil {
				return obj.Err
			}
			newKey := dstPrefix + strings.TrimPrefix(obj.Key, prefix)
			copySrc := minio.CopySrcOptions{Bucket: d.bucket, Object: obj.Key}
			copyDst := minio.CopyDestOptions{Bucket: d.bucket, Object: newKey}
			if _, err := d.client.CopyObject(ctx, copyDst, copySrc); err != nil {
				return err
			}
		}
	} else if onProgress != nil {
		// Single object copy succeeded — report completion
		onProgress(info.Size, info.Size)
	}
	return nil
}

func (d *S3Driver) Move(srcPath, dstPath string) error {
	if err := d.Copy(srcPath, dstPath, nil); err != nil {
		return err
	}
	return d.Delete(srcPath)
}

func (d *S3Driver) Stat(filePath string) (*FileInfo, error) {
	ctx := context.Background()
	key := d.normalizePath(filePath)

	info, err := d.client.StatObject(ctx, d.bucket, key, minio.StatObjectOptions{})
	if err != nil {
		prefix := key
		if !strings.HasSuffix(prefix, "/") {
			prefix += "/"
		}
		for obj := range d.client.ListObjects(ctx, d.bucket, minio.ListObjectsOptions{
			Prefix:    prefix,
			Recursive: false,
			MaxKeys:   1,
		}) {
			if obj.Err != nil {
				return nil, err
			}
			name := path.Base(key)
			return &FileInfo{
				Name:         name,
				Path:         "/" + key,
				IsDir:        true,
				Size:         0,
				Extension:    "",
				ModifiedTime: time.Now(),
			}, nil
		}
		return nil, err
	}

	name := path.Base(info.Key)
	isDir := strings.HasSuffix(info.Key, "/")
	ext := ""
	if !isDir {
		ext = path.Ext(name)
	}

	return &FileInfo{
		Name:         name,
		Path:         "/" + strings.TrimSuffix(info.Key, "/"),
		IsDir:        isDir,
		Size:         info.Size,
		Extension:    ext,
		ModifiedTime: info.LastModified,
	}, nil
}

func (d *S3Driver) ReadStream(filePath string) (io.ReadCloser, *FileInfo, error) {
	ctx := context.Background()
	key := d.normalizePath(filePath)

	obj, err := d.client.GetObject(ctx, d.bucket, key, minio.GetObjectOptions{})
	if err != nil {
		return nil, nil, err
	}

	info, err := obj.Stat()
	if err != nil {
		obj.Close()
		return nil, nil, err
	}

	name := path.Base(info.Key)
	ext := path.Ext(name)

	sfi := &FileInfo{
		Name:         name,
		Path:         "/" + info.Key,
		IsDir:        false,
		Size:         info.Size,
		Extension:    ext,
		ModifiedTime: info.LastModified,
	}

	return obj, sfi, nil
}

func (d *S3Driver) WriteStream(filePath string, reader io.Reader, size int64, onProgress ProgressFunc) error {
	ctx := context.Background()
	key := d.normalizePath(filePath)

	_, err := d.client.PutObject(ctx, d.bucket, key, NewCountingReader(reader, size, onProgress), size, minio.PutObjectOptions{})
	return err
}

func (d *S3Driver) PresignGetURL(filePath string, expires time.Duration) (string, error) {
	key := d.normalizePath(filePath)
	reqParams := make(url.Values)
	u, err := d.client.PresignedGetObject(context.Background(), d.bucket, key, expires, reqParams)
	if err != nil {
		return "", fmt.Errorf("presign get failed: %w", err)
	}
	return u.String(), nil
}

func (d *S3Driver) PresignPutURL(filePath string, expires time.Duration) (string, error) {
	key := d.normalizePath(filePath)
	u, err := d.client.PresignedPutObject(context.Background(), d.bucket, key, expires)
	if err != nil {
		return "", fmt.Errorf("presign put failed: %w", err)
	}
	return u.String(), nil
}

// ==================== ChunkedUploader + DirectUploader ====================

func genS3UploadID() string {
	b := make([]byte, 8)
	rand.Read(b)
	return "upload_" + hex.EncodeToString(b)
}

func (d *S3Driver) InitUpload(filePath string, size int64) (string, error) {
	ctx := context.Background()
	key := d.normalizePath(filePath)
	s3UploadID, err := d.core.NewMultipartUpload(ctx, d.bucket, key, minio.PutObjectOptions{})
	if err != nil {
		return "", fmt.Errorf("init multipart upload: %w", err)
	}
	uploadID := genS3UploadID()
	d.uploadMu.Lock()
	d.uploads[uploadID] = &s3UploadSession{S3UploadID: s3UploadID, Key: key, CreatedAt: time.Now()}
	d.uploadMu.Unlock()
	return uploadID, nil
}

func (d *S3Driver) UploadChunk(uploadID string, partNum int, reader io.Reader, size int64) (*UploadedPart, error) {
	d.uploadMu.Lock()
	sess, ok := d.uploads[uploadID]
	d.uploadMu.Unlock()
	if !ok {
		return nil, fmt.Errorf("upload session %q not found", uploadID)
	}
	ctx := context.Background()
	part, err := d.core.PutObjectPart(ctx, d.bucket, sess.Key, sess.S3UploadID, partNum, reader, size, minio.PutObjectPartOptions{})
	if err != nil {
		return nil, fmt.Errorf("upload part %d: %w", partNum, err)
	}
	return &UploadedPart{PartNum: part.PartNumber, Size: part.Size, ETag: part.ETag}, nil
}

func (d *S3Driver) CompleteUpload(uploadID string, parts []CompletedPart) error {
	d.uploadMu.Lock()
	sess, ok := d.uploads[uploadID]
	d.uploadMu.Unlock()
	if !ok {
		return fmt.Errorf("upload session %q not found", uploadID)
	}
	ctx := context.Background()
	completeParts := make([]minio.CompletePart, len(parts))
	for i, p := range parts {
		completeParts[i] = minio.CompletePart{PartNumber: p.PartNum, ETag: p.ETag}
	}
	_, err := d.core.CompleteMultipartUpload(ctx, d.bucket, sess.Key, sess.S3UploadID, completeParts, minio.PutObjectOptions{})
	if err != nil {
		return fmt.Errorf("complete multipart upload: %w", err)
	}
	d.uploadMu.Lock()
	delete(d.uploads, uploadID)
	d.uploadMu.Unlock()
	return nil
}

func (d *S3Driver) AbortUpload(uploadID string) error {
	d.uploadMu.Lock()
	sess, ok := d.uploads[uploadID]
	if ok {
		delete(d.uploads, uploadID)
	}
	d.uploadMu.Unlock()
	if !ok {
		return fmt.Errorf("upload session %q not found", uploadID)
	}
	ctx := context.Background()
	return d.core.AbortMultipartUpload(ctx, d.bucket, sess.Key, sess.S3UploadID)
}

func (d *S3Driver) ListUploadedParts(uploadID string) ([]UploadedPart, error) {
	d.uploadMu.Lock()
	sess, ok := d.uploads[uploadID]
	d.uploadMu.Unlock()
	if !ok {
		return nil, fmt.Errorf("upload session %q not found", uploadID)
	}
	ctx := context.Background()
	result, err := d.core.ListObjectParts(ctx, d.bucket, sess.Key, sess.S3UploadID, 0, 0)
	if err != nil {
		return nil, fmt.Errorf("list parts: %w", err)
	}
	var parts []UploadedPart
	for _, p := range result.ObjectParts {
		parts = append(parts, UploadedPart{PartNum: p.PartNumber, Size: p.Size, ETag: p.ETag})
	}
	return parts, nil
}

// PresignUploadPart generates a presigned URL for direct chunk upload to S3.
func (d *S3Driver) PresignUploadPart(uploadID string, partNum int, size int64, expires time.Duration) (string, error) {
	d.uploadMu.Lock()
	sess, ok := d.uploads[uploadID]
	d.uploadMu.Unlock()
	if !ok {
		return "", fmt.Errorf("upload session %q not found", uploadID)
	}
	params := make(url.Values)
	params.Set("partNumber", fmt.Sprintf("%d", partNum))
	params.Set("uploadId", sess.S3UploadID)
	u, err := d.client.Presign(context.Background(), http.MethodPut, d.bucket, sess.Key, expires, params)
	if err != nil {
		return "", fmt.Errorf("presign upload part: %w", err)
	}
	return u.String(), nil
}

// RecoverUpload re-registers an S3 multipart upload session (used when restoring from DB).
func (d *S3Driver) RecoverUpload(uploadID, s3UploadID, key string) {
	d.uploadMu.Lock()
	d.uploads[uploadID] = &s3UploadSession{S3UploadID: s3UploadID, Key: key, CreatedAt: time.Now()}
	d.uploadMu.Unlock()
}

// GetUploadMeta returns the S3-internal upload ID and object key for a given upload session.
// Returns ("", "", false) if the session is not found.
func (d *S3Driver) GetUploadMeta(uploadID string) (s3UploadID, key string, ok bool) {
	d.uploadMu.Lock()
	sess, found := d.uploads[uploadID]
	d.uploadMu.Unlock()
	if !found {
		return "", "", false
	}
	return sess.S3UploadID, sess.Key, true
}

// CleanStaleSessions removes upload sessions older than maxAge and aborts
// their S3 multipart uploads. Returns the number of cleaned sessions.
func (d *S3Driver) CleanStaleSessions(maxAge time.Duration) int {
	d.uploadMu.Lock()
	var stale []*s3UploadSession
	var staleIDs []string
	cutoff := time.Now().Add(-maxAge)
	for id, sess := range d.uploads {
		if sess.CreatedAt.Before(cutoff) {
			stale = append(stale, sess)
			staleIDs = append(staleIDs, id)
		}
	}
	for _, id := range staleIDs {
		delete(d.uploads, id)
	}
	d.uploadMu.Unlock()

	ctx := context.Background()
	for _, sess := range stale {
		_ = d.core.AbortMultipartUpload(ctx, d.bucket, sess.Key, sess.S3UploadID)
	}
	return len(stale)
}
