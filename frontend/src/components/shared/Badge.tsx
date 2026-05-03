import { cn } from '@/lib/utils'

type Variant = 'blue' | 'green' | 'purple' | 'orange' | 'gray' | 'red' | 'yellow'

interface Props {
  children: React.ReactNode
  variant?: Variant
  className?: string
}

const VARIANTS: Record<Variant, string> = {
  blue:   'bg-blue-100 text-blue-700',
  green:  'bg-green-100 text-green-700',
  purple: 'bg-purple-100 text-purple-700',
  orange: 'bg-orange-100 text-orange-700',
  gray:   'bg-gray-100 text-gray-600',
  red:    'bg-red-100 text-red-700',
  yellow: 'bg-yellow-100 text-yellow-700',
}

export default function Badge({ children, variant = 'gray', className }: Props) {
  return (
    <span className={cn('inline-flex items-center px-2 py-0.5 rounded text-xs font-medium', VARIANTS[variant], className)}>
      {children}
    </span>
  )
}
