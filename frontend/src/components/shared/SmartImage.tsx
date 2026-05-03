/**
 * SmartImage — image avec recadrage intelligent centré sur le visage
 *
 * Utilise smartcrop.js pour détecter la zone d'intérêt (visage, sujet principal)
 * et applique automatiquement le bon `object-position` CSS.
 *
 * • Le calcul n'est fait qu'une fois par URL grâce au cache module-level.
 * • Pendant l'analyse, l'image est affichée centrée (fallback).
 * • Props identiques à un <img> standard (src, alt, className, style).
 */
import { useEffect, useState } from 'react'
import smartcrop from 'smartcrop'

// ─── Cache global des positions (survit aux re-renders) ───────
const positionCache = new Map<string, string>()

// ─── Types ────────────────────────────────────────────────────
interface SmartImageProps {
  src: string
  alt?: string
  className?: string
  style?: React.CSSProperties
  /** Largeur de la zone d'affichage — aide smartcrop à choisir le ratio */
  cropWidth?: number
  /** Hauteur de la zone d'affichage */
  cropHeight?: number
}

// ─── Composant ────────────────────────────────────────────────
export default function SmartImage({
  src,
  alt = '',
  className = '',
  style,
  cropWidth = 200,
  cropHeight = 200,
}: SmartImageProps) {
  const [objectPosition, setObjectPosition] = useState<string>(
    () => positionCache.get(src) ?? 'center 20%'
    // 'center 20%' : heuristique initiale — les visages sont souvent
    // dans le tiers supérieur de la photo
  )

  useEffect(() => {
    if (!src) return

    // Résultat déjà en cache → appliquer immédiatement
    if (positionCache.has(src)) {
      setObjectPosition(positionCache.get(src)!)
      return
    }

    // Charger l'image dans un élément off-screen pour l'analyser
    // Pas de crossOrigin : images same-origin, inutile et pollue le canvas
    const img = new Image()

    img.onload = () => {
      smartcrop
        .crop(img, { width: cropWidth, height: cropHeight })
        .then((result) => {
          const crop = result.topCrop
          // Centre du crop en pourcentage de l'image source
          const x = Math.round(((crop.x + crop.width / 2) / img.naturalWidth) * 100)
          const y = Math.round(((crop.y + crop.height / 2) / img.naturalHeight) * 100)
          const pos = `${x}% ${y}%`
          positionCache.set(src, pos)
          setObjectPosition(pos)
        })
        .catch(() => {
          // En cas d'erreur (canvas CORS, etc.) → garder le fallback
          positionCache.set(src, 'center 20%')
        })
    }

    img.onerror = () => {
      positionCache.set(src, 'center 20%')
    }

    img.src = src
  }, [src, cropWidth, cropHeight])

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      style={{ ...style, objectPosition }}
    />
  )
}
