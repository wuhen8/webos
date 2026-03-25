const task = {
        indicator: {
          title: '后台任务{{suffix}}',
          runningSuffix: '（{{count}} 运行中）',
        },
        actions: {
          cancel: '取消',
          retry: '重试',
          clearCompleted: '清除已完成',
        },
        itemsProgress: '{{current}} / {{total}} 个项目',
        types: {
          fs_copy: '文件复制',
          fs_move: '文件移动',
          fs_delete: '文件删除',
          upload: '文件上传',
          download: '文件下载',
          docker_pull: 'Docker 拉取',
          appstore_install: '应用安装',
        },
        status: {
          running: '运行中',
          success: '已完成',
          failed: '失败',
          cancelled: '已取消',
        },
        logs: {
          title: '日志',
          empty: '暂无日志',
        },
        detail: {
          windowTitle: '任务详情 - {{title}}',
          missing: '任务不存在或已被清除',
          separator: '：',
          fields: {
            id: '任务 ID',
            type: '类型',
            createdAt: '创建时间',
            duration: '耗时',
            completedAt: '完成时间',
            message: '信息',
          },
        },
        progress: {
          defaultMessage: '{{title}}，请稍候。',
          processing: '处理中...',
        },
        toast: {
          completed: '任务完成',
          failed: '任务失败',
        },
      } as const

export default task
