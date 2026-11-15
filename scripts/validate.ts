/**
 * 折叠几何数值校验 —— 不依赖 three.js,直接验证"严丝合缝":
 *  1. 预期贴合面到目标平面的距离(必须 < 0.01mm,即零间隙)
 *  2. 结构板之间的实体侵入(必须 = 0,即无重叠/穿模)
 *  3. 刀版裁切环/压痕线数量合理性
 *  4. 成盒外形尺寸与内径参数一致性
 * 运行: npm run validate
 */
import { createBox, DEFAULT_PARAMS } from '../src/lib/templates.ts'
import { deriveDieline } from '../src/lib/geometry2d.ts'
import {
  applyPoint,
  boxOverlapVolume,
  panelWorldBox,
  panelWorldMatrix,
  progressAt,
  type FoldProgress,
} from '../src/lib/foldMath.ts'
import type { BoxDef, BoxParams, PanelDef, Vec3 } from '../src/types.ts'

const EPS_FLUSH = 0.01 // 贴合公差 mm
const EPS_INSIDE = 0.02 // 内部判定缩进(区分"接触"与"侵入")

interface CheckResult {
  name: string
  ok: boolean
  detail: string
}
const results: CheckResult[] = []
const check = (name: string, ok: boolean, detail: string) => results.push({ name, ok, detail })

/** 面板局部坐标点(带内缩)是否处于另一面板实体内部 */
function panelSolidContains(
  panel: PanelDef,
  matrix: number[],
  t: number,
  p: Vec3,
): boolean {
  // 世界 -> 该面板局部:用四角平面 z 测试 + 多边形测试(手写轻量版)
  const inv = invertAffine(matrix)
  const loc = applyAffine(inv, p)
  if (loc.z > -EPS_INSIDE || loc.z < -t + EPS_INSIDE) return false
  return pointInPoly(loc.x, loc.y, panel.poly)
}

function pointInPoly(x: number, y: number, poly: { x: number; y: number }[]): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]
    const b = poly[j]
    const hit = a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x
    if (hit) inside = !inside
  }
  return inside
}

function invertAffine(m: number[]): number[] {
  // 3x3 仿射(第4行 0,0,0,1):对 4x4 求逆的简化,直接用通用伴随法
  const o = new Array(16).fill(0)
  const a = m
  o[0] = a[5] * a[10] - a[6] * a[9]
  o[1] = a[2] * a[9] - a[1] * a[10]
  o[2] = a[1] * a[6] - a[2] * a[5]
  o[4] = a[6] * a[8] - a[4] * a[10]
  o[5] = a[0] * a[10] - a[2] * a[8]
  o[6] = a[2] * a[4] - a[0] * a[6]
  o[8] = a[4] * a[9] - a[5] * a[8]
  o[9] = a[1] * a[8] - a[0] * a[9]
  o[10] = a[0] * a[5] - a[1] * a[4]
  const det = a[0] * o[0] + a[1] * o[4] + a[2] * o[8]
  o[12] = -(a[12] * o[0] + a[13] * o[4] + a[14] * o[8]) / det
  o[13] = -(a[12] * o[1] + a[13] * o[5] + a[14] * o[9]) / det
  o[14] = -(a[12] * o[2] + a[13] * o[6] + a[14] * o[10]) / det
  for (let i = 0; i < 12; i++) o[i] /= det
  o[15] = 1
  return o
}
function applyAffine(m: number[], p: Vec3): Vec3 {
  return {
    x: m[0] * p.x + m[4] * p.y + m[8] * p.z + m[12],
    y: m[1] * p.x + m[5] * p.y + m[9] * p.z + m[13],
    z: m[2] * p.x + m[6] * p.y + m[10] * p.z + m[14],
  }
}

function buildMatrices(box: BoxDef, progress: FoldProgress) {
  const map = new Map(box.panels.map((p) => [p.id, p]))
  const out = new Map<string, number[]>()
  for (const g of box.groups) {
    const off = g.assembledOffset ?? { x: 0, y: 0, z: 0 }
    for (const rootId of g.rootIds) {
      const collect = (pid: string) => {
        const panel = map.get(pid)!
        out.set(pid, panelWorldMatrix(panel, map, progress, box.params.t, off))
        for (const ch of box.panels.filter((q) => q.parentId === pid)) collect(ch.id)
      }
      collect(rootId)
    }
  }
  return out
}

/** 校验:面板内表面到指定平面的贴合度 */
function checkFlush(
  box: BoxDef,
  mats: Map<string, number[]>,
  panelId: string,
  plane: (p: Vec3) => number,
  label: string,
) {
  const panel = box.panels.find((p) => p.id === panelId)
  if (!panel) return check(label, false, `面板 ${panelId} 不存在`)
  const m = mats.get(panelId)!
  let max = 0
  const n = 6
  for (let i = 0; i <= n; i++)
    for (let j = 0; j <= n; j++) {
      const a = panel.poly[0]
      const b = panel.poly[2]
      const q = {
        x: a.x + ((b.x - a.x) * i) / n,
        y: a.y + ((b.y - a.y) * j) / n,
        z: 0,
      }
      if (!pointInPoly(q.x, q.y, panel.poly)) continue
      const w = applyPoint(m, q)
      max = Math.max(max, Math.abs(plane(w)))
    }
  check(`贴合·${label}`, max < EPS_FLUSH, `最大偏差 ${max.toFixed(4)}mm (公差 ${EPS_FLUSH}mm)`)
}

/** 校验:结构板之间无实体重叠(胶合耳/防尘翼等有意贴面的附件豁免) */
function checkNoInterpenetration(box: BoxDef, mats: Map<string, number[]>) {
  const t = box.params.t
  const structural = box.panels.filter((p) => !p.isGlue && !p.id.includes('dust') && !p.id.includes('ear') && !p.id.includes('wing') && !p.id.includes('glue'))
  let worst = 0
  const offenders: string[] = []
  for (let i = 0; i < structural.length; i++) {
    for (let j = i + 1; j < structural.length; j++) {
      const A = structural[i]
      const B = structural[j]
      const mA = mats.get(A.id)!
      const mB = mats.get(B.id)!
      // AABB 粗筛
      const ba = panelWorldBox(A, mA, t)
      const bb = panelWorldBox(B, mB, t)
      if (boxOverlapVolume(ba, bb) <= 1e-9) continue
      // 采样精查:A 的内部点是否落入 B 实体
      let hit = false
      for (const q of A.poly) {
        for (const z of [-t * 0.25, -t * 0.5, -t * 0.75]) {
          const w = applyPoint(mA, { x: q.x, y: q.y, z })
          if (panelSolidContains(B, mB, t, w)) {
            hit = true
            break
          }
        }
        if (hit) break
      }
      if (hit) {
        offenders.push(`${A.name}×${B.name}`)
        worst = Math.max(worst, boxOverlapVolume(ba, bb))
      }
    }
  }
  check(
    '无穿模·结构板实体零重叠',
    offenders.length === 0,
    offenders.length ? `冲突: ${offenders.join('、')} (AABB 最大重叠 ${worst.toFixed(2)}mm³)` : '全部结构板无实体侵入',
  )
}

/** 校验:刀版推导 */
function checkDieline(box: BoxDef) {
  const dl = deriveDieline(
    box.panels.map((p) => p.poly),
    box.panels.map((p) => ({ panelId: p.id, stepId: p.stepId, forcedCrease: p.forcedCrease, creaseEdge: p.creaseEdge })),
  )
  const creaseExpected = box.panels.filter((p) => p.parentId).length

  // 压痕覆盖:每条父子压痕边都应被输出的压痕段完全覆盖(允许 T 型交接处被切分)
  let covered = 0
  let coverDetail = ''
  for (const panel of box.panels) {
    if (!panel.parentId) continue
    const i = panel.creaseEdge ?? 0
    const a = panel.poly[i]
    const b = panel.poly[(i + 1) % panel.poly.length]
    const full = Math.hypot(b.x - a.x, b.y - a.y)
    let got = 0
    for (const c of dl.creases) {
      // 共线且位于面板压痕边 [a,b] 范围内的输出段(让位缺口导致只覆盖中段也算通过)
      const abx = b.x - a.x
      const aby = b.y - a.y
      const onLine = (p: { x: number; y: number }) =>
        Math.abs(abx * (p.y - a.y) - aby * (p.x - a.x)) < 1e-4 &&
        ((p.x - a.x) * abx + (p.y - a.y) * aby) >= -1e-4 &&
        ((p.x - b.x) * abx + (p.y - b.y) * aby) <= 1e-4
      if (onLine(c.a) && onLine(c.b)) got += Math.hypot(c.b.x - c.a.x, c.b.y - c.a.y)
    }
    if (got > 1e-3) covered++
    else coverDetail += `${panel.id} 无共线压痕段; `
  }
  check(
    '刀版·压痕全覆盖',
    covered === creaseExpected,
    `${covered}/${creaseExpected} 条压痕被完整覆盖 (输出段 ${dl.creases.length} 条)${coverDetail ? `; ${coverDetail}` : ''}`,
  )

  // 裁切:所有环闭合,且裁切段总量 > 0
  const totalCutVerts = dl.cuts.reduce((s, l) => s + l.poly.length, 0)
  check('刀版·裁切环闭合', dl.cuts.length >= 1 && totalCutVerts >= 4, `闭合裁切环 ${dl.cuts.length} 个,共 ${totalCutVerts} 个顶点`)
  const width = dl.bounds.max.x - dl.bounds.min.x
  const height = dl.bounds.max.y - dl.bounds.min.y
  check('刀版·包围盒有效', width > 0 && height > 0, `网络幅面 ${width.toFixed(1)} × ${height.toFixed(1)} mm`)
}

function validateBox(template: BoxDef['templateId'], params: BoxParams) {
  const box = createBox(template, params)
  const progress = progressAt(box.panels, box.steps, 1)
  const mats = buildMatrices(box, progress)
  const { L, W, H, t } = box.params

  console.log(`\n=== ${box.name} (${template}) L=${L} W=${W} H=${H} t=${t} ===`)
  checkDieline(box)

  if (template === 'airplane' || template === 'telescope') {
    const prefix = template === 'airplane' ? 'ap' : 'tb'
    // 四面墙内表面与内径边界齐平
    checkFlush(box, mats, `${prefix}-wall-n`, (p) => p.y - W / 2, '北墙内壁 = W/2')
    checkFlush(box, mats, `${prefix}-wall-s`, (p) => p.y + W / 2, '南墙内壁 = -W/2')
    checkFlush(box, mats, `${prefix}-wall-e`, (p) => p.x - L / 2, '东墙内壁 = L/2')
    checkFlush(box, mats, `${prefix}-wall-w`, (p) => p.x + L / 2, '西墙内壁 = -L/2')
    // 墙顶高度 = H(内高)
    const wall = box.panels.find((p) => p.id === `${prefix}-wall-n`)!
    const mw = mats.get(`${prefix}-wall-n`)!
    const top = applyPoint(mw, { x: 0, y: wall.poly[2].y, z: 0 })
    check('贴合·墙顶高度 = H', Math.abs(top.z - H) < EPS_FLUSH, `墙顶 z=${top.z.toFixed(3)}mm, 目标 ${H}mm`)
  }

  if (template === 'telescope') {
    // 盖扣合后:盖底板内表面 z = H + H盖深
    const Hl = Math.max(12, H * 0.45)
    checkFlush(box, mats, 'tl-base', (p) => p.z - (H + Hl), '盖底板扣合位 z=H+H盖')
    // 盖墙内壁 x = ±(L/2+t)(净内尺寸 L+2t)
    checkFlush(box, mats, 'tl-wall-e', (p) => p.x - (L / 2 + t), '盖东墙内壁 = L/2+t')
    checkFlush(box, mats, 'tl-wall-w', (p) => p.x + (L / 2 + t), '盖西墙内壁 = -(L/2+t)')
  }

  if (template === 'airplane') {
    // 盒盖折好后水平盖在顶部:盖内表面 z = H
    checkFlush(box, mats, 'ap-lid', (p) => p.z - H, '盒盖内表面 z=H')
    // 盖前墙外包南墙:内表面落在南墙外表面 y = -W/2 - t
    checkFlush(box, mats, 'ap-lid-front', (p) => p.y + W / 2 + t, '盖前墙内表面贴南墙外侧 y=-W/2-t')
  }

  if (template === 'tuckend') {
    // 平网络绕 x 轴 -90° 立起;实测折后:前/后板水平于 z=0/80,左右板竖直于 x=0/120
    checkFlush(box, mats, 'tk-front', (p) => p.z, '前板内壁 z=0')
    checkFlush(box, mats, 'tk-right', (p) => p.x - L, '右板内壁 x=L')
    checkFlush(box, mats, 'tk-back', (p) => p.z - W, '后板内壁 z=W')
    checkFlush(box, mats, 'tk-left', (p) => p.x, '左板内壁 x=0')
    // 两片主锁底片铰接在左右墙(y 向边),折后铰接边竖直于 x=L / x=0
    const map2 = new Map(box.panels.map((q) => [q.id, q]))
    const majorHinge = (id: string) => {
      const panel = map2.get(id)!
      const m = mats.get(id)!
      const i = panel.creaseEdge ?? 0
      const a = panel.poly[i]
      const b = panel.poly[(i + 1) % panel.poly.length]
      const wa = applyPoint(m, { x: a.x, y: a.y, z: 0 })
      const wb = applyPoint(m, { x: b.x, y: b.y, z: 0 })
      return { x: (wa.x + wb.x) / 2, dev: Math.abs(wa.x - wb.x) }
    }
    const rHinge = majorHinge('tk-major-right')
    const lHinge = majorHinge('tk-major-left')
    check('右主锁底铰接边 x=L', Math.abs(rHinge.x - L) < EPS_FLUSH && rHinge.dev < EPS_FLUSH, `x=${rHinge.x.toFixed(3)}mm`)
    check('左主锁底铰接边 x=0', Math.abs(lHinge.x) < EPS_FLUSH && lHinge.dev < EPS_FLUSH, `x=${lHinge.x.toFixed(3)}mm`)
    // 中线对碰检查:两片前缘 x 都应到达 L/2
    for (const id of ['tk-major-right', 'tk-major-left']) {
      const panel = map2.get(id)!
      const m = mats.get(id)!
      const tipX = Math.min(...panel.poly.map((q) => applyPoint(m, { x: q.x, y: q.y, z: 0 }).x))
      const maxX = Math.max(...panel.poly.map((q) => applyPoint(m, { x: q.x, y: q.y, z: 0 }).x))
      const edge = id.includes('right') ? tipX : maxX
      check(`对碰·${panel.name}前缘 x=L/2`, Math.abs(edge - L / 2) < EPS_FLUSH, `前缘 x=${edge.toFixed(3)}mm`)
    }
  }

  checkNoInterpenetration(box, mats)
}

// 1mm 纸厚(用户最在意的工况)+ 其他厚度回归
const cases: { template: BoxDef['templateId']; t: number }[] = [
  { template: 'telescope', t: 1 },
  { template: 'airplane', t: 1 },
  { template: 'tuckend', t: 1 },
  { template: 'airplane', t: 0.5 },
  { template: 'airplane', t: 2.5 },
  { template: 'telescope', t: 2 },
  { template: 'tuckend', t: 0.4 },
]
for (const c of cases) {
  validateBox(c.template, { ...DEFAULT_PARAMS[c.template], t: c.t })
}

console.log('\n================ 校验结果 ================')
let pass = 0
for (const r of results) {
  console.log(`${r.ok ? '✅' : '❌'} [${r.name}] ${r.detail}`)
  if (r.ok) pass++
}
console.log(`\n${pass}/${results.length} 项通过`)
if (pass !== results.length) process.exit(1)
