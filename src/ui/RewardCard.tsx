// 探索完成奖励卡 — 5 等级稀有度,旋转弹出,闪光,音效
// 稀有度公式 = biome 多样性(全 9 种 → 大概率传说) + 1% 神话保底

import { useEffect, useState } from 'react'
import { useWorldStore } from '../world/store'
import { BIOMES, type BiomeId } from '../world/Biome'
import type { TileState } from '../world/store'
import { playRewardSound } from '../sfx'

type Rarity = 'common' | 'rare' | 'epic' | 'legendary' | 'mythic'

const RARITY_LABEL: Record<Rarity, string> = {
  common:    '普通',
  rare:      '稀有',
  epic:      '史诗',
  legendary: '传说',
  mythic:    '神话',
}

const RARITY_COLOR: Record<Rarity, string> = {
  common:    '#9CA3AF',
  rare:      '#3B82F6',
  epic:      '#A855F7',
  legendary: '#FBBF24',
  mythic:    '#FF3060',
}

interface Reward {
  rarity: Rarity
  fragmentName: string
}

function generateReward(tiles: Map<string, TileState>): Reward {
  // 统计 biome 出现次数 + 多样性
  const biomeCounts = new Map<BiomeId, number>()
  for (const tile of tiles.values()) {
    if (tile.biome) {
      biomeCounts.set(tile.biome, (biomeCounts.get(tile.biome) ?? 0) + 1)
    }
  }
  const uniqueBiomes = biomeCounts.size

  // 稀有度公式:1% 神话保底,其余按 biome 多样性
  let rarity: Rarity
  const roll = Math.random()
  if (roll < 0.01) {
    rarity = 'mythic'
  } else if (uniqueBiomes >= 9) {
    rarity = roll < 0.55 ? 'legendary' : 'epic'
  } else if (uniqueBiomes >= 8) {
    rarity = roll < 0.45 ? 'epic' : 'rare'
  } else if (uniqueBiomes >= 6) {
    rarity = roll < 0.55 ? 'rare' : 'common'
  } else {
    rarity = roll < 0.2 ? 'rare' : 'common'
  }

  // 卡片名:占比最高的 biome
  let dominant: BiomeId = 'desert'
  let maxCount = 0
  for (const [b, c] of biomeCounts.entries()) {
    if (c > maxCount) {
      maxCount = c
      dominant = b
    }
  }
  return { rarity, fragmentName: `${BIOMES[dominant].label}之碎片` }
}

export function RewardCard() {
  const exploredCount = useWorldStore(s => s.exploredCount)
  const totalCount = useWorldStore(s => s.totalCount)
  const tiles = useWorldStore(s => s.tiles)
  const worldStartedAt = useWorldStore(s => s.worldStartedAt)

  const [reward, setReward] = useState<Reward | null>(null)
  const [visible, setVisible] = useState(false)

  const isComplete = exploredCount === totalCount && totalCount > 0

  useEffect(() => {
    if (!isComplete) {
      setReward(null)
      setVisible(false)
      return
    }
    // 延迟 1.6s 让"完成"提示先展示
    const timer = setTimeout(() => {
      const r = generateReward(tiles)
      setReward(r)
      setVisible(true)
      playRewardSound(r.rarity)
    }, 1600)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isComplete, worldStartedAt])

  if (!visible || !reward) return null

  const color = RARITY_COLOR[reward.rarity]
  const isMythic = reward.rarity === 'mythic'

  return (
    <div className="reward-overlay" onClick={() => setVisible(false)}>
      <div
        className={`reward-card${isMythic ? ' reward-mythic' : ''}`}
        style={!isMythic ? {
          borderColor: color,
          boxShadow: `0 0 60px ${color}, inset 0 0 30px ${color}33`,
        } : undefined}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="reward-rarity" style={{ color }}>
          ✦ {RARITY_LABEL[reward.rarity]} ✦
        </div>
        <div className="reward-icon" style={{ color, filter: `drop-shadow(0 0 25px ${color})` }}>
          💎
        </div>
        <div className="reward-name">{reward.fragmentName}</div>
        <div className="reward-flavor">「世界的一角已被你点亮」</div>
        <div className="reward-subtitle">点击空白处关闭</div>
      </div>
    </div>
  )
}
