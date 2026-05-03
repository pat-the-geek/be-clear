/**
 * ImageManager — gestion des images attachées à un OBJ (ORG, ENV…)
 *
 * Fonctionnalités :
 *  • Affichage de toutes les images existantes avec badge "Principale"
 *  • Upload par clic ou drag & drop (JPEG, PNG, GIF, WebP, SVG — max 10 Mo)
 *  • Définir comme image principale
 *  • Supprimer une image
 */
import { useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Upload, Star, Trash2, Loader2, ImageIcon } from 'lucide-react'
import { mediaApi } from '@/services/api'
import type { Img } from '@/types'
import SmartImage from '@/components/shared/SmartImage'

// ─── Types ────────────────────────────────────────────────

interface Props {
  objId: number
  images: Img[]
  /** Clé de query à invalider après chaque mutation (ex: ['org', id]) */
  queryKey: unknown[]
}

// ─── Helpers ──────────────────────────────────────────────

/** URL publique d'une image stockée dans /media/files/ */
export function imgUrl(chemin: string): string {
  return `/api/media/files/${chemin}`
}

const ACCEPT = 'image/jpeg,image/png,image/gif,image/webp,image/svg+xml'
const MAX_MB = 10

// ─── Composant ────────────────────────────────────────────

export default function ImageManager({ objId, images, queryKey }: Props) {
  const queryClient = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)

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
          {images.map((img) => (
            <div
              key={img.id}
              className={`relative group rounded-xl overflow-hidden border-2 transition-colors ${
                img.est_principale
                  ? 'border-blue-400'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              {/* Miniature */}
              <SmartImage
                src={imgUrl(img.chemin)}
                alt={img.nom_original ?? ''}
                className="w-full h-28 object-cover"
                cropWidth={200}
                cropHeight={112}
              />

              {/* Badge principale */}
              {img.est_principale && (
                <span className="absolute top-1.5 left-1.5 flex items-center gap-1 text-[10px] font-semibold bg-blue-600 text-white px-1.5 py-0.5 rounded-full">
                  <Star size={9} fill="white" />
                  Principale
                </span>
              )}

              {/* Overlay d'actions */}
              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                {!img.est_principale && (
                  <button
                    onClick={() => principaleMutation.mutate(img.id)}
                    disabled={principaleMutation.isPending}
                    className="flex items-center gap-1 px-2 py-1 text-xs font-medium bg-white text-gray-800 rounded-lg hover:bg-blue-50 hover:text-blue-700 transition-colors"
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
                  onClick={() => deleteMutation.mutate(img.id)}
                  disabled={deleteMutation.isPending}
                  className="flex items-center gap-1 px-2 py-1 text-xs font-medium bg-white text-red-600 rounded-lg hover:bg-red-50 transition-colors"
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

              {/* Nom du fichier */}
              <div className="px-2 py-1 bg-white border-t border-gray-100">
                <p className="text-[10px] text-gray-500 truncate">{img.nom_original ?? img.chemin}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Zone d'upload */}
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

      {/* Message d'erreur */}
      {uploadError && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {uploadError}
        </p>
      )}
    </div>
  )
}
