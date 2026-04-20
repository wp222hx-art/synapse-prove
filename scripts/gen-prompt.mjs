#!/usr/bin/env node
// gen-prompt.mjs — 生成给 3D AI(Meshy / Tripo / Rodin 等)的标准提示词
//
// 用法:
//   npm run prompt:gen -- <主题> [--colors="#hex1,#hex2"] [--biome-context=<参考地貌>]
//
// 示例:
//   npm run prompt:gen -- "stylized low-poly volcano with lava cracks"
//   npm run prompt:gen -- "cherry blossom tree" --colors="#FFB8D4,#4A2C1A"
//
// 输出:
//   直接打印可复制的完整提示词(英文),同时附中文翻译/字段说明方便你校对

import { SPEC, C, icon } from './lib/spec.mjs'

const args = process.argv.slice(2)
const flags = {}
const positional = []
for (const arg of args) {
  if (arg.startsWith('--')) {
    const [k, v] = arg.slice(2).split('=')
    flags[k] = v === undefined ? true : v
  } else {
    positional.push(arg)
  }
}

const subject = positional.join(' ').trim()
if (!subject) {
  console.log(`${icon.info} 用法:`)
  console.log(`  npm run prompt:gen -- <主题>\n`)
  console.log(`${C.bold}示例${C.reset}`)
  console.log(`  npm run prompt:gen -- "stylized low-poly volcano with lava cracks"`)
  console.log(`  npm run prompt:gen -- "cherry blossom tree" --colors="#FFB8D4,#4A2C1A"`)
  console.log(`\n${C.bold}参数${C.reset}`)
  console.log(`  ${C.dim}--colors${C.reset}          建议配色,逗号分隔 hex (例: "#FF6B1A,#8B2A1A")`)
  console.log(`  ${C.dim}--biome-context${C.reset}   该地貌在世界中的"情绪"描述(默认会根据主题推导)`)
  process.exit(0)
}

const colors = flags.colors
  ? flags.colors.split(',').map(s => s.trim()).filter(Boolean)
  : null

const biomeContext = flags['biome-context'] || inferBiomeContext(subject)

// ─── 组装提示词(核心:把 SPEC 中的数字注入) ─────────────────
const prompt = buildPrompt({
  subject,
  colors,
  biomeContext,
  // 从规范读取(单一真相源)
  maxWidth:       SPEC.bbox.recommendedMaxWidth,
  maxHeight:      SPEC.bbox.recommendedMaxHeight,
  maxDepth:       SPEC.bbox.recommendedMaxDepth,
  minTriangles:   SPEC.topology.minTriangles,
  maxTriangles:   SPEC.topology.maxTriangles,
  maxMeshes:      SPEC.topology.maxMeshes,
  maxTextureSize: SPEC.materials.maxTextureSize,
  maxFileKB:      Math.round(SPEC.fileSize.maxOptimizedBytes / 1024),
})

// ─── 输出 ────────────────────────────────────
console.log(`\n${C.bold}SYNAPSE 3D AI 提示词生成${C.reset} ${C.dim}(spec v${SPEC.version})${C.reset}`)
console.log(`${C.dim}─────────────────────────────────────────────${C.reset}`)
console.log(`  ${icon.step} 主题:    ${C.cyan}${subject}${C.reset}`)
if (colors) console.log(`  ${icon.step} 配色:    ${colors.map(c => `${c}`).join(' / ')}`)
console.log(`  ${icon.step} 情境:    ${biomeContext}`)

console.log(`\n${C.bold}${C.green}━━━ 复制下面这段给 Meshy / Tripo / Rodin ━━━${C.reset}\n`)
console.log(prompt)
console.log(`\n${C.bold}${C.green}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${C.reset}`)

console.log(`\n${C.bold}使用建议${C.reset}`)
console.log(`  ${icon.info} ${C.dim}Meshy${C.reset}:        粘到 "Text to 3D",选 "Stylized" 风格`)
console.log(`  ${icon.info} ${C.dim}Tripo${C.reset}:        粘到 prompt 框,选 "Low Poly" 或 "Stylized"`)
console.log(`  ${icon.info} ${C.dim}Rodin${C.reset}:        粘到 prompt,勾选 "Quality: Game-ready"`)
console.log(`  ${icon.info} 下载 GLB 后,跑:`)
console.log(`     ${C.cyan}npm run asset:validate <file.glb>${C.reset}`)
console.log(`     ${C.cyan}npm run asset:import -- <file.glb> <id> <label> <color> <emoji>${C.reset}\n`)

// ══════════════════════════════════════════════════════════════════

function buildPrompt({ subject, colors, biomeContext, maxWidth, maxHeight, maxDepth,
                       minTriangles, maxTriangles, maxMeshes, maxTextureSize, maxFileKB }) {
  const colorLine = colors && colors.length > 0
    ? `  - Saturated solid colors: ${colors.join(', ')}`
    : `  - Saturated solid colors, 2-4 distinct flat tones`

  return `Generate a 3D model optimized for the SYNAPSE hex-tile world generator.

SUBJECT
  ${subject}

HARD CONSTRAINTS (critical — these are non-negotiable):
  - Bounding box: under ${maxWidth}m wide × ${maxHeight}m tall × ${maxDepth}m deep
  - Base pivot: bottom of bounding box at Y=0, centered on X=0 Z=0
  - Coordinate system: Y-up, forward = +Z
  - Single mesh preferred (at most ${maxMeshes} meshes, merge if possible)
  - NO skeleton, NO rig, NO animation, NO camera, NO light
  - Triangle count: ${minTriangles} to ${maxTriangles}
  - Output format: GLB (binary glTF), final file under ${maxFileKB} KB
  - Textures: optional. If used, ≤ ${maxTextureSize}×${maxTextureSize}, baseColor only
  - NO metalness/roughness/normal/transmission/clearcoat/sheen maps
  - NO transparency, NO glass, NO emissive materials

ART STYLE
  - Low-poly, hard-edged, flat shading
  - Quaternius / Kenney.nl aesthetic
  - Chunky readable silhouette from isometric 45° view
${colorLine}

BIOME CONTEXT (for visual harmony with existing 9 biomes)
  ${biomeContext}
  - This object sits on top of a 1m-radius hexagonal tile
  - It coexists with: desert cactus, forest mushroom, plain windmill,
    ocean sailboat, beach palm, island lighthouse, mountain pine,
    glacier igloo, grassland oak, autumn-forest autumn-tree
  - Must NOT exceed the tile's visual footprint — stay compact

OUTPUT
  - GLB file, mesh-only, ready for Three.js
  - Pivot at base center (critical — auto-alignment relies on this)
  - No external dependencies
  - Must pass: npm run asset:validate`
}

function inferBiomeContext(subject) {
  const s = subject.toLowerCase()
  const hints = [
    [/volcano|lava|magma|crater/, 'Hot, dangerous, primordial — sits well next to desert and mountain.'],
    [/cherry|sakura|blossom|pink tree/, 'Gentle, romantic, seasonal — pairs with grassland and plain.'],
    [/swamp|marsh|bog/, 'Mysterious, damp, stagnant — extends the ocean/beach wetland spectrum.'],
    [/crystal|gem|mine/, 'Magical, shimmering — rare variant of mountain biome.'],
    [/ruin|monolith|stone.*circle/, 'Ancient, abandoned — echoes the loneliness of glacier.'],
    [/snow|winter|ice|frozen/, 'Cold, silent — neighbor to glacier.'],
    [/tent|camp|campfire/, 'Transient, human presence — contrasts natural biomes.'],
    [/mushroom.*house|fairy|magic/, 'Whimsical, storybook — the forest biome\'s cousin.'],
    [/desert|cactus|sand|dune/, 'Arid, sunlit — existing desert biome family.'],
  ]
  for (const [re, msg] of hints) {
    if (re.test(s)) return msg
  }
  return 'A standalone biome feature. Use readable silhouette and saturated color to make it instantly recognizable on a hex tile.'
}
