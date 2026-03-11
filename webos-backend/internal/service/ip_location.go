package service

import (
	"log"
	"net"
	"strings"
	"sync"

	"github.com/lionsoul2014/ip2region/binding/golang/xdb"
)

var (
	ipdbMu       sync.Mutex
	ipdbV4Searcher *xdb.Searcher
	ipdbV6Searcher *xdb.Searcher
	ipdbLoaded   bool
)

func loadIPDB() {
	v4Path := ipDBPath(ipDBV4FileName)
	if data, err := xdb.LoadContentFromFile(v4Path); err == nil {
		header, err := xdb.NewHeader(data)
		if err == nil {
			ver, err := xdb.VersionFromHeader(header)
			if err == nil {
				s, err := xdb.NewWithBuffer(ver, data)
				if err == nil {
					ipdbV4Searcher = s
					log.Printf("[ip-guard] IPv4 database loaded (%d bytes)", len(data))
				}
			}
		}
	}

	v6Path := ipDBPath(ipDBV6FileName)
	if data, err := xdb.LoadContentFromFile(v6Path); err == nil {
		header, err := xdb.NewHeader(data)
		if err == nil {
			ver, err := xdb.VersionFromHeader(header)
			if err == nil {
				s, err := xdb.NewWithBuffer(ver, data)
				if err == nil {
					ipdbV6Searcher = s
					log.Printf("[ip-guard] IPv6 database loaded (%d bytes)", len(data))
				}
			}
		}
	}

	if ipdbV4Searcher != nil || ipdbV6Searcher != nil {
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
	ensureIPDBLoaded()

	parsed := net.ParseIP(ip)
	if parsed == nil {
		return ""
	}

	var region string
	var err error

	if v4 := parsed.To4(); v4 != nil {
		if ipdbV4Searcher == nil {
			return ""
		}
		region, err = ipdbV4Searcher.SearchByStr(ip)
	} else {
		if ipdbV6Searcher == nil {
			return ""
		}
		region, err = ipdbV6Searcher.SearchByStr(ip)
	}

	if err != nil {
		return ""
	}
	return formatRegion(region)
}

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
