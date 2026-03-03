package service

import (
	"encoding/json"
	"fmt"
	"os/exec"
	"runtime"
	"strconv"
	"strings"
)

// DiskService handles disk listing for the WebSocket "disks" channel
type DiskService struct{}

// NewDiskService creates a new DiskService instance
func NewDiskService() *DiskService {
	return &DiskService{}
}

// DiskInfo represents a physical disk
type DiskInfo struct {
	Name       string          `json:"name"`
	Device     string          `json:"device"`
	Model      string          `json:"model"`
	Serial     string          `json:"serial"`
	Size       int64           `json:"size"`
	Type       string          `json:"type"`
	Transport  string          `json:"transport"`
	Removable  bool            `json:"removable"`
	ReadOnly   bool            `json:"readOnly"`
	Partitions []PartitionInfo `json:"partitions"`
	LVMVGName  string          `json:"lvmVGName,omitempty"`
}

// LVMPhysicalVolume represents a PV
type LVMPhysicalVolume struct {
	Device string `json:"device"`
	VGName string `json:"vgName"`
	Size   int64  `json:"size"`
	Free   int64  `json:"free"`
}

// LVMLogicalVolume represents an LV
type LVMLogicalVolume struct {
	Name       string  `json:"name"`
	VGName     string  `json:"vgName"`
	Path       string  `json:"path"`
	Size       int64   `json:"size"`
	FsType     string  `json:"fsType"`
	MountPoint string  `json:"mountPoint"`
	Used       int64   `json:"used"`
	Available  int64   `json:"available"`
	UsePercent float64 `json:"usePercent"`
}

// LVMVolumeGroup represents a VG
type LVMVolumeGroup struct {
	Name    string             `json:"name"`
	Size    int64              `json:"size"`
	Free    int64              `json:"free"`
	PVCount int                `json:"pvCount"`
	LVCount int                `json:"lvCount"`
	PVs     []LVMPhysicalVolume `json:"pvs"`
	LVs     []LVMLogicalVolume  `json:"lvs"`
}

// LVMInfo holds all LVM topology
type LVMInfo struct {
	VolumeGroups []LVMVolumeGroup `json:"volumeGroups"`
}

// MountPointInfo represents a mounted filesystem (df -Th style)
type MountPointInfo struct {
	Filesystem string  `json:"filesystem"`
	FsType     string  `json:"fsType"`
	Size       int64   `json:"size"`
	Used       int64   `json:"used"`
	Available  int64   `json:"available"`
	UsePercent float64 `json:"usePercent"`
	MountPoint string  `json:"mountPoint"`
}

// PartitionInfo represents a disk partition
type PartitionInfo struct {
	Name       string  `json:"name"`
	Device     string  `json:"device"`
	Size       int64   `json:"size"`
	FsType     string  `json:"fsType"`
	Label      string  `json:"label"`
	UUID       string  `json:"uuid"`
	MountPoint string  `json:"mountPoint"`
	Used       int64   `json:"used"`
	Available  int64   `json:"available"`
	UsePercent float64 `json:"usePercent"`
}
// GetDisks returns all physical disks and their partitions
func (s *DiskService) GetDisks() ([]DiskInfo, error) {
	if runtime.GOOS == "darwin" {
		return s.getDisksDarwin()
	}
	return s.getDisksLinux()
}

// GetLVMInfo returns LVM topology (Linux only)
func (s *DiskService) GetLVMInfo() *LVMInfo {
	if runtime.GOOS != "linux" {
		return nil
	}
	return s.getLVMInfo()
}

// GetMountPoints returns all real mounted filesystems (like df -Th)
func (s *DiskService) GetMountPoints() []MountPointInfo {
	if runtime.GOOS == "darwin" {
		return s.getMountPointsDarwin()
	}
	return s.getMountPointsLinux()
}

func (s *DiskService) getMountPointsLinux() []MountPointInfo {
	// df -BT1 : -B1 for bytes, -T for filesystem type
	cmd := exec.Command("df", "-BT1", "--output=source,fstype,size,used,avail,pcent,target")
	out, err := cmd.Output()
	if err != nil {
		// Fallback without --output (older coreutils)
		return s.getMountPointsLinuxFallback()
	}
	lines := strings.Split(string(out), "\n")
	var mps []MountPointInfo
	for i, line := range lines {
		if i == 0 { // skip header
			continue
		}
		f := strings.Fields(line)
		if len(f) < 7 {
			continue
		}
		fs := f[0]
		// Skip virtual filesystems
		if isVirtualFS(f[1]) || isVirtualFS(fs) {
			continue
		}
		size, _ := strconv.ParseInt(f[2], 10, 64)
		used, _ := strconv.ParseInt(f[3], 10, 64)
		avail, _ := strconv.ParseInt(f[4], 10, 64)
		var usePct float64
		if size > 0 {
			usePct = float64(used) / float64(size) * 100
		}
		mps = append(mps, MountPointInfo{
			Filesystem: fs,
			FsType:     f[1],
			Size:       size,
			Used:       used,
			Available:  avail,
			UsePercent: usePct,
			MountPoint: strings.Join(f[6:], " "), // mount point may contain spaces
		})
	}
	return mps
}

func (s *DiskService) getMountPointsLinuxFallback() []MountPointInfo {
	cmd := exec.Command("df", "-T", "-B1")
	out, err := cmd.Output()
	if err != nil {
		return nil
	}
	lines := strings.Split(string(out), "\n")
	var mps []MountPointInfo
	for i, line := range lines {
		if i == 0 {
			continue
		}
		f := strings.Fields(line)
		if len(f) < 7 {
			continue
		}
		if isVirtualFS(f[1]) || isVirtualFS(f[0]) {
			continue
		}
		size, _ := strconv.ParseInt(f[2], 10, 64)
		used, _ := strconv.ParseInt(f[3], 10, 64)
		avail, _ := strconv.ParseInt(f[4], 10, 64)
		var usePct float64
		if size > 0 {
			usePct = float64(used) / float64(size) * 100
		}
		mps = append(mps, MountPointInfo{
			Filesystem: f[0],
			FsType:     f[1],
			Size:       size,
			Used:       used,
			Available:  avail,
			UsePercent: usePct,
			MountPoint: strings.Join(f[6:], " "),
		})
	}
	return mps
}

func (s *DiskService) getMountPointsDarwin() []MountPointInfo {
	cmd := exec.Command("df", "-k")
	out, err := cmd.Output()
	if err != nil {
		return nil
	}
	lines := strings.Split(string(out), "\n")
	var mps []MountPointInfo
	for i, line := range lines {
		if i == 0 {
			continue
		}
		f := strings.Fields(line)
		if len(f) < 6 {
			continue
		}
		fs := f[0]
		if !strings.HasPrefix(fs, "/dev/") {
			continue
		}
		total, _ := strconv.ParseInt(f[1], 10, 64)
		used, _ := strconv.ParseInt(f[2], 10, 64)
		avail, _ := strconv.ParseInt(f[3], 10, 64)
		total *= 1024
		used *= 1024
		avail *= 1024
		var usePct float64
		if total > 0 {
			usePct = float64(used) / float64(total) * 100
		}
		// Get fstype via mount command or diskutil — use "auto" as fallback
		fsType := "apfs"
		mp := strings.Join(f[8:], " ") // "Mounted on" is at index 8
		if len(f) >= 9 {
			mp = strings.Join(f[8:], " ")
		}
		mps = append(mps, MountPointInfo{
			Filesystem: fs,
			FsType:     fsType,
			Size:       total,
			Used:       used,
			Available:  avail,
			UsePercent: usePct,
			MountPoint: mp,
		})
	}
	return mps
}

func isVirtualFS(fsType string) bool {
	switch fsType {
	case "tmpfs", "devtmpfs", "sysfs", "proc", "devpts", "securityfs",
		"cgroup", "cgroup2", "pstore", "debugfs", "hugetlbfs", "mqueue",
		"configfs", "fusectl", "tracefs", "bpf", "efivarfs", "binfmt_misc",
		"autofs", "overlay", "nsfs", "ramfs", "rpc_pipefs", "nfsd", "fuse.snapfuse",
		"fuse.lxcfs", "squashfs":
		return true
	}
	return false
}

func (s *DiskService) getLVMInfo() *LVMInfo {
	info := &LVMInfo{}

	// Parse PVs
	type pvReport struct {
		Report []struct {
			PV []struct {
				Device string `json:"pv_name"`
				VGName string `json:"vg_name"`
				Size   string `json:"pv_size"`
				Free   string `json:"pv_free"`
			} `json:"pv"`
		} `json:"report"`
	}
	pvOut, err := exec.Command("pvs", "--reportformat", "json", "--units", "b", "--nosuffix").Output()
	if err != nil {
		return info
	}
	var pvData pvReport
	if json.Unmarshal(pvOut, &pvData) != nil {
		return info
	}
	pvMap := make(map[string][]LVMPhysicalVolume) // vgName -> pvs
	for _, r := range pvData.Report {
		for _, pv := range r.PV {
			size, _ := strconv.ParseInt(strings.TrimSpace(pv.Size), 10, 64)
			free, _ := strconv.ParseInt(strings.TrimSpace(pv.Free), 10, 64)
			lpv := LVMPhysicalVolume{
				Device: pv.Device,
				VGName: pv.VGName,
				Size:   size,
				Free:   free,
			}
			pvMap[pv.VGName] = append(pvMap[pv.VGName], lpv)
		}
	}

	// Parse VGs
	type vgReport struct {
		Report []struct {
			VG []struct {
				Name    string `json:"vg_name"`
				Size    string `json:"vg_size"`
				Free    string `json:"vg_free"`
				PVCount string `json:"pv_count"`
				LVCount string `json:"lv_count"`
			} `json:"vg"`
		} `json:"report"`
	}
	vgOut, err := exec.Command("vgs", "--reportformat", "json", "--units", "b", "--nosuffix").Output()
	if err != nil {
		return info
	}
	var vgData vgReport
	if json.Unmarshal(vgOut, &vgData) != nil {
		return info
	}
	vgMap := make(map[string]*LVMVolumeGroup)
	for _, r := range vgData.Report {
		for _, vg := range r.VG {
			size, _ := strconv.ParseInt(strings.TrimSpace(vg.Size), 10, 64)
			free, _ := strconv.ParseInt(strings.TrimSpace(vg.Free), 10, 64)
			pvCount, _ := strconv.Atoi(strings.TrimSpace(vg.PVCount))
			lvCount, _ := strconv.Atoi(strings.TrimSpace(vg.LVCount))
			g := &LVMVolumeGroup{
				Name:    vg.Name,
				Size:    size,
				Free:    free,
				PVCount: pvCount,
				LVCount: lvCount,
				PVs:     pvMap[vg.Name],
			}
			vgMap[vg.Name] = g
			info.VolumeGroups = append(info.VolumeGroups, *g)
		}
	}

	// Parse LVs
	type lvReport struct {
		Report []struct {
			LV []struct {
				Name   string `json:"lv_name"`
				VGName string `json:"vg_name"`
				Path   string `json:"lv_path"`
				Size   string `json:"lv_size"`
			} `json:"lv"`
		} `json:"report"`
	}
	lvOut, err := exec.Command("lvs", "--reportformat", "json", "--units", "b", "--nosuffix", "-o", "lv_name,vg_name,lv_path,lv_size").Output()
	if err != nil {
		return info
	}
	var lvData lvReport
	if json.Unmarshal(lvOut, &lvData) != nil {
		return info
	}
	for _, r := range lvData.Report {
		for _, lv := range r.LV {
			size, _ := strconv.ParseInt(strings.TrimSpace(lv.Size), 10, 64)
			llv := LVMLogicalVolume{
				Name:   lv.Name,
				VGName: lv.VGName,
				Path:   lv.Path,
				Size:   size,
			}
			// Get mount info and fs type from lsblk for this LV
			lsOut, err := exec.Command("lsblk", "-Jb", "-o", "FSTYPE,MOUNTPOINT,SIZE", lv.Path).Output()
			if err == nil {
				var lsResult struct {
					Blockdevices []struct {
						Fstype     *string `json:"fstype"`
						Mountpoint *string `json:"mountpoint"`
						Size       json.Number `json:"size"`
					} `json:"blockdevices"`
				}
				if json.Unmarshal(lsOut, &lsResult) == nil && len(lsResult.Blockdevices) > 0 {
					bd := lsResult.Blockdevices[0]
					llv.FsType = ptrStr(bd.Fstype)
					llv.MountPoint = ptrStr(bd.Mountpoint)
					if llv.MountPoint != "" {
						s.fillLVUsage(&llv)
					}
				}
			}
			// Attach to the correct VG in the slice
			for i := range info.VolumeGroups {
				if info.VolumeGroups[i].Name == lv.VGName {
					info.VolumeGroups[i].LVs = append(info.VolumeGroups[i].LVs, llv)
					break
				}
			}
		}
	}

	return info
}

func (s *DiskService) fillLVUsage(lv *LVMLogicalVolume) {
	cmd := exec.Command("df", "-B1", lv.MountPoint)
	out, err := cmd.Output()
	if err != nil {
		return
	}
	lines := strings.Split(string(out), "\n")
	if len(lines) < 2 {
		return
	}
	f := strings.Fields(lines[1])
	if len(f) < 5 {
		return
	}
	lv.Size, _ = strconv.ParseInt(f[1], 10, 64)
	lv.Used, _ = strconv.ParseInt(f[2], 10, 64)
	lv.Available, _ = strconv.ParseInt(f[3], 10, 64)
	if lv.Size > 0 {
		lv.UsePercent = float64(lv.Used) / float64(lv.Size) * 100
	}
}

// pvDeviceToVG returns a map of PV device -> VG name for marking disks
func (s *DiskService) pvDeviceToVG() map[string]string {
	m := make(map[string]string)
	pvOut, err := exec.Command("pvs", "--reportformat", "json", "--units", "b", "--nosuffix").Output()
	if err != nil {
		return m
	}
	type pvReport struct {
		Report []struct {
			PV []struct {
				Device string `json:"pv_name"`
				VGName string `json:"vg_name"`
			} `json:"pv"`
		} `json:"report"`
	}
	var pvData pvReport
	if json.Unmarshal(pvOut, &pvData) != nil {
		return m
	}
	for _, r := range pvData.Report {
		for _, pv := range r.PV {
			m[pv.Device] = pv.VGName
		}
	}
	return m
}

// getDisksLinux uses lsblk to get disk info on Linux
func (s *DiskService) getDisksLinux() ([]DiskInfo, error) {
	cmd := exec.Command("lsblk", "-Jb", "-o", "NAME,SIZE,TYPE,FSTYPE,MOUNTPOINT,LABEL,UUID,MODEL,SERIAL,TRAN,RM,RO")
	out, err := cmd.Output()
	if err != nil {
		return nil, fmt.Errorf("lsblk error: %v", err)
	}

	var result struct {
		Blockdevices []struct {
			Name     string      `json:"name"`
			Size     json.Number `json:"size"`
			Type     string      `json:"type"`
			Fstype   *string     `json:"fstype"`
			Mountpoint *string   `json:"mountpoint"`
			Label    *string     `json:"label"`
			UUID     *string     `json:"uuid"`
			Model    *string     `json:"model"`
			Serial   *string     `json:"serial"`
			Tran     *string     `json:"tran"`
			Rm       interface{} `json:"rm"`
			Ro       interface{} `json:"ro"`
			Children []struct {
				Name       string      `json:"name"`
				Size       json.Number `json:"size"`
				Type       string      `json:"type"`
				Fstype     *string     `json:"fstype"`
				Mountpoint *string     `json:"mountpoint"`
				Label      *string     `json:"label"`
				UUID       *string     `json:"uuid"`
			} `json:"children"`
		} `json:"blockdevices"`
	}

	if err := json.Unmarshal(out, &result); err != nil {
		return nil, fmt.Errorf("parse lsblk output: %v", err)
	}

	// Build PV -> VG mapping for marking disks
	pvVGMap := s.pvDeviceToVG()

	var disks []DiskInfo
	for _, bd := range result.Blockdevices {
		if bd.Type != "disk" {
			continue
		}
		size, _ := bd.Size.Int64()

		disk := DiskInfo{
			Name:      bd.Name,
			Device:    "/dev/" + bd.Name,
			Model:     ptrStr(bd.Model),
			Serial:    ptrStr(bd.Serial),
			Size:      size,
			Type:      "disk",
			Transport: ptrStr(bd.Tran),
			Removable: toBool(bd.Rm),
			ReadOnly:  toBool(bd.Ro),
		}

		// Check if the whole disk is a PV
		if vg, ok := pvVGMap[disk.Device]; ok {
			disk.LVMVGName = vg
		}

		for _, child := range bd.Children {
			// Skip LVM logical volumes (they appear as children of PV partitions)
			if child.Type == "lvm" {
				continue
			}
			childSize, _ := child.Size.Int64()
			part := PartitionInfo{
				Name:       child.Name,
				Device:     "/dev/" + child.Name,
				Size:       childSize,
				FsType:     ptrStr(child.Fstype),
				Label:      ptrStr(child.Label),
				UUID:       ptrStr(child.UUID),
				MountPoint: ptrStr(child.Mountpoint),
			}
			if part.MountPoint != "" {
				s.fillDiskUsage(&part)
			}
			disk.Partitions = append(disk.Partitions, part)

			// Check if this partition is a PV
			if vg, ok := pvVGMap[part.Device]; ok && disk.LVMVGName == "" {
				disk.LVMVGName = vg
			}
		}
		disks = append(disks, disk)
	}
	return disks, nil
}
func (s *DiskService) getDisksDarwin() ([]DiskInfo, error) {
	cmd := exec.Command("diskutil", "list")
	out, err := cmd.Output()
	if err != nil {
		return nil, fmt.Errorf("diskutil list error: %v", err)
	}

	var disks []DiskInfo
	var currentDisk *DiskInfo
	lines := strings.Split(string(out), "\n")

	for _, line := range lines {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, "/dev/") {
			if currentDisk != nil {
				disks = append(disks, *currentDisk)
			}
			parts := strings.Fields(line)
			devName := parts[0]
			name := strings.TrimPrefix(devName, "/dev/")
			currentDisk = &DiskInfo{
				Name:   name,
				Device: devName,
				Type:   "disk",
			}
			if idx := strings.Index(line, "("); idx >= 0 {
				attrs := line[idx:]
				if strings.Contains(attrs, "external") {
					currentDisk.Transport = "usb"
					currentDisk.Removable = true
				} else if strings.Contains(attrs, "internal") {
					currentDisk.Transport = "internal"
				}
			}
			s.fillDiskInfoDarwin(currentDisk)
		} else if currentDisk != nil && strings.Contains(line, "disk") && !strings.HasPrefix(line, "/dev/") {
			part := s.parseDarwinPartitionLine(line)
			if part != nil {
				currentDisk.Partitions = append(currentDisk.Partitions, *part)
			}
		}
	}
	if currentDisk != nil {
		disks = append(disks, *currentDisk)
	}
	return disks, nil
}

func (s *DiskService) fillDiskInfoDarwin(disk *DiskInfo) {
	cmd := exec.Command("diskutil", "info", disk.Device)
	out, err := cmd.Output()
	if err != nil {
		return
	}
	for _, line := range strings.Split(string(out), "\n") {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, "Device / Media Name:") {
			disk.Model = strings.TrimSpace(strings.TrimPrefix(line, "Device / Media Name:"))
		} else if strings.HasPrefix(line, "Disk Size:") {
			val := strings.TrimSpace(strings.TrimPrefix(line, "Disk Size:"))
			if fields := strings.Fields(val); len(fields) >= 1 {
				disk.Size, _ = strconv.ParseInt(fields[0], 10, 64)
			}
			if disk.Size == 0 {
				disk.Size = parseBytesFromParens(val)
			}
		} else if strings.HasPrefix(line, "Total Size:") {
			if disk.Size == 0 {
				val := strings.TrimSpace(strings.TrimPrefix(line, "Total Size:"))
				if fields := strings.Fields(val); len(fields) >= 1 {
					disk.Size, _ = strconv.ParseInt(fields[0], 10, 64)
				}
			}
		} else if strings.HasPrefix(line, "Read-Only Media:") {
			disk.ReadOnly = strings.Contains(line, "Yes")
		} else if strings.HasPrefix(line, "Removable Media:") {
			disk.Removable = strings.Contains(line, "Removable")
		}
	}
}
func (s *DiskService) parseDarwinPartitionLine(line string) *PartitionInfo {
	fields := strings.Fields(line)
	if len(fields) < 3 {
		return nil
	}
	lastField := fields[len(fields)-1]
	if !strings.Contains(lastField, "disk") {
		return nil
	}

	part := &PartitionInfo{
		Name:   lastField,
		Device: "/dev/" + lastField,
	}

	cmd := exec.Command("diskutil", "info", part.Device)
	out, err := cmd.Output()
	if err != nil {
		return part
	}

	for _, il := range strings.Split(string(out), "\n") {
		il = strings.TrimSpace(il)
		if strings.HasPrefix(il, "File System Personality:") || strings.HasPrefix(il, "Type (Bundle):") {
			part.FsType = strings.TrimSpace(strings.SplitN(il, ":", 2)[1])
		} else if strings.HasPrefix(il, "Volume Name:") {
			part.Label = strings.TrimSpace(strings.TrimPrefix(il, "Volume Name:"))
		} else if strings.HasPrefix(il, "Volume UUID:") || strings.HasPrefix(il, "Disk / Partition UUID:") {
			part.UUID = strings.TrimSpace(strings.SplitN(il, ":", 2)[1])
		} else if strings.HasPrefix(il, "Mount Point:") {
			part.MountPoint = strings.TrimSpace(strings.TrimPrefix(il, "Mount Point:"))
		} else if strings.HasPrefix(il, "Disk Size:") || strings.HasPrefix(il, "Total Size:") || strings.HasPrefix(il, "Container Total Space:") || strings.HasPrefix(il, "Volume Total Space:") {
			val := strings.TrimSpace(strings.SplitN(il, ":", 2)[1])
			if b := parseBytesFromParens(val); b > 0 {
				part.Size = b
			}
		} else if strings.HasPrefix(il, "Volume Used Space:") {
			val := strings.TrimSpace(strings.SplitN(il, ":", 2)[1])
			part.Used = parseBytesFromParens(val)
		} else if strings.HasPrefix(il, "Volume Available Space:") {
			val := strings.TrimSpace(strings.SplitN(il, ":", 2)[1])
			part.Available = parseBytesFromParens(val)
		}
	}

	if part.Size > 0 && part.Used > 0 {
		part.UsePercent = float64(part.Used) / float64(part.Size) * 100
	}
	return part
}

func (s *DiskService) fillDiskUsage(part *PartitionInfo) {
	var cmd *exec.Cmd
	if runtime.GOOS == "darwin" {
		cmd = exec.Command("df", "-k", part.MountPoint)
	} else {
		cmd = exec.Command("df", "-B1", part.MountPoint)
	}
	out, err := cmd.Output()
	if err != nil {
		return
	}
	lines := strings.Split(string(out), "\n")
	if len(lines) < 2 {
		return
	}
	f := strings.Fields(lines[1])
	if len(f) < 5 {
		return
	}
	if runtime.GOOS == "darwin" {
		total, _ := strconv.ParseInt(f[1], 10, 64)
		used, _ := strconv.ParseInt(f[2], 10, 64)
		avail, _ := strconv.ParseInt(f[3], 10, 64)
		part.Size = total * 1024
		part.Used = used * 1024
		part.Available = avail * 1024
	} else {
		part.Size, _ = strconv.ParseInt(f[1], 10, 64)
		part.Used, _ = strconv.ParseInt(f[2], 10, 64)
		part.Available, _ = strconv.ParseInt(f[3], 10, 64)
	}
	if part.Size > 0 {
		part.UsePercent = float64(part.Used) / float64(part.Size) * 100
	}
}

// parseBytesFromParens extracts byte count from strings like "... (500,107,862,016 Bytes)"
func parseBytesFromParens(val string) int64 {
	idx := strings.Index(val, "(")
	if idx < 0 {
		return 0
	}
	end := strings.Index(val[idx:], " Bytes")
	if end <= 0 {
		return 0
	}
	numStr := strings.ReplaceAll(val[idx+1:idx+end], ",", "")
	numStr = strings.TrimSpace(numStr)
	n, _ := strconv.ParseInt(numStr, 10, 64)
	return n
}

func ptrStr(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}

// toBool converts interface{} from lsblk JSON to bool.
// Handles both bool (newer util-linux) and number (older util-linux).
func toBool(v interface{}) bool {
	switch val := v.(type) {
	case bool:
		return val
	case json.Number:
		n, _ := val.Int64()
		return n == 1
	case float64:
		return val == 1
	case string:
		return val == "1" || val == "true"
	default:
		return false
	}
}
