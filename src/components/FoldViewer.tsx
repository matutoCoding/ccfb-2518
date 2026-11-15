import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import type { BoxDef } from '../types.ts'
import { buildBoxScene, groupOffsetAt, type BoxScene } from '../three/sceneBuilder.ts'
import { progressAt } from '../lib/foldMath.ts'
import { loadImage, makePanelTexture } from '../lib/printTexture.ts'

interface Props {
  box: BoxDef
  progress: number
  /** 截图请求 token:变化时触发截图并回传 dataURL */
  shotToken?: number
  onShot?: (url: string) => void
  showDims?: boolean
}

/** 轻量轨道控制(避免额外依赖) */
class MiniOrbit {
  azim = -Math.PI / 4
  polar = Math.PI / 3.2
  radius = 0
  target = new THREE.Vector3()
  private el: HTMLElement
  private dragging = false
  private last = { x: 0, y: 0 }
  enabled = true

  constructor(camera: THREE.PerspectiveCamera, el: HTMLElement) {
    this.el = el
    const apply = () => {
      camera.position.set(
        this.target.x + this.radius * Math.sin(this.polar) * Math.cos(this.azim),
        this.target.y + this.radius * Math.cos(this.polar),
        this.target.z + this.radius * Math.sin(this.polar) * Math.sin(this.azim),
      )
      camera.lookAt(this.target)
    }
    el.addEventListener('pointerdown', (e) => {
      if (!this.enabled) return
      this.dragging = true
      this.last = { x: e.clientX, y: e.clientY }
      el.setPointerCapture(e.pointerId)
    })
    el.addEventListener('pointermove', (e) => {
      if (!this.dragging) return
      const dx = e.clientX - this.last.x
      const dy = e.clientY - this.last.y
      this.last = { x: e.clientX, y: e.clientY }
      this.azim -= dx * 0.008
      this.polar = Math.min(Math.PI - 0.08, Math.max(0.08, this.polar - dy * 0.008))
      apply()
    })
    el.addEventListener('pointerup', () => (this.dragging = false))
    el.addEventListener('wheel', (e) => {
      e.preventDefault()
      this.radius = Math.max(30, this.radius * (1 + Math.sign(e.deltaY) * 0.08))
      apply()
    }, { passive: false })
    this.apply = apply
  }
  apply: () => void
}

export default function FoldViewer({ box, progress, shotToken, onShot, showDims = true }: Props) {
  const mountRef = useRef<HTMLDivElement>(null)
  const stateRef = useRef<{
    renderer?: THREE.WebGLRenderer
    scene?: THREE.Scene
    camera?: THREE.PerspectiveCamera
    boxScene?: BoxScene
    orbit?: MiniOrbit
    overlay?: HTMLCanvasElement
    box?: BoxDef
  }>({})
  const progressRef = useRef(progress)
  progressRef.current = progress
  const showDimsRef = useRef(showDims)
  showDimsRef.current = showDims

  // 场景重建(盒型变化时)
  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return

    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true })
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio))
    renderer.setSize(mount.clientWidth, mount.clientHeight)
    renderer.shadowMap.enabled = true
    mount.innerHTML = ''
    mount.appendChild(renderer.domElement)

    const overlay = document.createElement('canvas')
    overlay.style.position = 'absolute'
    overlay.style.inset = '0'
    overlay.style.pointerEvents = 'none'
    mount.appendChild(overlay)

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0xf1f5f9)
    const camera = new THREE.PerspectiveCamera(38, mount.clientWidth / mount.clientHeight, 0.1, 20000)

    // 灯光
    scene.add(new THREE.AmbientLight(0xffffff, 0.75))
    const key = new THREE.DirectionalLight(0xffffff, 1.6)
    key.position.set(300, 400, 250)
    key.castShadow = true
    key.shadow.mapSize.set(1024, 1024)
    scene.add(key)
    const fill = new THREE.DirectionalLight(0xdbeafe, 0.5)
    fill.position.set(-300, 150, -200)
    scene.add(fill)

    // 地面
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(8000, 8000),
      new THREE.ShadowMaterial({ opacity: 0.12 }),
    )
    ground.rotation.x = -Math.PI / 2
    ground.position.y = -0.2
    ground.receiveShadow = true
    scene.add(ground)
    const grid = new THREE.GridHelper(4000, 40, 0xcbd5e1, 0xe2e8f0)
    grid.position.y = -0.15
    scene.add(grid)

    const orbit = new MiniOrbit(camera, renderer.domElement)
    stateRef.current = { renderer, scene, camera, orbit, overlay, box }

    // 异步加载贴图后构建盒体
    let cancelled = false
    void (async () => {
      const textures = new Map<string, THREE.Texture>()
      for (const [panelId, url] of Object.entries(box.prints)) {
        try {
          const img = await loadImage(url)
          const panel = box.panels.find((q) => q.id === panelId)
          if (!panel) continue
          const cnv = makePanelTexture(panel, img, box.bleed, Math.max(box.params.L, box.params.W))
          const tex = new THREE.CanvasTexture(cnv)
          tex.colorSpace = THREE.SRGBColorSpace
          tex.anisotropy = renderer.capabilities.getMaxAnisotropy()
          textures.set(panelId, tex)
        } catch {
          // 坏贴图忽略
        }
      }
      if (cancelled) return
      const boxScene = buildBoxScene(box, textures)
      boxScene.root.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.castShadow = true
          o.receiveShadow = true
        }
      })
      scene.add(boxScene.root)
      stateRef.current.boxScene = boxScene

      // 相机自适应
      const bb = new THREE.Box3().setFromObject(boxScene.root)
      const size = bb.getSize(new THREE.Vector3())
      const center = bb.getCenter(new THREE.Vector3())
      orbit.target.copy(center)
      orbit.radius = Math.max(size.x, size.y, size.z) * 1.9
      orbit.apply()
    })()

    const onResize = () => {
      const w = mount.clientWidth
      const h = mount.clientHeight
      renderer.setSize(w, h)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      overlay.width = w * renderer.getPixelRatio()
      overlay.height = h * renderer.getPixelRatio()
    }
    onResize()
    window.addEventListener('resize', onResize)

    let raf = 0
    const tick = () => {
      raf = requestAnimationFrame(tick)
      const st = stateRef.current
      if (st.boxScene) {
        const prog = progressAt(box.panels, box.steps, progressRef.current)
        const offsets = groupOffsetAt(box, progressRef.current)
        // 预计算每个面板所属组的当前偏移(组装动画的唯一应用入口)
        const panelGroup = new Map<string, THREE.Vector3 | undefined>()
        for (const g of box.groups) {
          const off = offsets.get(g.id)
          const collect = (rootId: string) => {
            panelGroup.set(rootId, off)
            const children = box.panels.filter((q) => q.parentId === rootId).map((q) => q.id)
            children.forEach(collect)
          }
          g.rootIds.forEach(collect)
        }
        for (const pm of st.boxScene.panels) {
          const off = panelGroup.get(pm.panel.id)
          pm.update(prog, off ? { x: off.x, y: off.y, z: off.z } : undefined)
        }
      }
      renderer.render(scene, camera)
      drawOverlay(stateRef.current, box, progressRef.current, showDimsRef.current, false, st.boxScene?.root)
    }
    tick()

    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', onResize)
      stateRef.current.boxScene?.dispose()
      renderer.dispose()
      mount.innerHTML = ''
    }
  }, [box])

  // 截图
  useEffect(() => {
    if (!shotToken || !onShot) return
    const st = stateRef.current
    if (!st.renderer || !st.scene || !st.camera) return
    st.renderer.render(st.scene, st.camera)
    drawOverlay(stateRef.current, box, progressRef.current, true, true, stateRef.current.boxScene?.root)
    const url = st.renderer.domElement.toDataURL('image/png')
    onShot(url)
    drawOverlay(stateRef.current, box, progressRef.current, showDimsRef.current, false, stateRef.current.boxScene?.root)
  }, [shotToken])

  return <div ref={mountRef} style={{ width: '100%', height: '100%', position: 'relative' }} />
}

/** 各盒型在折叠本地坐标系(展示旋转前)中的尺寸锚点:两条底边 + 一条高 */
function dimensionAnchors(box: BoxDef): { from: THREE.Vector3; to: THREE.Vector3; label: string }[] {
  const { L, W, H } = box.params
  if (box.templateId === 'tuckend') {
    // 管身本地:前板 z=0,后板 z=W,左右墙 x∈[0,L],管轴 y∈[-H/2,H/2]
    return [
      { from: new THREE.Vector3(0, -H / 2, 0), to: new THREE.Vector3(L, -H / 2, 0), label: `L=${L}mm` },
      { from: new THREE.Vector3(0, -H / 2, 0), to: new THREE.Vector3(0, -H / 2, W), label: `W=${W}mm` },
      { from: new THREE.Vector3(0, -H / 2, 0), to: new THREE.Vector3(0, H / 2, 0), label: `H=${H}mm` },
    ]
  }
  // 托盘类(飞机盒/天地盖底托):底板 z=0,四角 ±L/2、±W/2,墙高沿 z
  return [
    { from: new THREE.Vector3(-L / 2, -W / 2, 0), to: new THREE.Vector3(L / 2, -W / 2, 0), label: `L=${L}mm` },
    { from: new THREE.Vector3(L / 2, -W / 2, 0), to: new THREE.Vector3(L / 2, W / 2, 0), label: `W=${W}mm` },
    { from: new THREE.Vector3(L / 2, W / 2, 0), to: new THREE.Vector3(L / 2, W / 2, H), label: `H=${H}mm` },
  ]
}

/** 叠加层:尺寸标注 + 参数水印(截图同样保留) */
function drawOverlay(
  st: { overlay?: HTMLCanvasElement; camera?: THREE.PerspectiveCamera; renderer?: THREE.WebGLRenderer },
  box: BoxDef,
  progress: number,
  showDims: boolean,
  forShot = false,
  root?: THREE.Object3D,
) {
  const { overlay, camera, renderer } = st
  if (!overlay || !camera || !renderer) return
  const ctx = overlay.getContext('2d')!
  const dpr = renderer.getPixelRatio()
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, overlay.width, overlay.height)
  const cssW = overlay.width / dpr
  const cssH = overlay.height / dpr

  // 标题/参数(始终显示)
  ctx.font = '13px sans-serif'
  ctx.fillStyle = 'rgba(15,23,42,0.85)'
  ctx.fillText(`${box.name}  ·  折叠 ${(progress * 100).toFixed(0)}%`, 14, 22)
  ctx.font = '12px monospace'
  ctx.fillStyle = 'rgba(15,23,42,0.65)'
  ctx.fillText(`内径 L${box.params.L} × W${box.params.W} × H${box.params.H} mm   纸厚 t=${box.params.t} mm`, 14, 40)

  if (!showDims) return
  const { t } = box.params
  const worldRoot = root ?? new THREE.Object3D()
  worldRoot.updateMatrixWorld(true)
  const project = (p: THREE.Vector3) => {
    const q = p.clone().applyMatrix4(worldRoot.matrixWorld)
    q.project(camera)
    return { x: (q.x * 0.5 + 0.5) * cssW, y: (-q.y * 0.5 + 0.5) * cssH, behind: q.z > 1 }
  }
  ctx.strokeStyle = '#0f172a'
  ctx.fillStyle = '#0f172a'
  ctx.lineWidth = 1.2
  ctx.font = '12px sans-serif'
  for (const d of dimensionAnchors(box)) {
    dimArrow(ctx, project(d.from), project(d.to), d.label)
  }
  // 纸厚标记
  ctx.fillStyle = 'rgba(15,23,42,0.6)'
  ctx.fillText(`t=${t}mm(已厚度补偿)`, 14, cssH - 14)
  if (forShot) {
    ctx.fillStyle = 'rgba(15,23,42,0.55)'
    ctx.fillText(new Date().toLocaleString('zh-CN'), cssW - 190, cssH - 14)
  }
}

function dimArrow(ctx: CanvasRenderingContext2D, a: { x: number; y: number; behind?: boolean }, b: { x: number; y: number; behind?: boolean }, text: string) {
  if (a.behind || b.behind) return
  // 外移一点避免压住盒子
  const dx = b.x - a.x
  const dy = b.y - a.y
  const l = Math.hypot(dx, dy) || 1
  const ox = (-dy / l) * 10
  const oy = (dx / l) * 10
  const A = { x: a.x + ox, y: a.y + oy }
  const B = { x: b.x + ox, y: b.y + oy }
  ctx.beginPath()
  ctx.moveTo(A.x, A.y)
  ctx.lineTo(B.x, B.y)
  ctx.stroke()
  // 箭头
  const ang = Math.atan2(B.y - A.y, B.x - A.x)
  for (const P of [A, B]) {
    const dir = P === A ? ang : ang + Math.PI
    ctx.beginPath()
    ctx.moveTo(P.x, P.y)
    ctx.lineTo(P.x + 7 * Math.cos(dir + 0.4), P.y + 7 * Math.sin(dir + 0.4))
    ctx.moveTo(P.x, P.y)
    ctx.lineTo(P.x + 7 * Math.cos(dir - 0.4), P.y + 7 * Math.sin(dir - 0.4))
    ctx.stroke()
  }
  ctx.fillStyle = '#0f172a'
  ctx.fillText(text, (A.x + B.x) / 2 + 4, (A.y + B.y) / 2 - 4)
}
