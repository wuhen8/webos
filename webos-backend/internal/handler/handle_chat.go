package handler

import (
	"encoding/json"

	"webos-backend/internal/ai"
	"webos-backend/internal/service"
)

// wsSink implements ai.ChatSink for WebSocket connections.
type wsSink struct {
	writeJSON func(v interface{}) error
}

func (s *wsSink) OnDelta(convID, text string) {
	s.writeJSON(jsonrpcNotification{JSONRPC: "2.0", Method: "chat.delta", Params: map[string]string{
		"conversationId": convID, "content": text,
	}})
}

func (s *wsSink) OnThinking(convID, text string) {
	s.writeJSON(jsonrpcNotification{JSONRPC: "2.0", Method: "chat.thinking", Params: map[string]string{
		"conversationId": convID, "content": text,
	}})
}

func (s *wsSink) OnToolCallPending(convID string, pending ai.ToolCallPending) {
	s.writeJSON(jsonrpcNotification{JSONRPC: "2.0", Method: "chat.tool_call_pending", Params: map[string]interface{}{
		"conversationId": convID, "pending": pending,
	}})
}

func (s *wsSink) OnToolCall(convID string, call ai.ToolCall) {
	s.writeJSON(jsonrpcNotification{JSONRPC: "2.0", Method: "chat.tool_call", Params: map[string]interface{}{
		"conversationId": convID, "toolCall": call,
	}})
}

func (s *wsSink) OnToolResult(convID string, result ai.ToolResult) {
	s.writeJSON(jsonrpcNotification{JSONRPC: "2.0", Method: "chat.tool_result", Params: map[string]interface{}{
		"conversationId": convID, "result": result,
	}})
}

func (s *wsSink) OnShellOutput(convID, toolCallID string, output ai.ShellOutput) {
	s.writeJSON(jsonrpcNotification{JSONRPC: "2.0", Method: "chat.shell_output", Params: map[string]interface{}{
		"conversationId": convID,
		"toolCallId":     toolCallID,
		"output":         output,
	}})
}

func (s *wsSink) OnUIAction(convID string, action ai.UIAction) {
	s.writeJSON(jsonrpcNotification{JSONRPC: "2.0", Method: "chat.ui_action", Params: map[string]interface{}{
		"conversationId": convID, "action": action,
	}})
}

func (s *wsSink) OnMediaAttachment(convID string, attachment ai.MediaAttachment) {
	s.writeJSON(jsonrpcNotification{JSONRPC: "2.0", Method: "chat.media", Params: map[string]interface{}{
		"conversationId": convID, "attachment": attachment,
	}})
}

func (s *wsSink) OnDone(convID, fullText string, usage ai.TokenUsage) {
	s.writeJSON(jsonrpcNotification{JSONRPC: "2.0", Method: "chat.done", Params: map[string]interface{}{
		"conversationId": convID,
		"usage":          usage,
	}})
}

func (s *wsSink) OnError(convID string, err error) {
	s.writeJSON(jsonrpcNotification{JSONRPC: "2.0", Method: "chat.error", Params: map[string]interface{}{
		"message":        err.Error(),
		"conversationId": convID,
	}})
}

func (s *wsSink) OnSystemEvent(msgType string, data interface{}) {
	s.writeJSON(jsonrpcNotification{JSONRPC: "2.0", Method: msgType, Params: data})
}

func init() {
	RegisterHandlers(map[string]Handler{
		"chat.send":            handleChatSend,
		"chat.commands":        handleChatCommands,
		"chat.cleanup":         handleChatCleanup,
		"chat.status":          handleChatStatus,
		"chat.stop":            handleChatStop,
		"chat.executor_status": asyncHandler[struct{ baseReq }]("chat.executor_status", func(c *WSConn, p struct{ baseReq }) (interface{}, error) {
			return chatSvc.ExecutorStatus(), nil
		}),
		"chat.history": asyncHandler[struct{ baseReq }]("chat.history", func(c *WSConn, p struct{ baseReq }) (interface{}, error) {
			return chatSvc.ListConversations()
		}),
		"chat.messages":                 handleChatMessages,
		"chat.delete":                   handleChatDelete,
		"chat.conversation_config_get":  handleConversationConfigGet,
		"chat.conversation_config_set":  handleConversationConfigSet,
		"config.get":                    handleChatConfigGet,
		"config.set":                    handleChatConfigSave,
	})
}

func handleChatSend(c *WSConn, raw json.RawMessage) {
	var p struct {
		ConversationID string `json:"conversationId"`
		MessageContent string `json:"messageContent"`
		ClientID       string `json:"clientId"`
		ProviderID     string `json:"providerId"`
		Model          string `json:"model"`
	}
	json.Unmarshal(raw, &p)

	// Use connID as clientID — each WS connection has its own ClientContext and sink
	clientID := p.ClientID
	if clientID == "" {
		clientID = c.ConnID
	}

	result := chatSvc.SendMessage(p.ConversationID, p.MessageContent, clientID, p.ProviderID, p.Model)
	if !result.Accepted {
		c.Notify("chat.error", map[string]interface{}{
			"message":        "消息入队失败，请重试",
			"conversationId": p.ConversationID,
		})
	}
}

func handleChatCommands(c *WSConn, raw json.RawMessage) {
	go func() {
		var p struct{ baseReq }
		json.Unmarshal(raw, &p)
		c.Reply("chat.commands", p.ReqID, chatSvc.Commands())
	}()
}


func handleChatCleanup(c *WSConn, raw json.RawMessage) {
	go chatSvc.Cleanup()
}

func handleChatMessages(c *WSConn, raw json.RawMessage) {
	var p struct {
		baseReq
		ConversationID string `json:"conversationId"`
	}
	json.Unmarshal(raw, &p)
	go func() {
		msgs, err := chatSvc.GetMessages(p.ConversationID)
		c.ReplyResult("chat.messages", p.ReqID, msgs, err)
	}()
}

func handleChatDelete(c *WSConn, raw json.RawMessage) {
	var p struct {
		baseReq
		ConversationID string `json:"conversationId"`
	}
	json.Unmarshal(raw, &p)
	go func() {
		c.ReplyResult("chat.delete", p.ReqID, nil, chatSvc.DeleteConversation(p.ConversationID))
	}()
}

func handleChatConfigGet(c *WSConn, raw json.RawMessage) {
	var p struct {
		baseReq
		Key string `json:"key"`
	}
	json.Unmarshal(raw, &p)
	go func() {
		data, err := service.GetPreferences()
		if err != nil {
			c.ReplyErr("config.get", p.ReqID, err)
			return
		}
		value, _ := data[p.Key]
		c.Reply("config.get", p.ReqID, map[string]interface{}{"value": value})
	}()
}

func handleChatConfigSave(c *WSConn, raw json.RawMessage) {
	var p struct {
		baseReq
		Key   string      `json:"key"`
		Value interface{} `json:"value"`
	}
	json.Unmarshal(raw, &p)
	go func() {
		c.ReplyResult("config.set", p.ReqID, nil, service.SavePreferences(map[string]interface{}{p.Key: p.Value}))
	}()
}

func handleChatStatus(c *WSConn, raw json.RawMessage) {
	var p struct {
		baseReq
		ConversationID string `json:"conversationId"`
	}
	json.Unmarshal(raw, &p)
	c.Reply("chat.status", p.ReqID, chatSvc.GetStatus(p.ConversationID))
}

func handleChatStop(c *WSConn, raw json.RawMessage) {
	var p struct {
		baseReq
		ConversationID string `json:"conversationId"`
	}
	json.Unmarshal(raw, &p)
	go func() {
		result, err := chatSvc.StopConversation(p.ConversationID)
		c.ReplyResult("chat.stop", p.ReqID, result, err)
	}()
}

func handleConversationConfigGet(c *WSConn, raw json.RawMessage) {
	var p struct {
		baseReq
		ConversationID string `json:"conversationId"`
	}
	json.Unmarshal(raw, &p)
	go func() {
		cfg, err := chatSvc.GetConversationConfig(p.ConversationID)
		c.ReplyResult("chat.conversation_config_get", p.ReqID, cfg, err)
	}()
}

func handleConversationConfigSet(c *WSConn, raw json.RawMessage) {
	var p struct {
		baseReq
		ConversationID string `json:"conversationId"`
		ProviderID     string `json:"providerId"`
		Model          string `json:"model"`
	}
	json.Unmarshal(raw, &p)
	go func() {
		cfg, err := chatSvc.SetConversationConfig(p.ConversationID, p.ProviderID, p.Model)
		c.ReplyResult("chat.conversation_config_set", p.ReqID, cfg, err)
	}()
}

