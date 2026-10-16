import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Tailwind 4 不再需要 tailwind.config.js —— 插件读 src/index.css 里的 @theme。
// proxy 让前端 fetch('/api/chat') 直达 Express 代理（对应 ThoughtDAG 里
// "dev 默认指向 localhost:3001" 的约定，见 src/lib/constants.ts 的 API_BASE）。
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: { '/api': 'http://localhost:3001' },
  },
});
