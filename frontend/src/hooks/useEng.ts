import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { engApi, eventApi } from '@/services/api'
import type { Eng, Event } from '@/types'

export function useEng(id: number) {
  return useQuery<Eng>({
    queryKey: ['eng', id],
    queryFn: async () => (await engApi.get(id)).data,
    enabled: !!id,
  })
}

export function useEvents(engId: number) {
  return useQuery<Event[]>({
    queryKey: ['event', 'list', engId],
    queryFn: async () => (await eventApi.listByEng(engId)).data,
    enabled: !!engId,
  })
}

export function useEvent(id: number) {
  return useQuery<Event>({
    queryKey: ['event', id],
    queryFn: async () => (await eventApi.get(id)).data,
    enabled: !!id,
  })
}

export function useMarkEventDone() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, date }: { id: number; date: string }) =>
      eventApi.update(id, { date_heure_reelle: date }),
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: ['event', id] })
      qc.invalidateQueries({ queryKey: ['event', 'list'] })
      qc.invalidateQueries({ queryKey: ['eng'] })
    },
  })
}
