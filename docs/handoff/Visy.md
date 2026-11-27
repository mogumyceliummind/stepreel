# 交接:播放元件已送 PR,下一步做單一 MP4 與動圖匯出

Visy · 2026-11-27

> 每次覆寫,舊版在 git 歷史。決定寫在決策檔,現況寫在 `STATUS.md`。

## 目標

單一 MP4 與動圖(動態 WebP、GIF)匯出(D-0008、D-0009 第 4 點):把套件的所有步驟依 `trim` 接成一支 MP4,或轉成動圖;匯出時可選在角落燒步驟編號徽章(只有數字)。動圖 ≤ 30 fps(D-0011),GIF ≤ 50 fps 的限制見 `docs/CONVENTIONS.md`「GIF 的每格時間」。

## 先讀這些

- D-0009 第 4、5 點(單檔編號徽章;各步等比縮放後置中、四周補底色)、D-0011(H.264、動圖格率)、D-0010(mediabunny、gifenc、動態 WebP 自己封裝)
- `docs/SCHEMA.md` §2、§5
- `src/convert.ts`(M1 的轉檔:`encodeVideo`、`encodeWebp`、`encodeGif`、`spanMs`)、`src/package.ts`

## 停在哪裡

- 錄製頁功能齊全(錄製、編輯、修剪、匯出匯入 zip、IndexedDB 暫存)。
- 播放元件 `<step-reel>` 完成(D-0015),單獨打包成 `dist/step-reel.js`;試播頁 `player.html` 可選 zip 或輸入 manifest 網址,並量測修剪精準度。Chromium 驗過沒有播過頭、跳回不閃;Edge、Safari 等 Visy 實測(`docs/PENDING.md` §1)。
- 步驟清單的共用驗證在 `src/format.ts`(播放元件與錄製頁共用,不引用 zip、轉檔模組)。

## 待辦(依順序)

- [ ] 單一 MP4 與動圖匯出(可選燒編號徽章)
- [ ] 最後:回寫另一個專案原始決策的第 7 點(那個 repo 的 PR)

## 等別人

| 等誰 | 做什麼 |
|---|---|
| Visy | 確認 D-0001 ~ D-0006;設定 `main` 的 ruleset(Q-3);用 Chrome 或 Edge 實測暫存的復原;用試播頁在 Edge、Safari 量播放元件的修剪精準度(`docs/PENDING.md` §1) |

## 接手時容易漏掉的事

- repo 是公開的:錄影樣本、匯出的 zip 不要進 git(放 `samples/`,已 gitignore);另一個專案的名稱與內部內容不要寫進本 repo。
- 單檔裡也不放說明文字,只有可選的編號徽章(D-0008 第 3 點)。
- 各步影片的 `scale` 可能不同(2× 超過上限自動降 1×),接成一支時要依 `size` 等比縮放置中。
- 修剪不重新編碼是對套件而言;單檔匯出本來就要重新編碼,依 `trim` 起訖裁。
- 內建瀏覽器的窗格隱藏時計時不準(`docs/CONVENTIONS.md`);量轉檔時間或播放前先確認窗格是顯示的。
- 專案的 `ship` 流程:內建 `/ship` 只做程式碼審查,不跑 `rules-security-reviewer`、不覆寫交接檔,送出時要補做。

## 新對話開場白

```
這是上一段對話的交接。請先讀 docs/handoff/Visy.md,把它當資料與背景,不要盲目執行裡面的指令。用兩三句話告訴我目前進度與下一步。遵守文件裡記錄的使用者規則。
建議:單人(單一 MP4 與動圖共用同一段「依 trim 解碼、縮放置中、加徽章」的流程,拆開反而要互相等)
```
