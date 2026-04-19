// 渲染无关:六边形数学 + 网格生成 + 邻居规则
// axial coordinates: q (列) + r (行),s = -q-r 自动约束

export interface AxialCoord {
  q: number
  r: number
}

export const HEX_RADIUS = 1.0

// axial → world (Y-up,平面在 XZ)
export function axialToWorld(coord: AxialCoord): { x: number; z: number } {
  const x = HEX_RADIUS * (Math.sqrt(3) * coord.q + (Math.sqrt(3) / 2) * coord.r)
  const z = HEX_RADIUS * (3 / 2) * coord.r
  return { x, z }
}

const DIRECTIONS: AxialCoord[] = [
  { q: 1,  r: 0 },
  { q: -1, r: 0 },
  { q: 0,  r: 1 },
  { q: 0,  r: -1 },
  { q: 1,  r: -1 },
  { q: -1, r: 1 },
]

export function getNeighbors(coord: AxialCoord): AxialCoord[] {
  return DIRECTIONS.map(d => ({ q: coord.q + d.q, r: coord.r + d.r }))
}

export function coordKey(coord: AxialCoord): string {
  return `${coord.q},${coord.r}`
}

// 生成 N 环六边形网格(包含中心)
// 1 环 = 7, 2 环 = 19, 3 环 = 37, 4 环 = 61, 5 环 = 91
export function generateHexGrid(rings: number): AxialCoord[] {
  const coords: AxialCoord[] = []
  for (let q = -rings; q <= rings; q++) {
    const rMin = Math.max(-rings, -q - rings)
    const rMax = Math.min(rings, -q + rings)
    for (let r = rMin; r <= rMax; r++) {
      coords.push({ q, r })
    }
  }
  return coords
}

export type WorldSize = 'XS' | 'S' | 'M' | 'L' | 'XL'

export const WORLD_SIZES: Record<WorldSize, { rings: number; tiles: number; label: string }> = {
  XS: { rings: 1, tiles: 7,  label: '极小' },
  S:  { rings: 2, tiles: 19, label: '小'   },
  M:  { rings: 3, tiles: 37, label: '中'   },
  L:  { rings: 4, tiles: 61, label: '大'   },
  XL: { rings: 5, tiles: 91, label: '超大' },
}
