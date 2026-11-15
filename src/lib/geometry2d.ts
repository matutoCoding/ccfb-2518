import type { Vec2 } from '../types.ts'

export const v2 = (x: number, y: number): Vec2 => ({ x, y })
export const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y })
export const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y })
export const scale = (a: Vec2, s: number): Vec2 => ({ x: a.x * s, y: a.y * s })
export const dot = (a: Vec2, b: Vec2): number => a.x * b.x + a.y * b.y
export const cross2 = (a: Vec2, b: Vec2): number => a.x * b.y - a.y * b.x
export const len = (a: Vec2): number => Math.hypot(a.x, a.y)
export const dist = (a: Vec2, b: Vec2): number => len(sub(a, b))

export function rect(x0: number, y0: number, x1: number, y1: number): Vec2[] {
  return [v2(x0, y0), v2(x1, y0), v2(x1, y1), v2(x0, y1)]
}

/** 多边形有向面积 */
export function polyArea(p: Vec2[]): number {
  let s = 0
  for (let i = 0; i < p.length; i++) {
    const a = p[i]
    const b = p[(i + 1) % p.length]
    s += a.x * b.y - b.x * a.y
  }
  return s / 2
}

export function centroid(p: Vec2[]): Vec2 {
  let x = 0
  let y = 0
  for (const q of p) {
    x += q.x
    y += q.y
  }
  return { x: x / p.length, y: y / p.length }
}

/** 强制 CCW */
export function ensureCCW(p: Vec2[]): Vec2[] {
  return polyArea(p) >= 0 ? p : [...p].reverse()
}

const Q = 1e6
const key = (p: Vec2) => `${Math.round(p.x * Q)},${Math.round(p.y * Q)}`

/**
 从一组面板多边形推导刀版:
 - 被两个面板共享的边 -> 压痕线
 - 只出现一次的边 -> 裁切线(重组成闭合环)
 压痕端点会先把经过的长边切开,正确处理 T 型交接。
 */
export function deriveDieline(polys: Vec2[][], creaseMeta: { panelId: string; stepId?: string; forcedCrease?: boolean; creaseEdge?: number }[]) {
  // 1. 收集所有压痕端点(用于切分)
  const splitPts = new Map<string, Vec2>()
  for (const poly of polys) {
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i]
      const b = poly[(i + 1) % poly.length]
      // 只把压痕边端点登记为切分点(在 buildEdges 中再判断)
      splitPts.set(key(a), a)
      void b
    }
  }

  // 2. 统计每条边出现次数(先切分)
  const edgeMap = new Map<string, { a: Vec2; b: Vec2; count: number }>()
  const splitOnEdge = (a: Vec2, b: Vec2, pts: Vec2[]) => {
    const ab = sub(b, a)
    const L2 = dot(ab, ab)
    const on: { p: Vec2; t: number }[] = []
    for (const p of pts) {
      if (key(p) === key(a) || key(p) === key(b)) continue
      const ap = sub(p, a)
      const t = dot(ap, ab) / L2
      if (t > 1e-6 && t < 1 - 1e-6 && Math.abs(cross2(ab, ap)) < 1e-5) {
        on.push({ p, t })
      }
    }
    on.sort((u, w) => u.t - w.t)
    const out: [Vec2, Vec2][] = []
    let cur = a
    for (const { p } of on) {
      out.push([cur, p])
      cur = p
    }
    out.push([cur, b])
    return out
  }

  const allPts = [...splitPts.values()]
  for (const poly of polys) {
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i]
      const b = poly[(i + 1) % poly.length]
      for (const [u, w] of splitOnEdge(a, b, allPts)) {
        const ek = edgeKey(u, w)
        const ex = edgeMap.get(ek)
        if (ex) ex.count++
        else edgeMap.set(ek, { a: u, b: w, count: 1 })
      }
    }
  }

  const cuts: Vec2[][] = []
  const creases: { a: Vec2; b: Vec2; panelId: string; stepId?: string }[] = []

  // 3. 压痕边:原始多边形边的切分段中,存在共享片段即视为压痕(让位缺口只共享中段);
  //    forcedCrease 面板无条件输出整条压痕(厚度补偿导致的非共享铰接边)
  const creaseKeys = new Set<string>()
  for (let pi = 0; pi < polys.length; pi++) {
    const panel = creaseMeta[pi]
    const poly = polys[pi]
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i]
      const b = poly[(i + 1) % poly.length]
      const ek = edgeKey(a, b)
      const isForced = panel.forcedCrease && (panel.creaseEdge ?? 0) === i
      if (isForced) {
        if (!creaseKeys.has(ek)) {
          creaseKeys.add(ek)
          creases.push({ a, b, panelId: panel.panelId, stepId: panel.stepId })
        }
        continue
      }
      if (creaseKeys.has(ek)) continue
      const segs = splitOnEdge(a, b, allPts)
      const sharedSegs = segs.filter(([u, w]) => (edgeMap.get(edgeKey(u, w))?.count ?? 0) >= 2)
      if (sharedSegs.length > 0) {
        creaseKeys.add(ek)
        for (const [u, w] of sharedSegs)
          creases.push({ a: u, b: w, panelId: panel.panelId, stepId: panel.stepId })
      }
    }
  }

  // 4. 裁切段重组闭合环:无向图,每个切分顶点在裁切图中度数应为 2
  const cutSegs = [...edgeMap.values()].filter((e) => e.count === 1)
  const adj = new Map<string, Vec2[]>()
  for (const e of cutSegs) {
    const ka = key(e.a)
    const kb = key(e.b)
    if (!adj.has(ka)) adj.set(ka, [])
    if (!adj.has(kb)) adj.set(kb, [])
    adj.get(ka)!.push(e.b)
    adj.get(kb)!.push(e.a)
  }
  const visited = new Set<string>()
  const startKeys = [...adj.keys()]
  for (const startK of startKeys) {
    if (visited.has(startK)) continue
    const startP = [...splitPts.values()].find((p) => key(p) === startK) ?? adj.get(startK)![0]
    const loop: Vec2[] = [startP]
    visited.add(startK)
    let prevK = startK
    let curK = startK
    let guard = 0
    while (guard++ < 10000) {
      const nbrs = adj.get(curK) ?? []
      const nextP = nbrs.find((p) => key(p) !== prevK) ?? nbrs[0]
      if (!nextP) break
      const nextK = key(nextP)
      if (nextK === startK) break // 闭合
      if (visited.has(nextK)) break
      loop.push(nextP)
      visited.add(nextK)
      prevK = curK
      curK = nextK
    }
    if (loop.length >= 3) cuts.push(ensureCCW(loop))
  }

  // 5. 包围盒
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const poly of polys)
    for (const p of poly) {
      minX = Math.min(minX, p.x)
      minY = Math.min(minY, p.y)
      maxX = Math.max(maxX, p.x)
      maxY = Math.max(maxY, p.y)
    }

  return {
    cuts: cuts.map((poly) => ({ poly })),
    creases,
    bounds: { min: v2(minX, minY), max: v2(maxX, maxY) },
  }
}

function edgeKey(a: Vec2, b: Vec2): string {
  const ka = key(a)
  const kb = key(b)
  return ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`
}

/** 点在多边形内(射线法) */
export function pointInPoly(p: Vec2, poly: Vec2[]): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]
    const b = poly[j]
    const intersect =
      a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x
    if (intersect) inside = !inside
  }
  return inside
}

/** 多边形沿 x/y 轴平移 */
export function translatePoly(poly: Vec2[], dx: number, dy: number): Vec2[] {
  return poly.map((p) => ({ x: p.x + dx, y: p.y + dy }))
}
