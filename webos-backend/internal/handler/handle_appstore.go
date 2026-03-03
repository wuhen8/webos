package handler

import (
	"context"
	"encoding/json"

	"webos-backend/internal/service"
)

func init() {
	RegisterHandlers(map[string]Handler{
		"appstore_catalog": asyncHandler[struct {
			baseReq
			Refresh bool `json:"refresh"`
		}]("appstore_catalog", func(c *WSConn, p struct {
			baseReq
			Refresh bool `json:"refresh"`
		}) (interface{}, error) {
			if p.Refresh {
				service.InvalidateCatalogCache()
			}
			return service.FetchCatalog()
		}),
		"appstore_installed": asyncHandler[struct{ baseReq }]("appstore_installed", func(c *WSConn, p struct{ baseReq }) (interface{}, error) {
			return service.ListInstalledApps()
		}),
		"appstore_install":    handleAppstoreInstall,
		"appstore_uninstall":  handleAppstoreUninstall,
		"appstore_start":      handleAppstoreStart,
		"appstore_stop":       handleAppstoreStop,
		"appstore_update":     handleAppstoreUpdate,
		"appstore_app_status":    handleAppstoreAppStatus,
		"appstore_update_config": handleAppstoreUpdateConfig,

		// Skills marketplace
		"skills_catalog": asyncHandler[struct {
			baseReq
			Refresh bool `json:"refresh"`
		}]("skills_catalog", func(c *WSConn, p struct {
			baseReq
			Refresh bool `json:"refresh"`
		}) (interface{}, error) {
			if p.Refresh {
				service.InvalidateCatalogCache()
			}
			return service.FetchSkillsCatalog()
		}),
		"skills_installed": asyncHandler[struct{ baseReq }]("skills_installed", func(c *WSConn, p struct{ baseReq }) (interface{}, error) {
			return service.ListInstalledSkills()
		}),
		"skills_install":   handleSkillsInstall,
		"skills_uninstall": handleSkillsUninstall,
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
		c.ReplyErr("appstore_install", p.ReqID, errRequired("appId"))
		return
	}
	appCfg := p.AppConfig
	if appCfg == nil {
		appCfg = make(map[string]interface{})
	}
	appID := p.AppID
	service.GetTaskManager().Submit("appstore_install", "安装 "+appID, func(ctx context.Context, r *service.ProgressReporter) (string, error) {
		if err := service.InstallApp(ctx, appID, appCfg, r); err != nil {
			return "", err
		}
		return "应用 " + appID + " 安装成功", nil
	})
	c.Reply("appstore_install", p.ReqID, nil)
}

func handleAppstoreUninstall(c *WSConn, raw json.RawMessage) {
	var p appReq
	json.Unmarshal(raw, &p)
	if p.AppID == "" {
		c.ReplyErr("appstore_uninstall", p.ReqID, errRequired("appId"))
		return
	}
	appID := p.AppID
	service.GetTaskManager().Submit("appstore_uninstall", "卸载 "+appID, func(ctx context.Context, r *service.ProgressReporter) (string, error) {
		if err := service.UninstallApp(ctx, appID); err != nil {
			return "", err
		}
		return "应用 " + appID + " 已卸载", nil
	})
	c.Reply("appstore_uninstall", p.ReqID, nil)
}

func handleAppstoreStart(c *WSConn, raw json.RawMessage) {
	var p appReq
	json.Unmarshal(raw, &p)
	if p.AppID == "" {
		c.ReplyErr("appstore_start", p.ReqID, errRequired("appId"))
		return
	}
	go func() {
		c.ReplyResult("appstore_start", p.ReqID, nil, service.StartApp(p.AppID))
	}()
}

func handleAppstoreStop(c *WSConn, raw json.RawMessage) {
	var p appReq
	json.Unmarshal(raw, &p)
	if p.AppID == "" {
		c.ReplyErr("appstore_stop", p.ReqID, errRequired("appId"))
		return
	}
	go func() {
		c.ReplyResult("appstore_stop", p.ReqID, nil, service.StopApp(p.AppID))
	}()
}

func handleAppstoreUpdate(c *WSConn, raw json.RawMessage) {
	var p appReq
	json.Unmarshal(raw, &p)
	if p.AppID == "" {
		c.ReplyErr("appstore_update", p.ReqID, errRequired("appId"))
		return
	}
	appID := p.AppID
	service.GetTaskManager().Submit("appstore_update", "更新 "+appID, func(ctx context.Context, r *service.ProgressReporter) (string, error) {
		if err := service.UpdateApp(ctx, appID, r); err != nil {
			return "", err
		}
		return "应用 " + appID + " 更新成功", nil
	})
	c.Reply("appstore_update", p.ReqID, nil)
}

func handleAppstoreAppStatus(c *WSConn, raw json.RawMessage) {
	var p appReq
	json.Unmarshal(raw, &p)
	if p.AppID == "" {
		c.ReplyErr("appstore_app_status", p.ReqID, errRequired("appId"))
		return
	}
	go func() {
		app, err := service.GetAppStatus(p.AppID)
		c.ReplyResult("appstore_app_status", p.ReqID, app, err)
	}()
}

func handleAppstoreUpdateConfig(c *WSConn, raw json.RawMessage) {
	var p struct {
		appReq
		AppConfig map[string]interface{} `json:"appConfig"`
	}
	json.Unmarshal(raw, &p)
	if p.AppID == "" {
		c.ReplyErr("appstore_update_config", p.ReqID, errRequired("appId"))
		return
	}
	go func() {
		err := service.UpdateAppConfig(p.AppID, p.AppConfig)
		c.ReplyResult("appstore_update_config", p.ReqID, nil, err)
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
		c.ReplyErr("skills_install", p.ReqID, errRequired("skillId"))
		return
	}
	if p.ZipURL == "" {
		c.ReplyErr("skills_install", p.ReqID, errRequired("zipUrl"))
		return
	}
	skillID := p.SkillID
	zipURL := p.ZipURL
	go func() {
		err := service.InstallSkill(context.Background(), skillID, zipURL)
		c.ReplyResult("skills_install", p.ReqID, nil, err)
	}()
}

func handleSkillsUninstall(c *WSConn, raw json.RawMessage) {
	var p skillReq
	json.Unmarshal(raw, &p)
	if p.SkillID == "" {
		c.ReplyErr("skills_uninstall", p.ReqID, errRequired("skillId"))
		return
	}
	go func() {
		err := service.UninstallSkill(p.SkillID)
		c.ReplyResult("skills_uninstall", p.ReqID, nil, err)
	}()
}
