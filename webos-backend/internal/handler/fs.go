package handler

import (
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"webos-backend/internal/auth"
	"webos-backend/internal/response"
	"webos-backend/internal/service"

	"github.com/gin-gonic/gin"
)

var fileSvc = service.NewFileService()

// FsUploadHandler handles POST /api/fs/:node_id/upload
func FsUploadHandler(c *gin.Context) {
	nodeID := c.Param("node_id")
	path := c.PostForm("path")
	if path == "" {
		path = "/"
	}

	file, err := c.FormFile("file")
	if err != nil {
		response.Error(c, http.StatusBadRequest, 400, "文件上传参数错误")
		return
	}

	src, err := file.Open()
	if err != nil {
		response.InternalError(c, "文件打开失败", err)
		return
	}
	defer src.Close()

	uploadPath, err := fileSvc.Upload(nodeID, path, file.Filename, src, file.Size, nil)
	if err != nil {
		response.InternalError(c, "文件上传失败", err)
		return
	}

	response.SuccessMsg(c, gin.H{"path": uploadPath}, "File uploaded successfully")
}

// FsDownloadHandler handles GET /api/fs/:node_id/download
func FsDownloadHandler(c *gin.Context) {
	nodeID := c.Param("node_id")
	path := c.Query("path")

	if path == "" {
		response.Error(c, http.StatusBadRequest, 400, "Path is required")
		return
	}

	// Auth: try Authorization header first, then URL signature
	authHeader := c.GetHeader("Authorization")
	if authHeader != "" {
		tokenString := strings.TrimPrefix(authHeader, "Bearer ")
		if tokenString != authHeader {
			if _, err := auth.ValidateToken(tokenString); err == nil {
				goto authorized
			}
		}
	}
	// Fallback: check URL signature
	{
		expStr := c.Query("exp")
		sign := c.Query("sign")
		if expStr == "" || sign == "" || !auth.ValidateDownloadSign(nodeID, path, expStr, sign) {
			response.Error(c, http.StatusUnauthorized, 401, "Unauthorized")
			c.Abort()
			return
		}
	}

authorized:
	reader, info, err := fileSvc.Download(nodeID, path)
	if err != nil {
		response.InternalError(c, "文件下载失败", err)
		return
	}
	defer reader.Close()

	c.Header("Content-Disposition", fmt.Sprintf("inline; filename*=UTF-8''%s", url.PathEscape(info.Name)))
	if rs, ok := reader.(io.ReadSeeker); ok {
		http.ServeContent(c.Writer, c.Request, info.Name, info.ModifiedTime, rs)
	} else {
		if info.Size > 0 {
			c.Header("Content-Length", fmt.Sprintf("%d", info.Size))
		}
		io.Copy(c.Writer, reader)
	}
}

// FsDownloadSignHandler handles GET /api/fs/:node_id/download/sign
func FsDownloadSignHandler(c *gin.Context) {
	nodeID := c.Param("node_id")
	path := c.Query("path")

	if path == "" {
		response.Error(c, http.StatusBadRequest, 400, "Path is required")
		return
	}

	exp, sign := auth.GenerateDownloadSign(nodeID, path, 6*60*60)
	response.Success(c, gin.H{"exp": exp, "sign": sign})
}

// FsPresignHandler handles GET /api/fs/:node_id/presign (kept for direct URL access)
func FsPresignHandler(c *gin.Context) {
	nodeID := c.Param("node_id")
	path := c.Query("path")

	if path == "" {
		response.Error(c, http.StatusBadRequest, 400, "Path is required")
		return
	}

	method := c.DefaultQuery("method", "GET")
	expires := 6 * time.Hour

	var presignURL string
	var err error

	switch method {
	case "GET":
		presignURL, err = fileSvc.PresignGetURL(nodeID, path, expires)
	case "PUT":
		presignURL, err = fileSvc.PresignPutURL(nodeID, path, expires)
	default:
		response.Error(c, http.StatusBadRequest, 400, "method must be GET or PUT")
		return
	}

	if err != nil {
		response.InternalError(c, "生成预签名URL失败", err)
		return
	}

	response.Success(c, gin.H{
		"url":    presignURL,
		"method": method,
	})
}
