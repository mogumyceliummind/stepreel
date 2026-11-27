---
name: after-merge
description: 本專案 PR 合併後的清理流程。使用者說「已合併」「merge 了」或輸入 /after-merge 時使用:核對 PR 已合併、移除這個任務另開的 worktree、主 repo 切回 main 並更新、找出已合併或遠端已刪除的本機功能分支並清理。個人有自己的收尾 skill 時,由那個 skill 先呼叫這一個。
---

# PR 合併後的清理(共用)

只做 git 的清理。工作紀錄、開場白這類個人流程不在這裡,放在各人自己電腦的 skill(D-0004)。

**誰執行指令:** 使用者的 `CLAUDE.local.md` 寫明由 Claude 自己執行的,Claude 直接跑;沒寫就給使用者可直接複製的指令,語法依對方慣用的命令列(`CLAUDE.md` §6)。下面以 `<repo>` 代表這段對話所在的資料夾(可能是另開的 worktree)、`<main>` 代表主 repo 的完整路徑。

## 1. 核對合併

- `gh pr view <PR 編號或分支> --json state,mergedAt,headRefName`。不知道是哪個 PR 就用目前分支名查。
- 不是 `MERGED`:停下回報,不做後面的步驟。若 PR 已關閉而未合併,提醒使用者:分支上寫好的合併後狀態與交接檔都沒進 `main`,交接檔作廢,要保留的內容併入下一個任務的 PR。
- 沒有 gh:請使用者確認 GitHub 上已合併後再繼續。

## 2. 認出主 repo 與 worktree

同一條分支只能在一個資料夾簽出。把另開的 worktree 切到 `main`,主 repo 就切不回 `main`,本機分支也只能用 `-D` 刪(`CONVENTIONS.md` §5「另開的 worktree 佔住 `main`」)。所以先分清楚:

- `git -C "<repo>" worktree list`:第一行是**主 repo**(一般 repo 都是;下面寫 `<main>`),其餘是另開的 worktree。清單的路徑是正斜線(`D:/…`),和反斜線的路徑比對前先統一。
- `<repo>` 是另開的 worktree 時(`git -C "<repo>" rev-parse --path-format=absolute --git-dir --git-common-dir` 印出的兩行不同):**不要在它裡面切 `main`**,照第 3 步移除它,後面的步驟都在 `<main>` 做。之後一律用 `git -C "<main>"` 與絕對路徑,不依賴目前所在的資料夾。
- 清單裡別的 worktree 簽出了 `main`(行尾 `[main]`):停下,列出那個資料夾、它有沒有未 commit 的修改與沒進 git 的檔案,問使用者要不要移除;**等使用者回覆前不做第 4 步以後**。同意了才照第 3 步移除。

## 3. 移除這個任務的 worktree(有另開時)

- `git -C "<worktree>" status --porcelain`:有已追蹤檔案的修改就**不移除**,回報。
- `git -C "<main>" fetch --prune` 後,`git -C "<main>" log --oneline origin/main..<分支>`:空的才移除(合併後遠端分支已刪,`status -sb` 看不出有沒有沒推的 commit,所以和 `origin/main` 比);不是空的就列出來問使用者(squash 合併也會不是空的)。
- `git -C "<worktree>" status --porcelain --ignored`:沒進 git 的檔案(`??`)與被忽略的檔案(`!!`,例如複製過去的 `CLAUDE.local.md`、`.env`)移除時會一起刪掉。有 `??` 時要加 `--force`;`!!` 不會擋,會直接被刪。兩者都列給使用者看(`node_modules` 這類可重建的只寫一行),確認不要了才移除。
- `git -C "<main>" worktree remove "<worktree>"`(有 `??` 時 `--force`)。
- 這段對話的工作目錄就是這個 worktree 時,先告訴使用者:移除後資料夾會留著一個空殼,要等這段對話(或占用它的終端機、開發伺服器)關掉後才能刪。
- 資料夾被占用時 Git for Windows 會回 `failed to delete … Permission denied`:實測內容與 git 的紀錄都已刪掉、分支也已釋放,只剩空資料夾。用 `git -C "<main>" worktree list` 確認它不在清單裡就繼續;回報那個空資料夾,請使用者關掉占用的程式後手動刪。仍在清單裡就停下回報,第 6 步不刪它簽出的分支。

## 4. 主 repo 切回 main 並更新

- 先 `git -C "<main>" status --porcelain`。有未 commit 的修改就**不切換**,回報。
- `git -C "<main>" switch main`
- `git -C "<main>" pull --ff-only`
- `git -C "<main>" fetch --prune`(清掉遠端已刪除分支的追蹤)

## 5. 找出多餘的功能分支

不依賴個人設定的 `git gone` 別名,直接查:

- `git -C "<main>" branch -vv`:追蹤欄位顯示 `: gone]` 的分支,代表遠端已刪除(GitHub 合併後自動刪)。
- `git -C "<main>" branch --merged main`:列出已合併進 `main` 的分支(排除 `main` 本身)。
- `git -C "<main>" branch -r`:遠端是否還留著已合併的功能分支。

## 6. 清理

- 把上一步找到的本機分支列給使用者看。
- 刪除用 `git -C "<main>" branch -d <分支>`。`-d` 遇到未合併的內容會拒絕;拒絕時先用 `gh pr view` 確認是 `MERGED`(squash 或 rebase 合併的分支,`-d` 也會拒絕),回報後**不改用 `-D`**,除非使用者明確同意。
- 遠端分支:Claude 不刪,列出來提醒使用者在 GitHub 上刪。
- 最後 `git -C "<main>" branch -a` 與 `git -C "<main>" worktree list`,確認只剩 `main` 與 `origin/main`、只剩主 repo 一個資料夾(或列出還留著的分支、worktree 與原因)。

## 7. 文件

不另開狀態 PR:`STATUS.md` 與交接檔已在任務 PR 裡寫成合併後的狀態(`ship` 第 3 步,D-0004 第 6 點)。只核對 `main` 上的 `STATUS.md` §2 沒有留下這個任務的進行中列、`STATUS.md`、`docs/PENDING.md` 與交接檔沒有殘留 `#待補`;有漏的,記下來在下一個任務的 PR 一起改,不單獨開 PR。

## 不做

不 push `main`、不合併 PR、不刪遠端分支、不 `git branch -D`、有未 commit 修改時不切換分支;不在另開的 worktree 裡切 `main`;不移除有已追蹤檔案修改的 worktree;沒問過使用者不移除別的任務的 worktree。
