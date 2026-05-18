/**
 * ImageUrlValueDisplay — Affichage d'une valeur de type IMAGEURL
 *
 * Se comporte comme une URL (lien externe) mais affiche l'image pointée.
 *
 *   • Vignette via SmartImage : recadrage intelligent (visage / sujet
 *     principal) sur les images same-origin ou CORS-friendly ; repli
 *     centré pour les images cross-origin (canvas teinté → fallback).
 *   • Clic sur la vignette → visionneuse plein écran (galerie), image
 *     entière (object-contain). Fermeture : croix, clic hors image, Échap.
 *   • URL rappelée sous la vignette sous forme de lien discret.
 *   • Si l'image est introuvable / cassée : repli sur un simple lien
 *     avec indicateur d'erreur.
 */
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { ExternalLink, ImageOff, X } from 'lucide-react'
import SmartImage from '@/components/shared/SmartImage'

// Dimensions d'affichage de la vignette (px) — passées à SmartImage
const THUMB_W = 256
const THUMB_H = 160

interface ImageUrlValueDisplayProps {
  url: string
}

// ─── Visionneuse plein écran ──────────────────────────────────

function Lightbox({ url, onClose }: { url: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return createPortal(
    <div
      className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center"
      onClick={onClose}
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute top-4 right-4 p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors z-10"
        title="Fermer"
      >
        <X size={20} />
      </button>

      <div
        className="relative max-w-[90vw] max-h-[90vh] flex flex-col items-center"
        onClick={(e) => e.stopPropagation()}
      >
        <img
          src={url}
          alt=""
          className="max-w-full max-h-[80vh] object-contain rounded-lg shadow-2xl"
        />
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 text-white/60 hover:text-white/90 text-xs flex items-center gap-1 break-all max-w-[90vw]"
        >
          {url}
          <ExternalLink size={11} className="shrink-0" />
        </a>
      </div>
    </div>,
    document.body,
  )
}

// ─── Composant principal ──────────────────────────────────────

export default function ImageUrlValueDisplay({ url }: ImageUrlValueDisplayProps) {
  const [status, setStatus] = useState<'loading' | 'ok' | 'error'>('loading')
  const [open, setOpen] = useState(false)

  // SmartImage n'expose pas onError — on précharge l'URL pour
  // détecter une image cassée et basculer sur le repli lien.
  useEffect(() => {
    setStatus('loading')
    if (!url) {
      setStatus('error')
      return
    }
    const img = new Image()
    img.onload = () => setStatus('ok')
    img.onerror = () => setStatus('error')
    img.src = url
    return () => {
      img.onload = null
      img.onerror = null
    }
  }, [url])

  if (status === 'error') {
    return (
      <div className="flex items-center gap-2 flex-wrap">
        <span title="Image introuvable">
          <ImageOff size={13} className="text-red-400 shrink-0" />
        </span>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 hover:underline text-sm break-all flex items-center gap-1"
        >
          {url}
          <ExternalLink size={11} className="shrink-0 text-blue-400" />
        </a>
      </div>
    )
  }

  return (
    <div className="space-y-1.5">
      {status === 'loading' ? (
        <div className="w-64 h-40 rounded-lg border border-gray-200 bg-gray-100 animate-pulse" />
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          title="Agrandir l'image"
          className="block w-64 h-40 rounded-lg overflow-hidden border border-gray-200 bg-gray-50 hover:opacity-90 transition-opacity"
        >
          <SmartImage
            src={url}
            alt=""
            cropWidth={THUMB_W}
            cropHeight={THUMB_H}
            className="w-full h-full object-cover"
          />
        </button>
      )}

      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-blue-500 hover:underline text-xs break-all flex items-center gap-1 w-fit"
      >
        {url}
        <ExternalLink size={10} className="shrink-0 text-blue-400" />
      </a>

      {open && <Lightbox url={url} onClose={() => setOpen(false)} />}
    </div>
  )
}
