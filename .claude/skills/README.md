# 專案共用 Skill

這個資料夾放**本專案所有成員共用**的 Claude Skill。放在這裡並 commit 之後,每個人 `git pull`,在 repo 內啟動 Claude Code 就會自動載入,不需要各自安裝。

## 目前的 Skill

| Skill | 用途 | 決策 |
|---|---|---|
| `ship` | 確認分支、收尾審查、照範本寫 PR,詢問後 gh push 並開 PR | D-0004 |
| `after-merge` | 合併後核對、移除這個任務另開的 worktree、主 repo 切回主分支、清理多餘的本機分支 | D-0004 |

個人收尾流程(例如工作紀錄)放 `~/.claude/skills/`,取別的名字,需要時先呼叫 `after-merge`。

## 規則

- **新增或修改 Skill 一律經 PR**,所有人的 Claude 才會讀到同一份。
- **只放這個專案用得到的 Skill。** 個人習慣用的 Skill 放自己電腦的 `~/.claude/skills/`,不進 repo。
- **`description` 要寫清楚觸發時機**,Claude 靠它判斷何時使用。
- **不放機密。** Skill 內容等同程式碼,會進 git 歷史。
- 專案 Skill 與個人 Skill 不要同名,會互相遮蔽。

## 使用範圍

| 使用方式 | 這個資料夾的 Skill 是否自動生效 |
|---|---|
| Claude Code(在 repo 內啟動) | 是 |
| Claude 聊天介面的 Project | 否;需各自把 Skill 打包後上傳 |
