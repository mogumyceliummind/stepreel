// 未匯出步驟的 IndexedDB 暫存(D-0009 第 2 點、D-0014)。
//
// 暫存存的是套件的內容:一份步驟清單(docs/SCHEMA.md 版本 1,只是檔案路徑改成以步驟 id 為準)
// 加上每步的影片與海報 Blob。復原時走跟匯入 zip 一樣的驗證(fromManifest)。

import { fromManifest, toManifest, type ImportResult, type Manifest, type Project } from './package';

const DB_NAME = 'stepreel';
const DB_VERSION = 1;
const META = 'meta';
const BLOBS = 'blobs';
const META_KEY = 'draft';

/** 暫存格式的版本;和步驟清單的 version 分開(步驟清單的版本在 manifest 裡) */
export const DRAFT_VERSION = 1;

interface DraftRecord {
  kind: 'stepreel-draft';
  draftVersion: number;
  /** 毫秒 */
  savedAt: number;
  manifest: Manifest;
}

export interface DraftInfo {
  savedAt: number;
  steps: number;
  title: string;
  /** 暫存是比這一版程式新的格式,不能復原 */
  tooNew: boolean;
}

const videoKey = (id: string) => `${id}/video.mp4`;
const posterKey = (id: string) => `${id}/poster.jpg`;

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    // 只看 abort:request 的錯誤冒泡到 onerror 時 tx.error 可能還是 null,abort 時才有原因(例如 QuotaExceededError)
    tx.onabort = () => reject(tx.error ?? new Error('暫存的寫入被中止'));
  });
}

let dbPromise: Promise<IDBDatabase> | null = null;
function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      if (typeof indexedDB === 'undefined') return reject(new Error('這個瀏覽器不支援 IndexedDB'));
      const r = indexedDB.open(DB_NAME, DB_VERSION);
      r.onupgradeneeded = () => {
        const db = r.result;
        if (!db.objectStoreNames.contains(META)) db.createObjectStore(META);
        if (!db.objectStoreNames.contains(BLOBS)) db.createObjectStore(BLOBS);
      };
      r.onsuccess = () => {
        const db = r.result;
        // 別的分頁要升級資料庫時讓出來
        db.onversionchange = () => {
          db.close();
          dbPromise = null;
        };
        resolve(db);
      };
      r.onerror = () => reject(r.error);
      r.onblocked = () => reject(new Error('資料庫被其他分頁佔住'));
    });
    dbPromise.catch(() => (dbPromise = null));
  }
  return dbPromise;
}

/** 讀暫存的摘要(不讀影片) */
export async function peekDraft(): Promise<DraftInfo | null> {
  const db = await openDb();
  const rec = (await req(db.transaction(META).objectStore(META).get(META_KEY))) as DraftRecord | undefined;
  if (!rec || rec.kind !== 'stepreel-draft') return null;
  const m = rec.manifest as Partial<Manifest> | undefined;
  return {
    savedAt: typeof rec.savedAt === 'number' ? rec.savedAt : 0,
    steps: Array.isArray(m?.steps) ? m.steps.length : 0,
    title: typeof m?.title === 'string' ? m.title : '',
    tooNew: typeof rec.draftVersion !== 'number' || rec.draftVersion > DRAFT_VERSION,
  };
}

/**
 * 寫入暫存。只寫和上次不同的 Blob,步驟清單與 Blob 在同一個交易裡,不會只寫一半。
 * 呼叫端負責排隊(一次一個)。
 */
export class DraftWriter {
  /** 資料庫裡每個鍵目前存的是哪個 Blob */
  private written = new Map<string, Blob>();

  /** 復原後記下已經在資料庫裡的 Blob,下次寫入時不必重寫 */
  adopt(p: Project) {
    this.written.clear();
    for (const s of p.steps) {
      this.written.set(videoKey(s.id), s.video);
      if (s.poster) this.written.set(posterKey(s.id), s.poster);
    }
  }

  async save(p: Project): Promise<void> {
    const manifest = toManifest(p);
    const want = new Map<string, Blob>();
    p.steps.forEach((s, i) => {
      manifest.steps[i].video = videoKey(s.id);
      want.set(videoKey(s.id), s.video);
      if (s.poster) {
        manifest.steps[i].poster = posterKey(s.id);
        want.set(posterKey(s.id), s.poster);
      }
    });
    const rec: DraftRecord = { kind: 'stepreel-draft', draftVersion: DRAFT_VERSION, savedAt: Date.now(), manifest };

    const db = await openDb();
    const tx = db.transaction([META, BLOBS], 'readwrite');
    const finished = done(tx);
    try {
      const blobs = tx.objectStore(BLOBS);
      // 資料庫裡有、但這次用不到的(刪掉的步驟、上一次寫失敗留下的)都清掉
      const keys = (await req(blobs.getAllKeys())) as string[];
      for (const k of keys) if (!want.has(k)) blobs.delete(k);
      const have = new Set(keys);
      for (const [k, b] of want) if (!have.has(k) || this.written.get(k) !== b) blobs.put(b, k);
      tx.objectStore(META).put(rec, META_KEY);
    } catch (e) {
      // put 同步丟例外時交易不會自己 abort:整筆取消,不留下只寫一半的狀態
      try {
        tx.abort();
      } catch {
        // 已經結束
      }
      finished.catch(() => {});
      this.written.clear();
      throw e;
    }
    try {
      await finished;
    } catch (e) {
      // 寫失敗時不知道資料庫裡剩什麼,下次全部重寫
      this.written.clear();
      throw e;
    }
    this.written = want;
  }

  async clear(): Promise<void> {
    this.written.clear();
    const db = await openDb();
    const tx = db.transaction([META, BLOBS], 'readwrite');
    tx.objectStore(META).clear();
    tx.objectStore(BLOBS).clear();
    await done(tx);
  }
}

/** 讀出暫存並轉成專案;驗證和匯入 zip 相同 */
export async function loadDraft(): Promise<ImportResult | null> {
  const db = await openDb();
  const tx = db.transaction([META, BLOBS]);
  const rec = (await req(tx.objectStore(META).get(META_KEY))) as DraftRecord | undefined;
  if (!rec || rec.kind !== 'stepreel-draft') return null;
  if (typeof rec.draftVersion !== 'number' || rec.draftVersion > DRAFT_VERSION) {
    throw new Error('暫存是較新版本的格式,這一版不能復原');
  }
  const blobs = tx.objectStore(BLOBS);
  const keys = (await req(blobs.getAllKeys())) as string[];
  const files = new Map<string, Blob>();
  for (const k of keys) files.set(k, (await req(blobs.get(k))) as Blob);
  return fromManifest(rec.manifest, (path) => files.get(path) ?? null);
}

export function isQuotaError(e: unknown): boolean {
  return e instanceof DOMException && e.name === 'QuotaExceededError';
}
