// 玩家状态本地持久化(localStorage,同步)
// 5MB 上限,我的 state 不超过 100KB,完全够用
// 选 localStorage 而非 IndexedDB:同步 API,初始化时无 hydration 闪烁

import type { TileState } from './world/store'
import type { WorldSize } from './world/HexGrid'

const STORAGE_KEY = 'synapse-state-v1'

export interface SavedState {
  size: WorldSize
  tiles: Array<[string, TileState]> // Map.entries() → array
  exploredCount: number
  totalCount: number
  worldStartedAt: number
  timeOfDay: 'day' | 'night'
  savedAt: number
}

export function loadState(): SavedState | null {
  try {
    if (typeof localStorage === 'undefined') return null
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as SavedState
    // 版本/格式 sanity check
    if (!parsed.size || !Array.isArray(parsed.tiles)) return null
    return parsed
  } catch (e) {
    console.warn('[storage] loadState failed', e)
    return null
  }
}

export function saveState(state: SavedState): void {
  try {
    if (typeof localStorage === 'undefined') return
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch (e) {
    console.warn('[storage] saveState failed', e)
  }
}

export function clearState(): void {
  try {
    if (typeof localStorage === 'undefined') return
    localStorage.removeItem(STORAGE_KEY)
  } catch (e) {
    console.warn('[storage] clearState failed', e)
  }
}
