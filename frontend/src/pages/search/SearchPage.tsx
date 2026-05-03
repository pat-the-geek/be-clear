import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Search } from 'lucide-react'
import { searchApi } from '@/services/api'

// ─── Types Meilisearch ───────────────────────────────────────

interface SearchHit {
  id: number
  nom: string
  description?: string
  entity_type: 'org' | 'env' | 'eng' | 'event'
  cla_nom?: string
  _formatted?: {
    nom?: string
    description?: string
  }
}

interface SearchResponse {
  hits: SearchHit[]
  estimatedTotalHits: number
  query: string
}

// ─── Styles badges par type entité ──────────────────────────

const TYPE_BADGE: Record<SearchHit['entity_type'], { label: string; className: string }> = {
  org:   { label: 'Organisation',   className: 'bg-blue-100 text-blue-700' },
  env:   { label: 'Environnement',  className: 'bg-emerald-100 text-emerald-700' },
  eng:   { label: 'Engagement',     className: 'bg-violet-100 text-violet-700' },
  event: { label: 'Évènement',      className: 'bg-orange-100 text-orange-700' },
}

// ─── Composant : carte résultat ──────────────────────────────

interface ResultCardProps {
  hit: SearchHit
}

function ResultCard({ hit }: ResultCardProps) {
  const badge = TYPE_BADGE[hit.entity_type] ?? { label: hit.entity_type, className: 'bg-gray-100 text-gray-600' }
  const formattedNom = hit._formatted?.nom
  const formattedDesc = hit._formatted?.description

  return (
    <Link
      to={`/${hit.entity_type}/${hit.id}`}
      className="block p-4 bg-white border border-gray-200 rounded-lg hover:border-blue-300 hover:shadow-sm transition-all"
    >
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            {/* Nom avec highlight */}
            <p className="text-sm font-semibold text-gray-900">
              {formattedNom ? (
                <span
                  dangerouslySetInnerHTML={{ __html: formattedNom }}
                  className="search-highlight"
                />
              ) : (
                hit.nom
              )}
            </p>
            {/* Badge type */}
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${badge.className}`}>
              {badge.label}
            </span>
            {/* Badge CLA */}
            {hit.cla_nom && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                {hit.cla_nom}
              </span>
            )}
          </div>

          {/* Extrait contextuel */}
          {formattedDesc ? (
            <p
              className="text-xs text-gray-500 mt-1 line-clamp-2 search-highlight"
              dangerouslySetInnerHTML={{ __html: formattedDesc }}
            />
          ) : hit.description ? (
            <p className="text-xs text-gray-500 mt-1 line-clamp-2">{hit.description}</p>
          ) : null}
        </div>
      </div>
    </Link>
  )
}

// ─── Skeleton ────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="p-4 bg-white border border-gray-200 rounded-lg animate-pulse">
      <div className="flex items-center gap-2 mb-2">
        <div className="h-4 bg-gray-200 rounded w-1/3" />
        <div className="h-4 bg-gray-200 rounded w-16" />
      </div>
      <div className="h-3 bg-gray-100 rounded w-2/3" />
    </div>
  )
}

// ─── Page principale ─────────────────────────────────────────

export default function SearchPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const qParam = searchParams.get('q') ?? ''

  const [inputValue, setInputValue] = useState(qParam)

  // Synchronise l'input si l'URL change (navigation)
  useEffect(() => {
    setInputValue(qParam)
  }, [qParam])

  const isQueryValid = qParam.trim().length >= 2

  const { data, isLoading, isError } = useQuery({
    queryKey: ['search', qParam],
    queryFn: () => searchApi.search(qParam).then((r) => r.data as SearchResponse),
    enabled: isQueryValid,
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = inputValue.trim()
    if (trimmed.length < 2) return
    navigate(`/search?q=${encodeURIComponent(trimmed)}`)
  }

  return (
    <>
      {/* Styles highlight Meilisearch */}
      <style>{`
        .search-highlight em {
          font-style: normal;
          background: #fef08a;
          border-radius: 2px;
          padding: 0 1px;
        }
      `}</style>

      <div className="p-6 max-w-3xl mx-auto">
        {/* ─── Barre de recherche ────────────── */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Recherche</h1>
          <form onSubmit={handleSubmit} className="flex gap-2">
            <div className="relative flex-1">
              <Search
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
              />
              <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder="Rechercher une organisation, un environnement, un engagement…"
                className="w-full pl-9 pr-4 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
                autoFocus
              />
            </div>
            <button
              type="submit"
              disabled={inputValue.trim().length < 2}
              className="px-4 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-40 transition-colors"
            >
              Rechercher
            </button>
          </form>
        </div>

        {/* ─── Résultats ─────────────────────── */}

        {/* Pas encore de requête valide */}
        {!isQueryValid && (
          <div className="text-center text-gray-400 py-16">
            Saisissez au moins 2 caractères pour lancer une recherche.
          </div>
        )}

        {/* Loading */}
        {isQueryValid && isLoading && (
          <div className="space-y-3">
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </div>
        )}

        {/* Erreur */}
        {isQueryValid && isError && (
          <div className="text-center text-red-500 py-8 bg-red-50 rounded-lg border border-red-100">
            Une erreur est survenue lors de la recherche.
          </div>
        )}

        {/* Résultats */}
        {data && (
          <>
            <p className="text-sm text-gray-500 mb-4">
              {data.estimatedTotalHits} résultat{data.estimatedTotalHits !== 1 ? 's' : ''} pour «&nbsp;{data.query}&nbsp;»
            </p>

            {data.hits.length === 0 ? (
              <div className="text-center text-gray-400 py-16">
                Aucun résultat pour cette recherche.
              </div>
            ) : (
              <div className="space-y-3">
                {data.hits.map((hit) => (
                  <ResultCard key={`${hit.entity_type}-${hit.id}`} hit={hit} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </>
  )
}
