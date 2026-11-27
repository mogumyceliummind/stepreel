// 步驟清單格式的共用部分(docs/SCHEMA.md 版本 1,D-0012)。
// 錄製頁(package.ts)與播放元件(player.ts)都用;這裡不能引用 zip、轉檔等大的模組,播放元件要保持小。

export const FORMAT = 'stepreel';
export const VERSION = 1;

/** manifest.json 的大小上限(D-0013 第 5 點;播放元件也用) */
export const MANIFEST_MAX_BYTES = 1024 * 1024;

export interface Trim {
  start: number;
  end: number;
}

export const isNum = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);

/** docs/SCHEMA.md §3:只能是套件內的相對路徑 */
export function isPackagePath(p: unknown): p is string {
  if (typeof p !== 'string' || p === '') return false;
  if (p.startsWith('/') || p.includes('\\')) return false;
  if (/^[a-z][a-z0-9+.-]*:/i.test(p)) return false; // http:、data:、blob: 等
  // 不接受 ..、.、空的路徑段(// 開頭也在這裡擋掉)
  return !p.split('/').some((seg) => seg === '..' || seg === '.' || seg === '');
}

/** docs/SCHEMA.md §4:format 對、version 是正整數。不符合就丟出錯誤 */
export function checkFormat(m: Record<string, unknown>): number {
  if (m.format !== FORMAT || !isNum(m.version) || !Number.isInteger(m.version) || m.version < 1) {
    throw new Error('不是 stepreel 的套件(format 或 version 不對)');
  }
  return m.version;
}

/** trim 合規則(0 ≤ start < end ≤ duration)就回傳,否則 null */
export function readTrim(raw: unknown, duration: number): Trim | null {
  if (!raw || typeof raw !== 'object') return null;
  const t = raw as Record<string, unknown>;
  if (isNum(t.start) && isNum(t.end) && t.start >= 0 && t.start < t.end && t.end <= duration + 0.001) {
    return { start: t.start, end: Math.min(t.end, duration) };
  }
  return null;
}
