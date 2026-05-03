import { useQuery, useMutation } from '@tanstack/react-query'
import { ragApi } from '@/services/api'

export interface LlmOption {
  id: number | null   // null = Ollama local
  nom: string
  fournisseur: string
}

export interface RagSource {
  obj_id: number
  nom: string
  entity_type: string
}

export interface RagAnswer {
  answer: string
  sources: RagSource[]
}

export function useLlms() {
  return useQuery<LlmOption[]>({
    queryKey: ['rag', 'llms'],
    queryFn: async () => (await ragApi.llms()).data,
    staleTime: 1000 * 60 * 10,
  })
}

export function useRagQuery() {
  return useMutation<RagAnswer, Error, { question: string; llm_id?: number }>({
    mutationFn: async (data) => (await ragApi.query(data)).data,
  })
}
