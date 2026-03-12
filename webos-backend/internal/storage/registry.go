package storage

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"

	"webos-backend/internal/config"
	"webos-backend/internal/database"
)

// StorageNodeDef is the in-memory representation of a storage node.
type StorageNodeDef struct {
	ID     string
	Name   string
	Type   string
	Config map[string]interface{}
}

var (
	driverRegistry   = make(map[string]Driver)
	nodeConfigs      = make(map[string]map[string]interface{})
	driverRegistryMu sync.RWMutex
)

// InitDrivers initializes storage drivers from the given definitions.
func InitDrivers(nodes []StorageNodeDef) error {
	driverRegistryMu.Lock()
	defer driverRegistryMu.Unlock()

	driverRegistry = make(map[string]Driver)
	nodeConfigs = make(map[string]map[string]interface{})

	var initErrors []string
	for _, node := range nodes {
		driver, err := createDriver(node)
		if err != nil {
			fmt.Printf("Warning: failed to init storage node %q (%s): %v\n", node.Name, node.ID, err)
			initErrors = append(initErrors, fmt.Sprintf("%s: %v", node.ID, err))
			continue
		}
		driverRegistry[node.ID] = driver
		nodeConfigs[node.ID] = node.Config
	}

	if len(initErrors) > 0 {
		return fmt.Errorf("failed to init storage nodes: %s", strings.Join(initErrors, "; "))
	}
	return nil
}

// ReloadDrivers reads storage nodes from the database and re-initialises all drivers.
func ReloadDrivers() error {
	rows, err := database.ListStorageNodes()
	if err != nil {
		return fmt.Errorf("reload drivers: %w", err)
	}

	defs := make([]StorageNodeDef, 0, len(rows))
	for _, r := range rows {
		cfg := make(map[string]interface{})
		_ = json.Unmarshal([]byte(r.Config), &cfg)
		defs = append(defs, StorageNodeDef{ID: r.ID, Name: r.Name, Type: r.Type, Config: cfg})
	}
	return InitDrivers(defs)
}

// GetDriver returns the storage driver for the given node ID.
func GetDriver(nodeID string) (Driver, error) {
	driverRegistryMu.RLock()
	defer driverRegistryMu.RUnlock()

	driver, ok := driverRegistry[nodeID]
	if !ok {
		return nil, fmt.Errorf("storage node %q not found", nodeID)
	}
	return driver, nil
}

// DefaultNodeID returns a sensible default node ID when none is specified.
// Prefers "local_1" if it exists, otherwise returns the only node if there is
// exactly one. Returns empty string if no default can be determined.
func DefaultNodeID() string {
	driverRegistryMu.RLock()
	defer driverRegistryMu.RUnlock()

	if _, ok := driverRegistry["local_1"]; ok {
		return "local_1"
	}
	if len(driverRegistry) == 1 {
		for id := range driverRegistry {
			return id
		}
	}
	return ""
}

// AllNodeIDs returns the IDs of all registered storage nodes.
func AllNodeIDs() []string {
	driverRegistryMu.RLock()
	defer driverRegistryMu.RUnlock()

	ids := make([]string, 0, len(driverRegistry))
	for id := range driverRegistry {
		ids = append(ids, id)
	}
	return ids
}

func userHome() string {
	home, err := os.UserHomeDir()
	if err != nil || home == "" {
		return "."
	}
	return home
}

// GetNodeRootPath returns the root path used by the indexer for building
// relative paths in the file index tree. Defaults to the user's home directory.
func GetNodeRootPath(nodeID string) string {
	return userHome()
}

func defaultUploadsDir() string {
	return filepath.Join(config.DataDir(), "uploads")
}

func createDriver(node StorageNodeDef) (Driver, error) {
	switch node.Type {
	case "local":
		uploadsDir, _ := node.Config["uploadsDir"].(string)
		if uploadsDir == "" {
			uploadsDir = defaultUploadsDir()
		}
		return NewLocalDriver(uploadsDir), nil

	case "s3":
		endpoint, _ := node.Config["endpoint"].(string)
		accessKey, _ := node.Config["accessKey"].(string)
		secretKey, _ := node.Config["secretKey"].(string)
		bucket, _ := node.Config["bucket"].(string)
		region, _ := node.Config["region"].(string)
		useSSL := true
		if v, ok := node.Config["useSSL"].(bool); ok {
			useSSL = v
		}

		if endpoint == "" || bucket == "" {
			return nil, fmt.Errorf("S3 driver requires endpoint and bucket")
		}

		return NewS3Driver(endpoint, accessKey, secretKey, bucket, region, useSSL)

	default:
		return nil, fmt.Errorf("unknown storage type: %s", node.Type)
	}
}
