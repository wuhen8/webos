import { sendMsg, request, registerMessageHandler, registerReconnectHook, registerDisconnectHook, refreshChannel } from '@/stores/webSocketStore'
import { useTaskStore } from '@/stores/taskStore'
import { toast } from '@/hooks/use-toast'

// Scheduled job change handlers
const scheduledJobHandlers = new Set<(job: any) => void>()

// Register push message handlers for task updates and scheduled job changes
registerMessageHandler((msg) => {
  // Handle background task updates
  if (msg.type === 'task_update' && msg.data) {
    useTaskStore.getState().upsertTask(msg.data)
    if (!msg.data.silent && (msg.data.status === 'success' || msg.data.status === 'failed')) {
      toast({
        title: msg.data.status === 'success' ? '任务完成' : '任务失败',
        description: msg.data.title,
        variant: msg.data.status === 'success' ? 'success' : 'destructive',
      })
    }
    // Auto-refresh channels declared by the task
    if ((msg.data.status === 'success' || msg.data.status === 'failed') && msg.data.refreshChannels?.length) {
      for (const ch of msg.data.refreshChannels) {
        refreshChannel(ch)
      }
    }
    return true
  }

  // Handle scheduled_job_changed push (no reqId)
  if (msg.type === 'scheduled_job_changed' && !msg.reqId) {
    for (const handler of scheduledJobHandlers) {
      handler(msg.data)
    }
    return true
  }

  return false
})

// Sync background tasks on reconnect
registerReconnectHook(() => {
  request('task_list', {}).then((tasks: any) => {
    useTaskStore.getState().setTasks(tasks || [])
  }).catch(() => {})
})

// Clear state on disconnect
registerDisconnectHook(() => {
  scheduledJobHandlers.clear()
})

export const taskService = {
  cancel(taskId: string) {
    sendMsg({ type: 'task_cancel', data: taskId })
  },

  retry(taskId: string): Promise<{ newTaskId: string }> {
    return request('task_retry', { data: taskId })
  },

  scheduledJobsList(): Promise<any[]> {
    return request('scheduled_jobs_list', {})
  },

  scheduledJobCreate(job: { jobName: string; jobType: string; jobConfig: string; cronExpr: string; enabled?: boolean; silent?: boolean; scheduleType?: string; runAt?: number }): Promise<{ jobId: string }> {
    return request('scheduled_job_create', job)
  },

  scheduledJobUpdate(fields: { jobId: string; jobName?: string; jobType?: string; jobConfig?: string; cronExpr?: string; enabled?: boolean; silent?: boolean; scheduleType?: string; runAt?: number }): Promise<void> {
    return request('scheduled_job_update', fields)
  },

  scheduledJobDelete(jobId: string): Promise<void> {
    return request('scheduled_job_delete', { jobId })
  },

  scheduledJobRun(jobId: string): Promise<void> {
    return request('scheduled_job_run', { jobId })
  },

  onScheduledJobChanged(handler: (job: any) => void): () => void {
    scheduledJobHandlers.add(handler)
    return () => {
      scheduledJobHandlers.delete(handler)
    }
  },
}
