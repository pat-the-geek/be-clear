# Design System — be.CLEAR

## Palette des 4 entités

| Entité | Couleur  | Hex       | Justification |
|--------|----------|-----------|---------------|
| ORG    | blue     | `#3b82f6` | Organisations — couleur institutionnelle neutre et fiable |
| ENV    | orange   | `#f97316` | Environnements — chaleur, contexte opérationnel |
| ENG    | amber    | `#f59e0b` | Engagements — dynamisme, action en cours |
| EVENT  | sky      | `#0ea5e9` | Événements — clarté, ponctualité, temporalité |

## Règle violet = Obsidian

**Le violet est réservé exclusivement aux intégrations Obsidian** (liens vault, exports RPT).  
Aucun composant d'entité ne doit utiliser de classes `violet` (bg-violet-*, text-violet-*, etc.).  
EVENT était historiquement violet — remplacé par sky lors du Sprint 1.

## Icônes unifiées par entité

| Entité | Icône lucide-react | Import |
|--------|-------------------|--------|
| ORG    | `Building2`       | `import { Building2 } from 'lucide-react'` |
| ENV    | `Globe`           | `import { Globe } from 'lucide-react'` |
| ENG    | `Handshake`       | `import { Handshake } from 'lucide-react'` |
| EVENT  | `CalendarClock`   | `import { CalendarClock } from 'lucide-react'` |

## Source unique de vérité — couleurs

`frontend/src/lib/entityColors.ts` — **ne pas dupliquer** ces définitions dans d'autres fichiers.

```ts
import { ENTITY_COLORS } from '@/lib/entityColors'
// ENTITY_COLORS.org.hex, .chipBg, .chipText, .pill, etc.
```

## États du ProgressBar (ENG)

| Plage   | Couleur Tailwind | Hex approx. | Signification |
|---------|-----------------|-------------|---------------|
| 0 %     | `bg-gray-200`   | —           | Non démarré   |
| 1–49 %  | `bg-amber-400`  | `#fbbf24`   | En cours (début) |
| 50–99 % | `bg-amber-500`  | `#f59e0b`   | En cours (avancé) |
| 100 %   | `bg-green-500`  | `#22c55e`   | Terminé       |

## Icône application

Quatre carrés arrondis (rx=40) en grille 2×2, couleurs des 4 entités :
- haut-gauche : ORG blue `#3b82f6`
- haut-droite : ENV orange `#f97316`
- bas-gauche : ENG amber `#f59e0b`
- bas-droite : EVENT sky `#0ea5e9`

Source SVG : `frontend/public/icon.svg`
