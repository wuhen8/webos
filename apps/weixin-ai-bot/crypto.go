package main

import (
	"bytes"
	"crypto/aes"
	"crypto/md5"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"os"
)

type weixinUploadMeta struct {
	RawSize    int64
	FileSize   int64
	RawFileMD5 string
	FileKey    string
	AESKey     string
}

func prepareWeixinUpload(filePath string) (weixinUploadMeta, string, error) {
	raw, err := os.ReadFile(filePath)
	if err != nil {
		return weixinUploadMeta{}, "", err
	}
	fileKey, err := randomHex(16)
	if err != nil {
		return weixinUploadMeta{}, "", err
	}
	aesKey, err := randomHex(16)
	if err != nil {
		return weixinUploadMeta{}, "", err
	}
	ciphertext, err := encryptAES128ECB(raw, aesKey)
	if err != nil {
		return weixinUploadMeta{}, "", err
	}
	tmpFile, err := os.CreateTemp("", "weixin-upload-*.bin")
	if err != nil {
		return weixinUploadMeta{}, "", err
	}
	tmpPath := tmpFile.Name()
	if _, err := tmpFile.Write(ciphertext); err != nil {
		tmpFile.Close()
		_ = os.Remove(tmpPath)
		return weixinUploadMeta{}, "", err
	}
	if err := tmpFile.Close(); err != nil {
		_ = os.Remove(tmpPath)
		return weixinUploadMeta{}, "", err
	}
	sum := md5.Sum(raw)
	return weixinUploadMeta{
		RawSize:    int64(len(raw)),
		FileSize:   int64(len(ciphertext)),
		RawFileMD5: hex.EncodeToString(sum[:]),
		FileKey:    fileKey,
		AESKey:     aesKey,
	}, tmpPath, nil
}

func decryptFileInPlace(filePath, aesKeyHex string) error {
	raw, err := os.ReadFile(filePath)
	if err != nil {
		return err
	}
	plaintext, err := decryptAES128ECB(raw, aesKeyHex)
	if err != nil {
		return err
	}
	return os.WriteFile(filePath, plaintext, 0644)
}

func encryptAES128ECB(raw []byte, keyHex string) ([]byte, error) {
	key, err := hex.DecodeString(keyHex)
	if err != nil {
		return nil, fmt.Errorf("decode aes key: %w", err)
	}
	if len(key) != 16 {
		return nil, fmt.Errorf("invalid aes-128 key length: %d", len(key))
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	padded := pkcs7Pad(raw, block.BlockSize())
	out := make([]byte, len(padded))
	for i := 0; i < len(padded); i += block.BlockSize() {
		block.Encrypt(out[i:i+block.BlockSize()], padded[i:i+block.BlockSize()])
	}
	return out, nil
}

func decryptAES128ECB(ciphertext []byte, keyHex string) ([]byte, error) {
	key, err := hex.DecodeString(keyHex)
	if err != nil {
		return nil, fmt.Errorf("decode aes key: %w", err)
	}
	if len(key) != 16 {
		return nil, fmt.Errorf("invalid aes-128 key length: %d", len(key))
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	if len(ciphertext) == 0 || len(ciphertext)%block.BlockSize() != 0 {
		return nil, fmt.Errorf("invalid ciphertext size: %d", len(ciphertext))
	}
	out := make([]byte, len(ciphertext))
	for i := 0; i < len(ciphertext); i += block.BlockSize() {
		block.Decrypt(out[i:i+block.BlockSize()], ciphertext[i:i+block.BlockSize()])
	}
	return pkcs7Unpad(out, block.BlockSize())
}

func pkcs7Pad(raw []byte, blockSize int) []byte {
	padLen := blockSize - (len(raw) % blockSize)
	if padLen == 0 {
		padLen = blockSize
	}
	return append(raw, bytes.Repeat([]byte{byte(padLen)}, padLen)...)
}

func pkcs7Unpad(raw []byte, blockSize int) ([]byte, error) {
	if len(raw) == 0 || len(raw)%blockSize != 0 {
		return nil, fmt.Errorf("invalid padded size: %d", len(raw))
	}
	padLen := int(raw[len(raw)-1])
	if padLen == 0 || padLen > blockSize || padLen > len(raw) {
		return nil, fmt.Errorf("invalid padding length: %d", padLen)
	}
	for _, b := range raw[len(raw)-padLen:] {
		if int(b) != padLen {
			return nil, fmt.Errorf("invalid padding bytes")
		}
	}
	return raw[:len(raw)-padLen], nil
}

func randomHex(n int) (string, error) {
	buf := make([]byte, n)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return hex.EncodeToString(buf), nil
}
