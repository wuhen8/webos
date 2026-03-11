package auth

import (
	crypto_rand "crypto/rand"
	"fmt"
	"os"
	"sync"
	"time"
	"unicode"

	"webos-backend/internal/database"

	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"
)

var (
	jwtSecret []byte
	jwtOnce   sync.Once
)

// getJWTSecret lazily initialises the JWT signing key on first use,
// so that CLI commands that never touch auth don't trigger the warning.
func getJWTSecret() []byte {
	jwtOnce.Do(func() {
		if s := os.Getenv("WEBOS_JWT_SECRET"); s != "" {
			jwtSecret = []byte(s)
		} else {
			jwtSecret = make([]byte, 32)
			crypto_rand.Read(jwtSecret)
			fmt.Println("JWT secret not configured (WEBOS_JWT_SECRET), using random secret. Tokens will be invalidated on restart.")
		}
	})
	return jwtSecret
}

// Claims JWT Claims
type Claims struct {
	Username string `json:"username"`
	jwt.RegisteredClaims
}

// GenerateToken generates a JWT token.
func GenerateToken(username string) (string, error) {
	claims := Claims{
		Username: username,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(24 * time.Hour)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			Issuer:    "webos",
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString(getJWTSecret())
}

// ValidateToken validates a JWT token.
func ValidateToken(tokenString string) (*Claims, error) {
	token, err := jwt.ParseWithClaims(tokenString, &Claims{}, func(token *jwt.Token) (interface{}, error) {
		return getJWTSecret(), nil
	})
	if err != nil {
		return nil, err
	}
	if claims, ok := token.Claims.(*Claims); ok && token.Valid {
		return claims, nil
	}
	return nil, fmt.Errorf("invalid token")
}

// GetPasswordHash retrieves the stored password hash from the database.
func GetPasswordHash() string {
	d := database.DB()
	if d == nil {
		return ""
	}
	var hash string
	_ = d.QueryRow("SELECT value FROM preferences WHERE key='passwordHash'").Scan(&hash)
	return hash
}

// ValidatePasswordStrength checks that a password meets minimum strength requirements:
// at least 8 characters, and at least 2 of: uppercase, lowercase, digit.
func ValidatePasswordStrength(password string) error {
	if len(password) < 8 {
		return fmt.Errorf("密码长度至少为 8 位")
	}
	var hasUpper, hasLower, hasDigit bool
	for _, ch := range password {
		switch {
		case unicode.IsUpper(ch):
			hasUpper = true
		case unicode.IsLower(ch):
			hasLower = true
		case unicode.IsDigit(ch):
			hasDigit = true
		}
	}
	count := 0
	if hasUpper {
		count++
	}
	if hasLower {
		count++
	}
	if hasDigit {
		count++
	}
	if count < 2 {
		return fmt.Errorf("密码需包含大写字母、小写字母、数字中的至少两种")
	}
	return nil
}

// SetPassword hashes and stores a password. If allowOverwrite is false, it fails
// when a password is already set (used for initial setup).
func SetPassword(password string, allowOverwrite bool) error {
	if !allowOverwrite && GetPasswordHash() != "" {
		return fmt.Errorf("Password already set")
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return fmt.Errorf("密码加密失败: %w", err)
	}

	d := database.DB()
	if _, err := d.Exec("INSERT OR REPLACE INTO preferences(key, value) VALUES('passwordHash', ?)", string(hash)); err != nil {
		return fmt.Errorf("保存密码失败: %w", err)
	}
	return nil
}

// CheckLogin verifies a password against the stored hash.
func CheckLogin(password string) error {
	hash := GetPasswordHash()
	if hash == "" {
		return fmt.Errorf("Password not set. Please set up password first.")
	}
	if bcrypt.CompareHashAndPassword([]byte(hash), []byte(password)) != nil {
		return fmt.Errorf("Invalid password")
	}
	return nil
}
