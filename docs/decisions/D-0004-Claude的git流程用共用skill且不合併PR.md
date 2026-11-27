# D-0004 Claude 的 git 流程用共用 skill;Claude 不合併 PR

| | |
|---|---|
| 狀態 | 提案(沿用範本,待專案成員確認) |
| 日期 | 2026-11-27(沿用範本) |
| 決定者 | 沿用工作流範本;本專案成員確認後改寫 |
| 範圍 | `.claude/skills/ship/`、`.claude/skills/after-merge/`、`.claude/settings.json`、`CLAUDE.md` §3 |
| 相關 | 否決 R-003 |

## 決定

1. **Claude 不合併 PR。** 合併一律由使用者執行。適用所有成員的 Claude,個人的 `CLAUDE.local.md` 不得放寬這一點。
2. 共用 skill `ship`:確認在功能分支、跑收尾審查、照 PR 範本寫標題與內容;沒有 gh 時詢問是否安裝(建議安裝);**詢問後**才由 Claude 用 gh push 功能分支並開 PR。個人已長期授權的(寫在 `CLAUDE.local.md`)免問。
3. 共用 skill `after-merge`:核對合併、切回主分支並更新、找出遠端已刪除或已合併的本機分支,列出後用 `git branch -d` 清理。不依賴個人的 `git gone` 別名。
4. 共用 skill 不含個人流程(工作紀錄、開場白、側欄整理)。個人收尾 skill 放在自己電腦的 `~/.claude/skills/`,**名稱不得與共用 skill 相同**,需要時先呼叫 `after-merge` 再做個人步驟。
5. 共用 `settings.json` 的 deny 加上 Claude 推主分支(`git push … main`、`HEAD:main`,含 `git -C` 形式)與 `gh pr merge`。
6. **`STATUS.md` 與交接檔在任務 PR 裡一次寫成合併後的狀態,不再另開狀態 PR。** `ship` 在 commit 前改寫(進行中移除、仍在等人的移到「已合併、仍在等人」),開 PR 後補上 PR 編號;`after-merge` 與個人收尾 skill 只核對、不開 PR。只改狀態記錄的變動留到下一個任務的 PR。
7. **`after-merge` 認得 git worktree。** 這段對話在另開的 worktree 時,不在裡面切主分支;切主分支、更新、刪分支都在主 repo 做。移除 worktree 只限:這個任務自己的 worktree,沒有已追蹤檔案的修改,分支的 commit 都已在遠端主分支;有沒進 git 或被忽略的檔案(會一起刪掉)時先列給使用者確認;別的任務的 worktree(例如佔著主分支的)一律先問使用者。worktree 只放功能分支,用完就移除。(Claude 擬定,有異議可改;起因見 `CONVENTIONS.md` §5「另開的 worktree 佔住 `main`」)

## 理由

- GitHub 免費方案的 private repo,主分支保護(ruleset)不會強制執行。每台電腦設 pre-push hook 要人人各設一次、新 clone 會忘,又能用 `--no-verify` 略過;改成進 git 的 skill 與 deny,`git pull` 就生效。
- skill 與 deny 只約束 Claude,人直接在終端機推主分支仍擋不到。這部分靠約定,或靠 GitHub 的分支保護(付費方案或 public repo 才會強制)。
- deny 以指令字串比對,換個寫法(例如在主分支上執行不帶參數的 `git push`、`gh api` 改 ref、`gh -R … pr merge`)就擋不到;所以它是誤操作的保險,規則本身仍以第 1 點與 `CLAUDE.md` §3 為準。
- 「每次詢問」與 `CLAUDE.md` §3「預設只 commit 不 push」一致:詢問得到同意,就是當次的授權。
- 共用與個人 skill 同名時,兩者會互相遮蔽(哪一個優先未查證);改用不同名稱,再由個人的 skill 呼叫共用的,兩邊都能更新而互不影響。
- 清理分支只用 `-d`:遇到未合併的內容會拒絕,不會誤刪工作。
- 第 6 點:每個任務合併後再開一個只改 `STATUS.md` 的狀態 PR,多一次 push、審核、合併,主分支上一半是狀態 commit。合併後的狀態在開 PR 時就寫得出來;PR 沒合併就關閉的情況少,由下一個 PR 改回即可。

## 否決的方案

| # | 方案 | 否決原因 | 重啟條件 |
|---|---|---|---|
| R-003 | 每台電腦設定本機 pre-push hook 擋直接推主分支| 每台、每個 clone 都要設定,容易漏;可用 `--no-verify` 略過;共用 skill 與 deny 已涵蓋 Claude 的部分 | 發生過人為直接推到主分支的事故 |

## 誰決定了哪一部分

- 沿用工作流範本。本專案確認時,在這裡寫上確認者與日期。

## 驗證

| 日期 | 方式 | 結果 |
|---|---|---|
| — | 新對話實際觸發 `ship`、`after-merge`;deny 實際攔下推主分支 | 未驗 |
