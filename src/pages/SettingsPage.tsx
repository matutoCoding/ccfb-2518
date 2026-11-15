import { useStore, useCurrentBox } from '../store/useStore.ts'
import { MATERIAL_LIST, MATERIALS } from '../lib/materials.ts'
import type { MaterialId } from '../types.ts'

export default function SettingsPage() {
  const box = useCurrentBox()
  const setMaterial = useStore((s) => s.setMaterial)
  const updateBox = useStore((s) => s.updateBox)
  const goto = useStore((s) => s.goto)

  if (!box) {
    return (
      <div className="empty">
        <div className="big">⚙</div>
        <p>先选择一个盒型</p>
        <button className="btn primary" onClick={() => goto('library')}>去盒型库</button>
      </div>
    )
  }

  const clearStorage = () => {
    if (confirm('确认清空浏览器内全部盒型数据?此操作不可恢复。')) {
      localStorage.removeItem('carton-fold-studio-v1')
      location.reload()
    }
  }

  return (
    <div>
      <div className="page-head">
        <h2>设置</h2>
        <span className="desc">材质、纸张参数与数据管理(当前盒型:{box.name})</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, maxWidth: 900 }}>
        <div className="card">
          <h4 style={{ marginTop: 0 }}>纸板材质</h4>
          <div className="face-list">
            {MATERIAL_LIST.map((m) => (
              <div
                key={m.id}
                className="face-item"
                style={{ cursor: 'pointer', borderColor: box.material === m.id ? 'var(--primary)' : 'var(--border)' }}
                onClick={() => setMaterial(box.id, m.id as MaterialId)}
              >
                <span
                  className="dot"
                  style={{
                    background: `#${m.outerColor.toString(16).padStart(6, '0')}`,
                    border: '1px solid rgba(0,0,0,0.15)',
                  }}
                />
                <span className="fname">{m.name}</span>
                <span className="tag mono">
                  粗糙度 {m.roughness}
                  {m.clearcoat ? ` · 覆膜 ${m.clearcoat}` : ''}
                </span>
              </div>
            ))}
          </div>
          <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 12, lineHeight: 1.7 }}>
            当前材质:<b>{MATERIALS[box.material].name}</b>。覆膜提高 clearcoat 反射,
            牛皮纸/瓦楞提高粗糙度;内外表面使用不同色阶模拟纸芯截面。
          </p>
        </div>

        <div className="card">
          <h4 style={{ marginTop: 0 }}>烫金与工艺</h4>
          <p style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.8 }}>
            烫金区域在「印刷面」页上传蒙版标注,渲染为高金属度(metalness=1)独立材质,
            与普通油墨分层显示。
          </p>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '10px 0' }}>
            <span style={{ width: 46, height: 46, borderRadius: 8, background: 'linear-gradient(135deg,#f5d76e,#b8860b)', boxShadow: 'inset 0 0 8px rgba(0,0,0,.25)' }} />
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>
              烫金预设色 #D4AF37<br />metalness 1.0 / roughness 0.24
            </div>
          </div>
          <div className="sep" />
          <h4>出血默认值</h4>
          <div className="form-row">
            <label>出血 mm</label>
            <input
              type="number"
              min={0}
              max={10}
              step={0.5}
              value={box.bleed}
              onChange={(e) => updateBox(box.id, { bleed: Number(e.target.value) || 0 })}
            />
          </div>
        </div>

        <div className="card">
          <h4 style={{ marginTop: 0 }}>厚度补偿模型</h4>
          <ul style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 2, paddingLeft: 18, margin: 0 }}>
            <li>平面网络定义在纸板内表面(z=0)</li>
            <li>板件向纸外挤出厚度 t,绕内表面压痕轴旋转</li>
            <li>相邻墙角部以 t 宽让位缺口防实体干涉</li>
            <li>包面结构(盖前墙)铰接边按运动链精确偏移</li>
            <li>校验命令 <code className="mono">npm run validate</code>(81 项)</li>
          </ul>
        </div>

        <div className="card">
          <h4 style={{ marginTop: 0 }}>数据管理</h4>
          <p style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.8 }}>
            盒型结构自动保存在浏览器 localStorage;印刷贴图过大时自动降级为仅存结构。
          </p>
          <button className="btn danger" onClick={clearStorage}>清空全部本地数据</button>
          <div className="sep" />
          <h4>关于</h4>
          <p style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.7 }}>
            彩盒折叠预览工作室 · React 18 + TypeScript + three.js<br />
            面向包装打样前的盒型沟通,数值结果不替代正式打样测试。
          </p>
        </div>
      </div>
    </div>
  )
}
