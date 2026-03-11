package handler

import (
	"encoding/json"
	"fmt"
	"log"

	"webos-backend/internal/service"
)

// InitFirewall wires up the notification callback and auto-restores
// the firewall service. Must be called from main after DB is initialized.
func InitFirewall() {
	service.InitFirewall(func(id int64, ip, location string) {
		notifyNewIP(id, ip, location)
	})
}

func init() {
	RegisterHandlers(map[string]Handler{
		// Unified firewall
		"firewall.status":  handleFirewallStatus,
		"firewall.enable":  handleFirewallEnable,
		"firewall.disable": handleFirewallDisable,

		// Rule management
		"firewall.rules.list":   handleFirewallRulesList,
		"firewall.rules.add":    handleFirewallRulesAdd,
		"firewall.rules.remove": handleFirewallRulesRemove,

		// IP guard (part of firewall, no separate enable/disable)
		"ip_guard.list":        handleIPGuardList,
		"ip_guard.approve":     handleIPGuardApprove,
		"ip_guard.reject":      handleIPGuardReject,
		"ip_guard.remove":      handleIPGuardRemove,
		"ip_guard.cidr_list":   handleIPGuardCIDRList,
		"ip_guard.cidr_add":    handleIPGuardCIDRAdd,
		"ip_guard.cidr_remove": handleIPGuardCIDRRemove,
	})
}

// ==================== Firewall Status ====================

func handleFirewallStatus(c *WSConn, raw json.RawMessage) {
	var p struct{ baseReq }
	json.Unmarshal(raw, &p)
	svc := service.GetFirewallService()
	c.Reply("firewall.status", p.ReqID, map[string]interface{}{
		"enabled": svc.IsEnabled(),
	})
}

func handleFirewallEnable(c *WSConn, raw json.RawMessage) {
	var p struct{ baseReq }
	json.Unmarshal(raw, &p)
	go func() {
		if err := service.GetFirewallService().Enable(); err != nil {
			c.ReplyErr("firewall.enable", p.ReqID, err)
			return
		}
		c.Reply("firewall.enable", p.ReqID, map[string]string{"ok": "enabled"})
	}()
}

func handleFirewallDisable(c *WSConn, raw json.RawMessage) {
	var p struct{ baseReq }
	json.Unmarshal(raw, &p)
	go func() {
		if err := service.GetFirewallService().Disable(); err != nil {
			c.ReplyErr("firewall.disable", p.ReqID, err)
			return
		}
		c.Reply("firewall.disable", p.ReqID, map[string]string{"ok": "disabled"})
	}()
}

// ==================== Rule Management ====================

func handleFirewallRulesList(c *WSConn, raw json.RawMessage) {
	var p struct {
		baseReq
		Table string `json:"table"` // filter or nat
	}
	json.Unmarshal(raw, &p)
	if p.Table == "" {
		p.Table = "filter"
	}
	go func() {
		rules, err := service.GetFirewallService().ListRules(p.Table)
		if err != nil {
			c.ReplyErr("firewall.rules.list", p.ReqID, err)
			return
		}
		c.Reply("firewall.rules.list", p.ReqID, rules)
	}()
}

func handleFirewallRulesAdd(c *WSConn, raw json.RawMessage) {
	var p struct {
		baseReq
		Table       string `json:"table"`
		Chain       string `json:"chain"`
		RuleSpec    string `json:"ruleSpec"`
		Comment     string `json:"comment"`
		InsertFirst bool   `json:"insertFirst"`
	}
	json.Unmarshal(raw, &p)
	go func() {
		if p.Chain == "" || p.RuleSpec == "" {
			c.ReplyErr("firewall.rules.add", p.ReqID, fmt.Errorf("chain and ruleSpec are required"))
			return
		}
		if p.Table == "" {
			p.Table = "filter"
		}
		id, err := service.GetFirewallService().AddRule(p.Table, p.Chain, p.RuleSpec, p.Comment, p.InsertFirst)
		if err != nil {
			c.ReplyErr("firewall.rules.add", p.ReqID, err)
			return
		}
		c.Reply("firewall.rules.add", p.ReqID, map[string]interface{}{"ok": "added", "id": id})
	}()
}

func handleFirewallRulesRemove(c *WSConn, raw json.RawMessage) {
	var p struct {
		baseReq
		ID int64 `json:"id"`
	}
	json.Unmarshal(raw, &p)
	go func() {
		if err := service.GetFirewallService().RemoveRule(p.ID); err != nil {
			c.ReplyErr("firewall.rules.remove", p.ReqID, err)
			return
		}
		c.Reply("firewall.rules.remove", p.ReqID, map[string]string{"ok": "removed"})
	}()
}

// ==================== IP Guard ====================

func handleIPGuardList(c *WSConn, raw json.RawMessage) {
	var p struct{ baseReq }
	json.Unmarshal(raw, &p)
	go func() {
		records, err := service.GetFirewallService().Guard().ListIPs()
		if err != nil {
			c.ReplyErr("ip_guard.list", p.ReqID, err)
			return
		}
		c.Reply("ip_guard.list", p.ReqID, records)
	}()
}

func handleIPGuardApprove(c *WSConn, raw json.RawMessage) {
	var p struct {
		baseReq
		IP  string `json:"ip"`
		TTL int64  `json:"ttl"`
	}
	json.Unmarshal(raw, &p)
	go func() {
		if p.IP == "" {
			c.ReplyErr("ip_guard.approve", p.ReqID, fmt.Errorf("ip is required"))
			return
		}
		if err := service.GetFirewallService().Guard().ApproveIP(p.IP, p.TTL); err != nil {
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
		if err := service.GetFirewallService().Guard().RejectIP(p.IP); err != nil {
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
		if err := service.GetFirewallService().Guard().RemoveIP(p.IP); err != nil {
			c.ReplyErr("ip_guard.remove", p.ReqID, err)
			return
		}
		c.Reply("ip_guard.remove", p.ReqID, map[string]string{"ok": "removed"})
	}()
}

func handleIPGuardCIDRList(c *WSConn, raw json.RawMessage) {
	var p struct{ baseReq }
	json.Unmarshal(raw, &p)
	go func() {
		cidrs, err := service.GetFirewallService().Guard().ListCIDRs()
		if err != nil {
			c.ReplyErr("ip_guard.cidr_list", p.ReqID, err)
			return
		}
		c.Reply("ip_guard.cidr_list", p.ReqID, cidrs)
	}()
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
		if err := service.GetFirewallService().Guard().AddCIDR(p.CIDR, p.Note); err != nil {
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
		if err := service.GetFirewallService().Guard().RemoveCIDR(p.ID); err != nil {
			c.ReplyErr("ip_guard.cidr_remove", p.ReqID, err)
			return
		}
		c.Reply("ip_guard.cidr_remove", p.ReqID, map[string]string{"ok": "removed"})
	}()
}

// notifyNewIP sends a notification about a new IP access attempt via the broadcast system.
func notifyNewIP(id int64, ip, location string) {
	loc := ""
	if location != "" {
		loc = fmt.Sprintf(" (%s)", location)
	}
	msg := fmt.Sprintf("🔔 新IP尝试访问: %s%s", ip, loc)
	log.Printf("[ip-guard] new IP attempt: #%d %s%s", id, ip, loc)
	doBroadcastNotify("warning", "IP访问审批", msg, "ip-guard", "")
	doBroadcastNotify("plain", "", fmt.Sprintf("/guard approve %d", id), "ip-guard", "")
}
