/**
 * ImageManager — gestion des images attachées à un OBJ (ORG, ENV…)
 *
 * Fonctionnalités :
 *  • Affichage de toutes les images existantes avec badge "Principale"
 *  • Visionneuse plein écran (galerie) au clic sur une image
 *  • Upload par clic ou drag & drop (JPEG, PNG, GIF, WebP, SVG — max 10 Mo)
 *  • Définir comme image principale
 *  • Supprimer une image
 */
import { useRef, useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Upload, Star, Trash2, Loader2, ImageIcon, X, ChevronLeft, ChevronRight, ZoomIn } from 'lucide-react'
import { mediaApi } from '@/services/api'
import type { Img } from '@/types'
import SmartImage from '@/components/shared/SmartImage'

// ─── Types ────────────────────────────────────────────────

interface Props {
  objId: number
  images: Img[]
  /** Clé de query à invalider après chaque mutation (ex: ['org', id]) */
  queryKey: unknown[]
  readOnly?: boolean
}

// ─── Helpers ──────────────────────────────────────────────

/** URL publique d'une image stockée dans /media/files/ */
export function imgUrl(chemin: string): string {
  return `/api/media/files/${chemin}`
}

const ACCEPT = 'image/jpeg,image/png,image/gif,image/webp,image/svg+xml'
const MAX_MB = 10

// ─── Lightbox ─────────────────────────────────────────────

interface LightboxProps {
  images: Img[]
  index: number
  onClose: () => void
  onChange: (i: number) => void
}

function Lightbox({ images, index, onClose, onChange }: LightboxProps) {
  const img = images[index]
  const hasPrev = index > 0
  const hasNext = index < images.length - 1
  const onCloseRef = useRef(onClose)
  const onChangeRef = useRef(onChange)
  onCloseRef.current = onClose
  onChangeRef.current = onChange

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current()
      if (e.key === 'ArrowRight' && hasNext) onChangeRef.current(index + 1)
      if (e.key === 'ArrowLeft' && hasPrev) onChangeRef.current(index - 1)
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [index, hasPrev, hasNext])

  return createPortal(
    <div
      className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center"
      onClick={onClose}
    >
      {/* Bouton fermer */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors z-10"
      >
        <X size={20} />
      </button>

      {/* Compteur */}
      {images.length > 1 && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 text-white/70 text-sm bg-black/40 px-3 py-1 rounded-full z-10">
          {index + 1} / {images.length}
        </div>
      )}

      {/* Précédent */}
      {hasPrev && (
        <button
          onClick={(e) => { e.stopPropagation(); onChange(index - 1) }}
          className="absolute left-4 top-1/2 -translate-y-1/2 p-2 rounded-full bg-white/10 hover:bg-white/25 text-white transition-colors z-10"
        >
          <ChevronLeft size={28} />
        </button>
      )}

      {/* Suivant */}
      {hasNext && (
        <button
          onClick={(e) => { e.stopPropagation(); onChange(index + 1) }}
          className="absolute right-4 top-1/2 -translate-y-1/2 p-2 rounded-full bg-white/10 hover:bg-white/25 text-white transition-colors z-10"
        >
          <ChevronRight size={28} />
        </button>
      )}

      {/* Image principale */}
      <div
        className="relative max-w-[90vw] max-h-[90vh] flex flex-col items-center"
        onClick={(e) => e.stopPropagation()}
      >
        <img
          src={imgUrl(img.chemin)}
          alt={img.nom_original ?? ''}
          className="max-w-full max-h-[80vh] object-contain rounded-lg shadow-2xl"
        />
        <div className="mt-3 flex items-center gap-2">
          {img.est_principale && (
            <span className="flex items-center gap-1 text-[11px] font-semibold bg-blue-600 text-white px-2 py-0.5 rounded-full">
              <Star size={9} fill="white" />
              Principale
            </span>
          )}
          {img.nom_original && (
            <span className="text-white/60 text-xs">{img.nom_original}</span>
          )}
        </div>
      </div>

      {/* Bande miniatures */}
      {images.length > 1 && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2 z-10">
          {images.map((thumb, i) => (
            <button
              key={thumb.id}
              onClick={(e) => { e.stopPropagation(); onChange(i) }}
              className={`w-10 h-10 rounded-md overflow-hidden border-2 transition-colors ${
                i === index ? 'border-white' : 'border-white/30 hover:border-white/60'
              }`}
            >
              <img src={imgUrl(thumb.chemin)} alt="" className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>,
    document.body
  )
}

// ─── Composant principal ───────────────────────────────────

export default function ImageManager({ objId, images, queryKey, readOnly = false }: Props) {
  const queryClient = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)

  const invalidate = () => queryClient.invalidateQueries({ queryKey })

  // ── Mutations ────────────────────────────────────────────

  const uploadMutation = useMutation({
    mutationFn: (file: File) => mediaApi.uploadImage(objId, file),
    onSuccess: () => { setUploadError(null); invalidate() },
    onError: (err: { response?: { data?: { detail?: string } } }) => {
      setUploadError(err.response?.data?.detail ?? 'Erreur lors de l\'upload')
    },
  })

  const principaleMutation = useMutation({
    mutationFn: (imgId: number) => mediaApi.setPrincipale(objId, imgId),
    onSuccess: invalidate,
  })

  const deleteMutation = useMutation({
    mutationFn: (imgId: number) => mediaApi.deleteImage(objId, imgId),
    onSuccess: invalidate,
  })

  // ── Gestion des fichiers ─────────────────────────────────

  const handleFile = (file: File) => {
    setUploadError(null)
    if (!file.type.startsWith('image/')) {
      setUploadError('Seules les images sont acceptées (JPEG, PNG, GIF, WebP, SVG)')
      return
    }
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

  // ── Rendu ────────────────────────────────────────────────

  return (
    <div className="space-y-4">

      {/* Grille des images existantes */}
      {images.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {images.map((img, idx) => (
            <div
              key={img.id}
              className={`relative group rounded-xl overflow-hidden border-2 transition-colors cursor-zoom-in ${
                img.est_principale
                  ? 'border-blue-400'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              {/* Miniature — clic → lightbox */}
              <div onClick={() => setLightboxIndex(idx)}>
                <SmartImage
                  src={imgUrl(img.chemin)}
                  alt={img.nom_original ?? ''}
                  className="w-full h-28 object-cover"
                  cropWidth={200}
                  cropHeight={112}
                />
              </div>

              {/* Badge principale */}
              {img.est_principale && (
                <span className="absolute top-1.5 left-1.5 flex items-center gap-1 text-[10px] font-semibold bg-blue-600 text-white px-1.5 py-0.5 rounded-full pointer-events-none">
                  <Star size={9} fill="white" />
                  Principale
                </span>
              )}

              {/* Icône zoom (toujours visible au hover) */}
              <button
                onClick={() => setLightboxIndex(idx)}
                className="absolute top-1.5 right-1.5 p-1 rounded-lg bg-black/40 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                title="Agrandir"
              >
                <ZoomIn size={13} />
              </button>

              {/* Overlay d'actions — éditeurs uniquement */}
              {!readOnly && (
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 pointer-events-none">
                  {!img.est_principale && (
                    <button
                      onClick={(e) => { e.stopPropagation(); principaleMutation.mutate(img.id) }}
                      disabled={principaleMutation.isPending}
                      className="pointer-events-auto flex items-center gap-1 px-2 py-1 text-xs font-medium bg-white text-gray-800 rounded-lg hover:bg-blue-50 hover:text-blue-700 transition-colors"
                      title="Définir comme image principale"
                    >
                      {principaleMutation.isPending ? (
                        <Loader2 size={11} className="animate-spin" />
                      ) : (
                        <Star size={11} />
                      )}
                      Principale
                    </button>
                  )}
                  <button
                    onClick={(e) => { e.stopPropagation(); deleteMutation.mutate(img.id) }}
                    disabled={deleteMutation.isPending}
                    className="pointer-events-auto flex items-center gap-1 px-2 py-1 text-xs font-medium bg-white text-red-600 rounded-lg hover:bg-red-50 transition-colors"
                    title="Supprimer l'image"
                  >
                    {deleteMutation.isPending ? (
                      <Loader2 size={11} className="animate-spin" />
                    ) : (
                      <Trash2 size={11} />
                    )}
                    Supprimer
                  </button>
                </div>
              )}

              {/* Nom du fichier */}
              <div className="px-2 py-1 bg-white border-t border-gray-100">
                <p className="text-[10px] text-gray-500 truncate">{img.nom_original ?? img.chemin}</p>
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
          className={`relative flex flex-col items-center justify-center gap-2 p-6 border-2 border-dashed rounded-xl cursor-pointer transition-colors ${
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
              <Loader2 size={24} className="text-blue-500 animate-spin" />
              <p className="text-sm text-gray-500">Upload en cours…</p>
            </>
          ) : (
            <>
              <div className="p-2 rounded-lg bg-gray-100">
                {images.length === 0 ? (
                  <ImageIcon size={22} className="text-gray-400" />
                ) : (
                  <Upload size={22} className="text-gray-400" />
                )}
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-gray-700">
                  {images.length === 0 ? 'Ajouter une image' : 'Ajouter une autre image'}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">
                  Cliquez ou glissez un fichier · JPEG, PNG, GIF, WebP, SVG · max {MAX_MB} Mo
                </p>
              </div>
            </>
          )}
        </div>
      )}

      {/* Message d'erreur */}
      {!readOnly && uploadError && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {uploadError}
        </p>
      )}

      {/* Visionneuse plein écran */}
      {lightboxIndex !== null && (
        <Lightbox
          images={images}
          index={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onChange={setLightboxIndex}
        />
      )}
    </div>
  )
}
