import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Loader2, Search, X } from 'lucide-react'
import { graphApi } from '@/services/api'
import ForceGraph, { type GNode, type GEdge } from '@/components/shared/ForceGraph'

const TYPE_COLORS: Record<string, string> = {
  org: 'bg-blue-500',
  env: 'bg-orange-500',
  eng: 'bg-amber-500',
}

const TYPE_LABELS: Record<string, string> = {
  org: 'ORG',
  env: 'ENV',
  eng: 'ENG',
}

export default function GraphPage() {
  const [search, setSearch] = useState('')
  const [hiddenTypes, setHiddenTypes] = useState<Set<string>>(new Set())

  const { data, isLoading, isError } = useQuery({
    queryKey: ['graph', 'all'],
    queryFn: () => graphApi.all().then((r) => r.data as { nodes: GNode[]; edges: GEdge[] }),
    staleTime: 1000 * 60 * 2,
  })

  const { visibleNodes, visibleEdges } = useMemo(() => {
    if (!data) return { visibleNodes: [], visibleEdges: [] }
    const visibleNodes = data.nodes.filter((n) => !hiddenTypes.has(n.type))
    const visibleIds = new Set(visibleNodes.map((n) => n.id))
    const visibleEdges = data.edges.filter((e) => visibleIds.has(e.source) && visibleIds.has(e.target))
    return { visibleNodes, visibleEdges }
  }, [data, hiddenTypes])

  function toggleType(type: string) {
    setHiddenTypes((prev) => {
      const next = new Set(prev)
      if (next.has(type)) next.delete(type)
      else next.add(type)
      return next
    })
  }

  const countByType = useMemo(() => {
    if (!data) return {}
    return data.nodes.reduce<Record<string, number>>((acc, n) => {
      acc[n.type] = (acc[n.type] ?? 0) + 1
      return acc
    }, {})
  }, [data])

  return (
    <div className="flex flex-col h-full">
      {/* ─── Barre de contrôles ────────────────────────────── */}
      <div className="shrink-0 border-b border-gray-200 bg-white px-6 py-3 flex items-center gap-4 flex-wrap">
        <div>
          <h1 className="text-base font-bold text-gray-900 leading-tight">Graphe global</h1>
          {data && (
            <p className="text-xs text-gray-400">
              {visibleNodes.length} nœud{visibleNodes.length !== 1 ? 's' : ''} · {visibleEdges.length} lien{visibleEdges.length !== 1 ? 's' : ''}
              {data.nodes.length !== visibleNodes.length && (
                <span className="text-gray-300 ml-1">({data.nodes.length} total)</span>
              )}
            </p>
          )}
        </div>

        {/* Filtres type */}
        <div className="flex items-center gap-1.5">
          {(['org', 'env', 'eng'] as const).map((type) => {
            const hidden = hiddenTypes.has(type)
            return (
              <button
                key={type}
                onClick={() => toggleType(type)}
                className={`flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-lg border transition-colors ${
                  hidden
                    ? 'bg-white text-gray-400 border-gray-200'
                    : 'border-transparent text-white'
                }`}
                style={hidden ? {} : { backgroundColor: type === 'org' ? '#3b82f6' : type === 'env' ? '#f97316' : '#f59e0b' }}
                title={hidden ? `Afficher les ${TYPE_LABELS[type]}` : `Masquer les ${TYPE_LABELS[type]}`}
              >
                <span className={`w-2 h-2 rounded-full ${hidden ? TYPE_COLORS[type] + '/40' : 'bg-white/70'}`} />
                {TYPE_LABELS[type]}
                {countByType[type] != null && (
                  <span className={hidden ? 'text-gray-400' : 'text-white/70'}>{countByType[type]}</span>
                )}
              </button>
            )
          })}
        </div>

        {/* Recherche */}
        <div className="relative ml-auto">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher un nœud…"
            className="pl-7 pr-7 py-1.5 text-xs border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 w-48"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X size={11} />
            </button>
          )}
        </div>
      </div>

      {/* ─── Graphe ────────────────────────────────────────── */}
      <div className="flex-1 overflow-hidden p-4">
        {isLoading && (
          <div className="flex items-center justify-center h-full text-gray-400 gap-2">
            <Loader2 size={20} className="animate-spin" />
            <span>Chargement du graphe…</span>
          </div>
        )}

        {isError && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">
            Erreur de chargement du graphe.
          </div>
        )}

        {data && (
          <ForceGraph
            nodes={visibleNodes}
            edges={visibleEdges}
            height={window.innerHeight - 140}
            highlightQuery={search}
          />
        )}
      </div>
    </div>
  )
}
