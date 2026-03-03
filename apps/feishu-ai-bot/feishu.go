package main

import (
	"encoding/json"
	"fmt"
	"strings"
)

const (
	feishuBaseURL   = "https://open.feishu.cn/open-apis"
	feishuMaxMsgLen = 30000
)

// ==================== Token 管理 ====================

var cachedToken string

func refreshToken(cb func(token string)) {
	url := feishuBaseURL + "/auth/v3/tenant_access_token/internal"
	body := fmt.Sprintf(`{"app_id":"%s","app_secret":"%s"}`, appID, appSecret)
	httpRequestAsync("POST", url, body, "Content-Type: application/json", func(resp string) {
		var r struct {
			Code              int    `json:"code"`
			Msg               string `json:"msg"`
			TenantAccessToken string `json:"tenant_access_token"`
		}
		if json.Unmarshal([]byte(resp), &r) != nil || r.Code != 0 {
			logMsg("ERROR: 获取飞书 token 失败: " + resp)
			cb("")
			return
		}
		cachedToken = r.TenantAccessToken
		cb(cachedToken)
	})
}

func withToken(cb func(token string)) {
	if cachedToken != "" {
		cb(cachedToken)
		return
	}
	refreshToken(cb)
}

// ==================== 发送消息 ====================

type sendItem struct {
	chatID string
	text   string
}

var (
	sendQueue []sendItem
	sending   bool
)

func sendFeishuAsync(chatID string, text string) {
	for len(text) > feishuMaxMsgLen {
		cut := feishuMaxMsgLen
		if idx := strings.LastIndex(text[:cut], "\n"); idx > cut/2 {
			cut = idx + 1
		}
		sendQueue = append(sendQueue, sendItem{chatID: chatID, text: text[:cut]})
		text = text[cut:]
	}
	if text != "" {
		sendQueue = append(sendQueue, sendItem{chatID: chatID, text: text})
	}
	drainSendQueue()
}

func drainSendQueue() {
	if sending || len(sendQueue) == 0 {
		return
	}
	sending = true
	item := sendQueue[0]
	sendQueue = sendQueue[1:]

	withToken(func(token string) {
		if token == "" {
			sending = false
			return
		}
		url := feishuBaseURL + "/im/v1/messages?receive_id_type=chat_id"

		// 使用飞书卡片消息，原生支持 Markdown 渲染
		card := map[string]interface{}{
			"type": "template",
			"data": map[string]interface{}{
				"template_variable": map[string]string{
					"content": item.text,
				},
			},
		}
		// 飞书卡片 Markdown 模板：直接用 markdown 元素
		card = map[string]interface{}{
			"elements": []interface{}{
				map[string]interface{}{
					"tag":     "markdown",
					"content": item.text,
				},
			},
		}
		cardJSON, _ := json.Marshal(card)

		bodyMap := map[string]string{
			"receive_id": item.chatID,
			"msg_type":   "interactive",
			"content":    string(cardJSON),
		}
		bodyBytes, _ := json.Marshal(bodyMap)

		headers := fmt.Sprintf("Content-Type: application/json; charset=utf-8\nAuthorization: Bearer %s", token)
		httpRequestAsync("POST", url, string(bodyBytes), headers, func(resp string) {
			if strings.Contains(resp, `"code":0`) {
				// 发送成功
			} else if strings.Contains(resp, `99991663`) || strings.Contains(resp, `99991664`) {
				logMsg("WARN: token 过期，刷新中...")
				cachedToken = ""
				sendQueue = append([]sendItem{item}, sendQueue...)
			} else {
				logMsg("ERROR: 飞书发送消息失败: " + resp)
			}
			sending = false
			drainSendQueue()
		})
	})
}

func mustJSON(v interface{}) string {
	b, _ := json.Marshal(v)
	return string(b)
}

// ==================== Bot 信息 ====================

var botOpenID string

func fetchBotInfo() {
	withToken(func(token string) {
		if token == "" {
			return
		}
		url := feishuBaseURL + "/bot/v3/info"
		headers := fmt.Sprintf("Authorization: Bearer %s", token)
		httpRequestAsync("GET", url, "", headers, func(resp string) {
			var r struct {
				Code int `json:"code"`
				Bot  struct {
					OpenID string `json:"open_id"`
				} `json:"bot"`
			}
			if json.Unmarshal([]byte(resp), &r) == nil && r.Code == 0 {
				botOpenID = r.Bot.OpenID
				logMsg("飞书 Bot OpenID: " + botOpenID)
			}
		})
	})
}
