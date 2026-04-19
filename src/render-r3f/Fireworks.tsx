// 探索完成后,持续在天上放礼花
// rocket 升空 → 到达爆炸高度 → 球形辐射粒子 + 重力 + 寿命
// 烟花数据放 ref,React 只在新增/删除时 re-render,粒子用 useFrame 直接改 mesh

import { useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useWorldStore } from '../world/store'

// ─── 调参常量 ────────────────────────────────
const COLORS = [
  '#FF3060', '#FFEA00', '#3B82F6', '#A855F7',
  '#10B981', '#FF8C00', '#EC4899', '#FFFFFF',
  '#00BFFF', '#FFD700', '#FF6080',
]
const PARTICLE_COUNT = 45
const SPAWN_INTERVAL_MIN = 1.0  // 秒
const SPAWN_INTERVAL_MAX = 2.4
const ROCKET_SPEED_MIN = 5.5
const ROCKET_SPEED_MAX = 7.5
const PARTICLE_SPEED_MIN = 1.5
const PARTICLE_SPEED_MAX = 2.6
const PARTICLE_LIFE_MIN = 1.5
const PARTICLE_LIFE_MAX = 2.2
const GRAVITY = 2.8
const ROCKET_GRAVITY = 9.0
const SPAWN_RADIUS = 11
const TARGET_Y_MIN = 5.5
const TARGET_Y_MAX = 8.5

interface Particle {
  x: number; y: number; z: number
  vx: number; vy: number; vz: number
  life: number
  maxLife: number
}

interface Firework {
  id: number
  exploded: boolean
  rocket: { x: number; y: number; z: number; vy: number }
  targetY: number
  particles: Particle[]
  color: string
}

let nextId = 0

function spawnFirework(): Firework {
  const angle = Math.random() * Math.PI * 2
  const dist = Math.random() * SPAWN_RADIUS
  return {
    id: nextId++,
    exploded: false,
    rocket: {
      x: Math.cos(angle) * dist,
      y: 0.3,
      z: Math.sin(angle) * dist,
      vy: ROCKET_SPEED_MIN + Math.random() * (ROCKET_SPEED_MAX - ROCKET_SPEED_MIN),
    },
    targetY: TARGET_Y_MIN + Math.random() * (TARGET_Y_MAX - TARGET_Y_MIN),
    particles: [],
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
  }
}

function explodeFirework(fw: Firework) {
  fw.exploded = true
  fw.particles = []
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    // 球面均匀分布(避免上下端密度高)
    const phi = Math.acos(1 - 2 * Math.random())
    const theta = Math.random() * Math.PI * 2
    const speed = PARTICLE_SPEED_MIN + Math.random() * (PARTICLE_SPEED_MAX - PARTICLE_SPEED_MIN)
    const life = PARTICLE_LIFE_MIN + Math.random() * (PARTICLE_LIFE_MAX - PARTICLE_LIFE_MIN)
    fw.particles.push({
      x: fw.rocket.x,
      y: fw.rocket.y,
      z: fw.rocket.z,
      vx: Math.sin(phi) * Math.cos(theta) * speed,
      vy: Math.cos(phi) * speed + 0.6, // 略微上偏,看起来更像花
      vz: Math.sin(phi) * Math.sin(theta) * speed,
      life,
      maxLife: life,
    })
  }
}

// ─── 外层 wrapper:监听完成状态 ───
export function Fireworks() {
  const exploredCount = useWorldStore(s => s.exploredCount)
  const totalCount = useWorldStore(s => s.totalCount)
  const isComplete = exploredCount === totalCount && totalCount > 0
  if (!isComplete) return null
  return <FireworksInner />
}

// ─── 内层:烟花生命周期管理 ───
function FireworksInner() {
  const fwRef = useRef<Firework[]>([])
  const lastSpawnRef = useRef(performance.now() - 1500) // 第一发更快出现
  const nextDelayRef = useRef(0)
  const [, setRev] = useState(0)

  useFrame((_, delta) => {
    let changed = false
    const now = performance.now()

    // 1. 是否生成新烟花?
    if (now - lastSpawnRef.current > nextDelayRef.current) {
      fwRef.current.push(spawnFirework())
      lastSpawnRef.current = now
      nextDelayRef.current = (SPAWN_INTERVAL_MIN + Math.random() * (SPAWN_INTERVAL_MAX - SPAWN_INTERVAL_MIN)) * 1000
      changed = true
    }

    // 2. 推进所有烟花
    for (let i = fwRef.current.length - 1; i >= 0; i--) {
      const fw = fwRef.current[i]
      if (!fw.exploded) {
        // 升空
        fw.rocket.y += fw.rocket.vy * delta
        fw.rocket.vy -= ROCKET_GRAVITY * delta
        if (fw.rocket.y >= fw.targetY || fw.rocket.vy < 0.5) {
          explodeFirework(fw)
          changed = true
        }
      } else {
        // 爆炸后:粒子物理
        let alive = 0
        for (const p of fw.particles) {
          if (p.life <= 0) continue
          p.x += p.vx * delta
          p.y += p.vy * delta
          p.z += p.vz * delta
          p.vy -= GRAVITY * delta
          p.life -= delta
          if (p.life > 0) alive++
        }
        if (alive === 0) {
          fwRef.current.splice(i, 1)
          changed = true
        }
      }
    }

    // 3. 只在烟花数量变化时通知 React 重渲染(spawn / kill)
    if (changed) setRev(r => r + 1)
  })

  return (
    <>
      {fwRef.current.map(fw => (
        <FireworkInstance key={fw.id} firework={fw} />
      ))}
    </>
  )
}

// ─── 单个烟花的渲染(rocket + 粒子组) ───
function FireworkInstance({ firework }: { firework: Firework }) {
  const rocketRef = useRef<THREE.Mesh>(null)
  const trailRef = useRef<THREE.Mesh>(null)
  const particleRefs = useRef<(THREE.Mesh | null)[]>([])

  useFrame(() => {
    // 升空状态:rocket + trail 跟踪位置
    if (!firework.exploded) {
      if (rocketRef.current) {
        rocketRef.current.visible = true
        rocketRef.current.position.set(firework.rocket.x, firework.rocket.y, firework.rocket.z)
      }
      if (trailRef.current) {
        trailRef.current.visible = true
        trailRef.current.position.set(firework.rocket.x, firework.rocket.y - 0.45, firework.rocket.z)
      }
      return
    }

    // 爆炸状态:rocket 隐藏,粒子物理
    if (rocketRef.current) rocketRef.current.visible = false
    if (trailRef.current) trailRef.current.visible = false

    for (let i = 0; i < firework.particles.length; i++) {
      const p = firework.particles[i]
      const m = particleRefs.current[i]
      if (!m) continue
      if (p.life <= 0) {
        m.visible = false
        continue
      }
      m.visible = true
      m.position.set(p.x, p.y, p.z)
      const t = p.life / p.maxLife
      const scale = 0.06 + t * 0.08
      m.scale.setScalar(scale)
      ;(m.material as THREE.MeshBasicMaterial).opacity = t
    }
  })

  return (
    <group>
      {/* 升空小光球 */}
      <mesh ref={rocketRef}>
        <sphereGeometry args={[0.11, 8, 8]} />
        <meshBasicMaterial color={firework.color} />
      </mesh>
      {/* 拖尾 */}
      <mesh ref={trailRef}>
        <sphereGeometry args={[0.08, 6, 6]} />
        <meshBasicMaterial color={firework.color} transparent opacity={0.45} />
      </mesh>
      {/* 爆炸粒子(始终渲染,通过 visible + scale 控制) */}
      {Array.from({ length: PARTICLE_COUNT }, (_, i) => (
        <mesh
          key={i}
          ref={(el) => { particleRefs.current[i] = el }}
          visible={false}
        >
          <sphereGeometry args={[1, 6, 6]} />
          <meshBasicMaterial color={firework.color} transparent opacity={1} />
        </mesh>
      ))}
    </group>
  )
}
