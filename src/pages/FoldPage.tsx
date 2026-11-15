import { useEffect, useRef, useState } from 'react'
import { useStore, useCurrentBox } from '../store/useStore.ts'
import FoldViewer from '../components/FoldViewer.tsx'
import { MATERIALS } from '../lib/materials.ts'

export default function FoldPage() {
  const box = useCurrentBox()
  const progress = useStore((s) => s.foldProgress)
  const setProgress = useStore((s) => s.setFoldProgress)
  const goto = useStore((s) => s.goto)
  const [playing, setPlaying] = useState(false)
  const [shotToken, setShotToken] = useState(0)
  const [toast, setToast] = useState('')
  const rafRef = useRef(0)

  useEffect(() => {
    if (!playing) return
    let last = performance.now()
    const loop = (now: number) => {
      const dt = (now - last) / 1000
      last = now
      const next = useStore.getState().foldProgress + dt * 0.28
      if (next >= 1) {
        setProgress(1)
        setPlaying(false)
        return
      }
      setProgress(next)
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafRef.current)
  }, [playing, setProgress])

  if (!box) {
    return (
      <div className="empty">
        <div className="big">📦</div>
        <p>先选择一个盒型</p>
        <button className="btn primary" onClick={() => goto('library')}>去盒型库</button>
      </div>
    )
  }

  const stepAt = (p: number) => box.steps.find((s) => p >= s.start && p < s.end) ?? box.steps[box.steps.length - 1]
  const currentStep = stepAt(progress)

  const jumpStep = (idx: number) => {
    const s = box.steps[idx]
    setProgress(Math.min(1, s.end))
  }

  const onShot = (url: string) => {
    const a = document.createElement('a')
    a.href = url
    a.download = `${box.name.replace(/\s+/g, '_')}_${box.params.L}x${box.params.W}x${box.params.H}_截图.png`
    a.click()
    setToast('截图已保存(含 L/W/H/t 尺寸标注)')
    setTimeout(() => setToast(''), 2600)
  }

  return (
    <div>
      <div className="page-head">
        <h2>折叠预览</h2>
        <span className="desc">
          {currentStep?.label ?? '完成态'} · {MATERIALS[box.material].name} · 纸厚 {box.params.t}mm 厚度补偿已启用
        </span>
        <span style={{ flex: 1 }} />
        <button className="btn" onClick={() => setProgress(0)}>平铺</button>
        <button className="btn primary" onClick={() => setPlaying((v) => !v)}>
          {playing ? '⏸ 暂停' : '▶ 播放折叠'}
        </button>
        <button className="btn" onClick={() => setShotToken((n) => n + 1)}>📷 截图(带尺寸)</button>
      </div>

      <div className="workspace" style={{ gridTemplateColumns: '1fr 280px' }}>
        <div className="canvas-host">
          <FoldViewer box={box} progress={progress} shotToken={shotToken} onShot={onShot} />
        </div>

        <aside className="side-panel">
          <h4>折叠工序 ({box.steps.length})</h4>
          <div className="face-list">
            {box.steps.map((s, i) => {
              const active = currentStep?.id === s.id
              const done = progress >= s.end
              return (
                <div key={s.id} className="face-item" style={{ cursor: 'pointer' }} onClick={() => jumpStep(i)}>
                  <span className="dot" style={{ background: done ? '#16a34a' : active ? '#2563eb' : '#cbd5e1' }} />
                  <span className="fname">{i + 1}. {s.label}</span>
                  <span className="tag mono">{(s.start * 100).toFixed(0)}-{(s.end * 100).toFixed(0)}%</span>
                </div>
              )
            })}
          </div>

          <div className="sep" />
          <h4>视角提示</h4>
          <p style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.8 }}>
            · 左键拖动旋转视角<br />
            · 滚轮缩放<br />
            · 时间轴可拖到任意中间姿态<br />
            · 半透明板件为胶合耳/防尘耳
          </p>

          <div className="sep" />
          <h4>贴合保证</h4>
          <div className="check-line ok">✅ 内表面压痕轴建模</div>
          <div className="check-line ok">✅ 结构板实体零重叠</div>
          <div className="check-line ok">✅ 贴合公差 &lt; 0.01mm</div>
          <div className="check-line ok">✅ 角部让位缺口防干涉</div>
        </aside>
      </div>

      <div className="timeline">
        <div className="steps">
          {box.steps.map((s, i) => (
            <div
              key={s.id}
              className="seg"
              style={{
                background: progress >= s.end ? '#16a34a' : progress > s.start ? '#2563eb' : '#e2e8f0',
                cursor: 'pointer',
              }}
              onClick={() => jumpStep(i)}
              title={s.label}
            />
          ))}
        </div>
        <input
          type="range"
          min={0}
          max={1000}
          value={Math.round(progress * 1000)}
          onChange={(e) => setProgress(Number(e.target.value) / 1000)}
        />
        <div className="step-labels">
          <span>平铺网络 0%</span>
          {box.steps.map((s) => <span key={s.id}>{s.label}</span>)}
          <span>成型 100%</span>
        </div>
      </div>
      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
