import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { Send, Bot, User as UserIcon } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { ragApi } from '@/services/api'
import { ENTITY_COLORS as EC } from '@/lib/entityColors'

// ─── Styles RAG dérivés de la charte entityColors ────────────

const RAG_STYLES: Record<string, { pill: string; badge: string; highlight: string; dot: string }> = {
  org:   { pill: `${EC.org.chipBg} ${EC.org.chipText} border-blue-200 hover:border-blue-400 hover:bg-blue-200`,     badge: `${EC.org.chipBg} ${EC.org.chipText}`,     highlight: 'bg-blue-100/70 text-blue-900',   dot: 'bg-blue-400' },
  env:   { pill: `${EC.env.chipBg} ${EC.env.chipText} border-orange-200 hover:border-orange-400 hover:bg-orange-200`, badge: `${EC.env.chipBg} ${EC.env.chipText}`,   highlight: 'bg-orange-100/70 text-orange-900', dot: 'bg-orange-400' },
  eng:   { pill: `${EC.eng.chipBg} ${EC.eng.chipText} border-amber-200 hover:border-amber-400 hover:bg-amber-200`,   badge: `${EC.eng.chipBg} ${EC.eng.chipText}`,   highlight: 'bg-amber-100/70 text-amber-900',   dot: 'bg-amber-400' },
  event: { pill: `${EC.event.chipBg} ${EC.event.chipText} border-sky-200 hover:border-sky-400 hover:bg-sky-200`,     badge: `${EC.event.chipBg} ${EC.event.chipText}`, highlight: 'bg-sky-100/70 text-sky-900',     dot: 'bg-sky-400' },
}

const ENTITY_LABELS: Record<string, string> = {
  org: 'ORG', env: 'ENV', eng: 'ENG', event: 'EVENT',
}

function entityColors(type: string) {
  return RAG_STYLES[type.toLowerCase()] ?? {
    pill:      'bg-gray-100 text-gray-600 border-gray-200 hover:border-gray-400',
    badge:     'bg-gray-100 text-gray-600',
    highlight: 'bg-gray-100/70 text-gray-800',
    dot:       'bg-gray-400',
  }
}

// ─── Types ───────────────────────────────────────────────────

interface MessageSource {
  obj_id: number
  entity_id: number
  nom: string
  entity_type: string
}

interface Message {
  role: 'user' | 'assistant'
  content: string
  sources?: MessageSource[]
}

interface LlmOption {
  id: number
  nom: string
  fournisseur: string
}

interface RagResponse {
  answer: string
  sources: MessageSource[]
}

// ─── Composant : bulle message ───────────────────────────────

interface MessageBubbleProps {
  message: Message
}

function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === 'user'

  return (
    <div className={`flex items-end gap-2 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
      {/* Avatar */}
      <div
        className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center ${
          isUser ? 'bg-blue-600' : 'bg-gray-200'
        }`}
      >
        {isUser ? (
          <UserIcon size={14} className="text-white" />
        ) : (
          <Bot size={14} className="text-gray-600" />
        )}
      </div>

      {/* Contenu */}
      <div className={`max-w-[75%] ${isUser ? 'items-end' : 'items-start'} flex flex-col gap-1`}>
        <div
          className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
            isUser
              ? 'bg-blue-600 text-white rounded-br-sm'
              : 'bg-gray-100 text-gray-900 rounded-bl-sm'
          }`}
        >
          {isUser ? (
            message.content
          ) : (
            <div className="text-sm leading-relaxed">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  h1: ({ children }) => <h1 className="text-base font-bold text-gray-900 mb-2 mt-3">{children}</h1>,
                  h2: ({ children }) => <h2 className="text-sm font-bold text-gray-900 mb-1.5 mt-3">{children}</h2>,
                  h3: ({ children }) => <h3 className="text-sm font-semibold text-gray-800 mb-1 mt-2">{children}</h3>,
                  p: ({ children }) => <p className="text-sm text-gray-800 mb-2 leading-relaxed">{children}</p>,
                  ul: ({ children }) => <ul className="text-sm list-disc list-inside space-y-1 mb-2 text-gray-800">{children}</ul>,
                  ol: ({ children }) => <ol className="text-sm list-decimal list-inside space-y-1 mb-2 text-gray-800">{children}</ol>,
                  li: ({ children }) => <li className="text-sm text-gray-800">{children}</li>,
                  strong: ({ children }) => <strong className="font-semibold text-gray-900">{children}</strong>,
                  em: ({ children }) => <em className="italic text-gray-700">{children}</em>,
                  code: ({ className, children }) =>
                    className
                      ? <code className={className}>{children}</code>
                      : <code className="font-mono text-xs bg-gray-200 text-gray-800 px-1 py-0.5 rounded">{children}</code>,
                  pre: ({ children }) => <pre className="bg-gray-800 text-green-300 text-xs rounded-lg p-3 overflow-x-auto my-2">{children}</pre>,
                  blockquote: ({ children }) => <blockquote className="border-l-2 border-gray-300 pl-3 text-gray-600 italic text-sm my-2">{children}</blockquote>,
                  hr: () => <hr className="border-gray-200 my-3" />,
                  a: ({ href, children }) => <a href={href} className="text-blue-600 underline hover:text-blue-700">{children}</a>,
                  table: ({ children }) => (
                    <div className="overflow-x-auto my-3">
                      <table className="w-full text-sm border-collapse">{children}</table>
                    </div>
                  ),
                  thead: ({ children }) => <thead className="bg-gray-100">{children}</thead>,
                  tbody: ({ children }) => <tbody>{children}</tbody>,
                  tr: ({ children }) => <tr className="border-b border-gray-200 last:border-0">{children}</tr>,
                  th: ({ children }) => <th className="text-left px-3 py-2 text-xs font-semibold text-gray-600 uppercase tracking-wide">{children}</th>,
                  td: ({ children }) => {
                    const text = typeof children === 'string' ? children : ''
                    const lower = text.trim().toLowerCase()
                    const knownType = ['org', 'env', 'eng', 'event'].find(t => lower === t)
                    if (knownType) {
                      const c = entityColors(knownType)
                      return (
                        <td className="px-3 py-2">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold ${c.badge}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
                            {text}
                          </span>
                        </td>
                      )
                    }
                    return <td className="px-3 py-2 text-gray-800">{children}</td>
                  },
                }}
              >
                {message.content}
              </ReactMarkdown>
            </div>
          )}
        </div>

        {/* Sources */}
        {message.sources && message.sources.length > 0 && (
          <div className="flex flex-wrap gap-1 px-1">
            {message.sources.map((src) => {
              const c = entityColors(src.entity_type)
              const label = ENTITY_LABELS[src.entity_type.toLowerCase()] ?? src.entity_type.toUpperCase()
              return (
                <a
                  key={src.obj_id}
                  href={`/${src.entity_type}/${src.entity_id}`}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 text-xs border rounded-full transition-colors ${c.pill}`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${c.dot}`} />
                  {src.nom}
                  <span className="opacity-60 font-medium">{label}</span>
                </a>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Composant : bulle loading ───────────────────────────────

function TypingBubble() {
  return (
    <div className="flex items-end gap-2">
      <div className="shrink-0 w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center">
        <Bot size={14} className="text-gray-600" />
      </div>
      <div className="px-4 py-3 bg-gray-100 rounded-2xl rounded-bl-sm">
        <span className="flex gap-1">
          <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:0ms]" />
          <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:150ms]" />
          <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:300ms]" />
        </span>
      </div>
    </div>
  )
}

// ─── Page principale ─────────────────────────────────────────

export default function RagPage() {
  const [messages, setMessages] = useState<Message[]>([])
  const [question, setQuestion] = useState('')
  const [selectedLlmId, setSelectedLlmId] = useState<number | undefined>(undefined)
  const bottomRef = useRef<HTMLDivElement>(null)

  // Charge la liste des LLMs disponibles
  const { data: llms } = useQuery<LlmOption[]>({
    queryKey: ['rag', 'llms'],
    queryFn: () => ragApi.llms().then((r) => r.data),
  })

  // Initialise le LLM par défaut au chargement
  useEffect(() => {
    if (llms && llms.length > 0 && selectedLlmId === undefined) {
      setSelectedLlmId(llms[0].id)
    }
  }, [llms, selectedLlmId])

  // Scroll auto vers le bas
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const { mutate: sendQuery, isPending } = useMutation({
    mutationFn: (data: { question: string; llm_id?: number }) =>
      ragApi.query(data).then((r) => r.data as RagResponse),
    onMutate: (data) => {
      // Ajoute le message user immédiatement
      setMessages((prev) => [
        ...prev,
        { role: 'user', content: data.question },
      ])
      setQuestion('')
    },
    onSuccess: (data) => {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: data.answer,
          sources: data.sources,
        },
      ])
    },
    onError: () => {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: 'Une erreur est survenue. Veuillez réessayer.',
        },
      ])
    },
  })

  function handleSend() {
    const trimmed = question.trim()
    if (!trimmed || isPending) return
    sendQuery({ question: trimmed, llm_id: selectedLlmId })
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* ─── En-tête ──────────────────────────── */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-white shrink-0">
        <div className="flex items-center gap-2">
          <Bot size={20} className="text-blue-600" />
          <h1 className="text-lg font-semibold text-gray-900">Terminal IA</h1>
        </div>

        {/* Sélecteur LLM */}
        {llms && llms.length > 0 && (
          <div className="flex items-center gap-2">
            <label htmlFor="llm-select" className="text-xs text-gray-500">
              Modèle :
            </label>
            <select
              id="llm-select"
              value={selectedLlmId ?? ''}
              onChange={(e) => setSelectedLlmId(Number(e.target.value))}
              className="text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
            >
              {llms.map((llm) => (
                <option key={llm.id} value={llm.id}>
                  {llm.nom} ({llm.fournisseur})
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* ─── Zone de conversation ─────────────── */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        {messages.length === 0 && (
          <div className="flex items-center justify-center h-full text-center">
            <div>
              <Bot size={40} className="text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 text-sm">
                Posez une question sur vos organisations, environnements ou engagements.
              </p>
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <MessageBubble key={i} message={msg} />
        ))}

        {isPending && <TypingBubble />}

        <div ref={bottomRef} />
      </div>

      {/* ─── Zone de saisie ───────────────────── */}
      <div className="px-6 py-4 border-t border-gray-200 bg-white shrink-0">
        <div className="flex items-end gap-3 max-w-3xl mx-auto">
          <textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Posez votre question… (Entrée pour envoyer, Maj+Entrée pour un saut de ligne)"
            rows={2}
            className="flex-1 resize-none text-sm border border-gray-200 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
          />
          <button
            onClick={handleSend}
            disabled={isPending || question.trim().length === 0}
            className="shrink-0 flex items-center justify-center w-10 h-10 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-40 transition-colors"
            aria-label="Envoyer"
          >
            <Send size={16} />
          </button>
        </div>
        <p className="text-center text-xs text-gray-400 mt-2">
          Le terminal IA interroge uniquement les données structurées (ORG, ENV, ENG, EVENT…).
        </p>
      </div>
    </div>
  )
}
