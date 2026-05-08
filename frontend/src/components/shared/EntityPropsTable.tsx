/**
 * Tableau triable des ORG ou ENV d'un type donné, avec toutes leurs PROP/VALUE en colonnes.
 * Les en-têtes sont déduits de l'union des props portées par les entités chargées.
 */
import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { ExternalLink } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { OrgBrief, EnvBrief, Value, PropType } from '@/types'

type Entity = OrgBrief | EnvBrief

interface Props {
  items: Entity[]
  entityType: 'org' | 'env'
  onSelect: (id: number) => void
}

// ─── Formatage d'une valeur selon son type ──────────────────

function formatValue(v: Value): string {
  const t = v.prop.type as PropType
  if (v.valeur_bool != null) return v.valeur_bool ? 'Oui' : 'Non'
  if (v.valeur_nombre != null) {
    if (t === 'MONTANT') return `${v.valeur_nombre.toLocaleString('fr-FR')} €`
    if (t === 'POURCENTAGE') return `${v.valeur_nombre} %`
    return String(v.valeur_nombre)
  }
  if (v.valeur_date) {
    try {
      const d = new Date(v.valeur_date)
      if (t === 'DATE') return d.toLocaleDateString('fr-FR')
      if (t === 'HEURE') return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
      return d.toLocaleString('fr-FR')
    } catch { return v.valeur_date }
  }
  if (v.valeur_json != null) {
    if (Array.isArray(v.valeur_json)) return (v.valeur_json as string[]).join(', ')
    const c = v.valeur_json as { lat?: number; lng?: number }
    if (c.lat != null && c.lng != null) return `${c.lat}, ${c.lng}`
    return JSON.stringify(v.valeur_json)
  }
  if (v.valeur_texte) {
    if (t === 'URL') return v.valeur_texte
    return v.valeur_texte
  }
  return '—'
}

// ─── Valeur brute pour le tri ────────────────────────────────

function sortKey(v: Value | undefined): string | number {
  if (!v) return ''
  if (v.valeur_nombre != null) return v.valeur_nombre
  if (v.valeur_bool != null) return v.valeur_bool ? 1 : 0
  if (v.valeur_date) return v.valeur_date
  if (v.valeur_texte) return v.valeur_texte.toLowerCase()
  return ''
}

// ─── Composant ──────────────────────────────────────────────

export default function EntityPropsTable({ items, entityType, onSelect }: Props) {
  const [sortCol, setSortCol] = useState<string>('nom')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  const toggleSort = (col: string) => {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir('asc') }
  }

  // Colonnes : union ordonnée de toutes les props présentes dans les items
  const propCols = useMemo(() => {
    const seen = new Map<number, { id: number; nom: string }>()
    for (const item of items) {
      for (const v of item.values ?? []) {
        if (!seen.has(v.prop.id)) seen.set(v.prop.id, { id: v.prop.id, nom: v.prop.nom })
      }
    }
    return Array.from(seen.values())
  }, [items])

  // Tri
  const sorted = useMemo(() => {
    return [...items].sort((a, b) => {
      let ka: string | number
      let kb: string | number
      if (sortCol === 'nom') {
        ka = a.nom.toLowerCase()
        kb = b.nom.toLowerCase()
      } else {
        const propId = Number(sortCol)
        const va = (a.values ?? []).find(v => v.prop.id === propId)
        const vb = (b.values ?? []).find(v => v.prop.id === propId)
        ka = sortKey(va)
        kb = sortKey(vb)
      }
      if (ka < kb) return sortDir === 'asc' ? -1 : 1
      if (ka > kb) return sortDir === 'asc' ? 1 : -1
      return 0
    })
  }, [items, sortCol, sortDir])

  const thCls = (col: string) =>
    cn('px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide cursor-pointer select-none whitespace-nowrap transition-colors',
      sortCol === col ? 'text-blue-600' : 'text-gray-500 hover:text-gray-800')

  const arrow = (col: string) =>
    sortCol === col ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ' ↕'

  const detailPath = (id: number) => entityType === 'org' ? `/org/${id}` : `/env/${id}`

  if (items.length === 0) return (
    <div className="p-6 text-sm text-gray-400 text-center">
      {entityType === 'org' ? 'Aucune organisation pour ce type.' : 'Aucun environnement pour ce type.'}
    </div>
  )

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50 sticky top-0 z-10">
            <th className={thCls('nom')} onClick={() => toggleSort('nom')}>
              Nom{arrow('nom')}
            </th>
            {propCols.map(p => (
              <th key={p.id} className={thCls(String(p.id))} onClick={() => toggleSort(String(p.id))}>
                {p.nom}{arrow(String(p.id))}
              </th>
            ))}
            <th className="px-3 py-2.5 w-8" />
          </tr>
        </thead>
        <tbody>
          {sorted.map((item, i) => {
            const valueMap = new Map((item.values ?? []).map(v => [v.prop.id, v]))
            return (
              <tr
                key={item.id}
                onClick={() => onSelect(item.id)}
                className={cn(
                  'border-b border-gray-100 hover:bg-blue-50 cursor-pointer transition-colors',
                  i % 2 === 0 ? 'bg-white' : 'bg-gray-50/60',
                )}
              >
                <td className="px-3 py-2.5 font-medium text-gray-900 whitespace-nowrap">
                  {item.nom}
                </td>
                {propCols.map(p => {
                  const v = valueMap.get(p.id)
                  const txt = v ? formatValue(v) : '—'
                  return (
                    <td key={p.id} className="px-3 py-2.5 text-gray-600 max-w-[200px] truncate">
                      {txt}
                    </td>
                  )
                })}
                <td className="px-3 py-2.5 text-center">
                  <Link
                    to={detailPath(item.id)}
                    onClick={e => e.stopPropagation()}
                    className="text-gray-300 hover:text-blue-500 transition-colors"
                    title="Voir le détail"
                  >
                    <ExternalLink size={13} />
                  </Link>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
