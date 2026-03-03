package handler

import (
	"compress/flate"
	"compress/gzip"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

// proxyClient is a shared HTTP client for proxy requests with reasonable timeouts.
var proxyClient = &http.Client{
	Timeout: 30 * time.Second,
	CheckRedirect: func(req *http.Request, via []*http.Request) error {
		if len(via) >= 10 {
			return fmt.Errorf("too many redirects")
		}
		return nil
	},
}

// ProxyHandler fetches an external URL and streams it back with CSP/X-Frame-Options
// headers stripped so it can be embedded in an iframe.
// GET /api/proxy?url=https://example.com
func ProxyHandler(c *gin.Context) {
	rawURL := c.Query("url")
	if rawURL == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "missing url parameter"})
		return
	}

	parsed, err := url.Parse(rawURL)
	if err != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid url, must be http or https"})
		return
	}

	req, err := http.NewRequestWithContext(c.Request.Context(), "GET", rawURL, nil)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create request"})
		return
	}

	// Forward a realistic User-Agent so sites don't block us
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
	req.Header.Set("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
	req.Header.Set("Accept-Language", "zh-CN,zh;q=0.9,en;q=0.8")
	// Request uncompressed so we can rewrite HTML easily
	req.Header.Set("Accept-Encoding", "gzip, deflate")

	resp, err := proxyClient.Do(req)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": fmt.Sprintf("failed to fetch: %v", err)})
		return
	}
	defer resp.Body.Close()

	// Strip security headers that prevent iframe embedding
	respHeaders := c.Writer.Header()
	for k, v := range resp.Header {
		lk := strings.ToLower(k)
		switch lk {
		case "x-frame-options",
			"content-security-policy",
			"content-security-policy-report-only":
			// Skip — these block iframe embedding
			continue
		case "content-encoding":
			// We'll handle decompression ourselves for HTML rewriting
			continue
		case "content-length":
			// Skip — length may change after rewriting
			continue
		case "transfer-encoding":
			continue
		default:
			for _, vv := range v {
				respHeaders.Add(k, vv)
			}
		}
	}

	contentType := resp.Header.Get("Content-Type")
	isHTML := strings.Contains(contentType, "text/html")

	// Decompress body if needed
	var body io.Reader = resp.Body
	switch strings.ToLower(resp.Header.Get("Content-Encoding")) {
	case "gzip":
		gr, err := gzip.NewReader(resp.Body)
		if err == nil {
			defer gr.Close()
			body = gr
		}
	case "deflate":
		body = flate.NewReader(resp.Body)
	}

	if isHTML {
		// For HTML, inject a <base> tag so relative resources resolve correctly
		htmlBytes, err := io.ReadAll(io.LimitReader(body, 20*1024*1024)) // 20MB limit
		if err != nil {
			c.JSON(http.StatusBadGateway, gin.H{"error": "failed to read response body"})
			return
		}

		htmlStr := string(htmlBytes)
		baseTag := fmt.Sprintf(`<base href="%s://%s/" />`, parsed.Scheme, parsed.Host)

		// Insert <base> right after <head> (case-insensitive)
		inserted := false
		for _, tag := range []string{"<head>", "<HEAD>", "<Head>"} {
			if idx := strings.Index(htmlStr, tag); idx != -1 {
				htmlStr = htmlStr[:idx+len(tag)] + baseTag + htmlStr[idx+len(tag):]
				inserted = true
				break
			}
		}
		if !inserted {
			// Try regex-like approach for <head ...>
			lower := strings.ToLower(htmlStr)
			if idx := strings.Index(lower, "<head"); idx != -1 {
				closeIdx := strings.Index(htmlStr[idx:], ">")
				if closeIdx != -1 {
					insertPos := idx + closeIdx + 1
					htmlStr = htmlStr[:insertPos] + baseTag + htmlStr[insertPos:]
				}
			}
		}

		c.Data(resp.StatusCode, contentType, []byte(htmlStr))
	} else {
		// For non-HTML resources, stream directly
		c.Status(resp.StatusCode)
		if contentType != "" {
			c.Header("Content-Type", contentType)
		}
		io.Copy(c.Writer, body)
	}
}
