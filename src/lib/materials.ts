import type { MaterialId, MaterialPreset } from '../types.ts'

export const MATERIALS: Record<MaterialId, MaterialPreset> = {
  'white-card': {
    id: 'white-card',
    name: '白卡纸',
    innerColor: 0xf2efe7,
    outerColor: 0xfbfaf6,
    roughness: 0.82,
    metalness: 0,
  },
  kraft: {
    id: 'kraft',
    name: '牛皮纸',
    innerColor: 0xc9a878,
    outerColor: 0xb98d56,
    roughness: 0.9,
    metalness: 0,
  },
  laminated: {
    id: 'laminated',
    name: '覆膜纸',
    innerColor: 0xf2efe7,
    outerColor: 0xffffff,
    roughness: 0.28,
    metalness: 0,
    clearcoat: 0.9,
  },
  corrugated: {
    id: 'corrugated',
    name: '瓦楞纸板',
    innerColor: 0xd8c9a8,
    outerColor: 0xcbb88f,
    roughness: 0.88,
    metalness: 0,
  },
}

export const MATERIAL_LIST: MaterialPreset[] = Object.values(MATERIALS)

/** 烫金材质(独立区域) */
export const FOIL_MATERIAL = {
  color: 0xd4af37,
  metalness: 1,
  roughness: 0.24,
}
