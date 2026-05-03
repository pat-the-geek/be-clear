import { useQuery } from '@tanstack/react-query'
import { searchApi } from '@/services/api'

export interface SearchHit {
  id: number
  nom: string
  entity_type: 'org' | 'env' | 'eng' | 'event'
  cla_nom: string
  _formatted?: {
    nom?: string
    description?: string
  }
}

export function useSearch(q: string) {
  return useQuery<SearchHit[]>({
    queryKey: ['search', q],
    queryFn: async () => (await searchApi.search(q)).data.hits,
    enabled: q.trim().length >= 2,
    staleTime: 1000 * 30,
  })
}
