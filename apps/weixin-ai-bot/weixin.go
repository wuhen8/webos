package main

import (
	"crypto/rand"
	"encoding/base64"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"net/url"
	"strings"
)

type WeixinGetUpdatesResp struct {
	Ret                  int             `json:"ret"`
	ErrCode              int             `json:"errcode"`
	ErrMsg               string          `json:"errmsg"`
	Msgs                 []WeixinMessage `json:"msgs"`
	GetUpdatesBuf        string          `json:"get_updates_buf"`
	LongPollingTimeoutMs int             `json:"longpolling_timeout_ms"`
}

type WeixinMessage struct {
	Seq          int                 `json:"seq"`
	MessageID    int64               `json:"message_id"`
	FromUserID   string              `json:"from_user_id"`
	ToUserID     string              `json:"to_user_id"`
	ClientID     string              `json:"client_id"`
	SessionID    string              `json:"session_id"`
	GroupID      string              `json:"group_id"`
	MessageType  int                 `json:"message_type"`
	MessageState int                 `json:"message_state"`
	ItemList     []WeixinMessageItem `json:"item_list"`
	ContextToken string              `json:"context_token"`
}

type WeixinMessageItem struct {
	Type      int              `json:"type"`
	TextItem  *WeixinTextItem  `json:"text_item,omitempty"`
	ImageItem *WeixinImageItem `json:"image_item,omitempty"`
	FileItem  *WeixinFileItem  `json:"file_item,omitempty"`
	VoiceItem *WeixinVoiceItem `json:"voice_item,omitempty"`
	VideoItem *WeixinVideoItem `json:"video_item,omitempty"`
}

type WeixinTextItem struct {
	Text string `json:"text"`
}

type WeixinCDNMedia struct {
	EncryptQueryParam string `json:"encrypt_query_param"`
	AESKey            string `json:"aes_key"`
	EncryptType       int    `json:"encrypt_type"`
	URL               string `json:"url"`
}

type WeixinImageItem struct {
	Media   *WeixinCDNMedia `json:"media,omitempty"`
	MidSize int64           `json:"mid_size,omitempty"`
}

type WeixinFileItem struct {
	Media    *WeixinCDNMedia `json:"media,omitempty"`
	FileName string          `json:"file_name,omitempty"`
	Len      string          `json:"len,omitempty"`
}

type WeixinVoiceItem struct {
	Media      *WeixinCDNMedia `json:"media,omitempty"`
	Text       string          `json:"text,omitempty"`
	EncodeType int             `json:"encode_type,omitempty"`
	Playtime   int             `json:"playtime,omitempty"`
}

type WeixinVideoItem struct {
	Media     *WeixinCDNMedia `json:"media,omitempty"`
	VideoSize int64           `json:"video_size,omitempty"`
}

type WeixinUploadURLResp struct {
	UploadParam      string `json:"upload_param"`
	ThumbUploadParam string `json:"thumb_upload_param"`
}

type WeixinUploadedFileInfo struct {
	FileKey                     string
	DownloadEncryptedQueryParam string
	AESKeyHex                   string
	FileSize                    int64
	FileSizeCiphertext          int64
}

func weixinHeaders(includeJSON bool) map[string]string {
	uin := make([]byte, 4)
	if _, err := rand.Read(uin); err != nil {
		binary.BigEndian.PutUint32(uin, 12345678)
	}
	headers := map[string]string{
		"AuthorizationType": "ilink_bot_token",
		"X-WECHAT-UIN":      base64.StdEncoding.EncodeToString([]byte(fmt.Sprintf("%d", binary.BigEndian.Uint32(uin)))),
	}
	if includeJSON {
		headers["Content-Type"] = "application/json"
	}
	if weixinToken != "" {
		headers["Authorization"] = "Bearer " + strings.TrimSpace(weixinToken)
	}
	if weixinRouteTag != "" {
		headers["SKRouteTag"] = strings.TrimSpace(weixinRouteTag)
	}
	return headers
}

func getUpdatesOnce(cb func(resp WeixinGetUpdatesResp, ok bool)) {
	if weixinBaseURL == "" || weixinToken == "" {
		if cb != nil {
			cb(WeixinGetUpdatesResp{}, false)
		}
		return
	}
	url := strings.TrimRight(weixinBaseURL, "/") + "/ilink/bot/getupdates"
	bodyMap := map[string]interface{}{
		"get_updates_buf": weixinSyncBuf,
		"base_info": map[string]interface{}{
			"channel_version": "webos-weixin-ai-bot/1.0.0",
		},
	}
	body, _ := json.Marshal(bodyMap)
	headers, _ := json.Marshal(weixinHeaders(true))
	httpRequestAsync("POST", url, string(body), string(headers), func(raw string) {
		if raw == "" {
			if cb != nil {
				cb(WeixinGetUpdatesResp{}, false)
			}
			return
		}
		var resp WeixinGetUpdatesResp
		if err := json.Unmarshal([]byte(raw), &resp); err != nil {
			logMsg("ERROR: parse weixin getupdates response: " + err.Error())
			if cb != nil {
				cb(WeixinGetUpdatesResp{}, false)
			}
			return
		}
		if cb != nil {
			cb(resp, true)
		}
	})
}

func sendWeixinMessageAsync(toUserID, contextToken string, itemList []map[string]interface{}, cb func(ok bool, resp string)) {
	if weixinBaseURL == "" || weixinToken == "" || toUserID == "" || len(itemList) == 0 {
		if cb != nil {
			cb(false, "")
		}
		return
	}
	contextToken = strings.TrimSpace(contextToken)
	if contextToken == "" {
		contextToken = strings.TrimSpace(kvGet("ctx:" + toUserID))
	}
	url := strings.TrimRight(weixinBaseURL, "/") + "/ilink/bot/sendmessage"
	bodyMap := map[string]interface{}{
		"msg": map[string]interface{}{
			"from_user_id":  "",
			"to_user_id":    toUserID,
			"client_id":     nextWeixinClientID(),
			"message_type":  2,
			"message_state": 2,
			"item_list":     itemList,
		},
		"base_info": map[string]interface{}{
			"channel_version": "webos-weixin-ai-bot/1.0.0",
		},
	}
	if strings.TrimSpace(contextToken) != "" {
		bodyMap["msg"].(map[string]interface{})["context_token"] = contextToken
	}
	body, _ := json.Marshal(bodyMap)
	headers, _ := json.Marshal(weixinHeaders(true))
	httpRequestAsync("POST", url, string(body), string(headers), func(raw string) {
		ok := true
		var resp struct {
			Ret     int    `json:"ret"`
			ErrCode int    `json:"errcode"`
			ErrMsg  string `json:"errmsg"`
			Error   string `json:"error"`
		}
		if err := json.Unmarshal([]byte(raw), &resp); err == nil {
			if resp.Error != "" || resp.Ret != 0 || resp.ErrCode != 0 {
				ok = false
			}
		} else if strings.TrimSpace(raw) == "" {
			ok = false
		}
		if cb != nil {
			cb(ok, raw)
		}
	})
}

func sendWeixinTextAsync(toUserID, contextToken, text string, cb func(ok bool, resp string)) {
	sendWeixinMessageAsync(toUserID, contextToken, []map[string]interface{}{
		{
			"type": 1,
			"text_item": map[string]interface{}{
				"text": text,
			},
		},
	}, cb)
}

func extractWeixinText(msg WeixinMessage) string {
	var parts []string
	for _, item := range msg.ItemList {
		switch item.Type {
		case 1:
			if item.TextItem != nil && item.TextItem.Text != "" {
				parts = append(parts, item.TextItem.Text)
			}
		case 3:
			if item.VoiceItem != nil && item.VoiceItem.Text != "" {
				parts = append(parts, item.VoiceItem.Text)
			}
		}
	}
	return strings.TrimSpace(strings.Join(parts, "\n"))
}

func describeWeixinMessage(msg WeixinMessage) string {
	var parts []string
	for _, item := range msg.ItemList {
		switch item.Type {
		case 1:
			if item.TextItem != nil && item.TextItem.Text != "" {
				parts = append(parts, item.TextItem.Text)
			}
		case 2:
			parts = append(parts, "[图片]")
		case 3:
			if item.VoiceItem != nil && item.VoiceItem.Text != "" {
				parts = append(parts, "[语音转文字] "+item.VoiceItem.Text)
			} else {
				parts = append(parts, "[语音]")
			}
		case 4:
			name := "文件"
			if item.FileItem != nil && item.FileItem.FileName != "" {
				name = item.FileItem.FileName
			}
			parts = append(parts, "[文件: "+name+"]")
		case 5:
			parts = append(parts, "[视频]")
		}
	}
	return strings.TrimSpace(strings.Join(parts, "\n"))
}

type WeixinQRResp struct {
	QRCode           string `json:"qrcode"`
	QRCodeImgContent string `json:"qrcode_img_content"`
}

type WeixinQRStatusResp struct {
	Status      string `json:"status"`
	BotToken    string `json:"bot_token"`
	ILinkBotID  string `json:"ilink_bot_id"`
	BaseURL     string `json:"baseurl"`
	ILinkUserID string `json:"ilink_user_id"`
}

func fetchWeixinQRCode(cb func(resp WeixinQRResp, ok bool, raw string)) {
	if weixinLoginBaseURL == "" {
		if cb != nil {
			cb(WeixinQRResp{}, false, "")
		}
		return
	}
	url := strings.TrimRight(weixinLoginBaseURL, "/") + "/ilink/bot/get_bot_qrcode?bot_type=" + weixinBotType
	headers, _ := json.Marshal(weixinHeaders(false))
	httpRequestAsync("GET", url, "", string(headers), func(raw string) {
		var resp WeixinQRResp
		if json.Unmarshal([]byte(raw), &resp) != nil || (resp.QRCode == "" && resp.QRCodeImgContent == "") {
			if cb != nil {
				cb(resp, false, raw)
			}
			return
		}
		if cb != nil {
			cb(resp, true, raw)
		}
	})
}

func getWeixinQRStatus(qrcode string, cb func(resp WeixinQRStatusResp, ok bool, raw string)) {
	if weixinLoginBaseURL == "" || qrcode == "" {
		if cb != nil {
			cb(WeixinQRStatusResp{}, false, "")
		}
		return
	}
	url := strings.TrimRight(weixinLoginBaseURL, "/") + "/ilink/bot/get_qrcode_status?qrcode=" + qrcode
	headers := weixinHeaders(false)
	headers["iLink-App-ClientVersion"] = "1"
	headersJSON, _ := json.Marshal(headers)
	httpRequestAsync("GET", url, "", string(headersJSON), func(raw string) {
		var resp WeixinQRStatusResp
		if json.Unmarshal([]byte(raw), &resp) != nil || resp.Status == "" {
			if cb != nil {
				cb(resp, false, raw)
			}
			return
		}
		if cb != nil {
			cb(resp, true, raw)
		}
	})
}

func getWeixinUploadURL(filekey string, mediaType int, toUserID string, rawsize, filesize int64, rawfilemd5, aeskey string, cb func(resp WeixinUploadURLResp, ok bool, raw string)) {
	if weixinBaseURL == "" || weixinToken == "" || filekey == "" || toUserID == "" {
		if cb != nil {
			cb(WeixinUploadURLResp{}, false, "")
		}
		return
	}
	url := strings.TrimRight(weixinBaseURL, "/") + "/ilink/bot/getuploadurl"
	bodyMap := map[string]interface{}{
		"filekey":       filekey,
		"media_type":    mediaType,
		"to_user_id":    toUserID,
		"rawsize":       rawsize,
		"rawfilemd5":    rawfilemd5,
		"filesize":      filesize,
		"no_need_thumb": true,
		"aeskey":        aeskey,
		"base_info": map[string]interface{}{
			"channel_version": "webos-weixin-ai-bot/1.0.0",
		},
	}
	body, _ := json.Marshal(bodyMap)
	headers, _ := json.Marshal(weixinHeaders(true))
	httpRequestAsync("POST", url, string(body), string(headers), func(raw string) {
		var resp WeixinUploadURLResp
		if json.Unmarshal([]byte(raw), &resp) != nil || strings.TrimSpace(resp.UploadParam) == "" {
			if cb != nil {
				cb(resp, false, raw)
			}
			return
		}
		if cb != nil {
			cb(resp, true, raw)
		}
	})
}

func urlQueryEscape(s string) string {
	return url.QueryEscape(strings.TrimSpace(s))
}

func hexToBase64(s string) string {
	s = strings.TrimSpace(s)
	if s == "" {
		return ""
	}
	// 对齐官方 openclaw-weixin 的行为：
	// Buffer.from(uploaded.aeskey).toString("base64")
	// 这里 uploaded.aeskey 是 hex 文本，因此应对“hex字符串本身的字节”做 base64，
	// 而不是先 hex decode 成原始 16 字节再 base64。
	return base64.StdEncoding.EncodeToString([]byte(s))
}

func buildWeixinCDNUploadURL(uploadParam, filekey string) string {
	if strings.TrimSpace(weixinCDNBaseURL) == "" || strings.TrimSpace(uploadParam) == "" || strings.TrimSpace(filekey) == "" {
		return ""
	}
	return strings.TrimRight(weixinCDNBaseURL, "/") + "/upload?encrypted_query_param=" + urlQueryEscape(uploadParam) + "&filekey=" + urlQueryEscape(filekey)
}

func toWeixinMessageItemsForUploaded(mimeType, fileName, text string, uploaded *WeixinUploadedFileInfo) []map[string]interface{} {
	items := []map[string]interface{}{}
	if strings.TrimSpace(text) != "" {
		items = append(items, map[string]interface{}{
			"type": 1,
			"text_item": map[string]interface{}{
				"text": text,
			},
		})
	}
	if uploaded == nil {
		return items
	}
	media := map[string]interface{}{
		"encrypt_query_param": uploaded.DownloadEncryptedQueryParam,
		"aes_key":             hexToBase64(uploaded.AESKeyHex),
		"encrypt_type":        1,
	}
	if strings.HasPrefix(mimeType, "image/") {
		items = append(items, map[string]interface{}{
			"type": 2,
			"image_item": map[string]interface{}{
				"media":    media,
				"mid_size": uploaded.FileSizeCiphertext,
			},
		})
	} else if strings.HasPrefix(mimeType, "video/") {
		items = append(items, map[string]interface{}{
			"type": 5,
			"video_item": map[string]interface{}{
				"media":      media,
				"video_size": uploaded.FileSizeCiphertext,
			},
		})
	} else {
		if strings.TrimSpace(fileName) == "" {
			fileName = "file.bin"
		}
		items = append(items, map[string]interface{}{
			"type": 4,
			"file_item": map[string]interface{}{
				"media":     media,
				"file_name": fileName,
				"len":       fmt.Sprintf("%d", uploaded.FileSize),
			},
		})
	}
	return items
}

func chooseInboundMedia(msg WeixinMessage) (kind string, name string, media *WeixinCDNMedia) {
	for _, item := range msg.ItemList {
		switch item.Type {
		case 2:
			if item.ImageItem != nil && item.ImageItem.Media != nil {
				return "image", "image.jpg", item.ImageItem.Media
			}
		case 4:
			if item.FileItem != nil && item.FileItem.Media != nil {
				fname := item.FileItem.FileName
				if strings.TrimSpace(fname) == "" {
					fname = "file.bin"
				}
				return "file", fname, item.FileItem.Media
			}
		case 5:
			if item.VideoItem != nil && item.VideoItem.Media != nil {
				return "video", "video.mp4", item.VideoItem.Media
			}
		case 3:
			if item.VoiceItem != nil && item.VoiceItem.Media != nil {
				return "voice", "voice.silk", item.VoiceItem.Media
			}
		}
	}
	return "", "", nil
}

func buildWeixinDownloadURL(media *WeixinCDNMedia) string {
	if media == nil {
		return ""
	}
	if strings.TrimSpace(media.URL) != "" {
		return strings.TrimSpace(media.URL)
	}
	if strings.TrimSpace(media.EncryptQueryParam) == "" || strings.TrimSpace(weixinCDNBaseURL) == "" {
		return ""
	}
	return strings.TrimRight(weixinCDNBaseURL, "/") + "/download?encrypted_query_param=" + urlQueryEscape(media.EncryptQueryParam)
}
