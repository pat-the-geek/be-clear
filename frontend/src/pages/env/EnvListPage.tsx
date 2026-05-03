import { useState, useRef, useEffect, useMemo } from 'react'
import { useNavigate, Link, useSearchParams } from 'react-router-dom'
import { useInfiniteQuery, useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Plus, Search, Server, ChevronRight, ChevronDown, ExternalLink, Loader2, X } from 'lucide-react'
import { tenvApi, envApi, engApi, tengApi } from '@/services/api'
import { useAuthStore } from '@/stores/authStore'
import { Modal } from '@/components/shared/Modal'
import { cn } from '@/lib/utils'
import { formatDate } from '@/lib/utils'
import { useDebounce } from '@/hooks/useDebounce'
import type { Tenv, EnvBrief, EngBrief, Teng, PaginatedResponse } from '@/types'
import SmartImage from '@/components/shared/SmartImage'
import { imgUrl } from '@/components/shared/ImageManager'

function flattenTenv(nodes: Tenv[]): Tenv[] {
  return nodes.flatMap(n => [n, ...flattenTenv(n.enfants ?? [])])
}

// ─── Schéma création ENG ────────────────────────────────────

const today = () => new Date().toISOString().slice(0, 10)

const createEngSchema = z.object({
  nom: z.string().min(1, 'Nom requis'),
  teng_id: z.coerce.number().min(1, "Type d'engagement requis"),
  date_debut: z.string().optional(),
  date_debut_prevue: z.string().optional(),
  date_fin_prevue: z.preprocess(v => (v === '' ? undefined : v), z.string().optional()),
  description: z.string().optional(),
})
type CreateEngForm = z.infer<typeof createEngSchema>

// ─── Composant nœud arbre TENV ───────────────────────────────

interface TenvNodeProps {
  node: Tenv
  depth: number
  selectedId: number | null
  onSelect: (id: number) => void
  onCreateChildType: (parentId: number) => void
}

function TenvNode({ node, depth, selectedId, onSelect, onCreateChildType }: TenvNodeProps) {
  const hasChildren = (node.enfants ?? []).length > 0
  const [open, setOpen] = useState(true)
  const isSelected = selectedId === node.id

  return (
    <div>
      <div className="group flex items-center pr-1">
        <button
          onClick={() => { onSelect(node.id); if (hasChildren) setOpen(o => !o) }}
          className={cn(
            'flex-1 flex items-center gap-1.5 py-1.5 rounded-md text-left text-sm transition-colors min-w-0',
            isSelected ? 'bg-orange-100 text-orange-800 font-medium' : 'text-gray-700 hover:bg-gray-100',
          )}
          style={{ paddingLeft: `${8 + depth * 14}px`, paddingRight: '6px' }}
        >
          {hasChildren
            ? open
              ? <ChevronDown size={13} className="shrink-0 text-gray-400" />
              : <ChevronRight size={13} className="shrink-0 text-gray-400" />
            : <span className="w-3.5 shrink-0" />}
          <span className="truncate">{node.nom}</span>
        </button>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onCreateChildType(node.id) }}
          className="opacity-0 group-hover:opacity-100 shrink-0 p-0.5 rounded text-gray-400 hover:text-orange-600 hover:bg-orange-50 transition-all"
          title={`Créer un sous-type de ${node.nom}`}
        >
          <Plus size={12} />
        </button>
      </div>
      {hasChildren && open && (node.enfants ?? []).map(child => (
        <TenvNode key={child.id} node={child} depth={depth + 1} selectedId={selectedId} onSelect={onSelect} onCreateChildType={onCreateChildType} />
      ))}
    </div>
  )
}

// ─── Composant tableau ENGs (infinite scroll) ────────────────

function EngTable({ envId }: { envId: number }) {
  const sentinelRef = useRef<HTMLDivElement>(null)
  const [sortBy, setSortBy] = useState('nom')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  const toggleSort = (col: string) => {
    if (sortBy === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortBy(col); setSortDir('asc') }
  }

  const {
    data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading,
  } = useInfiniteQuery({
    queryKey: ['engs', 'env', envId, sortBy, sortDir],
    queryFn: ({ pageParam = 1 }) =>
      engApi.list({ env_id: envId, per_page: 50, page: pageParam, sort_by: sortBy, sort_dir: sortDir })
        .then(r => r.data as PaginatedResponse<EngBrief>),
    getNextPageParam: (lastPage, allPages) => {
      const loaded = allPages.reduce((s, p) => s + p.items.length, 0)
      return loaded < lastPage.total ? allPages.length + 1 : undefined
    },
    initialPageParam: 1,
  })

  const engs = useMemo(() => data?.pages.flatMap(p => p.items) ?? [], [data])
  const total = data?.pages[0]?.total ?? 0

  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const observer = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) fetchNextPage()
    }, { threshold: 0.1 })
    observer.observe(el)
    return () => observer.disconnect()
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  const th = (col: string, label: string, align: 'left' | 'center' = 'left') => {
    const active = sortBy === col
    return (
      <th
        onClick={() => toggleSort(col)}
        className={cn(
          'px-4 py-2.5 text-xs font-semibold uppercase tracking-wide cursor-pointer select-none transition-colors whitespace-nowrap',
          `text-${align}`,
          active ? 'text-orange-600' : 'text-gray-500 hover:text-gray-800',
        )}
      >
        <span className="inline-flex items-center gap-1">
          {label}
          <span className={active ? 'opacity-100' : 'opacity-25'}>
            {active ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}
          </span>
        </span>
      </th>
    )
  }

  if (isLoading) return <div className="p-6 text-sm text-gray-400 text-center">Chargement…</div>
  if (engs.length === 0) return (
    <div className="p-6 text-sm text-gray-400 text-center">Aucun engagement lié à cet environnement.</div>
  )

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50 sticky top-0 z-10">
              {th('nom', 'Nom')}
              {th('teng', 'Type')}
              {th('date_debut_prevue', 'Début prévu')}
              {th('date_fin_prevue', 'Fin prévue')}
              {th('date_debut', 'Début réel')}
              {th('date_fin', 'Fin réelle')}
              {th('accomplissement', 'Avancement', 'center')}
              {th('nb_events', 'Évts', 'center')}
              <th className="px-2 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {engs.map((eng, i) => {
              const pct = eng.accomplissement
              return (
                <tr key={eng.id} className={cn('border-b border-amber-100 hover:bg-amber-100/60 transition-colors', i % 2 === 0 ? 'bg-amber-50/30' : 'bg-amber-50/60')}>
                  <td className="px-4 py-2.5 font-medium text-gray-900 whitespace-nowrap">{eng.nom}</td>
                  <td className="px-4 py-2.5 whitespace-nowrap"><span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-700">{eng.teng.nom}</span></td>
                  <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">{eng.date_debut_prevue ? formatDate(eng.date_debut_prevue) : '—'}</td>
                  <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">{eng.date_fin_prevue ? formatDate(eng.date_fin_prevue) : '—'}</td>
                  <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">{eng.date_debut ? formatDate(eng.date_debut) : '—'}</td>
                  <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">{eng.date_fin ? formatDate(eng.date_fin) : '—'}</td>
                  <td className="px-4 py-2.5 text-center">
                    {pct != null ? (
                      <span className={cn('inline-block px-2 py-0.5 rounded-full text-xs font-medium',
                        pct >= 100 ? 'bg-green-100 text-green-700' : pct > 0 ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600')}>
                        {pct}%
                      </span>
                    ) : '—'}
                  </td>
                  <td className="px-4 py-2.5 text-center text-gray-500">{eng.nb_events ?? 0}</td>
                  <td className="px-2 py-2.5">
                    <Link to={`/eng/${eng.id}`} className="text-gray-300 hover:text-orange-500 transition-colors">
                      <ExternalLink size={14} />
                    </Link>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div ref={sentinelRef} className="py-3 text-center text-xs text-gray-400">
        {isFetchingNextPage && <Loader2 size={14} className="inline animate-spin mr-1" />}
        {isFetchingNextPage ? 'Chargement…' : hasNextPage ? '' : `${engs.length} / ${total} engagement${total !== 1 ? 's' : ''}`}
      </div>
    </div>
  )
}

// ─── Page ────────────────────────────────────────────────────

export default function EnvListPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const isEditeur = useAuthStore((s) => s.isEditeur)

  const isAdmin = useAuthStore((s) => s.isAdmin())
  const [searchParams, setSearchParams] = useSearchParams()
  const [selectedTenvId, setSelectedTenvId] = useState<number | null>(
    () => searchParams.get('tenv') ? Number(searchParams.get('tenv')) : null
  )
  const [selectedEnvId, setSelectedEnvId] = useState<number | null>(
    () => searchParams.get('env') ? Number(searchParams.get('env')) : null
  )
  const [search, setSearch] = useState<string>(() => searchParams.get('q') ?? '')
  const [showCreateEng, setShowCreateEng] = useState(false)
  const [showCreateTenv, setShowCreateTenv] = useState(false)
  const [newTenvNom, setNewTenvNom] = useState('')
  const [newTenvParentId, setNewTenvParentId] = useState<number | null>(null)

  const debouncedSearch = useDebounce(search, 300)

  // Sync state → URL (replace so each filter change doesn't create a history entry)
  useEffect(() => {
    const p = new URLSearchParams()
    if (selectedTenvId != null) p.set('tenv', String(selectedTenvId))
    if (selectedEnvId != null) p.set('env', String(selectedEnvId))
    if (debouncedSearch) p.set('q', debouncedSearch)
    setSearchParams(p, { replace: true })
  }, [selectedTenvId, selectedEnvId, debouncedSearch]) // eslint-disable-line react-hooks/exhaustive-deps

  const engForm = useForm<CreateEngForm>({
    resolver: zodResolver(createEngSchema),
    defaultValues: { teng_id: 0 },
  })

  // ─── Données ────────────────────────────────────────────────

  const { data: tengList } = useQuery({
    queryKey: ['teng', 'list'],
    queryFn: () => tengApi.list().then(r => r.data as Teng[]),
  })

  const { data: tenvTree } = useQuery({
    queryKey: ['tenv', 'tree'],
    queryFn: () => tenvApi.tree().then((r) => r.data as Tenv[]),
  })

  // ─── Liste ENV : infinite query + recherche serveur ─────────

  const {
    data: envsData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
  } = useInfiniteQuery({
    queryKey: ['envs', selectedTenvId, debouncedSearch],
    queryFn: ({ pageParam = 1 }) =>
      envApi.list({
        tenv_id: selectedTenvId ?? undefined,
        q: debouncedSearch.trim() || undefined,
        per_page: 50,
        page: pageParam,
      }).then(r => r.data as PaginatedResponse<EnvBrief>),
    getNextPageParam: (lastPage, allPages) => {
      const loaded = allPages.reduce((s, p) => s + p.items.length, 0)
      return loaded < lastPage.total ? allPages.length + 1 : undefined
    },
    initialPageParam: 1,
  })

  const allEnvs = useMemo(() => envsData?.pages.flatMap(p => p.items) ?? [], [envsData])
  const total = envsData?.pages[0]?.total ?? 0
  const selectedEnv = useMemo(() => allEnvs.find(e => e.id === selectedEnvId), [allEnvs, selectedEnvId])

  // ─── Virtualisation de la liste ─────────────────────────────

  const scrollRef = useRef<HTMLDivElement>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)

  const rowVirtualizer = useVirtualizer({
    count: allEnvs.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 52,
    overscan: 5,
  })

  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const observer = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) fetchNextPage()
    }, { threshold: 0.1 })
    observer.observe(el)
    return () => observer.disconnect()
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  // Reset sélection si le TENV ou la recherche change (skip on mount to preserve URL-restored state)
  const isMountedRef = useRef(false)
  useEffect(() => {
    if (!isMountedRef.current) { isMountedRef.current = true; return }
    setSelectedEnvId(null)
  }, [selectedTenvId, debouncedSearch])

  // ─── Mutations ───────────────────────────────────────────────

  const createEngMutation = useMutation({
    mutationFn: async (data: CreateEngForm) => {
      const teng = (tengList ?? []).find(t => t.id === data.teng_id)
      if (!teng) throw new Error('TENG introuvable')
      return engApi.create({
        nom: data.nom,
        teng_id: data.teng_id,
        cla_id: teng.cla.id,
        org_ids: [],
        env_ids: [selectedEnvId!],
        date_debut: data.date_debut || undefined,
        date_debut_prevue: data.date_debut_prevue || undefined,
        date_fin_prevue: data.date_fin_prevue || undefined,
        description: data.description || undefined,
        values: [],
      })
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['engs', 'env', selectedEnvId] })
      setShowCreateEng(false)
      engForm.reset()
      navigate(`/eng/${res.data.id}`)
    },
  })

  const createTenvMutation = useMutation({
    mutationFn: ({ nom, parent_id }: { nom: string; parent_id?: number }) =>
      tenvApi.create({ nom, parent_id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenv'] })
      setShowCreateTenv(false)
      setNewTenvNom('')
      setNewTenvParentId(null)
    },
  })

  return (
    <div className="flex h-full">

      {/* ═══ Colonne 1 : arborescence TENV ═══════════════════ */}
      <aside className="w-52 shrink-0 border-r border-gray-200 bg-white flex flex-col">
        <div className="px-3 py-3 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Types</h2>
          {isAdmin && (
            <button
              type="button"
              onClick={() => { setNewTenvNom(''); setNewTenvParentId(null); setShowCreateTenv(true) }}
              className="p-0.5 rounded text-gray-400 hover:text-orange-600 hover:bg-orange-50 transition-colors"
              title="Nouveau type d'environnement"
            >
              <Plus size={14} />
            </button>
          )}
        </div>
        <div className="flex-1 overflow-y-auto py-1 px-1">
          <button
            onClick={() => setSelectedTenvId(null)}
            className={cn(
              'w-full flex items-center gap-1.5 px-2 py-1.5 rounded-md text-left text-sm transition-colors mb-0.5',
              selectedTenvId === null ? 'bg-orange-100 text-orange-800 font-medium' : 'text-gray-700 hover:bg-gray-100',
            )}
          >
            <span className="w-3.5 shrink-0" />
            <span>Tous</span>
          </button>
          {(tenvTree ?? []).map(node => (
            <TenvNode
              key={node.id} node={node} depth={0}
              selectedId={selectedTenvId} onSelect={setSelectedTenvId}
              onCreateChildType={(parentId) => { setNewTenvNom(''); setNewTenvParentId(parentId); setShowCreateTenv(true) }}
            />
          ))}
        </div>
      </aside>

      {/* ═══ Colonne 2 : liste virtualisée des ENV ════════════ */}
      <aside className="w-64 shrink-0 border-r border-gray-200 bg-white flex flex-col">
        <div className="px-4 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Environnements</h2>
          {isEditeur() && (
            <button
              onClick={() => navigate('/env/new')}
              title="Nouvel environnement"
              className="text-gray-400 hover:text-orange-600 transition-colors"
            >
              <Plus size={16} />
            </button>
          )}
        </div>

        <div className="px-3 py-2 border-b border-gray-100">
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Rechercher…"
              className="w-full pl-8 pr-3 py-1.5 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>
        </div>

        {/* Liste virtualisée */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto">
          {isLoading && <p className="text-xs text-gray-400 text-center py-6">Chargement…</p>}
          {!isLoading && allEnvs.length === 0 && (
            <p className="text-xs text-gray-400 text-center py-6">
              {search ? 'Aucun résultat.' : 'Aucun environnement.'}
            </p>
          )}
          {allEnvs.length > 0 && (
            <div style={{ height: rowVirtualizer.getTotalSize(), position: 'relative' }}>
              {rowVirtualizer.getVirtualItems().map(vItem => {
                const env = allEnvs[vItem.index]
                return (
                  <div
                    key={env.id}
                    style={{ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${vItem.start}px)` }}
                  >
                    <button
                      onClick={() => setSelectedEnvId(env.id)}
                      className={cn(
                        'w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors',
                        selectedEnvId === env.id
                          ? 'bg-orange-100 border-r-2 border-orange-500'
                          : 'bg-orange-50/50 hover:bg-orange-50',
                      )}
                    >
                      {env.image_principale ? (
                        <SmartImage src={imgUrl(env.image_principale.chemin)} alt="" className="w-8 h-8 rounded-lg object-cover shrink-0 border border-gray-200" cropWidth={32} cropHeight={32} />
                      ) : (
                        <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border', selectedEnvId === env.id ? 'bg-orange-200 border-orange-300' : 'bg-orange-100 border-orange-200')}>
                          <Server size={14} className={selectedEnvId === env.id ? 'text-orange-500' : 'text-gray-400'} />
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className={cn('text-sm truncate', selectedEnvId === env.id ? 'font-medium text-orange-700' : 'text-gray-800')}>{env.nom}</p>
                        <p className="text-xs text-gray-400 truncate">{env.tenv.nom}</p>
                      </div>
                    </button>
                  </div>
                )
              })}
            </div>
          )}

          {/* Sentinel infinite scroll */}
          <div ref={sentinelRef} className="py-2 flex justify-center">
            {isFetchingNextPage && <Loader2 size={14} className="animate-spin text-gray-400" />}
          </div>
        </div>

        <div className="px-4 py-2 border-t border-gray-100 text-xs text-gray-400">
          {allEnvs.length} / {total} environnement{total !== 1 ? 's' : ''}
        </div>
      </aside>

      {/* ═══ Colonne 3 : ENGs de l'ENV sélectionné ═══════════ */}
      <div className="flex-1 overflow-y-auto bg-white">
        {selectedEnv ? (
          <div className="flex flex-col h-full">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between shrink-0">
              <div>
                <h2 className="text-base font-semibold text-gray-900">{selectedEnv.nom}</h2>
                <p className="text-xs text-gray-400 mt-0.5">{selectedEnv.tenv.nom}</p>
              </div>
              <Link
                to={`/env/${selectedEnv.id}`}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <ExternalLink size={13} />
                Détail
              </Link>
            </div>
            <div className="flex-1 overflow-y-auto">
              <div className="px-6 py-3 border-b border-gray-100 flex items-center justify-between">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Engagements</h3>
                {isEditeur() && (
                  <button
                    onClick={() => { engForm.reset({ teng_id: 0, date_debut: today(), date_debut_prevue: today() }); setShowCreateEng(true) }}
                    title="Nouvel engagement"
                    className="text-gray-400 hover:text-orange-600 transition-colors"
                  >
                    <Plus size={15} />
                  </button>
                )}
              </div>
              <EngTable envId={selectedEnv.id} />
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center text-gray-400 gap-3">
            <Server size={40} className="text-gray-200" />
            <p className="text-sm">Sélectionne un environnement</p>
          </div>
        )}
      </div>

      {/* ═══ Modal création ENG ════════════════════════════════ */}
      <Modal open={showCreateEng} onClose={() => { setShowCreateEng(false); engForm.reset() }} title={`Nouvel engagement — ${selectedEnv?.nom ?? ''}`}>
        <form onSubmit={engForm.handleSubmit(d => createEngMutation.mutate(d))} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nom *</label>
            <input {...engForm.register('nom')} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" placeholder="Nom de l'engagement" />
            {engForm.formState.errors.nom && <p className="text-red-500 text-xs mt-1">{engForm.formState.errors.nom.message}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Type d'engagement *</label>
            <select {...engForm.register('teng_id')} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500">
              <option value={0}>— Sélectionner —</option>
              {(tengList ?? []).map(t => <option key={t.id} value={t.id}>{t.nom}</option>)}
            </select>
            {engForm.formState.errors.teng_id && <p className="text-red-500 text-xs mt-1">{engForm.formState.errors.teng_id.message}</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Début réel</label>
              <input type="date" {...engForm.register('date_debut')} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Début prévu</label>
              <input type="date" {...engForm.register('date_debut_prevue')} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Fin prévue <span className="text-gray-400 font-normal">(optionnel)</span></label>
            <div className="flex items-center gap-2">
              <input type="date" {...engForm.register('date_fin_prevue')} className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
              {engForm.watch('date_fin_prevue') && (
                <button type="button" onClick={() => engForm.setValue('date_fin_prevue', '')} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-md hover:bg-gray-100 transition-colors" title="Effacer">
                  <X size={14} />
                </button>
              )}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description <span className="text-gray-400 font-normal">(Markdown)</span></label>
            <textarea {...engForm.register('description')} rows={4} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 resize-y font-mono" placeholder="# Titre&#10;&#10;Description en Markdown…" />
          </div>
          {createEngMutation.isError && (
            <p className="text-red-500 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {(createEngMutation.error as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? 'Erreur lors de la création.'}
            </p>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => { setShowCreateEng(false); engForm.reset(); createEngMutation.reset() }} className="px-4 py-2 text-sm text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">Annuler</button>
            <button type="submit" disabled={createEngMutation.isPending || createEngMutation.isSuccess} className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-orange-600 rounded-lg hover:bg-orange-700 disabled:opacity-50 transition-colors">
              {createEngMutation.isPending && <Loader2 size={14} className="animate-spin" />}
              {createEngMutation.isPending ? 'Création…' : 'Créer'}
            </button>
          </div>
        </form>
      </Modal>

      {/* ═══ Modal création TENV ══════════════════════════════ */}
      <Modal
        open={showCreateTenv}
        onClose={() => { setShowCreateTenv(false); setNewTenvParentId(null) }}
        title={newTenvParentId
          ? `Sous-type — ${flattenTenv(tenvTree ?? []).find(t => t.id === newTenvParentId)?.nom ?? ''}`
          : "Nouveau type d'environnement"}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (newTenvNom.trim()) createTenvMutation.mutate({
              nom: newTenvNom.trim(),
              parent_id: newTenvParentId ?? undefined,
            })
          }}
          className="space-y-4"
        >
          {newTenvParentId && (
            <p className="text-xs text-orange-700 bg-orange-50 border border-orange-100 rounded-lg px-3 py-2">
              Ce type sera créé comme sous-type de <strong>{flattenTenv(tenvTree ?? []).find(t => t.id === newTenvParentId)?.nom}</strong>.
            </p>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nom *</label>
            <input
              value={newTenvNom}
              onChange={e => setNewTenvNom(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
              placeholder="Nom du type d'environnement"
              autoFocus
            />
            <p className="text-xs text-gray-400 mt-1">Une classe du même nom sera créée automatiquement.</p>
          </div>
          {createTenvMutation.isError && <p className="text-red-500 text-sm">Erreur lors de la création.</p>}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => { setShowCreateTenv(false); setNewTenvParentId(null) }} className="px-4 py-2 text-sm text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50">Annuler</button>
            <button type="submit" disabled={!newTenvNom.trim() || createTenvMutation.isPending} className="px-4 py-2 text-sm font-medium text-white bg-orange-600 rounded-lg hover:bg-orange-700 disabled:opacity-50">
              {createTenvMutation.isPending ? 'Création…' : 'Créer'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
