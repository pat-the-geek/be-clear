// ─────────────────────────────────────────────
// Types TypeScript — be.CLEAR
// Correspondent aux modèles du backend
// ─────────────────────────────────────────────

export type Role = 'ADMIN' | 'EDITEUR' | 'LECTEUR'

export interface UserBrief {
  id: number
  nom: string
}

export interface User {
  id: number
  obj: Obj
  tuser: Tuser
  role?: Role
  org_id?: number
  auth_uid?: string
  est_actif: boolean
}

export interface Tuser {
  id: number
  valeur: string
}

// ─── Partie Objet ───────────────────────────

export interface Cla {
  id: number
  nom: string
  comportement?: string
  visuel_type?: 'icone' | 'image'
  visuel_valeur?: string
  super_classe_id?: number
  super_classe_nom?: string
  props: Prop[]   // props directes de la classe (retournées par l'API)
}

export interface ClaDetail extends Cla {
  props_heritees: Prop[]  // props héritées de la super-classe (et de toute la chaîne)
}

export type PropType =
  | 'DATE' | 'HEURE' | 'DATETIME' | 'DUREE'
  | 'TEXTE' | 'MARKDOWN'
  | 'ENTIER' | 'DECIMAL' | 'MONTANT' | 'POURCENTAGE'
  | 'BOOLEEN' | 'LISTE'
  | 'URL' | 'EMAIL' | 'TELEPHONE'
  | 'REFERENCE' | 'COORDONNEES'

export interface Prop {
  id: number
  cla_id?: number      // absent dans PropRef (ValueOut), présent dans PropOut (CLA endpoint)
  nom: string
  type: PropType
  valeurs_liste?: string[]  // présent quand le type === 'LISTE'
}

export interface Value {
  id: number
  // prop_id N'EST PAS retourné au niveau racine par ValueOut — utiliser value.prop.id
  prop: Prop
  valeur_texte?: string
  valeur_date?: string       // ISO 8601
  valeur_nombre?: number
  valeur_bool?: boolean
  valeur_json?: Record<string, unknown>
  valeur_ref_obj_id?: number
}

export interface Img {
  id: number
  chemin: string
  nom_original?: string | null
  est_principale: boolean
  mime_type?: string | null
}

export interface Doc {
  id: number
  chemin: string
  nom_original: string
  format: 'markdown' | 'office'
  taille_octets?: number
}

export interface Obj {
  id: number
  uid: string
  nom: string
  description?: string
  cla: Cla
  values: Value[]
  images: Img[]
  documents: Doc[]
  created_at: string
  updated_at: string
  created_by?: UserBrief
  updated_by?: UserBrief
}

// ─── Partie Activité ────────────────────────

export interface Torg {
  id: number
  nom: string
  cla: Cla
  parent_id?: number
  enfants?: Torg[]
  chemin?: string
}

export interface Tenv {
  id: number
  nom: string
  cla: Cla
  parent_id?: number
  enfants?: Tenv[]
  chemin?: string
}

export interface Teng {
  id: number
  nom: string
  cla: Cla
}

export interface Tevent {
  id: number
  nom: string
  cla: Cla
  duree_prevue_valeur?: number
  duree_prevue_unite?: 'secondes' | 'minutes' | 'heures' | 'jours' | 'mois'
}

/** Vue détail (endpoint GET /org/:id) */
export interface Org {
  id: number
  obj: Obj
  torg: Torg
  torg_id: number
}

/** Vue liste (endpoint GET /org) — champ `obj` absent */
export interface OrgBrief {
  id: number
  nom: string
  torg: Torg
  image_principale: Img | null
  updated_at?: string
}

/** Vue détail (endpoint GET /env/:id) */
export interface Env {
  id: number
  obj: Obj
  tenv: Tenv
  tenv_id: number
}

/** Vue liste (endpoint GET /env) — champ `obj` absent */
export interface EnvBrief {
  id: number
  nom: string
  tenv: Tenv
  image_principale: Img | null
  updated_at?: string
}

/** Vue liste (endpoint GET /eng) — champ `obj` absent */
export interface EngBrief {
  id: number
  nom: string
  teng: Teng
  accomplissement?: number
  nb_events?: number
  org_principale_nom?: string | null
  env_principale_nom?: string | null
  date_debut?: string
  date_debut_prevue?: string
  date_fin?: string
  date_fin_prevue?: string
  created_at?: string
  updated_at?: string
  created_by_nom?: string
  updated_by_nom?: string
}

/** Référence légère ORG dans un ENG (vue liste) */
export interface OrgRef {
  id: number
  nom: string
}

/** Référence légère ENV dans un ENG (vue liste) */
export interface EnvRef {
  id: number
  nom: string
}

/** Event résumé tel que retourné dans EngOut */
export interface EngEventBrief {
  id: number
  date_heure_prevue: string
  date_heure_reelle?: string
  tevent_nom: string
  obj_nom: string
  est_accompli: boolean
}

export interface Eng {
  id: number
  obj: Obj
  teng: Teng
  orgs: OrgRef[]
  envs: EnvRef[]
  org_principale?: OrgRef | null
  env_principale?: EnvRef | null
  events: EngEventBrief[]
  date_debut?: string
  date_debut_prevue?: string
  date_fin?: string
  date_fin_prevue?: string
  accomplissement?: number    // 0–100
  gantt_mermaid?: string
}

export interface Event {
  id: number
  obj: Obj
  eng_id: number
  tevent: Tevent
  date_heure_prevue: string   // ISO 8601 — NOT NULL
  date_heure_reelle?: string  // NULL = non accompli
}

// ─── API générique ──────────────────────────

export interface PaginatedResponse<T> {
  items: T[]
  total: number
  page: number
  per_page: number
}

export interface ApiError {
  detail: string
}
