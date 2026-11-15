import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore, useCurrentBox } from '../store/useStore.ts'
import { buildDieline, exportDielineSVG, importDielineSVG } from '../lib/svg.ts'
import type { BoxParams } from '../types.ts'

export default function DielinePage() {
  const box = useCurrentBox()
  const reshape = useStore((s) => s.reshape)
  const goto = useStore((s) => s.goto)
  const addBox = useStore((s) => s.addBox)
  const fileRef = useRef<HTMLInputElement>(null)
  const [zoom, setZoom] = useState(1)
  const [showDim, setShowDim] = useState(true)
  const [toast, setToast] = useState('')

  const dl = useMemo(() => (box ? buildDieline(box) : null), [box])
  const [draft, setDraft] = useState<BoxParams | null>(null)

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(''), 2600)
    return () => clearTimeout(t)
  }, [toast])

  if (!box || !dl) {
    return (
      <div className="empty">
        <div className="big">✂</div>
        <p>还没有盒型,先去盒型库新建一个</p>
        <button className="btn primary" onClick={() => goto('library')}>去盒型库</button>
      </div>
    )
  }

  const cur = draft ?? box.params
  const p = box.params
  const setP = (patch: Partial<BoxParams>) => {
    setDraft((d) => ({ ...(d ?? p), ...patch }))
  }

  const doExport = () => {
    const svg = exportDielineSVG(box)
    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${box.name.replace(/\s+/g, '_')}_刀版.svg`
    a.click()
    URL.revokeObjectURL(url)
    setToast('刀版 SVG 已导出(红色裁切/蓝色虚线压痕,含完整折叠元数据)')
  }

  const doImport = async (file: File) => {
    const text = await file.text()
    const result = importDielineSVG(text, file.name.replace(/\.svg$/i, ''))
    if (result.box) {
      addBox(result.box.templateId, result.box.params)
      const id = useStore.getState().currentId!
      useStore.getState().updateBox(id, {
        panels: result.box.panels,
        steps: result.box.steps,
        groups: result.box.groups,
        name: result.box.name,
        material: result.box.material,
      })
      setToast(result.warning ?? 'SVG 已导入并识别压痕线')
    } else {
      setToast(result.warning ?? '导入失败')
    }
  }

  const { min, max } = dl.bounds
  const w = max.x - min.x
  const h = max.y - min.y
  const pad = 14
  const vb = `${min.x - pad} ${min.y - pad} ${w + pad * 2} ${h + pad * 2}`

  return (
    <div>
      <div className="page-head">
        <h2>刀版编辑</h2>
        <span className="desc">修改长宽高/纸厚后自动重新生成;裁切线与压痕线分层输出</span>
        <span className="spacer" style={{ flex: 1 }} />
        <button className="btn" onClick={() => setZoom((z) => Math.max(0.4, z - 0.2))}>缩小</button>
        <button className="btn" onClick={() => setZoom((z) => Math.min(3, z + 0.2))}>放大</button>
        <button className="btn" onClick={() => setShowDim((v) => !v)}>{showDim ? '隐藏' : '显示'}标注</button>
        <label className="btn file-input">
          导入 SVG
          <input
            ref={fileRef}
            type="file"
            accept=".svg,image/svg+xml"
            onChange={(e) => e.target.files?.[0] && doImport(e.target.files[0])}
          />
        </label>
        <button className="btn primary" onClick={doExport}>导出 SVG</button>
      </div>

      <div className="workspace">
        <div className="canvas-host" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg
            viewBox={vb}
            style={{ width: `${92 * zoom}%`, height: `${92 * zoom}%` }}
            preserveAspectRatio="xMidYMid meet"
          >
            {/* 裁切环 */}
            {dl.cuts.map((loop, i) => (
              <path
                key={`c${i}`}
                d={loop.poly.map((q, k) => `${k ? 'L' : 'M'}${q.x} ${q.y}`).join(' ') + ' Z'}
                fill="rgba(225,29,72,0.05)"
                stroke="#e11d48"
                strokeWidth={0.8 / zoom}
                fillRule="evenodd"
              />
            ))}
            {/* 压痕线 */}
            {dl.creases.map((c, i) => (
              <line
                key={`r${i}`}
                x1={c.a.x} y1={c.a.y} x2={c.b.x} y2={c.b.y}
                stroke="#2563eb"
                strokeWidth={0.7 / zoom}
                strokeDasharray={`${3 / zoom} ${2 / zoom}`}
              />
            ))}
            {/* 尺寸标注 */}
            {showDim && (
              <g fontFamily="Arial" fontSize={4.5} fill="#374151">
                <text x={min.x} y={min.y - 5}>幅面 {w.toFixed(1)} × {h.toFixed(1)} mm</text>
                <DimensionLine x1={min.x} y1={max.y + 8} x2={max.x} y2={max.y + 8} text={`L=${p.L}`} zoom={zoom} />
                <DimensionLine x1={max.x + 8} y1={min.y} x2={max.x + 8} y2={max.y} text={`W=${p.W}`} vertical zoom={zoom} />
              </g>
            )}
          </svg>
        </div>

        <aside className="side-panel">
          <h4>内径与纸厚 (mm)</h4>
          <div className="param-grid">
            <NumField label="长 L" value={cur.L} onChange={(v) => setP({ L: v })} min={20} max={2000} />
            <NumField label="宽 W" value={cur.W} onChange={(v) => setP({ W: v })} min={20} max={2000} />
            <NumField label="高 H" value={cur.H} onChange={(v) => setP({ H: v })} min={10} max={2000} />
            <NumField label="纸厚 t" value={cur.t} onChange={(v) => setP({ t: v })} min={0.2} max={5} step={0.1} />
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <button
              className="btn primary"
              disabled={!draft}
              onClick={() => {
                if (draft) {
                  reshape(box.id, draft)
                  setDraft(null)
                  setToast('已按新参数重新生成刀版与折叠模型')
                }
              }}
            >
              应用并重新生成
            </button>
            <button
              className="btn"
              disabled={!draft}
              onClick={() => setDraft(null)}
            >
              还原
            </button>
          </div>

          <div className="sep" />
          <h4>刀版统计</h4>
          <div className="meta" style={{ fontSize: 13, lineHeight: 2, color: 'var(--text-2)' }}>
            <div>裁切线:<b style={{ color: 'var(--cut)' }}>{dl.cuts.length}</b> 个闭合环</div>
            <div>压痕线:<b style={{ color: 'var(--crease)' }}>{dl.creases.length}</b> 条</div>
            <div>板件数:{box.panels.length}</div>
            <div>网络幅面:{w.toFixed(1)} × {h.toFixed(1)} mm</div>
          </div>

          <div className="sep" />
          <div className="legend">
            <span><i className="swatch cut" />裁切线</span>
            <span><i className="swatch crease" />压痕线</span>
          </div>
          <p style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.7 }}>
            导入说明:本系统导出的 SVG 可无损重建折叠模型;第三方刀版 SVG 会自动识别蓝色或虚线压痕,
            未识别的压痕可在面板层级中后续手动指定。
          </p>
        </aside>
      </div>
      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}

function NumField({ label, value, onChange, min, max, step = 1 }: {
  label: string
  value: number
  onChange: (v: number) => void
  min: number
  max: number
  step?: number
}) {
  return (
    <div className="form-row">
      <label>{label}</label>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          const v = Number(e.target.value)
          if (Number.isFinite(v)) onChange(v)
        }}
      />
    </div>
  )
}

function DimensionLine({ x1, y1, x2, y2, text, vertical, zoom }: {
  x1: number; y1: number; x2: number; y2: number; text: string; vertical?: boolean; zoom: number
}) {
  return (
    <g stroke="#6b7280" strokeWidth={0.35 / zoom}>
      <line x1={x1} y1={y1} x2={x2} y2={y2} />
      {!vertical && <text x={(x1 + x2) / 2} y={y1 - 2} textAnchor="middle" stroke="none">{text}</text>}
      {vertical && <text x={x1 + 2} y={(y1 + y2) / 2} stroke="none">{text}</text>}
    </g>
  )
}
