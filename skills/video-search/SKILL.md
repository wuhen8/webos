---
name: video-search
description: 多源影视资源搜索与解析，支持自动轮询、剧集详情解析，生成 .vlist 播放列表文件供播放器打开。关键词：视频、影视、剧集、电影、电视剧、video、movie
---

# 视频搜索

## 1. 资源池 (API Sources)

AI 必须按顺序轮询以下接口，某个源无结果或超时则尝试下一个：

1. **非凡**: `http://cj.ffzyapi.com/api.php/provide/vod/`
2. **量子**: `https://cj.lziapi.com/api.php/provide/vod/`
3. **卧龙**: `https://collect.wolongzyw.com/api.php/provide/vod/`
4. **索尼**: `https://suoniapi.com/api.php/provide/vod/`
5. **红牛**: `https://www.hongniuzy2.com/api.php/provide/vod/`

## 2. 核心 Python 脚本

AI 在 sandbox 中执行以下逻辑：

```python
import requests
import json

# 搜索用的API列表
APIS = [
    "http://cj.ffzyapi.com/api.php/provide/vod/",
    "https://cj.lziapi.com/api.php/provide/vod/",
    "https://collect.wolongzyw.com/api.php/provide/vod/",
    "https://suoniapi.com/api.php/provide/vod/",
    "https://www.hongniuzy2.com/api.php/provide/vod/",
]

# 支持的m3u8播放源（用于获取详情）
M3U8_SOURCES = [
    ("ffm3u8", "https://api.ffzyapi.com/api.php/provide/vod/from/ffm3u8"),
    ("lzm3u8", "https://cj.lziapi.com/api.php/provide/vod/from/lzm3u8"),
    ("wolongm3u8", "https://collect.wolongzyw.com/api.php/provide/vod/from/wolongm3u8"),
    ("hnm3u8", "https://suoniapi.com/api.php/provide/vod/from/hnm3u8"),
    ("hnm3u8", "https://www.hongniuzy2.com/api.php/provide/vod/from/hnm3u8"),
]

def search(keyword):
    """阶段 1: 搜索，轮询资源池返回结果"""
    for api in APIS:
        try:
            res = requests.get(f"{api}?ac=list&wd={keyword}", timeout=5).json()
            if res.get("list"):
                return api, res
        except:
            continue
    return None, None

def fetch_playlist(vod_id, name):
    """阶段 2: 获取详情并生成 .vlist 文件
    
    注意：必须用 from/xxx 参数获取m3u8格式的播放地址，
    不能用普通api（返回的不是m3u8格式）
    """
    for source_name, api in M3U8_SOURCES:
        try:
            res = requests.get(f"{api}?ac=videolist&ids={vod_id}", timeout=8).json()
            video_info = res.get('list', [{}])[0]
            raw_url = video_info.get('vod_play_url', '')
            
            if not raw_url:
                continue
            
            episodes = raw_url.split('#')
            playlist = []
            for ep in episodes:
                if '$' in ep:
                    label, link = ep.split('$', 1)
                else:
                    label, link = "播放", ep
                if link.strip():
                    playlist.append({"label": label.strip(), "url": link.strip()})
            
            if playlist:
                import os
                out_dir = "/workspace/playlists"
                os.makedirs(out_dir, exist_ok=True)
                path = f"{out_dir}/{name}.vlist"
                with open(path, "w", encoding="utf-8") as f:
                    json.dump({"name": name, "playlist": playlist}, f, ensure_ascii=False)
                print(path)
                return
            
        except Exception as e:
            print(f"尝试 {source_name} 失败: {e}")
            continue
    
    print("ERROR: 所有m3u8源都获取失败")
```

## 3. 执行流程

### 阶段一：搜索与判别

1. AI 在 sandbox 中运行搜索脚本。
2. 判断结果：
   - **无结果**：告知用户未找到资源。
   - **1 个结果**：直接进入阶段二。
   - **多个结果**：AI 根据名称、年份、类型等信息自行判断最合适的。无法判断时，列出结果询问用户。

### 阶段二：获取详情并生成 .vlist 文件

1. 确定目标 `vod_id` 后，AI 运行 `fetch_playlist(vod_id, name)`。
2. 脚本会依次尝试各个 m3u8 播放源，成功后直接在 sandbox 内写入 `/workspace/playlists/<name>.vlist`。
3. AI 用 `upload_from_sandbox` 将文件传到存储节点 `{{DATA_DIR}}/playlists/` 目录。

**关键点**：获取详情必须用 `from/xxx` 格式的API（如 `https://cj.lziapi.com/api.php/provide/vod/from/lzm3u8`），普通API返回的播放地址不是m3u8格式，无法播放。

### 阶段三：打开播放

1. 用 `open_ui` 的 `open_path` 打开上传后的 `.vlist` 文件路径。
2. 系统自动识别扩展名，用视频播放器打开。

## 4. 约束

- **严禁虚构 URL**：必须基于脚本返回的真实数据。
- **确认机制**：多个结果且 AI 无法判断时，必须询问用户确认。
- **统一走 .vlist 文件**：不要直接传 playlist 参数给播放器。