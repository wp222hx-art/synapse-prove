// 首屏加载状态 — drei 的 useProgress 跟踪 R3F 资源加载进度
// 全部加载完成后自动隐藏

import { useProgress } from '@react-three/drei'

export function LoadingScreen() {
  const { active, progress, item } = useProgress()
  if (!active && progress >= 100) return null

  return (
    <div className="loading-screen">
      <div className="loading-stars" />
      <div className="loading-spark" />
      <div className="loading-text">SYNAPSE</div>
      <div className="loading-progress">
        <div className="loading-bar">
          <div className="loading-bar-fill" style={{ width: `${progress}%` }} />
        </div>
        <div className="loading-percent">{Math.round(progress)}%</div>
      </div>
      <div className="loading-subtext">
        {item ? `加载 ${item.split('/').pop()}` : '创世中…'}
      </div>
    </div>
  )
}
