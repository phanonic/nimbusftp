import { defineConfig } from 'vite';

export default defineConfig({
  root: 'src/renderer',
  build: {
    outDir: '../../dist-ui',
    emptyOutDir: true,
  },
  server: {
    watch: { ignored: ['**/src-tauri/**'] },
  },
});
