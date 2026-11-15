import type { BoxDef, CreaseLine, Dieline, PanelDef, Vec2 } from '../types.ts'
import { centroid, deriveDieline, ensureCCW, polyArea } from './geometry2d.ts'

/* ------------------------------- 导出 ------------------------------- */

const fmt = (n: number) => {
  const s = n.toFixed(2)
  return s.replace(/\.?0+$/, '')
}

function polyPath(poly: Vec2[]): string {
  return poly.map((p, i) => `${i === 0 ? 'M' : 'L'}${fmt(p.x)} ${fmt(p.y)}`).join(' ') + ' Z'
}

/**
 * 导出刀版 SVG:红色实线=裁切,蓝色虚线=压痕,独立图层,
 * 含盒型参数元数据(用于再次导入时完整重建折叠模型)。
 */
export function exportDielineSVG(box: BoxDef): string {
  const dl = buildDieline(box)
  const { min, max } = dl.bounds
  const pad = Math.max(10, box.params.t * 6)
  const w = max.x - min.x + pad * 2
  const h = max.y - min.y + pad * 2
  const ox = -min.x + pad
  const oy = -min.y + pad
  const tr = (p: Vec2): Vec2 => ({ x: p.x + ox, y: max.y - min.y + pad - (p.y - min.y) })

  const meta = encodeURIComponent(
    JSON.stringify({
      app: 'carton-fold-studio',
      box: { ...box, prints: undefined, foil: undefined },
    }),
  )

  const cutPaths = dl.cuts
    .map((l) => `  <path d="${polyPath(l.poly.map(tr))}" fill="none" stroke="#e11d48" stroke-width="0.8"/>`)
    .join('\n')
  const creasePaths = dl.creases
    .map((c) => {
      const a = tr(c.a)
      const b = tr(c.b)
      return `  <line x1="${fmt(a.x)}" y1="${fmt(a.y)}" x2="${fmt(b.x)}" y2="${fmt(b.y)}" stroke="#2563eb" stroke-width="0.6" stroke-dasharray="3 2" data-panel="${c.panelId}"${c.stepId ? ` data-step="${c.stepId}"` : ''}/>`
    })
    .join('\n')

  const dims = dimensionLines(box, tr)

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${fmt(w)}" height="${fmt(h)}" viewBox="0 0 ${fmt(w)} ${fmt(h)}" data-meta="${meta}">
  <title>${box.name} 刀版图</title>
  <g id="layer-cut" data-layer="cut">
${cutPaths}
  </g>
  <g id="layer-crease" data-layer="crease">
${creasePaths}
  </g>
  <g id="layer-dimension" data-layer="dimension" font-family="Arial, sans-serif" font-size="5" fill="#374151">
${dims}
  </g>
</svg>
`
}

function dimensionLines(box: BoxDef, tr: (p: Vec2) => Vec2): string {
  const { L, W, H, t } = box.params
  const out: string[] = []
  const label = (x: number, y: number, text: string) =>
    `    <text x="${fmt(x)}" y="${fmt(y)}" text-anchor="middle">${text}</text>`
  // 底板/面板主尺寸标注(取根面板)
  const root = box.panels.find((p) => !p.parentId)
  if (root) {
    const c = centroid(root.poly)
    const p0 = tr(root.poly[0])
    void c
    out.push(label(p0.x + 20, p0.y - 4, `L=${fmt(L)} W=${fmt(W)} H=${fmt(H)} t=${fmt(t)}`))
  }
  return out.join('\n')
}

export function buildDieline(box: BoxDef): Dieline {
  return deriveDieline(
    box.panels.map((p) => p.poly),
    box.panels.map((p) => ({
      panelId: p.id,
      stepId: p.stepId,
      forcedCrease: p.forcedCrease,
      creaseEdge: p.creaseEdge,
    })),
  )
}

/* ------------------------------- 导入 ------------------------------- */

export interface ImportResult {
  box?: BoxDef
  warning?: string
}

/**
 * 导入 SVG:
 * 1. 含本系统 data-meta 的导出文件 -> 完整重建(含折叠层级)
 * 2. 通用刀版 SVG -> 识别蓝色/虚线压痕,重建平面面板网络,
 *    压痕可在刀版编辑页手动指定折叠角
 */
export function importDielineSVG(svgText: string, fallbackName: string): ImportResult {
  // 1. 优先解析自有元数据
  const metaMatch = svgText.match(/data-meta="([^"]+)"/)
  if (metaMatch) {
    try {
      const meta = JSON.parse(decodeURIComponent(metaMatch[1]))
      if (meta?.app === 'carton-fold-studio' && meta.box?.panels) {
        const box = meta.box as BoxDef
        box.id = `box-${Date.now().toString(36)}-imp`
        box.name = `${fallbackName}(导入)`
        box.updatedAt = Date.now()
        box.prints = {}
        box.foil = {}
        return { box }
      }
    } catch {
      // 元数据损坏则走通用解析
    }
  }

  // 2. 通用解析
  const polys = parsePolygons(svgText)
  const creases = parseCreases(svgText)
  if (polys.length === 0) {
    return { warning: '未识别到闭合路径,请确认 SVG 包含 path/polygon 图形' }
  }
  const box = buildBoxFromFlatNet(polys, creases, fallbackName)
  return {
    box,
    warning: creases.length === 0 ? '未识别到压痕线(蓝色或虚线),已导入平面网络,可在刀版编辑页手动指定压痕' : undefined,
  }
}

function parsePolygons(svg: string): Vec2[][] {
  const out: Vec2[][] = []
  // polygon/polyline
  const polyRe = /<(polygon|polyline)[^>]*points="([^"]+)"/g
  let m: RegExpExecArray | null
  while ((m = polyRe.exec(svg))) {
    const nums = m[2].trim().split(/[\s,]+/).map(Number)
    const poly: Vec2[] = []
    for (let i = 0; i + 1 < nums.length; i += 2) poly.push({ x: nums[i], y: -nums[i + 1] })
    if (poly.length >= 3) out.push(ensureCCW(poly))
  }
  // path(仅支持 M/L/Z 直线段,刀版场景足够)
  const pathRe = /<path[^>]*d="([^"]+)"/g
  while ((m = pathRe.exec(svg))) {
    const poly = parsePathD(m[1])
    if (poly.length >= 3) out.push(ensureCCW(poly))
  }
  return out
}

function parsePathD(d: string): Vec2[] {
  const tokens = d.replace(/,/g, ' ').split(/\s+/).filter(Boolean)
  const poly: Vec2[] = []
  let x = 0
  let y = 0
  let cmd = ''
  for (let i = 0; i < tokens.length; i++) {
    const tk = tokens[i]
    if (/^[A-Za-z]$/.test(tk)) {
      cmd = tk
      continue
    }
    if (cmd === 'M' || cmd === 'L' || cmd === '') {
      x = Number(tk)
      y = Number(tokens[++i])
      poly.push({ x, y: -y })
    } else if (cmd === 'Z' || cmd === 'z') {
      break
    }
  }
  if (poly.length > 1) {
    const f = poly[0]
    const l = poly[poly.length - 1]
    if (Math.hypot(f.x - l.x, f.y - l.y) < 1e-6) poly.pop()
  }
  return poly
}

function parseCreases(svg: string): { a: Vec2; b: Vec2 }[] {
  const out: { a: Vec2; b: Vec2 }[] = []
  const lineRe = /<line\b[^>]*>/g
  let m: RegExpExecArray | null
  while ((m = lineRe.exec(svg))) {
    const tag = m[0]
    const dashed = /stroke-dasharray="(?!0)/.test(tag)
    const blue = /stroke="[^"]*"/.test(tag) && /#?(2563eb|0000ff|blue|1d4ed8)/i.test(tag)
    const layer = /data-layer="crease"|layer-crease/.test(svg.slice(Math.max(0, m.index - 400), m.index))
    if (!dashed && !blue && !layer) continue
    const x1 = Number(attr(tag, 'x1'))
    const y1 = Number(attr(tag, 'y1'))
    const x2 = Number(attr(tag, 'x2'))
    const y2 = Number(attr(tag, 'y2'))
    if (Number.isFinite(x1)) out.push({ a: { x: x1, y: -y1 }, b: { x: x2, y: -y2 } })
  }
  return out
}

function attr(tag: string, name: string): string {
  return tag.match(new RegExp(`${name}="([^"]*)"`))?.[1] ?? 'NaN'
}

/** 通用网络 -> 折叠盒定义:最大面板为根,共享压痕边的面板挂为子级,默认折 90° */
function buildBoxFromFlatNet(polys: Vec2[][], creases: { a: Vec2; b: Vec2 }[], name: string): BoxDef {
  const sorted = [...polys].sort((a, b) => Math.abs(polyArea(b)) - Math.abs(polyArea(a)))
  const panels: PanelDef[] = sorted.map((poly, i) => ({
    id: `imp-${i}`,
    name: i === 0 ? '底板(根)' : `面板 ${i}`,
    poly,
    targetAngle: 0,
  }))

  // 用压痕线匹配共享边,建立父子关系
  const edgeMatch = (poly: Vec2[], c: { a: Vec2; b: Vec2 }) => {
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i]
      const b = poly[(i + 1) % poly.length]
      const mid1 = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
      const mid2 = { x: (c.a.x + c.b.x) / 2, y: (c.a.y + c.b.y) / 2 }
      if (Math.hypot(mid1.x - mid2.x, mid1.y - mid2.y) < 2) return i
    }
    return -1
  }

  for (const c of creases) {
    const hits = panels
      .map((p) => ({ p, edge: edgeMatch(p.poly, c) }))
      .filter((h) => h.edge >= 0 && !h.p.parentId)
    if (hits.length >= 2) {
      const child = hits.find((h) => h.p.id !== 'imp-0') ?? hits[1]
      child.p.parentId = hits[0].p.id
      child.p.creaseEdge = child.edge
      child.p.targetAngle = 90
      child.p.stepId = 's1'
    }
  }

  const xs = panels.flatMap((p) => p.poly.map((q) => q.x))
  const ys = panels.flatMap((p) => p.poly.map((q) => q.y))
  const now = Date.now()
  return {
    id: `box-${now.toString(36)}-imp`,
    name: `${name}(导入)`,
    templateId: 'airplane',
    params: {
      L: Math.round(Math.max(...xs) - Math.min(...xs)),
      W: Math.round(Math.max(...ys) - Math.min(...ys)),
      H: 40,
      t: 1,
    },
    panels,
    steps: [{ id: 's1', label: '折叠', start: 0, end: 1 }],
    groups: [{ id: 'g1', rootIds: ['imp-0'] }],
    material: 'white-card',
    prints: {},
    bleed: 3,
    foil: {},
    createdAt: now,
    updatedAt: now,
  }
}
