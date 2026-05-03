import { cn } from '@/lib/utils'

interface Props {
  className?: string
  count?: number
}

function SkeletonLine({ className }: { className?: string }) {
  return <div className={cn('bg-gray-200 rounded animate-pulse', className)} />
}

export function SkeletonCard() {
  return (
    <div className="p-3 bg-white rounded-lg border border-gray-200 flex items-start gap-3">
      <SkeletonLine className="w-12 h-12 shrink-0 rounded-md" />
      <div className="flex-1 space-y-2 pt-1">
        <SkeletonLine className="h-4 w-3/4" />
        <SkeletonLine className="h-3 w-1/2" />
      </div>
    </div>
  )
}

export function SkeletonCards({ count = 3 }: Props) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {Array.from({ length: count }).map((_, i) => <SkeletonCard key={i} />)}
    </div>
  )
}

export function SkeletonText({ className }: Props) {
  return (
    <div className={cn('space-y-2', className)}>
      <SkeletonLine className="h-4 w-full" />
      <SkeletonLine className="h-4 w-5/6" />
      <SkeletonLine className="h-4 w-4/6" />
    </div>
  )
}

export default SkeletonLine
