package handler

import (
	"encoding/json"
	"fmt"
	"log"

	"webos-backend/internal/service"
)

func init() {
	RegisterHandlers(map[string]Handler{
		"ip_guard.status": asyncHandler[struct{ baseReq }]("ip_guard.status", func(c *WSConn, p struct{ baseReq }) (interface{}, error) {
			svc := service.GetIPGuardService()
			return map[string]interface{}{
				"enabled": svc.IsEnabled(),
			}, nil
		}),
		"ip_guard.enable":  handleIPGuardEnable,
		"ip_guard.disable": handleIPGuardDisable,
		"ip_guard.list": asyncHandler[struct{ baseReq }]("ip_guard.list", func(c *WSConn, p struct{ baseReq }) (interface{}, error) {
			return service.GetIPGuardService().ListIPs()
		}),
		"ip_guard.approve":     handleIPGuardApprove,
		"ip_guard.reject":      handleIPGuardReject,
		"ip_guard.remove":      handleIPGuardRemove,
		"ip_guard.cidr_list": asyncHandler[struct{ baseReq }]("ip_guard.cidr_list", func(c *WSConn, p struct{ baseReq }) (interface{}, error) {
			return service.GetIPGuardService().ListCIDRs()
		}),
		"ip_guard.cidr_add":    handleIPGuardCIDRAdd,
		"ip_guard.cidr_remove": handleIPGuardCIDRRemove,
	})
}

func handleIPGuardEnable(c *WSConn, raw json.RawMessage) {
	var p struct{ baseReq }
	json.Unmarshal(raw, &p)
	go func() {
		svc := service.GetIPGuardService()
		if svc.IsEnabled() {
			c.Reply("ip_guard.enable", p.ReqID, map[string]string{"ok": "already enabled"})
			return
		}

		// Wire up notification callback
		svc.OnNewIP = func(id int64, ip, location string) {
			notifyNewIP(id, ip, location)
		}

		if err := svc.Start(); err != nil {
			c.ReplyErr("ip_guard.enable", p.ReqID, err)
			return
		}
		c.Reply("ip_guard.enable", p.ReqID, map[string]string{"ok": "enabled"})
	}()
}

func handleIPGuardDisable(c *WSConn, raw json.RawMessage) {
	var p struct{ baseReq }
	json.Unmarshal(raw, &p)
	go func() {
		svc := service.GetIPGuardService()
		if err := svc.Disable(); err != nil {
			c.ReplyErr("ip_guard.disable", p.ReqID, err)
			return
		}
		c.Reply("ip_guard.disable", p.ReqID, map[string]string{"ok": "disabled"})
	}()
}

func handleIPGuardApprove(c *WSConn, raw json.RawMessage) {
	var p struct {
		baseReq
		IP  string `json:"ip"`
		TTL int64  `json:"ttl"` // seconds, 0 = permanent
	}
	json.Unmarshal(raw, &p)
	go func() {
		if p.IP == "" {
			c.ReplyErr("ip_guard.approve", p.ReqID, fmt.Errorf("ip is required"))
			return
		}
		if err := service.GetIPGuardService().ApproveIP(p.IP, p.TTL); err != nil {
			c.ReplyErr("ip_guard.approve", p.ReqID, err)
			return
		}
		c.Reply("ip_guard.approve", p.ReqID, map[string]string{"ok": "approved"})
	}()
}

func handleIPGuardReject(c *WSConn, raw json.RawMessage) {
	var p struct {
		baseReq
		IP string `json:"ip"`
	}
	json.Unmarshal(raw, &p)
	go func() {
		if p.IP == "" {
			c.ReplyErr("ip_guard.reject", p.ReqID, fmt.Errorf("ip is required"))
			return
		}
		if err := service.GetIPGuardService().RejectIP(p.IP); err != nil {
			c.ReplyErr("ip_guard.reject", p.ReqID, err)
			return
		}
		c.Reply("ip_guard.reject", p.ReqID, map[string]string{"ok": "rejected"})
	}()
}

func handleIPGuardRemove(c *WSConn, raw json.RawMessage) {
	var p struct {
		baseReq
		IP string `json:"ip"`
	}
	json.Unmarshal(raw, &p)
	go func() {
		if p.IP == "" {
			c.ReplyErr("ip_guard.remove", p.ReqID, fmt.Errorf("ip is required"))
			return
		}
		if err := service.GetIPGuardService().RemoveIP(p.IP); err != nil {
			c.ReplyErr("ip_guard.remove", p.ReqID, err)
			return
		}
		c.Reply("ip_guard.remove", p.ReqID, map[string]string{"ok": "removed"})
	}()
}

// notifyNewIP sends a notification about a new IP access attempt via the broadcast system.
// Includes the record ID and pre-built /guard commands for quick approval via bot.
func notifyNewIP(id int64, ip, location string) {
	loc := ""
	if location != "" {
		loc = fmt.Sprintf(" (%s)", location)
	}
	// Main notification with details
	msg := fmt.Sprintf("🔔 新IP尝试访问: %s%s\n复制下方命令发送即可审批", ip, loc)
	log.Printf("[ip-guard] new IP attempt: #%d %s%s", id, ip, loc)
	doBroadcastNotify("warning", "IP访问审批", msg, "ip-guard", "")

	// Separate command message for easy one-tap approval in TG/bot
	doBroadcastNotify("info", "✅ 放行", fmt.Sprintf("/guard approve %d", id), "ip-guard", "")
}

func handleIPGuardCIDRAdd(c *WSConn, raw json.RawMessage) {
	var p struct {
		baseReq
		CIDR string `json:"cidr"`
		Note string `json:"note"`
	}
	json.Unmarshal(raw, &p)
	go func() {
		if p.CIDR == "" {
			c.ReplyErr("ip_guard.cidr_add", p.ReqID, fmt.Errorf("cidr is required"))
			return
		}
		if err := service.GetIPGuardService().AddCIDR(p.CIDR, p.Note); err != nil {
			c.ReplyErr("ip_guard.cidr_add", p.ReqID, err)
			return
		}
		c.Reply("ip_guard.cidr_add", p.ReqID, map[string]string{"ok": "added"})
	}()
}

func handleIPGuardCIDRRemove(c *WSConn, raw json.RawMessage) {
	var p struct {
		baseReq
		ID int64 `json:"id"`
	}
	json.Unmarshal(raw, &p)
	go func() {
		if err := service.GetIPGuardService().RemoveCIDR(p.ID); err != nil {
			c.ReplyErr("ip_guard.cidr_remove", p.ReqID, err)
			return
		}
		c.Reply("ip_guard.cidr_remove", p.ReqID, map[string]string{"ok": "removed"})
	}()
}
