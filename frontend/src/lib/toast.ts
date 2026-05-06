type ToastType = 'success' | 'error' | 'info'

export interface ToastItem {
  id: number
  message: string
  type: ToastType
}

type Listener = (toasts: ToastItem[]) => void

let _toasts: ToastItem[] = []
let _listeners: Listener[] = []
let _nextId = 1

function _notify() {
  const copy = [..._toasts]
  _listeners.forEach((l) => l(copy))
}

function _add(message: string, type: ToastType) {
  const id = _nextId++
  _toasts = [..._toasts, { id, message, type }]
  _notify()
  setTimeout(() => {
    _toasts = _toasts.filter((t) => t.id !== id)
    _notify()
  }, 3500)
}

export const toast = {
  success: (message: string) => _add(message, 'success'),
  error:   (message: string) => _add(message, 'error'),
  info:    (message: string) => _add(message, 'info'),
}

export function subscribeToasts(listener: Listener): () => void {
  _listeners.push(listener)
  return () => {
    _listeners = _listeners.filter((l) => l !== listener)
  }
}

export function getToasts(): ToastItem[] {
  return _toasts
}
