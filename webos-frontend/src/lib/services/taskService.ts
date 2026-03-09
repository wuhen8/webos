import { request, notify, registerMessageHandler, registerReconnectHook, registerDisconnectHook, refreshChannel } from '@/stores/webSocketStore'
import { useTaskStore } from '@/stores/taskStore'
import { toast } from '@/hooks/use-toast'

const scheduledJobHandlers = new Set<(job: any) => void>()

registerMessageHandler((msg) => {
  if (msg.method === 'task.update' && msg.params) {
    const data = msg.params
    useTaskStore.getState().upsertTask(data)
    if (!data.silent && (data.status === 'success' || data.status === 'failed')) {
      toast({
        title: data.status === 'success' ? '任务完成' : '任务失败',
        description: data.title,
        variant: data.status === 'success' ? 'success' : 'destructive',
      })
    }
    if ((data.status === 'success' || data.status === 'failed') && data.refreshChannels?.length) {
      for (const ch of data.refreshChannels) refreshChannel(ch)
    }
    return true
  }
  if (msg.method === 'scheduled_job.changed' && msg.params) {
    for (const handler of scheduledJobHandlers) handler(msg.params)
    return true
  }
  return false
})

registerReconnectHook(() => {
  request('task.list').then((tasks: any) => {
    useTaskStore.getState().setTasks(tasks || [])
  }).catch(() => {})
})

registerDisconnectHook(() => { scheduledJobHandlers.clear() })

export const taskService = {
  cancel(taskId: string) { notify('task.cancel', { data: taskId }) },
  retry(taskId: string): Promise<{ newTaskId: string }> { return request('task.retry', { data: taskId }) },
  scheduledJobsList(): Promise<any[]> { return request('scheduled_job.list') },
  scheduledJobCreate(job: { jobName: string; jobType: string; jobConfig: string; cronExpr: string; enabled?: boolean; silent?: boolean; scheduleType?: string; runAt?: number }): Promise<{ jobId: string }> {
    return request('scheduled_job.create', job)
  },
  scheduledJobUpdate(fields: { jobId: string; jobName?: string; jobType?: string; jobConfig?: string; cronExpr?: string; enabled?: boolean; silent?: boolean; scheduleType?: string; runAt?: number }): Promise<void> {
    return request('scheduled_job.update', fields)
  },
  scheduledJobDelete(jobId: string): Promise<void> { return request('scheduled_job.delete', { jobId }) },
  scheduledJobRun(jobId: string): Promise<void> { return request('scheduled_job.run', { jobId }) },
  onScheduledJobChanged(handler: (job: any) => void): () => void {
    scheduledJobHandlers.add(handler)
    return () => { scheduledJobHandlers.delete(handler) }
  },
}
