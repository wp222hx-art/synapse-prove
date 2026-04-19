// 创世大爆炸动画 — 全屏 overlay
// 流程:黑屏星空 → 中心光点 → 爆炸白屏 → 双圈冲击波 → 收缩消失
// hydration skip:从 localStorage 加载的旧 worldStartedAt 不触发动画
//   — 用 timestamp delta 判断:>1500ms 算"旧的",不播

import { useEffect, useRef, useState } from 'react'
import { useWorldStore } from '../world/store'

const DURATION_MS = 2200
const FRESH_THRESHOLD_MS = 1500 // worldStartedAt 距现在 < 1.5s 才算"刚创世"

export function CreationOverlay() {
  const worldStartedAt = useWorldStore(s => s.worldStartedAt)
  const [active, setActive] = useState(false)
  const lastTriggeredRef = useRef<number | null>(null)

  useEffect(() => {
    if (worldStartedAt === null) return
    if (lastTriggeredRef.current === worldStartedAt) return // 已处理过(防 hot reload)

    const age = Date.now() - worldStartedAt
    if (age > FRESH_THRESHOLD_MS) {
      // 从存档恢复的旧时间戳,不触发动画
      lastTriggeredRef.current = worldStartedAt
      return
    }

    lastTriggeredRef.current = worldStartedAt
    setActive(true)
    const timer = setTimeout(() => setActive(false), DURATION_MS)
    return () => clearTimeout(timer)
  }, [worldStartedAt])

  if (!active) return null

  return (
    <div className="creation-overlay" key={worldStartedAt ?? 0}>
      <div className="creation-stars" />
      <div className="creation-spark" />
      <div className="creation-shockwave" />
      <div className="creation-shockwave creation-shockwave-2" />
    </div>
  )
}
