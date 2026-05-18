import type { AxiosResponse } from 'axios'

/**
 * Déclenche le téléchargement d'une réponse Axios de type blob dans le
 * répertoire par défaut du navigateur. Le nom de fichier est extrait de
 * l'en-tête Content-Disposition, avec repli sur `fallbackName`.
 */
export function downloadBlobResponse(res: AxiosResponse<Blob>, fallbackName: string) {
  const cd = (res.headers['content-disposition'] as string | undefined) ?? ''
  const match = cd.match(/filename\*?=(?:UTF-8'')?"?([^"]+)"?/i)
  const filename = match ? decodeURIComponent(match[1]) : fallbackName

  const url = URL.createObjectURL(res.data)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
