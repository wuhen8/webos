# 媒体列表文件格式

系统支持两种自定义媒体列表文件格式，用于快速打开播放器播放多集内容。

## .vlist — 视频播放列表

扩展名：`.vlist`  
打开方式：双击或 `open_path` 自动用视频播放器打开  
文件内容：JSON 格式

```json
{
  "name": "剧名",
  "description": "可选描述，备用字段",
  "playlist": [
    { "label": "第1集", "url": "https://example.com/ep1.m3u8" },
    { "label": "第2集", "url": "https://example.com/ep2.m3u8" }
  ]
}
```

### 字段说明

| 字段 | 必填 | 说明 |
|------|------|------|
| name | 否 | 播放器窗口标题，缺省用文件名 |
| description | 否 | 描述信息，预留扩展 |
| playlist | 是 | 播放列表数组 |
| playlist[].label | 是 | 集数/标题 |
| playlist[].url | 是 | 视频地址，支持 m3u8/mp4 等 |

也支持直接传数组（省略外层对象）：

```json
[
  { "label": "第1集", "url": "https://example.com/ep1.m3u8" },
  { "label": "第2集", "url": "https://example.com/ep2.m3u8" }
]
```

## .alist — 音频播放列表（预留）

扩展名：`.alist`  
格式与 `.vlist` 类似，待音乐播放器支持后启用。

## 常见数据源转换

如果视频源返回 `vod_play_url` 格式如 `第01集$url#第02集$url`，按 `#` 分割再按 `$` 分割即可转成 playlist 数组。
