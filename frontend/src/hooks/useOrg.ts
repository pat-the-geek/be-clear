import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { orgApi, torgApi } from '@/services/api'
import type { Org, Torg } from '@/types'

// ─── Arbre TORG ─────────────────────────────────────────────
export function useTorgTree() {
  return useQuery<Torg[]>({
    queryKey: ['torg', 'tree'],
    queryFn: async () => (await torgApi.tree()).data,
    staleTime: 1000 * 60 * 60, // 1h — l'arbre change rarement
  })
}

// ─── Liste ORG ───────────────────────────────────────────────
export function useOrgList(params?: { torg_id?: number; page?: number }) {
  return useQuery({
    queryKey: ['org', 'list', params],
    queryFn: async () => (await orgApi.list(params)).data,
  })
}

// ─── Détail ORG ──────────────────────────────────────────────
export function useOrg(id: number) {
  return useQuery<Org>({
    queryKey: ['org', id],
    queryFn: async () => (await orgApi.get(id)).data,
    enabled: !!id,
  })
}

// ─── Mutations ───────────────────────────────────────────────
export function useDeleteOrg() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => orgApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['org'] }),
  })
}
