import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Search, Building2, Leaf, Handshake, CalendarClock } from 'lucide-react'
import { searchApi } from '@/services/api'
import { imgUrl } from '@/components/shared/ImageManager'

// ─── Types Meilisearch ───────────────────────────────────────

interface SearchHit {
  id: number
  entity_id: number
  nom: string
  description?: string
  entity_type: 'org' | 'env' | 'eng' | 'event'
  cla_nom?: string
  image_chemin?: string | null
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

const TYPE_BADGE: Record<SearchHit['entity_type'], { label: string; className: string; Icon: React.ElementType }> = {
  org:   { label: 'Organisation',   className: 'bg-blue-100 text-blue-700',     Icon: Building2 },
  env:   { label: 'Environnement',  className: 'bg-emerald-100 text-emerald-700', Icon: Leaf },
  eng:   { label: 'Engagement',     className: 'bg-violet-100 text-violet-700', Icon: Handshake },
  event: { label: 'Évènement',      className: 'bg-orange-100 text-orange-700', Icon: CalendarClock },
}

// ─── Composant : carte résultat ──────────────────────────────

interface ResultCardProps {
  hit: SearchHit
}

function ResultCard({ hit }: ResultCardProps) {
  const badge = TYPE_BADGE[hit.entity_type] ?? { label: hit.entity_type, className: 'bg-gray-100 text-gray-600', Icon: Building2 }
  const { Icon } = badge
  const formattedNom = hit._formatted?.nom
  const formattedDesc = hit._formatted?.description
  const imageUrl = hit.image_chemin ? imgUrl(hit.image_chemin) : null

  return (
    <Link
      to={`/${hit.entity_type}/${hit.entity_id}`}
      className="block p-3 bg-white border border-gray-200 rounded-lg hover:border-blue-300 hover:shadow-sm transition-all"
    >
      <div className="flex items-center gap-3">
        {/* Miniature ou icône */}
        <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0 bg-gray-100 flex items-center justify-center">
          {imageUrl ? (
            <img
              src={imageUrl}
              alt={hit.nom}
              className="w-full h-full object-cover object-center"
            />
          ) : (
            <Icon size={18} className="text-gray-400" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-0.5">
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
              className="text-xs text-gray-500 line-clamp-1 search-highlight"
              dangerouslySetInnerHTML={{ __html: formattedDesc }}
            />
          ) : hit.description ? (
            <p className="text-xs text-gray-500 line-clamp-1">{hit.description}</p>
          ) : null}
        </div>
      </div>
    </Link>
  )
}

// ─── Skeleton ────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="p-3 bg-white border border-gray-200 rounded-lg animate-pulse">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-gray-200 rounded-lg flex-shrink-0" />
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1.5">
            <div className="h-4 bg-gray-200 rounded w-1/3" />
            <div className="h-4 bg-gray-200 rounded w-16" />
          </div>
          <div className="h-3 bg-gray-100 rounded w-2/3" />
        </div>
      </div>
    </div>
  )
}

// ─── Page principale ─────────────────────────────────────────

const SEARCH_LIMIT = 20

type EntityTypeFilter = SearchHit['entity_type'] | null

const TYPE_CHIPS: { label: string; value: EntityTypeFilter }[] = [
  { label: 'Tous', value: null },
  { label: 'Organisations', value: 'org' },
  { label: 'Environnements', value: 'env' },
  { label: 'Engagements', value: 'eng' },
  { label: 'Évènements', value: 'event' },
]

export default function SearchPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const qParam = searchParams.get('q') ?? ''

  const [inputValue, setInputValue] = useState(qParam)
  const [page, setPage] = useState(1)
  const [entityType, setEntityType] = useState<EntityTypeFilter>(null)

  useEffect(() => {
    setInputValue(qParam)
    setPage(1)
    setEntityType(null)
  }, [qParam])

  const isQueryValid = qParam.trim().length >= 2
  const offset = (page - 1) * SEARCH_LIMIT

  const { data, isLoading, isError } = useQuery({
    queryKey: ['search', qParam, page, entityType],
    queryFn: () =>
      searchApi.search(qParam, {
        offset,
        limit: SEARCH_LIMIT,
        entity_type: entityType ?? undefined,
      }).then((r) => r.data as SearchResponse),
    enabled: isQueryValid,
    placeholderData: (prev) => prev,
  })

  const totalPages = data ? Math.ceil(data.estimatedTotalHits / SEARCH_LIMIT) : 0

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

        {/* ─── Filtres par type ──────────────── */}
        {isQueryValid && (
          <div className="flex items-center gap-2 flex-wrap mb-4">
            {TYPE_CHIPS.map(({ label, value }) => {
              const badge = value ? TYPE_BADGE[value] : null
              const active = entityType === value
              return (
                <button
                  key={String(value)}
                  onClick={() => { setEntityType(value); setPage(1) }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border transition-colors ${
                    active
                      ? 'bg-blue-100 text-blue-800 border-blue-200 font-medium'
                      : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  {badge && <badge.Icon size={12} />}
                  {label}
                </button>
              )
            })}
          </div>
        )}

        {/* ─── Résultats ─────────────────────── */}

        {!isQueryValid && (
          <div className="text-center text-gray-400 py-16">
            Saisissez au moins 2 caractères pour lancer une recherche.
          </div>
        )}

        {isQueryValid && isLoading && (
          <div className="space-y-2">
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </div>
        )}

        {isQueryValid && isError && (
          <div className="text-center text-red-500 py-8 bg-red-50 rounded-lg border border-red-100">
            Une erreur est survenue lors de la recherche.
          </div>
        )}

        {data && (
          <>
            <p className="text-sm text-gray-500 mb-3">
              {data.estimatedTotalHits} résultat{data.estimatedTotalHits !== 1 ? 's' : ''} pour «&nbsp;{data.query}&nbsp;»
            </p>

            {data.hits.length === 0 ? (
              <div className="text-center text-gray-400 py-16">
                Aucun résultat pour cette recherche.
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  {data.hits.map((hit) => (
                    <ResultCard key={`${hit.entity_type}-${hit.entity_id}`} hit={hit} />
                  ))}
                </div>

                {totalPages > 1 && (
                  <div className="flex items-center justify-between mt-6 text-sm text-gray-500">
                    <span>Page {page} / {totalPages}</span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        disabled={page === 1}
                        className="px-3 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 transition-colors text-sm"
                      >
                        ← Précédent
                      </button>
                      <button
                        onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                        disabled={page === totalPages}
                        className="px-3 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 transition-colors text-sm"
                      >
                        Suivant →
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </>
  )
}
