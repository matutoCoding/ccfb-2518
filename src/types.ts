// 共享类型定义 —— 所有尺寸单位均为毫米(mm)
export interface Vec2 {
  x: number
  y: number
}

export type MaterialId = 'white-card' | 'kraft' | 'laminated' | 'corrugated'

export type BoxTemplateId = 'telescope' | 'airplane' | 'tuckend'

export interface BoxParams {
  /** 长(内径) */
  L: number
  /** 宽(内径) */
  W: number
  /** 高(内径) */
  H: number
  /** 纸板厚度 */
  t: number
}

/** 折叠步骤(生产工序) */
export interface FoldStep {
  id: string
  label: string
  /** 0..1,在整条时间轴上的起止区间 */
  start: number
  end: number
}

/**
 面板(板件)。
 平面网络位于纸板"内表面"平面 z=0,多边形按 CCW 排列。
 挤出方向为 -z(向纸外),厚度 t —— 这是厚度补偿的核心约定。
 */
export interface PanelDef {
  id: string
  name: string
  /** 父面板;无根面板时为空(天地盖有两个根) */
  parentId?: string
  /** CCW 多边形(内表面平面坐标) */
  poly: Vec2[]
  /** 与父面板相连的压痕边:poly[creaseEdge] -> poly[(creaseEdge+1)%n] */
  creaseEdge?: number
  /** 最终折叠角(度),0 表示保持平面 */
  targetAngle: number
  /** 所属折叠步骤 */
  stepId?: string
  /** 折叠方向覆盖;默认由质心测试自动判定(朝 +z 折) */
  dirOverride?: 1 | -1
  /** 厚度补偿标记:铰接边已在 2D 网络内移(如盖前墙包面),刀版仍需强制输出压痕 */
  hingeOffset?: number
  /** 强制把 creaseEdge 输出为压痕(即使几何上非共享边) */
  forcedCrease?: boolean
  /** 胶合耳(渲染时半透明区分) */
  isGlue?: boolean
}

export interface PanelGroup {
  id: string
  rootIds: string[]
  /** 组装完成后对整组施加的刚体平移(如天地盖盒盖扣合) */
  assembledOffset?: Vec3
  /** 组装前停放位置(盒盖悬浮动画起点) */
  parkedOffset?: Vec3
  /** 组装动画在时间轴上的区间 */
  assembleRange?: [number, number]
}

export interface Vec3 {
  x: number
  y: number
  z: number
}

export interface BoxDef {
  id: string
  name: string
  templateId: BoxTemplateId
  params: BoxParams
  panels: PanelDef[]
  steps: FoldStep[]
  groups: PanelGroup[]
  material: MaterialId
  /** 整盒展示姿态(欧拉角,度),用于管式盒竖立 */
  displayRotation?: Vec3
  /** 印刷面:panelId -> 贴图 dataURL */
  prints: Record<string, string>
  /** 出血 mm */
  bleed: number
  /** 烫金区域:panelId -> 面板局部坐标多边形 */
  foil: Record<string, Vec2[][]>
  createdAt: number
  updatedAt: number
}

/** 压痕线 */
export interface CreaseLine {
  a: Vec2
  b: Vec2
  panelId: string
  stepId?: string
}

/** 裁切线(闭合环) */
export interface CutLoop {
  poly: Vec2[]
}

export interface Dieline {
  cuts: CutLoop[]
  creases: CreaseLine[]
  /** 合并后的外轮廓(用于出血/视图自适应) */
  bounds: { min: Vec2; max: Vec2 }
}

export interface MaterialPreset {
  id: MaterialId
  name: string
  /** 内表面颜色 */
  innerColor: number
  /** 外表面基础色(无印刷时) */
  outerColor: number
  roughness: number
  metalness: number
  /** 覆膜光泽 */
  clearcoat?: number
}
