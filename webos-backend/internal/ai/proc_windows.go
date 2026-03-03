//go:build windows

package ai

import "os/exec"

func setProcAttr(cmd *exec.Cmd) {
	// On Windows, process groups are handled differently.
	// CommandContext already calls Process.Kill on cancel.
}
