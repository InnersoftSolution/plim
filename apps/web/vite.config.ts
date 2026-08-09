import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@plim/shared': fileURLToPath(new URL('../../packages/shared/src/index.ts', import.meta.url)),
    },
  },
  server: {
    // Porta fixa e dedicada do Plim (CityFurnace usa a 3000, api usa a 3334
    // em dev local para não colidir com a API do Nexlar na 3333).
    // strictPort: falha em vez de escorregar pra outra porta — evita confusão.
    port: 5180,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3334',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
});
