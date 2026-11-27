import { defineConfig } from 'vite';

// 相對路徑,放在 GitHub Pages 的子路徑(/stepreel/)也能載入(D-0008 第 6 點)
// 首頁是錄製頁,m1.html 是 M1 實測頁(D-0013 第 4 點),player.html 是播放元件的試播頁(D-0015)
// 播放元件本身另外打包成 dist/step-reel.js(vite.player.config.ts)
export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    rolldownOptions: {
      input: { main: 'index.html', m1: 'm1.html', player: 'player.html' },
    },
  },
});
