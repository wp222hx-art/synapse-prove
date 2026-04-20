#!/usr/bin/env node
// validate-asset.mjs — 针对 SYNAPSE 资产规范检查 GLB 文件
//
// 用法:
//   npm run asset:validate <file.glb>
//   node scripts/validate-asset.mjs <file.glb>
//
// 退出码:
//   0 = 全部通过(可能有 WARN)
//   1 = 有 ERROR(阻塞导入)
//   2 = 文件不存在 / 参数错误

import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { statSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { SPEC, C, icon } from './lib/spec.mjs'

/**
 * 对单个 GLB 文件做全面检查
 * @param {string} filePath
 * @returns {Promise<{errors: string[], warnings: string[], info: object}>}
 */
export async function validateAsset(filePath, options = {}) {
  const errors = []
  const warnings = []
  const info = {}
  const profileName = options.profile || 'lowpoly'
  const profile = SPEC.profiles[profileName] || SPEC.profiles.lowpoly
  info.profile = profileName

  // ─── 基础存在性检查 ─────────────────────────────
  if (!existsSync(filePath)) {
    errors.push(`文件不存在: ${filePath}`)
    return { errors, warnings, info }
  }

  const stat = statSync(filePath)
  info.fileBytes = stat.size

  if (!filePath.toLowerCase().endsWith('.glb')) {
    errors.push(`必须是 .glb 格式(二进制 GLTF),实际: ${filePath}`)
    return { errors, warnings, info }
  }

  // ─── 解析 GLB ────────────────────────────────
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
  let doc
  try {
    doc = await io.read(filePath)
  } catch (e) {
    errors.push(`GLB 解析失败: ${e.message}`)
    return { errors, warnings, info }
  }
  const root = doc.getRoot()

  // ─── 文件大小 ────────────────────────────────
  if (stat.size > profile.maxOptimizedBytes) {
    errors.push(
      `文件大小 ${fmtBytes(stat.size)} 超过 ${profileName} 档上限 ${fmtBytes(profile.maxOptimizedBytes)}`
    )
  } else if (stat.size > SPEC.fileSize.warnOptimizedBytes) {
    warnings.push(
      `文件大小 ${fmtBytes(stat.size)} 接近上限,建议跑一次 gltf-transform optimize`
    )
  }

  // ─── 禁止的内容:骨骼/动画/相机/灯 ────────────────
  const animations = root.listAnimations()
  const skins = root.listSkins()
  const cameras = root.listCameras()
  info.animations = animations.length
  info.skins = skins.length
  info.cameras = cameras.length

  if (skins.length > 0) {
    errors.push(`发现 ${skins.length} 个骨骼(skin),会污染 Box3 自动对齐 — 请在 Blender 里删除`)
  }
  if (animations.length > 0) {
    warnings.push(`发现 ${animations.length} 个动画 — 本项目不使用动画,导出时取消勾选可减小文件`)
  }
  if (cameras.length > 0) {
    errors.push(`发现 ${cameras.length} 个相机 — 请在 Blender 里删除`)
  }

  // 检查灯光(extension 扩展) - 检查根下是否引用了 KHR_lights_punctual
  const lightsExt = doc.getRoot().listExtensionsUsed().find(ext => ext.extensionName === 'KHR_lights_punctual')
  if (lightsExt) {
    warnings.push(`发现 KHR_lights_punctual 扩展(灯光) — 本项目在代码里统一加灯,建议移除`)
  }

  // ─── Mesh 数量与层级深度 ─────────────────────
  const meshes = root.listMeshes()
  info.meshes = meshes.length
  if (meshes.length === 0) {
    errors.push(`GLB 中没有任何 mesh`)
    return { errors, warnings, info }
  }
  if (meshes.length > SPEC.topology.maxMeshes) {
    warnings.push(
      `${meshes.length} 个 mesh 超过建议上限 ${SPEC.topology.maxMeshes} — 建议在 Blender 里 Ctrl+J 合并`
    )
  }

  // 节点深度(递归找最深)
  const scenes = root.listScenes()
  let maxDepth = 0
  for (const scene of scenes) {
    for (const node of scene.listChildren()) {
      maxDepth = Math.max(maxDepth, nodeDepth(node, 1))
    }
  }
  info.nodeDepth = maxDepth
  if (maxDepth > SPEC.topology.maxNodeDepth) {
    warnings.push(
      `节点层级深度 ${maxDepth} 超过建议 ${SPEC.topology.maxNodeDepth} — 建议在 Blender 里 flatten hierarchy`
    )
  }

  // ─── 三角面数 ────────────────────────────────
  let totalTriangles = 0
  let totalVertices = 0
  for (const mesh of meshes) {
    for (const prim of mesh.listPrimitives()) {
      const indices = prim.getIndices()
      const position = prim.getAttribute('POSITION')
      if (indices) {
        totalTriangles += indices.getCount() / 3
      } else if (position) {
        totalTriangles += position.getCount() / 3
      }
      if (position) totalVertices += position.getCount()
    }
  }
  info.triangles = Math.round(totalTriangles)
  info.vertices = totalVertices
  if (totalTriangles < SPEC.topology.minTriangles) {
    warnings.push(`三角面数 ${info.triangles} 低于建议下限 ${SPEC.topology.minTriangles}`)
  }
  if (totalTriangles > profile.maxTriangles) {
    errors.push(
      `三角面数 ${info.triangles} 超过 ${profileName} 档上限 ${profile.maxTriangles} — 建议在 Blender 里 Decimate,或用 --profile=hifi`
    )
  }

  // ─── 包围盒 + pivot 对齐检查 ─────────────────────
  const bbox = computeBBox(doc)
  info.bbox = bbox
  if (bbox) {
    const width  = bbox.max[0] - bbox.min[0]
    const height = bbox.max[1] - bbox.min[1]
    const depth  = bbox.max[2] - bbox.min[2]
    info.dimensions = { width, height, depth }

    // 高度检查
    if (height > SPEC.bbox.absoluteMaxHeight) {
      errors.push(
        `模型高度 ${height.toFixed(2)}m 超过绝对上限 ${SPEC.bbox.absoluteMaxHeight}m — 几乎一定是单位/缩放未应用,请检查`
      )
    } else if (height > SPEC.bbox.recommendedMaxHeight) {
      warnings.push(
        `模型高度 ${height.toFixed(2)}m 超过建议 ${SPEC.bbox.recommendedMaxHeight}m — import 会自动用 modelScale 缩放适配,仅作提示`
      )
    }
    if (height < SPEC.bbox.minHeight) {
      warnings.push(
        `模型高度 ${height.toFixed(2)}m 过小(< ${SPEC.bbox.minHeight}m),在六边形上可能看不清`
      )
    }
    if (width > SPEC.bbox.recommendedMaxWidth) {
      warnings.push(`模型宽度 ${width.toFixed(2)}m 超过建议 ${SPEC.bbox.recommendedMaxWidth}m — modelScale 会同步缩小`)
    }
    if (depth > SPEC.bbox.recommendedMaxDepth) {
      warnings.push(`模型深度 ${depth.toFixed(2)}m 超过建议 ${SPEC.bbox.recommendedMaxDepth}m — modelScale 会同步缩小`)
    }

    // Pivot 检查:底面应贴近 y=0
    if (Math.abs(bbox.min[1]) > SPEC.pivot.maxBottomOffset) {
      warnings.push(
        `pivot 底部偏离原点 ${bbox.min[1].toFixed(3)}m(规范 ≤ ${SPEC.pivot.maxBottomOffset}m)— 代码 Box3 对齐会自动修正,但建议 Blender 里重设 origin 到 base`
      )
    }
    // X/Z 中心偏离(代码会居中,仅作 info)
    const cx = (bbox.min[0] + bbox.max[0]) / 2
    const cz = (bbox.min[2] + bbox.max[2]) / 2
    if (Math.abs(cx) > SPEC.pivot.maxHorizontalOffset || Math.abs(cz) > SPEC.pivot.maxHorizontalOffset) {
      warnings.push(
        `模型 X/Z 中心偏离原点 (${cx.toFixed(2)}, ${cz.toFixed(2)})— 代码会自动居中,仅提示`
      )
    }
  }

  // ─── 贴图检查 ──────────────────────────────
  const textures = root.listTextures()
  info.textures = textures.length
  for (const tex of textures) {
    const size = tex.getSize() // [width, height] 或 null
    if (size) {
      const [w, h] = size
      if (w > profile.maxTextureSize || h > profile.maxTextureSize) {
        errors.push(
          `贴图 "${tex.getName() || 'unnamed'}" 尺寸 ${w}×${h} 超过上限 ${profile.maxTextureSize}px`
        )
      }
    }
    const mime = tex.getMimeType()
    if (mime && !SPEC.materials.allowedTextureFormats.includes(mime)) {
      warnings.push(`贴图 "${tex.getName() || 'unnamed'}" 格式 ${mime} 非推荐(建议 ${SPEC.materials.preferredTextureFormat})`)
    }
  }

  // ─── 材质 PBR 扩展检查 ────────────────────────
  for (const ext of doc.getRoot().listExtensionsUsed()) {
    const name = ext.extensionName
    const forbidden = {
      'KHR_materials_transmission': 'transmission',
      'KHR_materials_clearcoat':    'clearcoat',
      'KHR_materials_sheen':        'sheen',
      'KHR_materials_volume':       'volume',
    }
    if (forbidden[name]) {
      warnings.push(
        `材质扩展 ${name} 在 Lambert 光照下无效,徒增文件大小 — 建议移除`
      )
    }
  }

  return { errors, warnings, info }
}

function nodeDepth(node, cur) {
  const children = node.listChildren()
  if (children.length === 0) return cur
  return Math.max(...children.map(c => nodeDepth(c, cur + 1)))
}

/** 遍历所有 mesh 的 POSITION accessor 算总包围盒(世界空间) */
function computeBBox(doc) {
  const min = [Infinity, Infinity, Infinity]
  const max = [-Infinity, -Infinity, -Infinity]
  let found = false

  const scenes = doc.getRoot().listScenes()
  for (const scene of scenes) {
    for (const root of scene.listChildren()) {
      traverseNode(root, mat4Identity(), (node, worldMat) => {
        const mesh = node.getMesh()
        if (!mesh) return
        for (const prim of mesh.listPrimitives()) {
          const pos = prim.getAttribute('POSITION')
          if (!pos) continue
          const count = pos.getCount()
          const v = [0, 0, 0]
          for (let i = 0; i < count; i++) {
            pos.getElement(i, v)
            const w = transformPoint(v, worldMat)
            for (let k = 0; k < 3; k++) {
              if (w[k] < min[k]) min[k] = w[k]
              if (w[k] > max[k]) max[k] = w[k]
            }
            found = true
          }
        }
      })
    }
  }
  return found ? { min, max } : null
}

function traverseNode(node, parentMat, visit) {
  const local = node.getMatrix() // 16 numbers
  const world = multiplyMat4(parentMat, local)
  visit(node, world)
  for (const child of node.listChildren()) {
    traverseNode(child, world, visit)
  }
}

function mat4Identity() {
  return [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]
}

/** a * b,列主序 */
function multiplyMat4(a, b) {
  const r = new Array(16)
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      r[i * 4 + j] = 0
      for (let k = 0; k < 4; k++) {
        r[i * 4 + j] += a[k * 4 + j] * b[i * 4 + k]
      }
    }
  }
  return r
}

/** 点变换(列主序矩阵) */
function transformPoint(p, m) {
  const x = p[0], y = p[1], z = p[2]
  return [
    m[0]*x + m[4]*y + m[8]*z  + m[12],
    m[1]*x + m[5]*y + m[9]*z  + m[13],
    m[2]*x + m[6]*y + m[10]*z + m[14],
  ]
}

function fmtBytes(n) {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(2)} MB`
}

// ─── CLI 入口 ────────────────────────────────
const isMainModule = import.meta.url === `file://${process.argv[1]}`
if (isMainModule) {
  const args = process.argv.slice(2)
  let profile = 'lowpoly'
  const positional = []
  for (const a of args) {
    if (a.startsWith('--profile=')) profile = a.slice('--profile='.length)
    else positional.push(a)
  }
  if (positional.length === 0) {
    console.log(`${icon.info} 用法: npm run asset:validate <file.glb> [--profile=lowpoly|hifi]`)
    process.exit(2)
  }
  const filePath = resolve(positional[0])

  console.log(`\n${C.bold}SYNAPSE 资产规范检查${C.reset} ${C.dim}(spec v${SPEC.version}, profile=${profile})${C.reset}`)
  console.log(`${C.dim}─────────────────────────────────────────────${C.reset}`)
  console.log(`${icon.step} 目标文件: ${C.cyan}${filePath}${C.reset}\n`)

  try {
    const { errors, warnings, info } = await validateAsset(filePath, { profile })

    // ─── 信息概览 ────
    console.log(`${C.bold}信息${C.reset}`)
    if (info.fileBytes)  console.log(`  ${icon.info} 文件大小    ${fmtBytes(info.fileBytes)}`)
    if (info.meshes !== undefined)    console.log(`  ${icon.info} mesh 数量   ${info.meshes}`)
    if (info.triangles !== undefined) console.log(`  ${icon.info} 三角面数    ${info.triangles}`)
    if (info.vertices !== undefined)  console.log(`  ${icon.info} 顶点数      ${info.vertices}`)
    if (info.nodeDepth) console.log(`  ${icon.info} 节点深度    ${info.nodeDepth}`)
    if (info.textures !== undefined)  console.log(`  ${icon.info} 贴图数量    ${info.textures}`)
    if (info.dimensions) {
      const d = info.dimensions
      console.log(`  ${icon.info} 包围盒      ${d.width.toFixed(2)} × ${d.height.toFixed(2)} × ${d.depth.toFixed(2)} m (W×H×D)`)
    }
    if (info.bbox) {
      console.log(`  ${icon.info} bbox.min.y  ${info.bbox.min[1].toFixed(3)} m ${C.dim}(应接近 0)${C.reset}`)
    }

    // ─── 错误 ────
    if (errors.length > 0) {
      console.log(`\n${C.bold}${C.red}错误 (${errors.length})${C.reset}`)
      for (const e of errors) console.log(`  ${icon.err} ${e}`)
    }

    // ─── 警告 ────
    if (warnings.length > 0) {
      console.log(`\n${C.bold}${C.yellow}警告 (${warnings.length})${C.reset}`)
      for (const w of warnings) console.log(`  ${icon.warn} ${w}`)
    }

    // ─── 总结 ────
    console.log()
    if (errors.length > 0) {
      console.log(`${icon.err} ${C.bold}${C.red}不合规${C.reset} — 请先修复后再导入`)
      process.exit(1)
    }
    if (warnings.length > 0) {
      console.log(`${icon.warn} ${C.bold}${C.yellow}通过(含警告)${C.reset} — 可以导入,但建议优化`)
    } else {
      console.log(`${icon.ok} ${C.bold}${C.green}完美合规${C.reset} — 可以直接导入`)
    }
    process.exit(0)
  } catch (e) {
    console.error(`${icon.err} 执行失败: ${e.message}`)
    console.error(e.stack)
    process.exit(1)
  }
}
