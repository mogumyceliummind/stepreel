# SCHEMA — 步驟清單與播放套件格式

錄製頁、轉檔、播放元件共用這份格式(`CLAUDE.md` §8)。格式改變時,和程式放同一個 PR 更新。不自動載入(D-0001)。

> **草案**(Claude 擬定,2026-11-27,有異議可改)。M1 實測後定版,定版前欄位可以改名、增減。

## 1. 播放套件(zip)

套件就是專案檔:可以直接放上網頁播放,也能拖回錄製頁繼續編輯(D-0009 第 2 點)。

```
<教學名稱>.zip
├─ manifest.json
└─ steps/
   ├─ 01-<id>.webm     或 .mp4,依 M1 實測選定
   ├─ 01-<id>.jpg      海報圖(影片載入前顯示)
   └─ …
```

- 檔名的序號只是方便看;順序以 `manifest.json` 的 `steps` 陣列為準,排序時不改檔名。
- `<id>` 是步驟建立時產生的短亂數,重錄時換新影片檔但 `id` 不變。

## 2. `manifest.json`

```json
{
  "format": "stepreel",
  "version": 1,
  "title": "新增聯絡人",
  "size": { "width": 1280, "height": 720 },
  "background": "#ffffff",
  "player": { "advanceAfterLoops": 2 },
  "steps": [
    {
      "id": "k3f9a2",
      "video": "steps/01-k3f9a2.webm",
      "poster": "steps/01-k3f9a2.jpg",
      "duration": 4.8,
      "trim": { "start": 0.6, "end": 4.1 },
      "crop": { "x": 120, "y": 80, "width": 1280, "height": 720 }
    }
  ]
}
```

| 欄位 | 必填 | 說明 |
|---|---|---|
| `format`、`version` | 是 | 固定 `"stepreel"`;`version` 是格式版本,讀到較新的版本時播放元件照常播、錄製頁提示可能遺失欄位 |
| `title` | 是 | 給錄製頁與檔名用;播放元件**不顯示**(D-0008 第 3 點) |
| `size` | 是 | 輸出尺寸,以第一步的框選為準;每步等比縮放後置中(D-0009 第 5 點) |
| `background` | 否 | 置中後四周的底色,預設白色 |
| `player.advanceAfterLoops` | 否 | 播完幾次自動到下一步;省略或 `0` 表示不自動前進(D-0009 第 3 點) |
| `steps[].id` | 是 | 見 §1 |
| `steps[].video`、`poster` | 是 / 否 | 相對於 `manifest.json` 的路徑 |
| `steps[].duration` | 是 | 影片長度(秒,修剪前) |
| `steps[].trim` | 否 | 修剪後的起訖(秒);省略表示整段。修剪不重新編碼(D-0009 第 5 點) |
| `steps[].crop` | 是 | 這一步在螢幕畫面上的框選範圍(像素)。`video` 是錄影時已經套用框選的畫面,播放與轉檔不再依 `crop` 裁切;`crop` 只用來重錄時沿用 |

步驟沒有文字欄位:不放標題、說明(D-0008 第 3 點)。步驟編號由陣列順序決定,不存。

## 3. 單一 MP4 與動圖的匯出選項

不寫進 manifest,每次匯出時選:要不要在角落燒步驟編號徽章(D-0009 第 4 點)。

## 4. 待 M1 確定

- 套件裡的影片格式(WebM VP9 / AV1,或 MP4 H.264)
- `trim` 在各瀏覽器用 `currentTime` 控制起訖是否夠準、循環時會不會閃
