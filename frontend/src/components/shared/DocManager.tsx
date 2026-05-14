/**
 * DocManager — gestion et visualisation des documents attachés à un OBJ.
 * Viewer intégré : Markdown (avec Mermaid + callouts Obsidian), PDF.
 */
import { useRef, useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Upload, Trash2, Loader2, FileText, Download, Eye, X } from 'lucide-react'
import { mediaApi } from '@/services/api'
import type { Doc } from '@/types'

// ─── Helpers ──────────────────────────────────────────────────

interface Props {
  objId: number
  documents: Doc[]
  queryKey: unknown[]
  readOnly?: boolean
}

const ACCEPT = '.md,.markdown,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.odt,.ods,.odp'
const MAX_MB = 50

function formatBytes(bytes?: number): string {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} o`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`
}

function getDocType(doc: Doc): 'markdown' | 'pdf' | 'office' {
  if (doc.format === 'markdown') return 'markdown'
  const ext = (doc.nom_original ?? doc.chemin).toLowerCase().split('.').pop()
  if (ext === 'pdf') return 'pdf'
  return 'office'
}

/** Prétraitement du Markdown Obsidian avant rendu */
function preprocessMarkdown(raw: string): string {
  // Supprimer le frontmatter YAML (--- ... ---)
  let text = raw.replace(/^---[\s\S]*?\n---\s*\n?/, '')
  // [[wikilinks]] → texte en gras
  text = text.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, target, alias) => `**${alias ?? target}**`)
  // ![[embed]] → indication de lien ignoré
  text = text.replace(/!\[\[([^\]]+)\]\]/g, `> *Embed : $1*`)
  return text
}

// ─── Mermaid inline ────────────────────────────────────────────

let mermaidCounter = 0

function MermaidBlock({ code }: { code: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const idRef = useRef(`mermaid-doc-${++mermaidCounter}`)

  useEffect(() => {
    if (!ref.current) return
    const id = idRef.current
    document.getElementById(`d${id}`)?.remove()
    let cancelled = false
    async function render() {
      try {
        const { default: mermaid } = await import('mermaid')
        mermaid.initialize({ startOnLoad: false, theme: 'neutral', securityLevel: 'loose', suppressErrorRendering: true })
        const { svg } = await mermaid.render(id, code)
        document.getElementById(`d${id}`)?.remove()
        document.getElementById(`i${id}`)?.remove()
        if (!cancelled && ref.current) ref.current.innerHTML = svg
      } catch {
        document.getElementById(`d${id}`)?.remove()
        document.getElementById(`i${id}`)?.remove()
        if (!cancelled && ref.current) ref.current.innerHTML = `<pre class="text-xs text-red-500">${code}</pre>`
      }
    }
    render()
    return () => { cancelled = true; document.getElementById(`d${id}`)?.remove(); document.getElementById(`i${id}`)?.remove() }
  }, [code])

  return <div ref={ref} className="my-4 overflow-x-auto" />
}

// ─── Callouts Obsidian ─────────────────────────────────────────

const CALLOUT_STYLES: Record<string, { bg: string; border: string; icon: string; label: string }> = {
  note:      { bg: 'bg-blue-50',   border: 'border-blue-300',  icon: 'ℹ️', label: 'Note' },
  info:      { bg: 'bg-blue-50',   border: 'border-blue-300',  icon: 'ℹ️', label: 'Info' },
  tip:       { bg: 'bg-green-50',  border: 'border-green-300', icon: '💡', label: 'Astuce' },
  warning:   { bg: 'bg-amber-50',  border: 'border-amber-300', icon: '⚠️', label: 'Attention' },
  caution:   { bg: 'bg-amber-50',  border: 'border-amber-300', icon: '⚠️', label: 'Attention' },
  danger:    { bg: 'bg-red-50',    border: 'border-red-300',   icon: '🚨', label: 'Danger' },
  error:     { bg: 'bg-red-50',    border: 'border-red-300',   icon: '❌', label: 'Erreur' },
  success:   { bg: 'bg-green-50',  border: 'border-green-300', icon: '✅', label: 'Succès' },
  question:  { bg: 'bg-purple-50', border: 'border-purple-300',icon: '❓', label: 'Question' },
  quote:     { bg: 'bg-gray-50',   border: 'border-gray-300',  icon: '💬', label: 'Citation' },
  abstract:  { bg: 'bg-cyan-50',   border: 'border-cyan-300',  icon: '📋', label: 'Résumé' },
  summary:   { bg: 'bg-cyan-50',   border: 'border-cyan-300',  icon: '📋', label: 'Résumé' },
  todo:      { bg: 'bg-indigo-50', border: 'border-indigo-300',icon: '☑️', label: 'À faire' },
  important: { bg: 'bg-orange-50', border: 'border-orange-300',icon: '📌', label: 'Important' },
}

function CalloutBlockquote({ children }: { children: React.ReactNode }) {
  // Extraire le texte brut du premier enfant pour détecter [!TYPE]
  const firstLine = String(
    Array.isArray(children) ? (children[0] as React.ReactNode) : children
  )
  const match = firstLine.match(/^\[!(\w+)\](.*)/)
  if (match) {
    const type = match[1].toLowerCase()
    const style = CALLOUT_STYLES[type] ?? CALLOUT_STYLES['note']
    const title = match[2].trim() || style.label
    const rest = Array.isArray(children) ? children.slice(1) : []
    return (
      <div className={`my-3 rounded-lg border-l-4 ${style.border} ${style.bg} p-3`}>
        <div className="flex items-center gap-1.5 font-semibold text-sm mb-1">
          <span>{style.icon}</span>
          <span>{title}</span>
        </div>
        {rest.length > 0 && <div className="text-sm">{rest}</div>}
      </div>
    )
  }
  return (
    <blockquote className="border-l-4 border-gray-300 pl-4 my-3 text-gray-600 italic">
      {children}
    </blockquote>
  )
}

// ─── Composants React-Markdown ─────────────────────────────────

const mdComponents = {
  code({ className, children }: { className?: string; children?: React.ReactNode }) {
    const lang = (className ?? '').replace('language-', '')
    const code = String(children ?? '').trim()
    if (lang === 'mermaid') return <MermaidBlock code={code} />
    return (
      <code className={`bg-gray-100 text-gray-800 px-1 py-0.5 rounded text-[0.85em] font-mono ${className ?? ''}`}>
        {children}
      </code>
    )
  },
  pre({ children, node }: { children?: React.ReactNode; node?: { children?: { properties?: { className?: string[] } }[] } }) {
    const cls = node?.children?.[0]?.properties?.className ?? []
    if (cls.includes('language-mermaid')) return <>{children}</>
    return (
      <pre className="bg-gray-900 text-gray-100 rounded-lg p-4 overflow-x-auto text-sm my-3 font-mono">
        {children}
      </pre>
    )
  },
  blockquote({ children }: { children?: React.ReactNode }) {
    return <CalloutBlockquote>{children}</CalloutBlockquote>
  },
  h1({ children }: { children?: React.ReactNode }) {
    return <h1 className="text-2xl font-bold text-gray-900 mt-6 mb-3 border-b border-gray-200 pb-2">{children}</h1>
  },
  h2({ children }: { children?: React.ReactNode }) {
    return <h2 className="text-xl font-bold text-gray-800 mt-5 mb-2">{children}</h2>
  },
  h3({ children }: { children?: React.ReactNode }) {
    return <h3 className="text-lg font-semibold text-gray-800 mt-4 mb-2">{children}</h3>
  },
  table({ children }: { children?: React.ReactNode }) {
    return (
      <div className="overflow-x-auto my-4">
        <table className="min-w-full border border-gray-200 rounded-lg text-sm">{children}</table>
      </div>
    )
  },
  th({ children }: { children?: React.ReactNode }) {
    return <th className="bg-gray-50 border border-gray-200 px-3 py-2 text-left font-semibold text-gray-700">{children}</th>
  },
  td({ children }: { children?: React.ReactNode }) {
    return <td className="border border-gray-200 px-3 py-2 text-gray-800">{children}</td>
  },
  a({ href, children }: { href?: string; children?: React.ReactNode }) {
    return <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">{children}</a>
  },
}

// ─── DocViewer ────────────────────────────────────────────────

interface DocViewerProps {
  doc: Doc
  onClose: () => void
}

function DocViewer({ doc, onClose }: DocViewerProps) {
  const url = `/api/media/files/${doc.chemin}`
  const type = getDocType(doc)
  const [mdContent, setMdContent] = useState<string | null>(null)
  const [mdError, setMdError] = useState(false)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    if (type !== 'markdown') return
    fetch(url)
      .then((r) => r.text())
      .then((text) => setMdContent(preprocessMarkdown(text)))
      .catch(() => setMdError(true))
  }, [url, type])

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCloseRef.current() }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [])

  return createPortal(
    <div
      className="fixed inset-0 z-50 bg-black/80 flex items-start justify-center p-4 overflow-auto"
      onClick={onClose}
    >
      <div
        className="relative bg-white rounded-xl shadow-2xl w-full max-w-4xl my-4 flex flex-col"
        style={{ minHeight: type === 'pdf' ? '90vh' : undefined }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* En-tête */}
        <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-gray-200 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <FileText size={16} className="text-gray-400 shrink-0" />
            <span className="text-sm font-medium text-gray-800 truncate">{doc.nom_original}</span>
            <span className="text-[11px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded shrink-0">
              {type === 'markdown' ? 'Markdown' : type === 'pdf' ? 'PDF' : 'Document'}
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <a
              href={url}
              download={doc.nom_original}
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
              onClick={(e) => e.stopPropagation()}
            >
              <Download size={12} />
              Télécharger
            </a>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-600 transition-colors"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Contenu */}
        <div className="flex-1 overflow-auto">
          {type === 'pdf' && (
            <iframe
              src={url}
              title={doc.nom_original}
              className="w-full rounded-b-xl"
              style={{ height: '85vh' }}
            />
          )}

          {type === 'markdown' && (
            <div className="px-8 py-6">
              {mdError && (
                <p className="text-red-500 text-sm">Impossible de charger le document.</p>
              )}
              {!mdError && mdContent === null && (
                <div className="flex justify-center py-12 text-gray-400">
                  <Loader2 size={24} className="animate-spin" />
                </div>
              )}
              {mdContent !== null && (
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={mdComponents as never}
                >
                  {mdContent}
                </ReactMarkdown>
              )}
            </div>
          )}

          {type === 'office' && (
            <div className="flex flex-col items-center justify-center py-16 gap-4 text-gray-500">
              <FileText size={40} className="text-gray-300" />
              <p className="text-sm">Ce format ne peut pas être prévisualisé dans le navigateur.</p>
              <a
                href={url}
                download={doc.nom_original}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
                onClick={(e) => e.stopPropagation()}
              >
                <Download size={14} />
                Télécharger le fichier
              </a>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}

// ─── DocManager ───────────────────────────────────────────────

export default function DocManager({ objId, documents, queryKey, readOnly = false }: Props) {
  const queryClient = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [viewingDoc, setViewingDoc] = useState<Doc | null>(null)

  const invalidate = () => queryClient.invalidateQueries({ queryKey })

  const uploadMutation = useMutation({
    mutationFn: (file: File) => mediaApi.uploadDoc(objId, file),
    onSuccess: () => { setUploadError(null); invalidate() },
    onError: (err: { response?: { data?: { detail?: string } } }) => {
      setUploadError(err.response?.data?.detail ?? 'Erreur lors de l\'upload')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (docId: number) => mediaApi.deleteDoc(objId, docId),
    onSuccess: () => { setDeletingId(null); invalidate() },
  })

  const handleFile = (file: File) => {
    setUploadError(null)
    if (file.size > MAX_MB * 1024 * 1024) {
      setUploadError(`Fichier trop volumineux (maximum ${MAX_MB} Mo)`)
      return
    }
    uploadMutation.mutate(file)
  }

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
    e.target.value = ''
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file) handleFile(file)
  }

  const isUploading = uploadMutation.isPending

  return (
    <div className="space-y-3">
      {/* Liste des documents */}
      {documents.length > 0 && (
        <div className="space-y-2">
          {documents.map((doc) => (
            <div
              key={doc.id}
              className="flex items-center justify-between gap-2 p-3 bg-white border border-gray-200 rounded-xl group"
            >
              <div className="flex items-center gap-2 min-w-0">
                <FileText size={15} className="text-gray-400 shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm text-gray-900 truncate">{doc.nom_original}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[11px] text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded">
                      {doc.format === 'markdown' ? 'Markdown' : 'Office'}
                    </span>
                    {doc.taille_octets && (
                      <span className="text-[11px] text-gray-400">{formatBytes(doc.taille_octets)}</span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => setViewingDoc(doc)}
                  className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-sky-600 transition-colors"
                  title="Visualiser"
                >
                  <Eye size={14} />
                </button>
                <a
                  href={`/api/media/files/${doc.chemin}`}
                  download={doc.nom_original}
                  className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-blue-600 transition-colors"
                  title="Télécharger"
                >
                  <Download size={14} />
                </a>
                {!readOnly && (
                  deletingId === doc.id ? (
                    <button
                      onClick={() => deleteMutation.mutate(doc.id)}
                      disabled={deleteMutation.isPending}
                      className="px-2 py-1 text-xs font-medium text-red-600 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 transition-colors"
                    >
                      {deleteMutation.isPending ? <Loader2 size={11} className="animate-spin" /> : 'Confirmer'}
                    </button>
                  ) : (
                    <button
                      onClick={() => setDeletingId(doc.id)}
                      className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-red-600 transition-colors"
                      title="Supprimer"
                    >
                      <Trash2 size={14} />
                    </button>
                  )
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Zone d'upload — éditeurs uniquement */}
      {!readOnly && (
        <div
          onClick={() => !isUploading && fileRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          className={`flex flex-col items-center justify-center gap-2 p-5 border-2 border-dashed rounded-xl cursor-pointer transition-colors ${
            dragOver
              ? 'border-blue-400 bg-blue-50'
              : isUploading
              ? 'border-gray-200 bg-gray-50 cursor-not-allowed'
              : 'border-gray-200 hover:border-blue-300 hover:bg-blue-50/30'
          }`}
        >
          <input
            ref={fileRef}
            type="file"
            accept={ACCEPT}
            className="hidden"
            onChange={onFileChange}
            disabled={isUploading}
          />
          {isUploading ? (
            <>
              <Loader2 size={22} className="text-blue-500 animate-spin" />
              <p className="text-sm text-gray-500">Upload en cours…</p>
            </>
          ) : (
            <>
              <div className="p-2 rounded-lg bg-gray-100">
                <Upload size={20} className="text-gray-400" />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-gray-700">
                  {documents.length === 0 ? 'Ajouter un document' : 'Ajouter un autre document'}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">
                  Markdown, PDF, Word, Excel, PowerPoint, OpenDocument · max {MAX_MB} Mo
                </p>
              </div>
            </>
          )}
        </div>
      )}

      {!readOnly && uploadError && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {uploadError}
        </p>
      )}

      {/* Visionneuse */}
      {viewingDoc && (
        <DocViewer doc={viewingDoc} onClose={() => setViewingDoc(null)} />
      )}
    </div>
  )
}
