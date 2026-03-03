package handler

import (
	"context"
	"encoding/json"

	"webos-backend/internal/service"
)

func init() {
	RegisterHandlers(map[string]Handler{
		"webapp_list": asyncHandler[struct{ baseReq }]("webapp_list", func(c *WSConn, p struct{ baseReq }) (interface{}, error) {
			return service.ScanWebApps()
		}),
		"webapp_install":   handleWebAppInstall,
		"webapp_uninstall": handleWebAppUninstall,
	})
}

func handleWebAppInstall(c *WSConn, raw json.RawMessage) {
	var p appReq
	json.Unmarshal(raw, &p)
	if p.AppID == "" {
		c.ReplyErr("webapp_install", p.ReqID, errRequired("appId"))
		return
	}
	appID := p.AppID
	service.GetTaskManager().Submit("appstore_install", "安装 "+appID, func(ctx context.Context, r *service.ProgressReporter) (string, error) {
		catalogApp, err := service.FindCatalogApp(appID)
		if err != nil {
			return "", err
		}
		if err := service.InstallWebAppFromCatalog(ctx, appID, catalogApp, r); err != nil {
			return "", err
		}
		return "应用 " + appID + " 安装成功", nil
	})
	c.Reply("webapp_install", p.ReqID, nil)
}

func handleWebAppUninstall(c *WSConn, raw json.RawMessage) {
	var p appReq
	json.Unmarshal(raw, &p)
	if p.AppID == "" {
		c.ReplyErr("webapp_uninstall", p.ReqID, errRequired("appId"))
		return
	}
	go func() {
		c.ReplyResult("webapp_uninstall", p.ReqID, nil, service.UninstallWebApp(p.AppID))
	}()
}
