import { useState } from 'react'
import { useStore } from '../store/useStore.ts'
import { TEMPLATE_LIST, DEFAULT_PARAMS } from '../lib/templates.ts'
import { MATERIALS } from '../lib/materials.ts'
import type { BoxDef, BoxTemplateId } from '../types.ts'
import DielineThumb from '../components/DielineThumb.tsx'

export default function LibraryPage() {
  const boxes = useStore((s) => s.boxes)
  const addBox = useStore((s) => s.addBox)
  const removeBox = useStore((s) => s.removeBox)
  const duplicate = useStore((s) => s.duplicate)
  const select = useStore((s) => s.select)
  const goto = useStore((s) => s.goto)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [name, setName] = useState('')

  const open = (b: BoxDef, page: 'dieline' | 'fold' | 'print') => {
    select(b.id)
    goto(page)
  }

  return (
    <div>
      <div className="page-head">
        <h2>盒型库</h2>
        <span className="desc">从参数化模板新建,常见盒型已内置厚度补偿规则</span>
      </div>

      <h4 style={{ margin: '4px 0 10px' }}>新建盒型</h4>
      <div className="template-row">
        {TEMPLATE_LIST.map((t) => (
          <button
            key={t.id}
            className="template-pick"
            onClick={() => addBox(t.id, { ...DEFAULT_PARAMS[t.id] })}
          >
            <h4>+ {t.name}</h4>
            <p>{t.desc}</p>
            <p className="mono" style={{ marginTop: 6 }}>
              默认 {DEFAULT_PARAMS[t.id].L}×{DEFAULT_PARAMS[t.id].W}×{DEFAULT_PARAMS[t.id].H} t={DEFAULT_PARAMS[t.id].t}mm
            </p>
          </button>
        ))}
      </div>

      <h4 style={{ margin: '22px 0 10px' }}>我的盒型 ({boxes.length})</h4>
      <div className="grid-cards">
        {boxes.map((b) => (
          <div key={b.id} className="card box-card" onClick={() => open(b, 'fold')}>
            <div className="thumb">
              <DielineThumb box={b} height={140} />
            </div>
            {renaming === b.id ? (
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                onBlur={() => {
                  useStore.getState().updateBox(b.id, { name: name || b.name })
                  setRenaming(null)
                }}
                onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
              />
            ) : (
              <h3>{b.name}</h3>
            )}
            <div className="meta">
              <span className="badge">{TEMPLATE_LIST.find((t) => t.id === b.templateId)?.name}</span>{' '}
              <span className="badge kraft">{MATERIALS[b.material].name}</span>
              <div style={{ marginTop: 6 }}>
                内径 {b.params.L}×{b.params.W}×{b.params.H} mm · 纸厚 {b.params.t} mm
              </div>
              <div>{b.panels.length} 个板件 · {b.steps.length} 道工序</div>
            </div>
            <div className="actions" onClick={(e) => e.stopPropagation()}>
              <button className="btn small primary" onClick={() => open(b, 'fold')}>折叠预览</button>
              <button className="btn small" onClick={() => open(b, 'dieline')}>刀版</button>
              <button
                className="btn small"
                onClick={() => {
                  setRenaming(b.id)
                  setName(b.name)
                }}
              >
                重命名
              </button>
              <button className="btn small" onClick={() => duplicate(b.id)}>复制</button>
              <button
                className="btn small danger"
                onClick={() => {
                  if (confirm(`确认删除「${b.name}」?`)) removeBox(b.id)
                }}
              >
                删除
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export function templateLabel(id: BoxTemplateId): string {
  return TEMPLATE_LIST.find((t) => t.id === id)?.name ?? id
}
