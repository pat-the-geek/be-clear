import { useState, useEffect } from 'react'
import { CheckCircle2, XCircle, Info, X } from 'lucide-react'
import { subscribeToasts, getToasts, type ToastItem } from '@/lib/toast'

function ToastCard({ toast, onDismiss }: { toast: ToastItem; onDismiss: (id: number) => void }) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const t = requestAnimationFrame(() => setVisible(true))
    return () => cancelAnimationFrame(t)
  }, [])

  const styles = {
    success: { bg: 'bg-green-50 border-green-200', text: 'text-green-800', icon: <CheckCircle2 size={16} className="text-green-500 shrink-0" /> },
    error:   { bg: 'bg-red-50 border-red-200',     text: 'text-red-800',   icon: <XCircle     size={16} className="text-red-500 shrink-0" /> },
    info:    { bg: 'bg-blue-50 border-blue-200',    text: 'text-blue-800',  icon: <Info        size={16} className="text-blue-500 shrink-0" /> },
  }[toast.type]

  return (
    <div
      className={`flex items-center gap-2.5 pl-3 pr-2 py-2.5 rounded-xl border shadow-sm text-sm font-medium max-w-sm w-full
        transition-all duration-300 ease-out
        ${styles.bg} ${styles.text}
        ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'}`}
    >
      {styles.icon}
      <span className="flex-1 leading-snug">{toast.message}</span>
      <button
        onClick={() => onDismiss(toast.id)}
        className="p-1 rounded-lg hover:bg-black/5 transition-colors shrink-0"
      >
        <X size={13} />
      </button>
    </div>
  )
}

export default function Toaster() {
  const [toasts, setToasts] = useState<ToastItem[]>(getToasts)

  useEffect(() => subscribeToasts(setToasts), [])

  function dismiss(id: number) {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }

  if (toasts.length === 0) return null

  return (
    <div className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2 items-end pointer-events-none">
      {toasts.map((t) => (
        <div key={t.id} className="pointer-events-auto">
          <ToastCard toast={t} onDismiss={dismiss} />
        </div>
      ))}
    </div>
  )
}
