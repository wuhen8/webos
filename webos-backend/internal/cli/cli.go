package cli

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"

	"webos-backend/internal/config"
	"webos-backend/internal/service"
)

// Run 通过 HTTP 调用守护进程的 /api/command 端点执行斜杠命令。
func Run(args []string) {
	if len(args) == 0 || args[0] == "help" {
		printHelp()
		return
	}

	cmdName := strings.ToLower(args[0])
	cmdArgs := ""
	if len(args) > 1 {
		cmdArgs = strings.Join(args[1:], " ")
	}

	port := config.Port()
	apiURL := fmt.Sprintf("http://127.0.0.1:%d/api/command", port)

	body, _ := json.Marshal(map[string]string{
		"command": cmdName,
		"args":    cmdArgs,
	})

	resp, err := http.Post(apiURL, "application/json", bytes.NewReader(body))
	if err != nil {
		fmt.Fprintf(os.Stderr, "无法连接服务 (端口 %d): %v\n", port, err)
		os.Exit(1)
	}
	defer resp.Body.Close()

	raw, _ := io.ReadAll(resp.Body)
	var result struct {
		Text  string `json:"text"`
		Error bool   `json:"error"`
	}
	if json.Unmarshal(raw, &result) != nil {
		fmt.Fprintf(os.Stderr, "响应解析失败: %s\n", raw)
		os.Exit(1)
	}

	if result.Text != "" {
		fmt.Println(result.Text)
	}
	if result.Error {
		os.Exit(1)
	}
}

func printHelp() {
	fmt.Println("WebOS CLI — 通过守护进程执行系统命令")
	fmt.Println()
	fmt.Println("用法: webos <command> [args...]")
	fmt.Println()
	fmt.Println("可用命令:")
	for _, c := range service.ListCommands() {
		line := fmt.Sprintf("  %-20s %s", c.Name, c.Description)
		if c.Args != "" {
			line = fmt.Sprintf("  %-20s %s  %s", c.Name, c.Description, c.Args)
		}
		fmt.Println(line)
	}
	fmt.Println()
	fmt.Printf("服务端口: %d (WEBOS_PORT 环境变量可修改)\n", config.Port())
}
