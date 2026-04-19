// vitest 单元测试:HexGrid 的纯函数
// 锁住 axialToWorld / getNeighbors / generateHexGrid / coordKey 的行为

import { describe, it, expect } from 'vitest'
import {
  axialToWorld,
  getNeighbors,
  coordKey,
  generateHexGrid,
  WORLD_SIZES,
  HEX_RADIUS,
} from '../src/world/HexGrid'

describe('axialToWorld', () => {
  it('原点 (0,0) → 世界 (0,0)', () => {
    const { x, z } = axialToWorld({ q: 0, r: 0 })
    expect(x).toBeCloseTo(0)
    expect(z).toBeCloseTo(0)
  })

  it('(1,0) → 沿 x 轴正方向 sqrt(3)*HEX_RADIUS', () => {
    const { x, z } = axialToWorld({ q: 1, r: 0 })
    expect(x).toBeCloseTo(HEX_RADIUS * Math.sqrt(3))
    expect(z).toBeCloseTo(0)
  })

  it('(0,1) → 沿 z 轴正方向 1.5*HEX_RADIUS', () => {
    const { x, z } = axialToWorld({ q: 0, r: 1 })
    expect(x).toBeCloseTo(HEX_RADIUS * Math.sqrt(3) / 2)
    expect(z).toBeCloseTo(HEX_RADIUS * 1.5)
  })

  it('反向坐标对称', () => {
    const a = axialToWorld({ q: 2, r: -1 })
    const b = axialToWorld({ q: -2, r: 1 })
    expect(a.x).toBeCloseTo(-b.x)
    expect(a.z).toBeCloseTo(-b.z)
  })
})

describe('getNeighbors', () => {
  it('返回 6 个邻居', () => {
    const neighbors = getNeighbors({ q: 0, r: 0 })
    expect(neighbors).toHaveLength(6)
  })

  it('原点的邻居坐标固定', () => {
    const neighbors = getNeighbors({ q: 0, r: 0 })
    const keys = neighbors.map(coordKey).sort()
    expect(keys).toEqual([
      '-1,0',
      '-1,1',
      '0,-1',
      '0,1',
      '1,-1',
      '1,0',
    ])
  })

  it('每个邻居的反向也是邻居(对称性)', () => {
    const center = { q: 3, r: -2 }
    const neighbors = getNeighbors(center)
    for (const n of neighbors) {
      const reverse = getNeighbors(n).map(coordKey)
      expect(reverse).toContain(coordKey(center))
    }
  })
})

describe('coordKey', () => {
  it('生成可逆的 key', () => {
    expect(coordKey({ q: 1, r: 2 })).toBe('1,2')
    expect(coordKey({ q: -3, r: 0 })).toBe('-3,0')
  })

  it('不同坐标 → 不同 key', () => {
    expect(coordKey({ q: 1, r: 2 })).not.toBe(coordKey({ q: 2, r: 1 }))
  })
})

describe('generateHexGrid', () => {
  it('1 环 = 7 个地块', () => {
    expect(generateHexGrid(1)).toHaveLength(7)
  })

  it('2 环 = 19 个地块', () => {
    expect(generateHexGrid(2)).toHaveLength(19)
  })

  it('3 环 = 37 个地块', () => {
    expect(generateHexGrid(3)).toHaveLength(37)
  })

  it('5 环 = 91 个地块', () => {
    expect(generateHexGrid(5)).toHaveLength(91)
  })

  it('包含原点', () => {
    const tiles = generateHexGrid(2)
    expect(tiles).toContainEqual({ q: 0, r: 0 })
  })

  it('坐标无重复', () => {
    const tiles = generateHexGrid(3)
    const keys = tiles.map(coordKey)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('所有坐标符合 |q|≤rings && |r|≤rings && |q+r|≤rings', () => {
    const rings = 4
    const tiles = generateHexGrid(rings)
    for (const t of tiles) {
      expect(Math.abs(t.q)).toBeLessThanOrEqual(rings)
      expect(Math.abs(t.r)).toBeLessThanOrEqual(rings)
      expect(Math.abs(t.q + t.r)).toBeLessThanOrEqual(rings)
    }
  })
})

describe('WORLD_SIZES', () => {
  it('5 个 size 的 tiles 数与 generateHexGrid 一致', () => {
    for (const [, def] of Object.entries(WORLD_SIZES)) {
      expect(generateHexGrid(def.rings)).toHaveLength(def.tiles)
    }
  })
})
