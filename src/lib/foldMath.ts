import type { PanelDef, Vec2, Vec3 } from '../types.ts'
import { centroid, sub } from './geometry2d.ts'

// 4x4 列主序矩阵(与 three.js Matrix4 内存布局一致)
export type Mat4 = number[]

export const identity = (): Mat4 => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]

export function mul(a: Mat4, b: Mat4): Mat4 {
  const o = new Array(16).fill(0)
  for (let c = 0; c < 4; c++)
    for (let r = 0; r < 4; r++)
      o[c * 4 + r] =
        a[0 * 4 + r] * b[c * 4 + 0] +
        a[1 * 4 + r] * b[c * 4 + 1] +
        a[2 * 4 + r] * b[c * 4 + 2] +
        a[3 * 4 + r] * b[c * 4 + 3]
  return o
}

export function translation(x: number, y: number, z: number): Mat4 {
  const m = identity()
  m[12] = x
  m[13] = y
  m[14] = z
  return m
}

/** 绕过点 p、方向 d 的轴旋转 angle 弧度(右手定则) */
export function axisRotation(px: number, py: number, pz: number, d: Vec3, angle: number): Mat4 {
  const { x, y, z } = d
  const c = Math.cos(angle)
  const s = Math.sin(angle)
  const C = 1 - c
  // 旋转部分(列主序)
  const r = [
    c + x * x * C,
    y * x * C + z * s,
    z * x * C - y * s,
    0,
    x * y * C - z * s,
    c + y * y * C,
    z * y * C + x * s,
    0,
    x * z * C + y * s,
    y * z * C - x * s,
    c + z * z * C,
    0,
    0,
    0,
    0,
    1,
  ]
  // T(p) R T(-p)
  return mul(translation(px, py, pz), mul(r, translation(-px, -py, -pz)))
}

export function applyPoint(m: Mat4, p: Vec3): Vec3 {
  const w = m[3] * p.x + m[7] * p.y + m[11] * p.z + m[15]
  return {
    x: (m[0] * p.x + m[4] * p.y + m[8] * p.z + m[12]) / w,
    y: (m[1] * p.x + m[5] * p.y + m[9] * p.z + m[13]) / w,
    z: (m[2] * p.x + m[6] * p.y + m[10] * p.z + m[14]) / w,
  }
}

/** 压痕边端点(在平面网络坐标中,z=0) */
export function creaseEndpoints(panel: PanelDef): { a: Vec2; b: Vec2 } {
  const i = panel.creaseEdge ?? 0
  const a = panel.poly[i]
  const b = panel.poly[(i + 1) % panel.poly.length]
  return { a, b }
}

/**
 折叠方向符号:正角度应使面板向 +z(印刷面朝向观察者的对侧,即"立起来")。
 以 z×d 为平面内法线,判断质心在法线哪一侧。
 */
export function foldSign(panel: PanelDef): 1 | -1 {
  if (panel.dirOverride) return panel.dirOverride
  const { a, b } = creaseEndpoints(panel)
  const d = normalize2(sub(b, a))
  const n = { x: -d.y, y: d.x } // z × d
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
  const c = centroid(panel.poly)
  const side = (c.x - mid.x) * n.x + (c.y - mid.y) * n.y
  return side >= 0 ? 1 : -1
}

const normalize2 = (v: Vec2) => {
  const l = Math.hypot(v.x, v.y) || 1
  return { x: v.x / l, y: v.y / l }
}

export interface FoldProgress {
  [panelId: string]: number // 0..1
}

/** 单个面板在给定折叠进度下的世界矩阵(含父级链与组平移) */
export function panelWorldMatrix(
  panel: PanelDef,
  panelMap: Map<string, PanelDef>,
  progress: FoldProgress,
  t: number,
  groupOffset: Vec3 = { x: 0, y: 0, z: 0 },
  seen: string[] = [],
): Mat4 {
  if (seen.includes(panel.id)) throw new Error(`面板层级存在环: ${panel.id}`)
  const local = localFoldMatrix(panel, progress[panel.id] ?? 0, t)
  if (!panel.parentId) return mul(translation(groupOffset.x, groupOffset.y, groupOffset.z), local)
  const parent = panelMap.get(panel.parentId)
  if (!parent) return local
  return mul(
    panelWorldMatrix(parent, panelMap, progress, t, groupOffset, [...seen, panel.id]),
    local,
  )
}

/** 面板自身的局部折叠矩阵(绕自身压痕轴) */
export function localFoldMatrix(panel: PanelDef, p: number, t: number): Mat4 {
  if (!panel.parentId || panel.targetAngle === 0) return identity()
  const { a, b } = creaseEndpoints(panel)
  const d2 = sub(b, a)
  const l = Math.hypot(d2.x, d2.y) || 1
  const d: Vec3 = { x: d2.x / l, y: d2.y / l, z: 0 }
  const angle = (panel.targetAngle * Math.PI / 180) * foldSign(panel) * p
  // 厚度补偿:当面板多边形的铰接边已内移到父板外表面(hingeOffset=1,
  // 模板在 2D 网络中直接补偿),平网络与折后位置都按该轴作标准内轴旋转。
  void t
  return axisRotation(a.x, a.y, 0, d, angle)
}

/** 面板挤出实体(内表面 z=0,外表面 z=-t)的世界 AABB */
export function panelWorldBox(
  panel: PanelDef,
  matrix: Mat4,
  t: number,
): { min: Vec3; max: Vec3 } {
  let min = { x: Infinity, y: Infinity, z: Infinity }
  let max = { x: -Infinity, y: -Infinity, z: -Infinity }
  for (const q of panel.poly) {
    for (const z of [0, -t]) {
      const w = applyPoint(matrix, { x: q.x, y: q.y, z })
      min = { x: Math.min(min.x, w.x), y: Math.min(min.y, w.y), z: Math.min(min.z, w.z) }
      max = { x: Math.max(max.x, w.x), y: Math.max(max.y, w.y), z: Math.max(max.z, w.z) }
    }
  }
  return { min, max }
}

/** 两个 AABB 的重叠体积 */
export function boxOverlapVolume(
  a: { min: Vec3; max: Vec3 },
  b: { min: Vec3; max: Vec3 },
): number {
  const ov = (lo1: number, hi1: number, lo2: number, hi2: number) =>
    Math.max(0, Math.min(hi1, hi2) - Math.max(lo1, lo2))
  return (
    ov(a.min.x, a.max.x, b.min.x, b.max.x) *
    ov(a.min.y, a.max.y, b.min.y, b.max.y) *
    ov(a.min.z, a.max.z, b.min.z, b.max.z)
  )
}

/** 世界点是否在面板挤出实体内部(局部坐标判断) */
export function pointInsidePanel(p: Vec3, panel: PanelDef, world: Mat4, t: number): boolean {
  const inv = invert(world)
  if (!inv) return false
  const loc = applyPoint(inv, p)
  if (loc.z > 1e-4 || loc.z < -t - 1e-4) return false
  return pointInPoly2(loc, panel.poly)
}

function pointInPoly2(p: { x: number; y: number }, poly: Vec2[]): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]
    const b = poly[j]
    const hit = a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x
    if (hit) inside = !inside
  }
  return inside
}

/** 面板边缘采样点(用于穿越/重叠检测) */
export function panelSamplePoints(panel: PanelDef, matrix: Mat4, t: number): Vec3[] {
  const pts: Vec3[] = []
  const levels = [0, -t / 2, -t]
  for (let i = 0; i < panel.poly.length; i++) {
    const a = panel.poly[i]
    const b = panel.poly[(i + 1) % panel.poly.length]
    for (let k = 0; k <= 4; k++) {
      const q = { x: a.x + (b.x - a.x) * (k / 4), y: a.y + (b.y - a.y) * (k / 4) }
      for (const z of levels) pts.push(applyPoint(matrix, { ...q, z }))
    }
  }
  return pts
}

function invert(m: Mat4): Mat4 | null {
  const o = new Array(16).fill(0)
  const a = m
  o[0] = a[5] * a[10] * a[15] - a[5] * a[11] * a[14] - a[9] * a[6] * a[15] + a[9] * a[7] * a[14] + a[13] * a[6] * a[11] - a[13] * a[7] * a[10]
  o[4] = -a[4] * a[10] * a[15] + a[4] * a[11] * a[14] + a[8] * a[6] * a[15] - a[8] * a[7] * a[14] - a[12] * a[6] * a[11] + a[12] * a[7] * a[10]
  o[8] = a[4] * a[9] * a[15] - a[4] * a[11] * a[13] - a[8] * a[5] * a[15] + a[8] * a[7] * a[13] + a[12] * a[5] * a[11] - a[12] * a[7] * a[9]
  o[12] = -a[4] * a[9] * a[14] + a[4] * a[10] * a[13] + a[8] * a[5] * a[14] - a[8] * a[6] * a[13] - a[12] * a[5] * a[10] + a[12] * a[6] * a[9]
  o[1] = -a[1] * a[10] * a[15] + a[1] * a[11] * a[14] + a[9] * a[2] * a[15] - a[9] * a[3] * a[14] - a[13] * a[2] * a[11] + a[13] * a[3] * a[10]
  o[5] = a[0] * a[10] * a[15] - a[0] * a[11] * a[14] - a[8] * a[2] * a[15] + a[8] * a[3] * a[14] + a[12] * a[2] * a[11] - a[12] * a[3] * a[10]
  o[9] = -a[0] * a[9] * a[15] + a[0] * a[11] * a[13] + a[8] * a[1] * a[15] - a[8] * a[3] * a[13] - a[12] * a[1] * a[11] + a[12] * a[3] * a[9]
  o[13] = a[0] * a[9] * a[14] - a[0] * a[10] * a[13] - a[8] * a[1] * a[14] + a[8] * a[2] * a[13] + a[12] * a[1] * a[10] - a[12] * a[2] * a[9]
  o[2] = a[1] * a[6] * a[15] - a[1] * a[7] * a[14] - a[5] * a[2] * a[15] + a[5] * a[3] * a[14] + a[13] * a[2] * a[7] - a[13] * a[3] * a[6]
  o[6] = -a[0] * a[6] * a[15] + a[0] * a[7] * a[14] + a[4] * a[2] * a[15] - a[4] * a[3] * a[14] - a[12] * a[2] * a[7] + a[12] * a[3] * a[6]
  o[10] = a[0] * a[5] * a[15] - a[0] * a[7] * a[13] - a[4] * a[1] * a[15] + a[4] * a[3] * a[13] + a[12] * a[1] * a[7] - a[12] * a[3] * a[5]
  o[14] = -a[0] * a[5] * a[14] + a[0] * a[6] * a[13] + a[4] * a[1] * a[14] - a[4] * a[2] * a[13] - a[12] * a[1] * a[6] + a[12] * a[2] * a[5]
  o[3] = -a[1] * a[6] * a[11] + a[1] * a[7] * a[10] + a[5] * a[3] * a[11] - a[5] * a[2] * a[10] - a[9] * a[3] * a[7] + a[9] * a[2] * a[6]
  o[7] = a[0] * a[6] * a[11] - a[0] * a[7] * a[10] - a[4] * a[2] * a[11] + a[4] * a[3] * a[10] + a[8] * a[2] * a[7] - a[8] * a[3] * a[6]
  o[11] = -a[0] * a[5] * a[11] + a[0] * a[7] * a[9] + a[4] * a[1] * a[11] - a[4] * a[3] * a[9] - a[8] * a[1] * a[7] + a[8] * a[3] * a[5]
  o[15] = a[0] * a[5] * a[10] - a[0] * a[6] * a[9] - a[4] * a[1] * a[10] + a[4] * a[2] * a[9] + a[8] * a[1] * a[6] - a[8] * a[2] * a[5]
  const det = a[0] * o[0] + a[1] * o[4] + a[2] * o[8] + a[3] * o[12]
  if (Math.abs(det) < 1e-12) return null
  for (const i of o.keys()) o[i] /= det
  return o
}

/** 按时间轴位置(0..1)计算每个面板的折叠进度 */
export function progressAt(
  panels: PanelDef[],
  steps: { id: string; start: number; end: number }[],
  globalProgress: number,
): FoldProgress {
  const out: FoldProgress = {}
  for (const p of panels) {
    if (!p.stepId || !p.parentId) {
      out[p.id] = 0
      continue
    }
    const step = steps.find((s) => s.id === p.stepId)
    if (!step) {
      out[p.id] = 0
      continue
    }
    const local = (globalProgress - step.start) / Math.max(1e-9, step.end - step.start)
    out[p.id] = Math.min(1, Math.max(0, local))
  }
  return out
}
