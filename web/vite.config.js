import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');

// blueocean-core.jsx lives at the REPO ROOT, one level above this Vite project. Two consequences:
//  1. `fs.allow` must include the repo root or the dev server refuses to serve it.
//  2. On Vercel, "Include source files outside of the Root Directory" must be ON, or the file
//     simply isn't in the build context and the import fails to resolve.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@core': path.resolve(repoRoot, 'blueocean-core.jsx') },
  },
  server: {
    fs: { allow: [repoRoot] },
  },
  build: {
    outDir: 'dist',
    // One big component; the default 500kB warning would fire on every build for no reason.
    chunkSizeWarningLimit: 3000,
  },
});
