// 云朵系统 — 高空生成,飘动,castShadow 投阴影到地面
// 每朵云大小/形状/sphere 数量都随机化,出边缘自动从对侧重生

import { useEffect, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useWorldStore } from '../world/store'

const CLOUD_COUNT = 7
const CLOUDS_DELAY_MS = 2400 // 等创世大爆炸 2.2s 结束 + 0.2s 缓冲
const CLOUD_HEIGHT_MIN = 5
const CLOUD_HEIGHT_MAX = 8
const WORLD_RADIUS = 12
const RESPAWN_RADIUS = WORLD_RADIUS + 4

interface CloudPuff {
  x: number
  y: number
  z: number
  r: number
}

interface CloudData {
  px: number
  py: number
  pz: number
  vx: number
  vz: number
  rot: number
  scale: number     // 整体大小 0.6-1.4
  flatten: number   // 垂直压扁 0.45-0.65
  puffs: CloudPuff[] // 每朵云的 sphere 簇
}

function spawnCloud(insideStart: boolean): CloudData {
  const angle = Math.random() * Math.PI * 2
  const dist = insideStart
    ? Math.random() * WORLD_RADIUS
    : RESPAWN_RADIUS
  const px = Math.cos(angle) * dist
  const pz = Math.sin(angle) * dist
  const py = CLOUD_HEIGHT_MIN + Math.random() * (CLOUD_HEIGHT_MAX - CLOUD_HEIGHT_MIN)
  // 飘往随机方向(略偏向世界中心)
  const vAngle = angle + Math.PI + (Math.random() - 0.5) * Math.PI
  const speed = 0.35 + Math.random() * 0.55

  // 随机化大小和形状
  const scale = 0.6 + Math.random() * 0.8
  const flatten = 0.45 + Math.random() * 0.2
  const puffCount = 3 + Math.floor(Math.random() * 4) // 3-6 个 sphere
  const puffs: CloudPuff[] = Array.from({ length: puffCount }, () => ({
    x: (Math.random() - 0.5) * 2.0,
    y: (Math.random() - 0.5) * 0.5,
    z: (Math.random() - 0.5) * 1.6,
    r: 0.5 + Math.random() * 0.6,
  }))

  return {
    px, py, pz,
    vx: Math.cos(vAngle) * speed,
    vz: Math.sin(vAngle) * speed,
    rot: Math.random() * Math.PI * 2,
    scale, flatten, puffs,
  }
}

// 外层 wrapper:监听 worldStartedAt,延迟挂载 CloudsInner
// 每次创世(worldStartedAt 变化)都通过 key 强制 remount,让云重新随机位置
export function Clouds() {
  const worldStartedAt = useWorldStore(s => s.worldStartedAt)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    setVisible(false)
    if (worldStartedAt === null) return
    const timer = setTimeout(() => setVisible(true), CLOUDS_DELAY_MS)
    return () => clearTimeout(timer)
  }, [worldStartedAt])

  if (!visible) return null
  return <CloudsInner key={worldStartedAt ?? 0} />
}

// 内层:云的实际渲染 + 推进逻辑
function CloudsInner() {
  const cloudsRef = useRef<CloudData[] | null>(null)
  if (cloudsRef.current === null) {
    cloudsRef.current = Array.from({ length: CLOUD_COUNT }, () => spawnCloud(true))
  }

  const groupRefs = useRef<(THREE.Group | null)[]>([])

  useFrame((_, delta) => {
    if (!cloudsRef.current) return
    for (let i = 0; i < cloudsRef.current.length; i++) {
      const c = cloudsRef.current[i]
      c.px += c.vx * delta
      c.pz += c.vz * delta

      const distFromCenter = Math.sqrt(c.px * c.px + c.pz * c.pz)
      if (distFromCenter > RESPAWN_RADIUS) {
        cloudsRef.current[i] = spawnCloud(false)
      }

      const g = groupRefs.current[i]
      if (g) {
        g.position.set(c.px, c.py, c.pz)
      }
    }
  })

  return (
    <>
      {cloudsRef.current.map((c, i) => (
        <group
          key={i}
          ref={el => { groupRefs.current[i] = el }}
          position={[c.px, c.py, c.pz]}
          rotation={[0, c.rot, 0]}
          scale={[c.scale, c.scale * c.flatten, c.scale]}
        >
          {c.puffs.map((p, j) => (
            <mesh key={j} castShadow position={[p.x, p.y, p.z]}>
              <sphereGeometry args={[p.r, 8, 6]} />
              <meshLambertMaterial color="#FFFFFF" />
            </mesh>
          ))}
        </group>
      ))}
    </>
  )
}
