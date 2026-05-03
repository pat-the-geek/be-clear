import { Link } from 'react-router-dom'
import type { Img } from '@/types'
import { cn } from '@/lib/utils'
import { imgUrl } from '@/components/shared/ImageManager'
import SmartImage from '@/components/shared/SmartImage'

interface Props {
  id: number
  nom: string
  type: 'org' | 'env' | 'eng' | 'event'
  cla?: string
  claVisuel?: string
  imagePrincipale?: Img
  badge?: string
  badgeColor?: string
  updatedAt?: string
}

function relativeDate(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1)   return "à l'instant"
  if (mins < 60)  return `il y a ${mins} min`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24)   return `il y a ${hrs} h`
  const days = Math.floor(hrs / 24)
  if (days < 7)   return `il y a ${days} j`
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
}

const TYPE_LABELS: Record<Props['type'], string> = {
  org: 'Organisation',
  env: 'Environnement',
  eng: 'Engagement',
  event: 'Évènement',
}

const TYPE_CARD_COLORS: Record<Props['type'], string> = {
  org:   'bg-blue-50   border-blue-100   hover:border-blue-300   hover:shadow-blue-100',
  env:   'bg-orange-50 border-orange-100 hover:border-orange-300 hover:shadow-orange-100',
  eng:   'bg-amber-50  border-amber-100  hover:border-amber-300  hover:shadow-amber-100',
  event: 'bg-violet-50 border-violet-100 hover:border-violet-300 hover:shadow-violet-100',
}

export default function ObjCard({ id, nom, type, cla, imagePrincipale, badge, badgeColor, updatedAt }: Props) {
  return (
    <Link
      to={`/${type}/${id}`}
      className={cn('group flex items-start gap-3 p-3 rounded-lg border hover:shadow-sm transition-all', TYPE_CARD_COLORS[type])}
    >
      {/* Vignette image ou placeholder */}
      <div className="w-12 h-12 rounded-md overflow-hidden bg-gray-100 shrink-0 flex items-center justify-center">
        {imagePrincipale ? (
          <SmartImage
            src={imgUrl(imagePrincipale.chemin)}
            alt={nom}
            className="w-full h-full object-cover"
            cropWidth={48}
            cropHeight={48}
          />
        ) : (
          <span className="text-gray-400 text-lg font-semibold">{nom[0]?.toUpperCase()}</span>
        )}
      </div>

      {/* Infos */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 truncate group-hover:text-blue-700">
          {nom}
        </p>
        <p className="text-xs text-gray-400 mt-0.5">{TYPE_LABELS[type]}{cla ? ` · ${cla}` : ''}</p>
        {updatedAt && (
          <p className="text-xs text-gray-300 mt-0.5">{relativeDate(updatedAt)}</p>
        )}
        {badge && (
          <span
            className={cn(
              'inline-block mt-1 px-1.5 py-0.5 rounded text-xs font-medium',
              badgeColor ?? 'bg-gray-100 text-gray-600',
            )}
          >
            {badge}
          </span>
        )}
      </div>
    </Link>
  )
}
