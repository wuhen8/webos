package handler

import (
	"context"
	"encoding/json"

	"webos-backend/internal/service"
)

func init() {
	RegisterHandlers(map[string]Handler{
		"appstore.catalog": asyncHandler[struct {
			baseReq
			Refresh bool `json:"refresh"`
		}]("appstore.catalog", func(c *WSConn, p struct {
			baseReq
			Refresh bool `json:"refresh"`
		}) (interface{}, error) {
			if p.Refresh {
				service.InvalidateCatalogCache()
			}
			return service.FetchCatalog()
		}),
		"appstore.installed": asyncHandler[struct{ baseReq }]("appstore.installed", func(c *WSConn, p struct{ baseReq }) (interface{}, error) {
			return service.ListInstalledApps()
		}),
		"appstore.install":       handleAppstoreInstall,
		"appstore.uninstall":     handleAppstoreUninstall,
		"appstore.start":         handleAppstoreStart,
		"appstore.stop":          handleAppstoreStop,
		"appstore.update":        handleAppstoreUpdate,
		"appstore.app_status":    handleAppstoreAppStatus,
		"appstore.update_config": handleAppstoreUpdateConfig,
		"appstore.set_autostart": handleAppstoreSetAutostart,

		// Skills marketplace
		"skills.catalog": asyncHandler[struct {
			baseReq
			Refresh bool `json:"refresh"`
		}]("skills.catalog", func(c *WSConn, p struct {
			baseReq
			Refresh bool `json:"refresh"`
		}) (interface{}, error) {
			if p.Refresh {
				service.InvalidateCatalogCache()
			}
			return service.FetchSkillsCatalog()
		}),
		"skills.installed": asyncHandler[struct{ baseReq }]("skills.installed", func(c *WSConn, p struct{ baseReq }) (interface{}, error) {
			return service.ListInstalledSkills()
		}),
		"skills.install":   handleSkillsInstall,
		"skills.uninstall": handleSkillsUninstall,
	})
}

type appReq struct {
	baseReq
	AppID string `json:"appId"`
}

func handleAppstoreInstall(c *WSConn, raw json.RawMessage) {
	var p struct {
		appReq
		AppConfig map[string]interface{} `json:"appConfig"`
	}
	json.Unmarshal(raw, &p)
	if p.AppID == "" {
		c.ReplyErr("appstore.install", p.ReqID, errRequired("appId"))
		return
	}
	appCfg := p.AppConfig
	if appCfg == nil {
		appCfg = make(map[string]interface{})
	}
	appID := p.AppID
	service.GetTaskManager().Submit("appstore.install", "安装 "+appID, func(ctx context.Context, r *service.ProgressReporter) (string, error) {
		if err := service.InstallApp(ctx, appID, appCfg, r); err != nil {
			return "", err
		}
		return "应用 " + appID + " 安装成功", nil
	})
	c.Reply("appstore.install", p.ReqID, nil)
}

func handleAppstoreUninstall(c *WSConn, raw json.RawMessage) {
	var p appReq
	json.Unmarshal(raw, &p)
	if p.AppID == "" {
		c.ReplyErr("appstore.uninstall", p.ReqID, errRequired("appId"))
		return
	}
	appID := p.AppID
	service.GetTaskManager().Submit("appstore.uninstall", "卸载 "+appID, func(ctx context.Context, r *service.ProgressReporter) (string, error) {
		if err := service.UninstallApp(ctx, appID); err != nil {
			return "", err
		}
		return "应用 " + appID + " 已卸载", nil
	})
	c.Reply("appstore.uninstall", p.ReqID, nil)
}

func handleAppstoreStart(c *WSConn, raw json.RawMessage) {
	var p appReq
	json.Unmarshal(raw, &p)
	if p.AppID == "" {
		c.ReplyErr("appstore.start", p.ReqID, errRequired("appId"))
		return
	}
	go func() {
		c.ReplyResult("appstore.start", p.ReqID, nil, service.StartApp(p.AppID))
	}()
}

func handleAppstoreStop(c *WSConn, raw json.RawMessage) {
	var p appReq
	json.Unmarshal(raw, &p)
	if p.AppID == "" {
		c.ReplyErr("appstore.stop", p.ReqID, errRequired("appId"))
		return
	}
	go func() {
		c.ReplyResult("appstore.stop", p.ReqID, nil, service.StopApp(p.AppID))
	}()
}

func handleAppstoreUpdate(c *WSConn, raw json.RawMessage) {
	var p appReq
	json.Unmarshal(raw, &p)
	if p.AppID == "" {
		c.ReplyErr("appstore.update", p.ReqID, errRequired("appId"))
		return
	}
	appID := p.AppID
	service.GetTaskManager().Submit("appstore.update", "更新 "+appID, func(ctx context.Context, r *service.ProgressReporter) (string, error) {
		if err := service.UpdateApp(ctx, appID, r); err != nil {
			return "", err
		}
		return "应用 " + appID + " 更新成功", nil
	})
	c.Reply("appstore.update", p.ReqID, nil)
}

func handleAppstoreAppStatus(c *WSConn, raw json.RawMessage) {
	var p appReq
	json.Unmarshal(raw, &p)
	if p.AppID == "" {
		c.ReplyErr("appstore.app_status", p.ReqID, errRequired("appId"))
		return
	}
	go func() {
		app, err := service.GetAppStatus(p.AppID)
		c.ReplyResult("appstore.app_status", p.ReqID, app, err)
	}()
}

func handleAppstoreUpdateConfig(c *WSConn, raw json.RawMessage) {
	var p struct {
		appReq
		AppConfig map[string]interface{} `json:"appConfig"`
	}
	json.Unmarshal(raw, &p)
	if p.AppID == "" {
		c.ReplyErr("appstore.update_config", p.ReqID, errRequired("appId"))
		return
	}
	go func() {
		err := service.UpdateAppConfig(p.AppID, p.AppConfig)
		c.ReplyResult("appstore.update_config", p.ReqID, nil, err)
	}()
}

func handleAppstoreSetAutostart(c *WSConn, raw json.RawMessage) {
	var p struct {
		appReq
		Enabled bool `json:"enabled"`
	}
	json.Unmarshal(raw, &p)
	if p.AppID == "" {
		c.ReplyErr("appstore.set_autostart", p.ReqID, errRequired("appId"))
		return
	}
	go func() {
		err := service.SetAppAutostart(p.AppID, p.Enabled)
		c.ReplyResult("appstore.set_autostart", p.ReqID, nil, err)
	}()
}

// ==================== Skills handlers ====================

type skillReq struct {
	baseReq
	SkillID string `json:"skillId"`
	ZipURL  string `json:"zipUrl"`
}

func handleSkillsInstall(c *WSConn, raw json.RawMessage) {
	var p skillReq
	json.Unmarshal(raw, &p)
	if p.SkillID == "" {
		c.ReplyErr("skills.install", p.ReqID, errRequired("skillId"))
		return
	}
	if p.ZipURL == "" {
		c.ReplyErr("skills.install", p.ReqID, errRequired("zipUrl"))
		return
	}
	skillID := p.SkillID
	zipURL := p.ZipURL
	go func() {
		err := service.InstallSkill(context.Background(), skillID, zipURL)
		c.ReplyResult("skills.install", p.ReqID, nil, err)
	}()
}

func handleSkillsUninstall(c *WSConn, raw json.RawMessage) {
	var p skillReq
	json.Unmarshal(raw, &p)
	if p.SkillID == "" {
		c.ReplyErr("skills.uninstall", p.ReqID, errRequired("skillId"))
		return
	}
	go func() {
		err := service.UninstallSkill(p.SkillID)
		c.ReplyResult("skills.uninstall", p.ReqID, nil, err)
	}()
}
