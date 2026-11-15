import { useRef, useState } from 'react'
import { useStore, useCurrentBox } from '../store/useStore.ts'
import { makeDemoArtwork } from '../lib/printTexture.ts'
import DielineThumb from '../components/DielineThumb.tsx'
import type { Vec2 } from '../types.ts'

const DEMO_COLORS = ['#fde68a', '#bfdbfe', '#bbf7d0', '#fecaca', '#ddd6fe', '#fed7aa']

export default function PrintPage() {
  const box = useCurrentBox()
  const setPrint = useStore((s) => s.setPrint)
  const setBleed = useStore((s) => s.setBleed)
  const setFoil = useStore((s) => s.setFoil)
  const goto = useStore((s) => s.goto)
  const [selected, setSelected] = useState<string>('')
  const [toast, setToast] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const foilRef = useRef<HTMLInputElement>(null)

  if (!box) {
    return (
      <div className="empty">
        <div className="big">🎨</div>
        <p>先选择一个盒型</p>
        <button className="btn primary" onClick={() => goto('library')}>去盒型库</button>
      </div>
    )
  }

  const activeId = selected || box.panels[0]?.id || ''
  const active = box.panels.find((p) => p.id === activeId)
  const say = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(''), 2600)
  }

  const onUpload = (file: File) => {
    const reader = new FileReader()
    reader.onload = () => {
      setPrint(box.id, activeId, String(reader.result))
      say(`已将「${file.name}」分配给 ${active?.name},出血 ${box.bleed}mm 自动外扩`)
    }
    reader.readAsDataURL(file)
  }

  const assignDemo = (color: string, i: number) => {
    const canvas = makeDemoArtwork(active?.name ?? `面${i}`, color)
    setPrint(box.id, activeId, canvas.toDataURL('image/png'))
    say(`示例图案已分配给 ${active?.name}`)
  }

  // 烫金:上传带透明通道的 PNG,取不透明区域轮廓(简化为外接矩形多边形)
  const onFoilUpload = (file: File) => {
    const img = new Image()
    img.onload = () => {
      const c = document.createElement('canvas')
      c.width = img.width
      c.height = img.height
      const ctx = c.getContext('2d')!
      ctx.drawImage(img, 0, 0)
      const data = ctx.getImageData(0, 0, c.width, c.height).data
      let minX = c.width
      let minY = c.height
      let maxX = 0
      let maxY = 0
      for (let y = 0; y < c.height; y++)
        for (let x = 0; x < c.width; x++)
          if (data[(y * c.width + x) * 4 + 3] > 40) {
            minX = Math.min(minX, x)
            minY = Math.min(minY, y)
            maxX = Math.max(maxX, x)
            maxY = Math.max(maxY, y)
          }
      if (maxX <= minX) {
        say('未检测到不透明烫金区域')
        return
      }
      if (!active) return
      const xs = active.poly.map((q) => q.x)
      const ys = active.poly.map((q) => q.y)
      const pxMin = Math.min(...xs)
      const pxMax = Math.max(...xs)
      const pyMin = Math.min(...ys)
      const pyMax = Math.max(...ys)
      const toMM = (u: number, v: number): Vec2 => ({
        x: pxMin + (u / c.width) * (pxMax - pxMin),
        y: pyMin + (v / c.height) * (pyMax - pyMin),
      })
      const poly = [toMM(minX, minY), toMM(maxX, minY), toMM(maxX, maxY), toMM(minX, maxY)]
      setFoil(box.id, activeId, [poly])
      say(`烫金区域已标注到 ${active.name}(金属材质独立渲染)`)
    }
    img.src = URL.createObjectURL(file)
  }

  return (
    <div>
      <div className="page-head">
        <h2>印刷面</h2>
        <span className="desc">按面板分配印刷图案,出血区边缘像素外扩;烫金区域用金属材质单独标注</span>
      </div>

      <div className="workspace">
        <div className="canvas-host" style={{ padding: 20 }}>
          <DielineThumb box={box} height={300} />
          <div style={{ marginTop: 16, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {box.panels.map((p, i) => (
              <button
                key={p.id}
                className={`btn small ${p.id === activeId ? 'primary' : ''}`}
                onClick={() => setSelected(p.id)}
                title={p.name}
              >
                {box.prints[p.id] ? '🖼' : '▫'} {p.name}
                {box.foil[p.id] ? ' ✨' : ''}
              </button>
            ))}
          </div>
          {box.prints[activeId] && (
            <div style={{ marginTop: 18 }}>
              <div className="legend"><span>当前面贴图预览(含 {box.bleed}mm 出血外扩):</span></div>
              <img
                src={box.prints[activeId]}
                alt="print"
                style={{ maxWidth: 260, border: '1px solid var(--border)', borderRadius: 8 }}
              />
            </div>
          )}
        </div>

        <aside className="side-panel">
          <h4>面板列表 ({box.panels.length})</h4>
          <div className="face-list" style={{ maxHeight: 240, overflow: 'auto' }}>
            {box.panels.map((p) => (
              <div
                key={p.id}
                className={`face-item ${p.id === activeId ? 'active' : ''}`}
                onClick={() => setSelected(p.id)}
              >
                <span className="dot" style={{ background: box.prints[p.id] ? '#16a34a' : '#cbd5e1' }} />
                <span className="fname">{p.name}</span>
                <span className="tag">
                  {box.prints[p.id] ? '已贴图' : '空白'}
                  {box.foil[p.id] ? ' ·烫金' : ''}
                </span>
              </div>
            ))}
          </div>

          <div className="sep" />
          <h4>给「{active?.name}」分配图案</h4>
          <label className="btn primary file-input" style={{ width: '100%', justifyContent: 'center' }}>
            上传印刷图 (PNG/JPG)
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              onChange={(e) => e.target.files?.[0] && onUpload(e.target.files[0])}
            />
          </label>
          <div style={{ margin: '12px 0 6px', fontSize: 12, color: 'var(--muted)' }}>或用示例色块:</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {DEMO_COLORS.map((c, i) => (
              <button
                key={c}
                onClick={() => assignDemo(c, i)}
                style={{ width: 34, height: 34, background: c, border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer' }}
                title={`示例色 ${i + 1}`}
              />
            ))}
          </div>
          {box.prints[activeId] && (
            <button className="btn danger small" style={{ marginTop: 12, width: '100%' }} onClick={() => {
              setPrint(box.id, activeId, null)
              say('已清除该面贴图')
            }}>
              清除该面贴图
            </button>
          )}

          <div className="sep" />
          <h4>出血位</h4>
          <div className="form-row">
            <label>出血 mm</label>
            <input
              type="number"
              min={0}
              max={10}
              step={0.5}
              value={box.bleed}
              onChange={(e) => setBleed(box.id, Number(e.target.value) || 0)}
            />
          </div>
          <p style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.7 }}>
            渲染时贴图在面板四周外扩出血,边缘像素 clamp 延展,折好后裁切线内为安全印刷区。
          </p>

          <div className="sep" />
          <h4>烫金区域</h4>
          <label className="btn foil-btn file-input" style={{ width: '100%', justifyContent: 'center' }}>
            ✨ 上传烫金蒙版(不透明=烫金)
            <input
              ref={foilRef}
              type="file"
              accept="image/png"
              onChange={(e) => e.target.files?.[0] && onFoilUpload(e.target.files[0])}
            />
          </label>
          {box.foil[activeId] && (
            <button className="btn small" style={{ marginTop: 8, width: '100%' }} onClick={() => setFoil(box.id, activeId, [])}>
              清除烫金标注
            </button>
          )}
        </aside>
      </div>
      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
