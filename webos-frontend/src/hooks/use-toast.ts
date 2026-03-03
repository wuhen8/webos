import { useSyncExternalStore } from "react"

const TOAST_LIMIT = 5
const TOAST_AUTO_DISMISS = 4000

export type ToastVariant = "default" | "destructive" | "success"

export interface ToasterToast {
  id: string
  title?: string
  description?: string
  variant?: ToastVariant
  createdAt: number
}

type ToastInput = Omit<ToasterToast, "id" | "createdAt">

let count = 0
function genId() {
  count = (count + 1) % Number.MAX_SAFE_INTEGER
  return count.toString()
}

let toasts: ToasterToast[] = []
const listeners = new Set<() => void>()
const dismissTimers = new Map<string, ReturnType<typeof setTimeout>>()

function emit() {
  listeners.forEach((l) => l())
}

function addToast(input: ToastInput) {
  const id = genId()
  const t: ToasterToast = { ...input, id, createdAt: Date.now() }
  toasts = [t, ...toasts].slice(0, TOAST_LIMIT)
  emit()

  const timer = setTimeout(() => {
    dismissToast(id)
  }, TOAST_AUTO_DISMISS)
  dismissTimers.set(id, timer)

  return id
}

function dismissToast(id: string) {
  const timer = dismissTimers.get(id)
  if (timer) {
    clearTimeout(timer)
    dismissTimers.delete(id)
  }
  toasts = toasts.filter((t) => t.id !== id)
  emit()
}

function dismissAll() {
  dismissTimers.forEach((timer) => clearTimeout(timer))
  dismissTimers.clear()
  toasts = []
  emit()
}

function getSnapshot() {
  return toasts
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function useToast() {
  const currentToasts = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  return {
    toasts: currentToasts,
    toast: (input: ToastInput) => addToast(input),
    dismiss: dismissToast,
    dismissAll,
  }
}

export function toast(input: ToastInput) {
  return addToast(input)
}
