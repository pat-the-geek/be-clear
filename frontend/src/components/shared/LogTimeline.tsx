import { useQuery } from '@tanstack/react-query'
import { logApi } from '@/services/api'
import { formatDateTime } from '@/lib/utils'

interface LogEntry {
  id: number
  horodatage: string
  user_nom?: string | null
  operation: string
  table_name: string
  entite_id?: number | null
}

interface LogTimelineProps {
  tableName: string
  entiteId: number
}

const OP_STYLE: Record<string, string> = {
  INSERT: 'bg-green-100 text-green-700 border-green-200',
  UPDATE: 'bg-blue-100 text-blue-700 border-blue-200',
  DELETE: 'bg-red-100 text-red-700 border-red-200',
}

const OP_LABEL: Record<string, string> = {
  INSERT: 'Création',
  UPDATE: 'Modification',
  DELETE: 'Suppression',
}

const OP_DOT: Record<string, string> = {
  INSERT: 'bg-green-400',
  UPDATE: 'bg-blue-400',
  DELETE: 'bg-red-400',
}

export default function LogTimeline({ tableName, entiteId }: LogTimelineProps) {
  const { data, isLoading } = useQuery({
    queryKey: ['log', tableName, entiteId],
    queryFn: () =>
      logApi.list({ table_name: tableName, entite_id: entiteId, per_page: 10 })
        .then((r) => r.data as { items: LogEntry[]; total: number }),
  })

  if (isLoading) return <div className="text-xs text-gray-400 py-2">Chargement…</div>
  if (!data?.items?.length) return <div className="text-xs text-gray-400 py-2">Aucune entrée dans le journal.</div>

  return (
    <div className="relative pl-5">
      <div className="absolute left-2 top-1 bottom-1 w-px bg-gray-200" />
      <div className="space-y-4">
        {data.items.map((log) => {
          const dotClass = OP_DOT[log.operation] ?? 'bg-gray-400'
          const badgeClass = OP_STYLE[log.operation] ?? 'bg-gray-100 text-gray-600 border-gray-200'
          const label = OP_LABEL[log.operation] ?? log.operation
          return (
            <div key={log.id} className="relative flex items-start gap-3">
              <div className={`absolute -left-3 top-1.5 w-2.5 h-2.5 rounded-full border-2 border-white ${dotClass}`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`inline-flex items-center px-1.5 py-0.5 rounded border text-[11px] font-medium ${badgeClass}`}>
                    {label}
                  </span>
                  <span className="text-xs text-gray-400">{formatDateTime(log.horodatage)}</span>
                  {log.user_nom && (
                    <span className="text-xs text-gray-500 font-medium">{log.user_nom}</span>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
      {data.total > 10 && (
        <p className="text-[11px] text-gray-400 mt-3 pl-0">
          et {data.total - 10} autre(s) entrée(s)…
        </p>
      )}
    </div>
  )
}
