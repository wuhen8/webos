package handler

import (
	"encoding/json"

	"webos-backend/internal/database"
)

func init() {
	RegisterHandlers(map[string]Handler{
		"api_token.list":   handleAPITokenList,
		"api_token.create": handleAPITokenCreate,
		"api_token.delete": handleAPITokenDelete,
	})
}

func handleAPITokenList(c *WSConn, raw json.RawMessage) {
	var p struct{ baseReq }
	json.Unmarshal(raw, &p)
	go func() {
		tokens, err := database.ListAPITokens()
		c.ReplyResult("api_token.list", p.ReqID, tokens, err)
	}()
}

func handleAPITokenCreate(c *WSConn, raw json.RawMessage) {
	var p struct {
		baseReq
		Name      string `json:"name"`
		ExpiresIn int64  `json:"expiresIn"` // seconds, 0 = never
	}
	json.Unmarshal(raw, &p)
	go func() {
		token, err := database.CreateAPIToken(p.Name, p.ExpiresIn)
		c.ReplyResult("api_token.create", p.ReqID, token, err)
	}()
}

func handleAPITokenDelete(c *WSConn, raw json.RawMessage) {
	var p struct {
		baseReq
		ID int64 `json:"id"`
	}
	json.Unmarshal(raw, &p)
	go func() {
		c.ReplyResult("api_token.delete", p.ReqID, nil, database.DeleteAPIToken(p.ID))
	}()
}
