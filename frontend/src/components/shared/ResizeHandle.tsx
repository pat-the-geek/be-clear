/**
 * ResizeHandle — poignée de redimensionnement de volet
 *
 * Usage :
 *   const [width, onMouseDown] = useResizable(208, 120, 400, 'my-panel')
 *   <aside style={{ width }} ...>…</aside>
 *   <ResizeHandle onMouseDown={onMouseDown} />
 */
import { useState, useCallback, useEffect, useRef } from 'react'

// ─── Hook ─────────────────────────────────────────────────────

/**
 * Retourne [largeur, gestionnaire onMouseDown] pour un volet redimensionnable.
 * La largeur est persistée dans localStorage si `storageKey` est fourni.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function useResizable(
  initialWidth: number,
  minWidth: number,
  maxWidth: number,
  storageKey?: string,
): [number, (e: React.MouseEvent) => void] {
  const [width, setWidth] = useState<number>(() => {
    if (storageKey) {
      const saved = localStorage.getItem(storageKey)
      if (saved) {
        const n = Number(saved)
        if (!isNaN(n)) return Math.min(maxWidth, Math.max(minWidth, n))
      }
    }
    return initialWidth
  })

  // Garde une référence vers les listeners actifs pour pouvoir les nettoyer si le composant est démonté en cours de drag
  const activeListenersRef = useRef<{ move: (ev: MouseEvent) => void; up: () => void } | null>(null)

  useEffect(() => {
    return () => {
      if (activeListenersRef.current) {
        document.removeEventListener('mousemove', activeListenersRef.current.move)
        document.removeEventListener('mouseup', activeListenersRef.current.up)
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
        activeListenersRef.current = null
      }
    }
  }, [])

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      const startX = e.clientX
      const startWidth = width

      const onMove = (ev: MouseEvent) => {
        const next = Math.min(maxWidth, Math.max(minWidth, startWidth + ev.clientX - startX))
        setWidth(next)
        if (storageKey) localStorage.setItem(storageKey, String(next))
      }

      const onUp = () => {
        document.removeEventListener('mousemove', onMove)
        document.removeEventListener('mouseup', onUp)
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
        activeListenersRef.current = null
      }

      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'
      document.addEventListener('mousemove', onMove)
      document.addEventListener('mouseup', onUp)
      activeListenersRef.current = { move: onMove, up: onUp }
    },
    [width, minWidth, maxWidth, storageKey],
  )

  return [width, onMouseDown]
}

// ─── Composant ────────────────────────────────────────────────

interface ResizeHandleProps {
  onMouseDown: (e: React.MouseEvent) => void
}

export default function ResizeHandle({ onMouseDown }: ResizeHandleProps) {
  return (
    <div
      onMouseDown={onMouseDown}
      className="w-1 shrink-0 cursor-col-resize group relative flex items-center justify-center hover:bg-blue-200 active:bg-blue-400 transition-colors"
      style={{ zIndex: 10 }}
    >
      {/* Indicateur visuel centré */}
      <div className="absolute inset-y-0 -left-0.5 -right-0.5 group-hover:bg-blue-200/50" />
    </div>
  )
}
