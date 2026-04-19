// 主组件:R3F Canvas + DOM HUD 两层
// HUD 通过 pointer-events 控制交互穿透

import { useEffect } from 'react'
import { WorldScene } from '../render-r3f/WorldScene'
import { useWorldStore } from '../world/store'
import { WORLD_SIZES, type WorldSize } from '../world/HexGrid'
import { BIOMES, type BiomeId } from '../world/Biome'
import { CreationOverlay } from './CreationOverlay'
import { LoadingScreen } from './LoadingScreen'
import { OverlayMessage } from './OverlayMessage'
import { RewardCard } from './RewardCard'
import { unlockAudio } from '../sfx'

const SIZE_ORDER: WorldSize[] = ['XS', 'S', 'M', 'L', 'XL']

const SEASON_LABEL = {
  spring: { emoji: '🌸', text: '春' },
  summer: { emoji: '☀️', text: '夏' },
  autumn: { emoji: '🍂', text: '秋' },
  winter: { emoji: '❄️', text: '冬' },
} as const

export function App() {
  const exploredCount = useWorldStore(s => s.exploredCount)
  const totalCount = useWorldStore(s => s.totalCount)
  const size = useWorldStore(s => s.size)
  const newWorld = useWorldStore(s => s.newWorld)
  const tiles = useWorldStore(s => s.tiles)
  const lastFlipped = useWorldStore(s => s.lastFlipped)
  const timeOfDay = useWorldStore(s => s.timeOfDay)
  const toggleTimeOfDay = useWorldStore(s => s.toggleTimeOfDay)
  const season = useWorldStore(s => s.season)
  const cycleSeason = useWorldStore(s => s.cycleSeason)

  // 移动端 audio 解锁:监听首次 pointerdown / touchstart,
  // 在用户手势同步上下文里 resume AudioContext,iOS Safari 之后才允许播放
  useEffect(() => {
    const unlock = () => {
      unlockAudio()
      window.removeEventListener('pointerdown', unlock)
      window.removeEventListener('touchstart', unlock)
    }
    window.addEventListener('pointerdown', unlock, { once: true })
    window.addEventListener('touchstart', unlock, { once: true })
    return () => {
      window.removeEventListener('pointerdown', unlock)
      window.removeEventListener('touchstart', unlock)
    }
  }, [])

  // 统计各 biome 数量
  const biomeStats = new Map<BiomeId, number>()
  for (const tile of tiles.values()) {
    if (tile.flipped && tile.biome) {
      biomeStats.set(tile.biome, (biomeStats.get(tile.biome) ?? 0) + 1)
    }
  }

  const lastTile = lastFlipped
    ? tiles.get(`${lastFlipped.q},${lastFlipped.r}`)
    : null
  const lastBiome = lastTile?.biome ? BIOMES[lastTile.biome] : null

  return (
    <div className="app">
      <div className="canvas-wrap">
        <WorldScene />
      </div>

      <div className="hud-top">
        <div className="title">SYNAPSE 世界生成器</div>
        <div className="size-picker">
          {SIZE_ORDER.map(s => (
            <button
              key={s}
              className={size === s ? 'active' : ''}
              onClick={() => newWorld(s)}
            >
              {s}<span className="count">{WORLD_SIZES[s].tiles}</span>
            </button>
          ))}
        </div>
        <button className="season-toggle" onClick={cycleSeason} title={`季节:${SEASON_LABEL[season].text}`}>
          <span className="btn-emoji">{SEASON_LABEL[season].emoji}</span>
          <span className="btn-label">{SEASON_LABEL[season].text}</span>
        </button>
        <button className="time-toggle" onClick={toggleTimeOfDay} title={timeOfDay === 'night' ? '切换到白天' : '切换到黑夜'}>
          <span className="btn-emoji">{timeOfDay === 'night' ? '☀️' : '🌙'}</span>
          <span className="btn-label">{timeOfDay === 'night' ? '白天' : '黑夜'}</span>
        </button>
        <button className="reset" onClick={() => newWorld(size)} title="重新生成世界">
          <span className="btn-emoji">🔄</span>
          <span className="btn-label">重新生成</span>
        </button>
      </div>

      <div className="hud-bottom">
        <div className="progress">
          已探索 <strong>{exploredCount}</strong> / {totalCount}
          <div className="bar">
            <div
              className="bar-fill"
              style={{ width: `${(exploredCount / totalCount) * 100}%` }}
            />
          </div>
        </div>
        {biomeStats.size > 0 && (
          <div className="biome-stats">
            {Array.from(biomeStats.entries()).map(([id, count]) => (
              <span key={id} className="biome-tag">
                {BIOMES[id].emoji} {BIOMES[id].label} × {count}
              </span>
            ))}
          </div>
        )}
        {lastBiome && (
          <div className="last-tile">
            最近翻转:<strong>{lastBiome.emoji} {lastBiome.label}</strong>
            <span className="coord">({lastFlipped!.q}, {lastFlipped!.r})</span>
          </div>
        )}
      </div>

      <div className="hint">拖拽旋转 · 滚轮缩放 · 点击地块翻转</div>

      <LoadingScreen />
      <CreationOverlay />
      <OverlayMessage />
      <RewardCard />
    </div>
  )
}
