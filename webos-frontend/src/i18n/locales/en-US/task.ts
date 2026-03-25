const task = {
        indicator: {
          title: 'Background Tasks{{suffix}}',
          runningSuffix: ' ({{count}} running)',
        },
        actions: {
          cancel: 'Cancel',
          retry: 'Retry',
          clearCompleted: 'Clear Completed',
        },
        itemsProgress: '{{current}} / {{total}} items',
        types: {
          fs_copy: 'File Copy',
          fs_move: 'File Move',
          fs_delete: 'File Delete',
          upload: 'File Upload',
          download: 'File Download',
          docker_pull: 'Docker Pull',
          appstore_install: 'App Install',
        },
        status: {
          running: 'Running',
          success: 'Completed',
          failed: 'Failed',
          cancelled: 'Cancelled',
        },
        logs: {
          title: 'Logs',
          empty: 'No logs yet',
        },
        detail: {
          windowTitle: 'Task Details - {{title}}',
          missing: 'Task does not exist or has been cleared',
          separator: ': ',
          fields: {
            id: 'Task ID',
            type: 'Type',
            createdAt: 'Created At',
            duration: 'Duration',
            completedAt: 'Completed At',
            message: 'Message',
          },
        },
        progress: {
          defaultMessage: '{{title}}, please wait.',
          processing: 'Processing...',
        },
        toast: {
          completed: 'Task Completed',
          failed: 'Task Failed',
        },
      } as const

export default task
