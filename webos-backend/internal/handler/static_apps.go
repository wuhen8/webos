package handler

import (
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"webos-backend/internal/service"

	"github.com/gin-gonic/gin"
)

// WebAppUploadHandler handles zip file upload for static app installation.
func WebAppUploadHandler(c *gin.Context) {
	file, err := c.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "缺少上传文件"})
		return
	}

	// Size limit: 100MB
	if file.Size > 100<<20 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "文件大小超过 100MB 限制"})
		return
	}

	// Save to temp file
	tmpFile, err := os.CreateTemp("", "webos-static-upload-*.zip")
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "创建临时文件失败"})
		return
	}
	tmpPath := tmpFile.Name()
	tmpFile.Close()
	defer os.Remove(tmpPath)

	if err := c.SaveUploadedFile(file, tmpPath); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "保存文件失败"})
		return
	}

	manifest, err := service.InstallWebAppFromZip(tmpPath)
	if err != nil {
		log.Printf("[ERROR] 安装应用失败: %v", err)
		c.JSON(http.StatusBadRequest, gin.H{"error": "应用安装失败"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"app": manifest})
}

// ServeWebApp serves files for a given app with token auth.
func ServeWebApp(c *gin.Context) {
	appID := c.Param("appId")
	filePath := c.Param("filepath")

	// Validate app ID
	if !service.ValidAppIDRegex.MatchString(appID) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid app id"})
		return
	}

	// Clean and validate file path
	filePath = filepath.Clean(strings.TrimPrefix(filePath, "/"))
	if strings.Contains(filePath, "..") {
		c.JSON(http.StatusForbidden, gin.H{"error": "path traversal not allowed"})
		return
	}

	webAppsDir := service.GetWebAppsDir()
	fullPath := filepath.Join(webAppsDir, appID, filePath)

	// Verify the resolved path is within the app directory
	appDir := filepath.Join(webAppsDir, appID)
	if !strings.HasPrefix(fullPath, appDir) {
		c.JSON(http.StatusForbidden, gin.H{"error": "path traversal not allowed"})
		return
	}

	if _, err := os.Stat(fullPath); os.IsNotExist(err) {
		c.JSON(http.StatusNotFound, gin.H{"error": "file not found"})
		return
	}

	// Set cache headers based on file type
	if strings.HasPrefix(filePath, "assets/") || strings.HasPrefix(filePath, "assets\\") {
		// Hashed assets — immutable, cache forever
		c.Header("Cache-Control", "public, max-age=31536000, immutable")
	} else if filePath == "main.js" || filePath == "manifest.json" {
		// Entry point and manifest — allow conditional requests
		c.Header("Cache-Control", "no-cache")
	} else if strings.HasSuffix(filePath, ".css") {
		// CSS declared in manifest — allow conditional requests
		c.Header("Cache-Control", "no-cache")
	} else if strings.HasSuffix(filePath, ".wasm") {
		// Wasm binaries — correct MIME type, cache with revalidation
		c.Header("Content-Type", "application/wasm")
		c.Header("Cache-Control", "no-cache")
	} else {
		c.Header("Cache-Control", "no-cache, no-store, must-revalidate")
	}
	c.File(fullPath)
}
