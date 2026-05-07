import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'

export interface GNode {
  id: string
  type: 'org' | 'env' | 'eng'
  nom: string
  entity_id: number
  degree: number
}

export interface GEdge {
  source: string
  target: string
}

interface Props {
  nodes: GNode[]
  edges: GEdge[]
  focalId?: string
  height?: number
  highlightQuery?: string   // met en avant les nœuds dont le nom contient cette chaîne
}

const COL: Record<string, string> = {
  org: '#3b82f6',
  env: '#f97316',
  eng: '#f59e0b',
}

const TYPE_LABEL: Record<string, string> = {
  org: 'Organisation',
  env: 'Environnement',
  eng: 'Engagement',
}

function nodeR(degree: number, focal: boolean) {
  return Math.min(focal ? 16 : 8 + degree * 2.2, 30)
}

interface SNode extends GNode {
  x: number; y: number
  vx: number; vy: number
  fx?: number; fy?: number
}

export default function ForceGraph({ nodes, edges, focalId, height = 420, highlightQuery = '' }: Props) {
  const cvs = useRef<HTMLCanvasElement>(null)
  const tip = useRef<HTMLDivElement>(null)
  const raf = useRef(0)
  const sn = useRef<SNode[]>([])
  const se = useRef<Array<{ s: SNode; t: SNode }>>([])
  const tf = useRef({ x: 0, y: 0, sc: 1 })
  const drag = useRef<{ nd: SNode; moved: boolean } | null>(null)
  const pan = useRef({ on: false, mx: 0, my: 0, ox: 0, oy: 0 })
  const hover = useRef<SNode | null>(null)
  const hlQuery = useRef(highlightQuery)
  const nav = useNavigate()

  // Sync highlightQuery sans re-initialiser la simulation
  useEffect(() => { hlQuery.current = highlightQuery }, [highlightQuery])

  // ── Init simulation ──────────────────────────────────────
  useEffect(() => {
    const el = cvs.current
    if (!el) return
    const W = el.offsetWidth || 600, H = height
    const cx = W / 2, cy = H / 2

    sn.current = nodes.map((n, i) => {
      if (n.id === focalId) return { ...n, x: cx, y: cy, vx: 0, vy: 0 }
      const a = (2 * Math.PI * i) / Math.max(1, nodes.length)
      const r = 100 + Math.random() * 70
      return { ...n, x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r, vx: 0, vy: 0 }
    })

    const nm = new Map(sn.current.map(n => [n.id, n]))
    se.current = edges
      .map(e => ({ s: nm.get(e.source)!, t: nm.get(e.target)! }))
      .filter(e => e.s && e.t)

    // Recentrer la vue à chaque nouveau jeu de données
    tf.current = { x: 0, y: 0, sc: 1 }
  }, [nodes, edges, focalId, height])

  // ── Animation loop ───────────────────────────────────────
  useEffect(() => {
    let alive = true

    function physics() {
      const el = cvs.current
      if (!el || sn.current.length === 0) return
      const W = el.offsetWidth, H = height
      const cx = W / 2, cy = H / 2

      const ns = sn.current, es = se.current
      const REP = 6000, SPRING = 0.04, REST = 130
      const GRAV = 0.014, FGRAV = 0.09, DAMP = 0.72, NOISE = 0.32

      for (let i = 0; i < ns.length; i++) {
        for (let j = i + 1; j < ns.length; j++) {
          const a = ns[i], b = ns[j]
          const dx = (b.x - a.x) || 0.1, dy = b.y - a.y
          const d2 = dx * dx + dy * dy + 120
          const d = Math.sqrt(d2)
          const f = REP / d2
          const fx = dx / d * f, fy = dy / d * f
          if (a.fx === undefined) { a.vx -= fx; a.vy -= fy }
          if (b.fx === undefined) { b.vx += fx; b.vy += fy }
        }
      }

      for (const { s, t } of es) {
        const dx = t.x - s.x, dy = t.y - s.y
        const d = Math.sqrt(dx * dx + dy * dy) || 1
        const f = (d - REST) * SPRING
        const fx = dx / d * f, fy = dy / d * f
        if (s.fx === undefined) { s.vx += fx; s.vy += fy }
        if (t.fx === undefined) { t.vx -= fx; t.vy -= fy }
      }

      for (const n of ns) {
        if (n.fx !== undefined) { n.x = n.fx; n.y = n.fy!; continue }
        const g = n.id === focalId ? FGRAV : GRAV
        n.vx += (cx - n.x) * g
        n.vy += (cy - n.y) * g
        n.vx += (Math.random() - 0.5) * NOISE
        n.vy += (Math.random() - 0.5) * NOISE
        n.vx *= DAMP; n.vy *= DAMP
        n.x += n.vx; n.y += n.vy
        const r = nodeR(n.degree, n.id === focalId)
        n.x = Math.max(r + 4, Math.min(W - r - 4, n.x))
        n.y = Math.max(r + 4, Math.min(H - r - 4, n.y))
      }
    }

    function draw() {
      const canvas = cvs.current
      if (!canvas) return
      const ctx = canvas.getContext('2d')
      if (!ctx) return

      const dpr = window.devicePixelRatio || 1
      const W = canvas.offsetWidth, H = height
      if (canvas.width !== W * dpr) { canvas.width = W * dpr; canvas.style.width = `${W}px` }
      if (canvas.height !== H * dpr) { canvas.height = H * dpr; canvas.style.height = `${H}px` }

      ctx.save()
      ctx.scale(dpr, dpr)
      ctx.fillStyle = '#0f1117'
      ctx.fillRect(0, 0, W, H)
      ctx.translate(tf.current.x, tf.current.y)
      ctx.scale(tf.current.sc, tf.current.sc)

      const hov = hover.current
      const q = hlQuery.current.trim().toLowerCase()
      const hasQuery = q.length >= 2

      // Ensemble de connexions du nœud survolé
      const conn = hov
        ? new Set([hov.id, ...se.current
            .filter(e => e.s.id === hov.id || e.t.id === hov.id)
            .flatMap(e => [e.s.id, e.t.id])])
        : null

      // Edges
      for (const { s, t } of se.current) {
        const active = conn ? (conn.has(s.id) && conn.has(t.id)) : false
        ctx.beginPath()
        ctx.moveTo(s.x, s.y); ctx.lineTo(t.x, t.y)
        ctx.strokeStyle = active ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.22)'
        ctx.lineWidth = active ? 2 : 1.2
        ctx.stroke()
      }

      // Nodes
      for (const n of sn.current) {
        const focal = n.id === focalId
        const r = nodeR(n.degree, focal)
        const col = COL[n.type] ?? '#888'
        const isHov = hov?.id === n.id
        const dimByHover = conn && !conn.has(n.id)
        const matchesQuery = hasQuery && n.nom.toLowerCase().includes(q)
        const dimByQuery = hasQuery && !matchesQuery

        ctx.save()
        ctx.globalAlpha = (dimByHover || dimByQuery) ? 0.15 : 1
        ctx.shadowColor = col
        ctx.shadowBlur = isHov ? 36 : focal ? 26 : matchesQuery ? 32 : 15

        ctx.beginPath()
        ctx.arc(n.x, n.y, r, 0, Math.PI * 2)
        ctx.fillStyle = isHov || focal || matchesQuery ? col : col + 'bb'
        ctx.fill()

        // Anneau blanc pour le nœud focal
        if (focal) {
          ctx.strokeStyle = 'rgba(255,255,255,0.28)'
          ctx.lineWidth = 2; ctx.stroke()
        }

        // Anneau blanc pour les nœuds trouvés par la recherche
        if (matchesQuery && !focal) {
          ctx.strokeStyle = 'rgba(255,255,255,0.7)'
          ctx.lineWidth = 2; ctx.stroke()
        }

        ctx.shadowBlur = 0

        const fsize = Math.max(10, Math.min(13, r * 0.85))
        ctx.font = `${focal || isHov || matchesQuery ? 700 : 500} ${fsize}px Inter,system-ui,sans-serif`
        ctx.fillStyle = focal || isHov || matchesQuery ? '#fff' : 'rgba(255,255,255,0.88)'
        ctx.textAlign = 'center'; ctx.textBaseline = 'top'
        const lbl = n.nom.length > 22 ? n.nom.slice(0, 20) + '…' : n.nom
        ctx.fillText(lbl, n.x, n.y + r + 4)
        ctx.restore()
      }

      ctx.restore()
    }

    const loop = () => {
      if (!alive) return
      physics(); draw()
      raf.current = requestAnimationFrame(loop)
    }
    raf.current = requestAnimationFrame(loop)
    return () => { alive = false; cancelAnimationFrame(raf.current) }
  }, [focalId, height])

  // ── Helpers ──────────────────────────────────────────────
  const toSim = (mx: number, my: number) => {
    const r = cvs.current!.getBoundingClientRect()
    return { x: (mx - r.left - tf.current.x) / tf.current.sc, y: (my - r.top - tf.current.y) / tf.current.sc }
  }

  const hit = (sx: number, sy: number): SNode | null => {
    for (let i = sn.current.length - 1; i >= 0; i--) {
      const n = sn.current[i]
      const r = nodeR(n.degree, n.id === focalId)
      if ((n.x - sx) ** 2 + (n.y - sy) ** 2 <= r * r) return n
    }
    return null
  }

  const updateTooltip = (node: SNode | null, clientX: number, clientY: number) => {
    const el = tip.current
    if (!el) return
    if (!node) { el.style.display = 'none'; return }
    const rect = cvs.current!.getBoundingClientRect()
    const left = clientX - rect.left + 14
    const top = clientY - rect.top - 38
    el.style.display = 'block'
    el.style.left = `${left}px`
    el.style.top = `${top}px`
    el.innerHTML = `<span style="color:${COL[node.type]};font-weight:600">${node.nom}</span><span style="color:rgba(255,255,255,0.4);font-size:10px;margin-left:6px">${TYPE_LABEL[node.type]}</span>`
  }

  // ── Mouse events ─────────────────────────────────────────
  const onMM = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!cvs.current) return
    const { x, y } = toSim(e.clientX, e.clientY)
    if (drag.current) {
      drag.current.moved = true
      drag.current.nd.fx = x; drag.current.nd.fy = y
      return
    }
    if (pan.current.on) {
      tf.current.x = pan.current.ox + e.clientX - pan.current.mx
      tf.current.y = pan.current.oy + e.clientY - pan.current.my
      return
    }
    const n = hit(x, y)
    hover.current = n
    cvs.current.style.cursor = n ? 'pointer' : 'grab'
    updateTooltip(n, e.clientX, e.clientY)
  }

  const onMD = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!cvs.current) return
    const { x, y } = toSim(e.clientX, e.clientY)
    const n = hit(x, y)
    if (n) { drag.current = { nd: n, moved: false }; n.fx = n.x; n.fy = n.y }
    else pan.current = { on: true, mx: e.clientX, my: e.clientY, ox: tf.current.x, oy: tf.current.y }
  }

  const onMU = () => {
    if (drag.current) {
      const { nd, moved } = drag.current
      if (!moved) {
        nav(nd.type === 'org' ? `/org/${nd.entity_id}` : nd.type === 'env' ? `/env/${nd.entity_id}` : `/eng/${nd.entity_id}`)
      }
      nd.fx = undefined; nd.fy = undefined; drag.current = null
    }
    pan.current.on = false
  }

  const onWhl = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault()
    if (!cvs.current) return
    const r = cvs.current.getBoundingClientRect()
    const mx = e.clientX - r.left, my = e.clientY - r.top
    const f = e.deltaY < 0 ? 1.1 : 0.9
    const ns = Math.max(0.25, Math.min(4, tf.current.sc * f))
    tf.current.x = mx - (mx - tf.current.x) * ns / tf.current.sc
    tf.current.y = my - (my - tf.current.y) * ns / tf.current.sc
    tf.current.sc = ns
  }

  const onML = () => {
    if (drag.current) { drag.current.nd.fx = undefined; drag.current.nd.fy = undefined; drag.current = null }
    pan.current.on = false; hover.current = null
    if (cvs.current) cvs.current.style.cursor = 'default'
    if (tip.current) tip.current.style.display = 'none'
  }

  const zoomBy = (factor: number) => {
    if (!cvs.current) return
    const W = cvs.current.offsetWidth, H = height
    const cx = W / 2, cy = H / 2
    const ns = Math.max(0.25, Math.min(4, tf.current.sc * factor))
    tf.current.x = cx - (cx - tf.current.x) * ns / tf.current.sc
    tf.current.y = cy - (cy - tf.current.y) * ns / tf.current.sc
    tf.current.sc = ns
  }

  const resetView = () => { tf.current = { x: 0, y: 0, sc: 1 } }

  if (nodes.length === 0) {
    return (
      <div className="w-full rounded-xl flex items-center justify-center text-sm text-gray-500"
        style={{ height, background: '#0f1117' }}>
        Aucune relation à afficher
      </div>
    )
  }

  const btnStyle: React.CSSProperties = {
    background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.2)',
    color: 'rgba(255,255,255,0.9)', height: 24, borderRadius: 6,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    cursor: 'pointer', padding: '0 7px', fontSize: 12, lineHeight: 1,
  }

  return (
    <div className="relative w-full rounded-xl overflow-hidden select-none" style={{ height, background: '#0f1117' }}>
      <canvas
        ref={cvs}
        className="w-full h-full block"
        onMouseMove={onMM}
        onMouseDown={onMD}
        onMouseUp={onMU}
        onMouseLeave={onML}
        onWheel={onWhl}
      />

      {/* Tooltip HTML */}
      <div
        ref={tip}
        style={{
          display: 'none', position: 'absolute', pointerEvents: 'none',
          background: 'rgba(15,17,23,0.92)', border: '1px solid rgba(255,255,255,0.1)',
          color: '#fff', padding: '5px 10px', borderRadius: '8px',
          fontSize: '13px', whiteSpace: 'nowrap', backdropFilter: 'blur(8px)',
        }}
      />

      {/* Légende */}
      <div className="absolute bottom-3 left-3 flex items-center gap-4 pointer-events-none">
        {(['org', 'env', 'eng'] as const).map(t => (
          <span key={t} className="flex items-center gap-1.5 text-[12px] font-medium" style={{ color: 'rgba(255,255,255,0.75)' }}>
            <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: COL[t] }} />
            {t.toUpperCase()}
          </span>
        ))}
      </div>

      {/* Contrôles zoom + recentrer + hint */}
      <div className="absolute top-3 right-3 flex items-center gap-2">
        <div className="flex items-center gap-1">
          <button onClick={() => zoomBy(1.25)} style={{ ...btnStyle, width: 24 }} title="Zoom +">+</button>
          <button onClick={() => zoomBy(0.8)}  style={{ ...btnStyle, width: 24 }} title="Zoom −">−</button>
          <button onClick={resetView} style={btnStyle} title="Recentrer la vue">⌖ Recentrer</button>
        </div>
        <span className="text-[11px] pointer-events-none" style={{ color: 'rgba(255,255,255,0.5)' }}>
          Scroll: zoom · Drag: déplacer · Clic: ouvrir
        </span>
      </div>
    </div>
  )
}
