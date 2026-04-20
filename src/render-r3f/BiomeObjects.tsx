// GLB 物件加载 + 缓存 + base 对齐 + 特殊地貌代码生成
// 冰川的 winter_hut 模型自带"倒三角浮山",改用代码生成的 igloo 半球
// 其他地貌用 GLB,Box3 只对 visible mesh 算包围盒(跳过 helper / 隐藏几何)

import { useGLTF } from '@react-three/drei'
import { useMemo } from 'react'
import * as THREE from 'three'
import type { BiomeId } from '../world/Biome'
import { BIOMES, BIOME_IDS } from '../world/Biome'

// 启动时预加载所有 GLB(glacier 用代码生成,跳过)
BIOME_IDS.forEach(id => {
  if (id !== 'glacier') {
    useGLTF.preload(BIOMES[id].modelUrl)
  }
})

interface BiomeObjectProps {
  biomeId: BiomeId
}

export function BiomeObject({ biomeId }: BiomeObjectProps) {
  // 冰川:代码生成 igloo(避免 GLB 的 floating mountain 倒三角问题)
  if (biomeId === 'glacier') return <CodeIgloo />
  return <GLBObject biomeId={biomeId} />
}

// ─── GLB 模型加载 + base 对齐 ────────────────────────────
function GLBObject({ biomeId }: BiomeObjectProps) {
  const def = BIOMES[biomeId]
  const { scene } = useGLTF(def.modelUrl)

  const positioned = useMemo(() => {
    const clone = scene.clone(true)
    clone.scale.setScalar(def.modelScale)
    clone.updateMatrixWorld(true)

    // 只对 visible mesh 计算包围盒,跳过 helper / invisible / 非 mesh 节点
    // 这一步是关键:某些 GLB 带有 collision proxy 或 bone helper,
    // setFromObject 会把它们也算进去,导致 box.min.y 偏离实际几何最低点
    const box = new THREE.Box3()
    clone.traverse(child => {
      const mesh = child as THREE.Mesh
      if (mesh.isMesh && mesh.visible && mesh.geometry) {
        mesh.updateWorldMatrix(true, false)
        const meshBox = new THREE.Box3().setFromObject(mesh)
        if (!meshBox.isEmpty()) box.union(meshBox)
      }
    })

    if (!box.isEmpty()) {
      // base 对齐到 y=0
      clone.position.y = -box.min.y
      // X/Z 居中到 0(避免模型 pivot 在角落)
      clone.position.x = -(box.min.x + box.max.x) / 2
      clone.position.z = -(box.min.z + box.max.z) / 2
    }

    // 阴影投射 + 低模模型统一风格(flat shading 响应 vertex colors)
    // ⚠ GLTFLoader 已构造的 MeshStandardMaterial 在后期改 vertexColors + needsUpdate
    // 仍不会重编译 shader(Three.js shader cache key 不含 vertexColors 变化),
    // 必须替换为全新 Material 才能让顶点色生效。
    clone.traverse(child => {
      const mesh = child as THREE.Mesh
      if (mesh.isMesh) {
        mesh.castShadow = true
        mesh.receiveShadow = true
        const geom = mesh.geometry as THREE.BufferGeometry
        const hasVertexColors = !!geom.getAttribute('color')
        if (hasVertexColors) {
          // lowpoly bake 产物:替换为全新 StandardMaterial,顶点色 + flat shading
          const replace = (old: THREE.Material) => {
            const oldPbr = old as THREE.MeshStandardMaterial
            const next = new THREE.MeshStandardMaterial({
              vertexColors: true,
              flatShading: true,
              metalness: 0,
              roughness: 1,
              // 保留原色调(若 baseColorFactor ≠ 白,仍与顶点色相乘)
              color: oldPbr.color ? oldPbr.color.clone() : new THREE.Color(0xffffff),
              side: oldPbr.side ?? THREE.FrontSide,
            })
            old.dispose?.()
            return next
          }
          const mat = mesh.material as THREE.Material | THREE.Material[]
          if (Array.isArray(mat)) mesh.material = mat.map(replace)
          else if (mat) mesh.material = replace(mat)
        }
      }
    })
    return clone
  }, [scene, def.modelScale])

  return <primitive object={positioned} />
}

// ─── 代码生成 igloo(冰川) ─────────────────────────────
function CodeIgloo() {
  return (
    <group>
      {/* 半球雪屋 */}
      <mesh castShadow receiveShadow>
        <sphereGeometry args={[0.45, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshLambertMaterial color="#F5FAFF" flatShading />
      </mesh>
      {/* 入口门洞(蓝色凸出) */}
      <mesh castShadow position={[0, 0.07, 0.4]}>
        <boxGeometry args={[0.22, 0.22, 0.18]} />
        <meshLambertMaterial color="#7FA8C9" flatShading />
      </mesh>
      {/* 顶部小气孔(深蓝点缀) */}
      <mesh position={[0, 0.46, 0]}>
        <sphereGeometry args={[0.04, 8, 6]} />
        <meshLambertMaterial color="#3D5A7A" flatShading />
      </mesh>
    </group>
  )
}
