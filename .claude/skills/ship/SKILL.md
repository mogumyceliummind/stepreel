---
name: ship
description: 本專案把改動送出成 PR 的流程。使用者說「開 PR」「送出」「ship」或輸入 /ship,或一個任務做完要交出去時使用:確認在功能分支、跑收尾審查、照範本寫 commit 與 PR,詢問後由 Claude 用 gh push 並開 PR。不合併 PR、不推 main。
---

# 送出 PR(共用)

規則本身在 `CLAUDE.md` §3、§5 與 D-0004;這裡只是步驟。依序執行,某步失敗就停下回報。

## 1. 確認分支

- 在 `main` 上有改動:先依任務建立功能分支再 commit。分支名 `<類型>/<簡短英文>`,類型同 Conventional Commits(`feat`、`fix`、`docs`、`chore`、`refactor`、`test`)。
- 已在功能分支:確認分支只含這個任務的改動。不是自己造成的未 commit 修改不 commit、不還原,回報(`CLAUDE.md` §3)。
- `STATUS.md` §2 進行中表格已登記這個任務;沒有就補登。這個登記只在功能分支上,供送出前自我追蹤;第 3 步會改寫成合併後的狀態。

## 2. 收尾審查

依 `CLAUDE.md` §5 的表決定跑哪個審查員,每個 PR 一次;處理意見後再往下。

## 3. Commit

- **`STATUS.md` 與交接檔在這個 PR 裡一次寫成「合併後」的狀態**,和改動一起 commit;合併後不再另開狀態 PR(D-0004 第 6 點):
  - `STATUS.md` §2 進行中:移除這個任務;合併後仍在等人的,移到 `docs/PENDING.md` §1「已合併、仍在等人」,PR 欄先寫 `#待補`(第 6 步「代勞」第 5 項補上編號)。`STATUS.md` §1、§5 與 `docs/PENDING.md` §2 照合併後的現況改寫,「最後更新」寫這個 PR。
  - 交接檔照各人的方式覆寫(停在哪裡、下一步、新對話開場),寫成合併後的樣子。
  - 合併前的實際階段(`已 commit`、`已 push`)不寫進 `STATUS.md`,PR 本身就是紀錄。
- 只改狀態記錄時,不必另開 PR,留到下一個任務的 PR 一起改。
- 只 `git add` 自己改的檔案。
- 訊息用 Conventional Commits,說明為什麼。

## 4. 確認 gh

- 執行 `gh --version`、`gh auth status`。
- 沒有 gh:問使用者是否安裝,**建議安裝**(Windows:`winget install GitHub.cli`;macOS:`brew install gh`)。使用者拒絕就跳到第 6 步的「不代勞」。
- 沒登入:請使用者自己執行 `gh auth login`,在瀏覽器完成登入。Claude 不代為輸入任何憑證。

## 5. 詢問是否代勞

問:「要由 Claude 透過 gh push 這條分支並開 PR 嗎?」
- 使用者回答同意:授權只對這一次有效,不延伸到下一個任務。
- 使用者的 `CLAUDE.local.md` 已寫明長期授權 push 與開 PR:不問,直接做。

## 6. Push 與開 PR

**代勞:**
1. `git -C "<repo>" push -u origin <功能分支>`。目標一律是功能分支,**絕不 push `main`**。
2. 標題:與 commit 相同的 Conventional Commits 格式,繁體中文。
3. 內容:照 `.github/pull_request_template.md` 的各節填寫,刪掉 HTML 註解;「審查」一節寫第 2 步的結果摘要;例外地單獨送出只改狀態記錄的 PR 時寫「略過審查」。
4. `gh pr create --base main --head <功能分支> --title "..." --body-file <暫存檔>`。內容用檔案傳,避免 shell 跳脫問題;暫存檔放在 repo 外(scratchpad 或系統暫存資料夾),以免被 `git add`。
5. `STATUS.md`、`docs/PENDING.md` 與交接檔裡的 `#待補`(`grep -rn "#待補" docs` 全部找出):改成實際 PR 編號,另一個 commit(`docs(STATUS): 補 PR 編號`)push 到同一條分支;這次 push 與第 1 點同一個授權。
6. 回報 PR 連結。

**不代勞:** 依 `CLAUDE.md` §6 給使用者可直接複製的 push 指令(用對方慣用的命令列語法),並附上寫好的 PR 標題與內容。`#待補` 先保留,使用者開好 PR 告知編號後,Claude 補一個 commit,請使用者再 push。

## 7. 收尾提醒

- **這個任務到此結束**(`CLAUDE.md` §3、D-0006):回報結尾附交接檔裡的新對話開場白(程式碼區塊,可直接複製),請使用者合併後開新對話做下一個任務;合併後的 `after-merge` 可在新對話開頭執行。
- 合併後不必再改 `STATUS.md`:第 3 步已寫成合併後的狀態。PR 若沒合併就關閉:`main` 的 `STATUS.md`、`PENDING.md` 不受影響,但交接檔與「仍在等人」的內容只在那條分支上;提醒使用者交接檔作廢,要保留的內容併入下一個任務的 PR 重寫。
- 提醒:合併由使用者執行;合併後說「已合併」,會走 `after-merge`(或個人的收尾 skill)。

## 不做

不合併 PR(`gh pr merge`)、不 push `main`、不 force push、不改分支保護設定。
