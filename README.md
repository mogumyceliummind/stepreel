# stepreel

在瀏覽器裡錄操作教學:框選螢幕的一塊範圍,一步錄一段無聲短片,輸出成

- **網頁播放套件**:步驟清單加每步一段影片,用播放元件放進任何網頁;
- **單一 MP4**:所有步驟接成一支,可以直接傳訊息、放進簡報;
- **動態 WebP / GIF**:給只收圖片的地方用。

不必安裝,錄製與轉檔都在瀏覽器裡做。支援桌機的 Chrome、Edge。

> 開發中。目前有錄製頁(首頁)、播放元件與試播頁(`player.html`);單一 MP4 與動圖匯出還沒做。

## 播放元件

把匯出的 zip 解壓後的資料夾放上網站,再放 `npm run build` 產生的 `dist/step-reel.js`:

```html
<script type="module" src="step-reel.js"></script>
<step-reel src="tutorial/manifest.json"></step-reel>
```

`advance-after-loops="2"` 可以覆寫套件的「播完幾次自動到下一步」(`0` 不自動前進)。其他屬性、事件與樣式見 `docs/decisions/D-0015-播放元件的介面與修剪播放.md`。

## 本機執行

需要 Node.js 與 npm。

```
npm install
npm run dev
```

用 Chrome 或 Edge 開 `http://localhost:5173`(錄製頁)、`http://localhost:5173/player.html`(試播頁)。型別檢查加建置用 `npm run check`。

## 開發文件

與 Claude Code 協作的工作流沿用 `claude-workflow-template`:給 Claude 的規則在 `CLAUDE.md`,給人看的在 `WORKFLOW.md`、`docs/ONBOARDING.md`,專案說明在 `PROJECT.md`,決策在 `docs/DECISIONS.md`。
