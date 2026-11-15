import type { PanelDef, Vec2 } from '../types.ts'

/**
 * 印刷贴图工具:
 * - 贴图按面板局部坐标生成,出血区由源图边缘像素外扩(clamp),
 *   这是印刷标准的"出血不外拉内容、只延展边缘"做法
 * - 面板 UV 采用平面投影,折好后图案不随厚度拉伸
 */
export function makePanelTexture(
  panel: PanelDef,
  source: HTMLImageElement | HTMLCanvasElement,
  bleedMM: number,
  texMM: number,
  texRes = 512,
): HTMLCanvasElement {
  const xs = panel.poly.map((p) => p.x)
  const ys = panel.poly.map((p) => p.y)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  const wMM = maxX - minX
  const hMM = maxY - minY

  const canvas = document.createElement('canvas')
  canvas.width = texRes
  canvas.height = Math.max(64, Math.round(texRes * (hMM / Math.max(wMM, 1))))
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingEnabled = true

  // 面板安全区在贴图中的位置(出血外扩)
  const bleedPxX = (bleedMM / (wMM + 2 * bleedMM)) * canvas.width
  const bleedPxY = (bleedMM / (hMM + 2 * bleedMM)) * canvas.height
  const safeW = canvas.width - bleedPxX * 2
  const safeH = canvas.height - bleedPxY * 2

  // 1. 安全区绘制源图
  ctx.drawImage(source as CanvasImageSource, bleedPxX, bleedPxY, safeW, safeH)
  // 2. 四边出血:切边缘 1px 条带拉伸
  const edge = 2
  ctx.drawImage(canvas, bleedPxX, bleedPxY, safeW, edge, bleedPxX, 0, safeW, bleedPxY)
  ctx.drawImage(canvas, bleedPxX, canvas.height - edge, safeW, edge, bleedPxX, canvas.height - bleedPxY, safeW, bleedPxY)
  ctx.drawImage(canvas, bleedPxX, bleedPxY, edge, safeH, 0, bleedPxY, bleedPxX, safeH)
  ctx.drawImage(canvas, canvas.width - edge, bleedPxY, edge, safeH, canvas.width - bleedPxX, bleedPxY, bleedPxX, safeH)
  // 3. 四角
  ctx.drawImage(canvas, bleedPxX, bleedPxY, edge, edge, 0, 0, bleedPxX, bleedPxY)
  ctx.drawImage(canvas, canvas.width - bleedPxX, bleedPxY, edge, edge, canvas.width - bleedPxX, 0, bleedPxX, bleedPxY)
  ctx.drawImage(canvas, bleedPxX, canvas.height - bleedPxY, edge, edge, 0, canvas.height - bleedPxY, bleedPxX, bleedPxY)
  ctx.drawImage(canvas, canvas.width - bleedPxX, canvas.height - bleedPxY, edge, edge, canvas.width - bleedPxX, canvas.height - bleedPxY, bleedPxX, bleedPxY)

  void texMM
  return canvas
}

/** 生成一张示例印刷图(色块+文字),供无上传时演示按面分配 */
export function makeDemoArtwork(label: string, bg: string): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = 512
  c.height = 512
  const ctx = c.getContext('2d')!
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, 512, 512)
  ctx.strokeStyle = 'rgba(0,0,0,0.25)'
  ctx.lineWidth = 12
  ctx.strokeRect(24, 24, 464, 464)
  ctx.fillStyle = 'rgba(0,0,0,0.7)'
  ctx.font = 'bold 64px sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(label, 256, 256)
  return c
}

/** 加载 dataURL 为 Image */
export function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = dataUrl
  })
}

/** 烫金多边形在面板局部坐标内的归一化坐标(0..1,供 three Shape 使用) */
export function foilToPanelUV(panel: PanelDef, foil: Vec2[]): Vec2[] {
  const xs = panel.poly.map((p) => p.x)
  const ys = panel.poly.map((p) => p.y)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  return foil.map((p) => ({
    x: (p.x - minX) / (maxX - minX),
    y: (p.y - minY) / (maxY - minY),
  }))
}
