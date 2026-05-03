import { useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Props {
  title: string
  subtitle?: string
  backTo?: string
  actions?: React.ReactNode
  className?: string
}

export default function PageHeader({ title, subtitle, backTo, actions, className }: Props) {
  const navigate = useNavigate()
  return (
    <div className={cn('flex items-start justify-between mb-6', className)}>
      <div className="flex items-start gap-3">
        {backTo && (
          <button
            onClick={() => navigate(backTo)}
            className="mt-1 p-1 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors"
          >
            <ArrowLeft size={16} />
          </button>
        )}
        <div>
          <h1 className="text-xl font-bold text-gray-900">{title}</h1>
          {subtitle && <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  )
}
