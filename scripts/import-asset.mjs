#!/usr/bin/env node
// import-asset.mjs — 一键导入:校验 → 优化 → 放置 → 注册 Biome.ts
//
// 用法:
//   npm run asset:import -- <src.glb> <biome_id> <label> <color> <emoji>
//
// 示例:
//   npm run asset:import -- ./my_volcano.glb volcano 火山 '#8B2A1A' 🌋
//
// 选项(通过 --flag 传):
//   --dry-run            只报告步骤,不实际修改
//   --no-register        只放置文件,不写 Biome.ts
//   --object-name=NAME   自定义 GLB 文件名(默认从 biome_id 推导)
//   --y-offset=0.18      漂浮物才填(默认 0)
//
// 流程:
//   1. validate 源文件(allow-warnings)
//   2. gltf-transform optimize
//   3. validate 优化产物(strict)
//   4. 计算推荐 modelScale
//   5. 放置到 public/models/biomes/<biome_id>/<object_name>.glb
//   6. (可选) 追加到 src/world/Biome.ts 的 BIOMES 和 BiomeId

import { existsSync, readFileSync, writeFileSync, statSync, mkdirSync, cpSync } from 'node:fs'
import { resolve, join, basename, extname } from 'node:path'
import { execSync } from 'node:child_process'
import { validateAsset } from './validate-asset.mjs'
import { SPEC, C, icon, recommendScale } from './lib/spec.mjs'

// ─── CLI 解析 ──────────────────────────────
const rawArgs = process.argv.slice(2)
const flags = {}
const positional = []
for (const arg of rawArgs) {
  if (arg.startsWith('--')) {
    const [k, v] = arg.slice(2).split('=')
    flags[k] = v === undefined ? true : v
  } else {
    positional.push(arg)
  }
}

const [srcFile, biomeId, label, color, emoji] = positional

function usage(msg) {
  if (msg) console.log(`${icon.err} ${msg}\n`)
  console.log(`${C.bold}用法${C.reset}`)
  console.log(`  npm run asset:import -- <src.glb> <biome_id> <label> <color> <emoji>`)
  console.log(`\n${C.bold}参数${C.reset}`)
  console.log(`  ${C.cyan}src.glb${C.reset}   源 GLB 文件路径(可以是任意位置)`)
  console.log(`  ${C.cyan}biome_id${C.reset}  地貌 ID, snake_case, 3-20 字符 (例: volcano)`)
  console.log(`  ${C.cyan}label${C.reset}     中文标签, 2-4 字 (例: 火山)`)
  console.log(`  ${C.cyan}color${C.reset}     tile 地面色, hex (例: '#8B2A1A')`)
  console.log(`  ${C.cyan}emoji${C.reset}     UI 图例 (例: 🌋)`)
  console.log(`\n${C.bold}可选${C.reset}`)
  console.log(`  ${C.dim}--dry-run${C.reset}           只报告,不改文件`)
  console.log(`  ${C.dim}--no-register${C.reset}       只放置文件,不写 Biome.ts`)
  console.log(`  ${C.dim}--object-name=NAME${C.reset}  自定义 GLB 文件名 (默认 biome_id)`)
  console.log(`  ${C.dim}--y-offset=0.18${C.reset}     漂浮物 Y 偏移`)
  console.log(`\n${C.bold}示例${C.reset}`)
  console.log(`  ${C.dim}npm run asset:import -- ./volcano.glb volcano 火山 '#8B2A1A' 🌋${C.reset}`)
  process.exit(msg ? 2 : 0)
}

if (!srcFile || !biomeId || !label || !color || !emoji) {
  usage('缺少必要参数')
}
if (!SPEC.naming.biomeIdPattern.test(biomeId)) {
  usage(`biome_id "${biomeId}" 不符合命名规范 ${SPEC.naming.biomeIdPattern}`)
}
if (!/^#[0-9a-fA-F]{6}$/.test(color)) {
  usage(`color "${color}" 必须是 6 位 hex (如 #8B2A1A)`)
}
if (!emoji || emoji.length === 0) {
  usage(`emoji 不能为空`)
}

const projectRoot = resolve(process.cwd())
const srcPath = resolve(srcFile)
const objectName = (flags['object-name'] || biomeId).replace(/\s+/g, '_').toLowerCase()
if (!SPEC.naming.objectNamePattern.test(objectName)) {
  usage(`object_name "${objectName}" 不符合命名规范`)
}
const yOffset = flags['y-offset'] !== undefined ? parseFloat(flags['y-offset']) : 0
const dryRun = !!flags['dry-run']
const skipRegister = !!flags['no-register']
const profile = flags['profile'] || 'lowpoly'
const profileCfg = SPEC.profiles[profile]
if (!profileCfg) usage(`未知 profile "${profile}",可选: ${Object.keys(SPEC.profiles).join(', ')}`)

const targetDir = resolve(projectRoot, SPEC.naming.biomesRoot, biomeId)
const targetFile = join(targetDir, `${objectName}.glb`)
const tmpOptimized = join(projectRoot, `.asset-import-${biomeId}-${Date.now()}.glb`)

// ─── 主流程 ───────────────────────────────
console.log(`\n${C.bold}SYNAPSE 资产一键导入${C.reset} ${C.dim}(spec v${SPEC.version})${C.reset}`)
console.log(`${C.dim}─────────────────────────────────────────────${C.reset}`)
console.log(`  ${icon.step} 源文件:    ${C.cyan}${srcPath}${C.reset}`)
console.log(`  ${icon.step} biome_id:  ${C.cyan}${biomeId}${C.reset}`)
console.log(`  ${icon.step} 目标路径:  ${C.cyan}${targetFile}${C.reset}`)
if (dryRun) console.log(`  ${icon.info} ${C.yellow}DRY RUN — 不会实际修改任何文件${C.reset}`)

try {
  // ───────── Step 1/6: 验证源文件 ─────────
  console.log(`\n${C.bold}[1/6]${C.reset} 验证源文件 ${C.dim}(profile=${profile})${C.reset}`)
  const preCheck = await validateAsset(srcPath, { profile })
  if (preCheck.errors.length > 0) {
    // 源文件允许部分"会被优化流程修复"的错误
    const fixableByOptimize = [/文件大小/, /贴图.*尺寸/, /texture/i, /三角面数/]
    const blockers = preCheck.errors.filter(e => !fixableByOptimize.some(p => p.test(e)))
    if (blockers.length > 0) {
      console.log(`  ${icon.err} 源文件有无法自动修复的错误:`)
      for (const e of blockers) console.log(`    ${icon.err} ${e}`)
      console.log(`  ${C.dim}建议先跑: npm run asset:validate ${srcFile}${C.reset}`)
      process.exit(1)
    }
    console.log(`  ${icon.warn} 源文件有 ${preCheck.errors.length} 个错误,但预计 optimize 能修复`)
  } else {
    console.log(`  ${icon.ok} 源文件结构合法`)
  }
  const rawSize = preCheck.info.fileBytes
  const rawHeight = preCheck.info.dimensions?.height
  console.log(`     原始: ${fmtKB(rawSize)}, ${preCheck.info.triangles} 三角面, 高度 ${rawHeight?.toFixed(2)}m`)

  // ───────── Step 2/6: gltf-transform optimize ─────────
  console.log(`\n${C.bold}[2/6]${C.reset} gltf-transform 优化 ${C.dim}(${profile} 档)${C.reset}`)
  if (!dryRun) {
    execSync(
      `npx --yes @gltf-transform/cli optimize "${srcPath}" "${tmpOptimized}" ${profileCfg.optimizeFlags}`,
      { stdio: 'pipe' }
    )
    const newSize = statSync(tmpOptimized).size
    const delta = Math.round((1 - newSize / rawSize) * 100)
    console.log(`  ${icon.ok} ${fmtKB(rawSize)} → ${fmtKB(newSize)} (${delta >= 0 ? '-' : '+'}${Math.abs(delta)}%)`)
  } else {
    console.log(`  ${icon.info} ${C.dim}跳过(dry-run)${C.reset}`)
  }

  // ───────── Step 3/6: 验证优化产物 ─────────
  console.log(`\n${C.bold}[3/6]${C.reset} 验证优化产物`)
  let postCheck = preCheck
  if (!dryRun) {
    postCheck = await validateAsset(tmpOptimized, { profile })
    if (postCheck.errors.length > 0) {
      console.log(`  ${icon.err} 优化后仍有 ${postCheck.errors.length} 个错误:`)
      for (const e of postCheck.errors) console.log(`    ${icon.err} ${e}`)
      cleanupTmp()
      process.exit(1)
    }
    if (postCheck.warnings.length > 0) {
      console.log(`  ${icon.warn} ${postCheck.warnings.length} 个警告(非阻塞):`)
      for (const w of postCheck.warnings.slice(0, 3)) console.log(`    ${icon.warn} ${w}`)
    } else {
      console.log(`  ${icon.ok} 完美合规`)
    }
  } else {
    console.log(`  ${icon.info} ${C.dim}跳过(dry-run)${C.reset}`)
  }

  // ───────── Step 4/6: 计算 modelScale ─────────
  console.log(`\n${C.bold}[4/6]${C.reset} 计算 modelScale`)
  const height = postCheck.info.dimensions?.height || rawHeight || 2.0
  const modelScale = recommendScale(height)
  const visualHeight = (height * modelScale).toFixed(2)
  console.log(`  ${icon.ok} 原始高度 ${height.toFixed(2)}m × scale ${modelScale} = 视觉高度 ${visualHeight}m`)
  console.log(`     ${C.dim}(目标区间 ${SPEC.bbox.targetVisualHeight.min}~${SPEC.bbox.targetVisualHeight.max}m)${C.reset}`)

  // ───────── Step 5/6: 放置文件 ─────────
  console.log(`\n${C.bold}[5/6]${C.reset} 放置到 ${C.cyan}${SPEC.naming.biomesRoot}/${biomeId}/${C.reset}`)
  if (existsSync(targetFile)) {
    console.log(`  ${icon.warn} 目标文件已存在,将覆盖: ${targetFile}`)
  }
  if (!dryRun) {
    mkdirSync(targetDir, { recursive: true })
    cpSync(tmpOptimized, targetFile)
    console.log(`  ${icon.ok} 写入 ${targetFile} (${fmtKB(statSync(targetFile).size)})`)
    // 清理临时文件
    execSync(`rm -f "${tmpOptimized}"`)
  } else {
    console.log(`  ${icon.info} ${C.dim}跳过(dry-run)${C.reset}`)
  }

  // ───────── Step 6/6: 注册 Biome.ts ─────────
  console.log(`\n${C.bold}[6/6]${C.reset} 注册到 src/world/Biome.ts`)
  if (skipRegister) {
    console.log(`  ${icon.info} ${C.dim}跳过(--no-register)${C.reset}`)
    console.log(`\n${C.bold}${C.yellow}需要手动${C.reset} 在 Biome.ts 加入:`)
    console.log(generateBiomeEntry({ biomeId, label, color, modelUrl: urlOf(biomeId, objectName), modelScale, yOffset, emoji }))
  } else {
    const result = registerInBiomeTs({ biomeId, label, color, modelUrl: urlOf(biomeId, objectName), modelScale, yOffset, emoji, dryRun })
    if (result.alreadyExists) {
      console.log(`  ${icon.warn} BIOMES.${biomeId} 已存在,${dryRun ? '将' : '已'}替换`)
    } else {
      console.log(`  ${icon.ok} ${dryRun ? '将' : '已'}追加 BiomeId + BIOMES 条目`)
    }
  }

  // ─── 总结 ────
  console.log(`\n${C.dim}─────────────────────────────────────────────${C.reset}`)
  console.log(`${icon.ok} ${C.bold}${C.green}${dryRun ? '(dry-run) ' : ''}导入完成${C.reset}`)
  console.log(`  ${C.bold}${emoji} ${label}${C.reset} (${biomeId}) 已上线`)
  if (!dryRun) {
    console.log(`\n${C.bold}下一步:${C.reset}`)
    console.log(`  ${C.dim}1.${C.reset} ${C.cyan}npx tsc -b${C.reset}              类型检查`)
    console.log(`  ${C.dim}2.${C.reset} ${C.cyan}npm run dev${C.reset}             开发验证`)
    console.log(`  ${C.dim}3.${C.reset} 无痕窗口打开浏览器(避开 localStorage 缓存)`)
  }
} catch (e) {
  cleanupTmp()
  console.error(`\n${icon.err} ${C.red}${C.bold}失败${C.reset}: ${e.message}`)
  if (process.env.DEBUG) console.error(e.stack)
  process.exit(1)
}

function cleanupTmp() {
  try { execSync(`rm -f "${tmpOptimized}"`) } catch {}
}

function urlOf(biomeId, objectName) {
  return `/${SPEC.naming.biomesRoot.replace(/^public\//, '')}/${biomeId}/${objectName}.glb`
}

function generateBiomeEntry({ biomeId, label, color, modelUrl, modelScale, yOffset, emoji }) {
  const offsetPart = yOffset && yOffset !== 0 ? `, modelYOffset: ${yOffset}` : ''
  return `  ${biomeId}: { id: '${biomeId}', label: '${label}', color: '${color}', height: BASE_HEIGHT, modelUrl: '${modelUrl}', modelScale: ${modelScale}${offsetPart}, emoji: '${emoji}' },`
}

function registerInBiomeTs({ biomeId, label, color, modelUrl, modelScale, yOffset, emoji, dryRun }) {
  const biomeFile = resolve(projectRoot, 'src/world/Biome.ts')
  if (!existsSync(biomeFile)) {
    throw new Error(`找不到 ${biomeFile}`)
  }
  let content = readFileSync(biomeFile, 'utf8')

  // ① BiomeId union 类型追加 (若不存在)
  const idLineRe = new RegExp(`\\|\\s*['"\`]${biomeId}['"\`]`)
  const alreadyInType = idLineRe.test(content)
  if (!alreadyInType) {
    // 找到 BiomeId 类型的最后一个 `| 'xxx'` 行,在它后面追加
    const typeBlockMatch = content.match(/(export type BiomeId =[\s\S]*?)(\n\n|\nexport )/)
    if (!typeBlockMatch) {
      throw new Error('未找到 export type BiomeId 定义')
    }
    const block = typeBlockMatch[1]
    const newBlock = block.trimEnd() + `\n  | '${biomeId}'`
    content = content.replace(block, newBlock)
  }

  // ② BIOMES 字典追加 (若不存在)
  const dictKeyRe = new RegExp(`^\\s*${biomeId}:\\s*\\{`, 'm')
  const alreadyInDict = dictKeyRe.test(content)
  const entryLine = generateBiomeEntry({ biomeId, label, color, modelUrl, modelScale, yOffset, emoji })

  if (alreadyInDict) {
    // 替换已有行
    content = content.replace(/^\s*biome_id_placeholder:.*$/m, entryLine)
      .replace(new RegExp(`^\\s*${biomeId}:\\s*\\{[^\\n]*\\},?\\s*$`, 'm'), entryLine)
  } else {
    // 在 BIOMES = {...} 的结尾 `}` 前一行追加
    const dictMatch = content.match(/(export const BIOMES[\s\S]*?)(^\})/m)
    if (!dictMatch) {
      throw new Error('未找到 export const BIOMES 定义')
    }
    const dictBlock = dictMatch[1]
    // 在 block 末尾的最后一个 `,\n` 后追加新行
    const newDictBlock = dictBlock.trimEnd() + `\n${entryLine}\n`
    content = content.replace(dictBlock, newDictBlock)
  }

  if (!dryRun) {
    writeFileSync(biomeFile, content, 'utf8')
  }
  return { alreadyExists: alreadyInType && alreadyInDict }
}

function fmtKB(n) {
  if (n === undefined) return '?'
  return `${(n / 1024).toFixed(1)} KB`
}
