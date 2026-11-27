# stepreel

在瀏覽器裡錄操作教學:框選螢幕的一塊範圍,一步錄一段無聲短片,輸出成

- **網頁播放套件**:步驟清單加每步一段影片,用播放元件放進任何網頁;
- **單一 MP4**:所有步驟接成一支,可以直接傳訊息、放進簡報;
- **動態 WebP / GIF**:給只收圖片的地方用。

不必安裝,錄製與轉檔都在瀏覽器裡做。支援桌機的 Chrome、Edge。

> 開發中。目前只有 M1 格式實測頁:錄一段,比較各格式的大小與畫質。

## 本機執行

需要 Node.js 與 npm。

```
npm install
npm run dev
```

用 Chrome 或 Edge 開 `http://localhost:5173`。型別檢查加建置用 `npm run check`。

## 開發文件

與 Claude Code 協作的工作流沿用 `claude-workflow-template`:給 Claude 的規則在 `CLAUDE.md`,給人看的在 `WORKFLOW.md`、`docs/ONBOARDING.md`,專案說明在 `PROJECT.md`,決策在 `docs/DECISIONS.md`。
