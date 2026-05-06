import { useQuery } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { graphApi } from '@/services/api'
import ForceGraph, { type GNode, type GEdge } from '@/components/shared/ForceGraph'

export default function GraphPage() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['graph', 'all'],
    queryFn: () => graphApi.all().then((r) => r.data as { nodes: GNode[]; edges: GEdge[] }),
    staleTime: 1000 * 60 * 2,
  })

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Graphe global</h1>
        <p className="text-sm text-gray-400 mt-0.5">
          Toutes les relations ORG ↔ ENG ↔ ENV
        </p>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-20 text-gray-400 gap-2">
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
          nodes={data.nodes}
          edges={data.edges}
          height={600}
        />
      )}
    </div>
  )
}
