import type { Value } from '@/types'
import { formatDate, formatDateTime } from '@/lib/utils'

interface Props {
  values: Value[]
}

function formatValue(v: Value): string {
  const type = v.prop.type
  if (v.valeur_bool !== undefined && v.valeur_bool !== null) {
    return v.valeur_bool ? 'Oui' : 'Non'
  }
  if (v.valeur_date) {
    if (type === 'DATE') return formatDate(v.valeur_date)
    if (type === 'HEURE') return new Date(v.valeur_date).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
    return formatDateTime(v.valeur_date)
  }
  if (v.valeur_nombre !== undefined && v.valeur_nombre !== null) {
    if (type === 'POURCENTAGE') return `${v.valeur_nombre} %`
    if (type === 'MONTANT' && v.valeur_json) {
      const j = v.valeur_json as { valeur?: number; devise?: string }
      return `CHF ${j.valeur ?? v.valeur_nombre}`
    }
    return String(v.valeur_nombre)
  }
  if (v.valeur_json) {
    if (type === 'DUREE') {
      const j = v.valeur_json as { valeur?: number; unite?: string }
      return `${j.valeur ?? ''} ${j.unite ?? ''}`.trim()
    }
    if (type === 'COORDONNEES') {
      const j = v.valeur_json as { lat?: number; lng?: number }
      return `${j.lat ?? ''}, ${j.lng ?? ''}`
    }
    return JSON.stringify(v.valeur_json)
  }
  if (v.valeur_texte) {
    if (type === 'URL') return v.valeur_texte  // rendu spécial ci-dessous
    return v.valeur_texte
  }
  return '—'
}

export default function PropValueTable({ values }: Props) {
  if (!values.length) return <p className="text-sm text-gray-400">Aucune propriété.</p>

  return (
    <table className="w-full text-sm">
      <tbody>
        {values.map((v) => (
          <tr key={v.id} className="border-b border-gray-100 last:border-0">
            <td className="py-2 pr-4 text-gray-500 font-medium w-1/3">{v.prop.nom}</td>
            <td className="py-2 text-gray-900">
              {v.prop.type === 'URL' && v.valeur_texte ? (
                <a
                  href={v.valeur_texte}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline break-all"
                >
                  {v.valeur_texte}
                </a>
              ) : v.prop.type === 'EMAIL' && v.valeur_texte ? (
                <a href={`mailto:${v.valeur_texte}`} className="text-blue-600 hover:underline">
                  {v.valeur_texte}
                </a>
              ) : v.prop.type === 'TELEPHONE' && v.valeur_texte ? (
                <a href={`tel:${v.valeur_texte}`} className="text-blue-600 hover:underline">
                  {v.valeur_texte}
                </a>
              ) : v.prop.type === 'MARKDOWN' && v.valeur_texte ? (
                <span className="text-gray-500 italic">[Markdown]</span>
              ) : (
                formatValue(v)
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
