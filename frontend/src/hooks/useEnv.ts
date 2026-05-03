import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { envApi, tenvApi } from '@/services/api'
import type { Env, Tenv } from '@/types'

// ─── Arbre TENV ─────────────────────────────────────────────
export function useTenvTree() {
  return useQuery<Tenv[]>({
    queryKey: ['tenv', 'tree'],
    queryFn: async () => (await tenvApi.tree()).data,
    staleTime: 1000 * 60 * 60, // 1h — l'arbre change rarement
  })
}

// ─── Liste ENV ───────────────────────────────────────────────
export function useEnvList(params?: { tenv_id?: number; page?: number }) {
  return useQuery({
    queryKey: ['env', 'list', params],
    queryFn: async () => (await envApi.list(params)).data,
  })
}

// ─── Détail ENV ──────────────────────────────────────────────
export function useEnv(id: number) {
  return useQuery<Env>({
    queryKey: ['env', id],
    queryFn: async () => (await envApi.get(id)).data,
    enabled: !!id,
  })
}

// ─── Mutations ───────────────────────────────────────────────
export function useDeleteEnv() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => envApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['env'] }),
  })
}
