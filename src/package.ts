// 播放套件:步驟清單與 zip 的轉換(docs/SCHEMA.md 版本 1,D-0012)。

import type { Rect } from './capture';
import { readZip, writeZip, type ZipEntry } from './zip';

export const FORMAT = 'stepreel';
export const VERSION = 1;

export interface Trim {
  start: number;
  end: number;
}

/** 編輯中的一步。影片已是 H.264 MP4(D-0011),海報是修剪後第一格的 JPEG。 */
export interface Step {
  id: string;
  video: Blob;
  poster: Blob | null;
  /** 修剪前的影片長度(秒) */
  duration: number;
  trim: Trim | null;
  scale: 1 | 2;
  crop: Rect;
}

export interface Project {
  title: string;
  background: string;
  /** 0 表示不自動前進 */
  advanceAfterLoops: number;
  steps: Step[];
}

export interface ManifestStep {
  id: string;
  video: string;
  poster?: string;
  duration: number;
  trim?: Trim;
  scale: 1 | 2;
  crop: Rect;
}

export interface Manifest {
  format: typeof FORMAT;
  version: number;
  title: string;
  size: { width: number; height: number };
  background?: string;
  player?: { advanceAfterLoops?: number };
  steps: ManifestStep[];
}

const ID_RE = /^[a-z0-9]{6}$/;

export function newId(taken: Iterable<string> = []): string {
  const used = new Set(taken);
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  for (;;) {
    const bytes = crypto.getRandomValues(new Uint8Array(6));
    const id = Array.from(bytes, (b) => chars[b % chars.length]).join('');
    if (!used.has(id)) return id;
  }
}

/** docs/SCHEMA.md §3:只能是套件內的相對路徑 */
export function isPackagePath(p: unknown): p is string {
  if (typeof p !== 'string' || p === '') return false;
  if (p.startsWith('/') || p.includes('\\')) return false;
  if (/^[a-z][a-z0-9+.-]*:/i.test(p)) return false; // http:、data:、blob: 等
  // 不接受 ..、.、空的路徑段(// 開頭也在這裡擋掉)
  return !p.split('/').some((seg) => seg === '..' || seg === '.' || seg === '');
}

/** 修剪起訖等於整段時不寫 trim */
export function normTrim(trim: Trim | null, duration: number): Trim | null {
  if (!trim) return null;
  const start = Math.max(0, Math.min(trim.start, duration));
  const end = Math.max(start, Math.min(trim.end, duration));
  if (end - start < 0.05) return null;
  if (start < 0.005 && duration - end < 0.005) return null;
  return { start: round3(start), end: round3(end) };
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;

const isNum = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);

/** 匯入時的上限(D-0013 第 5 點) */
export const IMPORT_LIMITS = {
  steps: 500,
  manifestBytes: 1024 * 1024,
  /** 框選的座標與寬高(像素) */
  pixels: 16384,
} as const;

/** 框選要是畫面內的整數;寬高往下取偶數(H.264 的要求)。不合理就回傳 null */
function toRect(r: unknown): Rect | null {
  if (!r || typeof r !== 'object') return null;
  const o = r as Record<string, unknown>;
  if (!isNum(o.x) || !isNum(o.y) || !isNum(o.width) || !isNum(o.height)) return null;
  const max = IMPORT_LIMITS.pixels;
  const x = Math.round(o.x);
  const y = Math.round(o.y);
  const width = Math.floor(o.width / 2) * 2;
  const height = Math.floor(o.height / 2) * 2;
  if (x < 0 || y < 0 || width < 2 || height < 2 || x + width > max || y + height > max) return null;
  return { x, y, width, height };
}

/** 輸出尺寸以第一步的框選為準(docs/SCHEMA.md §2) */
export function projectSize(p: Project): { width: number; height: number } {
  const c = p.steps[0]?.crop;
  return c ? { width: c.width, height: c.height } : { width: 0, height: 0 };
}

function fileBase(index: number, id: string): string {
  return `steps/${String(index + 1).padStart(2, '0')}-${id}`;
}

export function toManifest(p: Project): Manifest {
  const m: Manifest = {
    format: FORMAT,
    version: VERSION,
    title: p.title,
    size: projectSize(p),
    steps: p.steps.map((s, i) => {
      const base = fileBase(i, s.id);
      const step: ManifestStep = { id: s.id, video: `${base}.mp4`, duration: round3(s.duration), scale: s.scale, crop: { ...s.crop } };
      if (s.poster) step.poster = `${base}.jpg`;
      const trim = normTrim(s.trim, s.duration);
      if (trim) step.trim = trim;
      return step;
    }),
  };
  if (p.background && p.background.toLowerCase() !== '#ffffff') m.background = p.background;
  if (p.advanceAfterLoops > 0) m.player = { advanceAfterLoops: p.advanceAfterLoops };
  return m;
}

export async function exportZip(p: Project): Promise<Blob> {
  if (p.steps.length === 0) throw new Error('還沒有任何步驟');
  const m = toManifest(p);
  const entries: ZipEntry[] = [
    { name: 'manifest.json', data: new Blob([JSON.stringify(m, null, 2) + '\n'], { type: 'application/json' }) },
  ];
  p.steps.forEach((s, i) => {
    entries.push({ name: m.steps[i].video, data: s.video });
    if (s.poster && m.steps[i].poster) entries.push({ name: m.steps[i].poster!, data: s.poster });
  });
  return writeZip(entries);
}

/** 檔名用的教學名稱:去掉 Windows 不接受的字元 */
export function zipFileName(title: string): string {
  const clean = title.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').trim().replace(/[. ]+$/, '');
  return `${clean || 'stepreel'}.zip`;
}

export interface ImportResult {
  project: Project;
  /** 給使用者看的提示(略過的步驟、版本較新等) */
  notes: string[];
  /** 缺海報、要重新產生的步驟 id */
  needPoster: string[];
}

/** 讀 zip 套件。manifest.json 可以在根目錄,或在唯一的上層資料夾裡(D-0013 第 5 點)。 */
export async function importZip(zip: Blob): Promise<ImportResult> {
  const files = await readZip(zip);
  let base = '';
  if (!files.has('manifest.json')) {
    const candidates = [...files.keys()].filter((n) => /^[^/]+\/manifest\.json$/.test(n));
    if (candidates.length !== 1) throw new Error('zip 裡找不到 manifest.json');
    base = candidates[0].slice(0, -'manifest.json'.length);
  }
  const manifestFile = files.get(base + 'manifest.json')!;
  if (manifestFile.size > IMPORT_LIMITS.manifestBytes) throw new Error('manifest.json 太大');
  let raw: unknown;
  try {
    raw = JSON.parse(await (await manifestFile.read()).text());
  } catch (e) {
    if (e instanceof SyntaxError) throw new Error('manifest.json 不是有效的 JSON');
    throw e;
  }
  // 只解壓 manifest 引用到、路徑合規則的檔案(其他項目不解)
  const wanted = new Set<string>();
  const steps = raw && typeof raw === 'object' ? (raw as Record<string, unknown>).steps : undefined;
  if (Array.isArray(steps)) {
    if (steps.length > IMPORT_LIMITS.steps) throw new Error(`步驟太多(${steps.length} 步,上限 ${IMPORT_LIMITS.steps})`);
    for (const s of steps) {
      if (!s || typeof s !== 'object') continue;
      for (const key of ['video', 'poster'] as const) {
        const path = (s as Record<string, unknown>)[key];
        if (isPackagePath(path) && files.has(base + path)) wanted.add(path);
      }
    }
  }
  const blobs = new Map<string, Blob>();
  for (const path of wanted) blobs.set(path, await files.get(base + path)!.read());
  return fromManifest(raw, (path) => blobs.get(path) ?? null);
}

/** 驗證並轉成編輯中的專案。`file` 依套件內的相對路徑取檔。 */
export function fromManifest(raw: unknown, file: (path: string) => Blob | null): ImportResult {
  if (!raw || typeof raw !== 'object') throw new Error('不是 stepreel 的套件');
  const m = raw as Record<string, unknown>;
  if (m.format !== FORMAT || !isNum(m.version) || !Number.isInteger(m.version) || m.version < 1) {
    throw new Error('不是 stepreel 的套件(format 或 version 不對)');
  }
  const notes: string[] = [];
  if (m.version > VERSION) notes.push(`這份套件是較新的格式(版本 ${m.version}),存檔時可能遺失新版的欄位。`);

  const player = m.player && typeof m.player === 'object' ? (m.player as Record<string, unknown>) : {};
  const loops = isNum(player.advanceAfterLoops) && player.advanceAfterLoops > 0 ? Math.floor(player.advanceAfterLoops) : 0;
  const project: Project = {
    title: typeof m.title === 'string' && m.title.trim() ? m.title : '未命名教學',
    background: typeof m.background === 'string' && /^#[0-9a-f]{6}$/i.test(m.background) ? m.background : '#ffffff',
    advanceAfterLoops: loops,
    steps: [],
  };
  const needPoster: string[] = [];
  const steps = Array.isArray(m.steps) ? m.steps.slice(0, IMPORT_LIMITS.steps) : [];
  if (!Array.isArray(m.steps)) notes.push('manifest.json 沒有 steps。');

  steps.forEach((rawStep: unknown, i) => {
    const label = `第 ${i + 1} 步`;
    if (!rawStep || typeof rawStep !== 'object') return void notes.push(`${label}格式不對,沒有載入。`);
    const s = rawStep as Record<string, unknown>;
    if (!isPackagePath(s.video)) return void notes.push(`${label}的影片路徑不合規則,沒有載入。`);
    const video = file(s.video);
    if (!video) return void notes.push(`${label}的影片 ${s.video} 不在套件裡,沒有載入。`);
    if (!isNum(s.duration) || s.duration <= 0) return void notes.push(`${label}沒有有效的 duration,沒有載入。`);
    if (s.scale !== 1 && s.scale !== 2) return void notes.push(`${label}的 scale 不是 1 或 2,沒有載入。`);
    const crop = toRect(s.crop);
    if (!crop) return void notes.push(`${label}的 crop 不對,沒有載入。`);

    let id = typeof s.id === 'string' ? s.id : '';
    if (!ID_RE.test(id) || project.steps.some((p) => p.id === id)) {
      id = newId(project.steps.map((p) => p.id));
      notes.push(`${label}的 id 不合規則或重複,改成 ${id}。`);
    }
    let poster: Blob | null = null;
    if (s.poster !== undefined) {
      if (!isPackagePath(s.poster)) notes.push(`${label}的海報路徑不合規則,改用影片重新產生。`);
      else poster = file(s.poster);
    }
    if (!poster) needPoster.push(id);

    let trim: Trim | null = null;
    if (s.trim !== undefined) {
      const t = s.trim as Record<string, unknown> | null;
      if (t && isNum(t.start) && isNum(t.end) && t.start >= 0 && t.start < t.end && t.end <= s.duration + 0.001) {
        trim = normTrim({ start: t.start, end: t.end }, s.duration);
      } else notes.push(`${label}的 trim 不對,改成整段。`);
    }
    project.steps.push({
      id,
      video: video.type ? video : new Blob([video], { type: 'video/mp4' }),
      poster: poster && !poster.type ? new Blob([poster], { type: 'image/jpeg' }) : poster,
      duration: s.duration,
      trim,
      scale: s.scale,
      crop,
    });
  });
  return { project, notes, needPoster };
}
