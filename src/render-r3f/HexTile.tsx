// 六棱柱地块 + 翻转动画(easeOutBack 过冲) + 地貌特征 + 物件 + 翻转粒子
// 用 useFrame + 自定义缓动驱动动画,不引入 react-spring 依赖

import { useRef, useMemo, useEffect, useState } from 'react'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import { axialToWorld, HEX_RADIUS, type AxialCoord } from '../world/HexGrid'
import { BIOMES, SEASON_TINT, mixColor } from '../world/Biome'
import { useWorldStore } from '../world/store'
import { BiomeObject } from './BiomeObjects'
import { BiomeFeature } from './BiomeFeatures'
import { SpawnBurst } from './SpawnBurst'
import { playFlipSound } from '../sfx'

const FLIPPED_BACK_HEIGHT = 0.05
const FLIP_DURATION = 0.7   // 翻转动画总时长(秒)
const BURST_DURATION_MS = 800

// 共享的六棱柱几何体 + 顶点色(顶亮底暗,low poly 立体感)
const sharedHexGeometry = (() => {
  const shape = new THREE.Shape()
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i - Math.PI / 6
    const px = HEX_RADIUS * 0.97 * Math.cos(angle)
    const py = HEX_RADIUS * 0.97 * Math.sin(angle)
    if (i === 0) shape.moveTo(px, py)
    else shape.lineTo(px, py)
  }
  shape.closePath()
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 1, bevelEnabled: false })
  geo.rotateX(-Math.PI / 2)
  geo.translate(0, 1, 0) // base 落在 y=0,top 在 y=1

  // vertex color:y=0(底)→ 0.78,y=1(顶)→ 1.0
  // 与 material color 相乘,实现 low poly 风格的"顶面被光照亮"感
  const positionAttr = geo.attributes.position
  const colors = new Float32Array(positionAttr.count * 3)
  for (let i = 0; i < positionAttr.count; i++) {
    const y = positionAttr.getY(i)
    const brightness = 0.78 + y * 0.22
    colors[i * 3] = brightness
    colors[i * 3 + 1] = brightness
    colors[i * 3 + 2] = brightness
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  return geo
})()

// easeOutBack:t=0 → 0,t=1 → 1,中间过冲到 ~1.10
function easeOutBack(t: number, overshoot = 1.7): number {
  if (t <= 0) return 0
  if (t >= 1) return 1
  const c1 = overshoot
  const c3 = c1 + 1
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2)
}

interface HexTileProps {
  coord: AxialCoord
}

export function HexTile({ coord }: HexTileProps) {
  const tile = useWorldStore(s => s.tiles.get(`${coord.q},${coord.r}`))
  const flipTile = useWorldStore(s => s.flipTile)
  const isFlippable = useWorldStore(s => s.isFlippable(coord))
  const season = useWorldStore(s => s.season)

  const meshRef = useRef<THREE.Mesh>(null)
  const objectGroupRef = useRef<THREE.Group>(null)

  // 翻转进度 0 → 1(对应 easeOutBack 的输入)
  const flipProgressRef = useRef(0)
  // 粒子激活状态 — 翻转瞬间触发,800ms 后自动结束
  const [burstActive, setBurstActive] = useState(false)

  const { x, z } = useMemo(() => axialToWorld(coord), [coord])

  const biome = tile?.flipped && tile.biome ? BIOMES[tile.biome] : null
  const targetHeight = biome ? Math.max(0.05, Math.abs(biome.height)) : FLIPPED_BACK_HEIGHT
  // 季节偏移:把基础色和季节 tint 混合
  const baseColor = biome ? biome.color : '#3a3a4a'
  const tint = SEASON_TINT[season]
  const targetColor = biome ? mixColor(baseColor, tint.color, tint.weight) : baseColor
  const targetY = biome && biome.height < 0 ? biome.height : 0

  // 颜色立即同步(无动画)
  useEffect(() => {
    if (meshRef.current) {
      const mat = meshRef.current.material as THREE.MeshLambertMaterial
      mat.color = new THREE.Color(targetColor)
    }
  }, [targetColor])

  // 翻转触发:重置进度 + 启动粒子
  // 注:音效在 onClick 同步触发(iOS Safari 的 audio gesture policy 要求)
  useEffect(() => {
    if (tile?.flipped) {
      flipProgressRef.current = 0
      setBurstActive(true)
      const timer = setTimeout(() => setBurstActive(false), BURST_DURATION_MS)
      return () => clearTimeout(timer)
    }
  }, [tile?.flipped])

  // useFrame 驱动动画
  useFrame((_, delta) => {
    if (!meshRef.current) return

    if (tile?.flipped) {
      // 推进翻转进度
      if (flipProgressRef.current < 1) {
        flipProgressRef.current = Math.min(1, flipProgressRef.current + delta / FLIP_DURATION)
      }
      const eased = easeOutBack(flipProgressRef.current)
      const startH = FLIPPED_BACK_HEIGHT
      meshRef.current.scale.y = startH + (targetHeight - startH) * eased
      meshRef.current.position.y = targetY * eased
    } else {
      // 未翻转:回到背面状态
      meshRef.current.scale.y = THREE.MathUtils.lerp(meshRef.current.scale.y, FLIPPED_BACK_HEIGHT, delta * 8)
      meshRef.current.position.y = THREE.MathUtils.lerp(meshRef.current.position.y, 0, delta * 8)
      flipProgressRef.current = 0
    }

    // 物件 group 跟随 hex top
    if (objectGroupRef.current) {
      const yOffset = biome?.modelYOffset ?? 0
      objectGroupRef.current.position.y = meshRef.current.scale.y + meshRef.current.position.y + yOffset
      // 物件 scale 跟着翻转进度增长(略晚于地块)
      const targetObjScale = tile?.flipped ? Math.min(1, flipProgressRef.current * 1.4) : 0
      const cur = objectGroupRef.current.scale.x
      const next = THREE.MathUtils.lerp(cur, targetObjScale, delta * 10)
      objectGroupRef.current.scale.set(next, next, next)
    }
  })

  return (
    <group position={[x, 0, z]}>
      <mesh
        ref={meshRef}
        geometry={sharedHexGeometry}
        scale={[1, FLIPPED_BACK_HEIGHT, 1]}
        receiveShadow
        castShadow
        onClick={(e: ThreeEvent<MouseEvent>) => {
          e.stopPropagation()
          // 必须在用户手势同步上下文里播音效,否则 iOS Safari 静音
          // 不可翻的格子也不响(避免无效操作)
          if (isFlippable) playFlipSound()
          flipTile(coord)
        }}
      >
        <meshLambertMaterial color={targetColor} flatShading vertexColors />
      </mesh>

      {/* 可翻转高亮环 */}
      {!tile?.flipped && isFlippable && (
        <mesh
          position={[0, FLIPPED_BACK_HEIGHT + 0.02, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <ringGeometry args={[HEX_RADIUS * 0.65, HEX_RADIUS * 0.88, 6]} />
          <meshBasicMaterial color="#ffea00" transparent opacity={0.7} />
        </mesh>
      )}

      {/* 已翻转:地貌特征底座 + GLB 物件 */}
      {tile?.biome && (
        <group ref={objectGroupRef} scale={0}>
          <BiomeFeature biomeId={tile.biome} />
          <BiomeObject biomeId={tile.biome} />
        </group>
      )}

      {/* 翻转粒子爆发 — 800ms 寿命,burstActive=false 时 unmount */}
      {burstActive && tile?.biome && (
        <group position={[0, targetHeight + 0.15, 0]}>
          <SpawnBurst color={BIOMES[tile.biome].color} />
        </group>
      )}
    </group>
  )
}
