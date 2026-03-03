package auth

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"strconv"
	"time"
)

// GenerateDownloadSign creates an HMAC-SHA256 signature for a download URL.
// Returns the expiration timestamp and the hex-encoded signature.
func GenerateDownloadSign(nodeId, path string, expireSeconds int64) (int64, string) {
	if expireSeconds <= 0 {
		expireSeconds = 6 * 60 * 60 // 6 hours
	}
	exp := time.Now().Unix() + expireSeconds
	expStr := fmt.Sprintf("%d", exp)

	mac := hmac.New(sha256.New, jwtSecret)
	mac.Write([]byte(nodeId + path + expStr))
	sign := hex.EncodeToString(mac.Sum(nil))

	return exp, sign
}

// ValidateDownloadSign verifies the HMAC-SHA256 signature and checks expiration.
func ValidateDownloadSign(nodeId, path, expStr, sign string) bool {
	// Check expiration
	exp, err := strconv.ParseInt(expStr, 10, 64)
	if err != nil {
		return false
	}
	if time.Now().Unix() > exp {
		return false
	}

	// Verify signature
	mac := hmac.New(sha256.New, jwtSecret)
	mac.Write([]byte(nodeId + path + expStr))
	expected := hex.EncodeToString(mac.Sum(nil))

	return hmac.Equal([]byte(sign), []byte(expected))
}
