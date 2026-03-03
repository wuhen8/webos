package main

import (
	"encoding/json"
	"fmt"
	"strings"
)

const (
	feishuBaseURL      = "https://open.feishu.cn/open-apis"
	feishuMaxMsgLen    = 30000 // 飞书富文本消息长度上限远大于 Telegram
)

// ==================== 飞书 API 数据结构 ====================

// tenant_access_token 响应
type tokenResp struct {
	Code              int    `json:"code"`
	Msg               string `json:"msg"`
	TenantAccessToken string `json:"tenant_access_token"`
	Expire            int    `json:"expire"`
}

// 拉取消息列表响应
type listMsgResp struct {
	Code int `json:"code"`
	Data struct {
		Items     []feishuMessage `json:"items"`
		HasMore   bool            `json:"has_more"`
		PageToken string          `json:"page_token"`
	} `json:"data"`
}

type feishuMessage struct {
	MessageID  string `json:"message_id"`
	CreateTime string `json:"create_time"` // 毫秒时间戳字符串
	ChatID     string `json:"chat_id"`
	MsgType    string `json:"msg_type"`
	Body       struct {
		Content string `json:"content"`
	} `json:"body"`
	Sender struct {
		SenderType string `json:"sender_type"`
		SenderID   struct {
			OpenID string `json:"open_id"`
		} `json:"sender_id"`
	} `json:"sender"`
}

// ==================== Token 管理 ====================

var cachedToken string

// refreshToken 获取 tenant_access_token
func refreshToken(cb func(token string)) {
	url := feishuBaseURL + "/auth/v3/tenant_access_token/internal"
	body := fmt.Sprintf(`{"app_id":"%s","app_secret":"%s"}`, appID, appSecret)
	httpRequestAsync("POST", url, body, "Content-Type: application/json", func(resp string) {
		var r tokenResp
		if json.Unmarshal([]byte(resp), &r) != nil || r.Code != 0 {
			logMsg("ERROR: 获取飞书 token 失败: " + resp)
			cb("")
			return
		}
		cachedToken = r.TenantAccessToken
		cb(cachedToken)
	})
}

// withToken 确保有有效 token 后执行回调
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

// sendFeishuAsync 入队一条消息，保证按顺序发送
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

		// 构建飞书富文本消息（post 格式），支持代码块和基本格式
		content := buildFeishuContent(item.text)
		contentJSON, _ := json.Marshal(content)

		bodyMap := map[string]string{
			"receive_id": item.chatID,
			"msg_type":   "interactive",
			"content":    string(contentJSON),
		}
		// 如果构建 interactive 太复杂，降级为纯文本
		bodyMap = map[string]string{
			"receive_id": item.chatID,
			"msg_type":   "text",
			"content":    mustJSON(map[string]string{"text": item.text}),
		}
		bodyBytes, _ := json.Marshal(bodyMap)

		headers := fmt.Sprintf("Content-Type: application/json; charset=utf-8\nAuthorization: Bearer %s", token)
		httpRequestAsync("POST", url, string(bodyBytes), headers, func(resp string) {
			if strings.Contains(resp, `"code":0`) {
				// 发送成功
			} else if strings.Contains(resp, `99991663`) || strings.Contains(resp, `99991664`) {
				// token 过期，刷新后重试
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

// buildFeishuContent 将 Markdown 文本转为飞书可用的格式
// 飞书文本消息本身支持部分格式，这里做简单处理
func buildFeishuContent(text string) map[string]string {
	return map[string]string{"text": text}
}

func mustJSON(v interface{}) string {
	b, _ := json.Marshal(v)
	return string(b)
}

// ==================== 获取 Bot 自身信息 ====================

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

// ==================== 拉取消息（轮询模式） ====================

// pullMessages 拉取指定 chat 的最新消息
func pullMessages(chatID string, startTime string, cb func(msgs []feishuMessage)) {
	withToken(func(token string) {
		if token == "" {
			cb(nil)
			return
		}
		url := fmt.Sprintf("%s/im/v1/messages?container_id_type=chat&container_id=%s&start_time=%s&page_size=20",
			feishuBaseURL, chatID, startTime)
		headers := fmt.Sprintf("Authorization: Bearer %s", token)
		httpRequestAsync("GET", url, "", headers, func(resp string) {
			var r listMsgResp
			if json.Unmarshal([]byte(resp), &r) != nil || r.Code != 0 {
				if strings.Contains(resp, `99991663`) || strings.Contains(resp, `99991664`) {
					cachedToken = ""
				}
				if resp != "" {
					logMsg("WARN: 拉取飞书消息失败: " + resp[:min(len(resp), 200)])
				}
				cb(nil)
				return
			}
			cb(r.Data.Items)
		})
	})
}
