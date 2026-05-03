import { cn } from '@/lib/utils'

interface Props {
  value: number   // 0–100
  className?: string
}

export default function ProgressBar({ value, className }: Props) {
  const pct = Math.min(100, Math.max(0, value))
  const color =
    pct >= 100 ? 'bg-green-500'
    : pct >= 50 ? 'bg-blue-500'
    : pct > 0   ? 'bg-yellow-400'
    : 'bg-gray-200'

  return (
    <div className={cn('w-full bg-gray-100 rounded-full h-2 overflow-hidden', className)}>
      <div
        className={cn('h-full rounded-full transition-all duration-300', color)}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}
