import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import topLevelAwait from 'vite-plugin-top-level-await';
import wasm from 'vite-plugin-wasm';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), wasm(), topLevelAwait()],
  build: {
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html'),
        survivors: path.resolve(__dirname, 'play/survivors.html'),
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      starknet: path.resolve(
        __dirname,
        './node_modules/starknet/dist/index.mjs'
      ),
    },
  },
  esbuild: {
    tsconfigRaw: {
      compilerOptions: { target: 'ES2020' },
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5000,
  },
});
