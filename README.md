# Synapse Prove

A 3D hexagonal world generator built with React 19, Three.js, and @react-three/fiber. Flip tiles to reveal biomes — each with procedural terrain features, dynamic weather, seasons, and reward cards on completion.

**Live demo**: https://synapse.exe.xyz/

---

## Features

- **9 biomes** — desert / glacier / mountain / plain / grassland / forest / beach / island / ocean — low-poly GLB models
- **Hex grid** with axial coordinates, 5 sizes (XS 7 tiles → XL 91 tiles)
- **Neighbor-gated exploration** — only tiles adjacent to explored ones can be flipped
- **Day / night cycle** with smooth lerp (0.4s), 3000-star night sky, moon + sun + fog
- **4 seasons** (spring / summer / autumn / winter) with color tint + weather particles (petals / leaves / snow)
- **Big-bang creation animation** — black → spark → explosion → shockwave → fade (2.2s)
- **Flip burst** (center flash + 8 radiating particles) + **reward card with foil shimmer** + **fireworks on completion**
- **5-tier reward system** — common (gray) / rare (blue) / epic (purple) / legendary (gold) / mythic (rainbow border)
- **PWA** — offline-capable, add to home screen, service worker precache
- **localStorage persistence** — pick up where you left off
- **Programmatic audio** (Web Audio API) — flip sound, reward sound, no external audio files
- **Bloom post-processing** — glow on fireworks and reward cards
- **Mobile-first responsive UI** with emoji-only buttons on small screens

---

## Stack

| Layer | Tech |
|:---|:---|
| UI | React 19.2 + TypeScript 5.5 strict |
| 3D | Three.js 0.170 + @react-three/fiber 9 + @react-three/drei 10 |
| Post-processing | @react-three/postprocessing (Bloom) |
| State | Zustand 5 + localStorage persistence |
| Build | Vite 6 + vite-plugin-pwa (workbox) |
| Test | Vitest 4 |

Vendor chunks split for long-term caching: `react-vendor` (194 KB) / `r3f-vendor` (320 KB) / `three-vendor` (688 KB).

Total download (gzipped): ~346 KB — cached by service worker on first visit.

---

## Architecture

```
src/
├── world/              # Render-agnostic pure TypeScript
│   ├── Biome.ts        # 9 biomes + season tints + color mixing
│   ├── HexGrid.ts      # axial coords + neighbors + grid generation
│   └── store.ts        # Zustand store + localStorage persistence
├── render-r3f/         # R3F rendering layer (swappable)
│   ├── WorldScene.tsx
│   ├── Environment.tsx # lights + fog + stars + sun/moon
│   ├── HexTile.tsx     # hexagonal prism + vertex color + ease-out-back flip animation
│   ├── BiomeObjects.tsx # GLB loader with Box3 auto base-alignment
│   ├── BiomeFeatures.tsx # code-generated terrain features (mountain cone, glacier crystals…)
│   ├── Clouds.tsx      # random-shape clouds with shadow-casting
│   ├── Fireworks.tsx   # rocket + spherical particle explosion
│   ├── SpawnBurst.tsx  # flip particle effect
│   └── Weather.tsx     # seasonal weather particles
├── ui/                 # React DOM UI layer
│   ├── App.tsx
│   ├── LoadingScreen.tsx   # useProgress-based asset loading
│   ├── ErrorBoundary.tsx
│   ├── CreationOverlay.tsx
│   ├── OverlayMessage.tsx
│   ├── RewardCard.tsx
│   └── index.css
├── sfx.ts              # Web Audio programmatic flip / reward sounds
├── storage.ts          # localStorage wrapper
└── main.tsx
```

**Discipline**: `world/` doesn't import `three` or `@react-three/*` — renderer is swappable.

---

## Development

```bash
npm install
npm run dev
# open http://localhost:5173
```

## Test

```bash
npx vitest run
```

17 unit tests on `src/world/HexGrid.ts` covering axial math, neighbors, grid generation.

## Build

```bash
npm run build
# output in dist/ — includes PWA manifest + service worker
```

## Deploy

A `deploy.sh` script is included for deploying to a Linux server with nginx. Adapt `REMOTE_HOST` etc. in the script for your setup.

```bash
./deploy.sh              # build + rsync + nginx verification
./deploy.sh --help
```

The script assumes:
- SSH key-based access
- nginx serving `/home/<user>/synapse/dist` via `sites-available/synapse`
- systemd for nginx management
- sudo-NOPASSWD for `nginx -t` and `loginctl enable-linger`

---

## GLB Assets

9 GLB models in `public/models/biomes/`, total ~750 KB optimized with `gltf-transform`.

All source models are CC0 from [Poly Pizza](https://poly.pizza) / [Quaternius](https://quaternius.com). The glacier biome uses a code-generated igloo (no GLB) to avoid a floating-mountain artifact in the original model.

To regenerate optimized GLBs from source:

```bash
brew install --cask blender
npm install -g @gltf-transform/cli

# 1. download CC0 GLBs into tools/raw/
# 2. Blender base normalization (see tools/split_oak.py as reference)
# 3. gltf-transform optimize input.glb output.glb --compress quantize --texture-compress webp --texture-size 512
```

---

## License

No license yet — all rights reserved.
