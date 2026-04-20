# SYNAPSE 3D 资产规范 v1.0

> 给想给 SYNAPSE 添加新地貌的所有人 — 包括 AI 工具、Blender 作者、你自己。
> 规范的**单一真相源**在 `scripts/lib/spec.mjs`；本文档是它的人类可读版本。

---

## TL;DR — 三行速查

| 项 | 值 |
|---|---|
| 模型 | GLB 格式，**< 250 KB**，**< 3000 三角面**，Y-up，pivot 在底部中心 |
| 工作流 | `npm run prompt:gen` → AI 生成 → `npm run asset:validate` → `npm run asset:import` |
| 原则 | 数据驱动 — 加新地貌 = 改一条 `BIOMES` 配置，类型系统自动传导 |

---

## 为什么需要规范？

SYNAPSE 的渲染管线 (`src/render-r3f/BiomeObjects.tsx`) 对加载的 GLB 做了一套**自动预处理**：

1. 遍历所有 visible mesh，算 `Box3` 包围盒
2. 把模型底部对齐到 `y=0`（贴到六边形顶面）
3. 把 X/Z 中心对齐到 `(0, 0)`
4. 给所有 mesh 打上 `castShadow + receiveShadow`

这套机制对"干净的 GLB"完美工作，**但对带脏数据的 GLB 会出各种诡异问题**：

| 脏数据 | 症状 |
|---|---|
| 隐藏的 collision proxy | 模型飘在半空/埋进地里 |
| 骨骼 / 空 Empty 节点 | Box3 把不可见点算进去，对齐错位 |
| 1024×1024 贴图 | 文件 10 倍大、首屏加载慢 |
| 动画 / 相机 / 灯 | 白占空间，有时还会和场景灯冲突 |

规范就是为了**在资产进入仓库前把这些问题挡住**，而不是等你在浏览器里看到 bug 再反查。

---

## L0 — 3D AI 生成硬约束

### 模型尺寸

| 维度 | 限制 | 超限处理 |
|---|---|---|
| 宽度 (X) | 建议 ≤ 1.5m | warning — `modelScale` 会同步缩小 |
| 高度 (Y) | 建议 ≤ 3.0m（绝对上限 8.0m）| > 8m 一定是单位错了 — error |
| 深度 (Z) | 建议 ≤ 1.5m | warning |
| 最小高度 | ≥ 0.3m | < 0.3m 在六边形上看不见 |

> **关键洞察**：原始尺寸不等于视觉尺寸。import 脚本会根据实际高度自动算 `modelScale`，让最终视觉高度落到 **0.5~1.3m** 的黄金区间。所以你生成时"差不多在这个区间"就好，不用纠结精确。

### 拓扑复杂度

- **三角面数**：50 ~ 3000（超过 3000 报 error，当前最复杂的 pine 是 2950 面）
- **Mesh 数量**：≤ 5（超过建议在 Blender 里 `Ctrl+J` 合并）
- **节点深度**：≤ 3（超过建议 flatten hierarchy）

### 档位（profile） — 两套限值

| profile  | 风格 | 三角面 | 贴图尺寸 | 文件上限 | 适用 |
|---|---|---|---|---|---|
| `lowpoly`（默认） | Quaternius/Kenney | ≤ 3000 | ≤ 512 | ≤ 244 KB | AI 生成的低模、卡通风 |
| `hifi` | 贴图树 / 真实感 | ≤ 80 000 | ≤ 512 | ≤ 2 MB | 扫描 / Photoscan / 贴图树 |

命令行加 `--profile=hifi` 即可（PWA 单文件上限 5 MB，不影响离线缓存）。

```bash
npm run asset:validate -- tree.glb --profile=hifi
npm run asset:import   -- tree.glb my_woods 纹林 '#5B7A3E' 🌳 --profile=hifi
```

### 材质与贴图

- **允许**：无贴图（纯顶点色）、baseColor 贴图、Lambert/unlit 材质
- **禁止**：metallic/roughness/normal/emissive/transmission/clearcoat/sheen
  - 不是"生成时不能有"，而是"有也会被 Lambert 光照忽略，徒增文件体积"
- **贴图尺寸**：≤ 512×512，格式优先 webp

### Pivot 对齐

- 模型**底面**应在 `y=0`（偏差 ≤ 0.1m，Box3 会兜底）
- 模型**X/Z 中心**应在 `(0, 0)`（偏差 ≤ 0.5m，Box3 会兜底）

### 禁止的内容（会污染 Box3 自动对齐）

- ❌ 骨骼 / 蒙皮（Skin）
- ❌ 动画
- ❌ 相机 / 灯光
- ❌ 命名带 `_collider` / `_proxy` / `hidden` 的隐藏几何

---

## L1 — 文件命名与目录约定

```
public/models/biomes/<biome_id>/<object_name>.glb
```

- `biome_id`：`snake_case`，3~20 字符，只含 `a-z 0-9 _`
  - ✅ `volcano`, `crystal_cave`, `autumn_forest`
  - ❌ `Volcano`, `crystal-cave`, `秋林`
- `object_name`：默认与 `biome_id` 同名；同一地貌里有多个物件时用 `tree_1.glb` / `tree_2.glb` 等
- 一个地貌目前**只使用一个 GLB**（未来要支持多物件池需扩展 `Biome.ts`）

---

## L2 — 数据契约（Biome.ts）

每个地貌在 `src/world/Biome.ts` 的 `BIOMES` 字典里对应一条：

```ts
volcano: {
  id:           'volcano',                              // 必须和目录名一致
  label:        '火山',                                  // UI 显示名(中文 2-4 字)
  color:        '#8B2A1A',                              // tile 顶面色
  height:       BASE_HEIGHT,                            // 标准 0.15,海洋用 -0.20
  modelUrl:     '/models/biomes/volcano/volcano.glb',   // 绝对路径(public/ 打根)
  modelScale:   0.50,                                   // 见下方 scale 对照表
  modelYOffset: 0,                                      // 可选,漂浮物才填
  emoji:        '🌋',                                    // UI 图例
}
```

### modelScale 对照表

如果 AI 生成的模型原始高度是 X 米，`import` 脚本会推荐 `scale ≈ 0.9 / X`：

| 原始高度 | 建议 scale | 视觉高度 |
|---|---|---|
| 1.0m | 0.90 | 0.9m |
| 1.5m | 0.60 | 0.9m |
| 2.0m | 0.45 | 0.9m |
| 3.0m | 0.30 | 0.9m |
| 5.0m | 0.18 | 0.9m |

黄金视觉高度 ≈ **0.9m**，在 1m 半径六边形上最协调。

---

## 工具链

所有脚本在 `scripts/` 下，都读同一份规范 `scripts/lib/spec.mjs`。改规范只改这一处，脚本会自动同步。

### 工作流：添加一个新地貌

```bash
# 1. 生成提示词(可选,如果你自己会写就跳过)
npm run prompt:gen -- "stylized low-poly volcano with lava cracks" \
  --colors="#FF6B1A,#8B2A1A,#1a1a1a"

# 2. 把输出的英文提示词粘到 Meshy / Tripo / Rodin,生成 3D,下载 GLB

# 3. 验证 GLB 是否合规(强烈建议先跑)
npm run asset:validate ./downloaded_volcano.glb

# 4. 一键导入(优化 + 放置 + 改 Biome.ts)
npm run asset:import -- ./downloaded_volcano.glb volcano 火山 '#8B2A1A' 🌋

# 5. 开发验证
npm run dev
# 无痕窗口打开,避开旧的 localStorage 缓存
```

### 特殊工作流：把贴图/扫描模型转成 low-poly（风格统一）

如果你拿到一个 **photoscan / 贴图树 / 高精度模型**（通常 10+ MB），想把它降级成与项目其他 low-poly 资产一致的风格，用这个专用脚本：

```bash
# 输入:/home/user/uploaded_files/tree_texture.glb (33 MB, 898K 三角, 4 张 2048 贴图)
# 输出:texture_woods.glb (69 KB, 2775 三角, 0 贴图, 顶点色)

npm run asset:bake-lowpoly -- \
  /home/user/uploaded_files/tree_texture.glb \
  public/models/biomes/my_woods/my_woods.glb \
  --ratio=0.4
```

**它做什么**：
1. 按每个顶点的 UV 采样 `baseColorTexture` 烘焙成 `COLOR_0` 属性
2. 删掉所有贴图、法线图、金属粗糙度图
3. 材质换成 `baseColor=白 + metallic=0` — 顶点色主导，Three.js 自动映射为 `MeshStandardMaterial`
4. **"岛屿裁剪"**：分析连接图，保留前 80 个最大岛（树干/主枝），其他（大多是独立叶片 quads）按 4% 采样
5. 迭代 4 次 gltf-transform simplify（ratio 由小到大，error 由紧到松）
6. 最终 quantize + WebP

**运行时配合**：`BiomeObjects.tsx` 检测到 geometry 带 `COLOR_0` 时自动开启 `vertexColors=true` 和 `flatShading=true`，与现有 Kenney 风格一致。

压缩效果参考：**33.62 MB → 69 KB（−99.8%）**，视觉上保留树的整体剪影。

### 各命令详解

#### `npm run prompt:gen -- <主题> [--colors=...] [--biome-context=...]`

生成注入了规范数字的完整英文提示词。直接复制粘贴到 3D AI 工具。

#### `npm run asset:validate <file.glb>`

全方位检查 GLB：文件大小、三角面、骨骼、相机、灯、贴图、包围盒、pivot。

退出码：
- `0` = 通过（可能有 warning）
- `1` = 有 error，禁止导入
- `2` = 参数错误

#### `npm run asset:import -- <src> <biome_id> <label> <color> <emoji>`

六步流水线：
1. validate 源文件
2. `gltf-transform optimize`（quantize + webp + 512 贴图）
3. validate 优化产物（严格）
4. 根据实际高度算 `modelScale`
5. 写入 `public/models/biomes/<biome_id>/<biome_id>.glb`
6. 修改 `src/world/Biome.ts`：追加 `BiomeId` 成员 + `BIOMES` 条目

选项：
- `--dry-run`：只报告，不改文件
- `--no-register`：只放 GLB，不动 `Biome.ts`（自己手动改）
- `--object-name=NAME`：自定义 GLB 文件名
- `--y-offset=0.18`：漂浮物偏移

---

## FAQ

**Q：我用 AI 生成的模型三角面超了，怎么办？**
A：在 Blender 里加 Decimate 修饰器，Ratio 调到 0.5 就能降到一半。或者 `gltf-transform simplify input.glb output.glb --ratio 0.5`。

**Q：模型在浏览器里飘在空中怎么办？**
A：99% 是 GLB 里有隐藏的 collider/proxy mesh 污染了 Box3。用 `npm run asset:validate` 检查，或者 Blender 里打开 Outliner 找到名字怪异的节点删掉。

**Q：我想让同一个地貌随机出不同物件（比如"森林"有松树和橡树两种），怎么办？**
A：目前架构一个地貌只支持一个 GLB。要扩展需要改 `Biome.ts` 的 `modelUrl: string` 为 `modelUrls: string[]`，再改 `BiomeObjects.tsx` 按 tile 的 `seed` 随机挑。下版本计划支持。

**Q：我想用自己的颜色体系怎么办？**
A：`color` 是 tile 顶面色，代码会和顶点色相乘（`HexTile.tsx` 第 36-44 行）、再和季节色 tint 混合。建议选**饱和、偏暖或偏冷清晰**的色，灰度色会被季节 tint 吃掉。

**Q：我在生成提示词时用什么 3D AI 最好？**
A：

| 工具 | 优势 | 注意 |
|---|---|---|
| Meshy | 免费额度大，低模模式最贴近项目风格 | 默认输出带 PBR 贴图，记得在我们 pipeline 里会被剥掉 |
| Tripo AI | 速度快，图生 3D 质量高 | 免费用户水印 |
| Rodin | Stylized 模式强，贴近 Quaternius | 偶尔生成带骨骼，要 validate 卡掉 |
| Hunyuan3D（开源）| 免费本地跑 | 需要 GPU |

---

## 规范版本

`v1.0` — 初始版本（2026-04）

改规范请走 PR，并确保：
- `scripts/lib/spec.mjs` 先改
- 跑一遍 `npm run asset:validate` 打所有现有 GLB，确保不把已稳定的模型判错
- 本文档同步更新
