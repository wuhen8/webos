package config

import (
	"os"
	"path/filepath"
	"strconv"
)

const defaultDataDir = ""

func UserHome() string {
	home, err := os.UserHomeDir()
	if err != nil || home == "" {
		return "."
	}
	return home
}

// DataDir returns the base data directory for the application.
// Reads WEBOS_DATA_DIR env var; defaults to ~/.webos.
func DataDir() string {
	if v := os.Getenv("WEBOS_DATA_DIR"); v != "" {
		return v
	}
	return filepath.Join(UserHome(), ".webos")
}

func ConfigDir() string {
	return DataDir()
}

// SkillsDir returns the default skills directory path.
func SkillsDir() string {
	return filepath.Join(DataDir(), "skills")
}

// ComposeDir returns the default compose directory path.
func ComposeDir() string {
	return filepath.Join(DataDir(), "compose")
}

// Port reads WEBOS_PORT env var; defaults to 8080.
func Port() int {
	if v := os.Getenv("WEBOS_PORT"); v != "" {
		if p, err := strconv.Atoi(v); err == nil && p > 0 {
			return p
		}
	}
	return 8080
}
