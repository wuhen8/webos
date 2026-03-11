package service

import (
	"encoding/binary"
	"fmt"
	"log"
	"net"
	"os"
	"strings"
	"sync"
)

// Minimal ip2region xdb reader — no external dependency needed.
// Supports both v4 and v6 xdb files.
// Format docs: https://github.com/lionsoul2014/ip2region

var (
	ipdbMu     sync.Mutex
	ipdbV4Data []byte
	ipdbV6Data []byte
	ipdbLoaded bool
)

func loadIPDB() {
	v4Path := ipDBPath(ipDBV4FileName)
	if data, err := os.ReadFile(v4Path); err == nil && len(data) >= 256 {
		ipdbV4Data = data
		log.Printf("[ip-guard] IPv4 database loaded (%d bytes)", len(data))
	}

	v6Path := ipDBPath(ipDBV6FileName)
	if data, err := os.ReadFile(v6Path); err == nil && len(data) >= 256 {
		ipdbV6Data = data
		log.Printf("[ip-guard] IPv6 database loaded (%d bytes)", len(data))
	}

	// Mark as loaded only if at least one database is available
	if ipdbV4Data != nil || ipdbV6Data != nil {
		ipdbLoaded = true
	}
}

func ensureIPDBLoaded() {
	if ipdbLoaded {
		return
	}
	ipdbMu.Lock()
	defer ipdbMu.Unlock()
	if !ipdbLoaded {
		loadIPDB()
	}
}

func lookupIPLocation(ip string) string {
	ipdbOnce.Do(loadIPDB)

	parsed := net.ParseIP(ip)
	if parsed == nil {
		return ""
	}

	if v4 := parsed.To4(); v4 != nil {
		// IPv4 lookup
		if ipdbV4Data == nil {
			return ""
		}
		ipVal := binary.BigEndian.Uint32(v4)
		region, err := searchXDB(ipdbV4Data, ipVal)
		if err != nil {
			return ""
		}
		return formatRegion(region)
	}

	// IPv6 lookup
	if ipdbV6Data == nil {
		return ""
	}
	region, err := searchXDBv6(ipdbV6Data, parsed.To16())
	if err != nil {
		return ""
	}
	return formatRegion(region)
}

// ==================== IPv4 XDB search ====================

// searchXDB performs a binary search in the ip2region v4 xdb format.
func searchXDB(data []byte, ip uint32) (string, error) {
	if len(data) < 256 {
		return "", fmt.Errorf("invalid xdb data")
	}

	startPtr := binary.LittleEndian.Uint32(data[12:16])
	endPtr := binary.LittleEndian.Uint32(data[16:20])

	if startPtr >= uint32(len(data)) || endPtr >= uint32(len(data)) || startPtr > endPtr {
		return "", fmt.Errorf("invalid index pointers")
	}

	const segSize = 14 // [4 start_ip] [4 end_ip] [2 data_len] [4 data_ptr]
	lo := 0
	hi := int((endPtr - startPtr) / segSize)

	for lo <= hi {
		mid := (lo + hi) / 2
		offset := startPtr + uint32(mid)*segSize

		if offset+segSize > uint32(len(data)) {
			break
		}

		startIP := binary.LittleEndian.Uint32(data[offset : offset+4])
		endIP := binary.LittleEndian.Uint32(data[offset+4 : offset+8])

		if ip < startIP {
			hi = mid - 1
		} else if ip > endIP {
			lo = mid + 1
		} else {
			dataLen := binary.LittleEndian.Uint16(data[offset+8 : offset+10])
			dataPtr := binary.LittleEndian.Uint32(data[offset+10 : offset+14])
			if dataPtr+uint32(dataLen) > uint32(len(data)) {
				return "", fmt.Errorf("data pointer out of range")
			}
			return string(data[dataPtr : dataPtr+uint32(dataLen)]), nil
		}
	}

	return "", fmt.Errorf("IP not found")
}

// ==================== IPv6 XDB search ====================

// searchXDBv6 performs a binary search in the ip2region v6 xdb format.
// v6 xdb index segment: [16 start_ip] [16 end_ip] [2 data_len] [4 data_ptr] = 38 bytes
func searchXDBv6(data []byte, ip net.IP) (string, error) {
	if len(data) < 256 {
		return "", fmt.Errorf("invalid xdb data")
	}

	startPtr := binary.LittleEndian.Uint32(data[12:16])
	endPtr := binary.LittleEndian.Uint32(data[16:20])

	if startPtr >= uint32(len(data)) || endPtr >= uint32(len(data)) || startPtr > endPtr {
		return "", fmt.Errorf("invalid index pointers")
	}

	const segSize = 38 // [16 start_ip] [16 end_ip] [2 data_len] [4 data_ptr]
	lo := 0
	hi := int((endPtr - startPtr) / segSize)

	ipBytes := []byte(ip)

	for lo <= hi {
		mid := (lo + hi) / 2
		offset := startPtr + uint32(mid)*segSize

		if offset+segSize > uint32(len(data)) {
			break
		}

		startIP := data[offset : offset+16]
		endIP := data[offset+16 : offset+32]

		cmpStart := compareIP6(ipBytes, startIP)
		if cmpStart < 0 {
			hi = mid - 1
			continue
		}

		cmpEnd := compareIP6(ipBytes, endIP)
		if cmpEnd > 0 {
			lo = mid + 1
			continue
		}

		// Found
		dataLen := binary.LittleEndian.Uint16(data[offset+32 : offset+34])
		dataPtr := binary.LittleEndian.Uint32(data[offset+34 : offset+38])
		if dataPtr+uint32(dataLen) > uint32(len(data)) {
			return "", fmt.Errorf("data pointer out of range")
		}
		return string(data[dataPtr : dataPtr+uint32(dataLen)]), nil
	}

	return "", fmt.Errorf("IP not found")
}

// compareIP6 compares two 16-byte IPv6 addresses.
// Returns -1, 0, or 1.
func compareIP6(a, b []byte) int {
	for i := 0; i < 16; i++ {
		if a[i] < b[i] {
			return -1
		}
		if a[i] > b[i] {
			return 1
		}
	}
	return 0
}

// ==================== Helpers ====================

// formatRegion converts ip2region's "国家|区域|省份|城市|ISP" format to a readable string.
func formatRegion(raw string) string {
	parts := strings.Split(raw, "|")
	var result []string
	seen := make(map[string]bool)

	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p == "" || p == "0" || seen[p] {
			continue
		}
		seen[p] = true
		result = append(result, p)
	}

	if len(result) == 0 {
		return ""
	}
	return strings.Join(result, " ")
}
