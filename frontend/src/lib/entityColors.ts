/**
 * Charte chromatique des entités — be.CLEAR (source unique de vérité)
 *
 * ORG   → bleu   (blue)
 * ENV   → orange (orange)
 * ENG   → ambre  (amber)
 * EVENT → ciel   (sky)   ← anciennement violet (réservé Obsidian)
 */

export type EntityColorConfig = {
  pill: string; chipBg: string; chipText: string;
  buttonPrimary: string; buttonHover: string;
  sidebarActive: string; sidebarText: string;
  focusRing: string; hex: string;
};

export const ENTITY_COLORS: Record<string, EntityColorConfig> = {
  org: {
    pill:          'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
    chipBg:        'bg-blue-100',    chipText:      'text-blue-700',
    buttonPrimary: 'bg-blue-600',    buttonHover:   'hover:bg-blue-700',
    sidebarActive: 'bg-blue-50',     sidebarText:   'text-blue-700',
    focusRing:     'focus:ring-blue-500', hex:       '#3b82f6',
  },
  env: {
    pill:          'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
    chipBg:        'bg-orange-100',  chipText:      'text-orange-700',
    buttonPrimary: 'bg-orange-600',  buttonHover:   'hover:bg-orange-700',
    sidebarActive: 'bg-orange-50',   sidebarText:   'text-orange-700',
    focusRing:     'focus:ring-orange-500', hex:    '#f97316',
  },
  eng: {
    pill:          'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
    chipBg:        'bg-amber-100',   chipText:      'text-amber-700',
    buttonPrimary: 'bg-amber-600',   buttonHover:   'hover:bg-amber-700',
    sidebarActive: 'bg-amber-50',    sidebarText:   'text-amber-700',
    focusRing:     'focus:ring-amber-500', hex:     '#f59e0b',
  },
  event: {
    pill:          'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300',
    chipBg:        'bg-sky-100',     chipText:      'text-sky-700',
    buttonPrimary: 'bg-sky-600',     buttonHover:   'hover:bg-sky-700',
    sidebarActive: 'bg-sky-50',      sidebarText:   'text-sky-700',
    focusRing:     'focus:ring-sky-500', hex:       '#0ea5e9',
  },
};
