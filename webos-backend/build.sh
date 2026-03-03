binName="webos"
dir="release"
VERSION="${1:-0.0.0}"
LDFLAGS="-s -w -X webos-backend/internal/service.Version=${VERSION}"
CGO_ENABLED=0 GOOS=windows GOARCH=amd64 go build -ldflags "${LDFLAGS}" -o ${dir}/${binName}-win-amd64.exe main.go
CGO_ENABLED=0 GOOS=windows GOARCH=arm64 go build -ldflags "${LDFLAGS}" -o ${dir}/${binName}-win-arm64.exe main.go
CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -ldflags "${LDFLAGS}" -o ${dir}/${binName}-linux-amd64 main.go
CGO_ENABLED=0 GOOS=linux GOARCH=arm64 go build -ldflags "${LDFLAGS}" -o ${dir}/${binName}-linux-arm64 main.go
CGO_ENABLED=0 GOOS=linux GOARCH=arm go build -ldflags "${LDFLAGS}" -o ${dir}/${binName}-linux-arm main.go
CGO_ENABLED=0 GOOS=darwin GOARCH=arm64 go build -ldflags "${LDFLAGS}" -o ${dir}/${binName}-darwin-arm64 main.go
