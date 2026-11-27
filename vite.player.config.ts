import { defineConfig } from 'vite';

// 播放元件單獨打包成一個 ES module(dist/step-reel.js),任何網頁用 <script type="module"> 載入即可(D-0015)。
// 主建置(vite.config.ts)先清空 dist,這裡不清。
export default defineConfig({
  build: {
    target: 'es2022',
    outDir: 'dist',
    emptyOutDir: false,
    copyPublicDir: false,
    lib: {
      entry: 'src/player.ts',
      formats: ['es'],
      fileName: () => 'step-reel.js',
    },
  },
});
