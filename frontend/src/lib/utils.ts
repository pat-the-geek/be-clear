import { format, parseISO } from 'date-fns'
import { fr } from 'date-fns/locale'

export function formatDate(iso: string | undefined): string {
  if (!iso) return '—'
  return format(parseISO(iso), 'dd/MM/yyyy', { locale: fr })
}

export function formatDateTime(iso: string | undefined): string {
  if (!iso) return '—'
  return format(parseISO(iso), 'dd/MM/yyyy HH:mm', { locale: fr })
}

/** Classe CSS conditionnelle (utilitaire léger sans clsx) */
export function cn(...classes: (string | undefined | false | null)[]): string {
  return classes.filter(Boolean).join(' ')
}
