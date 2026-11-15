import * as THREE from 'three'
import type { BoxDef, PanelDef, Vec3 } from '../types.ts'
import { MATERIALS, FOIL_MATERIAL } from '../lib/materials.ts'
import { localFoldMatrix, foldSign, creaseEndpoints } from '../lib/foldMath.ts'
import type { FoldProgress } from '../lib/foldMath.ts'

export interface PanelMesh {
  panel: PanelDef
  group: THREE.Group
  update: (progress: FoldProgress, groupOffset?: Vec3) => void
}

export interface BoxScene {
  root: THREE.Group
  panels: PanelMesh[]
  dispose: () => void
}

const toShape = (poly: { x: number; y: number }[]): THREE.Shape => {
  const shape = new THREE.Shape()
  shape.moveTo(poly[0].x, poly[0].y)
  for (let i = 1; i < poly.length; i++) shape.lineTo(poly[i].x, poly[i].y)
  shape.closePath()
  return shape
}

/** 构建单个带厚度的面板挤出体:内表面 z=0,外表面 z=-t */
function buildPanelGeometry(panel: PanelDef, t: number): THREE.BufferGeometry {
  const shape = toShape(panel.poly)
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: t,
    bevelEnabled: false,
    steps: 1,
  })
  // ExtrudeGeometry 向 +z 挤出,翻转到 -z
  geo.scale(1, 1, -1)
  geo.computeVertexNormals()
  return geo
}

function makeMaterials(box: BoxDef, panel: PanelDef, texture?: THREE.Texture) {
  const preset = MATERIALS[box.material]
  const common = {
    roughness: preset.roughness,
    metalness: preset.metalness,
  }
  // 外表面(印刷面):有贴图用贴图,否则用材质基色
  const outer = new THREE.MeshPhysicalMaterial({
    map: texture ?? null,
    color: texture ? 0xffffff : preset.outerColor,
    ...common,
    clearcoat: preset.clearcoat ?? 0,
    clearcoatRoughness: 0.25,
    side: THREE.FrontSide,
  })
  // 内表面
  const inner = new THREE.MeshStandardMaterial({
    color: preset.innerColor,
    roughness: 0.92,
    metalness: 0,
    side: THREE.BackSide,
  })
  // 纸板侧边(裁切截面,略深)
  const edge = new THREE.MeshStandardMaterial({
    color: new THREE.Color(preset.innerColor).multiplyScalar(0.72),
    roughness: 0.95,
    metalness: 0,
  })
  return [outer, inner, edge]
}

/** 面板平面投影 UV(印刷图案跟随面板,不随折叠变形) */
function applyPlanarUV(geo: THREE.BufferGeometry, panel: PanelDef) {
  const xs = panel.poly.map((p) => p.x)
  const ys = panel.poly.map((p) => p.y)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  const pos = geo.attributes.position
  const uv = new Float32Array(pos.count * 2)
  for (let i = 0; i < pos.count; i++) {
    uv[i * 2] = (pos.getX(i) - minX) / (maxX - minX)
    uv[i * 2 + 1] = (pos.getY(i) - minY) / (maxY - minY)
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
}

/** 烫金覆盖层:贴在外表面上的薄片 */
function buildFoilLayer(panel: PanelDef, t: number, foilPolys: { x: number; y: number }[][]): THREE.Mesh | null {
  if (!foilPolys.length) return null
  const group = new THREE.Group()
  const mat = new THREE.MeshStandardMaterial({
    color: FOIL_MATERIAL.color,
    metalness: FOIL_MATERIAL.metalness,
    roughness: FOIL_MATERIAL.roughness,
    side: THREE.FrontSide,
  })
  for (const fp of foilPolys) {
    const shape = toShape(fp)
    const geo = new THREE.ShapeGeometry(shape)
    const mesh = new THREE.Mesh(geo, mat)
    mesh.position.z = -t - 0.15 // 外表面外 0.15mm,防 z-fighting
    group.add(mesh)
  }
  return group as unknown as THREE.Mesh
}

export function buildBoxScene(
  box: BoxDef,
  textures: Map<string, THREE.Texture>,
): BoxScene {
  const t = box.params.t
  const root = new THREE.Group()
  const panelMap = new Map(box.panels.map((p) => [p.id, p]))
  const meshes: PanelMesh[] = []

  for (const panel of box.panels) {
    const group = new THREE.Group()
    group.name = panel.id
    const geo = buildPanelGeometry(panel, t)
    applyPlanarUV(geo, panel)
    const tex = textures.get(panel.id)
    const mats = makeMaterials(box, panel, tex)
    const mesh = new THREE.Mesh(geo, mats)
    if (panel.isGlue) {
      for (const m of mats) {
        m.transparent = true
        m.opacity = 0.55
      }
    }
    group.add(mesh)

    const foil = box.foil[panel.id]
    if (foil?.length) {
      const foilMesh = buildFoilLayer(panel, t, foil)
      if (foilMesh) group.add(foilMesh)
    }

    root.add(group)

    meshes.push({
      panel,
      group,
      update: (progress: FoldProgress, groupOffset?: Vec3) => {
        const matrix = composeWorld(panel, panelMap, progress, t, box, groupOffset)
        group.matrixAutoUpdate = false
        group.matrix.copy(matrix)
      },
    })
  }

  // 展示姿态(管式盒竖立)
  if (box.displayRotation) {
    root.rotation.set(
      THREE.MathUtils.degToRad(box.displayRotation.x),
      THREE.MathUtils.degToRad(box.displayRotation.y),
      THREE.MathUtils.degToRad(box.displayRotation.z),
    )
  }

  const dispose = () => {
    root.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose()
        const m = o.material
        if (Array.isArray(m)) m.forEach((x) => x.dispose())
        else m.dispose()
      }
    })
  }

  return { root, panels: meshes, dispose }
}

/** 组合面板世界矩阵:父级链 × 自身局部折叠。组平移由外部按当前组装进度传入 */
function composeWorld(
  panel: PanelDef,
  panelMap: Map<string, PanelDef>,
  progress: FoldProgress,
  t: number,
  box: BoxDef,
  groupOffset?: Vec3,
): THREE.Matrix4 {
  const local = new THREE.Matrix4().fromArray(localFoldMatrix(panel, progress[panel.id] ?? 0, t))
  if (!panel.parentId) {
    const group = box.groups.find((g) => g.rootIds.includes(panel.id))
    // 外部传入组装动画插值偏移;无动画时退回到静态组装位
    const off = groupOffset ?? group?.assembledOffset ?? { x: 0, y: 0, z: 0 }
    return new THREE.Matrix4().makeTranslation(off.x, off.y, off.z).multiply(local)
  }
  const parent = panelMap.get(panel.parentId)
  if (!parent) return local
  return composeWorld(parent, panelMap, progress, t, box, groupOffset).multiply(local)
}

/** 组装动画:根据全局进度在停放位与扣合位之间插值 */
export function groupOffsetAt(box: BoxDef, globalProgress: number): Map<string, THREE.Vector3> {
  const out = new Map<string, THREE.Vector3>()
  for (const g of box.groups) {
    if (!g.assembleRange || !g.assembledOffset) {
      out.set(g.id, new THREE.Vector3())
      continue
    }
    const [s, e] = g.assembleRange
    const k = Math.min(1, Math.max(0, (globalProgress - s) / (e - s)))
    const ease = k * k * (3 - 2 * k)
    const parked = g.parkedOffset ?? { x: g.assembledOffset.x, y: g.assembledOffset.y, z: g.assembledOffset.z + 60 }
    out.set(
      g.id,
      new THREE.Vector3(
        parked.x + (g.assembledOffset.x - parked.x) * ease,
        parked.y + (g.assembledOffset.y - parked.y) * ease,
        parked.z + (g.assembledOffset.z - parked.z) * ease,
      ),
    )
  }
  return out
}

export { foldSign, creaseEndpoints }
