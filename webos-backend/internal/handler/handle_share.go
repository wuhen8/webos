package handler

import (
	"encoding/json"

	"webos-backend/internal/service"
)

func init() {
	RegisterHandlers(map[string]Handler{
		"share_create": handleShareCreate,
		"share_delete": handleShareDelete,
		"share_list": asyncHandler[struct{ baseReq }]("share_list", func(c *WSConn, p struct{ baseReq }) (interface{}, error) {
			return service.ListShareLinks()
		}),
	})
}

func handleShareCreate(c *WSConn, raw json.RawMessage) {
	var p struct {
		baseReq
		NodeID        string `json:"nodeId"`
		Path          string `json:"path"`
		ExpireSeconds int64  `json:"expireSeconds"`
	}
	json.Unmarshal(raw, &p)
	go func() {
		data, err := service.CreateShareLink(p.NodeID, p.Path, p.ExpireSeconds)
		c.ReplyResult("share_create", p.ReqID, data, err)
	}()
}

func handleShareDelete(c *WSConn, raw json.RawMessage) {
	var p struct {
		baseReq
		Token string `json:"token"`
	}
	json.Unmarshal(raw, &p)
	go func() {
		err := service.DeleteShareLink(p.Token)
		c.ReplyResult("share_delete", p.ReqID, nil, err)
	}()
}
