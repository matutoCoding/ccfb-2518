import { useStore, type PageId } from './store/useStore.ts'
import LibraryPage from './pages/LibraryPage.tsx'
import DielinePage from './pages/DielinePage.tsx'
import PrintPage from './pages/PrintPage.tsx'
import FoldPage from './pages/FoldPage.tsx'
import SettingsPage from './pages/SettingsPage.tsx'
import { templateName } from './lib/templates.ts'

const NAV: { id: PageId; icon: string; label: string }[] = [
  { id: 'library', icon: '▦', label: '盒型库' },
  { id: 'dieline', icon: '✂', label: '刀版编辑' },
  { id: 'print', icon: '🎨', label: '印刷面' },
  { id: 'fold', icon: '📦', label: '折叠预览' },
  { id: 'settings', icon: '⚙', label: '设置' },
]

export default function App() {
  const page = useStore((s) => s.page)
  const goto = useStore((s) => s.goto)
  const boxes = useStore((s) => s.boxes)
  const currentId = useStore((s) => s.currentId)
  const select = useStore((s) => s.select)
  const current = boxes.find((b) => b.id === currentId)

  return (
    <div className="app">
      <header className="topbar">
        <span className="logo">彩盒折叠预览工作室</span>
        <span className="sub">参数化刀版 · 厚度补偿折叠 · 严丝合缝</span>
        <span className="spacer" />
        {current && (
          <select value={current.id} onChange={(e) => select(e.target.value)}>
            {boxes.map((b) => (
              <option key={b.id} value={b.id}>
                {templateName(b.templateId)} · {b.name}
              </option>
            ))}
          </select>
        )}
      </header>

      <nav className="sidebar">
        {NAV.map((n) => (
          <button
            key={n.id}
            className={`nav-item ${page === n.id ? 'active' : ''}`}
            onClick={() => goto(n.id)}
          >
            <span className="icon">{n.icon}</span>
            {n.label}
          </button>
        ))}
        <div className="hint">
          尺寸单位 mm,纸厚在内表面网络中自动补偿。
          几何校验:npm run validate
        </div>
      </nav>

      <main className="main">
        {page === 'library' && <LibraryPage />}
        {page === 'dieline' && <DielinePage />}
        {page === 'print' && <PrintPage />}
        {page === 'fold' && <FoldPage />}
        {page === 'settings' && <SettingsPage />}
      </main>
    </div>
  )
}
