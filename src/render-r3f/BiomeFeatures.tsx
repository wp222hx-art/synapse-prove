// 代码生成的"地貌特征底座" — 在物件之下、地块之上额外渲染
// 给 mountain/glacier/forest/island/desert 额外的几何特征,让地貌更立体

import type { BiomeId } from '../world/Biome'
import { BIOMES } from '../world/Biome'

interface BiomeFeatureProps {
  biomeId: BiomeId
}

export function BiomeFeature({ biomeId }: BiomeFeatureProps) {
  switch (biomeId) {
    case 'mountain':      return <MountainFeature />
    case 'glacier':       return <GlacierFeature />
    case 'forest':        return <ForestFeature />
    case 'desert':        return <DesertFeature />
    case 'autumn_forest': return <AutumnForestFeature />
    // island 不要半球(用户反馈丑),保持平地 + 灯塔
    default:              return null
  }
}

// ─── 山地:大锥形山(主峰 + 副峰) ────────
function MountainFeature() {
  const color = darken(BIOMES.mountain.color, 0.85)
  return (
    <group>
      <mesh castShadow receiveShadow position={[0, 0.35, 0]}>
        <coneGeometry args={[0.55, 0.7, 6]} />
        <meshLambertMaterial color={color} flatShading />
      </mesh>
      <mesh castShadow receiveShadow position={[0.32, 0.2, 0.22]}>
        <coneGeometry args={[0.25, 0.4, 5]} />
        <meshLambertMaterial color={color} flatShading />
      </mesh>
    </group>
  )
}

// ─── 冰川:冰晶柱簇 ────────────
function GlacierFeature() {
  const crystals: Array<[number, number, number, number]> = [
    [0.3, 0.3, 0.18, 0.55],
    [-0.35, 0.1, 0.15, 0.7],
    [0.1, -0.4, 0.16, 0.45],
  ]
  return (
    <group>
      {crystals.map(([x, z, r, h], i) => (
        <mesh
          key={i}
          castShadow receiveShadow
          position={[x, h / 2, z]}
        >
          <coneGeometry args={[r, h, 5]} />
          <meshLambertMaterial color="#B8E0F8" flatShading transparent opacity={0.9} />
        </mesh>
      ))}
    </group>
  )
}

// ─── 森林:苔藓丘 ──────────
function ForestFeature() {
  const color = darken(BIOMES.forest.color, 0.85)
  return (
    <mesh castShadow receiveShadow>
      <sphereGeometry args={[0.55, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
      <meshLambertMaterial color={color} flatShading />
    </mesh>
  )
}

// ─── 海岛:抬高的圆顶 ──────
function IslandFeature() {
  const color = darken(BIOMES.island.color, 0.85)
  return (
    <mesh castShadow receiveShadow>
      <sphereGeometry args={[0.6, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
      <meshLambertMaterial color={color} flatShading />
    </mesh>
  )
}

// ─── 秋林:散落的落叶堆(3 个橙红小丘,点缀在树周围) ──────
// 区别于 forest 的整块苔藓丘,用分散的小丘点缀更符合"落叶满地"的感觉
function AutumnForestFeature() {
  // 落叶堆:[x, z, radius, height, tintFactor]
  const leafPiles: Array<[number, number, number, number, number]> = [
    [ 0.38,  0.10, 0.22, 0.12, 1.00],  // 主色橙
    [-0.30,  0.35, 0.18, 0.10, 0.88],  // 偏红
    [ 0.05, -0.40, 0.20, 0.11, 1.10],  // 偏黄
  ]
  return (
    <group>
      {leafPiles.map(([x, z, r, h, tint], i) => (
        <mesh key={i} castShadow receiveShadow position={[x, h / 2, z]} scale={[1, 0.55, 1]}>
          <sphereGeometry args={[r, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshLambertMaterial color={tintColor(BIOMES.autumn_forest.color, tint)} flatShading />
        </mesh>
      ))}
    </group>
  )
}

// ─── 沙漠:扁平沙丘 ──────
function DesertFeature() {
  const color = darken(BIOMES.desert.color, 0.92)
  return (
    <mesh castShadow receiveShadow scale={[1, 0.4, 1]}>
      <sphereGeometry args={[0.5, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2]} />
      <meshLambertMaterial color={color} flatShading />
    </mesh>
  )
}

// ─── helper:HEX 颜色乘以 factor(<1 变暗,>1 变亮,clamp 到 [0,255]) ──────
function darken(hex: string, factor: number): string {
  return tintColor(hex, factor)
}

// 更通用的 tint:factor 可以 >1(变亮),用于秋林的黄色落叶等场景
function tintColor(hex: string, factor: number): string {
  const c = parseInt(hex.slice(1), 16)
  const r = Math.max(0, Math.min(255, Math.floor((c >> 16) * factor)))
  const g = Math.max(0, Math.min(255, Math.floor(((c >> 8) & 0xff) * factor)))
  const b = Math.max(0, Math.min(255, Math.floor((c & 0xff) * factor)))
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
}
