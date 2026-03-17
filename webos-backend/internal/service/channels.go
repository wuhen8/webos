// Package service — channel registrations.
// Each channel declares its fetch function and push mode.
// Transport adapters (ws, wasm, …) never need to know these details.
package service

import (
	"runtime"
	"time"

	"webos-backend/internal/config"
	"webos-backend/internal/database"
	"webos-backend/internal/pubsub"
)

// RegisterChannels registers all subscribable data channels with the pubsub engine.
// Must be called once at startup after services are initialized.
func RegisterChannels() {
	ps := pubsub.Default

	systemSvc := NewSystemService()
	dockerSvc := GetDockerService()
	diskSvc := NewDiskService()

	// ── Poll channels (periodic data) ──

	ps.Register(&pubsub.ChannelDef{
		Name:            "sub.overview",
		Mode:            pubsub.Poll,
		DefaultInterval: 2 * time.Second,
		Fetch: func() (interface{}, error) {
			return systemSvc.GetOverview()
		},
	})

	ps.Register(&pubsub.ChannelDef{
		Name:            "sub.processes",
		Mode:            pubsub.Poll,
		DefaultInterval: 2 * time.Second,
		Fetch: func() (interface{}, error) {
			procs, err := systemSvc.GetProcessList()
			if err != nil {
				return nil, err
			}
			return map[string]interface{}{"processes": procs, "total": len(procs)}, nil
		},
	})

	ps.Register(&pubsub.ChannelDef{
		Name:            "sub.docker_containers",
		Mode:            pubsub.Poll,
		DefaultInterval: 2 * time.Second,
		Fetch: func() (interface{}, error) {
			if !dockerSvc.IsAvailable() {
				return map[string]interface{}{"available": false, "containers": []interface{}{}}, nil
			}
			containers, err := dockerSvc.ListContainersWithStats()
			if err != nil {
				return nil, err
			}
			return map[string]interface{}{"available": true, "containers": containers}, nil
		},
		OnFirstSubscribe:  func() { dockerSvc.StartStats() },
		OnLastUnsubscribe: func() { dockerSvc.StopStats() },
	})

	ps.Register(&pubsub.ChannelDef{
		Name:            "sub.docker_images",
		Mode:            pubsub.Poll,
		DefaultInterval: 5 * time.Second,
		Fetch: func() (interface{}, error) {
			if !dockerSvc.IsAvailable() {
				return map[string]interface{}{"available": false, "images": []interface{}{}}, nil
			}
			images, err := dockerSvc.ListImages()
			if err != nil {
				return nil, err
			}
			return map[string]interface{}{"available": true, "images": images}, nil
		},
	})

	ps.Register(&pubsub.ChannelDef{
		Name:            "sub.docker_compose",
		Mode:            pubsub.Poll,
		DefaultInterval: 5 * time.Second,
		Fetch: func() (interface{}, error) {
			if !dockerSvc.IsAvailable() {
				return map[string]interface{}{"available": false, "projects": []interface{}{}}, nil
			}
			projects, err := dockerSvc.ListComposeProjects()
			if err != nil {
				return nil, err
			}
			composeBaseDir := config.ComposeDir()
			scanned, _ := dockerSvc.ScanComposeDir(composeBaseDir)

			appstoreDirs := make(map[string]bool)
			rows, err := database.DB().Query("SELECT install_dir FROM installed_apps WHERE install_dir != ''")
			if err == nil {
				defer rows.Close()
				for rows.Next() {
					var dir string
					if rows.Scan(&dir) == nil {
						appstoreDirs[dir] = true
					}
				}
			}

			projects = MergeComposeProjects(projects, scanned, appstoreDirs)
			return map[string]interface{}{"available": true, "projects": projects}, nil
		},
	})

	ps.Register(&pubsub.ChannelDef{
		Name:            "sub.docker_networks",
		Mode:            pubsub.Poll,
		DefaultInterval: 5 * time.Second,
		Fetch: func() (interface{}, error) {
			if !dockerSvc.IsAvailable() {
				return map[string]interface{}{"available": false, "networks": []interface{}{}}, nil
			}
			networks, err := dockerSvc.ListNetworks()
			if err != nil {
				return nil, err
			}
			return map[string]interface{}{"available": true, "networks": networks}, nil
		},
	})

	ps.Register(&pubsub.ChannelDef{
		Name:            "sub.docker_volumes",
		Mode:            pubsub.Poll,
		DefaultInterval: 5 * time.Second,
		Fetch: func() (interface{}, error) {
			if !dockerSvc.IsAvailable() {
				return map[string]interface{}{"available": false, "volumes": []interface{}{}}, nil
			}
			volumes, err := dockerSvc.ListVolumes()
			if err != nil {
				return nil, err
			}
			return map[string]interface{}{"available": true, "volumes": volumes}, nil
		},
	})

	ps.Register(&pubsub.ChannelDef{
		Name:            "sub.disks",
		Mode:            pubsub.Poll,
		DefaultInterval: 5 * time.Second,
		Fetch: func() (interface{}, error) {
			disks, err := diskSvc.GetDisks()
			if err != nil {
				return nil, err
			}
			data := map[string]interface{}{
				"os":          runtime.GOOS,
				"disks":       disks,
				"mountPoints": diskSvc.GetMountPoints(),
			}
			if lvmInfo := diskSvc.GetLVMInfo(); lvmInfo != nil {
				data["lvm"] = lvmInfo
			}
			return data, nil
		},
	})

	ps.Register(&pubsub.ChannelDef{
		Name:            "sub.services",
		Mode:            pubsub.Poll,
		DefaultInterval: 5 * time.Second,
		Fetch: func() (interface{}, error) {
			svcs, err := systemSvc.GetServiceList()
			if err != nil {
				return nil, err
			}
			return map[string]interface{}{"services": svcs, "total": len(svcs)}, nil
		},
	})

	ps.Register(&pubsub.ChannelDef{
		Name:            "sub.tasks",
		Mode:            pubsub.Poll,
		DefaultInterval: 2 * time.Second,
		Fetch: func() (interface{}, error) {
			list := GetTaskManager().GetAll()
			return map[string]interface{}{"tasks": list, "total": len(list)}, nil
		},
	})

	// ── Event channels (push on change only) ──

	ps.Register(&pubsub.ChannelDef{
		Name: "sub.storage_nodes",
		Mode: pubsub.Event,
		Fetch: func() (interface{}, error) {
			return ListStorageNodes()
		},
	})

	ps.Register(&pubsub.ChannelDef{
		Name: "sub.sidebar",
		Mode: pubsub.Event,
		Fetch: func() (interface{}, error) {
			return GetSidebar()
		},
	})

	// ISO/disc image mounts (Event mode - only push on mount/unmount)
	ps.Register(&pubsub.ChannelDef{
		Name: "sub.mounts",
		Mode: pubsub.Event,
		Fetch: func() (interface{}, error) {
			return ParseIsoMounts(), nil
		},
	})

}

// NotifyStorageNodesChanged pushes the latest storage node list to all subscribers.
func NotifyStorageNodesChanged() {
	pubsub.Default.PublishFetch("sub.storage_nodes")
}

// NotifySidebarChanged pushes the latest sidebar config to all subscribers.
func NotifySidebarChanged() {
	pubsub.Default.PublishFetch("sub.sidebar")
}

// NotifyMountsChanged pushes the latest mounts list to all subscribers.
func NotifyMountsChanged() {
	pubsub.Default.PublishFetch("sub.mounts")
}
