# 選用元件

依技術棧決定是否採用。採用時搬到正式位置、改成本專案的指令,並在對應的決策檔記下(lint hook 見 D-0003)。這個資料夾本身可以在專案確定後刪除。

| 檔案 | 搬到 | 說明 |
|---|---|---|
| `hooks/lint-on-edit.mjs` | `.claude/hooks/` | Claude 編輯後自動跑 Prettier、ESLint(`frontend/`)與經容器的 Ruff(`backend/`)。目錄與工具不同時改腳本開頭的設定 |
| `github-workflows/security.yml` | `.github/workflows/` | npm audit、pip-audit(uv)、gitleaks。沒有前端或後端就刪掉那個 job |
| `dependabot.yml` | `.github/` | 依賴每週更新;依專案的套件管理器調整 `package-ecosystem` 與目錄 |

## 啟用 lint hook

把下面這段併進 `.claude/settings.json`:

```json
"hooks": {
  "PostToolUse": [
    {
      "matcher": "Edit|Write|MultiEdit",
      "hooks": [
        {
          "type": "command",
          "command": "node \"$CLAUDE_PROJECT_DIR/.claude/hooks/lint-on-edit.mjs\"",
          "timeout": 60
        }
      ]
    }
  ]
}
```
