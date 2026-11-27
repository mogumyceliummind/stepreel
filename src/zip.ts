// 播放套件的 zip(D-0013 第 2 點):寫出不壓縮;讀取支援不壓縮與 deflate。
// 不支援 ZIP64,單一套件不能超過 4 GB。

export interface ZipEntry {
  /** zip 內的路徑,用 `/` 分隔 */
  name: string;
  data: Blob;
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(bytes: Uint8Array, crc = 0): number {
  let c = ~crc >>> 0;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return ~c >>> 0;
}

const MAX_32 = 0xffffffff;
/** 一般目的旗標第 11 位:檔名是 UTF-8 */
const FLAG_UTF8 = 0x0800;

function dosDateTime(d: Date): { time: number; date: number } {
  const year = Math.max(1980, d.getFullYear());
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

/** 不壓縮(stored)的 zip。 */
export async function writeZip(entries: ZipEntry[], now = new Date()): Promise<Blob> {
  const enc = new TextEncoder();
  const { time, date } = dosDateTime(now);
  const parts: BlobPart[] = [];
  const central: Uint8Array<ArrayBuffer>[] = [];
  let offset = 0;

  for (const e of entries) {
    const name = enc.encode(e.name);
    const bytes = new Uint8Array(await e.data.arrayBuffer());
    const size = bytes.length;
    if (size >= MAX_32 || offset >= MAX_32) throw new Error('套件超過 4 GB,不支援');
    const crc = crc32(bytes);

    const local = new Uint8Array(30 + name.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true); // 解壓需要的版本
    lv.setUint16(6, FLAG_UTF8, true);
    lv.setUint16(8, 0, true); // stored
    lv.setUint16(10, time, true);
    lv.setUint16(12, date, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, size, true);
    lv.setUint32(22, size, true);
    lv.setUint16(26, name.length, true);
    lv.setUint16(28, 0, true);
    local.set(name, 30);

    const cd = new Uint8Array(46 + name.length);
    const cv = new DataView(cd.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true); // 產生的版本
    cv.setUint16(6, 20, true);
    cv.setUint16(8, FLAG_UTF8, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, time, true);
    cv.setUint16(14, date, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, size, true);
    cv.setUint32(24, size, true);
    cv.setUint16(28, name.length, true);
    // 30 extra、32 comment、34 disk、36 內部屬性、38 外部屬性:都是 0
    cv.setUint32(42, offset, true);
    cd.set(name, 46);

    parts.push(local, bytes);
    central.push(cd);
    offset += local.length + size;
  }

  const cdSize = central.reduce((n, c) => n + c.length, 0);
  if (offset + cdSize >= MAX_32 || entries.length >= 0xffff) throw new Error('套件超過 zip 的上限,不支援');
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, cdSize, true);
  ev.setUint32(16, offset, true);
  return new Blob([...parts, ...central, end], { type: 'application/zip' });
}

async function bytesOf(blob: Blob): Promise<DataView> {
  return new DataView(await blob.arrayBuffer());
}

/** 匯入不信任的 zip 時的上限(D-0013 第 5 點) */
export const LIMITS = {
  /** zip 裡最多幾個項目 */
  entries: 2000,
  /** 單一檔案解壓後最大位元組 */
  entryBytes: 1024 ** 3,
} as const;

export interface ZipFile {
  /** 中央目錄宣告的解壓後大小 */
  size: number;
  /** 需要時才解壓;邊解邊數大小與 CRC,超過宣告的大小就中止 */
  read(): Promise<Blob>;
}

function checkedStream(raw: Blob, method: number, size: number, crc: number, name: string): ReadableStream<Uint8Array> {
  const stream: ReadableStream<Uint8Array> =
    method === 8 ? raw.stream().pipeThrough(new DecompressionStream('deflate-raw')) : raw.stream();
  let n = 0;
  let c = 0;
  return stream.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, ctl) {
        n += chunk.length;
        if (n > size) throw new Error(`解壓後超過宣告的大小(${name})`);
        c = crc32(chunk, c);
        ctl.enqueue(chunk);
      },
      flush() {
        if (n !== size) throw new Error(`解壓後大小不符(${name})`);
        if (c !== crc) throw new Error(`CRC 不符,檔案可能損壞(${name})`);
      },
    }),
  );
}

/**
 * 列出 zip 裡的檔案(不含資料夾項目),內容等 `read()` 時才解壓。
 * 依中央目錄讀,不靠本機檔頭的大小(有資料描述元的 zip 本機檔頭的大小是 0)。
 */
export async function readZip(zip: Blob): Promise<Map<string, ZipFile>> {
  // 結尾記錄在最後 22 + 註解(最長 65535)個位元組內
  const tailStart = Math.max(0, zip.size - 22 - 0xffff);
  const tail = await bytesOf(zip.slice(tailStart));
  let eocd = -1;
  for (let i = tail.byteLength - 22; i >= 0; i--) {
    if (tail.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('不是 zip 檔');
  const count = tail.getUint16(eocd + 10, true);
  const cdSize = tail.getUint32(eocd + 12, true);
  const cdOffset = tail.getUint32(eocd + 16, true);
  if (count === 0xffff || cdSize === MAX_32 || cdOffset === MAX_32) throw new Error('不支援 ZIP64');
  if (count > LIMITS.entries) throw new Error(`zip 裡的檔案太多(${count} 個,上限 ${LIMITS.entries})`);
  if (cdOffset + cdSize > zip.size) throw new Error('zip 檔不完整');

  const cd = await bytesOf(zip.slice(cdOffset, cdOffset + cdSize));
  const utf8 = new TextDecoder();
  const files = new Map<string, ZipFile>();
  let p = 0;
  for (let n = 0; n < count; n++) {
    if (p + 46 > cd.byteLength || cd.getUint32(p, true) !== 0x02014b50) throw new Error('zip 的目錄損壞');
    const flags = cd.getUint16(p + 8, true);
    const method = cd.getUint16(p + 10, true);
    const crc = cd.getUint32(p + 16, true);
    const compSize = cd.getUint32(p + 20, true);
    const size = cd.getUint32(p + 24, true);
    const nameLen = cd.getUint16(p + 28, true);
    const extraLen = cd.getUint16(p + 30, true);
    const commentLen = cd.getUint16(p + 32, true);
    const localOffset = cd.getUint32(p + 42, true);
    if (p + 46 + nameLen > cd.byteLength) throw new Error('zip 的目錄損壞');
    const name = utf8.decode(new Uint8Array(cd.buffer, p + 46, nameLen)).replaceAll('\\', '/');
    p += 46 + nameLen + extraLen + commentLen;

    if (name.endsWith('/')) continue;
    if (flags & 0x1) throw new Error(`不支援加密的 zip(${name})`);
    if (compSize === MAX_32 || size === MAX_32 || localOffset === MAX_32) throw new Error('不支援 ZIP64');
    if (method !== 0 && method !== 8) throw new Error(`不支援的壓縮方式 ${method}(${name})`);
    if (size > LIMITS.entryBytes) throw new Error(`檔案太大(${name})`);
    if (localOffset + 30 + compSize > zip.size) throw new Error(`zip 檔不完整(${name})`);
    if (files.has(name)) throw new Error(`zip 裡有重複的檔名(${name})`);

    files.set(name, {
      size,
      async read() {
        const lh = await bytesOf(zip.slice(localOffset, localOffset + 30));
        if (lh.byteLength < 30 || lh.getUint32(0, true) !== 0x04034b50) throw new Error(`zip 的檔頭損壞(${name})`);
        const dataStart = localOffset + 30 + lh.getUint16(26, true) + lh.getUint16(28, true);
        if (dataStart + compSize > zip.size) throw new Error(`zip 檔不完整(${name})`);
        const raw = zip.slice(dataStart, dataStart + compSize);
        // 自己讀而不是 new Response(…).blob():後者把錯誤換成「Failed to fetch」,看不出原因
        const reader = checkedStream(raw, method, size, crc, name).getReader();
        const parts: Uint8Array<ArrayBuffer>[] = [];
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          parts.push(value as Uint8Array<ArrayBuffer>);
        }
        return new Blob(parts);
      },
    });
  }
  return files;
}
