# D-0003 編輯後自動 lint 的 hook;同一問題修正兩次失敗就開新對話

| | |
|---|---|
| 狀態 | 提案(沿用範本,待專案成員確認;hook 依技術棧選用) |
| 日期 | 2026-11-27(沿用範本) |
| 決定者 | 沿用工作流範本;本專案成員確認後改寫 |
| 範圍 | `.claude/settings.json`、`.claude/hooks/`、`CLAUDE.md` §3 |
| 相關 | D-0002 |

## 決定

1. (選用)共用的 `.claude/settings.json` 加 PostToolUse hook:Claude 每次 `Edit`、`Write`、`MultiEdit` 之後執行 lint 腳本,自動修格式與可自動修的 lint 問題;修不掉的以結束代碼 2 回給 Claude 當場修;工具不存在時略過、不擋編輯。範例腳本在範本的 `optional/hooks/lint-on-edit.mjs`(前端 Prettier、ESLint,後端經容器跑 Ruff),依本專案的技術棧改寫後放進 `.claude/hooks/`。
2. 同一個問題修正兩次仍失敗,停下來把現況與試過的做法寫進交接檔,開新對話重來。

## 理由

- 格式與 lint 問題原本要等 CI 或審查員才發現,再回頭修一輪;編輯當下就修,少一輪來回。
- 用 node 寫腳本:Windows、macOS、Linux 都能跑;不經 shell,避免 Windows `.cmd` 的跳脫問題。
- 同一問題修兩次還錯,通常是上下文已經被錯誤的推論塞滿;開新對話、從文件重新開始較便宜。

## 否決的方案

(無)

## 誰決定了哪一部分

- 沿用工作流範本。本專案確認時,在這裡寫上確認者與日期,以及 hook 是否採用、用哪些工具。

## 驗證

| 日期 | 方式 | 結果 |
|---|---|---|
| — | 由 Claude Code 以 Write 工具實際觸發 hook | 未驗 |
