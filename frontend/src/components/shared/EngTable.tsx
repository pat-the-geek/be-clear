/**
 * EngTable — tableau virtualisé des engagements
 *
 * • useInfiniteQuery : chargement page par page (50 par page)
 * • useVirtualizer   : rendu virtuel des lignes (hautes performances)
 * • Colonnes triables par clic sur l'en-tête
 * • IntersectionObserver : déclenchement de la page suivante au scroll
 */
import { useState, useRef, useEffect, useCallback } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import { useVirtualizer } from '@tanstack/react-virtual'
import { Link } from 'react-router-dom'
import { ChevronUp, ChevronDown, ChevronsUpDown, ExternalLink, Loader2 } from 'lucide-react'
import { engApi } from '@/services/api'
import { formatDate, formatDateTime } from '@/lib/utils'
import type { EngBrief, PaginatedResponse } from '@/types'

// ─── Types ────────────────────────────────────────────────────

type SortDir = 'asc' | 'desc'
type SortBy =
  | 'nom' | 'teng'
  | 'date_debut_prevue' | 'date_fin_prevue'
  | 'date_debut' | 'date_fin'
  | 'accomplissement' | 'nb_events'
  | 'created_at' | 'updated_at'

interface Column {
  key: string
  sortKey?: SortBy    // défini = triable ; absent = non-triable
  label: string
  minWidth: number    // px
  align?: 'right'
}

const COLUMNS: Column[] = [
  { key: 'nom',               sortKey: 'nom',               label: 'Nom',          minWidth: 200 },
  { key: 'teng',              sortKey: 'teng',              label: 'Type',         minWidth: 130 },
  { key: 'org_principale',                                  label: 'ORG princ.',   minWidth: 130 },
  { key: 'env_principale',                                  label: 'ENV princ.',   minWidth: 130 },
  { key: 'date_debut_prevue', sortKey: 'date_debut_prevue', label: 'Début prévu',  minWidth: 110 },
  { key: 'date_fin_prevue',   sortKey: 'date_fin_prevue',   label: 'Fin prévue',   minWidth: 110 },
  { key: 'date_debut',        sortKey: 'date_debut',        label: 'Début réel',   minWidth: 110 },
  { key: 'date_fin',          sortKey: 'date_fin',          label: 'Fin réelle',   minWidth: 110 },
  { key: 'accomplissement',   sortKey: 'accomplissement',   label: 'Avancement',   minWidth: 120, align: 'right' },
  { key: 'nb_events',         sortKey: 'nb_events',         label: 'Évts',         minWidth: 60,  align: 'right' },
  { key: 'created_at',        sortKey: 'created_at',        label: 'Créé le',      minWidth: 150 },
  { key: 'updated_at',        sortKey: 'updated_at',        label: 'Modifié le',   minWidth: 150 },
]
const COL_COUNT = COLUMNS.length
const PER_PAGE = 50

// ─── Icône de tri ─────────────────────────────────────────────

function SortIcon({ col, sortBy, sortDir }: { col: SortBy; sortBy: SortBy; sortDir: SortDir }) {
  if (col !== sortBy) return <ChevronsUpDown size={12} className="text-gray-300 ml-1 shrink-0" />
  return sortDir === 'asc'
    ? <ChevronUp size={12} className="text-amber-600 ml-1 shrink-0" />
    : <ChevronDown size={12} className="text-amber-600 ml-1 shrink-0" />
}

function StaticTag({ value }: { value?: string | null }) {
  if (!value) return <span className="text-gray-300">—</span>
  return (
    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600 max-w-[120px] truncate">
      {value}
    </span>
  )
}

// ─── Cellule Avancement ───────────────────────────────────────

function ProgressCell({ value }: { value?: number }) {
  if (value === undefined || value === null) return <span className="text-gray-300">—</span>
  const pct = Math.round(value)
  const color = pct >= 100 ? 'bg-green-500' : pct > 0 ? 'bg-amber-400' : 'bg-gray-200'
  return (
    <div className="flex items-center gap-2 justify-end">
      <div className="w-16 h-1.5 rounded-full bg-gray-100 overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
      <span className="text-xs tabular-nums w-8 text-right text-gray-700">{pct}%</span>
    </div>
  )
}

// ─── Ligne du tableau ─────────────────────────────────────────

function EngRow({ eng }: { eng: EngBrief }) {
  return (
    <tr className="hover:bg-amber-50 transition-colors border-b border-gray-100 last:border-0">
      {/* Nom */}
      <td className="px-3 py-2.5">
        <Link
          to={`/eng/${eng.id}`}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-900 hover:text-amber-700 max-w-[190px] truncate"
        >
          <span className="truncate">{eng.nom}</span>
          <ExternalLink size={11} className="text-gray-300 shrink-0" />
        </Link>
      </td>
      {/* Type */}
      <td className="px-3 py-2.5">
        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-700 max-w-[120px] truncate">
          {eng.teng.nom}
        </span>
      </td>
      {/* ORG principale */}
      <td className="px-3 py-2.5">
        <StaticTag value={eng.org_principale_nom} />
      </td>
      {/* ENV principale */}
      <td className="px-3 py-2.5">
        <StaticTag value={eng.env_principale_nom} />
      </td>
      {/* Début prévu */}
      <td className="px-3 py-2.5 text-xs text-gray-600 tabular-nums">
        {eng.date_debut_prevue ? formatDate(eng.date_debut_prevue) : <span className="text-gray-300">—</span>}
      </td>
      {/* Fin prévue */}
      <td className="px-3 py-2.5 text-xs text-gray-600 tabular-nums">
        {eng.date_fin_prevue ? formatDate(eng.date_fin_prevue) : <span className="text-gray-300">—</span>}
      </td>
      {/* Début réel */}
      <td className="px-3 py-2.5 text-xs text-gray-600 tabular-nums">
        {eng.date_debut ? formatDate(eng.date_debut) : <span className="text-gray-300">—</span>}
      </td>
      {/* Fin réelle */}
      <td className="px-3 py-2.5 text-xs text-gray-600 tabular-nums">
        {eng.date_fin ? formatDate(eng.date_fin) : <span className="text-gray-300">—</span>}
      </td>
      {/* Avancement */}
      <td className="px-3 py-2.5 text-right">
        <ProgressCell value={eng.accomplissement} />
      </td>
      {/* Évts */}
      <td className="px-3 py-2.5 text-right text-xs tabular-nums text-gray-600">
        {eng.nb_events ?? 0}
      </td>
      {/* Créé le */}
      <td className="px-3 py-2.5">
        {eng.created_at ? (
          <div>
            <p className="text-xs text-gray-600 tabular-nums">{formatDateTime(eng.created_at)}</p>
            {eng.created_by_nom && (
              <p className="text-[11px] text-gray-400 max-w-[140px] truncate">{eng.created_by_nom}</p>
            )}
          </div>
        ) : <span className="text-gray-300 text-xs">—</span>}
      </td>
      {/* Modifié le */}
      <td className="px-3 py-2.5">
        {eng.updated_at ? (
          <div>
            <p className="text-xs text-gray-600 tabular-nums">{formatDateTime(eng.updated_at)}</p>
            {eng.updated_by_nom && (
              <p className="text-[11px] text-gray-400 max-w-[140px] truncate">{eng.updated_by_nom}</p>
            )}
          </div>
        ) : <span className="text-gray-300 text-xs">—</span>}
      </td>
    </tr>
  )
}

// ─── Composant principal ──────────────────────────────────────

interface EngTableProps {
  orgId?: number
  envId?: number
  q?: string
  tengId?: number
  createdByMe?: boolean
  defaultSortBy?: SortBy
  defaultSortDir?: SortDir
  /** Remplit toute la hauteur du parent flex au lieu du plafond 480 px */
  fillHeight?: boolean
}

export default function EngTable({
  orgId, envId, q, tengId, createdByMe,
  defaultSortBy = 'nom',
  defaultSortDir = 'asc',
  fillHeight = false,
}: EngTableProps) {
  const [sortBy, setSortBy] = useState<SortBy>(defaultSortBy)
  const [sortDir, setSortDir] = useState<SortDir>(defaultSortDir)

  const handleSort = useCallback((col: SortBy) => {
    setSortBy((prev) => {
      if (prev === col) {
        setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
        return col
      }
      setSortDir('asc')
      return col
    })
  }, [])

  // ── Infinite query ──────────────────────────────────────────
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    isError,
  } = useInfiniteQuery({
    queryKey: ['engs', 'table', orgId, envId, q, tengId, createdByMe, sortBy, sortDir],
    queryFn: async ({ pageParam = 1 }) => {
      const res = await engApi.list({
        org_id: orgId,
        env_id: envId,
        q: q || undefined,
        teng_id: tengId || undefined,
        created_by_me: createdByMe,
        sort_by: sortBy,
        sort_dir: sortDir,
        page: pageParam as number,
        per_page: PER_PAGE,
      })
      return res.data as PaginatedResponse<EngBrief>
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) => {
      const loaded = lastPage.page * lastPage.per_page
      return loaded < lastPage.total ? lastPage.page + 1 : undefined
    },
  })

  const allItems: EngBrief[] = data?.pages.flatMap((p) => p.items) ?? []
  const total = data?.pages[0]?.total ?? 0

  // ── Virtualizer ─────────────────────────────────────────────
  const scrollRef = useRef<HTMLDivElement>(null)
  const virtualizer = useVirtualizer({
    count: allItems.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 44,
    overscan: 8,
  })
  const virtualItems = virtualizer.getVirtualItems()

  // ── Padding haut/bas pour la virtualisation ──────────────────
  const paddingTop = virtualItems.length > 0 ? (virtualItems[0].start ?? 0) : 0
  const paddingBottom =
    virtualItems.length > 0
      ? virtualizer.getTotalSize() - (virtualItems[virtualItems.length - 1].end ?? 0)
      : 0

  // ── Scroll sentinel (IntersectionObserver) ──────────────────
  const sentinelRef = useRef<HTMLTableRowElement>(null)
  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage()
        }
      },
      { threshold: 0.1 },
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [fetchNextPage, hasNextPage, isFetchingNextPage])

  // ── États de chargement / erreur ────────────────────────────
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-10 text-gray-400 gap-2">
        <Loader2 size={18} className="animate-spin" />
        <span className="text-sm">Chargement des engagements…</span>
      </div>
    )
  }
  if (isError) {
    return (
      <p className="text-sm text-red-500 py-4 text-center">
        Impossible de charger les engagements.
      </p>
    )
  }
  if (allItems.length === 0) {
    return (
      <p className="text-sm text-gray-400 py-4 text-center bg-gray-50 rounded-xl border border-gray-100">
        Aucun engagement lié
      </p>
    )
  }

  // ── Rendu ────────────────────────────────────────────────────
  return (
    <div className={`rounded-xl border border-gray-200 overflow-hidden bg-white ${fillHeight ? 'flex flex-col h-full' : ''}`}>
      {/* Barre de statut */}
      <div className="px-4 py-2 bg-gray-50 border-b border-gray-100 flex items-center justify-between shrink-0">
        <span className="text-xs text-gray-500">
          {allItems.length < total
            ? `${allItems.length} chargés sur ${total} engagement${total > 1 ? 's' : ''}`
            : `${total} engagement${total > 1 ? 's' : ''}`}
        </span>
        {isFetchingNextPage && (
          <span className="flex items-center gap-1 text-xs text-amber-600">
            <Loader2 size={12} className="animate-spin" />
            Chargement…
          </span>
        )}
      </div>

      {/* Conteneur de scroll */}
      <div
        ref={scrollRef}
        className={fillHeight ? 'flex-1 overflow-auto' : 'overflow-auto'}
        style={fillHeight ? undefined : { maxHeight: '480px' }}
      >
        <table
          className="border-collapse"
          style={{ minWidth: `${COLUMNS.reduce((acc, c) => acc + c.minWidth, 0)}px`, width: '100%' }}
        >
          {/* Colgroup pour les largeurs */}
          <colgroup>
            {COLUMNS.map((col) => (
              <col key={col.key} style={{ minWidth: `${col.minWidth}px` }} />
            ))}
          </colgroup>

          {/* En-tête sticky */}
          <thead className="sticky top-0 z-10 bg-white shadow-[0_1px_0_0_#e5e7eb]">
            <tr>
              {COLUMNS.map((col) => (
                <th
                  key={col.key}
                  className={`
                    px-3 py-2.5 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider
                    select-none whitespace-nowrap transition-colors
                    ${col.sortKey ? 'cursor-pointer hover:text-gray-800 hover:bg-gray-50' : 'cursor-default'}
                    ${col.align === 'right' ? 'text-right' : ''}
                  `}
                  onClick={col.sortKey ? () => handleSort(col.sortKey!) : undefined}
                >
                  <span className={`inline-flex items-center gap-0.5 ${col.align === 'right' ? 'justify-end w-full' : ''}`}>
                    {col.label}
                    {col.sortKey && <SortIcon col={col.sortKey} sortBy={sortBy} sortDir={sortDir} />}
                  </span>
                </th>
              ))}
            </tr>
          </thead>

          {/* Corps virtualisé — padding top/bottom via lignes spacer */}
          <tbody>
            {paddingTop > 0 && (
              <tr aria-hidden>
                <td colSpan={COL_COUNT} style={{ height: `${paddingTop}px`, padding: 0 }} />
              </tr>
            )}

            {virtualItems.map((virtualRow) => (
              <EngRow key={virtualRow.key} eng={allItems[virtualRow.index]} />
            ))}

            {paddingBottom > 0 && (
              <tr aria-hidden>
                <td colSpan={COL_COUNT} style={{ height: `${paddingBottom}px`, padding: 0 }} />
              </tr>
            )}

            {/* Sentinel de scroll — déclenche le chargement de la page suivante */}
            <tr ref={sentinelRef} aria-hidden>
              <td colSpan={COL_COUNT} style={{ height: 0, padding: 0 }} />
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}
