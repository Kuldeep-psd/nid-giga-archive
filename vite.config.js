import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createArchiveHandler } from './server.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT) || 4173;

function archiveAssets() {
  const serveSourceAssets = createArchiveHandler({ rootDir: resolve(root, 'dist') });
  return {
    name: 'archive-original-assets',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const pathname = new URL(req.url, 'http://localhost').pathname;
        // Keep original artwork URLs stable without treating the 354 MB PDF
        // directory as Vite's publicDir or including those PDFs in deployments.
        if (/^\/(?:assets|data|downloads)(?:\/|$)/.test(pathname)) {
          return serveSourceAssets(req, res);
        }
        next();
      });
    },
  };
}

export default defineConfig({
  root,
  publicDir: false,
  plugins: [react(), archiveAssets()],
  server: { host: '127.0.0.1', port, strictPort: true },
  preview: { host: '127.0.0.1', port, strictPort: true },
  build: {
    outDir: 'build',
    emptyOutDir: false,
    manifest: true,
    assetsDir: 'app-assets',
  },
});
