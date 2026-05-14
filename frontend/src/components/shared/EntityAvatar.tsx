import { Building2, Globe, Handshake, CalendarClock } from 'lucide-react'
import type { Img } from '@/types'
import { imgUrl } from '@/components/shared/ImageManager'
import SmartImage from '@/components/shared/SmartImage'

// ─── Configuration par type ──────────────────────────────────

type EntityType = 'org' | 'env' | 'eng' | 'event'

const CONFIG: Record<EntityType, {
  Icon: React.ElementType
  bg: string
  iconColor: string
}> = {
  org:   { Icon: Building2,    bg: 'bg-blue-50   border-blue-100',   iconColor: 'text-blue-400'   },
  env:   { Icon: Globe,        bg: 'bg-orange-50 border-orange-100', iconColor: 'text-orange-400' },
  eng:   { Icon: Handshake,    bg: 'bg-amber-50  border-amber-100',  iconColor: 'text-amber-400'  },
  event: { Icon: CalendarClock, bg: 'bg-sky-50   border-sky-100',    iconColor: 'text-sky-400'    },
}

// ─── Tailles ─────────────────────────────────────────────────

const SIZES = {
  xs: { box: 'w-7 h-7 rounded-lg',   icon: 12 },
  sm: { box: 'w-10 h-10 rounded-xl', icon: 16 },
  md: { box: 'w-14 h-14 rounded-xl', icon: 22 },
  lg: { box: 'w-20 h-20 rounded-xl', icon: 30 },
}

// ─── Composant ───────────────────────────────────────────────

interface EntityAvatarProps {
  type: EntityType
  nom?: string
  image?: Img | null
  size?: keyof typeof SIZES
  className?: string
}

export default function EntityAvatar({
  type,
  nom,
  image,
  size = 'md',
  className = '',
}: EntityAvatarProps) {
  const { Icon, bg, iconColor } = CONFIG[type]
  const { box, icon: iconSize } = SIZES[size]

  if (image) {
    return (
      <SmartImage
        src={imgUrl(image.chemin)}
        alt={nom ?? ''}
        className={`${box} object-cover border shrink-0 shadow-sm ${className}`}
        cropWidth={80}
        cropHeight={80}
      />
    )
  }

  return (
    <div className={`${box} ${bg} border flex items-center justify-center shrink-0 ${className}`}>
      <Icon size={iconSize} className={iconColor} />
    </div>
  )
}
