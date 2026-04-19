// 居中文字提示 — 创世/完成时弹出,自动渐隐
// 通过 React key 强制每次 newWorld 重新 mount(重播动画)

import { useEffect, useState } from 'react'
import { useWorldStore } from '../world/store'

export function OverlayMessage() {
  const worldStartedAt = useWorldStore(s => s.worldStartedAt)
  const exploredCount = useWorldStore(s => s.exploredCount)
  const totalCount = useWorldStore(s => s.totalCount)

  const [showStart, setShowStart] = useState(false)
  const [showDone, setShowDone] = useState(false)
  const [startKey, setStartKey] = useState(0)
  const [doneKey, setDoneKey] = useState(0)

  // 创世触发
  useEffect(() => {
    if (worldStartedAt === null) return
    setShowStart(true)
    setStartKey(k => k + 1)
    const timer = setTimeout(() => setShowStart(false), 2800)
    return () => clearTimeout(timer)
  }, [worldStartedAt])

  // 探索完成触发
  const isComplete = exploredCount === totalCount && totalCount > 0
  useEffect(() => {
    if (!isComplete) {
      setShowDone(false)
      return
    }
    setShowDone(true)
    setDoneKey(k => k + 1)
    const timer = setTimeout(() => setShowDone(false), 3500)
    return () => clearTimeout(timer)
  }, [isComplete])

  return (
    <>
      {showStart && (
        <div key={`start-${startKey}`} className="overlay-message overlay-start">
          世界已创造,开始探索吧!
        </div>
      )}
      {showDone && (
        <div key={`done-${doneKey}`} className="overlay-message overlay-done">
          这个世界已被你探索完成,恭喜你!
        </div>
      )}
    </>
  )
}
