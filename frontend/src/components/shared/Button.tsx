import type { ButtonHTMLAttributes } from 'react'

type EntityType = 'org' | 'env' | 'eng' | 'event' | 'neutral' | 'danger'
type Variant = 'primary' | 'secondary' | 'ghost'

const STYLES: Record<EntityType, Record<Variant, string>> = {
  org:     { primary: 'bg-blue-600 text-white hover:bg-blue-700',     secondary: 'border border-blue-200 text-blue-700 hover:bg-blue-50',      ghost: 'text-blue-700 hover:bg-blue-50' },
  env:     { primary: 'bg-orange-600 text-white hover:bg-orange-700', secondary: 'border border-orange-200 text-orange-700 hover:bg-orange-50', ghost: 'text-orange-700 hover:bg-orange-50' },
  eng:     { primary: 'bg-amber-600 text-white hover:bg-amber-700',   secondary: 'border border-amber-200 text-amber-700 hover:bg-amber-50',   ghost: 'text-amber-700 hover:bg-amber-50' },
  event:   { primary: 'bg-sky-600 text-white hover:bg-sky-700',       secondary: 'border border-sky-200 text-sky-700 hover:bg-sky-50',         ghost: 'text-sky-700 hover:bg-sky-50' },
  neutral: { primary: 'bg-gray-800 text-white hover:bg-gray-900',     secondary: 'border border-gray-200 text-gray-700 hover:bg-gray-50',      ghost: 'text-gray-700 hover:bg-gray-100' },
  danger:  { primary: 'bg-red-600 text-white hover:bg-red-700',       secondary: 'border border-red-200 text-red-600 hover:bg-red-50',         ghost: 'text-red-600 hover:bg-red-50' },
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  entity?: EntityType
  variant?: Variant
}

export const Button = ({ entity = 'neutral', variant = 'primary', children, className = '', ...props }: ButtonProps) => {
  const base = 'inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed'
  return (
    <button className={`${base} ${STYLES[entity][variant]} ${className}`} {...props}>
      {children}
    </button>
  )
}
