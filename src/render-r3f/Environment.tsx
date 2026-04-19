// 灯光 + 雾 + 背景 — 支持白天/黑夜切换
// timeOfDay 从 store 读取,useFrame lerp 平滑过渡(0.5s)
// shadow camera frustum 已扩大以包含云层高度

import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Stars } from '@react-three/drei'
import * as THREE from 'three'
import { useWorldStore } from '../world/store'

const NIGHT = {
  ambientColor: 0x8090C0, ambientIntensity: 0.6,
  dirColor: 0xFFF0D0, dirIntensity: 1.4,
  fogColor: 0x1A1A2E, fogDensity: 0.04,
}

const DAY = {
  ambientColor: 0xC8DEFF, ambientIntensity: 0.55,
  dirColor: 0xFFF7D9, dirIntensity: 2.6,
  fogColor: 0x87CEEB, fogDensity: 0.022,
}

export function Environment() {
  const { scene } = useThree()
  const timeOfDay = useWorldStore(s => s.timeOfDay)

  const ambientRef = useRef<THREE.AmbientLight>(null)
  const directionalRef = useRef<THREE.DirectionalLight>(null)

  // 当前过渡值(避免每帧 new Color)
  const cur = useRef({
    ambientColor: new THREE.Color(NIGHT.ambientColor),
    ambientIntensity: NIGHT.ambientIntensity,
    dirColor: new THREE.Color(NIGHT.dirColor),
    dirIntensity: NIGHT.dirIntensity,
    fogColor: new THREE.Color(NIGHT.fogColor),
    fogDensity: NIGHT.fogDensity,
  })

  // 临时目标 Color 对象(避免每帧 new)
  const targetAmbient = useRef(new THREE.Color())
  const targetDir = useRef(new THREE.Color())
  const targetFog = useRef(new THREE.Color())

  useEffect(() => {
    if (!scene.fog) {
      scene.fog = new THREE.FogExp2(NIGHT.fogColor, NIGHT.fogDensity)
    }
    if (!scene.background) {
      scene.background = new THREE.Color(NIGHT.fogColor)
    }
  }, [scene])

  useFrame((_, delta) => {
    const target = timeOfDay === 'day' ? DAY : NIGHT
    const t = Math.min(1, delta * 2.5) // ~0.4s 完成过渡

    targetAmbient.current.setHex(target.ambientColor)
    targetDir.current.setHex(target.dirColor)
    targetFog.current.setHex(target.fogColor)

    cur.current.ambientColor.lerp(targetAmbient.current, t)
    cur.current.ambientIntensity = THREE.MathUtils.lerp(cur.current.ambientIntensity, target.ambientIntensity, t)
    cur.current.dirColor.lerp(targetDir.current, t)
    cur.current.dirIntensity = THREE.MathUtils.lerp(cur.current.dirIntensity, target.dirIntensity, t)
    cur.current.fogColor.lerp(targetFog.current, t)
    cur.current.fogDensity = THREE.MathUtils.lerp(cur.current.fogDensity, target.fogDensity, t)

    if (ambientRef.current) {
      ambientRef.current.color.copy(cur.current.ambientColor)
      ambientRef.current.intensity = cur.current.ambientIntensity
    }
    if (directionalRef.current) {
      directionalRef.current.color.copy(cur.current.dirColor)
      directionalRef.current.intensity = cur.current.dirIntensity
    }
    if (scene.fog) {
      const fog = scene.fog as THREE.FogExp2
      fog.color.copy(cur.current.fogColor)
      fog.density = cur.current.fogDensity
    }
    if (scene.background instanceof THREE.Color) {
      scene.background.copy(cur.current.fogColor)
    }
  })

  return (
    <>
      <ambientLight ref={ambientRef} color={NIGHT.ambientColor} intensity={NIGHT.ambientIntensity} />
      <directionalLight
        ref={directionalRef}
        color={NIGHT.dirColor}
        intensity={NIGHT.dirIntensity}
        position={[10, 15, 10]}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-25}
        shadow-camera-right={25}
        shadow-camera-top={25}
        shadow-camera-bottom={-25}
        shadow-camera-near={1}
        shadow-camera-far={60}
      />
      <directionalLight color={0x4060ff} intensity={0.25} position={[-10, 5, -5]} />
      <hemisphereLight args={[0x88CCEE, 0x884422, 0.3]} />

      {/* 夜晚:星空 + 月亮 */}
      {timeOfDay === 'night' && (
        <>
          <Stars
            radius={80}
            depth={50}
            count={3000}
            factor={5}
            saturation={0}
            fade
            speed={0.4}
          />
          {/* 月亮 */}
          <mesh position={[-13, 13, -10]}>
            <sphereGeometry args={[1.1, 16, 16]} />
            <meshBasicMaterial color="#E8EFFA" />
          </mesh>
          {/* 月亮光晕(略大,半透明) */}
          <mesh position={[-13, 13, -10]}>
            <sphereGeometry args={[1.6, 16, 16]} />
            <meshBasicMaterial color="#A8B8D8" transparent opacity={0.18} />
          </mesh>
        </>
      )}

      {/* 白天:太阳 */}
      {timeOfDay === 'day' && (
        <>
          {/* 太阳本体 */}
          <mesh position={[12, 16, 9]}>
            <sphereGeometry args={[1.6, 24, 24]} />
            <meshBasicMaterial color="#FFE678" />
          </mesh>
          {/* 太阳光晕 */}
          <mesh position={[12, 16, 9]}>
            <sphereGeometry args={[2.4, 24, 24]} />
            <meshBasicMaterial color="#FFC850" transparent opacity={0.25} />
          </mesh>
          <mesh position={[12, 16, 9]}>
            <sphereGeometry args={[3.2, 24, 24]} />
            <meshBasicMaterial color="#FFAA20" transparent opacity={0.10} />
          </mesh>
        </>
      )}
    </>
  )
}
