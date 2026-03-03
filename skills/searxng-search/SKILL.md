---
name: searxng-search
description: 使用自建 SearXNG 实例进行网络搜索，支持多类别搜索（通用、图片、新闻、IT、科学等），返回结构化 JSON 结果。关键词：搜索、search、searx、searxng、网络搜索、web search、查询、百科、新闻、图片搜索
---

# SearXNG 网络搜索

通过自建 SearXNG 元搜索引擎进行网络搜索，聚合多个搜索引擎的结果。

## 1. 接口信息

- **基础地址**: `http://192.168.101.25:8094`
- **搜索端点**: `GET /search`
- **返回格式**: JSON（需指定 `format=json`）

## 2. 请求参数

| 参数 | 必填 | 说明 |
|------|------|------|
| `q` | 是 | 搜索关键词 |
| `format` | 是 | 固定为 `json` |
| `categories` | 否 | 搜索类别，逗号分隔：`general`, `images`, `news`, `it`, `science`, `files`, `music`, `videos`, `social media` |
| `language` | 否 | 语言代码，如 `zh-CN`, `en`, `ja` |
| `pageno` | 否 | 页码，默认 `1` |
| `time_range` | 否 | 时间范围：`day`, `month`, `year` |
| `safesearch` | 否 | 安全搜索：`0`(关), `1`(中), `2`(严) |
| `engines` | 否 | 指定搜索引擎，逗号分隔，如 `google,bing,duckduckgo` |

## 3. 核心 Python 脚本

AI 在 sandbox 中执行以下逻辑：

```python
import requests
import json

SEARXNG_URL = "http://192.168.101.25:8094/search"

def search(query, categories=None, language=None, pageno=1, time_range=None, engines=None):
    """SearXNG 搜索"""
    params = {
        "q": query,
        "format": "json",
        "pageno": pageno,
    }
    if categories:
        params["categories"] = categories
    if language:
        params["language"] = language
    if time_range:
        params["time_range"] = time_range
    if engines:
        params["engines"] = engines

    try:
        resp = requests.get(SEARXNG_URL, params=params, timeout=15)
        resp.raise_for_status()
        data = resp.json()
        results = data.get("results", [])
        suggestions = data.get("suggestions", [])
        infoboxes = data.get("infoboxes", [])

        # 格式化输出
        output = []
        if infoboxes:
            for box in infoboxes:
                output.append(f"[信息框] {box.get('infobox', '')}")
                if box.get('content'):
                    output.append(f"  {box['content'][:300]}")
                for attr in box.get('attributes', [])[:5]:
                    output.append(f"  {attr.get('label','')}: {attr.get('value','')}")
                output.append("")

        for i, r in enumerate(results[:15], 1):
            title = r.get("title", "无标题")
            url = r.get("url", "")
            content = r.get("content", "")[:200]
            engine = ", ".join(r.get("engines", []))
            output.append(f"{i}. {title}")
            output.append(f"   URL: {url}")
            if content:
                output.append(f"   摘要: {content}")
            output.append(f"   来源: {engine}")
            # 图片结果额外字段
            if r.get("img_src"):
                output.append(f"   图片: {r['img_src']}")
            if r.get("thumbnail_src"):
                output.append(f"   缩略图: {r['thumbnail_src']}")
            output.append("")

        if suggestions:
            output.append(f"相关建议: {', '.join(suggestions)}")

        total = data.get("number_of_results", len(results))
        output.insert(0, f"共找到约 {total} 条结果（显示前 {min(15, len(results))} 条）\n")

        print("\n".join(output))
    except Exception as e:
        print(f"搜索失败: {e}")

# 执行搜索
search("{{QUERY}}")
```

## 4. 执行流程

### 阶段一：理解用户意图

1. 分析用户的搜索需求，确定：
   - 搜索关键词（可优化/翻译以获得更好结果）
   - 搜索类别（默认 `general`，图片需求用 `images`，技术问题用 `it`）
   - 是否需要限定语言或时间范围

### 阶段二：执行搜索

1. 在 sandbox 中运行搜索脚本，将 `{{QUERY}}` 替换为实际关键词。
2. 根据需要调整参数：
   - 技术问题：`categories=it`，可指定 `engines=stackoverflow,github`
   - 新闻资讯：`categories=news`，`time_range=day` 或 `month`
   - 图片搜索：`categories=images`
   - 学术内容：`categories=science`
3. 如果结果不理想，可尝试：
   - 更换关键词或语言
   - 切换搜索类别
   - 翻页 `pageno=2`

### 阶段三：整理回复

1. 从搜索结果中提取与用户问题最相关的信息。
2. 用自然语言总结回答，附上来源链接。
3. 如有信息框（infoboxes），优先展示其中的结构化信息。
4. 如有相关建议（suggestions），可提示用户进一步搜索方向。

## 5. 约束

- **必须基于真实搜索结果**：严禁虚构 URL 或内容。
- **注明来源**：回答中引用的信息需附上对应 URL。
- **隐私保护**：不在搜索关键词中包含用户的个人信息。
- **结果不足时说明**：如果搜索无结果或结果不相关，如实告知用户。
