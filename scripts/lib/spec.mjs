// SYNAPSE 3D 资产规范 — 所有检查/提示词/导入逻辑的单一真相源
// 修改规范只改这一处,validate / import / gen-prompt 会自动同步

/**
 * L0:3D AI 生成硬约束(这些数字会被注入 gen-prompt)
 *
 * 设计基准:六边形 HEX_RADIUS = 1m,相机 45° 俯视,Three.js Y-up +Z forward
 * 世界中一个物件应该"坐在"1m 半径的六边形上,视觉高度 ≈ 0.6~1.2m 最协调
 */
export const SPEC = {
  version: '1.0',

  // ─── 尺寸约束(单位:米) ────────────────────────────────
  // 注意:这里是"原始模型尺寸"的推荐值。最终视觉大小由 Biome.ts 的 modelScale 决定,
  // 所以原始模型超出也不是硬错误(只要比例正常,import 脚本会自动算 modelScale)
  bbox: {
    recommendedMaxWidth:  1.5,
    recommendedMaxHeight: 3.0,
    recommendedMaxDepth:  1.5,
    absoluteMaxHeight:    8.0,   // 超过这个说明一定有问题(比如忘了应用缩放)
    minHeight:            0.1,
    // 导入后的目标视觉高度(modelScale 自动调到这个范围中点)
    targetVisualHeight:   { min: 0.5, max: 1.3 },
  },

  // ─── Pivot 对齐(代码会自动修正小偏差,但大偏差应警告) ───
  pivot: {
    // 底面应该在 y=0 附近,偏差超过这个值说明 pivot 不在底部
    maxBottomOffset: 0.1,
    // X/Z 中心应该在 (0, 0) 附近(代码会自动居中,仅用于警告)
    maxHorizontalOffset: 0.5,
  },

  // ─── 拓扑复杂度 ────────────────────────────────────
  topology: {
    minTriangles: 50,      // 太简单没有低模的体积感
    maxTriangles: 3000,    // 太多影响性能(当前最复杂 pine 是 2950)
    maxMeshes: 5,          // 合并后的 mesh 数量
    maxNodeDepth: 3,       // 节点层级深度(根 + 直接子节点 + 孙节点)
  },

  // ─── 材质与贴图 ────────────────────────────────────
  materials: {
    maxTextureSize: 512,
    allowedTextureFormats: ['image/webp', 'image/png', 'image/jpeg'],
    preferredTextureFormat: 'image/webp',
    // 不允许的材质特性(会被 Lambert 光照忽略,徒增文件大小)
    forbidden: {
      transmission: true,   // 玻璃
      clearcoat: true,      // 清漆
      sheen: true,          // 光泽
      volume: true,
    },
  },

  // ─── 文件大小 ────────────────────────────────────
  fileSize: {
    maxOptimizedBytes: 250_000,   // 优化后单文件上限
    warnOptimizedBytes: 200_000,  // 警告阈值
  },

  // ─── 资产档位(profile) ───────────────────────────
  // 默认 lowpoly 走严格规范。hifi 档位放宽给贴图/真实感模型
  // (PWA workbox 单文件上限 5MB, 所以 2MB 仍然安全)
  profiles: {
    lowpoly: {  // 默认 — 匹配 Quaternius/Kenney 风格
      maxTriangles: 3000,
      maxTextureSize: 512,
      maxOptimizedBytes: 250_000,
      optimizeFlags: '--compress quantize --texture-compress webp --texture-size 512',
    },
    hifi: {     // 贴图树 / 真实感建筑 / 特殊细节
      maxTriangles: 80_000,
      maxTextureSize: 512,
      maxOptimizedBytes: 2_000_000,
      optimizeFlags: '--compress quantize --texture-compress webp --texture-size 512 --simplify true --simplify-error 0.005',
    },
  },

  // ─── 禁止的内容(会污染 Box3 自动对齐) ─────────────
  forbidden: {
    skeletons: true,    // 骨骼
    animations: true,   // 动画
    cameras: true,      // 相机
    lights: true,       // 灯光
  },

  // ─── 文件命名约定(L1) ──────────────────────────────
  naming: {
    // biome_id: snake_case, 3-20 字符
    biomeIdPattern: /^[a-z][a-z0-9_]{2,19}$/,
    // 物件文件名: snake_case
    objectNamePattern: /^[a-z][a-z0-9_]{0,31}$/,
    biomesRoot: 'public/models/biomes',
  },

  // ─── 数据契约(L2) — Biome.ts 必填字段 ──────────────
  biomeDef: {
    requiredFields: ['id', 'label', 'color', 'height', 'modelUrl', 'modelScale', 'emoji'],
    optionalFields: ['modelYOffset'],
    // 标准陆地高度,海洋用负值
    BASE_HEIGHT: 0.15,
  },
}

/** 给定模型实际高度(米),推荐 modelScale 让它视觉高度落在 targetVisualHeight 中点 */
export function recommendScale(rawHeightMeters) {
  const target = (SPEC.bbox.targetVisualHeight.min + SPEC.bbox.targetVisualHeight.max) / 2  // 0.9m
  return Math.round((target / rawHeightMeters) * 100) / 100
}

/** 终端颜色 */
export const C = {
  reset:  '\x1b[0m',
  bold:   '\x1b[1m',
  dim:    '\x1b[2m',
  red:    '\x1b[31m',
  green:  '\x1b[32m',
  yellow: '\x1b[33m',
  blue:   '\x1b[34m',
  cyan:   '\x1b[36m',
  gray:   '\x1b[90m',
}

/** 结果行打印 helper */
export const icon = {
  ok:   `${C.green}✓${C.reset}`,
  warn: `${C.yellow}⚠${C.reset}`,
  err:  `${C.red}✗${C.reset}`,
  step: `${C.blue}▸${C.reset}`,
  info: `${C.cyan}ℹ${C.reset}`,
}
