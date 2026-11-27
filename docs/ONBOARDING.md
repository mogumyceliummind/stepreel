# ONBOARDING — 成員加入與協作設定

給新加入的成員看:怎麼取得 repo、怎麼開始工作。工作模式本身見 `WORKFLOW.md`;給 Claude 的規則見 `CLAUDE.md`。

## 1. 一次性設定(repo 建立時做一次)

| 步驟 | 在哪裡 |
|---|---|
| repo `mogumyceliummind/stepreel` 已建立,**公開** | GitHub |
| 成員基本權限設為 Write | Organization > Settings > Member privileges |
| 主分支保護:必須經 PR、禁止刪除與 force push | repo > Settings > Rules > Rulesets。**免費方案的 private repo 只能建立、不會強制執行**;怎麼處理見 `STATUS.md` Q-3 |
| PR 合併後自動刪除遠端分支 | repo > Settings > General > Pull Requests > **Automatically delete head branches** |

## 2. 新成員加入

1. 接受 Organization 或 repo 邀請;GitHub 帳號開啟兩步驟驗證。
2. Clone repo。
3. 在 repo 根目錄建立 `CLAUDE.local.md`(不進 git),參考 `CLAUDE.local.md.example`:寫自己的名字、慣用命令列、個人授權,並匯入自己的交接檔(D-0001)。
4. 複製 `docs/handoff/_範本.md` 為 `docs/handoff/<自己的名字>.md`。
5. 安裝 GitHub CLI 並登入(`ship` 會用到;沒裝時 Claude 會詢問):
   - Windows:`winget install GitHub.cli`
   - macOS:`brew install gh`
   - 然後 `gh auth login`,在瀏覽器完成登入。
6. (選用)在自己的 claude.ai 帳號啟用 engineering 等外掛(`CLAUDE.md` §9)。

## 3. 開發環境

技術棧尚未定,定了再補。錄製頁只支援桌機的 Chrome、Edge(D-0008)。

## 4. 日常流程

1. 開工前更新主分支,在 `docs/STATUS.md` 進行中表格登記(誰、分支、項目)。
2. 一個任務一條分支(`feat/…`、`fix/…`、`docs/…`、`chore/…`)。
3. 實作;文件與程式改動放同一個分支。
4. 做完說「開 PR」:Claude 走 `ship`(審查、commit、詢問後 push 並開 PR)。
5. 由人審核、合併(Claude 不合併,D-0004)。
6. 合併後說「已合併」:Claude 走 `after-merge`(切回主分支、清理分支)。
7. 收尾:更新 `docs/STATUS.md`,覆寫自己的交接檔;下一個任務開新對話(D-0002)。

## 5. 同時使用 Claude 聊天介面的 Project

- 用 GitHub 整合把這個 repo 接進專案知識庫,**不要**手動另存一份文件。
- repo 更新後要在 Project 手動同步。Project 內的副本是唯讀快照,不一致時以 repo 為準。
- `.claude/skills/` 的 Skill 不會自動進到聊天介面,見 `.claude/skills/README.md`。
