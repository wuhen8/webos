#!/bin/bash

binName="webos"
dir="release"
VERSION="${1:-0.0.0}"
LDFLAGS="-s -w -X webos-backend/internal/service.Version=${VERSION}"

buildBin() {
	CGO_ENABLED=0 GOOS=windows GOARCH=amd64 go build -ldflags "${LDFLAGS}" -o ${dir}/${binName}-win-amd64.exe main.go
	CGO_ENABLED=0 GOOS=windows GOARCH=arm64 go build -ldflags "${LDFLAGS}" -o ${dir}/${binName}-win-arm64.exe main.go
	CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -ldflags "${LDFLAGS}" -o ${dir}/${binName}-linux-amd64 main.go
	CGO_ENABLED=0 GOOS=linux GOARCH=arm64 go build -ldflags "${LDFLAGS}" -o ${dir}/${binName}-linux-arm64 main.go
	CGO_ENABLED=0 GOOS=linux GOARCH=arm go build -ldflags "${LDFLAGS}" -o ${dir}/${binName}-linux-arm main.go
	CGO_ENABLED=0 GOOS=darwin GOARCH=arm64 go build -ldflags "${LDFLAGS}" -o ${dir}/${binName}-darwin-arm64 main.go
}

set -e

echo "=== Building WebOS v${VERSION} ==="

# 进入前端目录并构建
echo "1. Building frontend..."
cd webos-frontend
pnpm install
pnpm build

# 复制构建产物到后端目录
echo "2. Copying dist to backend..."
rm -rf ../webos-backend/dist
cp -r dist ../webos-backend/

# 进入后端目录并构建
echo "3. Building backend..."
cd ../webos-backend
buildBin

echo "=== Build complete! ==="
echo "Binary: webos-backend/release/"
