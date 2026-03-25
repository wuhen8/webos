const video = {
          name: '视频播放器',
          fileAssociations: {
            video: '视频播放器',
            playlist: '播放列表',
          },
          player: {
            loading: '加载中...',
            fallbackTitle: '视频',
            customSkin: {
              errorTitle: '出错了。',
              errorDescription: '播放视频时发生错误，请重试。',
              replay: '重新播放',
              play: '播放',
              pause: '暂停',
              disableCaptions: '关闭字幕',
              enableCaptions: '开启字幕',
              exitPictureInPicture: '退出画中画',
              enterPictureInPicture: '进入画中画',
              exitFullscreen: '退出全屏',
              enterFullscreen: '进入全屏',
              seekBackward: '后退 {{seconds}} 秒',
              seekForward: '前进 {{seconds}} 秒',
              togglePlaybackRate: '切换播放速度',
            },
            errors: {
              resolveFailed: '无法解析视频地址',
              invalidUrl: '无效的视频地址',
            },
            playlist: {
              button: '剧集列表',
              episodes: '剧集 · {{count}}集',
              nowPlaying: '正在播放 · {{label}}',
            },
          },
          playlist: {
            channelFallback: '频道 {{count}}',
            parseFailed: '播放列表文件解析失败',
          },
        } as const

export default video
