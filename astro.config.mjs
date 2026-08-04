// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import netlify from '@astrojs/netlify';

// https://astro.build/config
export default defineConfig({
  site: 'https://lucasanna.art',
  trailingSlash: 'always',

  // Il sito resta statico: l'adapter serve solo alle rotte che dichiarano
  // `export const prerender = false`, attualmente /api/contatti.
  output: 'static',
  adapter: netlify(),

  redirects: {
    '/opere/opere': {
      status: 301,
      destination: '/opere/',
    },
  },

  vite: {
    plugins: [tailwindcss()],
  },
});
