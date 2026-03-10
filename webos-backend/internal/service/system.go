package service

import (
	"bufio"
	"bytes"
	"context"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
	"unicode/utf16"
	"unicode/utf8"

	"golang.org/x/text/encoding/simplifiedchinese"
)

// SystemService handles system monitoring business logic
type SystemService struct {
	cacheMu        sync.RWMutex
	overviewCache  *SystemOverview
	overviewExpiry time.Time
	processCache   []ProcessInfo
	processExpiry  time.Time
	prevCPUTicks   map[int]uint64
	prevCPUTime    time.Time
}

// NewSystemService creates a new SystemService instance
func NewSystemService() *SystemService {
	return &SystemService{}
}

func DecodeWindowsOutput(data []byte) string {
	if len(data) == 0 {
		return ""
	}
	if utf8.Valid(data) {
		return string(data)
	}
	if len(data) >= 2 {
		if bytes.HasPrefix(data, []byte{0xff, 0xfe}) {
			return string(utf16.Decode(bytesToUint16s(data[2:], binary.LittleEndian)))
		}
		if bytes.HasPrefix(data, []byte{0xfe, 0xff}) {
			return string(utf16.Decode(bytesToUint16s(data[2:], binary.BigEndian)))
		}
		if looksLikeUTF16(data, binary.LittleEndian) {
			return string(utf16.Decode(bytesToUint16s(data, binary.LittleEndian)))
		}
		if looksLikeUTF16(data, binary.BigEndian) {
			return string(utf16.Decode(bytesToUint16s(data, binary.BigEndian)))
		}
	}
	if decoded, err := simplifiedchinese.GBK.NewDecoder().Bytes(data); err == nil && utf8.Valid(decoded) {
		return string(decoded)
	}
	return string(bytes.Runes(data))
}

func bytesToUint16s(data []byte, order binary.ByteOrder) []uint16 {
	if len(data) < 2 {
		return nil
	}
	if len(data)%2 != 0 {
		data = data[:len(data)-1]
	}
	words := make([]uint16, 0, len(data)/2)
	for i := 0; i+1 < len(data); i += 2 {
		words = append(words, order.Uint16(data[i:i+2]))
	}
	return words
}

func looksLikeUTF16(data []byte, order binary.ByteOrder) bool {
	if len(data) < 4 || len(data)%2 != 0 {
		return false
	}
	zeros := 0
	asciiish := 0
	for i := 0; i+1 < len(data); i += 2 {
		word := order.Uint16(data[i : i+2])
		if word == 0 {
			zeros++
			continue
		}
		if word >= 0x09 && word <= 0x7f {
			asciiish++
		}
	}
	pairs := len(data) / 2
	return zeros*2 <= pairs && asciiish*2 >= pairs
}

// UserShell returns the user's default shell, falling back to /bin/sh.
func UserShell() string {
	if runtime.GOOS == "windows" {
		if pwsh, err := exec.LookPath("pwsh.exe"); err == nil {
			return pwsh
		}
		if powershell, err := exec.LookPath("powershell.exe"); err == nil {
			return powershell
		}
	}
	if s := os.Getenv("SHELL"); s != "" {
		return s
	}
	if s := os.Getenv("COMSPEC"); s != "" {
		return s
	}
	if runtime.GOOS == "windows" {
		return "cmd.exe"
	}
	return "/bin/sh"
}

// ProcessInfo represents process information
type ProcessInfo struct {
	PID     int     `json:"pid"`
	User    string  `json:"user"`
	CPU     float64 `json:"cpu"`
	Mem     float64 `json:"mem"`
	VSZ     int64   `json:"vsz"`
	RSS     int64   `json:"rss"`
	TTY     string  `json:"tty"`
	Stat    string  `json:"stat"`
	Start   string  `json:"start"`
	Time    string  `json:"time"`
	Command string  `json:"command"`
}

// SystemOverview represents system overview information
type SystemOverview map[string]interface{}

const systemCacheTTL = 1 * time.Second

// GetOverview returns system overview information, cached for 1 second.
func (s *SystemService) GetOverview() (SystemOverview, error) {
	s.cacheMu.RLock()
	if s.overviewCache != nil && time.Now().Before(s.overviewExpiry) {
		cached := *s.overviewCache
		s.cacheMu.RUnlock()
		return cached, nil
	}
	s.cacheMu.RUnlock()

	result := make(SystemOverview)

	hostname, _ := os.Hostname()
	result["hostname"] = hostname
	result["os"] = runtime.GOOS
	result["arch"] = runtime.GOARCH
	result["numCPU"] = runtime.NumCPU()

	if runtime.GOOS == "linux" {
		s.getLinuxSystemOverview(result)
	} else if runtime.GOOS == "darwin" {
		s.getDarwinSystemOverview(result)
	}

	s.cacheMu.Lock()
	s.overviewCache = &result
	s.overviewExpiry = time.Now().Add(systemCacheTTL)
	s.cacheMu.Unlock()

	return result, nil
}

func (s *SystemService) getLinuxSystemOverview(result SystemOverview) {
	// Uptime
	if data, err := os.ReadFile("/proc/uptime"); err == nil {
		fields := strings.Fields(string(data))
		if len(fields) >= 1 {
			if upSec, err := strconv.ParseFloat(fields[0], 64); err == nil {
				days := int(upSec) / 86400
				hours := (int(upSec) % 86400) / 3600
				mins := (int(upSec) % 3600) / 60
				result["uptime"] = fmt.Sprintf("%d天 %d小时 %d分钟", days, hours, mins)
				result["uptimeSeconds"] = upSec
			}
		}
	}

	// Load average
	if data, err := os.ReadFile("/proc/loadavg"); err == nil {
		fields := strings.Fields(string(data))
		if len(fields) >= 3 {
			result["loadAvg"] = []string{fields[0], fields[1], fields[2]}
		}
	}

	// CPU usage
	readCPUStat := func() (idle, total uint64) {
		data, err := os.ReadFile("/proc/stat")
		if err != nil {
			return
		}
		lines := strings.Split(string(data), "\n")
		for _, line := range lines {
			if strings.HasPrefix(line, "cpu ") {
				fields := strings.Fields(line)
				if len(fields) < 5 {
					return
				}
				var vals []uint64
				for _, f := range fields[1:] {
					v, _ := strconv.ParseUint(f, 10, 64)
					vals = append(vals, v)
					total += v
				}
				if len(vals) >= 4 {
					idle = vals[3]
				}
				return
			}
		}
		return
	}
	idle1, total1 := readCPUStat()
	time.Sleep(200 * time.Millisecond)
	idle2, total2 := readCPUStat()
	if total2-total1 > 0 {
		cpuUsage := 100.0 * (1.0 - float64(idle2-idle1)/float64(total2-total1))
		result["cpuUsage"] = fmt.Sprintf("%.1f", cpuUsage)
	}

	// Memory info
	if data, err := os.ReadFile("/proc/meminfo"); err == nil {
		memInfo := make(map[string]int64)
		scanner := bufio.NewScanner(strings.NewReader(string(data)))
		for scanner.Scan() {
			line := scanner.Text()
			fields := strings.Fields(line)
			if len(fields) >= 2 {
				key := strings.TrimSuffix(fields[0], ":")
				val, _ := strconv.ParseInt(fields[1], 10, 64)
				memInfo[key] = val
			}
		}
		total := memInfo["MemTotal"]
		available := memInfo["MemAvailable"]
		used := total - available
		swapTotal := memInfo["SwapTotal"]
		swapFree := memInfo["SwapFree"]
		result["memory"] = map[string]interface{}{
			"total":     total * 1024,
			"used":      used * 1024,
			"available": available * 1024,
			"usagePercent": func() string {
				if total > 0 {
					return fmt.Sprintf("%.1f", float64(used)/float64(total)*100)
				}
				return "0"
			}(),
			"swapTotal": swapTotal * 1024,
			"swapUsed":  (swapTotal - swapFree) * 1024,
		}
	}

	// Disk info
	if out, err := exec.Command("df", "-B1", "--output=source,fstype,size,used,avail,pcent,target").Output(); err == nil {
		var disks []map[string]interface{}
		lines := strings.Split(string(out), "\n")
		for i, line := range lines {
			if i == 0 || strings.TrimSpace(line) == "" {
				continue
			}
			fields := strings.Fields(line)
			if len(fields) >= 7 && !strings.HasPrefix(fields[0], "tmpfs") && !strings.HasPrefix(fields[0], "devtmpfs") {
				size, _ := strconv.ParseInt(fields[2], 10, 64)
				used, _ := strconv.ParseInt(fields[3], 10, 64)
				avail, _ := strconv.ParseInt(fields[4], 10, 64)
				disks = append(disks, map[string]interface{}{
					"device":     fields[0],
					"fsType":     fields[1],
					"size":       size,
					"used":       used,
					"available":  avail,
					"usePercent": strings.TrimSuffix(fields[5], "%"),
					"mountPoint": fields[6],
				})
			}
		}
		result["disks"] = disks
	}

	// Network info
	if data, err := os.ReadFile("/proc/net/dev"); err == nil {
		var nets []map[string]interface{}
		lines := strings.Split(string(data), "\n")
		for i, line := range lines {
			if i < 2 || strings.TrimSpace(line) == "" {
				continue
			}
			parts := strings.SplitN(line, ":", 2)
			if len(parts) != 2 {
				continue
			}
			iface := strings.TrimSpace(parts[0])
			if iface == "lo" {
				continue
			}
			fields := strings.Fields(parts[1])
			if len(fields) >= 10 {
				rxBytes, _ := strconv.ParseInt(fields[0], 10, 64)
				rxPackets, _ := strconv.ParseInt(fields[1], 10, 64)
				txBytes, _ := strconv.ParseInt(fields[8], 10, 64)
				txPackets, _ := strconv.ParseInt(fields[9], 10, 64)
				nets = append(nets, map[string]interface{}{
					"interface": iface,
					"rxBytes":   rxBytes,
					"rxPackets": rxPackets,
					"txBytes":   txBytes,
					"txPackets": txPackets,
				})
			}
		}
		result["network"] = nets
	}
}

func (s *SystemService) getDarwinSystemOverview(result SystemOverview) {
	// Uptime
	if out, err := exec.Command("sysctl", "-n", "kern.boottime").Output(); err == nil {
		str := string(out)
		if idx := strings.Index(str, "sec = "); idx >= 0 {
			rest := str[idx+6:]
			if end := strings.Index(rest, ","); end > 0 {
				if bootSec, err := strconv.ParseInt(rest[:end], 10, 64); err == nil {
					upSec := time.Now().Unix() - bootSec
					days := int(upSec) / 86400
					hours := (int(upSec) % 86400) / 3600
					mins := (int(upSec) % 3600) / 60
					result["uptime"] = fmt.Sprintf("%d天 %d小时 %d分钟", days, hours, mins)
					result["uptimeSeconds"] = upSec
				}
			}
		}
	}

	// Load average
	if out, err := exec.Command("sysctl", "-n", "vm.loadavg").Output(); err == nil {
		str := strings.Trim(string(out), "{ }\n")
		fields := strings.Fields(str)
		if len(fields) >= 3 {
			result["loadAvg"] = []string{fields[0], fields[1], fields[2]}
		}
	}

	// CPU usage
	if out, err := exec.Command("top", "-l", "1", "-n", "0", "-s", "0").Output(); err == nil {
		for _, line := range strings.Split(string(out), "\n") {
			if strings.Contains(line, "CPU usage") {
				if idx := strings.Index(line, "idle"); idx > 0 {
					parts := strings.Fields(line)
					for i, p := range parts {
						if strings.Contains(p, "idle") && i > 0 {
							idleStr := strings.TrimSuffix(parts[i-1], "%")
							if idle, err := strconv.ParseFloat(idleStr, 64); err == nil {
								result["cpuUsage"] = fmt.Sprintf("%.1f", 100.0-idle)
							}
						}
					}
				}
				break
			}
		}
	}

	// Memory info
	pageSize := int64(4096)
	if out, err := exec.Command("sysctl", "-n", "hw.pagesize").Output(); err == nil {
		if ps, err := strconv.ParseInt(strings.TrimSpace(string(out)), 10, 64); err == nil {
			pageSize = ps
		}
	}

	totalMem := int64(0)
	if out, err := exec.Command("sysctl", "-n", "hw.memsize").Output(); err == nil {
		totalMem, _ = strconv.ParseInt(strings.TrimSpace(string(out)), 10, 64)
	}

	usedMem := int64(0)
	if out, err := exec.Command("vm_stat").Output(); err == nil {
		vmInfo := make(map[string]int64)
		for _, line := range strings.Split(string(out), "\n") {
			parts := strings.SplitN(line, ":", 2)
			if len(parts) == 2 {
				key := strings.TrimSpace(parts[0])
				valStr := strings.TrimSpace(strings.TrimSuffix(strings.TrimSpace(parts[1]), "."))
				if val, err := strconv.ParseInt(valStr, 10, 64); err == nil {
					vmInfo[key] = val
				}
			}
		}
		wired := vmInfo["Pages wired down"] * pageSize
		active := vmInfo["Pages active"] * pageSize
		compressed := vmInfo["Pages occupied by compressor"] * pageSize
		usedMem = wired + active + compressed
	}

	if totalMem > 0 {
		result["memory"] = map[string]interface{}{
			"total":        totalMem,
			"used":         usedMem,
			"available":    totalMem - usedMem,
			"usagePercent": fmt.Sprintf("%.1f", float64(usedMem)/float64(totalMem)*100),
			"swapTotal":    int64(0),
			"swapUsed":     int64(0),
		}
	}

	// Disk info
	if out, err := exec.Command("df", "-b").Output(); err == nil {
		var disks []map[string]interface{}
		lines := strings.Split(string(out), "\n")
		for i, line := range lines {
			if i == 0 || strings.TrimSpace(line) == "" {
				continue
			}
			fields := strings.Fields(line)
			if len(fields) >= 9 && strings.HasPrefix(fields[0], "/dev/") {
				blkSize := int64(512)
				size := int64(0)
				used := int64(0)
				avail := int64(0)
				if v, err := strconv.ParseInt(fields[1], 10, 64); err == nil {
					size = v * blkSize
				}
				if v, err := strconv.ParseInt(fields[2], 10, 64); err == nil {
					used = v * blkSize
				}
				if v, err := strconv.ParseInt(fields[3], 10, 64); err == nil {
					avail = v * blkSize
				}
				mountPoint := fields[8]
				disks = append(disks, map[string]interface{}{
					"device":     fields[0],
					"fsType":     "",
					"size":       size,
					"used":       used,
					"available":  avail,
					"usePercent": strings.TrimSuffix(fields[4], "%"),
					"mountPoint": mountPoint,
				})
			}
		}
		result["disks"] = disks
	}

	// Network info
	if out, err := exec.Command("netstat", "-ibn").Output(); err == nil {
		var nets []map[string]interface{}
		seen := make(map[string]bool)
		lines := strings.Split(string(out), "\n")
		for i, line := range lines {
			if i == 0 || strings.TrimSpace(line) == "" {
				continue
			}
			fields := strings.Fields(line)
			if len(fields) >= 10 {
				iface := fields[0]
				if iface == "lo0" || seen[iface] || strings.Contains(iface, "utun") || strings.Contains(iface, "awdl") || strings.Contains(iface, "llw") || strings.Contains(iface, "bridge") || strings.Contains(iface, "ap") || strings.Contains(iface, "gif") || strings.Contains(iface, "stf") || strings.Contains(iface, "anpi") {
					continue
				}
				if !strings.HasPrefix(fields[2], "Link#") {
					continue
				}
				seen[iface] = true
				rxBytes, _ := strconv.ParseInt(fields[6], 10, 64)
				txBytes, _ := strconv.ParseInt(fields[9], 10, 64)
				rxPackets, _ := strconv.ParseInt(fields[4], 10, 64)
				txPackets, _ := strconv.ParseInt(fields[7], 10, 64)
				nets = append(nets, map[string]interface{}{
					"interface": iface,
					"rxBytes":   rxBytes,
					"txBytes":   txBytes,
					"rxPackets": rxPackets,
					"txPackets": txPackets,
				})
			}
		}
		result["network"] = nets
	}
}

// GetProcessList returns a list of running processes, cached for 1 second.
func (s *SystemService) GetProcessList() ([]ProcessInfo, error) {
	s.cacheMu.RLock()
	if s.processCache != nil && time.Now().Before(s.processExpiry) {
		cached := s.processCache
		s.cacheMu.RUnlock()
		return cached, nil
	}
	s.cacheMu.RUnlock()

	var procs []ProcessInfo
	var err error
	if runtime.GOOS != "linux" {
		procs, err = s.getProcessListPS()
	} else {
		procs, err = s.getProcessListProc()
	}
	if err != nil {
		return nil, err
	}

	s.cacheMu.Lock()
	s.processCache = procs
	s.processExpiry = time.Now().Add(systemCacheTTL)
	s.cacheMu.Unlock()

	return procs, nil
}

// getProcessListPS uses ps command (fallback for non-Linux).
func (s *SystemService) getProcessListPS() ([]ProcessInfo, error) {
	out, err := exec.Command("ps", "aux").Output()
	if err != nil {
		return nil, fmt.Errorf("获取进程列表失败: %s", err.Error())
	}

	var processes []ProcessInfo
	lines := strings.Split(string(out), "\n")
	for i, line := range lines {
		if i == 0 || strings.TrimSpace(line) == "" {
			continue
		}
		fields := strings.Fields(line)
		if len(fields) < 11 {
			continue
		}
		pid, _ := strconv.Atoi(fields[1])
		cpu, _ := strconv.ParseFloat(fields[2], 64)
		mem, _ := strconv.ParseFloat(fields[3], 64)
		vsz, _ := strconv.ParseInt(fields[4], 10, 64)
		rss, _ := strconv.ParseInt(fields[5], 10, 64)
		command := strings.Join(fields[10:], " ")

		processes = append(processes, ProcessInfo{
			PID:     pid,
			User:    fields[0],
			CPU:     cpu,
			Mem:     mem,
			VSZ:     vsz * 1024,
			RSS:     rss * 1024,
			TTY:     fields[6],
			Stat:    fields[7],
			Start:   fields[8],
			Time:    fields[9],
			Command: command,
		})
	}

	sort.Slice(processes, func(i, j int) bool {
		return processes[i].CPU > processes[j].CPU
	})

	return processes, nil
}

// getProcessListProc reads /proc directly to avoid forking ps.
func (s *SystemService) getProcessListProc() ([]ProcessInfo, error) {
	entries, err := os.ReadDir("/proc")
	if err != nil {
		return nil, fmt.Errorf("获取进程列表失败: %v", err)
	}

	// Read system uptime for calculating process start time.
	var uptimeSec float64
	if data, err := os.ReadFile("/proc/uptime"); err == nil {
		fields := strings.Fields(string(data))
		if len(fields) >= 1 {
			uptimeSec, _ = strconv.ParseFloat(fields[0], 64)
		}
	}
	now := time.Now()
	clockTicks := 100.0 // sysconf(_SC_CLK_TCK), almost always 100 on Linux

	// Read total memory for mem% calculation.
	var memTotalKB int64
	if data, err := os.ReadFile("/proc/meminfo"); err == nil {
		for _, line := range strings.SplitN(string(data), "\n", 5) {
			if strings.HasPrefix(line, "MemTotal:") {
				fields := strings.Fields(line)
				if len(fields) >= 2 {
					memTotalKB, _ = strconv.ParseInt(fields[1], 10, 64)
				}
				break
			}
		}
	}

	// Build UID -> username cache.
	uidCache := make(map[string]string)
	if f, err := os.Open("/etc/passwd"); err == nil {
		scanner := bufio.NewScanner(f)
		for scanner.Scan() {
			parts := strings.SplitN(scanner.Text(), ":", 4)
			if len(parts) >= 4 {
				uidCache[parts[2]] = parts[0]
			}
		}
		f.Close()
	}

	var processes []ProcessInfo
	curCPUTicks := make(map[int]uint64)
	for _, entry := range entries {
		name := entry.Name()
		pid, err := strconv.Atoi(name)
		if err != nil {
			continue
		}

		procDir := "/proc/" + name

		// Read /proc/[pid]/stat
		statData, err := os.ReadFile(procDir + "/stat")
		if err != nil {
			continue
		}
		statStr := string(statData)

		// Parse comm (between first '(' and last ')') to handle spaces in command names.
		commStart := strings.IndexByte(statStr, '(')
		commEnd := strings.LastIndexByte(statStr, ')')
		if commStart < 0 || commEnd < 0 || commEnd <= commStart {
			continue
		}
		afterComm := strings.Fields(statStr[commEnd+2:])
		if len(afterComm) < 20 {
			continue
		}

		state := afterComm[0]
		utime, _ := strconv.ParseUint(afterComm[11], 10, 64)
		stime, _ := strconv.ParseUint(afterComm[12], 10, 64)
		starttime, _ := strconv.ParseUint(afterComm[19], 10, 64)
		vsize, _ := strconv.ParseInt(afterComm[20], 10, 64)
		rssPages, _ := strconv.ParseInt(afterComm[21], 10, 64)

		rssBytes := rssPages * 4096
		totalCPUTicks := utime + stime

		// Delta-based CPU%: compare with previous sample
		cpuPct := 0.0
		s.cacheMu.RLock()
		prevTicks, hasPrev := s.prevCPUTicks[pid]
		prevTime := s.prevCPUTime
		s.cacheMu.RUnlock()
		if hasPrev && !prevTime.IsZero() {
			elapsed := now.Sub(prevTime).Seconds()
			if elapsed > 0 {
				deltaTicks := totalCPUTicks - prevTicks
				cpuPct = 100.0 * (float64(deltaTicks) / clockTicks) / elapsed
				numCPU := float64(runtime.NumCPU())
				if cpuPct > 100.0*numCPU {
					cpuPct = 100.0 * numCPU
				}
			}
		}
		curCPUTicks[pid] = totalCPUTicks
		memPct := 0.0
		if memTotalKB > 0 {
			memPct = 100.0 * float64(rssBytes) / float64(memTotalKB*1024)
		}

		// Process start time.
		procUptimeSec := uptimeSec - float64(starttime)/clockTicks
		startSec := now.Add(-time.Duration(procUptimeSec * float64(time.Second)))
		startStr := startSec.Format("15:04")

		// CPU time string.
		totalSec := int(float64(totalCPUTicks) / clockTicks)
		cpuTimeStr := fmt.Sprintf("%d:%02d", totalSec/60, totalSec%60)

		// Read UID from /proc/[pid]/status.
		user := strconv.Itoa(pid)
		if statusData, err := os.ReadFile(procDir + "/status"); err == nil {
			for _, line := range strings.SplitN(string(statusData), "\n", 15) {
				if strings.HasPrefix(line, "Uid:") {
					fields := strings.Fields(line)
					if len(fields) >= 2 {
						if u, ok := uidCache[fields[1]]; ok {
							user = u
						} else {
							user = fields[1]
						}
					}
					break
				}
			}
		}

		// Read command line from /proc/[pid]/cmdline.
		command := statStr[commStart+1 : commEnd]
		if cmdData, err := os.ReadFile(procDir + "/cmdline"); err == nil && len(cmdData) > 0 {
			command = strings.Join(strings.Split(strings.TrimRight(string(cmdData), "\x00"), "\x00"), " ")
		}

		// TTY from tty_nr (afterComm[4]).
		ttyNr, _ := strconv.Atoi(afterComm[4])
		tty := "?"
		if ttyNr != 0 {
			major := (ttyNr >> 8) & 0xff
			minor := ttyNr & 0xff
			if major == 136 {
				tty = fmt.Sprintf("pts/%d", minor)
			} else if major == 4 {
				tty = fmt.Sprintf("tty%d", minor)
			}
		}

		processes = append(processes, ProcessInfo{
			PID:     pid,
			User:    user,
			CPU:     math.Round(cpuPct*10) / 10,
			Mem:     math.Round(memPct*10) / 10,
			VSZ:     vsize,
			RSS:     rssBytes,
			TTY:     tty,
			Stat:    state,
			Start:   startStr,
			Time:    cpuTimeStr,
			Command: command,
		})
	}

	sort.Slice(processes, func(i, j int) bool {
		return processes[i].CPU > processes[j].CPU
	})

	// Save current ticks for next delta calculation
	s.cacheMu.Lock()
	s.prevCPUTicks = curCPUTicks
	s.prevCPUTime = now
	s.cacheMu.Unlock()

	return processes, nil
}

// ServiceInfo represents a systemd service unit.
type ServiceInfo struct {
	Name        string `json:"name"`
	LoadState   string `json:"loadState"`
	ActiveState string `json:"activeState"`
	SubState    string `json:"subState"`
	Description string `json:"description"`
	Enabled     string `json:"enabled"`
}

// GetServiceList returns a list of systemd services.
func (s *SystemService) GetServiceList() ([]ServiceInfo, error) {
	// Build enabled map from unit-files.
	enabledMap := make(map[string]string)
	if out, err := exec.Command("systemctl", "list-unit-files", "--type=service", "--no-pager", "--no-legend").Output(); err == nil {
		for _, line := range strings.Split(string(out), "\n") {
			parts := strings.Fields(line)
			if len(parts) >= 2 {
				enabledMap[parts[0]] = parts[1]
			}
		}
	}

	// Parse running units.
	out, err := exec.Command("systemctl", "list-units", "--type=service", "--no-pager", "--no-legend").Output()
	if err != nil {
		return nil, fmt.Errorf("获取服务列表失败: %v", err)
	}

	var services []ServiceInfo
	for _, line := range strings.Split(string(out), "\n") {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		parts := strings.Fields(line)
		if len(parts) < 4 {
			continue
		}
		name := parts[0]
		services = append(services, ServiceInfo{
			Name:        name,
			LoadState:   parts[1],
			ActiveState: parts[2],
			SubState:    parts[3],
			Description: strings.Join(parts[4:], " "),
			Enabled:     enabledMap[name],
		})
	}
	if services == nil {
		services = []ServiceInfo{}
	}
	return services, nil
}

// Exec executes a shell command and returns stdout, stderr, and exit code
func (s *SystemService) Exec(command string) (stdout, stderr string, exitCode int, err error) {
	shell := UserShell()
	var cmd *exec.Cmd
	if runtime.GOOS == "windows" {
		if strings.Contains(strings.ToLower(shell), "powershell") || strings.Contains(strings.ToLower(shell), "pwsh") {
			cmd = exec.Command(shell, "-Command", command)
		} else {
			cmd = exec.Command(shell, "/c", command)
		}
	} else {
		cmd = exec.Command(shell, "-c", command)
	}
	var outBuf, errBuf strings.Builder
	cmd.Stdout = &outBuf
	cmd.Stderr = &errBuf

	runErr := cmd.Run()
	if runtime.GOOS == "windows" {
		stdout = DecodeWindowsOutput([]byte(outBuf.String()))
		stderr = DecodeWindowsOutput([]byte(errBuf.String()))
	} else {
		stdout = outBuf.String()
		stderr = errBuf.String()
	}

	if runErr != nil {
		if exitErr, ok := runErr.(*exec.ExitError); ok {
			exitCode = exitErr.ExitCode()
		} else {
			err = runErr
		}
	}
	return
}

// ==================== System update ====================

// Version is set at build time via -ldflags.
var Version = "0.0.0"

func ParseSemVer(v string) [3]int {
	v = strings.TrimPrefix(v, "v")
	parts := strings.SplitN(v, ".", 3)
	var result [3]int
	for i := 0; i < 3 && i < len(parts); i++ {
		n, _ := strconv.Atoi(parts[i])
		result[i] = n
	}
	return result
}

func IsNewerVersion(remote, current string) bool {
	r := ParseSemVer(remote)
	c := ParseSemVer(current)
	for i := 0; i < 3; i++ {
		if r[i] > c[i] {
			return true
		}
		if r[i] < c[i] {
			return false
		}
	}
	return false
}

func CheckUpdate() (map[string]interface{}, error) {
	url := AppStoreBaseURL + "/version.json"
	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Get(url)
	if err != nil {
		return nil, fmt.Errorf("检查更新失败: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("更新服务器返回 %d", resp.StatusCode)
	}

	body, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return nil, fmt.Errorf("读取更新信息失败: %w", err)
	}

	var info map[string]interface{}
	if err := json.Unmarshal(body, &info); err != nil {
		return nil, fmt.Errorf("解析更新信息失败: %w", err)
	}

	remoteVersion, _ := info["version"].(string)
	info["currentVersion"] = Version
	info["os"] = runtime.GOOS
	info["arch"] = runtime.GOARCH
	info["hasUpdate"] = IsNewerVersion(remoteVersion, Version)

	return info, nil
}

func DoSystemUpdate(ctx context.Context, reporter *ProgressReporter) error {
	reporter.Report(0.05, 0, 0, 0, 0, "正在获取更新信息...")
	infoURL := AppStoreBaseURL + "/version.json"
	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Get(infoURL)
	if err != nil {
		return fmt.Errorf("获取更新信息失败: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return fmt.Errorf("读取更新信息失败: %w", err)
	}

	var info struct {
		Version   string            `json:"version"`
		Downloads map[string]string `json:"downloads"`
	}
	if err := json.Unmarshal(body, &info); err != nil {
		return fmt.Errorf("解析更新信息失败: %w", err)
	}

	if info.Version == Version {
		return fmt.Errorf("当前已是最新版本 %s", Version)
	}

	platform := runtime.GOOS + "/" + runtime.GOARCH
	dlURL, ok := info.Downloads[platform]
	if !ok {
		return fmt.Errorf("没有适用于 %s 的更新包", platform)
	}

	execPath, err := os.Executable()
	if err != nil {
		return fmt.Errorf("获取程序路径失败: %w", err)
	}
	execPath, err = filepath.EvalSymlinks(execPath)
	if err != nil {
		return fmt.Errorf("解析程序路径失败: %w", err)
	}

	reporter.Report(0.1, 0, 0, 0, 0, "正在下载新版本...")
	dlClient := &http.Client{Timeout: 10 * time.Minute}
	dlReq, err := http.NewRequestWithContext(ctx, "GET", dlURL, nil)
	if err != nil {
		return fmt.Errorf("创建下载请求失败: %w", err)
	}
	dlResp, err := dlClient.Do(dlReq)
	if err != nil {
		return fmt.Errorf("下载新版本失败: %w", err)
	}
	defer dlResp.Body.Close()

	if dlResp.StatusCode != 200 {
		return fmt.Errorf("下载服务器返回 %d", dlResp.StatusCode)
	}

	tmpFile, err := os.CreateTemp(filepath.Dir(execPath), ".webos-update-*")
	if err != nil {
		return fmt.Errorf("创建临时文件失败: %w", err)
	}
	tmpPath := tmpFile.Name()
	defer func() {
		tmpFile.Close()
		os.Remove(tmpPath)
	}()

	totalSize := dlResp.ContentLength
	var written int64
	buf := make([]byte, 32*1024)
	for {
		n, readErr := dlResp.Body.Read(buf)
		if n > 0 {
			if _, err := tmpFile.Write(buf[:n]); err != nil {
				return fmt.Errorf("写入临时文件失败: %w", err)
			}
			written += int64(n)
			if totalSize > 0 {
				progress := 0.1 + 0.7*float64(written)/float64(totalSize)
				reporter.Report(progress, written, totalSize, written, totalSize, "正在下载新版本...")
			}
		}
		if readErr != nil {
			if readErr == io.EOF {
				break
			}
			return fmt.Errorf("下载中断: %w", readErr)
		}
	}
	tmpFile.Close()

	origInfo, err := os.Stat(execPath)
	if err != nil {
		return fmt.Errorf("读取原文件信息失败: %w", err)
	}
	if err := os.Chmod(tmpPath, origInfo.Mode()); err != nil {
		return fmt.Errorf("设置权限失败: %w", err)
	}

	reporter.Report(0.85, 0, 0, 0, 0, "正在替换程序文件...")
	bakPath := execPath + ".bak"
	os.Remove(bakPath)

	if err := os.Rename(execPath, bakPath); err != nil {
		return fmt.Errorf("备份旧版本失败: %w", err)
	}

	if err := os.Rename(tmpPath, execPath); err != nil {
		os.Rename(bakPath, execPath)
		return fmt.Errorf("替换程序文件失败: %w", err)
	}

	os.Remove(bakPath)

	reporter.Report(0.95, 0, 0, 0, 0, "更新完成，即将重启...")

	go func() {
		time.Sleep(1 * time.Second)
		os.Exit(0)
	}()

	return nil
}
