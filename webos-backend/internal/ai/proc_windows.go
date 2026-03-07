//go:build windows

package ai

import (
	"os/exec"
	"strconv"
)

func setProcAttr(cmd *exec.Cmd) {
	// On Windows, process groups are handled differently.
	// Cancellation is implemented via taskkill in killProcess.
}

func killProcess(cmd *exec.Cmd) error {
	if cmd.Process == nil {
		return nil
	}

	pid := strconv.Itoa(cmd.Process.Pid)
	if err := exec.Command("taskkill", "/T", "/F", "/PID", pid).Run(); err == nil {
		return nil
	}

	return cmd.Process.Kill()
}
