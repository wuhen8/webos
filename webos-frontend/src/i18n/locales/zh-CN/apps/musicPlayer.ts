const musicPlayer = {
          name: '音乐播放器',
          fileAssociations: {
            audio: '音乐播放器',
          },
          unknownTrack: '未知曲目',
          errors: {
            unplayable: '无法播放此音频文件',
            playFailed: '播放失败',
          },
          empty: {
            noContent: {
              title: '还没有音乐内容',
              description: '点击右上角添加目录，自动扫描并建立播放列表',
            },
            noTracks: {
              title: '暂无可播放歌曲',
              description: '已保存目录中没有音频文件，或文件格式暂不支持，可尝试刷新目录或添加其他目录',
            },
          },
          repeat: {
            none: '无循环',
            all: '列表循环',
            one: '单曲循环',
          },
          shuffle: {
            on: '随机播放开',
            off: '随机播放关',
          },
          playlist: {
            title: '播放列表 ({{count}})',
          },
          savedFolders: {
            title: '已保存目录 ({{count}})',
            empty: '还没有保存目录，点击右上角添加目录开始扫描音乐',
          },
          actions: {
            refreshFolders: '刷新目录',
            addFolder: '添加目录',
            removeFolder: '删除目录',
          },
          folderPicker: {
            empty: '此目录下没有子文件夹',
            cancel: '取消',
            selectCurrent: '选择此目录',
          },
          scanning: '正在扫描音乐文件...',
        } as const

export default musicPlayer
