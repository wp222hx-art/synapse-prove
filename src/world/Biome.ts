// 渲染无关:9 种地貌定义 + GLB 路径映射
// 不能 import three / R3F — 保持纯 TS,便于将来切换渲染器

export type BiomeId =
  | 'desert'
  | 'glacier'
  | 'mountain'
  | 'plain'
  | 'grassland'
  | 'forest'
  | 'beach'
  | 'island'
  | 'ocean'

export interface BiomeDef {
  id: BiomeId
  label: string
  color: string         // 地面色
  height: number        // 六棱柱高度(可负,海洋下凹)
  modelUrl: string      // GLB 路径
  modelScale: number    // 物件 scale
  modelYOffset?: number // 物件 Y 偏移(默认 0;海洋船需要抬高漂浮)
  emoji: string
}

// 所有陆地地块统一基础高度 BASE_HEIGHT,作为物件生长的零点
// 海洋特殊:负高度,表现下凹水面
const BASE_HEIGHT = 0.15

export const BIOMES: Record<BiomeId, BiomeDef> = {
  desert:    { id: 'desert',    label: '沙漠', color: '#E8C872', height: BASE_HEIGHT, modelUrl: '/models/biomes/desert/cactus.glb',         modelScale: 0.40, emoji: '🟡' },
  glacier:   { id: 'glacier',   label: '冰川', color: '#A8D8F0', height: BASE_HEIGHT, modelUrl: '/models/biomes/glacier/winter_hut.glb',    modelScale: 1.00, emoji: '🔵' },
  mountain:  { id: 'mountain',  label: '山地', color: '#8A9B7A', height: BASE_HEIGHT, modelUrl: '/models/biomes/mountain/pine.glb',         modelScale: 0.32, emoji: '🟫' },
  plain:     { id: 'plain',     label: '平原', color: '#B8D080', height: BASE_HEIGHT, modelUrl: '/models/biomes/plain/windmill.glb',        modelScale: 0.70, emoji: '🟢' },
  grassland: { id: 'grassland', label: '草地', color: '#70C070', height: BASE_HEIGHT, modelUrl: '/models/biomes/grassland/oak_tree.glb',    modelScale: 0.30, emoji: '🌿' },
  forest:    { id: 'forest',    label: '森林', color: '#3B7A3B', height: BASE_HEIGHT, modelUrl: '/models/biomes/forest/mushroom.glb',       modelScale: 0.60, emoji: '🌲' },
  beach:     { id: 'beach',     label: '海滩', color: '#F0E0A0', height: BASE_HEIGHT, modelUrl: '/models/biomes/beach/coconut_palm.glb',    modelScale: 0.40, emoji: '🟨' },
  island:    { id: 'island',    label: '海岛', color: '#60D080', height: BASE_HEIGHT, modelUrl: '/models/biomes/island/lighthouse.glb',     modelScale: 0.15, emoji: '🟩' },
  ocean:     { id: 'ocean',     label: '大海', color: '#3888CC', height: -0.20,       modelUrl: '/models/biomes/ocean/sailboat.glb',        modelScale: 0.35, modelYOffset: 0.18, emoji: '🌊' },
}

// ─── 季节色彩偏移 ────────────────────────────
// 每个季节给地块一个 tint 颜色和混合权重。HexTile 用 BIOMES.color × seasonTint 得到最终色
// 春:粉白嫩绿 / 夏:深绿饱和 / 秋:橙黄红褐 / 冬:白蓝灰
import type { Season } from './store'

export interface SeasonTint {
  color: string  // 混色目标
  weight: number // 0~1,混合权重
  fogColor: string // 雾色覆盖(覆盖 timeOfDay 的 fog)
  fogWeight: number
}

export const SEASON_TINT: Record<Season, SeasonTint> = {
  spring: { color: '#FFE0EC', weight: 0.15, fogColor: '#D8E8FF', fogWeight: 0.10 },
  summer: { color: '#80FF80', weight: 0.00, fogColor: '#FFFFFF', fogWeight: 0.00 }, // 中性,不偏移
  autumn: { color: '#FF8C30', weight: 0.20, fogColor: '#FFC080', fogWeight: 0.15 },
  winter: { color: '#E8F4FF', weight: 0.35, fogColor: '#C8D8E8', fogWeight: 0.20 },
}

// 把 hex 颜色与 tint 混合,返回新 hex
export function mixColor(baseHex: string, tintHex: string, weight: number): string {
  if (weight <= 0) return baseHex
  const b = parseInt(baseHex.slice(1), 16)
  const t = parseInt(tintHex.slice(1), 16)
  const br = (b >> 16) & 0xff
  const bg = (b >> 8) & 0xff
  const bb = b & 0xff
  const tr = (t >> 16) & 0xff
  const tg = (t >> 8) & 0xff
  const tb = t & 0xff
  const r = Math.round(br * (1 - weight) + tr * weight)
  const g = Math.round(bg * (1 - weight) + tg * weight)
  const bl = Math.round(bb * (1 - weight) + tb * weight)
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${bl.toString(16).padStart(2, '0')}`
}

export const BIOME_IDS = Object.keys(BIOMES) as BiomeId[]

export function randomBiome(): BiomeId {
  return BIOME_IDS[Math.floor(Math.random() * BIOME_IDS.length)]
}
