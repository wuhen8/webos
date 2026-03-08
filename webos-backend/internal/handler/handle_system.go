package handler

import (
	"context"
	"encoding/json"
	"fmt"

	"webos-backend/internal/service"
)

func init() {
	RegisterHandlers(map[string]Handler{
		"system.check_update": asyncHandler[struct{ baseReq }]("system.check_update", func(c *WSConn, p struct{ baseReq }) (interface{}, error) {
			return service.CheckUpdate()
		}),
		"system.do_update": handleSystemDoUpdate,
		"system.exec":      handleExec,
	})
}

func handleSystemDoUpdate(c *WSConn, raw json.RawMessage) {
	var p struct{ baseReq }
	json.Unmarshal(raw, &p)
	service.GetTaskManager().Submit("system.update", "系统更新", func(ctx context.Context, r *service.ProgressReporter) (string, error) {
		if err := service.DoSystemUpdate(ctx, r); err != nil {
			return "", err
		}
		return "系统更新完成", nil
	})
	c.Reply("system.do_update", p.ReqID, nil)
}

// handleExec handles "system.exec" messages.
func handleExec(c *WSConn, raw json.RawMessage) {
	var p struct {
		baseReq
		Command         string   `json:"command"`
		Background      bool     `json:"background"`
		Title           string   `json:"title"`
		RefreshChannels []string `json:"refreshChannels"`
	}
	json.Unmarshal(raw, &p)

	if p.Background {
		title := p.Title
		if title == "" {
			title = p.Command
		}
		var opts []service.SubmitOption
		if len(p.RefreshChannels) > 0 {
			opts = append(opts, service.WithRefreshChannels(p.RefreshChannels))
		}
		service.GetTaskManager().Submit("exec", title, func(ctx context.Context, r *service.ProgressReporter) (string, error) {
			stdout, stderr, exitCode, err := systemSvc.Exec(p.Command)
			if err != nil {
				return "", fmt.Errorf("exec failed: %w", err)
			}
			if exitCode != 0 {
				msg := stderr
				if msg == "" {
					msg = stdout
				}
				return "", fmt.Errorf("%s", msg)
			}
			return title + "成功", nil
		}, opts...)
		c.Reply("system.exec", p.ReqID, map[string]interface{}{
			"background": true,
		})
		return
	}

	go func() {
		stdout, stderr, exitCode, err := systemSvc.Exec(p.Command)
		if err != nil {
			c.ReplyErr("system.exec", p.ReqID, fmt.Errorf("exec failed: %w", err))
		} else {
			c.Reply("system.exec", p.ReqID, map[string]interface{}{
				"exitCode": exitCode,
				"stdout":   stdout,
				"stderr":   stderr,
			})
		}
	}()
}
