import { create } from 'zustand'
import type { BoxDef, BoxParams, BoxTemplateId, MaterialId, Vec2 } from '../types.ts'
import { createBox, DEFAULT_PARAMS, duplicateBox, regenerate } from '../lib/templates.ts'

export type PageId = 'library' | 'dieline' | 'print' | 'fold' | 'settings'

interface AppState {
  boxes: BoxDef[]
  currentId: string | null
  page: PageId
  /** 折叠预览时间轴 0..1 */
  foldProgress: number
  addBox: (template: BoxTemplateId, params?: BoxParams, material?: MaterialId) => string
  updateBox: (id: string, patch: Partial<BoxDef>) => void
  removeBox: (id: string) => void
  duplicate: (id: string) => void
  reshape: (id: string, params: BoxParams) => void
  setMaterial: (id: string, material: MaterialId) => void
  setPrint: (id: string, panelId: string, dataUrl: string | null) => void
  setBleed: (id: string, bleed: number) => void
  setFoil: (id: string, panelId: string, polys: Vec2[][]) => void
  select: (id: string | null) => void
  goto: (page: PageId) => void
  setFoldProgress: (p: number) => void
}

const STORAGE_KEY = 'carton-fold-studio-v1'

function load(): BoxDef[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return seed()
    const data = JSON.parse(raw) as BoxDef[]
    if (!Array.isArray(data) || data.length === 0) return seed()
    return data
  } catch {
    return seed()
  }
}

function seed(): BoxDef[] {
  return [
    createBox('airplane', DEFAULT_PARAMS.airplane, 'kraft'),
    createBox('telescope', DEFAULT_PARAMS.telescope, 'laminated'),
    createBox('tuckend', DEFAULT_PARAMS.tuckend, 'white-card'),
  ]
}

let saveTimer: ReturnType<typeof setTimeout> | undefined
function persist(boxes: BoxDef[]) {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(boxes))
    } catch (e) {
      // 印刷贴图过大时可能超配额,剔除贴图后重试
      const slim = boxes.map((b) => ({ ...b, prints: {} }))
      localStorage.setItem(STORAGE_KEY, JSON.stringify(slim))
      console.warn('存储配额不足,已仅保存结构', e)
    }
  }, 300)
}

export const useStore = create<AppState>((set, get) => {
  const initial = load()
  return {
    boxes: initial,
    currentId: initial[0]?.id ?? null,
    page: 'library',
    foldProgress: 1,

    addBox: (template, params, material) => {
      const box = createBox(template, params ?? DEFAULT_PARAMS[template], material)
      set((s) => {
        const boxes = [...s.boxes, box]
        persist(boxes)
        return { boxes, currentId: box.id }
      })
      return box.id
    },

    updateBox: (id, patch) =>
      set((s) => {
        const boxes = s.boxes.map((b) =>
          b.id === id ? { ...b, ...patch, updatedAt: Date.now() } : b,
        )
        persist(boxes)
        return { boxes }
      }),

    removeBox: (id) =>
      set((s) => {
        const boxes = s.boxes.filter((b) => b.id !== id)
        persist(boxes)
        return {
          boxes,
          currentId: s.currentId === id ? (boxes[0]?.id ?? null) : s.currentId,
        }
      }),

    duplicate: (id) =>
      set((s) => {
        const src = s.boxes.find((b) => b.id === id)
        if (!src) return s
        const copy = duplicateBox(src)
        const boxes = [...s.boxes, copy]
        persist(boxes)
        return { boxes, currentId: copy.id }
      }),

    reshape: (id, params) =>
      set((s) => {
        const boxes = s.boxes.map((b) => (b.id === id ? regenerate(b, params) : b))
        persist(boxes)
        return { boxes }
      }),

    setMaterial: (id, material) => get().updateBox(id, { material }),
    setPrint: (id, panelId, dataUrl) => {
      const box = get().boxes.find((b) => b.id === id)
      if (!box) return
      const prints = { ...box.prints }
      if (dataUrl === null) delete prints[panelId]
      else prints[panelId] = dataUrl
      get().updateBox(id, { prints })
    },
    setBleed: (id, bleed) => get().updateBox(id, { bleed }),
    setFoil: (id, panelId, polys) => {
      const box = get().boxes.find((b) => b.id === id)
      if (!box) return
      const foil = { ...box.foil }
      if (polys.length === 0) delete foil[panelId]
      else foil[panelId] = polys
      get().updateBox(id, { foil })
    },

    select: (currentId) => set({ currentId }),
    goto: (page) => set({ page }),
    setFoldProgress: (p) => set({ foldProgress: Math.min(1, Math.max(0, p)) }),
  }
})

export function useCurrentBox(): BoxDef | undefined {
  return useStore((s) => s.boxes.find((b) => b.id === s.currentId))
}
