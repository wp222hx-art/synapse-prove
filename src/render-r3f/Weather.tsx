// 季节性天气粒子 — spring 花瓣 / autumn 落叶 / winter 雪
// summer 不渲染
// 粒子从世界上方 y=10 落下,出 KILL_HEIGHT 即 respawn

import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useWorldStore, type Season } from '../world/store'

const PARTICLE_COUNT = 90
const SPAWN_HEIGHT = 12
const KILL_HEIGHT = -1
const SPAWN_RADIUS = 14

interface Particle {
  x: number; y: number; z: number
  vx: number; vy: number; vz: number
  rot: number
  rotSpeed: number
  scale: number
}

function spawnParticle(initialAtTop = false): Particle {
  return {
    x: (Math.random() - 0.5) * SPAWN_RADIUS * 2,
    y: initialAtTop
      ? SPAWN_HEIGHT + Math.random() * 4
      : -1 + Math.random() * (SPAWN_HEIGHT + 1), // 初始时随机分布全空
    z: (Math.random() - 0.5) * SPAWN_RADIUS * 2,
    vx: (Math.random() - 0.5) * 0.6,
    vy: -0.5 - Math.random() * 0.5,
    vz: (Math.random() - 0.5) * 0.5,
    rot: Math.random() * Math.PI * 2,
    rotSpeed: (Math.random() - 0.5) * 2.0,
    scale: 0.7 + Math.random() * 0.6,
  }
}

// 外层 wrapper:监听 season,summer 不渲染
export function Weather() {
  const season = useWorldStore(s => s.season)
  if (season === 'summer') return null
  return <WeatherInner season={season} key={season} />
}

interface WeatherInnerProps {
  season: Exclude<Season, 'summer'>
}

const SEASON_CONFIG: Record<Exclude<Season, 'summer'>, {
  color: string
  size: number
  shape: 'plane' | 'sphere'
}> = {
  spring: { color: '#FFC8E8', size: 0.08, shape: 'plane' },
  autumn: { color: '#E08040', size: 0.10, shape: 'plane' },
  winter: { color: '#FFFFFF', size: 0.05, shape: 'sphere' },
}

function WeatherInner({ season }: WeatherInnerProps) {
  const config = SEASON_CONFIG[season]
  const particlesRef = useRef<Particle[] | null>(null)
  if (particlesRef.current === null) {
    particlesRef.current = Array.from({ length: PARTICLE_COUNT }, () => spawnParticle(false))
  }

  const meshRefs = useRef<(THREE.Mesh | null)[]>([])

  useFrame((_, delta) => {
    if (!particlesRef.current) return
    for (let i = 0; i < particlesRef.current.length; i++) {
      const p = particlesRef.current[i]
      p.x += p.vx * delta
      p.y += p.vy * delta
      p.z += p.vz * delta
      p.rot += p.rotSpeed * delta

      if (p.y < KILL_HEIGHT) {
        particlesRef.current[i] = spawnParticle(true)
      }

      const m = meshRefs.current[i]
      if (m) {
        m.position.set(p.x, p.y, p.z)
        m.rotation.set(p.rot * 0.6, p.rot * 0.4, p.rot)
      }
    }
  })

  return (
    <>
      {particlesRef.current.map((p, i) => (
        <mesh
          key={i}
          ref={(el) => { meshRefs.current[i] = el }}
          position={[p.x, p.y, p.z]}
          scale={p.scale}
        >
          {config.shape === 'plane' ? (
            <planeGeometry args={[config.size, config.size]} />
          ) : (
            <sphereGeometry args={[config.size, 6, 6]} />
          )}
          <meshBasicMaterial
            color={config.color}
            side={THREE.DoubleSide}
            transparent
            opacity={0.85}
          />
        </mesh>
      ))}
    </>
  )
}
