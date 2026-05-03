/**
 * Charte chromatique des types d'entités — be.CLEAR
 *
 * TORG   → bleu   (blue)
 * TENV   → orange (orange)
 * TENG   → jaune  (amber)
 * TEVENT → violet (violet)
 */

export const entityColors = {
  torg: {
    pill:          'bg-blue-100 text-blue-700',
    pillSoft:      'bg-blue-50 text-blue-700 hover:bg-blue-100',
    selectedItem:  'bg-blue-50 border-r-2 border-blue-500',
    selectedNode:  'bg-blue-100 text-blue-800 font-medium',
    iconSelected:  'text-blue-500',
    iconBox:       'bg-blue-100 border-blue-200',
    textSelected:  'text-blue-700',
    hoverBtn:      'hover:text-blue-600 hover:bg-blue-50',
    hoverText:     'hover:text-blue-600',
    ring:          'focus:ring-blue-500',
    btn:           'bg-blue-600 hover:bg-blue-700',
    sortActive:    'text-blue-600',
    rowHover:      'hover:bg-blue-50',
    externalLink:  'hover:text-blue-500',
  },
  tenv: {
    pill:          'bg-orange-100 text-orange-700',
    pillSoft:      'bg-orange-50 text-orange-700 hover:bg-orange-100',
    selectedItem:  'bg-orange-50 border-r-2 border-orange-500',
    selectedNode:  'bg-orange-100 text-orange-800 font-medium',
    iconSelected:  'text-orange-500',
    iconBox:       'bg-orange-100 border-orange-200',
    textSelected:  'text-orange-700',
    hoverBtn:      'hover:text-orange-600 hover:bg-orange-50',
    hoverText:     'hover:text-orange-600',
    ring:          'focus:ring-orange-500',
    btn:           'bg-orange-600 hover:bg-orange-700',
    sortActive:    'text-orange-600',
    rowHover:      'hover:bg-orange-50',
    externalLink:  'hover:text-orange-500',
  },
  teng: {
    pill:          'bg-amber-100 text-amber-700',
  },
  tevent: {
    pill:          'bg-violet-100 text-violet-700',
  },
} as const

export type EntityTypeName = keyof typeof entityColors
