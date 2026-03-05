# 使用 Debian 13 (Trixie) Slim 作为基础镜像
FROM debian:13-slim

# ================= 环境变量配置 =================
# 指定 Python 版本，可通过 docker-compose 的 build args 覆盖
ENV PYTHON_VERSION=3.12

# 统一配置国内镜像源
# uv (Python) 镜像源配置为清华源
ENV UV_INDEX_URL=https://pypi.tuna.tsinghua.edu.cn/simple
# npm/pnpm 镜像源配置为淘宝源
ENV NPM_CONFIG_REGISTRY=https://registry.npmmirror.com

# 设置非交互式安装及 Python 虚拟环境路径
ENV DEBIAN_FRONTEND=noninteractive \
    VIRTUAL_ENV=/workspace/.venv \
    PATH="/workspace/.venv/bin:$PATH"

# ================= 系统与环境构建 =================
# 1. 替换 Debian 13 APT 源为清华源 (Debian 13 采用 DEB822 格式)
RUN sed -i 's/deb.debian.org/mirrors.tuna.tsinghua.edu.cn/g' /etc/apt/sources.list.d/debian.sources 2>/dev/null || \
    sed -i 's/deb.debian.org/mirrors.tuna.tsinghua.edu.cn/g' /etc/apt/sources.list && \
    apt-get update && apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    nodejs \
    npm \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# 2. 安装 pnpm 并配置国内源
RUN npm config set registry https://registry.npmmirror.com && \
    npm install -g pnpm && \
    pnpm config set registry https://registry.npmmirror.com

# 3. 安装 uv
RUN curl -Lo /tmp/uv.tar.gz https://github.com/astral-sh/uv/releases/download/0.10.8/uv-x86_64-unknown-linux-gnu.tar.gz && \
    tar -xzf /tmp/uv.tar.gz -C /tmp && \
    mv /tmp/uv-x86_64-unknown-linux-gnu/uv /bin/uv && \
    mv /tmp/uv-x86_64-unknown-linux-gnu/uvx /bin/uvx && \
    rm -rf /tmp/uv.tar.gz /tmp/uv-x86_64-unknown-linux-gnu

# ================= 工作区与依赖安装 =================
WORKDIR /workspace

# 4. 使用 uv 根据环境变量下载并创建对应版本的 Python 虚拟环境
RUN uv venv $VIRTUAL_ENV --python $PYTHON_VERSION

# 5. 使用 uv 安装原始所需的 Python 包
# (由于上方设置了 VIRTUAL_ENV 和 PATH，uv pip 会自动安装到虚拟环境中)
RUN uv pip install --no-cache \
    pandas \
    openpyxl \
    xlsxwriter \
    numpy \
    matplotlib \
    chardet \
    requests