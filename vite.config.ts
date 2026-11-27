import { defineConfig } from 'vite';

// 相對路徑,放在 GitHub Pages 的子路徑(/stepreel/)也能載入(D-0008 第 6 點)
export default defineConfig({
  base: './',
  build: { target: 'es2022' },
});
