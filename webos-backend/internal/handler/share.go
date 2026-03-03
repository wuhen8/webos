package handler

import (
	"fmt"
	"io"
	"net/http"
	"net/url"
	"time"

	"webos-backend/internal/database"
	"webos-backend/internal/response"

	"github.com/gin-gonic/gin"
)

// ShareDownloadHandler handles GET /api/share/:token — public, no auth required.
func ShareDownloadHandler(c *gin.Context) {
	token := c.Param("token")
	link, err := database.GetShareLink(token)
	if err != nil {
		response.Error(c, http.StatusNotFound, 404, "分享链接不存在或已失效")
		return
	}

	// Check expiry
	if link.ExpiresAt != nil && time.Now().Unix() > *link.ExpiresAt {
		response.Error(c, http.StatusGone, 410, "分享链接已过期")
		return
	}

	reader, info, err := fileSvc.Download(link.NodeID, link.Path)
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
