package handler

import (
	"encoding/json"

	"webos-backend/internal/service"
)

func init() {
	RegisterHandlers(map[string]Handler{
		// Storage node mutations (read via pubsub subscribe "sub.storage_nodes")
		"settings.storage_node_add":    handleStorageNodeAdd,
		"settings.storage_node_update": handleStorageNodeUpdate,
		"settings.storage_node_delete": handleStorageNodeDelete,
		// Preferences
		"settings.preferences_get": asyncHandler[struct{ baseReq }]("settings.preferences_get", func(c *WSConn, p struct{ baseReq }) (interface{}, error) {
			return service.GetPreferences()
		}),
		"settings.preferences_save":  handlePreferencesSave,
		"settings.preferences_reset": asyncHandler[struct{ baseReq }]("settings.preferences_reset", func(c *WSConn, p struct{ baseReq }) (interface{}, error) {
			return service.ResetPreferences()
		}),
		// Sidebar mutation (read via pubsub subscribe "sub.sidebar")
		"settings.sidebar_save": handleSidebarSave,
		// App overrides
		"settings.app_overrides_get": asyncHandler[struct{ baseReq }]("settings.app_overrides_get", func(c *WSConn, p struct{ baseReq }) (interface{}, error) {
			return service.GetAppOverrides()
		}),
		"settings.app_override_save":   handleAppOverrideSave,
		"settings.app_override_delete": handleAppOverrideDelete,
	})
}

type storageNodeReq struct {
	baseReq
	ID       string                 `json:"id"`
	StName   string                 `json:"stName"`
	StType   string                 `json:"stType"`
	StConfig map[string]interface{} `json:"stConfig"`
}

func handleStorageNodeAdd(c *WSConn, raw json.RawMessage) {
	var p storageNodeReq
	json.Unmarshal(raw, &p)
	go func() {
		id, err := service.AddStorageNode(p.StName, p.StType, p.StConfig)
		if err != nil {
			c.ReplyErr("error", p.ReqID, err)
		} else {
			c.Reply("settings.storage_node_add", p.ReqID, map[string]string{"id": id})
			service.NotifyStorageNodesChanged()
		}
	}()
}

func handleStorageNodeUpdate(c *WSConn, raw json.RawMessage) {
	var p storageNodeReq
	json.Unmarshal(raw, &p)
	go func() {
		if err := service.UpdateStorageNode(p.ID, p.StName, p.StType, p.StConfig); err != nil {
			c.ReplyErr("error", p.ReqID, err)
		} else {
			c.Reply("settings.storage_node_update", p.ReqID, nil)
			service.NotifyStorageNodesChanged()
		}
	}()
}

func handleStorageNodeDelete(c *WSConn, raw json.RawMessage) {
	var p struct {
		baseReq
		ID string `json:"id"`
	}
	json.Unmarshal(raw, &p)
	go func() {
		if err := service.DeleteStorageNode(p.ID); err != nil {
			c.ReplyErr("error", p.ReqID, err)
		} else {
			c.Reply("settings.storage_node_delete", p.ReqID, nil)
			service.NotifyStorageNodesChanged()
		}
	}()
}

func handlePreferencesSave(c *WSConn, raw json.RawMessage) {
	var p struct {
		baseReq
		Prefs map[string]interface{} `json:"prefs"`
	}
	json.Unmarshal(raw, &p)
	go func() {
		if err := service.SavePreferences(p.Prefs); err != nil {
			c.ReplyErr("error", p.ReqID, err)
		} else {
			c.Reply("settings.preferences_save", p.ReqID, nil)
		}
	}()
}

func handleSidebarSave(c *WSConn, raw json.RawMessage) {
	var p struct {
		baseReq
		Items json.RawMessage `json:"items"`
	}
	json.Unmarshal(raw, &p)
	go func() {
		var items []*service.SidebarItemDTO
		if err := json.Unmarshal(p.Items, &items); err != nil {
			c.ReplyErr("error", p.ReqID, err)
			return
		}
		if err := service.SaveSidebar(items); err != nil {
			c.ReplyErr("error", p.ReqID, err)
		} else {
			c.Reply("settings.sidebar_save", p.ReqID, nil)
			service.NotifySidebarChanged()
		}
	}()
}

func handleAppOverrideSave(c *WSConn, raw json.RawMessage) {
	var p struct {
		baseReq
		ID        string                 `json:"id"`
		Overrides map[string]interface{} `json:"overrides"`
	}
	json.Unmarshal(raw, &p)
	if p.ID == "" {
		c.ReplyErr("error", p.ReqID, errRequired("id"))
		return
	}
	go func() {
		if err := service.SaveAppOverride(p.ID, p.Overrides); err != nil {
			c.ReplyErr("error", p.ReqID, err)
		} else {
			c.Reply("settings.app_override_save", p.ReqID, nil)
		}
	}()
}

func handleAppOverrideDelete(c *WSConn, raw json.RawMessage) {
	var p struct {
		baseReq
		ID string `json:"id"`
	}
	json.Unmarshal(raw, &p)
	if p.ID == "" {
		c.ReplyErr("error", p.ReqID, errRequired("id"))
		return
	}
	go func() {
		if err := service.DeleteAppOverride(p.ID); err != nil {
			c.ReplyErr("error", p.ReqID, err)
		} else {
			c.Reply("settings.app_override_delete", p.ReqID, nil)
		}
	}()
}
