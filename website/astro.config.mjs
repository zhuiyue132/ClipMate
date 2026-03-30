import { defineConfig } from 'astro/config'
import sitemap from '@astrojs/sitemap'

export default defineConfig({
  site: 'https://zhuiyue132.github.io',
  base: '/ClipMate',
  integrations: [sitemap()]
})
