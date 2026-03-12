package handler

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"path/filepath"
	"strings"
	"time"

	"webos-backend/internal/auth"
	"webos-backend/internal/service"
	"webos-backend/internal/storage"
)

func init() {
	RegisterHandlers(map[string]Handler{
		"fs.list":             handleFsList,
		"fs.search":           handleFsSearch,
		"fs.read":             handleFsRead,
		"fs.write":            handleFsWrite,
		"fs.mkdir":            handleFsMkdir,
		"fs.create":           handleFsCreate,
		"fs.delete":           handleFsDelete,
		"fs.rename":           handleFsRename,
		"fs.copy":             handleFsCopy,
		"fs.move":             handleFsMove,
		"fs.presign":          handleFsPresign,
		"fs.download_sign":    handleFsDownloadSign,
		"fs.extract":          handleFsExtract,
		"fs.compress":         handleFsCompress,
		"fs.check_password":   handleFsCheckPassword,
		"fs.offline_download": handleFsOfflineDownload,
		"fs.stat":             handleFsStat,
		"fs.stat_cancel":      handleFsStatCancel,
		"fs.watch":            handleFsWatch,
		"fs.unwatch":          handleFsUnwatch,
		"fs.trash_list":       handleFsTrashList,
		"fs.trash_restore":    handleFsTrashRestore,
		"fs.trash_delete":     handleFsTrashDelete,
		"fs.trash_empty":      handleFsTrashEmpty,
	})
}

// fsReq is the common request struct for file system operations.
type fsReq struct {
	baseReq
	NodeID string `json:"nodeId"`
	Path   string `json:"path"`
}

func handleFsList(c *WSConn, raw json.RawMessage) {
	var p fsReq
	json.Unmarshal(raw, &p)
	go func() {
		files, err := fileSvc.List(p.NodeID, p.Path)
		c.ReplyResult("fs.list", p.ReqID, files, err)
	}()
}

func handleFsSearch(c *WSConn, raw json.RawMessage) {
	var p struct {
		fsReq
		Keyword string `json:"keyword"`
	}
	json.Unmarshal(raw, &p)
	go func() {
		if p.Keyword == "" {
			c.Reply("fs.search", p.ReqID, []storage.FileInfo{})
			return
		}
		results, err := fileSvc.Search(p.NodeID, p.Path, p.Keyword, 50)
		if err != nil || results == nil {
			results = []storage.FileInfo{}
		}
		c.Reply("fs.search", p.ReqID, results)
	}()
}

func handleFsRead(c *WSConn, raw json.RawMessage) {
	var p fsReq
	json.Unmarshal(raw, &p)
	go func() {
		content, err := fileSvc.Read(p.NodeID, p.Path)
		if err != nil {
			c.ReplyErr("fs.error", p.ReqID, err)
		} else {
			c.Reply("fs.read", p.ReqID, map[string]string{
				"path":    p.Path,
				"content": string(content),
			})
		}
	}()
}

func handleFsWrite(c *WSConn, raw json.RawMessage) {
	var p struct {
		fsReq
		Content string `json:"content"`
	}
	json.Unmarshal(raw, &p)
	go func() {
		if err := fileSvc.Write(p.NodeID, p.Path, []byte(p.Content)); err != nil {
			c.ReplyErr("fs.error", p.ReqID, err)
		} else {
			c.Reply("fs.write", p.ReqID, map[string]string{"path": p.Path})
		}
	}()
}

func handleFsMkdir(c *WSConn, raw json.RawMessage) {
	var p struct {
		fsReq
		Name string `json:"name"`
	}
	json.Unmarshal(raw, &p)
	go func() {
		fullPath, err := fileSvc.CreateDir(p.NodeID, p.Path, p.Name)
		if err != nil {
			c.ReplyErr("fs.error", p.ReqID, err)
		} else {
			c.Reply("fs.mkdir", p.ReqID, map[string]string{"path": fullPath})
		}
	}()
}

func handleFsCreate(c *WSConn, raw json.RawMessage) {
	var p struct {
		fsReq
		Name string `json:"name"`
	}
	json.Unmarshal(raw, &p)
	go func() {
		fullPath, err := fileSvc.CreateFile(p.NodeID, p.Path, p.Name)
		if err != nil {
			c.ReplyErr("fs.error", p.ReqID, err)
		} else {
			c.Reply("fs.create", p.ReqID, map[string]string{"path": fullPath})
		}
	}()
}

func handleFsDelete(c *WSConn, raw json.RawMessage) {
	var p struct {
		fsReq
		Paths []string `json:"paths"`
	}
	json.Unmarshal(raw, &p)

	paths := p.Paths
	if len(paths) == 0 && p.Path != "" {
		paths = []string{p.Path}
	}
	if len(paths) == 0 {
		c.ReplyErr("fs.error", p.ReqID, errRequired("paths"))
		return
	}
	nodeID := p.NodeID

	title := "删除文件"
	if len(paths) == 1 {
		title = "移到回收站 " + filepath.Base(paths[0])
	} else {
		title = fmt.Sprintf("移到回收站 %d 个项目", len(paths))
	}

	service.GetTaskManager().Submit("fs_delete", title, func(ctx context.Context, r *service.ProgressReporter) (string, error) {
		total := int64(len(paths))
		for i, pa := range paths {
			if err := fileSvc.Delete(nodeID, pa); err != nil {
				return "", fmt.Errorf("delete %s: %w", filepath.Base(pa), err)
			}
			progress := float64(i+1) / float64(total)
			r.Report(progress, int64(i+1), total, 0, 0, filepath.Base(pa))
		}
		c.Notify("fs.trash_changed", map[string]interface{}{"nodeId": nodeID})
		return "", nil
	})

	c.Reply("fs.delete", p.ReqID, nil)
}

func handleFsRename(c *WSConn, raw json.RawMessage) {
	var p struct {
		fsReq
		OldName string `json:"oldName"`
		NewName string `json:"newName"`
	}
	json.Unmarshal(raw, &p)
	go func() {
		newPath, err := fileSvc.Rename(p.NodeID, p.Path, p.OldName, p.NewName)
		if err != nil {
			c.ReplyErr("fs.error", p.ReqID, err)
		} else {
			c.Reply("fs.rename", p.ReqID, map[string]string{"path": newPath})
		}
	}()
}

func handleFsCopy(c *WSConn, raw json.RawMessage) {
	var p struct {
		fsReq
		DstNodeID string   `json:"dstNodeId"`
		From      string   `json:"from"`
		To        string   `json:"to"`
		Paths     []string `json:"paths"`
	}
	json.Unmarshal(raw, &p)

	paths := p.Paths
	if len(paths) == 0 && p.From != "" {
		paths = []string{p.From}
	}
	if len(paths) == 0 {
		c.ReplyErr("fs.error", p.ReqID, errRequired("paths"))
		return
	}
	srcNodeID := p.NodeID
	dstNodeID := p.DstNodeID
	if dstNodeID == "" {
		dstNodeID = srcNodeID
	}
	to := p.To
	crossStorage := srcNodeID != dstNodeID

	title := "复制文件"
	if len(paths) == 1 {
		title = "复制 " + filepath.Base(paths[0])
	} else {
		title = fmt.Sprintf("复制 %d 个项目", len(paths))
	}

	service.GetTaskManager().Submit("fs_copy", title, func(ctx context.Context, r *service.ProgressReporter) (string, error) {
		total := int64(len(paths))
		for i, pa := range paths {
			progress := func(written, size int64) {
				itemProgress := float64(0)
				if size > 0 {
					itemProgress = float64(written) / float64(size)
				}
				overall := (float64(i) + itemProgress) / float64(total)
				r.Report(overall, int64(i+1), total, written, size, filepath.Base(pa))
			}
			if crossStorage {
				if err := fileSvc.CopyAcross(srcNodeID, pa, dstNodeID, to, progress); err != nil {
					return "", fmt.Errorf("copy %s: %w", filepath.Base(pa), err)
				}
			} else {
				if _, err := fileSvc.Copy(srcNodeID, pa, to, progress); err != nil {
					return "", fmt.Errorf("copy %s: %w", filepath.Base(pa), err)
				}
			}
		}
		return "", nil
	})

	c.Reply("fs.copy", p.ReqID, nil)
}

func handleFsMove(c *WSConn, raw json.RawMessage) {
	var p struct {
		fsReq
		DstNodeID string   `json:"dstNodeId"`
		From      string   `json:"from"`
		To        string   `json:"to"`
		Paths     []string `json:"paths"`
	}
	json.Unmarshal(raw, &p)

	paths := p.Paths
	if len(paths) == 0 && p.From != "" {
		paths = []string{p.From}
	}
	if len(paths) == 0 {
		c.ReplyErr("fs.error", p.ReqID, errRequired("paths"))
		return
	}
	srcNodeID := p.NodeID
	dstNodeID := p.DstNodeID
	if dstNodeID == "" {
		dstNodeID = srcNodeID
	}
	to := p.To
	crossStorage := srcNodeID != dstNodeID

	title := "移动文件"
	if len(paths) == 1 {
		title = "移动 " + filepath.Base(paths[0])
	} else {
		title = fmt.Sprintf("移动 %d 个项目", len(paths))
	}

	service.GetTaskManager().Submit("fs_move", title, func(ctx context.Context, r *service.ProgressReporter) (string, error) {
		total := int64(len(paths))
		for i, pa := range paths {
			progress := func(written, size int64) {
				itemProgress := float64(0)
				if size > 0 {
					itemProgress = float64(written) / float64(size)
				}
				overall := (float64(i) + itemProgress) / float64(total)
				r.Report(overall, int64(i+1), total, written, size, filepath.Base(pa))
			}
			if crossStorage {
				if err := fileSvc.MoveAcross(srcNodeID, pa, dstNodeID, to, progress); err != nil {
					return "", fmt.Errorf("move %s: %w", filepath.Base(pa), err)
				}
			} else {
				if _, err := fileSvc.Move(srcNodeID, pa, to); err != nil {
					return "", fmt.Errorf("move %s: %w", filepath.Base(pa), err)
				}
			}
		}
		return "", nil
	})

	c.Reply("fs.move", p.ReqID, nil)
}

func handleFsPresign(c *WSConn, raw json.RawMessage) {
	var p struct {
		fsReq
		Method string `json:"method"`
	}
	json.Unmarshal(raw, &p)
	if p.Method == "" {
		p.Method = "GET"
	}
	go func() {
		expires := 6 * time.Hour
		var presignURL string
		var err error
		switch p.Method {
		case "GET":
			presignURL, err = fileSvc.PresignGetURL(p.NodeID, p.Path, expires)
		case "PUT":
			presignURL, err = fileSvc.PresignPutURL(p.NodeID, p.Path, expires)
		default:
			c.ReplyErr("fs.error", p.ReqID, fmt.Errorf("method must be GET or PUT"))
			return
		}
		if err != nil {
			c.ReplyErr("fs.error", p.ReqID, err)
		} else {
			c.Reply("fs.presign", p.ReqID, map[string]string{
				"url":    presignURL,
				"method": p.Method,
			})
		}
	}()
}
func handleFsDownloadSign(c *WSConn, raw json.RawMessage) {
	var p fsReq
	json.Unmarshal(raw, &p)
	go func() {
		exp, sign := auth.GenerateDownloadSign(p.NodeID, p.Path, 6*60*60)
		c.Reply("fs.download_sign", p.ReqID, map[string]interface{}{
			"nodeId": p.NodeID,
			"path":   p.Path,
			"exp":    exp,
			"sign":   sign,
		})
	}()
}

func handleFsExtract(c *WSConn, raw json.RawMessage) {
	var p struct {
		fsReq
		Dest     string `json:"dest"`
		Password string `json:"password"`
	}
	json.Unmarshal(raw, &p)

	dest := p.Dest
	if dest == "" {
		dest = filepath.Dir(p.Path)
	}
	nodeID, path, password := p.NodeID, p.Path, p.Password
	fileName := filepath.Base(path)

	// 同步前置检查：加密检测 + 密码校验
	// 这些操作很快（读文件头 / test 命令），必须在提交任务前完成，否则前端收不到错误码
	ext := strings.ToLower(filepath.Ext(path))
	if ext == ".zip" || ext == ".rar" || ext == ".7z" {
		encrypted, err := fileSvc.CheckArchivePassword(nodeID, path)
		if err != nil {
			c.ReplyErr("fs.extract", p.ReqID, err)
			return
		}
		if encrypted {
			if password == "" {
				c.ReplyCodeErr("fs.extract", p.ReqID, ErrCodePasswordRequired, "archive is encrypted and requires a password", nil)
				return
			}
			// 有密码，验证是否正确
			if err := fileSvc.VerifyArchivePassword(nodeID, path, password); err != nil {
				if errors.Is(err, service.ErrPasswordIncorrect) {
					c.ReplyCodeErr("fs.extract", p.ReqID, ErrCodePasswordIncorrect, "incorrect password for encrypted archive", nil)
					return
				}
				// 其他错误不阻塞，让 Extract 处理
			}
		}
	}

	service.GetTaskManager().Submit("fs_extract", "解压 "+fileName, func(ctx context.Context, r *service.ProgressReporter) (string, error) {
		err := fileSvc.Extract(nodeID, path, dest, password, func(progress float64, message string) {
			if progress >= 0 {
				r.Report(progress, 0, 0, 0, 0, message)
			} else {
				r.Report(0, 0, 0, 0, 0, message)
			}
		})
		if err != nil {
			return "", err
		}
		return dest, nil
	})

	c.Reply("fs.extract", p.ReqID, nil)
}

func handleFsCompress(c *WSConn, raw json.RawMessage) {
	var p struct {
		baseReq
		NodeID string   `json:"nodeId"`
		Paths  []string `json:"paths"`
		Output string   `json:"output"`
	}
	json.Unmarshal(raw, &p)

	if len(p.Paths) == 0 {
		c.ReplyErr("fs.error", p.ReqID, errRequired("paths"))
		return
	}
	if p.Output == "" {
		c.ReplyErr("fs.error", p.ReqID, errRequired("output"))
		return
	}
	paths, output, nodeID := p.Paths, p.Output, p.NodeID
	archiveName := filepath.Base(output)

	service.GetTaskManager().Submit("fs_compress", "压缩 "+archiveName, func(ctx context.Context, r *service.ProgressReporter) (string, error) {
		err := fileSvc.Compress(nodeID, paths, output, func(progress float64, message string) {
			if progress >= 0 {
				r.Report(progress, 0, 0, 0, 0, message)
			} else {
				r.Report(0, 0, 0, 0, 0, message)
			}
		})
		if err != nil {
			return "", err
		}
		return output, nil
	})

	c.Reply("fs.compress", p.ReqID, nil)
}
func handleFsCheckPassword(c *WSConn, raw json.RawMessage) {
	var p fsReq
	json.Unmarshal(raw, &p)
	go func() {
		needsPassword, err := fileSvc.CheckArchivePassword(p.NodeID, p.Path)
		if err != nil {
			c.ReplyErr("fs.check_password", p.ReqID, err)
		} else {
			c.Reply("fs.check_password", p.ReqID, map[string]bool{"needsPassword": needsPassword})
		}
	}()
}

func handleFsOfflineDownload(c *WSConn, raw json.RawMessage) {
	var p struct {
		fsReq
		URLs []string `json:"urls"`
	}
	json.Unmarshal(raw, &p)

	if len(p.URLs) == 0 {
		c.ReplyErr("fs.error", p.ReqID, errRequired("urls"))
		return
	}
	nodeID := p.NodeID
	destDir := p.Path
	for _, u := range p.URLs {
		if !strings.HasPrefix(u, "http://") && !strings.HasPrefix(u, "https://") {
			c.ReplyErr("fs.offline_download", p.ReqID, fmt.Errorf("URL must start with http:// or https://: %s", u))
			continue
		}
		dlURL := u
		title := "下载 " + filepath.Base(dlURL)
		if len(title) > 60 {
			title = title[:57] + "..."
		}
		service.GetTaskManager().Submit("offline_download", title, func(ctx context.Context, r *service.ProgressReporter) (string, error) {
			return service.DoOfflineDownload(ctx, dlURL, nodeID, destDir, r)
		})
	}
	c.Reply("fs.offline_download", p.ReqID, nil)
}

func handleFsTrashList(c *WSConn, raw json.RawMessage) {
	var p fsReq
	json.Unmarshal(raw, &p)
	go func() {
		items, err := fileSvc.ListTrash(p.NodeID)
		c.ReplyResult("fs.trash_list", p.ReqID, items, err)
	}()
}

func handleFsTrashRestore(c *WSConn, raw json.RawMessage) {
	var p struct {
		fsReq
		TrashIDs []string `json:"trashIds"`
	}
	json.Unmarshal(raw, &p)
	go func() {
		var restored []string
		for _, id := range p.TrashIDs {
			destPath, err := fileSvc.RestoreFromTrash(p.NodeID, id)
			if err != nil {
				c.ReplyErr("fs.error", p.ReqID, fmt.Errorf("restore %s: %w", id, err))
				return
			}
			restored = append(restored, destPath)
		}
		c.Reply("fs.trash_restore", p.ReqID, map[string]interface{}{"restored": restored})
	}()
}

func handleFsTrashDelete(c *WSConn, raw json.RawMessage) {
	var p struct {
		fsReq
		TrashIDs []string `json:"trashIds"`
	}
	json.Unmarshal(raw, &p)
	go func() {
		for _, id := range p.TrashIDs {
			if err := fileSvc.TrashDelete(p.NodeID, id); err != nil {
				c.ReplyErr("fs.error", p.ReqID, fmt.Errorf("delete %s: %w", id, err))
				return
			}
		}
		c.Reply("fs.trash_delete", p.ReqID, nil)
	}()
}

func handleFsTrashEmpty(c *WSConn, raw json.RawMessage) {
	var p fsReq
	json.Unmarshal(raw, &p)
	go func() {
		err := fileSvc.EmptyTrash(p.NodeID)
		c.ReplyResult("fs.trash_empty", p.ReqID, nil, err)
	}()
}

func handleFsWatch(c *WSConn, raw json.RawMessage) {
	var p struct {
		NodeID string `json:"nodeId"`
		Path   string `json:"path"`
	}
	json.Unmarshal(raw, &p)

	watchKey := p.NodeID + ":" + p.Path
	if _, exists := c.FsWatches[watchKey]; exists {
		return
	}
	driver, err := storage.GetDriver(p.NodeID)
	if err != nil {
		c.Notify("fs.error", map[string]string{"message": "fs_watch: " + err.Error()})
		return
	}
	if _, ok := driver.(*storage.LocalDriver); !ok {
		return
	}
	absPath := storage.ExpandHome(storage.FromClientPath(p.Path))
	nodeID := p.NodeID
	watchPath := p.Path
	connID := c.ConnID
	err = c.FileWatcher.Subscribe(absPath, connID, func() {
		files, err := fileSvc.List(nodeID, watchPath)
		if err != nil {
			return
		}
		c.Notify("fs.watch", map[string]interface{}{
			"nodeId": nodeID,
			"path":   watchPath,
			"files":  files,
		})
	})
	if err != nil {
		c.Notify("fs.error", map[string]string{"message": "fs_watch subscribe: " + err.Error()})
	} else {
		c.FsWatches[watchKey] = absPath
	}
}
func handleFsStat(c *WSConn, raw json.RawMessage) {
	var p fsReq
	json.Unmarshal(raw, &p)
	go func() {
		info, err := fileSvc.StatBasic(p.NodeID, p.Path)
		if err != nil {
			c.ReplyErr("fs.stat", p.ReqID, err)
			return
		}
		c.Reply("fs.stat", p.ReqID, info)
		if info.IsDir {
			ctx, cancel := context.WithCancel(context.Background())
			defer cancel()

			// Register cancel so it can be stopped via cancel message
			cancelKey := "fs_stat:" + p.NodeID + ":" + p.Path
			c.CancelMu.Lock()
			c.Cancels[cancelKey] = cancel
			c.CancelMu.Unlock()
			defer func() {
				c.CancelMu.Lock()
				delete(c.Cancels, cancelKey)
				c.CancelMu.Unlock()
			}()

			// Cancel context when connection closes
			done := make(chan struct{})
			go func() {
				select {
				case <-c.Done:
					cancel()
				case <-done:
				}
			}()
			totalSize, itemCount := fileSvc.CalcDirSize(ctx, p.NodeID, p.Path)
			close(done) // release the goroutine above
			select {
			case <-ctx.Done():
				return
			default:
			}
			c.Notify("fs.stat_size", map[string]interface{}{
				"path":      p.Path,
				"nodeId":    p.NodeID,
				"size":      totalSize,
				"itemCount": itemCount,
			})
		}
	}()
}

func handleFsStatCancel(c *WSConn, raw json.RawMessage) {
	var p fsReq
	json.Unmarshal(raw, &p)
	cancelKey := "fs_stat:" + p.NodeID + ":" + p.Path
	c.CancelMu.Lock()
	if cancel, ok := c.Cancels[cancelKey]; ok {
		cancel()
		delete(c.Cancels, cancelKey)
	}
	c.CancelMu.Unlock()
}

func handleFsUnwatch(c *WSConn, raw json.RawMessage) {
	var p struct {
		NodeID string `json:"nodeId"`
		Path   string `json:"path"`
	}
	json.Unmarshal(raw, &p)

	watchKey := p.NodeID + ":" + p.Path
	if absPath, exists := c.FsWatches[watchKey]; exists {
		c.FileWatcher.Unsubscribe(absPath, c.ConnID)
		delete(c.FsWatches, watchKey)
	}
}


