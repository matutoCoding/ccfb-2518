import { useEffect, useRef } from 'react'
import type { BoxDef } from '../types.ts'
import { buildDieline } from '../lib/svg.ts'

/** 盒型卡片上的刀版缩略图(SVG 路径) */
export default function DielineThumb({ box, height = 140 }: { box: BoxDef; height?: number }) {
  const ref = useRef<SVGSVGElement>(null)

  useEffect(() => {
    const dl = buildDieline(box)
    const svg = ref.current
    if (!svg) return
    const { min, max } = dl.bounds
    const w = max.x - min.x || 1
    const h = max.y - min.y || 1
    svg.setAttribute('viewBox', `${min.x - 4} ${min.y - 4} ${w + 8} ${h + 8}`)
    const ns = 'http://www.w3.org/2000/svg'
    svg.innerHTML = ''
    for (const loop of dl.cuts) {
      const path = document.createElementNS(ns, 'path')
      path.setAttribute('d', loop.poly.map((p, i) => `${i ? 'L' : 'M'}${p.x} ${p.y}`).join(' ') + ' Z')
      path.setAttribute('fill', 'rgba(37,99,235,0.07)')
      path.setAttribute('stroke', '#e11d48')
      path.setAttribute('stroke-width', '0.9')
      svg.appendChild(path)
    }
    for (const c of dl.creases) {
      const line = document.createElementNS(ns, 'line')
      line.setAttribute('x1', String(c.a.x))
      line.setAttribute('y1', String(c.a.y))
      line.setAttribute('x2', String(c.b.x))
      line.setAttribute('y2', String(c.b.y))
      line.setAttribute('stroke', '#2563eb')
      line.setAttribute('stroke-width', '0.7')
      line.setAttribute('stroke-dasharray', '3 2')
      svg.appendChild(line)
    }
  }, [box])

  return <svg ref={ref} style={{ width: '90%', height }} preserveAspectRatio="xMidYMid meet" />
}
