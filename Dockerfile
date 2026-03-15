# ==================== 构建阶段 ====================

# 阶段1: 构建前端
FROM node:20-alpine AS frontend-builder

WORKDIR /app/webos-frontend

# 安装 pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# 复制前端依赖文件
COPY webos-frontend/package.json webos-frontend/pnpm-lock.yaml ./

# 安装依赖
RUN pnpm install --frozen-lockfile

# 复制前端源码
COPY webos-frontend/ ./

# 构建
RUN pnpm build

# 阶段2: 构建后端
FROM golang:1.24-alpine AS backend-builder

WORKDIR /app

# 安装构建依赖
RUN apk add --no-cache git ca-certificates tzdata

# 复制 go.mod 和 go.sum
COPY webos-backend/go.mod webos-backend/go.sum ./

# 下载依赖
RUN go mod download

# 复制后端源码
COPY webos-backend/ ./

# 复制前端构建产物到 dist 目录
COPY --from=frontend-builder /app/webos-frontend/dist ./dist

# 构建后端 (CGO_ENABLED=0 静态链接)
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o webos main.go

# ==================== 运行阶段 ====================

FROM alpine:3.19

LABEL maintainer="WebOS Contributors"
LABEL org.opencontainers.image.source="https://github.com/yourorg/webos"

# 安装运行时依赖
RUN apk add --no-cache \
    ca-certificates \
    tzdata \
    bash \
    curl \
    docker-cli \
    && cp /usr/share/zoneinfo/Asia/Shanghai /etc/localtime \
    && echo "Asia/Shanghai" > /etc/timezone

WORKDIR /app

# 从构建阶段复制二进制文件
COPY --from=backend-builder /app/webos /app/webos

# 复制 SDK
COPY --from=backend-builder /app/sdk /app/sdk

# 复制 skills 目录（如果存在）
COPY skills/ /app/skills/

# 创建数据目录
RUN mkdir -p /data

# 环境变量
ENV GIN_MODE=release \
    TZ=Asia/Shanghai \
    WEBOS_DATA_DIR=/data \
    WEBOS_PORT=8080

# 暴露端口
EXPOSE 8080

# 健康检查
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8080/api/health || exit 1

# 启动
ENTRYPOINT ["/app/webos"]
CMD []
