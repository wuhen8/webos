//go:build !windows

package handler

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"os/exec"
	"strings"
	"unicode/utf8"

	"webos-backend/internal/config"

	"github.com/creack/pty"
)

func init() {
	RegisterHandlers(map[string]Handler{
		"terminal.open":   handleTerminalOpen,
		"terminal.input":  handleTerminalInput,
		"terminal.resize": handleTerminalResize,
		"terminal.close":  handleTerminalClose,
	})
}

func genSid() string {
	b := make([]byte, 8)
	rand.Read(b)
	return hex.EncodeToString(b)
}

func handleTerminalOpen(c *WSConn, raw json.RawMessage) {
	var p struct {
		ReqID string `json:"reqId"`
	}
	json.Unmarshal(raw, &p)

	sid := genSid()

	shell := os.Getenv("SHELL")
	if shell == "" {
		shell = "/bin/sh"
	}

	cmd := exec.Command(shell, "-l")
	cmd.Dir = config.UserHome()
	cmd.Env = append(os.Environ(), "TERM=xterm-256color", "LANG=en_US.UTF-8", "LC_ALL=en_US.UTF-8")

	ptmx, err := pty.Start(cmd)
	if err != nil {
		c.Notify("error", map[string]string{"message": fmt.Sprintf("failed to start shell: %v", err)})
		return
	}

	_ = pty.Setsize(ptmx, &pty.Winsize{Rows: 24, Cols: 80})

	sess := &TerminalSession{
		Sid:  sid,
		Cmd:  cmd,
		Ptmx: ptmx,
		Done: make(chan struct{}),
	}
	c.Sessions[sid] = sess

	c.Reply("terminal.opened", p.ReqID, map[string]string{"sid": sid})

	// pty -> WS output goroutine
	go func() {
		buf := make([]byte, 4096)
		for {
			n, err := ptmx.Read(buf)
			if err != nil {
				if err != io.EOF {
					// normal close
				}
				c.Notify("terminal.exited", map[string]string{"sid": sid})
				sess.Cleanup()
				return
			}
			if n > 0 {
				data := buf[:n]
				if !utf8.Valid(data) {
					data = []byte(strings.ToValidUTF8(string(data), "?"))
				}
				c.Notify("terminal.output", map[string]interface{}{
					"sid":  sid,
					"data": string(data),
				})
			}
		}
	}()
}

func handleTerminalInput(c *WSConn, raw json.RawMessage) {
	var p struct {
		Sid  string `json:"sid"`
		Data string `json:"data"`
	}
	json.Unmarshal(raw, &p)

	if sess, ok := c.Sessions[p.Sid]; ok {
		select {
		case <-sess.Done:
		default:
			sess.Ptmx.Write([]byte(p.Data))
		}
	}
}

func handleTerminalResize(c *WSConn, raw json.RawMessage) {
	var p struct {
		Sid  string `json:"sid"`
		Cols uint16 `json:"cols"`
		Rows uint16 `json:"rows"`
	}
	json.Unmarshal(raw, &p)

	if sess, ok := c.Sessions[p.Sid]; ok {
		if p.Cols > 0 && p.Rows > 0 {
			_ = pty.Setsize(sess.Ptmx, &pty.Winsize{
				Rows: p.Rows,
				Cols: p.Cols,
			})
		}
	}
}

func handleTerminalClose(c *WSConn, raw json.RawMessage) {
	var p struct {
		Sid string `json:"sid"`
	}
	json.Unmarshal(raw, &p)

	if sess, ok := c.Sessions[p.Sid]; ok {
		sess.Cleanup()
		delete(c.Sessions, p.Sid)
	}
}
