#!/bin/bash
set -e

# ============================================================
#  WebOS 一键安装脚本
#  支持: Debian 11+/Ubuntu 20.04+, CentOS 8+/RHEL 8+/Rocky/Alma
#  用法: curl -fsSL https://your-domain.com/install.sh | bash
# ============================================================

# ---------- 颜色输出 ----------
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

info()  { echo -e "${BLUE}[INFO]${NC}  $*"; }
ok()    { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
err()   { echo -e "${RED}[ERROR]${NC} $*"; exit 1; }

# ---------- 全局变量 ----------
APP_NAME="webos"
INSTALL_DIR="/usr/local/bin"
CONFIG_DIR="/etc/webos"
DATA_DIR="/var/lib/webos"
SERVICE_FILE="/etc/systemd/system/${APP_NAME}.service"

# 下载基础地址 (latest 始终指向最新版本)
# 最终下载链接 = ${DOWNLOAD_BASE_URL}/webos-linux-${ARCH}
DOWNLOAD_BASE_URL="https://github.com/wuhen8/webos/releases/latest/download"

# ---------- 前置检查 ----------
check_root() {
    if [ "$(id -u)" -ne 0 ]; then
        err "请以 root 用户运行此脚本，或使用 sudo"
    fi
}

check_systemd() {
    if ! command -v systemctl &>/dev/null; then
        err "此脚本需要 systemd，当前系统不支持"
    fi
}

# ---------- 系统检测 ----------
detect_os() {
    if [ -f /etc/os-release ]; then
        . /etc/os-release
        OS_ID="$ID"
        OS_VERSION_ID="$VERSION_ID"
        OS_LIKE="$ID_LIKE"
    else
        err "无法检测操作系统 (缺少 /etc/os-release)"
    fi

    case "$OS_ID" in
        debian|ubuntu|linuxmint)
            PKG_MANAGER="apt"
            ;;
        centos|rhel|rocky|almalinux|fedora)
            PKG_MANAGER="yum"
            if command -v dnf &>/dev/null; then
                PKG_MANAGER="dnf"
            fi
            ;;
        *)
            # 尝试通过 ID_LIKE 判断
            if echo "$OS_LIKE" | grep -qiw "debian"; then
                PKG_MANAGER="apt"
            elif echo "$OS_LIKE" | grep -qiw "rhel\|centos\|fedora"; then
                PKG_MANAGER="yum"
                command -v dnf &>/dev/null && PKG_MANAGER="dnf"
            else
                err "不支持的操作系统: $OS_ID ($OS_LIKE)"
            fi
            ;;
    esac

    info "检测到系统: $OS_ID $OS_VERSION_ID (包管理器: $PKG_MANAGER)"
}

detect_arch() {
    ARCH=$(uname -m)
    case "$ARCH" in
        x86_64|amd64)
            ARCH="amd64"
            ;;
        aarch64|arm64)
            ARCH="arm64"
            ;;
        armv7l|armhf)
            ARCH="arm"
            ;;
        *)
            err "不支持的架构: $ARCH"
            ;;
    esac
    DOWNLOAD_URL="${DOWNLOAD_BASE_URL}/webos-linux-${ARCH}"
    info "检测到架构: $ARCH"
}

# ---------- 包安装封装 ----------
pkg_install() {
    local packages=("$@")
    if [ "$PKG_MANAGER" = "apt" ]; then
        DEBIAN_FRONTEND=noninteractive apt-get install -y -q "${packages[@]}"
    else
        $PKG_MANAGER install -y "${packages[@]}"
    fi
}

pkg_update() {
    if [ "$PKG_MANAGER" = "apt" ]; then
        apt-get update -q
    else
        $PKG_MANAGER makecache -q 2>/dev/null || true
    fi
}

# ---------- 基础工具安装 ----------
install_base_tools() {
    info "安装基础工具..."
    local need_install=()

    local base_tools="curl wget tar gzip"
    for tool in $base_tools; do
        if ! command -v "$tool" &>/dev/null; then
            need_install+=("$tool")
        fi
    done

    if [ ${#need_install[@]} -gt 0 ]; then
        pkg_update
        pkg_install "${need_install[@]}"
        ok "基础工具安装完成"
    else
        ok "基础工具已就绪"
    fi
}

# ---------- iptables ----------
install_iptables() {
    if command -v iptables &>/dev/null; then
        ok "iptables 已安装"
        return
    fi

    info "安装 iptables..."
    if [ "$PKG_MANAGER" = "apt" ]; then
        pkg_install iptables iptables-persistent
    else
        pkg_install iptables iptables-services
        systemctl enable iptables &>/dev/null || true
    fi
    ok "iptables 安装完成"
}

# ---------- Docker ----------
install_docker() {
    if command -v docker &>/dev/null; then
        ok "Docker 已安装: $(docker --version 2>/dev/null | head -1)"
    else
        info "安装 Docker (使用阿里云镜像)..."
        curl -fsSL https://get.docker.com | bash -s docker --mirror Aliyun \
            || err "Docker 安装失败"
        ok "Docker 安装完成"
    fi

    # 确保 Docker Compose 可用 (官方脚本已包含 compose plugin，这里兜底)
    if ! docker compose version &>/dev/null && ! command -v docker-compose &>/dev/null; then
        info "安装 docker-compose-plugin..."
        pkg_install docker-compose-plugin 2>/dev/null \
            || warn "docker-compose-plugin 安装失败，可忽略"
    fi

    systemctl enable docker &>/dev/null || true
    systemctl start docker &>/dev/null || true
    ok "Docker 服务已启动"
}

# ---------- 文件共享服务 ----------
install_file_sharing() {
    info "检查文件共享服务..."

    # --- Samba (SMB) ---
    if command -v smbd &>/dev/null; then
        ok "Samba 已安装"
    else
        info "安装 Samba..."
        if [ "$PKG_MANAGER" = "apt" ]; then
            pkg_install samba samba-common-bin
        else
            pkg_install samba samba-common
        fi
        systemctl enable smb &>/dev/null || systemctl enable smbd &>/dev/null || true
        ok "Samba 安装完成"
    fi

    # --- NFS ---
    if [ "$PKG_MANAGER" = "apt" ]; then
        if dpkg -l nfs-kernel-server &>/dev/null 2>&1; then
            ok "NFS Server 已安装"
        else
            info "安装 NFS Server..."
            pkg_install nfs-kernel-server nfs-common
            systemctl enable nfs-server &>/dev/null || true
            ok "NFS Server 安装完成"
        fi
    else
        if rpm -q nfs-utils &>/dev/null 2>&1; then
            ok "NFS 工具已安装"
        else
            info "安装 NFS 工具..."
            pkg_install nfs-utils
            systemctl enable nfs-server &>/dev/null || true
            ok "NFS 工具安装完成"
        fi
    fi

    # --- FTP (vsftpd) ---
    if command -v vsftpd &>/dev/null; then
        ok "vsftpd (FTP) 已安装"
    else
        info "安装 vsftpd..."
        pkg_install vsftpd
        systemctl enable vsftpd &>/dev/null || true
        ok "vsftpd 安装完成"
    fi

    # --- WebDAV (nginx) ---
    if command -v nginx &>/dev/null; then
        ok "Nginx (WebDAV) 已安装"
    else
        info "安装 Nginx (用于 WebDAV)..."
        if [ "$PKG_MANAGER" = "apt" ]; then
            pkg_install nginx nginx-extras
        else
            pkg_install nginx
        fi
        systemctl enable nginx &>/dev/null || true
        ok "Nginx 安装完成"
    fi

    # --- DLNA (minidlna / ReadyMedia) ---
    if command -v minidlnad &>/dev/null; then
        ok "MiniDLNA 已安装"
    else
        info "安装 MiniDLNA (DLNA 媒体服务)..."
        if [ "$PKG_MANAGER" = "apt" ]; then
            pkg_install minidlna
        else
            # CentOS/RHEL 需要 EPEL 源
            pkg_install epel-release 2>/dev/null || true
            if $PKG_MANAGER install -y minidlna 2>/dev/null; then
                ok "MiniDLNA 安装完成"
            else
                warn "MiniDLNA 安装失败，跳过 (可后续手动安装)"
                return 0
            fi
        fi
        systemctl enable minidlna &>/dev/null || true
        ok "MiniDLNA 安装完成"
    fi
}

# ---------- 文件系统工具 ----------
install_filesystem_tools() {
    info "检查文件系统工具..."

    # --- e2fsprogs (ext2/ext3/ext4) ---
    if command -v mkfs.ext4 &>/dev/null; then
        ok "e2fsprogs (ext4) 已安装"
    else
        info "安装 e2fsprogs..."
        pkg_install e2fsprogs
        ok "e2fsprogs 安装完成"
    fi

    # --- btrfs-progs ---
    if command -v btrfs &>/dev/null; then
        ok "btrfs-progs 已安装"
    else
        info "安装 btrfs-progs..."
        if [ "$PKG_MANAGER" = "apt" ]; then
            pkg_install btrfs-progs
        else
            pkg_install btrfs-progs
        fi
        ok "btrfs-progs 安装完成"
    fi

    # --- ZFS (尝试安装，失败不阻断) ---
    if command -v zfs &>/dev/null; then
        ok "ZFS 工具已安装"
    else
        info "尝试安装 ZFS 工具 (非必须，失败可忽略)..."
        if [ "$PKG_MANAGER" = "apt" ]; then
            # Debian/Ubuntu 需要 contrib 源
            if apt-cache show zfsutils-linux &>/dev/null 2>&1; then
                pkg_install zfsutils-linux || warn "ZFS 安装失败，跳过 (可后续手动安装)"
            else
                warn "ZFS 包不在当前源中，跳过 (如需要请手动添加 contrib 源后安装)"
            fi
        else
            # CentOS/RHEL 需要 EPEL + ZFS 源
            pkg_install epel-release 2>/dev/null || true
            pkg_install kernel-devel 2>/dev/null || true
            if $PKG_MANAGER install -y zfs 2>/dev/null; then
                ok "ZFS 安装完成"
            else
                warn "ZFS 安装失败，跳过 (可后续手动安装)"
            fi
        fi
    fi

    # --- XFS ---
    if command -v mkfs.xfs &>/dev/null; then
        ok "xfsprogs (XFS) 已安装"
    else
        info "安装 xfsprogs..."
        pkg_install xfsprogs
        ok "xfsprogs 安装完成"
    fi

    # --- 通用磁盘工具 ---
    if ! command -v lsblk &>/dev/null; then
        info "安装 util-linux..."
        pkg_install util-linux
    fi
    if ! command -v parted &>/dev/null; then
        info "安装 parted..."
        pkg_install parted
    fi

    # --- LVM ---
    if command -v pvcreate &>/dev/null && command -v vgcreate &>/dev/null && command -v lvcreate &>/dev/null; then
        ok "LVM 工具已安装"
    else
        info "安装 LVM 工具..."
        if [ "$PKG_MANAGER" = "apt" ]; then
            pkg_install lvm2
        else
            pkg_install lvm2
        fi
        ok "LVM 工具安装完成"
    fi

    ok "文件系统工具检查完成"
}

# ---------- 下载并安装二进制 ----------
install_binary() {
    info "下载 ${APP_NAME} 二进制文件 (${ARCH})..."
    info "下载地址: ${DOWNLOAD_URL}"

    local tmp_file="/tmp/${APP_NAME}_download_$$"

    curl -fsSL -o "$tmp_file" "$DOWNLOAD_URL" \
        || err "下载失败，请检查网络连接和下载链接"

    chmod +x "$tmp_file"

    # 如果服务正在运行，先停止
    if systemctl is-active --quiet "$APP_NAME" 2>/dev/null; then
        info "停止现有服务..."
        systemctl stop "$APP_NAME"
    fi

    mv "$tmp_file" "${INSTALL_DIR}/${APP_NAME}"
    ok "二进制文件已安装到 ${INSTALL_DIR}/${APP_NAME}"
}

# ---------- 创建目录结构 ----------
create_directories() {
    info "创建目录结构..."
    mkdir -p "$CONFIG_DIR"
    mkdir -p "$DATA_DIR"
    ok "目录结构创建完成"
}

# ---------- systemd 服务 ----------
install_service() {
    info "配置 systemd 服务..."

    cat > "$SERVICE_FILE" <<EOF
[Unit]
Description=WebOS Service
After=network.target docker.service
Wants=docker.service

[Service]
Type=simple
ExecStart=${INSTALL_DIR}/${APP_NAME}
WorkingDirectory=${DATA_DIR}
Restart=always
RestartSec=5
StartLimitInterval=60
StartLimitBurst=3
Environment=HOME=/root
LimitNOFILE=65536
LimitNPROC=4096
StandardOutput=journal
StandardError=journal
SyslogIdentifier=${APP_NAME}

[Install]
WantedBy=multi-user.target
EOF

    systemctl daemon-reload
    systemctl enable "$APP_NAME"
    ok "systemd 服务配置完成"
}

# ---------- 启动服务 ----------
start_service() {
    info "启动 ${APP_NAME} 服务..."
    systemctl start "$APP_NAME"

    sleep 2
    if systemctl is-active --quiet "$APP_NAME"; then
        ok "${APP_NAME} 服务启动成功"
    else
        warn "服务可能未正常启动，请检查日志: journalctl -u ${APP_NAME} -f"
    fi
}

# ---------- 防火墙放行 ----------
configure_firewall() {
    info "配置防火墙规则..."

    local port=8080

    # firewalld (CentOS/RHEL 默认)
    if command -v firewall-cmd &>/dev/null && systemctl is-active --quiet firewalld 2>/dev/null; then
        firewall-cmd --permanent --add-port=${port}/tcp &>/dev/null || true
        firewall-cmd --reload &>/dev/null || true
        ok "firewalld 已放行端口 ${port}"
        return
    fi

    # ufw (Ubuntu 默认)
    if command -v ufw &>/dev/null && ufw status | grep -q "active"; then
        ufw allow ${port}/tcp &>/dev/null || true
        ok "ufw 已放行端口 ${port}"
        return
    fi

    # iptables 直接放行
    if command -v iptables &>/dev/null; then
        if ! iptables -C INPUT -p tcp --dport ${port} -j ACCEPT &>/dev/null 2>&1; then
            iptables -I INPUT -p tcp --dport ${port} -j ACCEPT || true
            ok "iptables 已放行端口 ${port}"
        else
            ok "iptables 端口 ${port} 已放行"
        fi
        return
    fi

    warn "未检测到活跃的防火墙，跳过配置"
}

# ---------- 打印安装结果 ----------
print_result() {
    local ip
    ip=$(hostname -I 2>/dev/null | awk '{print $1}')
    [ -z "$ip" ] && ip="<服务器IP>"

    echo ""
    echo -e "${GREEN}============================================${NC}"
    echo -e "${GREEN}  WebOS 安装完成!${NC}"
    echo -e "${GREEN}============================================${NC}"
    echo ""
    echo -e "  访问地址:  ${BLUE}http://${ip}:8080${NC}"
    echo ""
    echo -e "  配置目录:  ${CONFIG_DIR}"
    echo -e "  数据目录:  ${DATA_DIR}"
    echo -e "  二进制:    ${INSTALL_DIR}/${APP_NAME}"
    echo -e "  服务文件:  ${SERVICE_FILE}"
    echo ""
    echo -e "  常用命令:"
    echo -e "    查看状态:  ${YELLOW}systemctl status ${APP_NAME}${NC}"
    echo -e "    查看日志:  ${YELLOW}journalctl -u ${APP_NAME} -f${NC}"
    echo -e "    重启服务:  ${YELLOW}systemctl restart ${APP_NAME}${NC}"
    echo -e "    停止服务:  ${YELLOW}systemctl stop ${APP_NAME}${NC}"
    echo ""
    echo -e "  首次启动会生成随机密码，请查看日志获取:"
    echo -e "    ${YELLOW}journalctl -u ${APP_NAME} --no-pager | head -20${NC}"
    echo ""
    echo -e "${GREEN}============================================${NC}"
}

# ==================== 主流程 ====================
main() {
    echo ""
    echo -e "${BLUE}============================================${NC}"
    echo -e "${BLUE}  WebOS 安装脚本${NC}"
    echo -e "${BLUE}============================================${NC}"
    echo ""

    check_root
    check_systemd
    detect_os
    detect_arch

    # 更新包索引
    info "更新软件包索引..."
    pkg_update

    # 安装各组件
    install_base_tools
    install_iptables
    install_docker
    install_file_sharing
    install_filesystem_tools

    # 安装应用
    install_binary
    create_directories
    install_service
    configure_firewall
    start_service

    print_result
}

main "$@"
