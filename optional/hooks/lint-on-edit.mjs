// PostToolUse hook(D-0003):Claude 編輯檔案後自動格式化與 lint。
// - frontend/ 的 ts/tsx/js/jsx/mjs/css/json/md:Prettier --write,再 ESLint --fix(只對 js/ts 類)
// - backend/ 的 .py:經 Docker 容器的 Ruff(stdin 進、stdout 出,寫回本機檔案)
// 修不掉的問題以 exit 2 回給 Claude;工具不在時跳過,不擋編輯。
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";

const input = JSON.parse(readFileSync(0, "utf8") || "{}");
const filePath = input?.tool_input?.file_path;
if (!filePath || !existsSync(filePath)) process.exit(0);

const root = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();
const rel = path.relative(root, path.resolve(filePath)).split(path.sep).join("/");
const ext = path.extname(rel).toLowerCase();

function fail(msg) {
  process.stderr.write(msg.trim() + "\n");
  process.exit(2);
}

if (rel.startsWith("frontend/")) {
  const fe = path.join(root, "frontend");
  // 直接用 node 執行套件的進入點,不經 shell(Windows 的 .cmd 需要 shell,且參數不會跳脫)
  const bins = {
    prettier: path.join(fe, "node_modules", "prettier", "bin", "prettier.cjs"),
    eslint: path.join(fe, "node_modules", "eslint", "bin", "eslint.js"),
  };
  if (!existsSync(bins.prettier)) process.exit(0); // 尚未 npm install
  const target = path.resolve(filePath);
  const run = (n, args) =>
    spawnSync(process.execPath, [bins[n], ...args, target], { cwd: fe, encoding: "utf8" });
  const out = (r) => `${r.stdout ?? ""}${r.stderr ?? ""}${r.error ?? ""}`;
  if ([".ts", ".tsx", ".js", ".jsx", ".mjs", ".css", ".json", ".md", ".html"].includes(ext)) {
    const p = run("prettier", ["--write", "--ignore-unknown"]);
    if (p.status !== 0) fail(`Prettier 失敗:${rel}\n${out(p)}`);
  }
  if ([".ts", ".tsx", ".js", ".jsx", ".mjs"].includes(ext)) {
    const e = run("eslint", ["--fix", "--no-warn-ignored"]);
    if (e.status !== 0) fail(`ESLint 有修不掉的問題:${rel}\n${out(e)}`);
  }
  process.exit(0);
}

if (rel.startsWith("backend/") && ext === ".py") {
  // 容器沒有掛載原始碼,所以用 stdin/stdout;容器沒在跑就跳過
  const ps = spawnSync("docker", ["compose", "ps", "-q", "--status", "running", "backend"], {
    cwd: root,
    encoding: "utf8",
  });
  if (ps.status !== 0 || !ps.stdout.trim()) {
    process.stderr.write(`略過 Ruff(backend 容器未啟動):${rel}\n`);
    process.exit(0);
  }
  const name = rel.slice("backend/".length);
  const ruff = (args, src) =>
    spawnSync("docker", ["compose", "exec", "-T", "backend", "ruff", ...args, "--force-exclude", "--stdin-filename", name, "-"], {
      cwd: root,
      input: src,
      encoding: "utf8",
    });
  let src = readFileSync(filePath, "utf8");
  const fixed = ruff(["check", "--fix", "--quiet"], src);
  if (fixed.stdout) src = fixed.stdout;
  const fmt = ruff(["format", "--quiet"], src);
  if (fmt.status === 0 && fmt.stdout) src = fmt.stdout;
  writeFileSync(filePath, src);
  const check = ruff(["check", "--output-format", "concise"], src);
  if (check.status !== 0) fail(`Ruff 有修不掉的問題:${rel}\n${check.stdout}${check.stderr}`);
  process.exit(0);
}
