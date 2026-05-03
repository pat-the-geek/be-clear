/**
 * ValueField — champ de formulaire adapté au type d'une PROP
 *
 * Rendu un input différent selon `prop.type` et met à jour `draft` via `onChange`.
 * `draft` est une copie partielle d'un ValueIn (les champs non utilisés restent null).
 */
import type { PropType } from '@/types'

export interface ValueDraft {
  prop_id: number
  valeur_texte: string | null
  valeur_date: string | null
  valeur_nombre: number | null
  valeur_bool: boolean | null
  valeur_json: Record<string, unknown> | null
  valeur_ref_obj_id: number | null
}

export function emptyDraft(propId: number): ValueDraft {
  return {
    prop_id: propId,
    valeur_texte: null,
    valeur_date: null,
    valeur_nombre: null,
    valeur_bool: null,
    valeur_json: null,
    valeur_ref_obj_id: null,
  }
}

interface Props {
  propId?: number          // non utilisé dans le rendu, mais pratique pour l'appelant
  propNom: string
  propType: PropType
  valeursList?: string[]   // pour type LISTE
  draft: ValueDraft
  onChange: (updated: ValueDraft) => void
  disabled?: boolean
}

const inputClass =
  'w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white disabled:bg-gray-50 disabled:text-gray-400'
const labelClass =
  'block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5'

export default function ValueField({ propNom, propType, valeursList, draft, onChange, disabled }: Props) {
  const set = (patch: Partial<ValueDraft>) =>
    onChange({ ...draft, ...patch })

  const label = <label className={labelClass}>{propNom}</label>

  // ── Types temporels ──────────────────────────────────────
  if (propType === 'DATE') {
    const val = draft.valeur_date ? draft.valeur_date.slice(0, 10) : ''
    return (
      <div>
        {label}
        <input
          type="date"
          className={inputClass}
          value={val}
          onChange={(e) => set({ valeur_date: e.target.value || null })}
          disabled={disabled}
        />
      </div>
    )
  }
  if (propType === 'HEURE') {
    return (
      <div>
        {label}
        <input
          type="time"
          className={inputClass}
          value={draft.valeur_date?.slice(11, 16) ?? ''}
          onChange={(e) => set({ valeur_date: e.target.value || null })}
          disabled={disabled}
        />
      </div>
    )
  }
  if (propType === 'DATETIME') {
    const val = draft.valeur_date ? draft.valeur_date.slice(0, 16) : ''
    return (
      <div>
        {label}
        <input
          type="datetime-local"
          className={inputClass}
          value={val}
          onChange={(e) => set({ valeur_date: e.target.value || null })}
          disabled={disabled}
        />
      </div>
    )
  }

  // ── Durée ────────────────────────────────────────────────
  if (propType === 'DUREE') {
    return (
      <div>
        {label}
        <input
          type="text"
          placeholder="ex: 2h30"
          className={inputClass}
          value={draft.valeur_texte ?? ''}
          onChange={(e) => set({ valeur_texte: e.target.value || null })}
          disabled={disabled}
        />
      </div>
    )
  }

  // ── Types numériques ─────────────────────────────────────
  if (propType === 'ENTIER') {
    return (
      <div>
        {label}
        <input
          type="number"
          step="1"
          className={inputClass}
          value={draft.valeur_nombre ?? ''}
          onChange={(e) => set({ valeur_nombre: e.target.value !== '' ? parseInt(e.target.value) : null })}
          disabled={disabled}
        />
      </div>
    )
  }
  if (propType === 'DECIMAL' || propType === 'MONTANT' || propType === 'POURCENTAGE') {
    const suffix = propType === 'MONTANT' ? ' (€)' : propType === 'POURCENTAGE' ? ' (%)' : ''
    return (
      <div>
        {label}{suffix && <span className="text-xs text-gray-400 ml-1">{suffix}</span>}
        <input
          type="number"
          step="0.01"
          className={inputClass}
          value={draft.valeur_nombre ?? ''}
          onChange={(e) => set({ valeur_nombre: e.target.value !== '' ? parseFloat(e.target.value) : null })}
          disabled={disabled}
        />
      </div>
    )
  }

  // ── Booléen ──────────────────────────────────────────────
  if (propType === 'BOOLEEN') {
    return (
      <div>
        {label}
        <select
          className={inputClass}
          value={draft.valeur_bool === null ? '' : draft.valeur_bool ? '1' : '0'}
          onChange={(e) => set({ valeur_bool: e.target.value === '' ? null : e.target.value === '1' })}
          disabled={disabled}
        >
          <option value="">—</option>
          <option value="1">Oui</option>
          <option value="0">Non</option>
        </select>
      </div>
    )
  }

  // ── Liste ────────────────────────────────────────────────
  if (propType === 'LISTE' && valeursList && valeursList.length > 0) {
    return (
      <div>
        {label}
        <select
          className={inputClass}
          value={draft.valeur_texte ?? ''}
          onChange={(e) => set({ valeur_texte: e.target.value || null })}
          disabled={disabled}
        >
          <option value="">—</option>
          {valeursList.map((v) => (
            <option key={v} value={v}>{v}</option>
          ))}
        </select>
      </div>
    )
  }

  // ── Markdown ─────────────────────────────────────────────
  if (propType === 'MARKDOWN') {
    return (
      <div>
        {label}
        <textarea
          rows={4}
          className={`${inputClass} font-mono resize-y`}
          placeholder="Texte Markdown…"
          value={draft.valeur_texte ?? ''}
          onChange={(e) => set({ valeur_texte: e.target.value || null })}
          disabled={disabled}
        />
        <p className="text-[11px] text-gray-400 mt-1">Syntaxe Markdown supportée</p>
      </div>
    )
  }

  // ── URL ──────────────────────────────────────────────────
  if (propType === 'URL') {
    return (
      <div>
        {label}
        <input
          type="url"
          placeholder="https://…"
          className={inputClass}
          value={draft.valeur_texte ?? ''}
          onChange={(e) => set({ valeur_texte: e.target.value || null })}
          disabled={disabled}
        />
      </div>
    )
  }

  // ── Email ────────────────────────────────────────────────
  if (propType === 'EMAIL') {
    return (
      <div>
        {label}
        <input
          type="email"
          placeholder="adresse@exemple.com"
          className={inputClass}
          value={draft.valeur_texte ?? ''}
          onChange={(e) => set({ valeur_texte: e.target.value || null })}
          disabled={disabled}
        />
      </div>
    )
  }

  // ── Téléphone ────────────────────────────────────────────
  if (propType === 'TELEPHONE') {
    return (
      <div>
        {label}
        <input
          type="tel"
          placeholder="+33 6 00 00 00 00"
          className={inputClass}
          value={draft.valeur_texte ?? ''}
          onChange={(e) => set({ valeur_texte: e.target.value || null })}
          disabled={disabled}
        />
      </div>
    )
  }

  // ── Coordonnées / REFERENCE / fallback texte ─────────────
  return (
    <div>
      {label}
      <input
        type="text"
        className={inputClass}
        value={draft.valeur_texte ?? ''}
        onChange={(e) => set({ valeur_texte: e.target.value || null })}
        disabled={disabled}
      />
    </div>
  )
}
