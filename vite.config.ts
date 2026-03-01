import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron';
import path from 'path';

export default defineConfig({
  plugins: [
    react(),
    electron([
      {
        entry: 'electron/main/index.ts',
        onstart({ startup }) {
          console.log('[Electron Main] 编译完成，正在启动...');
          // 使用 startup() 而不是 reload()
          startup();
        },
        vite: {
          build: {
            outDir: 'dist-electron/main',
            rollupOptions: {
              external: ['electron']
            }
          }
        }
      },
      {
        entry: 'electron/preload/index.ts',
        onstart({ reload }) {
          console.log('[Electron Preload] 编译完成');
          reload();
        },
        vite: {
          build: {
            outDir: 'dist-electron/preload',
            rollupOptions: {
              external: ['electron']
            }
          }
        }
      }
    ])
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  },
  publicDir: 'public',
  server: {
    port: 5173,
    strictPort: true, // 如果端口被占用，则失败而不是尝试其他端口
  }
});
