import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { claApi, api } from '@/services/api'
import type { Cla } from '@/types'

// ─── CONFIG ─────────────────────────────────────────────────
export function useConfig() {
  return useQuery({
    queryKey: ['config'],
    queryFn: async () => (await api.get('/config')).data,
  })
}

export function useUpdateConfig() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: unknown) => api.put('/config', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['config'] }),
  })
}

// ─── LLM ─────────────────────────────────────────────────────
export function useLlmConfigs() {
  return useQuery({
    queryKey: ['config', 'llm'],
    queryFn: async () => (await api.get('/config/llm')).data,
  })
}

// ─── CLA ─────────────────────────────────────────────────────
export function useClaList() {
  return useQuery<Cla[]>({
    queryKey: ['cla', 'list'],
    queryFn: async () => (await claApi.list()).data,
  })
}

export function useCla(id: number) {
  return useQuery<Cla>({
    queryKey: ['cla', id],
    queryFn: async () => (await claApi.get(id)).data,
    enabled: !!id,
  })
}

// ─── USERS ───────────────────────────────────────────────────
export function useUserList(page = 1) {
  return useQuery({
    queryKey: ['user', 'list', page],
    queryFn: async () => (await api.get('/user', { params: { page, per_page: 30 } })).data,
  })
}

// ─── LOG ─────────────────────────────────────────────────────
export function useLog(params?: { table_name?: string; operation?: string; page?: number }) {
  return useQuery({
    queryKey: ['log', params],
    queryFn: async () => (await api.get('/log', { params })).data,
  })
}
