// Zustand store:世界状态 + 翻转规则
// 渲染无关 — render-r3f 只是订阅者

import { create } from 'zustand'
import type { BiomeId } from './Biome'
import { randomBiome } from './Biome'
import type { AxialCoord, WorldSize } from './HexGrid'
import { generateHexGrid, getNeighbors, coordKey, WORLD_SIZES } from './HexGrid'
import { loadState, saveState } from '../storage'

export type Season = 'spring' | 'summer' | 'autumn' | 'winter'
const SEASON_ORDER: Season[] = ['spring', 'summer', 'autumn', 'winter']

export interface TileState {
  q: number
  r: number
  flipped: boolean
  biome: BiomeId | null  // 翻转前为 null
}

interface WorldState {
  size: WorldSize
  tiles: Map<string, TileState>
  exploredCount: number
  totalCount: number
  lastFlipped: AxialCoord | null
  timeOfDay: 'day' | 'night'
  worldStartedAt: number | null
  season: Season
  // Actions
  newWorld: (size: WorldSize) => void
  flipTile: (coord: AxialCoord) => void
  isFlippable: (coord: AxialCoord) => boolean
  toggleTimeOfDay: () => void
  cycleSeason: () => void
}

function initTiles(rings: number): Map<string, TileState> {
  const tiles = new Map<string, TileState>()
  const coords = generateHexGrid(rings)
  for (const c of coords) {
    tiles.set(coordKey(c), { q: c.q, r: c.r, flipped: false, biome: null })
  }
  return tiles
}

// 启动时同步从 localStorage 加载存档(无 hydration 闪烁)
const saved = loadState()
const initSize: WorldSize = saved?.size ?? 'S'
const initialTiles = saved
  ? new Map<string, TileState>(saved.tiles as Array<[string, TileState]>)
  : initTiles(WORLD_SIZES[initSize].rings)

export const useWorldStore = create<WorldState>((set, get) => ({
  size: initSize,
  tiles: initialTiles,
  exploredCount: saved?.exploredCount ?? 0,
  totalCount: saved?.totalCount ?? WORLD_SIZES[initSize].tiles,
  lastFlipped: null,
  timeOfDay: saved?.timeOfDay ?? 'night',
  worldStartedAt: saved?.worldStartedAt ?? Date.now(),
  season: 'summer',

  toggleTimeOfDay: () => set(state => ({ timeOfDay: state.timeOfDay === 'day' ? 'night' : 'day' })),

  cycleSeason: () => set(state => {
    const idx = SEASON_ORDER.indexOf(state.season)
    return { season: SEASON_ORDER[(idx + 1) % SEASON_ORDER.length] }
  }),

  newWorld: (size: WorldSize) => {
    const rings = WORLD_SIZES[size].rings
    set({
      size,
      tiles: initTiles(rings),
      exploredCount: 0,
      totalCount: WORLD_SIZES[size].tiles,
      lastFlipped: null,
      worldStartedAt: Date.now(),
    })
  },

  flipTile: (coord: AxialCoord) => {
    const state = get()
    if (!state.isFlippable(coord)) return
    const key = coordKey(coord)
    const tile = state.tiles.get(key)
    if (!tile || tile.flipped) return

    const newTiles = new Map(state.tiles)
    newTiles.set(key, { ...tile, flipped: true, biome: randomBiome() })
    set({
      tiles: newTiles,
      exploredCount: state.exploredCount + 1,
      lastFlipped: coord,
    })
  },

  isFlippable: (coord: AxialCoord) => {
    const state = get()
    const key = coordKey(coord)
    const tile = state.tiles.get(key)
    if (!tile || tile.flipped) return false
    // 第一个翻转的:任意地块均可
    if (state.exploredCount === 0) return true
    // 之后:只能翻已翻地块的相邻格
    for (const n of getNeighbors(coord)) {
      if (state.tiles.get(coordKey(n))?.flipped) return true
    }
    return false
  },
}))

// 自动持久化(300ms throttle,避免过于频繁写 localStorage)
let saveTimer: ReturnType<typeof setTimeout> | null = null
useWorldStore.subscribe((state) => {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    saveState({
      size: state.size,
      tiles: Array.from(state.tiles.entries()),
      exploredCount: state.exploredCount,
      totalCount: state.totalCount,
      timeOfDay: state.timeOfDay,
      worldStartedAt: state.worldStartedAt ?? Date.now(),
      savedAt: Date.now(),
    })
  }, 300)
})
