package handler

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"math"
	"net/http"
	"path/filepath"
	"strconv"
	"sync"
	"time"

	"webos-backend/internal/database"
	"webos-backend/internal/response"
	"webos-backend/internal/service"
	"webos-backend/internal/storage"

	"github.com/gin-gonic/gin"
)

// ==================== Upload Session Registry ====================

type uploadSession struct {
	UploadID   string
	NodeID     string
	TaskID     string
	Filename   string
	Path       string
	TotalSize  int64
	ChunkSize  int64
	TotalParts int
	Direct     bool
	Uploaded   int
	Reporter   *service.ProgressReporter
	Done       chan struct{} // closed when complete/abort
	closeOnce  sync.Once
	mu         sync.Mutex
}

func (s *uploadSession) closeDone() {
	s.closeOnce.Do(func() { close(s.Done) })
}

var uploadRegistry = struct {
	sync.RWMutex
	sessions map[string]*uploadSession
}{sessions: make(map[string]*uploadSession)}

func getUploadSession(uploadID string) (*uploadSession, bool) {
	uploadRegistry.RLock()
	defer uploadRegistry.RUnlock()
	s, ok := uploadRegistry.sessions[uploadID]
	return s, ok
}

func (s *uploadSession) reportProgress() {
	s.mu.Lock()
	uploaded := s.Uploaded
	total := s.TotalParts
	s.mu.Unlock()
	if s.Reporter == nil || total == 0 {
		return
	}
	progress := float64(uploaded) / float64(total)
	bytesCurrent := int64(uploaded) * s.ChunkSize
	if bytesCurrent > s.TotalSize {
		bytesCurrent = s.TotalSize
	}
	s.Reporter.Report(progress, int64(uploaded), int64(total), bytesCurrent, s.TotalSize, s.Filename)
}

// ==================== DB helpers ====================

func dbSaveSession(s *uploadSession, direct bool, s3UploadID, s3Key string) {
	db := database.DB()
	if db == nil {
		return
	}
	now := time.Now().UnixMilli()
	directInt := 0
	if direct {
		directInt = 1
	}
	db.Exec(`INSERT OR REPLACE INTO upload_sessions
		(upload_id, node_id, path, filename, total_size, chunk_size, total_parts, direct, s3_upload_id, s3_key, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		s.UploadID, s.NodeID, s.Path, s.Filename, s.TotalSize, s.ChunkSize, s.TotalParts,
		directInt, s3UploadID, s3Key, now, now)
}

func dbDeleteSession(uploadID string) {
	db := database.DB()
	if db == nil {
		return
	}
	db.Exec("DELETE FROM upload_sessions WHERE upload_id = ?", uploadID)
}

// FsUploadInitHandler handles POST /api/fs/:node_id/upload/init
func FsUploadInitHandler(c *gin.Context) {
	nodeID := c.Param("node_id")
	var req struct {
		Path      string `json:"path"`
		Filename  string `json:"filename"`
		Size      int64  `json:"size"`
		ChunkSize int64  `json:"chunkSize"`
	}
	if err := c.BindJSON(&req); err != nil {
		response.Error(c, http.StatusBadRequest, 400, "请求参数错误")
		return
	}
	if req.ChunkSize <= 0 {
		req.ChunkSize = 5 * 1024 * 1024 // 5MB default
	}
	totalParts := int(math.Ceil(float64(req.Size) / float64(req.ChunkSize)))
	if totalParts == 0 {
		totalParts = 1
	}

	driver, err := storage.GetDriver(nodeID)
	if err != nil {
		response.Error(c, http.StatusBadRequest, 400, "存储节点不可用")
		return
	}
	cu, ok := driver.(storage.ChunkedUploader)
	if !ok {
		response.Error(c, http.StatusBadRequest, 400, "storage does not support chunked upload")
		return
	}

	// Check for resumable session in DB
	var existingUploadID string
	db := database.DB()
	if db != nil {
		row := db.QueryRow(`SELECT upload_id FROM upload_sessions
			WHERE node_id=? AND path=? AND filename=? AND total_size=? LIMIT 1`,
			nodeID, req.Path, req.Filename, req.Size)
		row.Scan(&existingUploadID)
	}
	if existingUploadID != "" {
		if sess, ok := getUploadSession(existingUploadID); ok {
			response.Success(c, gin.H{
				"uploadId":   sess.UploadID,
				"taskId":     sess.TaskID,
				"chunkSize":  sess.ChunkSize,
				"totalParts": sess.TotalParts,
				"direct":     sess.Direct,
				"resumed":    true,
			})
			return
		}
		// DB record exists but not in memory — clean up stale record
		dbDeleteSession(existingUploadID)
	}

	filePath := req.Path
	if filePath == "" || filePath == "/" {
		filePath = "/" + req.Filename
	} else {
		filePath = filePath + "/" + req.Filename
	}
	uploadID, err := cu.InitUpload(filePath, req.Size)
	if err != nil {
		response.InternalError(c, "初始化上传失败", err)
		return
	}

	_, isDirect := driver.(storage.DirectUploader)

	sess := &uploadSession{
		UploadID:   uploadID,
		NodeID:     nodeID,
		Filename:   req.Filename,
		Path:       req.Path,
		TotalSize:  req.Size,
		ChunkSize:  req.ChunkSize,
		TotalParts: totalParts,
		Direct:     isDirect,
		Done:       make(chan struct{}),
	}

	// Create background task
	doneCh := sess.Done
	taskID := service.GetTaskManager().Submit("upload", "上传 "+req.Filename, func(ctx context.Context, r *service.ProgressReporter) (string, error) {
		sess.Reporter = r
		r.Report(0, 0, int64(totalParts), 0, req.Size, req.Filename)
		<-doneCh
		// Check if aborted
		select {
		case <-doneCh:
		default:
		}
		uploadRegistry.RLock()
		_, stillExists := uploadRegistry.sessions[uploadID]
		uploadRegistry.RUnlock()
		if stillExists {
			return "", fmt.Errorf("上传已取消")
		}
		return fmt.Sprintf("已上传 %s", req.Filename), nil
	})
	sess.TaskID = taskID

	uploadRegistry.Lock()
	uploadRegistry.sessions[uploadID] = sess
	uploadRegistry.Unlock()

	// Save to DB (include S3 internal IDs for recovery after restart)
	var s3UploadID, s3Key string
	if s3d, ok := driver.(*storage.S3Driver); ok {
		s3UploadID, s3Key, _ = s3d.GetUploadMeta(uploadID)
	}
	dbSaveSession(sess, isDirect, s3UploadID, s3Key)

	response.Success(c, gin.H{
		"uploadId":   uploadID,
		"taskId":     taskID,
		"chunkSize":  req.ChunkSize,
		"totalParts": totalParts,
		"direct":     isDirect,
		"resumed":    false,
	})
}

// FsUploadChunkHandler handles POST /api/fs/:node_id/upload/chunk
func FsUploadChunkHandler(c *gin.Context) {
	uploadID := c.Query("uploadId")
	partNumStr := c.Query("partNum")
	partNum, err := strconv.Atoi(partNumStr)
	if err != nil || partNum < 1 {
		response.Error(c, http.StatusBadRequest, 400, "invalid partNum")
		return
	}

	sess, ok := getUploadSession(uploadID)
	if !ok {
		response.Error(c, http.StatusNotFound, 404, "upload session not found")
		return
	}

	nodeID := c.Param("node_id")
	driver, err := storage.GetDriver(nodeID)
	if err != nil {
		response.Error(c, http.StatusBadRequest, 400, "存储节点不可用")
		return
	}
	cu, ok := driver.(storage.ChunkedUploader)
	if !ok {
		response.Error(c, http.StatusBadRequest, 400, "storage does not support chunked upload")
		return
	}

	part, err := cu.UploadChunk(uploadID, partNum, c.Request.Body, sess.ChunkSize)
	if err != nil {
		response.InternalError(c, "上传分片失败", err)
		return
	}

	sess.mu.Lock()
	sess.Uploaded++
	sess.mu.Unlock()
	sess.reportProgress()

	etag := ""
	if part != nil {
		etag = part.ETag
	}
	response.Success(c, gin.H{"partNum": partNum, "etag": etag})
}

// FsUploadPresignHandler handles POST /api/fs/:node_id/upload/:upload_id/presign
func FsUploadPresignHandler(c *gin.Context) {
	uploadID := c.Param("upload_id")
	sess, ok := getUploadSession(uploadID)
	if !ok {
		response.Error(c, http.StatusNotFound, 404, "upload session not found")
		return
	}

	var req struct {
		PartNums []int `json:"partNums"`
	}
	if err := c.BindJSON(&req); err != nil {
		response.Error(c, http.StatusBadRequest, 400, "请求参数错误")
		return
	}

	nodeID := c.Param("node_id")
	driver, err := storage.GetDriver(nodeID)
	if err != nil {
		response.Error(c, http.StatusBadRequest, 400, "存储节点不可用")
		return
	}
	du, ok := driver.(storage.DirectUploader)
	if !ok {
		response.Error(c, http.StatusBadRequest, 400, "storage does not support direct upload")
		return
	}

	urls := make(map[string]string)
	for _, pn := range req.PartNums {
		u, err := du.PresignUploadPart(uploadID, pn, sess.ChunkSize, 1*time.Hour)
		if err != nil {
			response.InternalError(c, "生成预签名URL失败", err)
			return
		}
		urls[strconv.Itoa(pn)] = u
	}

	response.Success(c, gin.H{"urls": urls})
}

// FsUploadCompleteHandler handles POST /api/fs/:node_id/upload/complete
func FsUploadCompleteHandler(c *gin.Context) {
	var req struct {
		UploadID string                 `json:"uploadId"`
		Parts    []storage.CompletedPart `json:"parts"`
	}
	if err := c.BindJSON(&req); err != nil {
		response.Error(c, http.StatusBadRequest, 400, "请求参数错误")
		return
	}

	sess, ok := getUploadSession(req.UploadID)
	if !ok {
		response.Error(c, http.StatusNotFound, 404, "upload session not found")
		return
	}

	nodeID := c.Param("node_id")
	driver, err := storage.GetDriver(nodeID)
	if err != nil {
		response.Error(c, http.StatusBadRequest, 400, "存储节点不可用")
		return
	}
	cu, ok := driver.(storage.ChunkedUploader)
	if !ok {
		response.Error(c, http.StatusBadRequest, 400, "storage does not support chunked upload")
		return
	}

	if err := cu.CompleteUpload(req.UploadID, req.Parts); err != nil {
		response.InternalError(c, "完成上传失败", err)
		return
	}

	// Signal task completion
	uploadRegistry.Lock()
	delete(uploadRegistry.sessions, req.UploadID)
	uploadRegistry.Unlock()
	sess.closeDone()

	dbDeleteSession(req.UploadID)

	filePath := sess.Path
	if filePath == "" || filePath == "/" {
		filePath = "/" + sess.Filename
	} else {
		filePath = filePath + "/" + sess.Filename
	}

	service.IndexAdd(nodeID, storage.FileInfo{
		Name: sess.Filename, Path: filePath, IsDir: false,
		Size: sess.TotalSize, Extension: filepath.Ext(sess.Filename), ModifiedTime: time.Now(),
	})

	response.Success(c, gin.H{"path": filePath})
}

// FsUploadAbortHandler handles DELETE /api/fs/:node_id/upload/:upload_id
func FsUploadAbortHandler(c *gin.Context) {
	uploadID := c.Param("upload_id")
	sess, ok := getUploadSession(uploadID)
	if !ok {
		response.Error(c, http.StatusNotFound, 404, "upload session not found")
		return
	}

	nodeID := c.Param("node_id")
	driver, err := storage.GetDriver(nodeID)
	if err != nil {
		response.Error(c, http.StatusBadRequest, 400, "存储节点不可用")
		return
	}
	cu, ok := driver.(storage.ChunkedUploader)
	if !ok {
		response.Error(c, http.StatusBadRequest, 400, "storage does not support chunked upload")
		return
	}

	cu.AbortUpload(uploadID)

	uploadRegistry.Lock()
	delete(uploadRegistry.sessions, uploadID)
	uploadRegistry.Unlock()
	sess.closeDone()

	dbDeleteSession(uploadID)

	response.SuccessMsg(c, nil, "upload aborted")
}

// FsUploadPartsHandler handles GET /api/fs/:node_id/upload/:upload_id/parts
func FsUploadPartsHandler(c *gin.Context) {
	uploadID := c.Param("upload_id")
	_, ok := getUploadSession(uploadID)
	if !ok {
		response.Error(c, http.StatusNotFound, 404, "upload session not found")
		return
	}

	nodeID := c.Param("node_id")
	driver, err := storage.GetDriver(nodeID)
	if err != nil {
		response.Error(c, http.StatusBadRequest, 400, "存储节点不可用")
		return
	}
	cu, ok := driver.(storage.ChunkedUploader)
	if !ok {
		response.Error(c, http.StatusBadRequest, 400, "storage does not support chunked upload")
		return
	}

	parts, err := cu.ListUploadedParts(uploadID)
	if err != nil {
		response.InternalError(c, "获取分片列表失败", err)
		return
	}
	if parts == nil {
		parts = []storage.UploadedPart{}
	}

	response.Success(c, gin.H{"parts": parts})
}

// ReportUploadProgress is called from WebSocket handler for S3 direct upload progress.
func ReportUploadProgress(uploadID string, partNum int) {
	sess, ok := getUploadSession(uploadID)
	if !ok {
		return
	}
	sess.mu.Lock()
	sess.Uploaded++
	sess.mu.Unlock()
	sess.reportProgress()
}

// CleanStaleUploads removes upload sessions older than 24 hours.
// For S3 sessions, it uses the stored s3_upload_id and s3_key to abort the multipart upload on S3.
func CleanStaleUploads() {
	db := database.DB()
	if db == nil {
		return
	}
	cutoff := time.Now().Add(-24 * time.Hour).UnixMilli()
	rows, err := db.Query("SELECT upload_id, node_id, s3_upload_id, s3_key FROM upload_sessions WHERE created_at < ?", cutoff)
	if err != nil {
		return
	}
	defer rows.Close()
	for rows.Next() {
		var uploadID, nodeID, s3UploadID, s3Key string
		if rows.Scan(&uploadID, &nodeID, &s3UploadID, &s3Key) != nil {
			continue
		}
		driver, err := storage.GetDriver(nodeID)
		if err != nil {
			dbDeleteSession(uploadID)
			continue
		}
		// For S3 drivers with stored meta, recover the session first so AbortUpload can find it
		if s3UploadID != "" && s3Key != "" {
			if s3d, ok := driver.(*storage.S3Driver); ok {
				s3d.RecoverUpload(uploadID, s3UploadID, s3Key)
			}
		}
		if cu, ok := driver.(storage.ChunkedUploader); ok {
			cu.AbortUpload(uploadID)
		}
		uploadRegistry.Lock()
		if sess, ok := uploadRegistry.sessions[uploadID]; ok {
			delete(uploadRegistry.sessions, uploadID)
			sess.closeDone()
		}
		uploadRegistry.Unlock()
		dbDeleteSession(uploadID)
	}

	// Also clean stale in-memory sessions in S3 drivers that may not have DB records
	for _, nodeID := range storage.AllNodeIDs() {
		driver, err := storage.GetDriver(nodeID)
		if err != nil {
			continue
		}
		if s3d, ok := driver.(*storage.S3Driver); ok {
			s3d.CleanStaleSessions(24 * time.Hour)
		}
	}
}

// RecoverS3Uploads restores in-progress S3 multipart upload sessions from the database.
// Call this at startup after storage drivers are initialized.
func RecoverS3Uploads() {
	db := database.DB()
	if db == nil {
		return
	}
	rows, err := db.Query("SELECT upload_id, node_id, s3_upload_id, s3_key FROM upload_sessions WHERE s3_upload_id != ''")
	if err != nil {
		return
	}
	defer rows.Close()
	count := 0
	for rows.Next() {
		var uploadID, nodeID, s3UploadID, s3Key string
		if rows.Scan(&uploadID, &nodeID, &s3UploadID, &s3Key) != nil {
			continue
		}
		driver, err := storage.GetDriver(nodeID)
		if err != nil {
			continue
		}
		s3d, ok := driver.(*storage.S3Driver)
		if !ok {
			continue
		}
		s3d.RecoverUpload(uploadID, s3UploadID, s3Key)
		count++
	}
	if count > 0 {
		log.Printf("[upload] recovered %d S3 upload sessions from DB", count)
	}
}

// ==================== WebSocket upload handler ====================

func init() {
	RegisterHandlers(map[string]Handler{
		"upload.progress": handleUploadProgress,
	})
}

func handleUploadProgress(c *WSConn, raw json.RawMessage) {
	var p struct {
		UploadID string `json:"uploadId"`
		PartNum  int    `json:"partNum"`
	}
	json.Unmarshal(raw, &p)
	if p.UploadID != "" {
		ReportUploadProgress(p.UploadID, p.PartNum)
	}
}
