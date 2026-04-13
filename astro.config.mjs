// @ts-check
import { defineConfig } from 'astro/config';

import tailwindcss from '@tailwindcss/vite';

import sitemap from '@astrojs/sitemap';

// https://astro.build/config
export default defineConfig({
  site: 'https://lucasanna.art',
  redirects: {
    '/opere/opere': {
      status: 301,
      destination: '/opere/'
    }
  },
  vite: {
    plugins: [tailwindcss()]
  },

  integrations: [sitemap()]
});