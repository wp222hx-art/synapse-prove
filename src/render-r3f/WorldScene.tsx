// R3F Canvas + 相机 + 场景挂载
// 所有渲染层统一入口

import { Suspense, useMemo } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, Stats } from '@react-three/drei'
import { EffectComposer, Bloom } from '@react-three/postprocessing'
import { Environment } from './Environment'
import { Clouds } from './Clouds'
import { Fireworks } from './Fireworks'
import { Weather } from './Weather'
import { HexTile } from './HexTile'
import { useWorldStore } from '../world/store'
import { WORLD_SIZES } from '../world/HexGrid'

export function WorldScene() {
  const tiles = useWorldStore(s => s.tiles)
  const size = useWorldStore(s => s.size)

  // 相机距离随世界大小自适应
  const cameraConfig = useMemo(() => {
    const rings = WORLD_SIZES[size].rings
    const dist = 6 + rings * 2.8
    return { position: [0, dist * 0.7, dist] as [number, number, number], fov: 35 }
  }, [size])

  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      camera={cameraConfig}
    >
      {/* FPS / MS / MB 监控面板,通过 className 重定位到右上角 */}
      <Stats className="stats-panel" />
      <Suspense fallback={null}>
        <Environment />
        <Clouds />
        <Fireworks />
        <Weather />
        <OrbitControls
          enablePan
          minDistance={5}
          maxDistance={40}
          maxPolarAngle={Math.PI / 2.1}
        />
        {/* 远处地面(雾的"底"色),贴近六边形 base 防止悬空感 */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
          <planeGeometry args={[100, 100]} />
          <meshLambertMaterial color="#0f0f1a" />
        </mesh>
        {/* 全部六边形 */}
        {Array.from(tiles.values()).map(tile => (
          <HexTile key={`${tile.q},${tile.r}`} coord={{ q: tile.q, r: tile.r }} />
        ))}

        {/* 后处理:bloom 让烟花/闪光/高亮环更绚 */}
        <EffectComposer>
          <Bloom
            intensity={0.55}
            luminanceThreshold={0.55}
            luminanceSmoothing={0.4}
            mipmapBlur
          />
        </EffectComposer>
      </Suspense>
    </Canvas>
  )
}
