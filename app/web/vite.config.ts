import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@anyswap/client': path.resolve(__dirname, '../lib'),
    },
  },
  define: {
    global: 'globalThis',
  },
  optimizeDeps: {
    include: ['@solana/web3.js', 'buffer'],
  },
  server: {
    port: 5173,
    host: true,
    hmr: {
      overlay: true, // 启用错误覆盖层
    },
  },
  build: {
    target: 'esnext',
    commonjsOptions: {
      transformMixedEsModules: true,
    },
  },
  // 确保错误覆盖层显示
  clearScreen: false,
});

