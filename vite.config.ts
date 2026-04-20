// vitest/config 的 defineConfig 兼容 vite + 扩展 test 字段
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'SYNAPSE 世界生成器',
        short_name: 'SYNAPSE',
        description: '探索由你创造的六边形世界 — 9 种地貌、动态天气、奖励碎片收藏',
        theme_color: '#1a1a2e',
        background_color: '#1a1a2e',
        display: 'standalone',
        orientation: 'any',
        start_url: '/',
        scope: '/',
        lang: 'zh-CN',
        icons: [
          {
            src: '/icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,glb,woff2,ico,webmanifest}'],
        // GLB 较大,允许 5MB
        maximumFileSizeToCacheInBytes: 5_000_000,
      },
    }),
  ],
  server: {
    host: true,
    port: 5173,
    // allowedHosts: true 放开所有 Host 头校验
    // dev server 不应该暴露到不信任网络;沙箱/反向代理场景直接信任即可
    // 生产走 vite preview / nginx 都不读这个配置
    allowedHosts: true,
  },
  build: {
    // 拆 chunk 优化首屏加载 + 让 vendor 缓存命中
    // 用函数式 manualChunks 精准匹配 node_modules 路径
    // 注意顺序:@react-three 必须在 react 之前判断,否则会被 react-vendor 吃掉
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (!id.includes('node_modules')) return undefined
          if (id.includes('node_modules/three/')) return 'three-vendor'
          if (id.includes('node_modules/@react-three/')) return 'r3f-vendor'
          if (
            id.includes('node_modules/react/') ||
            id.includes('node_modules/react-dom/') ||
            id.includes('node_modules/scheduler/')
          ) return 'react-vendor'
          return undefined
        },
      },
    },
    // chunk 大小警告阈值改成 700KB(three-vendor 必然超过 500)
    chunkSizeWarningLimit: 700,
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
})
