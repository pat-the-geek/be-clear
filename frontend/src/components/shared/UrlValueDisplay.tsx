/**
 * UrlValueDisplay — Affichage enrichi d'une valeur de type URL
 *
 * Fonctionnalités :
 *   • Indicateur de disponibilité (check HEAD)
 *   • Carte de prévisualisation (métadonnées OG)
 *   • Indexation RAG (scraping + embedding)
 *   • Génération de description via LLM (résumé de la page)
 */
import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import {
  ExternalLink, RefreshCw, AlertCircle, CheckCircle2,
  Eye, EyeOff, Bot, Loader2, X, Sparkles, Copy, Check,
} from 'lucide-react'
import { urlApi } from '@/services/api'

// ─── Types ───────────────────────────────────────────────

interface UrlCheckOut {
  url: string
  reachable: boolean
  status_code?: number
  error?: string
}

interface UrlPreviewOut {
  url: string
  reachable: boolean
  status_code?: number
  title?: string
  description?: string
  site_name?: string
  image?: string
  favicon?: string
  error?: string
}

interface UrlIndexOut {
  url: string
  success: boolean
  chars_indexed: number
  message: string
}

interface UrlSummarizeOut {
  url: string
  success: boolean
  summary?: string
  title?: string
  error?: string
}

// ─── Composant principal ─────────────────────────────────

interface UrlValueDisplayProps {
  url: string
  /** Callback appelé quand l'utilisateur clique "Appliquer à la description" */
  onApplyDescription?: (text: string) => void
}

export default function UrlValueDisplay({ url, onApplyDescription }: UrlValueDisplayProps) {
  const [showPreview, setShowPreview] = useState(false)
  const [showSummary, setShowSummary] = useState(false)
  const [indexMsg, setIndexMsg] = useState<{ success: boolean; message: string } | null>(null)
  const [copied, setCopied] = useState(false)
  const [applied, setApplied] = useState(false)

  // ── Vérification de disponibilité ──────────────────────
  const { data: check, isLoading: checkLoading, refetch: recheckUrl } = useQuery<UrlCheckOut>({
    queryKey: ['url-check', url],
    queryFn: () => urlApi.check(url).then((r) => r.data),
    staleTime: 5 * 60 * 1000,
    retry: false,
  })

  // ── Prévisualisation (chargée à la demande) ─────────────
  const { data: preview, isLoading: previewLoading, refetch: fetchPreview } = useQuery<UrlPreviewOut>({
    queryKey: ['url-preview', url],
    queryFn: () => urlApi.preview(url).then((r) => r.data),
    enabled: false,
    retry: false,
  })

  // ── Indexation RAG ─────────────────────────────────────
  const { mutate: indexUrl, isPending: indexPending } = useMutation<UrlIndexOut>({
    mutationFn: () => urlApi.index(url).then((r) => r.data),
    onSuccess: (data) => setIndexMsg({ success: data.success, message: data.message }),
    onError: () => setIndexMsg({ success: false, message: "Erreur lors de l'indexation." }),
  })

  // ── Résumé LLM ─────────────────────────────────────────
  const {
    data: summaryData,
    isPending: summaryPending,
    mutate: generateSummary,
  } = useMutation<UrlSummarizeOut>({
    mutationFn: () => urlApi.summarize(url).then((r) => r.data),
    onSuccess: () => setShowSummary(true),
  })

  function handleTogglePreview() {
    if (!showPreview && !preview) fetchPreview()
    setShowPreview((v) => !v)
  }

  function handleCopySummary() {
    if (!summaryData?.summary) return
    navigator.clipboard.writeText(summaryData.summary)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function handleApply() {
    if (!summaryData?.summary || !onApplyDescription) return
    onApplyDescription(summaryData.summary)
    setApplied(true)
    setTimeout(() => setApplied(false), 2000)
  }

  // ── Indicateur de statut ───────────────────────────────
  function StatusDot() {
    if (checkLoading) return <Loader2 size={12} className="animate-spin text-gray-400" />
    if (!check) return null
    if (check.reachable) return <CheckCircle2 size={13} className="text-green-500 shrink-0" />
    return (
      <span title={check.error ?? `HTTP ${check.status_code}`}>
        <AlertCircle size={13} className="text-red-400 shrink-0" />
      </span>
    )
  }

  return (
    <div className="space-y-2">
      {/* ── Ligne URL ── */}
      <div className="flex items-center gap-2 flex-wrap">
        <StatusDot />
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 hover:underline text-sm break-all flex items-center gap-1"
        >
          {url}
          <ExternalLink size={11} className="shrink-0 text-blue-400" />
        </a>

        {/* Actions */}
        <div className="flex items-center gap-1 ml-auto shrink-0">
          <button onClick={() => recheckUrl()} title="Vérifier la disponibilité"
            className="p-1 text-gray-400 hover:text-gray-700 rounded transition-colors">
            <RefreshCw size={12} />
          </button>

          <button onClick={handleTogglePreview}
            title={showPreview ? 'Masquer la prévisualisation' : 'Afficher la prévisualisation'}
            className={`p-1 rounded transition-colors ${showPreview ? 'text-blue-500' : 'text-gray-400 hover:text-gray-700'}`}>
            {showPreview ? <EyeOff size={12} /> : <Eye size={12} />}
          </button>

          <button
            onClick={() => { setIndexMsg(null); indexUrl() }}
            disabled={indexPending}
            title="Indexer pour le Terminal IA (RAG)"
            className="p-1 text-gray-400 hover:text-sky-600 rounded transition-colors disabled:opacity-40"
          >
            {indexPending ? <Loader2 size={12} className="animate-spin" /> : <Bot size={12} />}
          </button>

          <button
            onClick={() => { if (!summaryData) generateSummary(); else setShowSummary(v => !v) }}
            disabled={summaryPending}
            title="Générer une description depuis cette page (IA)"
            className={`p-1 rounded transition-colors disabled:opacity-40 ${
              showSummary && summaryData ? 'text-amber-500' : 'text-gray-400 hover:text-amber-500'
            }`}
          >
            {summaryPending ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
          </button>
        </div>
      </div>

      {/* ── Carte de prévisualisation ── */}
      {showPreview && (
        <div className="rounded-xl border border-gray-200 overflow-hidden bg-white shadow-sm">
          {previewLoading ? (
            <div className="flex items-center gap-2 p-4 text-xs text-gray-400">
              <Loader2 size={14} className="animate-spin" /> Chargement…
            </div>
          ) : preview?.error && !preview.title ? (
            <div className="flex items-center gap-2 p-4 text-xs text-red-500">
              <AlertCircle size={14} /> {preview.error}
            </div>
          ) : preview ? (
            <div className="flex gap-3 p-3">
              {preview.image ? (
                <img src={preview.image} alt="" className="w-24 h-20 object-cover rounded-lg shrink-0 border border-gray-100"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
              ) : preview.favicon ? (
                <div className="w-10 h-10 rounded-lg bg-gray-50 border border-gray-100 flex items-center justify-center shrink-0">
                  <img src={preview.favicon} alt="" className="w-6 h-6 object-contain"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
                </div>
              ) : null}
              <div className="flex-1 min-w-0">
                {preview.site_name && <p className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">{preview.site_name}</p>}
                {preview.title && <p className="text-sm font-semibold text-gray-900 line-clamp-2">{preview.title}</p>}
                {preview.description && <p className="text-xs text-gray-500 mt-1 line-clamp-3">{preview.description}</p>}
                <a href={url} target="_blank" rel="noopener noreferrer"
                  className="text-xs text-blue-500 hover:underline mt-1 flex items-center gap-1">
                  Ouvrir <ExternalLink size={10} />
                </a>
              </div>
            </div>
          ) : null}
        </div>
      )}

      {/* ── Résumé IA ── */}
      {showSummary && summaryData && (
        <div className={`rounded-xl border p-3 ${summaryData.success ? 'bg-amber-50 border-amber-200' : 'bg-red-50 border-red-200'}`}>
          {summaryData.success ? (
            <>
              <div className="flex items-center justify-between mb-2">
                <span className="flex items-center gap-1.5 text-xs font-semibold text-amber-700">
                  <Sparkles size={12} />
                  Résumé IA
                  {summaryData.title && <span className="font-normal text-amber-600 truncate max-w-[200px]">— {summaryData.title}</span>}
                </span>
                <button onClick={() => setShowSummary(false)} className="text-amber-400 hover:text-amber-700">
                  <X size={13} />
                </button>
              </div>

              <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap mb-3">
                {summaryData.summary}
              </p>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleCopySummary}
                  className="flex items-center gap-1.5 px-2.5 py-1 text-xs text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  {copied ? <Check size={12} className="text-green-500" /> : <Copy size={12} />}
                  {copied ? 'Copié !' : 'Copier'}
                </button>

                {onApplyDescription && (
                  <button
                    onClick={handleApply}
                    className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-white bg-amber-500 rounded-lg hover:bg-amber-600 transition-colors"
                  >
                    {applied ? <Check size={12} /> : <Sparkles size={12} />}
                    {applied ? 'Appliqué !' : 'Appliquer à la description'}
                  </button>
                )}
              </div>
            </>
          ) : (
            <div className="flex items-center gap-2 text-xs text-red-600">
              <AlertCircle size={13} /> {summaryData.error}
            </div>
          )}
        </div>
      )}

      {/* ── Message indexation ── */}
      {indexMsg && (
        <div className={`flex items-start gap-2 text-xs rounded-lg px-3 py-2 ${
          indexMsg.success ? 'bg-sky-50 text-sky-700 border border-sky-200'
                           : 'bg-red-50 text-red-600 border border-red-200'
        }`}>
          {indexMsg.success ? <Bot size={13} className="shrink-0 mt-0.5" /> : <AlertCircle size={13} className="shrink-0 mt-0.5" />}
          <span className="flex-1">{indexMsg.message}</span>
          <button onClick={() => setIndexMsg(null)} className="shrink-0 opacity-60 hover:opacity-100"><X size={12} /></button>
        </div>
      )}
    </div>
  )
}
