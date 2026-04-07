package main

import (
	"crypto/rand"
	"encoding/json"
	"fmt"
	"os"
	"strings"
	"time"
	"unsafe"
)

const defaultWeixinBaseURL = "https://ilinkai.weixin.qq.com"
const defaultWeixinCDNBaseURL = "https://novac2c.cdn.weixin.qq.com/c2c"
const scheduledAIConversationID = "scheduled_ai"

var (
	weixinBaseURL      string
	weixinToken        string
	weixinRouteTag     string
	weixinLoginBaseURL string
	weixinBotType      string
	weixinCDNBaseURL   string
	initialized        bool
	polling            bool
	loginPolling       bool
	loginStarted       bool
	lastLoginStatus    string
	lastLoginError     string
	allowedUserIDs     map[string]bool
	userConversations  map[string]string
	conversationUsers  map[string]string
	activeUserID       string
	activeContextTok   string
	replyBuf           strings.Builder
	sendSeq            int64
	weixinSyncBuf      string
)

func weixinConversationKVKey(userID string) string {
	return "weixin_conv:" + strings.TrimSpace(userID)
}

func getCurrentConversationID(userID string) string {
	userID = strings.TrimSpace(userID)
	if userID == "" {
		return ""
	}
	if convID := strings.TrimSpace(userConversations[userID]); convID != "" {
		return convID
	}
	convID := strings.TrimSpace(kvGet(weixinConversationKVKey(userID)))
	if convID != "" {
		userConversations[userID] = convID
		conversationUsers[convID] = userID
	}
	return convID
}

func setCurrentConversationID(userID, convID string) {
	userID = strings.TrimSpace(userID)
	convID = strings.TrimSpace(convID)
	if userID == "" || convID == "" {
		return
	}
	if prev := strings.TrimSpace(userConversations[userID]); prev != "" && prev != convID {
		delete(conversationUsers, prev)
	}
	if userConversations[userID] == convID {
		conversationUsers[convID] = userID
		return
	}
	userConversations[userID] = convID
	conversationUsers[convID] = userID
	kvSet(weixinConversationKVKey(userID), convID)
}

func bindActiveUser(userID, contextToken string) string {
	activeUserID = strings.TrimSpace(userID)
	convID := getCurrentConversationID(activeUserID)
	if strings.TrimSpace(contextToken) == "" && activeUserID != "" {
		contextToken = kvGet("ctx:" + activeUserID)
	}
	activeContextTok = strings.TrimSpace(contextToken)
	return convID
}

func ensureConversationID(userID, contextToken, userText string) string {
	convID := bindActiveUser(userID, contextToken)
	if convID != "" {
		return convID
	}
	placeholder := strings.TrimSpace(userText)
	if placeholder == "" {
		placeholder = "[微信会话初始化]"
	}
	resp := request("chat.send", map[string]interface{}{
		"conversationId": "",
		"messageContent": placeholder,
		"clientId":       "weixin-ai-bot",
	})
	var result struct {
		Accepted       bool   `json:"accepted"`
		Reason         string `json:"reason"`
		ConversationID string `json:"conversationId"`
	}
	_ = json.Unmarshal([]byte(resp), &result)
	if !result.Accepted {
		if reason := strings.TrimSpace(result.Reason); reason != "" {
			logMsg(fmt.Sprintf("ERROR: 创建微信会话失败 user=%s reason=%s", userID, reason))
		} else {
			logMsg(fmt.Sprintf("ERROR: 创建微信会话失败 user=%s", userID))
		}
		return ""
	}
	convID = strings.TrimSpace(result.ConversationID)
	if convID != "" {
		setCurrentConversationID(userID, convID)
		activeUserID = strings.TrimSpace(userID)
		activeContextTok = strings.TrimSpace(contextToken)
		return convID
	}
	return bindActiveUser(userID, contextToken)
}

func main() {}

func ensureInit() {
	if initialized {
		return
	}
	initialized = true

	weixinBaseURL = strings.TrimSpace(configGet("weixin_base_url"))
	if weixinBaseURL == "" {
		weixinBaseURL = defaultWeixinBaseURL
	}
	weixinToken = strings.TrimSpace(configGet("weixin_bot_token"))
	weixinRouteTag = strings.TrimSpace(configGet("weixin_route_tag"))
	weixinLoginBaseURL = strings.TrimSpace(configGet("weixin_login_base_url"))
	if weixinLoginBaseURL == "" {
		weixinLoginBaseURL = defaultWeixinBaseURL
	}
	weixinBotType = strings.TrimSpace(configGet("weixin_bot_type"))
	weixinCDNBaseURL = defaultWeixinCDNBaseURL
	if weixinBotType == "" {
		weixinBotType = "3"
	}
	weixinSyncBuf = kvGet("weixin_sync_buf")

	if weixinToken == "" {
		logMsg("微信 Bot Token 未配置，进入日志版扫码登录流程")
		return
	}

	allowedUserIDs = make(map[string]bool)
	userConversations = make(map[string]string)
	conversationUsers = make(map[string]string)
	loadAllowedUserIDs()
	if len(allowedUserIDs) == 0 {
		logMsg("微信 AI Bot 初始化完成（自动注册模式：首个发消息用户自动授权）")
	} else {
		logMsg(fmt.Sprintf("微信 AI Bot 初始化完成（授权用户=%d个）", len(allowedUserIDs)))
		for uid := range allowedUserIDs {
			activeUserID = uid
			break
		}
	}

	request("client_context.register", map[string]interface{}{
		"id":           "weixin-ai-bot",
		"platform":     "weixin",
		"displayName":  "微信 Bot",
		"capabilities": []string{"markdown_basic", "code_blocks", "bold", "italic", "links"},
		"constraints":  []string{"no_latex", "no_images_inline"},
		"systemHint": "当前用户通过微信客户端与你对话。请遵守以下格式规则：\n" +
			"1. 使用简洁的文本回复\n" +
			"2. 代码块使用 ``` 包裹\n" +
			"3. 列表使用 - 或数字编号\n" +
			"4. 不要使用复杂表格、LaTeX、HTML\n" +
			"5. 回复尽量精炼，适合手机阅读",
	})
}

func loadAllowedUserIDs() {
	if s := configGet("weixin_user_ids"); s != "" {
		for _, part := range strings.Split(s, ",") {
			part = strings.TrimSpace(part)
			if part != "" {
				allowedUserIDs[part] = true
			}
		}
	}
}

func saveAutoUserID(uid string) {
	if uid == "" {
		return
	}
	allowedUserIDs[uid] = true
	var ids []string
	for id := range allowedUserIDs {
		ids = append(ids, id)
	}
	configSet("weixin_user_ids", strings.Join(ids, ","))
}

func isUserAllowed(uid string) bool {
	return allowedUserIDs[uid]
}

func nextSendSeq() int64 {
	sendSeq++
	return sendSeq
}

func nextWeixinClientID() string {
	var suffix [4]byte
	if _, err := rand.Read(suffix[:]); err != nil {
		return fmt.Sprintf("webos-weixin:%d-%08x", time.Now().UnixMilli(), nextSendSeq())
	}
	return fmt.Sprintf("webos-weixin:%d-%x", time.Now().UnixMilli(), suffix)
}

//go:wasmexport on_event
func on_event(ptr uint32, size uint32) uint32 {
	if size == 0 {
		return 0
	}
	raw := make([]byte, size)
	copy(raw, unsafe.Slice((*byte)(unsafe.Pointer(uintptr(ptr))), size))

	var ev struct {
		Method string          `json:"method"`
		Params json.RawMessage `json:"params"`
	}
	if json.Unmarshal(raw, &ev) != nil {
		return 1
	}
	switch ev.Method {
	case "host.response":
		handleHostResponse(ev.Params)
	case "chat.delta":
		onChatDelta(ev.Params)
	case "chat.done":
		onChatDone(ev.Params)
	case "chat.error":
		onChatError(ev.Params)
	case "chat.command_result":
		onCommandResult(ev.Params)
	case "chat.media":
		onChatMedia(ev.Params)
	case "system.notify":
		onSystemNotify(ev.Params)
	case "tick":
		ensureInit()
		if strings.TrimSpace(weixinToken) == "" {
			loginTick()
		} else {
			pollOnce()
		}
	}
	return 0
}

func conversationUserID(convID string) string {
	convID = strings.TrimSpace(convID)
	if convID == "" {
		return strings.TrimSpace(activeUserID)
	}
	if userID := lookupConversationUserID(convID); userID != "" {
		return userID
	}
	return strings.TrimSpace(activeUserID)
}

func lookupConversationUserID(convID string) string {
	convID = strings.TrimSpace(convID)
	if convID == "" {
		return ""
	}
	return strings.TrimSpace(conversationUsers[convID])
}

func contextTokenForUser(userID string) string {
	userID = strings.TrimSpace(userID)
	if userID == "" {
		return ""
	}
	if strings.TrimSpace(activeUserID) == userID && strings.TrimSpace(activeContextTok) != "" {
		return strings.TrimSpace(activeContextTok)
	}
	return strings.TrimSpace(kvGet("ctx:" + userID))
}

func beginReplyStream(userID, contextToken string) {
	activeUserID = userID
	if strings.TrimSpace(contextToken) == "" && strings.TrimSpace(userID) != "" {
		contextToken = kvGet("ctx:" + userID)
	}
	activeContextTok = contextToken
	replyBuf.Reset()
}

func shouldBindConversation(convID string) bool {
	convID = strings.TrimSpace(convID)
	return convID != "" && convID != scheduledAIConversationID
}

func onChatDelta(data json.RawMessage) {
	var d struct {
		ConversationID string `json:"conversationId"`
		Content        string `json:"content"`
	}
	json.Unmarshal(data, &d)
	uid := conversationUserID(d.ConversationID)
	if uid == "" {
		return
	}
	activeUserID = uid
	if shouldBindConversation(d.ConversationID) {
		setCurrentConversationID(uid, d.ConversationID)
	}
	if d.Content == "" {
		return
	}
	replyBuf.WriteString(d.Content)
}

func onChatDone(data json.RawMessage) {
	var d struct {
		ConversationID string `json:"conversationId"`
		FullText       string `json:"fullText"`
	}
	_ = json.Unmarshal(data, &d)
	uid := conversationUserID(d.ConversationID)
	if uid == "" {
		return
	}
	activeUserID = uid
	if shouldBindConversation(d.ConversationID) {
		setCurrentConversationID(uid, d.ConversationID)
	}
	text := strings.TrimSpace(replyBuf.String())
	if strings.TrimSpace(d.FullText) != "" {
		text = strings.TrimSpace(d.FullText)
	}
	if text == "" {
		text = "(空回复)"
	}
	ctx := contextTokenForUser(uid)
	sendWeixinTextAsync(uid, ctx, text, func(ok bool, resp string) {
		if !ok {
			logMsg("ERROR: send weixin reply failed: " + truncate(resp, 200))
		}
	})
	replyBuf.Reset()
}

func onChatError(data json.RawMessage) {
	var d struct {
		ConversationID string `json:"conversationId"`
		Error          string `json:"error"`
	}
	json.Unmarshal(data, &d)
	uid := conversationUserID(d.ConversationID)
	if uid == "" {
		return
	}
	activeUserID = uid
	if shouldBindConversation(d.ConversationID) {
		setCurrentConversationID(uid, d.ConversationID)
	}
	errMsg := strings.TrimSpace(d.Error)
	if errMsg == "" {
		errMsg = "未知错误"
	}
	ctx := contextTokenForUser(uid)
	sendWeixinTextAsync(uid, ctx, "AI 错误: "+errMsg, func(ok bool, resp string) {
		if !ok {
			logMsg("ERROR: send weixin chat error failed: " + truncate(resp, 200))
		}
	})
	replyBuf.Reset()
}

func onCommandResult(data json.RawMessage) {
	var d struct {
		ConversationID       string `json:"conversationId"`
		Text                 string `json:"text"`
		IsError              bool   `json:"isError"`
		TargetConversationID string `json:"targetConversationId"`
		ConversationAction   string `json:"conversationAction"`
		SwitchConversation   bool   `json:"switchConversation"`
		RoutePolicy          string `json:"routePolicy"`
		OwnerClientID        string `json:"ownerClientId"`
	}
	json.Unmarshal(data, &d)
	uid := lookupConversationUserID(d.ConversationID)
	if uid == "" && d.SwitchConversation && d.RoutePolicy == "directed" && d.OwnerClientID == currentAppID {
		uid = strings.TrimSpace(activeUserID)
	}
	if uid == "" && strings.TrimSpace(d.TargetConversationID) != "" {
		uid = lookupConversationUserID(d.TargetConversationID)
	}
	if uid == "" {
		logMsg(fmt.Sprintf("WARN: weixin command result dropped conv=%s targetConv=%s activeUser=%s", strings.TrimSpace(d.ConversationID), strings.TrimSpace(d.TargetConversationID), strings.TrimSpace(activeUserID)))
		return
	}
	activeUserID = uid
	if d.SwitchConversation && !d.IsError && strings.TrimSpace(d.TargetConversationID) != "" && d.RoutePolicy == "directed" && d.OwnerClientID == currentAppID {
		setCurrentConversationID(uid, d.TargetConversationID)
	}
	if d.Text == "" {
		return
	}
	prefix := "📋 "
	if d.IsError {
		prefix = "❌ "
	}
	if d.ConversationAction != "" && strings.TrimSpace(d.TargetConversationID) != "" {
		d.Text += fmt.Sprintf("\n\n当前会话: `%s`", d.TargetConversationID)
	}
	ctx := contextTokenForUser(uid)
	sendWeixinTextAsync(uid, ctx, prefix+d.Text, func(ok bool, resp string) {
		if !ok {
			logMsg("ERROR: send weixin command result failed: " + truncate(resp, 200))
		}
	})
}

func onSystemNotify(data json.RawMessage) {
	if len(allowedUserIDs) == 0 {
		return
	}
	var d struct {
		Level   string `json:"level"`
		Title   string `json:"title"`
		Message string `json:"message"`
	}
	json.Unmarshal(data, &d)
	if d.Message == "" {
		return
	}
	icon := "ℹ️"
	switch d.Level {
	case "success":
		icon = "✅"
	case "warning":
		icon = "⚠️"
	case "error":
		icon = "❌"
	case "plain":
		icon = ""
	}
	text := strings.TrimSpace(strings.TrimSpace(icon+" "+d.Title) + "\n" + d.Message)
	for uid := range allowedUserIDs {
		ctx := kvGet("ctx:" + uid)
		if ctx == "" {
			continue
		}
		sendWeixinTextAsync(uid, ctx, text, nil)
	}
}

func loginTick() {
	if weixinToken != "" {
		return
	}
	if !loginStarted {
		startWeixinLogin()
		return
	}
	pollWeixinLoginStatus()
}

func pollOnce() {
	if polling || weixinBaseURL == "" || weixinToken == "" {
		return
	}
	polling = true
	getUpdatesOnce(func(resp WeixinGetUpdatesResp, ok bool) {
		polling = false
		if !ok {
			return
		}
		if resp.GetUpdatesBuf != "" {
			weixinSyncBuf = resp.GetUpdatesBuf
			kvSet("weixin_sync_buf", weixinSyncBuf)
		}
		if resp.Ret != 0 && resp.ErrCode != 0 {
			logMsg(fmt.Sprintf("WARN: weixin getupdates ret=%d errcode=%d errmsg=%s", resp.Ret, resp.ErrCode, truncate(resp.ErrMsg, 120)))
			return
		}
		if len(resp.Msgs) == 0 {
			return
		}
		for _, msg := range resp.Msgs {
			handleInboundMessage(msg)
		}
	})
}

func handleInboundMessage(msg WeixinMessage) {
	uid := strings.TrimSpace(msg.FromUserID)
	if uid == "" {
		return
	}

	if len(allowedUserIDs) == 0 {
		saveAutoUserID(uid)
		activeUserID = uid
		if msg.ContextToken != "" {
			kvSet("ctx:"+uid, msg.ContextToken)
		}
		logMsg("自动授权首个微信用户: " + uid)
		if msg.ContextToken != "" {
			sendWeixinTextAsync(uid, msg.ContextToken, "✅ 你已被自动授权为 Bot 用户，直接发消息即可开始对话。", nil)
		}
		return
	}

	if !isUserAllowed(uid) {
		logMsg("[未授权微信用户] " + uid)
		if msg.ContextToken != "" {
			sendWeixinTextAsync(uid, msg.ContextToken, "🚫 未授权访问，请联系管理员把你的用户 ID 加入 weixin_user_ids。", nil)
		}
		return
	}

	if msg.ContextToken != "" {
		kvSet("ctx:"+uid, msg.ContextToken)
	}
	ctxToken := strings.TrimSpace(msg.ContextToken)
	convID := bindActiveUser(uid, ctxToken)
	if ctxToken == "" {
		ctxToken = contextTokenForUser(uid)
	}

	userText := describeWeixinMessage(msg)
	plainText := extractWeixinText(msg)
	if plainText == "/start" {
		sendWeixinTextAsync(uid, ctxToken, "你好！我是 WebOS AI 助手，直接发消息给我就可以对话。", nil)
		return
	}
	if kind, fileName, media := chooseInboundMedia(msg); media != nil {
		downloadURL := buildWeixinDownloadURL(media)
		if downloadURL != "" {
			safeName := strings.ReplaceAll(fileName, "/", "_")
			savePath := fmt.Sprintf("${WEBOS_DATA_DIR}/uploads/weixin/%s/%s", uid, safeName)
			reqID := downloadFileAsync(downloadURL, savePath)
			if reqID != "" {
				pendingDownloads[reqID] = &PendingDownload{
					UserID:       uid,
					ContextToken: ctxToken,
					ConvID:       convID,
					UserText:     plainText,
					FileName:     safeName,
					Kind:         kind,
					AESKey:       strings.TrimSpace(media.AESKey),
				}
				logMsg(fmt.Sprintf("[weixin:%s] 收到附件，开始下载: %s (%s)", uid, safeName, kind))
				return
			}
		}
	}
	if strings.TrimSpace(userText) == "" {
		return
	}
	logMsg(fmt.Sprintf("[weixin:%s] %s", uid, truncate(userText, 120)))
	beginReplyStream(uid, ctxToken)
	if convID == "" {
		convID = ensureConversationID(uid, ctxToken, userText)
	}
	if convID == "" {
		return
	}
	request("chat.send", map[string]interface{}{
		"conversationId": convID,
		"messageContent": userText,
		"clientId":       "weixin-ai-bot",
	})
}

func onDownloadComplete(pd *PendingDownload, savedPath, errMsg string) {
	if pd == nil {
		return
	}
	sendToConversation := func(message string) {
		beginReplyStream(pd.UserID, pd.ContextToken)
		convID := strings.TrimSpace(pd.ConvID)
		if convID == "" {
			convID = ensureConversationID(pd.UserID, pd.ContextToken, message)
		}
		if convID == "" {
			return
		}
		request("chat.send", map[string]interface{}{
			"conversationId": convID,
			"messageContent": message,
			"clientId":       "weixin-ai-bot",
		})
	}
	handleDownloadedPath := func(finalPath string) {
		relativePath := finalPath
		if idx := strings.Index(finalPath, "/uploads/"); idx >= 0 {
			relativePath = finalPath[idx+1:]
		}
		fileInfo := fmt.Sprintf("[文件: local_1:/opt/webos/%s]", relativePath)
		msg := strings.TrimSpace(pd.UserText)
		if msg != "" {
			msg += "\n" + fileInfo
		} else {
			msg = fileInfo
		}
		logMsg(fmt.Sprintf("[weixin:%s] 附件下载完成: %s", pd.UserID, pd.FileName))
		sendToConversation(msg)
	}
	if errMsg != "" {
		logMsg(fmt.Sprintf("[weixin:%s] 附件下载失败: %s", pd.UserID, errMsg))
		msg := pd.UserText
		if strings.TrimSpace(msg) == "" {
			msg = fmt.Sprintf("[附件下载失败: %s]", pd.FileName)
		}
		sendToConversation(msg)
		return
	}
	if strings.TrimSpace(pd.AESKey) == "" {
		handleDownloadedPath(savedPath)
		return
	}
	if err := decryptFileInPlace(savedPath, strings.TrimSpace(pd.AESKey)); err != nil {
		logMsg(fmt.Sprintf("[weixin:%s] 附件解密失败: %s", pd.UserID, truncate(err.Error(), 240)))
		msg := pd.UserText
		if strings.TrimSpace(msg) == "" {
			msg = fmt.Sprintf("[附件解密失败: %s]", pd.FileName)
		}
		sendToConversation(msg)
		return
	}
	handleDownloadedPath(savedPath)
}

func onChatMedia(data json.RawMessage) {
	ensureInit()
	var d struct {
		ConversationID string `json:"conversationId"`
		Attachment     struct {
			NodeID   string `json:"nodeId"`
			Path     string `json:"path"`
			FileName string `json:"fileName"`
			MimeType string `json:"mimeType"`
			Size     int64  `json:"size"`
			Caption  string `json:"caption"`
		} `json:"attachment"`
	}
	if err := json.Unmarshal(data, &d); err != nil {
		logMsg("ERROR: 解析 chat.media 失败: " + err.Error())
		return
	}
	a := d.Attachment
	uid := conversationUserID(d.ConversationID)
	if uid == "" {
		logMsg("WARN: 收到 chat.media 但 userID 为空")
		return
	}
	activeUserID = uid
	if shouldBindConversation(d.ConversationID) {
		setCurrentConversationID(uid, d.ConversationID)
	}
	ctx := contextTokenForUser(uid)
	filePath := a.Path
	if !strings.HasPrefix(filePath, "/") {
		filePath = "/opt/webos/" + strings.TrimLeft(filePath, "/")
	}
	fileName := strings.TrimSpace(a.FileName)
	if fileName == "" {
		parts := strings.Split(filePath, "/")
		fileName = parts[len(parts)-1]
	}
	text := strings.TrimSpace(a.Caption)
	if text == "" {
		text = fileName
		if text == "" {
			text = "附件"
		}
	}
	mediaType := 3
	if strings.HasPrefix(a.MimeType, "image/") {
		mediaType = 1
	} else if strings.HasPrefix(a.MimeType, "video/") {
		mediaType = 2
	}
	logMsg(fmt.Sprintf("开始发送微信附件: user=%s file=%s mime=%s mediaType=%d", uid, fileName, a.MimeType, mediaType))
	meta, encryptedPath, err := prepareWeixinUpload(filePath)
	if err != nil {
		logMsg("ERROR: 读取附件元数据失败: " + truncate(err.Error(), 240))
		sendWeixinTextAsync(uid, ctx, "附件发送失败：无法读取文件", nil)
		return
	}
	getWeixinUploadURL(meta.FileKey, mediaType, uid, meta.RawSize, meta.FileSize, meta.RawFileMD5, meta.AESKey, func(resp WeixinUploadURLResp, ok bool, raw string) {
		if !ok {
			logMsg("ERROR: 获取微信上传地址失败: " + truncate(raw, 240))
			sendWeixinTextAsync(uid, ctx, "附件发送失败：获取上传地址失败", nil)
			return
		}
		uploadURL := buildWeixinCDNUploadURL(resp.UploadParam, meta.FileKey)
		if uploadURL == "" {
			logMsg("ERROR: 构造微信 CDN 上传地址失败")
			sendWeixinTextAsync(uid, ctx, "附件发送失败：上传地址无效", nil)
			return
		}
		httpRequestAsyncData(map[string]interface{}{
			"method": "POST",
			"url":    uploadURL,
			"body": map[string]interface{}{
				"kind":     "file",
				"path":     encryptedPath,
				"encoding": "binary",
			},
			"headers": map[string]string{
				"Content-Type": "application/octet-stream",
			},
		}, func(success bool, data map[string]interface{}, err string) {
			defer os.Remove(encryptedPath)
			if !success {
				logMsg("ERROR: 微信 CDN 上传失败: " + truncate(err, 240))
				sendWeixinTextAsync(uid, ctx, "附件发送失败：CDN 上传失败", nil)
				return
			}
			downloadParam := findHeaderValue(data, "x-encrypted-param")
			if downloadParam == "" {
				logMsg("ERROR: 微信 CDN 上传响应缺少 x-encrypted-param")
				sendWeixinTextAsync(uid, ctx, "附件发送失败：上传响应无效", nil)
				return
			}
			items := toWeixinMessageItemsForUploaded(a.MimeType, fileName, text, &WeixinUploadedFileInfo{
				FileKey:                     meta.FileKey,
				DownloadEncryptedQueryParam: downloadParam,
				AESKeyHex:                   meta.AESKey,
				FileSize:                    meta.RawSize,
				FileSizeCiphertext:          meta.FileSize,
			})
			sendWeixinMessageAsync(uid, ctx, items, func(ok bool, resp string) {
				if !ok {
					logMsg("ERROR: 微信发送附件消息失败: " + truncate(resp, 240))
					sendWeixinTextAsync(uid, ctx, "附件发送失败：消息发送失败", nil)
					return
				}
				logMsg("微信附件发送成功: " + fileName)
			})
		})
	})
}

func startWeixinLogin() {
	if loginStarted || loginPolling {
		return
	}
	if weixinLoginBaseURL == "" {
		logMsg("ERROR: 缺少 weixin_login_base_url / weixin_base_url，无法扫码登录")
		return
	}
	kvSet("weixin_login_qrcode", "")
	lastLoginStatus = ""
	lastLoginError = ""
	activeUserID = ""
	activeContextTok = ""
	loginPolling = true
	fetchWeixinQRCode(func(resp WeixinQRResp, ok bool, raw string) {
		loginPolling = false
		if !ok {
			logMsg("ERROR: 获取微信登录二维码失败: " + truncate(raw, 300))
			return
		}
		loginStarted = true
		lastLoginStatus = ""
		lastLoginError = ""
		kvSet("weixin_login_qrcode", resp.QRCode)
		logMsg("请使用微信扫描以下二维码完成登录：")
		if resp.QRCodeImgContent != "" {
			logMsg("二维码链接: " + resp.QRCodeImgContent)
		}
		if resp.QRCode != "" {
			logMsg("二维码标识: " + resp.QRCode)
		}
	})
}

func pollWeixinLoginStatus() {
	if loginPolling {
		return
	}
	qrcode := kvGet("weixin_login_qrcode")
	if qrcode == "" {
		loginStarted = false
		return
	}
	loginPolling = true
	getWeixinQRStatus(qrcode, func(resp WeixinQRStatusResp, ok bool, raw string) {
		loginPolling = false
		if !ok {
			errText := "WARN: 查询微信扫码状态失败: " + truncate(raw, 200)
			if errText != lastLoginError {
				lastLoginError = errText
				logMsg(errText)
			}
			return
		}
		lastLoginError = ""
		if resp.Status != lastLoginStatus {
			lastLoginStatus = resp.Status
			switch resp.Status {
			case "wait":
				logMsg("微信扫码登录：等待扫码")
			case "scaned":
				logMsg("微信扫码登录：已扫码，请在微信中确认")
			case "expired":
				logMsg("微信扫码登录：二维码已过期，重新生成")
			case "confirmed":
				logMsg("微信扫码登录：已确认，正在写入配置")
			default:
				logMsg("微信扫码登录：未知状态 " + resp.Status)
			}
		}
		switch resp.Status {
		case "wait":
			return
		case "scaned":
			return
		case "expired":
			kvSet("weixin_login_qrcode", "")
			loginStarted = false
			lastLoginStatus = ""
		case "confirmed":
			if resp.BotToken == "" {
				logMsg("ERROR: 微信扫码已确认，但未拿到 bot_token")
				return
			}
			weixinToken = strings.TrimSpace(resp.BotToken)
			configSet("weixin_bot_token", weixinToken)
			if strings.TrimSpace(resp.BaseURL) != "" {
				weixinBaseURL = strings.TrimSpace(resp.BaseURL)
				configSet("weixin_base_url", weixinBaseURL)
			}
			if resp.ILinkUserID != "" {
				if allowedUserIDs == nil {
					allowedUserIDs = make(map[string]bool)
				}
				saveAutoUserID(resp.ILinkUserID)
				activeUserID = resp.ILinkUserID
				ctx := kvGet("ctx:" + resp.ILinkUserID)
				if ctx != "" {
					activeContextTok = ctx
				}
				logMsg("微信扫码登录成功，扫码用户已自动加入授权列表: " + resp.ILinkUserID)
			}
			if resp.ILinkBotID != "" {
				logMsg("微信 Bot ID: " + resp.ILinkBotID)
			}
			kvSet("weixin_login_qrcode", "")
			loginStarted = false
			lastLoginStatus = ""
			lastLoginError = ""
			logMsg("✅ 微信扫码登录成功，已写入配置，后续开始长轮询收消息")
		default:
			return
		}
	})
}

func truncate(s string, n int) string {
	s = strings.TrimSpace(s)
	if len(s) <= n {
		return s
	}
	return s[:n] + "..."
}

func findHeaderValue(data map[string]interface{}, key string) string {
	headers, ok := data["headers"].(map[string]interface{})
	if !ok {
		return ""
	}
	want := strings.ToLower(strings.TrimSpace(key))
	for k, v := range headers {
		if strings.ToLower(strings.TrimSpace(k)) == want {
			if s, ok := v.(string); ok {
				return strings.TrimSpace(s)
			}
		}
	}
	return ""
}
