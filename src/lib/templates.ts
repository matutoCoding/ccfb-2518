import type {
  BoxDef,
  BoxParams,
  BoxTemplateId,
  FoldStep,
  MaterialId,
  PanelDef,
  PanelGroup,
  Vec2,
  Vec3,
} from '../types.ts'
import { rect, v2 } from './geometry2d.ts'

/** 默认时间轴工序区间(5 等分,各模板按步骤数取前 N 段,最后一段保留给组装/合盖) */
const equalRanges = (n: number): [number, number][] => {
  const out: [number, number][] = []
  for (let i = 0; i < n; i++) out.push([i / n, (i + 1) / n])
  return out
}

const P90 = 90

/* ------------------------------------------------------------------ */
/* 通用托盘:底板 + 四面墙 + 墙端防尘耳(飞机盒/天地盖共用)                 */
/* ------------------------------------------------------------------ */
interface TrayOptions {
  idPrefix: string
  /** 内径长、宽、高(高为该托盘自身深度) */
  L: number
  W: number
  H: number
  t: number
  /** 底板矩形四角 */
  bx0: number
  by0: number
  bx1: number
  by1: number
  /** 是否生成防尘耳(粘在相邻墙内侧) */
  ears: boolean
  /** 命名前缀 */
  name: string
}

function buildTray(o: TrayOptions): PanelDef[] {
  const { idPrefix: p, L, W, H, t, bx0: x0, by0: y0, bx1: x1, by1: y1 } = o
  const panels: PanelDef[] = []

  // 底板(内表面)
  panels.push({
    id: `${p}-base`,
    name: `${o.name}底板`,
    poly: rect(x0, y0, x1, y1),
    targetAngle: 0,
  })

  // 北墙(y1 边,沿 x)
  panels.push({
    id: `${p}-wall-n`,
    name: `${o.name}墙·北`,
    parentId: `${p}-base`,
    poly: rect(x0, y1, x1, y1 + H),
    creaseEdge: 0,
    targetAngle: P90,
  })
  // 南墙(y0 边):矩形顶边 = edge 2
  panels.push({
    id: `${p}-wall-s`,
    name: `${o.name}墙·南`,
    parentId: `${p}-base`,
    poly: rect(x0, y0 - H, x1, y0),
    creaseEdge: 2,
    targetAngle: P90,
  })
  // 东墙(x1 边,沿 y)
  panels.push({
    id: `${p}-wall-e`,
    name: `${o.name}墙·东`,
    parentId: `${p}-base`,
    poly: rect(x1, y0, x1 + H, y1),
    creaseEdge: 3,
    targetAngle: P90,
  })
  // 西墙(x0 边)
  panels.push({
    id: `${p}-wall-w`,
    name: `${o.name}墙·西`,
    parentId: `${p}-base`,
    poly: rect(x0 - H, y0, x0, y1),
    creaseEdge: 1,
    targetAngle: P90,
  })

  if (o.ears) {
    // 防尘耳:从南北墙两端伸出,厚度让位 t,折后贴相邻东西墙内壁
    const g = t // 让位缺口
    // 北墙两端耳
    panels.push({
      id: `${p}-ear-nw`,
      name: `${o.name}防尘耳·北西`,
      parentId: `${p}-wall-n`,
      poly: rect(x0 - H + g, y1 + g, x0, y1 + H),
      creaseEdge: 1,
      targetAngle: P90,
      isGlue: true,
    })
    panels.push({
      id: `${p}-ear-ne`,
      name: `${o.name}防尘耳·北东`,
      parentId: `${p}-wall-n`,
      poly: rect(x1, y1 + g, x1 + H - g, y1 + H),
      creaseEdge: 3,
      targetAngle: P90,
      isGlue: true,
    })
    // 南墙两端耳(矩形右边 edge 1 / 左边 edge 3)
    panels.push({
      id: `${p}-ear-sw`,
      name: `${o.name}防尘耳·南西`,
      parentId: `${p}-wall-s`,
      poly: rect(x0 - H + g, y0 - H, x0, y0 - g),
      creaseEdge: 1,
      targetAngle: P90,
      isGlue: true,
    })
    panels.push({
      id: `${p}-ear-se`,
      name: `${o.name}防尘耳·南东`,
      parentId: `${p}-wall-s`,
      poly: rect(x1, y0 - H, x1 + H - g, y0 - g),
      creaseEdge: 3,
      targetAngle: P90,
      isGlue: true,
    })
  }
  void L
  void W
  return panels
}

/* ------------------------------------------------------------------ */
/* 飞机盒(一体连盖托盘)                                                  */
/* ------------------------------------------------------------------ */
function buildAirplane(params: BoxParams): { panels: PanelDef[]; steps: FoldStep[]; groups: PanelGroup[] } {
  const { L, W, H, t } = params
  const x0 = -L / 2
  const x1 = L / 2
  const y0 = -W / 2
  const y1 = W / 2
  const p = 'ap'

  const steps: FoldStep[] = [
    { id: 's1', label: '折起四面墙', start: 0, end: 0.25 },
    { id: 's2', label: '防尘耳贴壁', start: 0.25, end: 0.5 },
    { id: 's3', label: '盒盖翻合', start: 0.5, end: 0.75 },
    { id: 's4', label: '盖侧片收拢', start: 0.75, end: 1 },
  ]

  const panels = buildTray({
    idPrefix: p, L, W, H, t,
    bx0: x0, by0: y0, bx1: x1, by1: y1,
    ears: true, name: '飞机盒',
  })

  // 步骤归属:墙 -> s1,耳 -> s2
  for (const q of panels) {
    if (q.id.startsWith(`${p}-wall`)) q.stepId = 's1'
    if (q.id.startsWith(`${p}-ear`)) q.stepId = 's2'
  }

  // 盒盖:与北墙顶边相连的 L×W 面板(矩形底边 edge 0)
  const lidY0 = y1 + H
  const lidY1 = lidY0 + W
  panels.push({
    id: `${p}-lid`,
    name: '盒盖',
    parentId: `${p}-wall-n`,
    poly: rect(x0, lidY0, x1, lidY1),
    creaseEdge: 0,
    targetAngle: P90,
    stepId: 's3',
  })
  // 盖前墙(外包南墙)。由运动链精确推导:墙+盖两块板的厚度使默认铰接折后
  // 内表面停在 -W/2+t(距南墙外表面还差 2t);将铰接边反向内移 -t(嵌入盒盖板 t),
  // 旋转把面板外带 t,折后内表面恰为 -W/2-t,与南墙外表面数学贴合、零实体重叠。
  panels.push({
    id: `${p}-lid-front`,
    name: '盖前墙',
    parentId: `${p}-lid`,
    poly: rect(x0, lidY1 + t, x1, lidY1 + t + H * 0.92),
    creaseEdge: 0,
    targetAngle: P90,
    hingeOffset: -1,
    forcedCrease: true,
    stepId: 's3',
  })
  // 盖两侧片(折入盒内,贴东西墙内壁,留 t 让位)
  panels.push({
    id: `${p}-lid-wing-w`,
    name: '盖侧片·西',
    parentId: `${p}-lid`,
    poly: rect(x0 - H + t, lidY0 + t, x0, lidY1 - t),
    creaseEdge: 1,
    targetAngle: P90,
    stepId: 's4',
    isGlue: true,
  })
  panels.push({
    id: `${p}-lid-wing-e`,
    name: '盖侧片·东',
    parentId: `${p}-lid`,
    poly: rect(x1, lidY0 + t, x1 + H - t, lidY1 - t),
    creaseEdge: 3,
    targetAngle: P90,
    stepId: 's4',
    isGlue: true,
  })

  return {
    panels,
    steps,
    groups: [{ id: 'g1', rootIds: [`${p}-base`] }],
  }
}

/* ------------------------------------------------------------------ */
/* 天地盖(两个独立托盘,盖组装扣合)                                       */
/* ------------------------------------------------------------------ */
function buildTelescope(params: BoxParams): { panels: PanelDef[]; steps: FoldStep[]; groups: PanelGroup[] } {
  const { L, W, H, t } = params
  const Hl = Math.max(12, H * 0.45) // 盖深
  const gap = 8 // 平面网络中两托盘间距
  const steps: FoldStep[] = [
    { id: 's1', label: '底托折墙', start: 0, end: 0.25 },
    { id: 's2', label: '底托防尘耳', start: 0.25, end: 0.5 },
    { id: 's3', label: '盖托折墙', start: 0.5, end: 0.75 },
    { id: 's4', label: '盖托防尘耳', start: 0.75, end: 0.9 },
    { id: 's5', label: '扣盖组装', start: 0.9, end: 1 },
  ]

  // 底托(中心在原点)
  const base = buildTray({
    idPrefix: 'tb', L, W, H, t,
    bx0: -L / 2, by0: -W / 2, bx1: L / 2, by1: W / 2,
    ears: true, name: '底托',
  })
  for (const q of base) {
    if (q.id.startsWith('tb-wall')) q.stepId = 's1'
    if (q.id.startsWith('tb-ear')) q.stepId = 's2'
  }

  // 盖托:内净尺寸 L+2t / W+2t,平面网络放在底托右侧
  const Li = L + 2 * t
  const Wi = W + 2 * t
  const cx0 = L / 2 + gap
  const cx1 = cx0 + Li
  const cy0 = -Wi / 2
  const cy1 = Wi / 2
  const lid = buildTray({
    idPrefix: 'tl', L: Li, W: Wi, H: Hl, t,
    bx0: cx0, by0: cy0, bx1: cx1, by1: cy1,
    ears: true, name: '盖托',
  })
  for (const q of lid) {
    if (q.id.startsWith('tl-wall')) q.stepId = 's3'
    if (q.id.startsWith('tl-ear')) q.stepId = 's4'
  }

  // 组装偏移:盖托底板内表面最终位于 y = H(底托墙顶)+ Hl(盖墙向下)
  // 平网络下盖底板中心
  const lidCenter: Vec3 = { x: (cx0 + cx1) / 2, y: 0, z: 0 }
  const finalCenter: Vec3 = { x: 0, y: 0, z: H + Hl }
  const parked: Vec3 = { x: lidCenter.x, y: lidCenter.y, z: H + Hl + 60 }
  const assembled: Vec3 = {
    x: finalCenter.x - lidCenter.x,
    y: finalCenter.y - lidCenter.y,
    z: finalCenter.z - lidCenter.z,
  }

  return {
    panels: [...base, ...lid],
    steps,
    groups: [
      { id: 'base', rootIds: ['tb-base'] },
      {
        id: 'lid',
        rootIds: ['tl-base'],
        parkedOffset: parked,
        assembledOffset: assembled,
        assembleRange: [0.9, 1],
      },
    ],
  }
}

/* ------------------------------------------------------------------ */
/* 扣底盒(管式 + 自动锁底 + 插舌盖)                                      */
/* ------------------------------------------------------------------ */
function buildTuckend(params: BoxParams): { panels: PanelDef[]; steps: FoldStep[]; groups: PanelGroup[] } {
  const { L, W, H, t } = params
  const steps: FoldStep[] = [
    { id: 's1', label: '围管胶合', start: 0, end: 0.25 },
    { id: 's2', label: '锁底成型', start: 0.25, end: 0.5 },
    { id: 's3', label: '底部防尘翼', start: 0.5, end: 0.75 },
    { id: 's4', label: '顶盖插舌', start: 0.75, end: 1 },
  ]

  // 管身四板沿 x 排列(内径尺寸,前->右->后->左)
  const fx0 = 0
  const fx1 = L
  const rx0 = fx1
  const rx1 = rx0 + W
  const bx0 = rx1
  const bx1 = bx0 + L
  const lx0 = bx1
  const lx1 = lx0 + W
  const y0 = -H / 2
  const y1 = H / 2
  const panels: PanelDef[] = [
    { id: 'tk-front', name: '前板', poly: rect(fx0, y0, fx1, y1), targetAngle: 0 },
    {
      id: 'tk-right', name: '右板', parentId: 'tk-front',
      poly: rect(rx0, y0, rx1, y1), creaseEdge: 3, targetAngle: P90, stepId: 's1',
    },
    {
      id: 'tk-back', name: '后板', parentId: 'tk-right',
      poly: rect(bx0, y0, bx1, y1), creaseEdge: 3, targetAngle: P90, stepId: 's1',
    },
    {
      id: 'tk-left', name: '左板', parentId: 'tk-back',
      poly: rect(lx0, y0, lx1, y1), creaseEdge: 3, targetAngle: P90, stepId: 's1',
    },
    // 胶合耳(左板外侧,整条边铰接保证压痕连续,工厂预粘)
    {
      id: 'tk-glue', name: '胶合耳', parentId: 'tk-left',
      poly: rect(lx1, y0, lx1 + W * 0.35, y1), creaseEdge: 3,
      targetAngle: P90, stepId: 's1', isGlue: true,
    },
  ]

  // ---- 自动锁底:y0 方向(下口) ----
  // 小防尘翼:前/后板(长 L)上的三角翼,深 W*0.5*0.6,让位 t
  const minorDepth = W * 0.5 * 0.6
  const chamfer = W * 0.18
  panels.push({
    id: 'tk-minor-front', name: '底防尘翼·前', parentId: 'tk-front',
    poly: [v2(fx0 + chamfer, y0), v2(fx1 - chamfer, y0), v2(fx1 - t, y0 - minorDepth), v2(fx0 + t, y0 - minorDepth)],
    creaseEdge: 0, targetAngle: 82, stepId: 's3',
  })
  panels.push({
    id: 'tk-minor-back', name: '底防尘翼·后', parentId: 'tk-back',
    poly: [v2(bx0 + chamfer, y0), v2(bx1 - chamfer, y0), v2(bx1 - t, y0 - minorDepth), v2(bx0 + t, y0 - minorDepth)],
    creaseEdge: 0, targetAngle: 82, stepId: 's3',
  })
  // 主锁底片:左/右板(宽 W)上的大翼,深度 L/2(中线对碰,互不重叠),带钩头切角
  const majorDepth = L / 2
  const hook = Math.min(10, L * 0.12)
  const major = (id: string, name: string, parent: string, xA: number, xB: number): PanelDef => ({
    id, name, parentId: parent,
    poly: [
      v2(xA, y0), v2(xB, y0),
      v2(xB, y0 - majorDepth + hook), v2(xB - t * 2, y0 - majorDepth),
      v2(xA + t * 2, y0 - majorDepth), v2(xA, y0 - majorDepth + hook),
    ],
    creaseEdge: 0, targetAngle: P90, stepId: 's2',
  })
  panels.push(major('tk-major-right', '主锁底·右', 'tk-right', rx0, rx1))
  panels.push(major('tk-major-left', '主锁底·左', 'tk-left', lx0, lx1))

  // ---- 上口:插舌盖 ----
  // 后板插舌(主盖)+ 锁舌尖
  const tuckDepth = W * 0.55
  const tip = W * 0.12
  panels.push({
    id: 'tk-tuck', name: '顶盖插舌', parentId: 'tk-back',
    poly: [
      v2(bx0 + t, y1), v2(bx1 - t, y1),
      v2(bx1 - t, y1 + tuckDepth - tip), v2(bx1 - L * 0.12, y1 + tuckDepth),
      v2(bx0 + L * 0.12, y1 + tuckDepth), v2(bx0 + t, y1 + tuckDepth - tip),
    ],
    creaseEdge: 0, targetAngle: P90, stepId: 's4',
  })
  // 前板上防尘翼(浅,85° 避免与插舌共面重叠);多边形底边(与前板顶边共享)= edge 0
  panels.push({
    id: 'tk-dust-front', name: '顶防尘翼·前', parentId: 'tk-front',
    poly: [v2(fx0, y1), v2(fx1, y1), v2(fx1 - t, y1 + W * 0.22), v2(fx0 + t, y1 + W * 0.22)],
    creaseEdge: 0, targetAngle: 85, stepId: 's4',
  })
  // 左右板上防尘翼
  const sideDust = (id: string, name: string, parent: string, xA: number, xB: number): PanelDef => ({
    id, name, parentId: parent,
    poly: [v2(xA, y1), v2(xB, y1), v2(xB - t, y1 + L * 0.22), v2(xA + t, y1 + L * 0.22)],
    creaseEdge: 0, targetAngle: 85, stepId: 's4',
  })
  panels.push(sideDust('tk-dust-right', '顶防尘翼·右', 'tk-right', rx0, rx1))
  panels.push(sideDust('tk-dust-left', '顶防尘翼·左', 'tk-left', lx0, lx1))

  void equalRanges
  return {
    panels,
    steps,
    groups: [
      {
        id: 'g1',
        rootIds: ['tk-front'],
        // 管式盒平网络绕 x 轴立起:前板内表面最终朝 +y(前方)
      },
    ],
  }
}

/* ------------------------------------------------------------------ */
/* 对外入口                                                              */
/* ------------------------------------------------------------------ */
const TEMPLATE_META: Record<BoxTemplateId, { name: string; build: (p: BoxParams) => { panels: PanelDef[]; steps: FoldStep[]; groups: PanelGroup[] }; rotation?: Vec3 }> = {
  telescope: { name: '天地盖', build: buildTelescope },
  airplane: { name: '飞机盒', build: buildAirplane },
  tuckend: {
    name: '扣底盒',
    build: buildTuckend,
    rotation: { x: -90, y: 0, z: 0 },
  },
}

export function templateName(id: BoxTemplateId): string {
  return TEMPLATE_META[id].name
}

let seq = 0
export function createBox(
  templateId: BoxTemplateId,
  params: BoxParams,
  material: MaterialId = 'white-card',
  name?: string,
): BoxDef {
  const meta = TEMPLATE_META[templateId]
  const built = meta.build(params)
  const now = Date.now()
  seq += 1
  return {
    id: `box-${now.toString(36)}-${seq}`,
    name: name ?? `${meta.name} ${params.L}×${params.W}×${params.H}`,
    templateId,
    params,
    panels: built.panels,
    steps: built.steps,
    groups: built.groups,
    material,
    prints: {},
    bleed: 3,
    foil: {},
    displayRotation: meta.rotation,
    createdAt: now,
    updatedAt: now,
  }
}

/** 重新生成(参数修改后调用,保留印刷/烫金配置中仍存在的面板) */
export function regenerate(box: BoxDef, params: BoxParams): BoxDef {
  const next = createBox(box.templateId, params, box.material, box.name)
  next.id = box.id
  next.createdAt = box.createdAt
  next.updatedAt = Date.now()
  next.bleed = box.bleed
  next.prints = pickExisting(box.prints, next.panels.map((p) => p.id))
  next.foil = pickExisting(box.foil, next.panels.map((p) => p.id))
  return next
}

function pickExisting<T>(src: Record<string, T>, validIds: string[]): Record<string, T> {
  const out: Record<string, T> = {}
  for (const id of validIds) if (src[id] !== undefined) out[id] = src[id]
  return out
}

export function duplicateBox(box: BoxDef): BoxDef {
  const now = Date.now()
  seq += 1
  return {
    ...structuredClone(box),
    id: `box-${now.toString(36)}-${seq}`,
    name: `${box.name} 副本`,
    createdAt: now,
    updatedAt: now,
  }
}

export const TEMPLATE_LIST: { id: BoxTemplateId; name: string; desc: string }[] = [
  { id: 'telescope', name: '天地盖', desc: '独立盖托+底托,硬质礼盒常用' },
  { id: 'airplane', name: '飞机盒', desc: '一体连盖托盘,电商快递常用' },
  { id: 'tuckend', name: '扣底盒', desc: '管式自动锁底+插舌,折叠纸盒常用' },
]

export const DEFAULT_PARAMS: Record<BoxTemplateId, BoxParams> = {
  telescope: { L: 180, W: 120, H: 60, t: 1 },
  airplane: { L: 200, W: 140, H: 50, t: 1.5 },
  tuckend: { L: 120, W: 80, H: 200, t: 0.6 },
}
