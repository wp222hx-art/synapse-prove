#!/usr/bin/env node
// bake-to-lowpoly.mjs — 把贴图模型转 low-poly:
//   1) 按每个顶点的 UV 采样 baseColor 贴图,烘焙到 COLOR_0 属性
//   2) 删掉所有贴图
//   3) 材质切 unlit + 关 metallic/roughness
//   4) 删掉 UV 属性(用不到了)
//   5) 大幅 simplify 三角面
//   6) quantize + WebP(贴图已删,无实际压缩)
//
// 用法:
//   node scripts/bake-to-lowpoly.mjs <src.glb> <out.glb> [--ratio=0.05]
//
// 输出风格:flat shading、顶点色、纯色材质、低多边形
// 与 Quaternius/Kenney 资产保持一致

import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { quantize, prune, weld, dedup, join, flatten } from '@gltf-transform/functions'
import sharp from 'sharp'
import { resolve } from 'node:path'
import { existsSync, statSync } from 'node:fs'
import { execSync } from 'node:child_process'

const args = process.argv.slice(2)
let ratio = 0.05
const positional = []
for (const a of args) {
  if (a.startsWith('--ratio=')) ratio = parseFloat(a.slice('--ratio='.length))
  else positional.push(a)
}
const [srcArg, outArg] = positional
if (!srcArg || !outArg) {
  console.error('Usage: node scripts/bake-to-lowpoly.mjs <src.glb> <out.glb> [--ratio=0.05]')
  process.exit(2)
}
const src = resolve(srcArg)
const out = resolve(outArg)
if (!existsSync(src)) {
  console.error(`Source not found: ${src}`)
  process.exit(2)
}

console.log(`▸ bake-to-lowpoly: ${src} → ${out}  (simplify ratio=${ratio})`)
console.log(`  Source: ${(statSync(src).size / 1024 / 1024).toFixed(2)} MB`)

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
const doc = await io.read(src)
const root = doc.getRoot()

// ─── Step 1: 为每个材质解码 baseColor 贴图到 RGB 像素阵列 ───────
const materialTextures = new Map()  // material → { pixels: Uint8Array, w, h, channels }
for (const mat of root.listMaterials()) {
  const tex = mat.getBaseColorTexture()
  if (!tex) continue
  const buf = tex.getImage()
  if (!buf) continue
  console.log(`  decoding texture (${(buf.byteLength / 1024).toFixed(0)} KB, ${tex.getMimeType()})...`)
  // sharp 会处理 JPEG/PNG/WebP
  const raw = await sharp(Buffer.from(buf))
    .ensureAlpha(1)
    .resize({ width: 512, height: 512, fit: 'inside' })   // 先降尺寸,采样更快
    .raw()
    .toBuffer({ resolveWithObject: true })
  materialTextures.set(mat, {
    pixels: raw.data,
    w: raw.info.width,
    h: raw.info.height,
    channels: raw.info.channels,
  })
  console.log(`    → ${raw.info.width}×${raw.info.height}, ${raw.info.channels} channels`)
}

// ─── Step 2: 为每个 primitive 烘焙 UV → COLOR_0 ──────────────
function sampleRGBA(tex, u, v) {
  // UV 环绕到 [0, 1)
  const uu = u - Math.floor(u)
  const vv = v - Math.floor(v)
  const px = Math.min(tex.w - 1, Math.max(0, Math.floor(uu * tex.w)))
  // glTF: V=0 在贴图顶部,sharp raw: y=0 也在顶部 → 需翻转
  const py = Math.min(tex.h - 1, Math.max(0, Math.floor((1 - vv) * tex.h)))
  const idx = (py * tex.w + px) * tex.channels
  const r = tex.pixels[idx] / 255
  const g = tex.pixels[idx + 1] / 255
  const b = tex.pixels[idx + 2] / 255
  return [r, g, b, 1]
}

for (const mesh of root.listMeshes()) {
  for (const prim of mesh.listPrimitives()) {
    const mat = prim.getMaterial()
    if (!mat) continue
    const tex = materialTextures.get(mat)
    const uvAttr = prim.getAttribute('TEXCOORD_0')
    const posAttr = prim.getAttribute('POSITION')
    if (!posAttr) continue

    const vertCount = posAttr.getCount()
    const colors = new Float32Array(vertCount * 4)

    if (tex && uvAttr) {
      const uvArr = uvAttr.getArray()
      for (let i = 0; i < vertCount; i++) {
        const u = uvArr[i * 2]
        const v = uvArr[i * 2 + 1]
        const [r, g, b, a] = sampleRGBA(tex, u, v)
        colors[i * 4 + 0] = r
        colors[i * 4 + 1] = g
        colors[i * 4 + 2] = b
        colors[i * 4 + 3] = a
      }
      console.log(`  baked ${vertCount} vertex colors from UV`)
    } else {
      // 没贴图就用 baseColorFactor
      const [r, g, b, a] = mat.getBaseColorFactor()
      for (let i = 0; i < vertCount; i++) {
        colors[i * 4 + 0] = r
        colors[i * 4 + 1] = g
        colors[i * 4 + 2] = b
        colors[i * 4 + 3] = a
      }
      console.log(`  filled ${vertCount} vertex colors from baseColorFactor`)
    }

    // 写入 COLOR_0 accessor
    const buffer = root.listBuffers()[0] || doc.createBuffer()
    const colorAccessor = doc.createAccessor()
      .setArray(colors)
      .setType('VEC4')
      .setBuffer(buffer)
    prim.setAttribute('COLOR_0', colorAccessor)

    // 删掉 UV(已经烘焙完了)
    prim.setAttribute('TEXCOORD_0', null)
  }
}

// ─── Step 3: 材质清空贴图,保持 PBR 可受光(Three.js MeshStandardMaterial) ─────
// 注意:不用 unlit — unlit 在 three 里映射为 MeshBasicMaterial, 不受光不写阴影,
// 与场景其他 low-poly 物体(MeshLambert 风格)不一致。
// 清贴图 + baseColorFactor=白,vertex colors 会作为最终颜色,standard 材质会正常接受光照
for (const mat of root.listMaterials()) {
  mat.setBaseColorTexture(null)
  mat.setMetallicRoughnessTexture(null)
  mat.setNormalTexture(null)
  mat.setOcclusionTexture(null)
  mat.setEmissiveTexture(null)
  mat.setMetallicFactor(0)
  mat.setRoughnessFactor(1)
  mat.setBaseColorFactor([1, 1, 1, 1])  // 顶点色是权威,baseColorFactor 取白让其直通
}

// ─── Step 4: 删掉所有残留的贴图和 image ─────────────────────
for (const tex of root.listTextures()) tex.dispose()

// ─── Step 5: flatten + join + prune ────────────────────
console.log(`  flattening hierarchy...`)
await doc.transform(flatten())

console.log(`  joining primitives (merge into single mesh)...`)
await doc.transform(join({ keepNamed: false }))

console.log(`  pruning unused...`)
await doc.transform(prune())

// ─── Step 5b: 叶片岛屿裁剪 ──────────────────────────
// 分析连接图,把独立的小岛(<10 个三角)按 keepRatio 随机保留。
// 这是把"贴图树的上千个独立叶子 quads"降到低模水平的关键
const ISLAND_KEEP_RATIO = 0.08   // 保留 8% 的叶子岛
for (const mesh of root.listMeshes()) {
  for (const prim of mesh.listPrimitives()) {
    const idxAcc = prim.getIndices()
    if (!idxAcc) continue
    const idxArr = idxAcc.getArray()
    const triCount = idxArr.length / 3
    // Union-Find over triangles sharing any vertex
    const parent = new Int32Array(triCount)
    for (let i = 0; i < triCount; i++) parent[i] = i
    const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x] } return x }
    const union = (a, b) => { a = find(a); b = find(b); if (a !== b) parent[a] = b }

    // 用顶点→三角形 map 来找共享
    const vertToTri = new Map()
    for (let t = 0; t < triCount; t++) {
      for (let k = 0; k < 3; k++) {
        const v = idxArr[t * 3 + k]
        if (!vertToTri.has(v)) vertToTri.set(v, [])
        vertToTri.get(v).push(t)
      }
    }
    for (const tris of vertToTri.values()) {
      for (let i = 1; i < tris.length; i++) union(tris[0], tris[i])
    }
    // Island 分组
    const islands = new Map()
    for (let t = 0; t < triCount; t++) {
      const r = find(t)
      if (!islands.has(r)) islands.set(r, [])
      islands.get(r).push(t)
    }

    // 策略:只保留"最大 N 个岛" + 若干抽样小岛。对一棵树而言:
    // 最大岛 = 主干 + 主枝干的连接部分,单一保留
    // 次大岛 = 次级枝干和一些大叶团,保留前 MAX_BIG_ISLANDS 个
    // 剩余小岛(大部分是独立叶片) = 按概率采样
    const islandList = [...islands.values()].sort((a, b) => b.length - a.length)
    const MAX_BIG_ISLANDS = 80          // 保留最大的 80 个岛(树干 + 主枝 + 主要叶团)
    const SAMPLE_RATIO = 0.04           // 剩下的按 4% 采样(随机叶子点缀)
    console.log(`    islands: ${islandList.length} total, biggest=${islandList[0].length} tris, mean=${Math.round(triCount / islandList.length)} tris`)

    const keepTris = new Uint8Array(triCount)
    // 保留最大的 MAX_BIG_ISLANDS 个
    let bigKept = 0
    for (let i = 0; i < Math.min(MAX_BIG_ISLANDS, islandList.length); i++) {
      for (const t of islandList[i]) keepTris[t] = 1
      bigKept++
    }
    // 剩余岛按哈希采样
    let smallKept = 0
    for (let i = MAX_BIG_ISLANDS; i < islandList.length; i++) {
      const hash = ((i * 2654435761) >>> 0) / 0x100000000
      if (hash < SAMPLE_RATIO) {
        for (const t of islandList[i]) keepTris[t] = 1
        smallKept++
      }
    }
    console.log(`    kept ${bigKept} biggest + ${smallKept}/${islandList.length - MAX_BIG_ISLANDS} sampled leaves`)

    // 重建索引
    const newIdx = []
    for (let t = 0; t < triCount; t++) {
      if (keepTris[t]) {
        newIdx.push(idxArr[t * 3], idxArr[t * 3 + 1], idxArr[t * 3 + 2])
      }
    }
    const IdxCtor = newIdx.length > 65535 ? Uint32Array : Uint16Array
    const newAccessor = doc.createAccessor()
      .setArray(new IdxCtor(newIdx))
      .setType('SCALAR')
      .setBuffer(root.listBuffers()[0])
    prim.setIndices(newAccessor)
    console.log(`    triangles: ${triCount} → ${newIdx.length / 3}`)
  }
}

console.log(`  pruning again after culling...`)
await doc.transform(prune())

// 先写中间文件
const intermediate = out + '.intermediate.glb'
await io.write(intermediate, doc)
console.log(`  intermediate: ${(statSync(intermediate).size / 1024).toFixed(1)} KB`)

// ─── Step 6: 用 CLI simplify(多轮)+ optimize — CLI 处理 "小岛"更鲁棒 ──
console.log(`  simplifying (CLI, iterative)...`)
let current = intermediate
// 迭代方案:温和递进,最后一轮根据 CLI 的 --ratio 参数决定终点
for (const [i, cfg] of [
  { ratio: 0.3, error: 0.05 },
  { ratio: 0.3, error: 0.2 },
  { ratio: 0.3, error: 0.5 },
  { ratio: Math.max(ratio, 0.3), error: 1.2 },
].entries()) {
  const next = out + `.pass${i}.glb`
  execSync(
    `npx --yes @gltf-transform/cli simplify "${current}" "${next}" ` +
    `--ratio ${cfg.ratio} --error ${cfg.error}`,
    { stdio: 'pipe' }
  )
  console.log(`    pass ${i}: ratio=${cfg.ratio} error=${cfg.error} → ${(statSync(next).size/1024).toFixed(1)} KB`)
  if (current !== intermediate) execSync(`rm -f "${current}"`)
  current = next
}

// 最后 optimize 加 quantize + webp
console.log(`  final quantize + webp...`)
execSync(
  `npx --yes @gltf-transform/cli optimize "${current}" "${out}" ` +
  `--compress quantize --texture-compress webp --texture-size 512 --simplify false`,
  { stdio: 'pipe' }
)
execSync(`rm -f "${current}" "${intermediate}"`)
const outSize = statSync(out).size
console.log(`✓ wrote ${out}: ${(outSize / 1024).toFixed(1)} KB`)

// 诊断最终 mesh(重新读一下输出文件,因为之前是 doc 内存态,后面用 CLI 处理了)
const docFinal = await io.read(out)
const root2 = docFinal.getRoot()
let finalTris = 0, finalVerts = 0
for (const mesh of root2.listMeshes()) {
  for (const prim of mesh.listPrimitives()) {
    const idx = prim.getIndices()
    finalVerts += prim.getAttribute('POSITION').getCount()
    finalTris += idx ? idx.getCount() / 3 : prim.getAttribute('POSITION').getCount() / 3
  }
}
console.log(`  final triangles: ${Math.round(finalTris)}`)
console.log(`  final vertices:  ${finalVerts}`)
console.log(`  final textures:  ${root2.listTextures().length}`)
console.log(`  final materials: ${root2.listMaterials().length}`)
