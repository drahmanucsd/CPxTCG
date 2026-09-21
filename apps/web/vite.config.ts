import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import type { Plugin } from 'vite';

/** Serve the Vercel functions in `api/` during local dev. */
function apiDev(): Plugin {
  return {
    name: 'shed-api-dev',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/')) return next();
        const name = req.url.slice(5).split('?')[0]!;
        try {
          const mod = await server.ssrLoadModule(`/../../api/${name}.ts`);
          const out = { status: (code: number) => ({ json: (body: unknown) => { res.statusCode = code; res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(body)); } }) };
          await mod.default({ url: req.url, query: Object.fromEntries(new URL(req.url, 'http://x').searchParams) }, out);
        } catch (e) { res.statusCode = 500; res.end(String(e)); }
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  // make a root .env available to the api/ functions running in the dev middleware
  Object.assign(process.env, loadEnv(mode, new URL('../../', import.meta.url).pathname, ''));
  return {
    plugins: [
    react(),
    apiDev(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Shed — jazz piano practice',
        short_name: 'Shed',
        description: 'Voicings, progressions, tunes and backing tracks in one practice loop.',
        theme_color: '#0b0d10',
        background_color: '#0b0d10',
        display: 'standalone',
        orientation: 'any',
        icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
      },
      workbox: { globPatterns: ['**/*.{js,css,html,svg,woff2}'] },
    }),
  ],
    server: { port: 5173, host: true },
    build: { target: 'es2022' },
  };
});
