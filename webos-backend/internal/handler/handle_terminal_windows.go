//go:build windows

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

	// Detect shell: prefer PowerShell, fall back to COMSPEC (cmd.exe)
	shell := os.Getenv("COMSPEC")
	if shell == "" {
		shell = "cmd.exe"
	}

	cmd := exec.Command(shell)
	cmd.Dir = config.UserHome()

	// Use pipes for stdin/stdout/stderr on Windows (no pty support)
	stdinPipe, err := cmd.StdinPipe()
	if err != nil {
		c.Notify("error", map[string]string{"message": fmt.Sprintf("failed to create stdin pipe: %v", err)})
		return
	}
	stdoutPipe, err := cmd.StdoutPipe()
	if err != nil {
		c.Notify("error", map[string]string{"message": fmt.Sprintf("failed to create stdout pipe: %v", err)})
		return
	}
	cmd.Stderr = cmd.Stdout // merge stderr into stdout

	if err := cmd.Start(); err != nil {
		c.Notify("error", map[string]string{"message": fmt.Sprintf("failed to start shell: %v", err)})
		return
	}

	// Use Ptmx field to hold a writable pipe for input.
	// On Windows we store the stdin pipe writer as an *os.File via a temporary pipe trick.
	// Instead, we store the stdinPipe in a wrapper. Since TerminalSession.Ptmx is *os.File,
	// we create a pipe pair and bridge it.
	pr, pw, err := os.Pipe()
	if err != nil {
		c.Notify("error", map[string]string{"message": fmt.Sprintf("failed to create pipe: %v", err)})
		cmd.Process.Kill()
		return
	}

	// Bridge: read from pr and write to stdinPipe
	go func() {
		defer stdinPipe.Close()
		io.Copy(stdinPipe, pr)
	}()

	sess := &TerminalSession{
		Sid:  sid,
		Cmd:  cmd,
		Ptmx: pw, // write end of pipe -> stdin of process
		Done: make(chan struct{}),
	}
	c.Sessions[sid] = sess

	c.Reply("terminal.opened", p.ReqID, map[string]string{"sid": sid})

	// stdout -> WS output goroutine
	go func() {
		buf := make([]byte, 4096)
		for {
			n, err := stdoutPipe.Read(buf)
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

func handleTerminalResize(c *WSConn, _ json.RawMessage) {
	// Windows pipe-based terminal does not support resize.
	// This is a no-op to avoid errors on the frontend.
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
