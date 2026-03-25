const actions = {
        shutdown: {
          title: 'Are you sure you want to shut down?',
          description: 'The system will shut down immediately and any unsaved work will be lost.',
          confirm: 'Shut Down',
        },
        restart: {
          title: 'Are you sure you want to restart?',
          description: 'The system will restart immediately and any unsaved work will be lost.',
          confirm: 'Restart',
        },
      } as const

export default actions
