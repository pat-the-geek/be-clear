import { useQuery } from '@tanstack/react-query'
import { api } from '@/services/api'
import type { OrgBrief, EnvBrief, EngBrief } from '@/types'

interface PanelData {
  orgs: OrgBrief[]
  envs: EnvBrief[]
  engs: EngBrief[]
}

const byUpdatedAtDesc = (a: { updated_at?: string }, b: { updated_at?: string }) =>
  (b.updated_at ?? '').localeCompare(a.updated_at ?? '')

async function fetchPanel(): Promise<PanelData> {
  const [orgs, envs, engs] = await Promise.all([
    api.get<{ items: OrgBrief[] }>('/org', { params: { created_by_me: true, per_page: 50 } }),
    api.get<{ items: EnvBrief[] }>('/env', { params: { created_by_me: true, per_page: 50 } }),
    api.get<{ items: EngBrief[] }>('/eng', { params: { created_by_me: true, per_page: 50 } }),
  ])
  return {
    orgs: orgs.data.items.slice().sort(byUpdatedAtDesc),
    envs: envs.data.items.slice().sort(byUpdatedAtDesc),
    engs: engs.data.items.slice().sort(byUpdatedAtDesc),
  }
}

export function usePanel() {
  return useQuery({ queryKey: ['panel'], queryFn: fetchPanel })
}
