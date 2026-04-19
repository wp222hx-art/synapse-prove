// 翻转粒子爆发 — 中心闪光球 + 8 个辐射粒子,800ms 寿命
// 由父组件根据 tile.flipped 状态条件渲染(unmount 即结束)

import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

const PARTICLE_COUNT = 8
const DURATION = 0.8
const FLASH_DURATION = 0.3

interface SpawnBurstProps {
  color: string
}

export function SpawnBurst({ color }: SpawnBurstProps) {
  const startRef = useRef<number>(performance.now())
  const flashRef = useRef<THREE.Mesh>(null)
  const particleRefs = useRef<(THREE.Mesh | null)[]>([])

  // 固定的辐射角度(均匀分布)
  const angles = useRef(
    Array.from({ length: PARTICLE_COUNT }, (_, i) => (i / PARTICLE_COUNT) * Math.PI * 2)
  )

  useFrame(() => {
    const elapsed = (performance.now() - startRef.current) / 1000
    const t = Math.min(1, elapsed / DURATION)

    // 中心闪光球:扩张并淡出
    if (flashRef.current) {
      const flashT = Math.min(1, elapsed / FLASH_DURATION)
      const scale = 0.2 + flashT * 1.6
      const opacity = Math.max(0, 1 - flashT)
      flashRef.current.scale.setScalar(scale)
      const mat = flashRef.current.material as THREE.MeshBasicMaterial
      mat.opacity = opacity
    }

    // 粒子辐射:水平扩散 + 上抛 + 重力
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const m = particleRefs.current[i]
      if (!m) continue
      const angle = angles.current[i]
      const dist = elapsed * 1.6
      m.position.x = Math.cos(angle) * dist
      m.position.z = Math.sin(angle) * dist
      m.position.y = elapsed * 1.8 - elapsed * elapsed * 4
      const scale = Math.max(0, 0.13 * (1 - t))
      m.scale.setScalar(scale)
      const mat = m.material as THREE.MeshBasicMaterial
      mat.opacity = Math.max(0, 1 - t)
    }
  })

  return (
    <group>
      {/* 中心闪光球 */}
      <mesh ref={flashRef}>
        <sphereGeometry args={[1, 12, 12]} />
        <meshBasicMaterial color="#FFFFFF" transparent opacity={1} />
      </mesh>

      {/* 8 个辐射立方体粒子 */}
      {Array.from({ length: PARTICLE_COUNT }, (_, i) => (
        <mesh
          key={i}
          ref={(el) => { particleRefs.current[i] = el }}
        >
          <boxGeometry args={[1, 1, 1]} />
          <meshBasicMaterial color={color} transparent opacity={1} />
        </mesh>
      ))}
    </group>
  )
}
