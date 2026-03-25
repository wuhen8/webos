const actions = {
        shutdown: {
          title: '确定要关机吗？',
          description: '系统将立即关机，所有未保存的工作将丢失。',
          confirm: '关机',
        },
        restart: {
          title: '确定要重新启动吗？',
          description: '系统将立即重启，所有未保存的工作将丢失。',
          confirm: '重新启动',
        },
      } as const

export default actions
