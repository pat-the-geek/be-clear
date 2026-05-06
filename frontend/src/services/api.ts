import axios from 'axios'
import { useAuthStore } from '@/stores/authStore'

// ─── Instance Axios ──────────────────────────────────────
export const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
})

// Injecte le JWT dans chaque requête
api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Redirige vers /login si le token est expiré
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      useAuthStore.getState().logout()
      window.location.href = '/login'
    }
    return Promise.reject(error)
  },
)

// ─── Auth ────────────────────────────────────────────────
export const authApi = {
  login: (credentials: { username: string; password: string }) =>
    api.post<{ access_token: string; token_type: string }>('/auth/login', credentials),
  me: () => api.get('/auth/me'),
  changePassword: (currentPassword: string, newPassword: string) =>
    api.post('/auth/change-password', { current_password: currentPassword, new_password: newPassword }),
}

// ─── ORG ─────────────────────────────────────────────────
export const orgApi = {
  list: (params?: { torg_id?: number; q?: string; created_by_me?: boolean; page?: number; per_page?: number }) =>
    api.get('/org', { params }),
  get: (id: number) => api.get(`/org/${id}`),
  create: (data: unknown) => api.post('/org', data),
  update: (id: number, data: unknown) => api.put(`/org/${id}`, data),
  delete: (id: number) => api.delete(`/org/${id}`),
  report: (id: number) => api.post(`/rpt/org/${id}`),
}

// ─── ENV ─────────────────────────────────────────────────
export const envApi = {
  list: (params?: { tenv_id?: number; q?: string; created_by_me?: boolean; page?: number; per_page?: number }) =>
    api.get('/env', { params }),
  get: (id: number) => api.get(`/env/${id}`),
  create: (data: unknown) => api.post('/env', data),
  update: (id: number, data: unknown) => api.put(`/env/${id}`, data),
  delete: (id: number) => api.delete(`/env/${id}`),
  report: (id: number) => api.post(`/rpt/env/${id}`),
}

// ─── ENG ─────────────────────────────────────────────────
export const engApi = {
  list: (params?: { org_id?: number; env_id?: number; teng_id?: number; q?: string; created_by_me?: boolean; sort_by?: string; sort_dir?: string; page?: number; per_page?: number }) =>
    api.get('/eng', { params }),
  get: (id: number) => api.get(`/eng/${id}`),
  create: (data: unknown) => api.post('/eng', data),
  update: (id: number, data: unknown) => api.put(`/eng/${id}`, data),
  delete: (id: number) => api.delete(`/eng/${id}`),
  gantt: (id: number) => api.get(`/eng/${id}/gantt`),
}

// ─── EVENT ───────────────────────────────────────────────
export const eventApi = {
  list: (params?: { eng_id?: number; tevent_id?: number; accompli?: boolean; date_from?: string; date_to?: string; page?: number; per_page?: number }) =>
    api.get('/event', { params }),
  listByEng: (engId: number) => api.get('/event', { params: { eng_id: engId } }),
  get: (id: number) => api.get(`/event/${id}`),
  create: (data: unknown) => api.post('/event', data),
  update: (id: number, data: unknown) => api.put(`/event/${id}`, data),
  delete: (id: number) => api.delete(`/event/${id}`),
  suggest: (engId: number) => api.get('/event/suggest', { params: { eng_id: engId } }),
  upcoming: (limit = 20) => api.get('/event/upcoming', { params: { limit } }),
  overdue:  (limit = 20) => api.get('/event/overdue',  { params: { limit } }),
}

// ─── TORG / TENV ─────────────────────────────────────────
export const torgApi = {
  tree: () => api.get('/torg/tree'),
  list: () => api.get('/torg'),
  create: (data: unknown) => api.post('/torg', data),
  update: (id: number, data: unknown) => api.put(`/torg/${id}`, data),
  delete: (id: number) => api.delete(`/torg/${id}`),
}

export const tenvApi = {
  tree: () => api.get('/tenv/tree'),
  list: () => api.get('/tenv'),
  create: (data: unknown) => api.post('/tenv', data),
  update: (id: number, data: unknown) => api.put(`/tenv/${id}`, data),
  delete: (id: number) => api.delete(`/tenv/${id}`),
}

// ─── TENG / TEVENT ───────────────────────────────────────
export const tengApi = {
  list: () => api.get('/teng'),
  get: (id: number) => api.get(`/teng/${id}`),
  create: (data: unknown) => api.post('/teng', data),
  update: (id: number, data: unknown) => api.put(`/teng/${id}`, data),
  delete: (id: number) => api.delete(`/teng/${id}`),
}

export const teventApi = {
  list: () => api.get('/tevent'),
  get: (id: number) => api.get(`/tevent/${id}`),
  create: (data: unknown) => api.post('/tevent', data),
  update: (id: number, data: unknown) => api.put(`/tevent/${id}`, data),
  delete: (id: number) => api.delete(`/tevent/${id}`),
}

// ─── CLA / PROP ──────────────────────────────────────────
export const claApi = {
  list: () => api.get('/cla'),
  get: (id: number) => api.get(`/cla/${id}`),
  create: (data: unknown) => api.post('/cla', data),
  update: (id: number, data: unknown) => api.put(`/cla/${id}`, data),
  delete: (id: number) => api.delete(`/cla/${id}`),
  propsAll: (claId: number) => api.get(`/cla/${claId}/props-all`),
  listProps: (claId: number) => api.get(`/cla/${claId}/prop`),
  addProp: (claId: number, data: unknown) => api.post(`/cla/${claId}/prop`, data),
  updateProp: (claId: number, propId: number, data: unknown) => api.put(`/cla/${claId}/prop/${propId}`, data),
  deleteProp: (claId: number, propId: number) => api.delete(`/cla/${claId}/prop/${propId}`),
}

// ─── Recherche & RAG ─────────────────────────────────────
export const searchApi = {
  search: (q: string) => api.get('/search', { params: { q } }),
}

export const ragApi = {
  query: (data: { question: string; llm_id?: number }) =>
    api.post('/rag/query', data),
  llms: () => api.get('/rag/llms'),
}

// ─── USER ─────────────────────────────────────────────────
export const userApi = {
  list:        (params?: { page?: number; per_page?: number }) => api.get('/user', { params }),
  get:         (id: number) => api.get(`/user/${id}`),
  create:      (data: unknown) => api.post('/user', data),
  update:      (id: number, data: unknown) => api.put(`/user/${id}`, data),
  delete:      (id: number) => api.delete(`/user/${id}`),
  setPassword: (id: number, password: string) => api.post(`/user/${id}/set-password`, { password }),
  roles:       () => api.get('/user/roles'),
}

// ─── CONFIG ───────────────────────────────────────────────
export const configApi = {
  get:           ()                       => api.get('/config'),
  update:        (data: unknown)          => api.put('/config', data),
  listLlm:       ()                       => api.get('/config/llm'),
  createLlm:     (data: unknown)          => api.post('/config/llm', data),
  updateLlm:     (id: number, data: unknown) => api.put(`/config/llm/${id}`, data),
  deleteLlm:     (id: number)             => api.delete(`/config/llm/${id}`),
  listTokens:    ()                       => api.get('/config/token'),
  createToken:   (data: unknown)          => api.post('/config/token', data),
  deleteToken:   (id: number)             => api.delete(`/config/token/${id}`),
}

// ─── RPT ──────────────────────────────────────────────────
export const rptApi = {
  org: (id: number, destination: 'filesystem' | 'obsidian' = 'filesystem') =>
    api.post(`/rpt/org/${id}`, { destination }),
  env: (id: number, destination: 'filesystem' | 'obsidian' = 'filesystem') =>
    api.post(`/rpt/env/${id}`, { destination }),
  downloadOrg: (id: number) =>
    api.get(`/rpt/org/${id}/download`, { responseType: 'blob' }),
  downloadEnv: (id: number) =>
    api.get(`/rpt/env/${id}/download`, { responseType: 'blob' }),
}

// ─── LOG ─────────────────────────────────────────────────
export const logApi = {
  list: (params?: { table_name?: string; user_id?: number; operation?: string; date_from?: string; date_to?: string; page?: number }) =>
    api.get('/log', { params }),
}

// ─── MEDIA — Images & Documents ──────────────────────────
export const mediaApi = {
  uploadImage: (objId: number, file: File) => {
    const form = new FormData()
    form.append('file', file)
    return api.post(`/media/obj/${objId}/images`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },
  setPrincipale: (objId: number, imgId: number) =>
    api.put(`/media/obj/${objId}/images/${imgId}/principale`),
  deleteImage: (objId: number, imgId: number) =>
    api.delete(`/media/obj/${objId}/images/${imgId}`),
  uploadDoc: (objId: number, file: File) => {
    const form = new FormData()
    form.append('file', file)
    return api.post(`/media/obj/${objId}/documents`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },
  deleteDoc: (objId: number, docId: number) =>
    api.delete(`/media/obj/${objId}/documents/${docId}`),
}

// ─── URL Tools ───────────────────────────────────────────
export const urlApi = {
  check:     (url: string)                       => api.get('/url/check',     { params: { url } }),
  preview:   (url: string)                       => api.get('/url/preview',   { params: { url } }),
  index:     (url: string)                       => api.post('/url/index',    null, { params: { url } }),
  summarize: (url: string, llm_id?: number)      => api.post('/url/summarize', null, { params: { url, llm_id } }),
}

