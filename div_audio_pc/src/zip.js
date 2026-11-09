'use strict';
// ZIP을 풀지 않고 폴더처럼 다룬다. 앱 폴더에는 목록(meta.json)만 남겨 다음에는 바로 연다.
// 폰 앱과 같은 방식으로 id와 파일명을 만들기 때문에 같은 ZIP의 북마크가 이어진다.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
const { Readable, pipeline } = require('stream');
const iconv = require('iconv-lite');
const { isAudio, stripExtension, extension, naturalOrder } = require('./formats');

const END = 0x06054b50, END64_LOCATOR = 0x07064b50, END64 = 0x06064b50, CENTRAL = 0x02014b50, LOCAL = 0x04034b50;
const MAX_END_SEARCH = 22 + 65535;
const STORED = 0, DEFLATED = 8;
const FLAG_ENCRYPTED = 1, FLAG_UTF8 = 0x800;
const PATH_PREFIX = 'zip:';
const ENTRY_SCHEME = 'zipentry';

async function readAt(file, offset, length) {
  const buffer = Buffer.alloc(length);
  const { bytesRead } = await file.read(buffer, 0, length, offset);
  return bytesRead === length ? buffer : buffer.subarray(0, bytesRead);
}

/** 윈도우에서 만든 ZIP은 파일명이 CP949인 경우가 많다. */
function decodeName(bytes, utf8Flag) {
  if (utf8Flag) return bytes.toString('utf8');
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return iconv.decode(bytes, 'cp949');
  }
}

function zip64Values(extra, item) {
  for (let p = 0; p + 4 <= extra.length;) {
    const id = extra.readUInt16LE(p), size = extra.readUInt16LE(p + 2);
    if (id === 1) {
      let q = p + 4;
      const take = () => { const v = Number(extra.readBigUInt64LE(q)); q += 8; return v; };
      if (item.size === 0xffffffff) item.size = take();
      if (item.compressedSize === 0xffffffff) item.compressedSize = take();
      if (item.localOffset === 0xffffffff) item.localOffset = take();
      return;
    }
    p += 4 + size;
  }
}

async function readItems(file, fileSize) {
  const tailSize = Math.min(fileSize, MAX_END_SEARCH);
  const tail = await readAt(file, fileSize - tailSize, tailSize);
  let end = -1;
  for (let i = tail.length - 22; i >= 0; i--) {
    if (tail.readUInt32LE(i) === END) { end = i; break; }
  }
  if (end < 0) throw new Error('손상된 ZIP이거나 지원하지 않는 형식입니다.');
  let count = tail.readUInt16LE(end + 10);
  let dirSize = tail.readUInt32LE(end + 12);
  let dirOffset = tail.readUInt32LE(end + 16);
  if (end >= 20 && tail.readUInt32LE(end - 20) === END64_LOCATOR) {
    const at = Number(tail.readBigUInt64LE(end - 12));
    const record = await readAt(file, at, 56);
    if (record.length === 56 && record.readUInt32LE(0) === END64) {
      count = Number(record.readBigUInt64LE(32));
      dirSize = Number(record.readBigUInt64LE(40));
      dirOffset = Number(record.readBigUInt64LE(48));
    }
  }
  const dir = await readAt(file, dirOffset, dirSize);
  const items = [];
  let p = 0;
  for (let i = 0; i < count && p + 46 <= dir.length; i++) {
    if (dir.readUInt32LE(p) !== CENTRAL) throw new Error('손상된 ZIP이거나 지원하지 않는 형식입니다.');
    const flags = dir.readUInt16LE(p + 8);
    const nameLength = dir.readUInt16LE(p + 28), extraLength = dir.readUInt16LE(p + 30), commentLength = dir.readUInt16LE(p + 32);
    const name = decodeName(dir.subarray(p + 46, p + 46 + nameLength), flags & FLAG_UTF8);
    const item = {
      index: i, name, encrypted: !!(flags & FLAG_ENCRYPTED), directory: name.endsWith('/'),
      method: dir.readUInt16LE(p + 10), compressedSize: dir.readUInt32LE(p + 20), size: dir.readUInt32LE(p + 24),
      localOffset: dir.readUInt32LE(p + 42),
    };
    zip64Values(dir.subarray(p + 46 + nameLength, p + 46 + nameLength + extraLength), item);
    items.push(item);
    p += 46 + nameLength + extraLength + commentLength;
  }
  return items;
}

// 곡을 넘길 때마다 목차를 다시 읽지 않도록 최근 ZIP의 목차를 기억한다.
const directories = new Map();
async function itemsOf(zipPath) {
  const stat = await fs.promises.stat(zipPath);
  const key = `${zipPath}|${stat.size}|${stat.mtimeMs}`;
  if (directories.has(key)) return directories.get(key);
  const file = await fs.promises.open(zipPath, 'r');
  try {
    const items = await readItems(file, stat.size);
    if (directories.size >= 4) directories.delete(directories.keys().next().value);
    directories.set(key, items);
    return items;
  } finally {
    await file.close();
  }
}

async function dataOffset(zipPath, item) {
  const file = await fs.promises.open(zipPath, 'r');
  try {
    const head = await readAt(file, item.localOffset, 30);
    if (head.length < 30 || head.readUInt32LE(0) !== LOCAL) throw new Error('ZIP 안의 파일을 읽을 수 없습니다.');
    return item.localOffset + 30 + head.readUInt16LE(26) + head.readUInt16LE(28);
  } finally {
    await file.close();
  }
}

/** 압축된 항목은 앞에서부터 풀면서 필요한 구간만 넘긴다. */
async function* slice(source, start, end) {
  let at = 0;
  for await (const chunk of source) {
    const next = at + chunk.length;
    if (next > start) yield chunk.subarray(Math.max(0, start - at), Math.min(chunk.length, end + 1 - at));
    at = next;
    if (at > end) return;
  }
}

/** ZIP 안 항목의 start~end 구간(끝 포함)을 읽는다. */
async function entryStream(zipPath, item, start = 0, end = item.size - 1) {
  if (item.size === 0) return Readable.from([]);
  const offset = await dataOffset(zipPath, item);
  if (item.method === STORED) return fs.createReadStream(zipPath, { start: offset + start, end: offset + end });
  if (item.method !== DEFLATED) throw new Error('지원하지 않는 ZIP 압축 방식입니다.');
  const raw = fs.createReadStream(zipPath, { start: offset, end: offset + item.compressedSize - 1 });
  const inflate = zlib.createInflateRaw();
  pipeline(raw, inflate, () => {}); // 재생 중 곡을 넘기면 도중에 끊기는 것이 정상이다.
  return Readable.from(slice(inflate, start, end), { objectMode: false });
}

class ZipLibrary {
  /** root: 목록을 저장할 폴더. probeStream: 곡 길이를 재는 함수. */
  constructor(root, probeStream) {
    this.root = root;
    this.probeStream = probeStream;
  }

  static idOf(name, size) {
    return crypto.createHash('sha1').update(`${name}/${size}`).digest('hex').slice(0, 16);
  }

  dirFor(zipPath) {
    if (!zipPath.startsWith(PATH_PREFIX)) return null;
    const id = zipPath.slice(PATH_PREFIX.length);
    return /^[0-9a-f]+$/.test(id) ? path.join(this.root, id) : null;
  }

  async readMeta(dir) {
    return JSON.parse(await fs.promises.readFile(path.join(dir, 'meta.json'), 'utf8'));
  }

  async writeMeta(dir, meta) {
    await fs.promises.mkdir(dir, { recursive: true });
    await fs.promises.writeFile(path.join(dir, 'meta.json'), JSON.stringify(meta));
  }

  async scan(zipPath) {
    let items;
    try {
      items = await itemsOf(zipPath);
    } catch (e) {
      throw new Error('손상된 ZIP이거나 지원하지 않는 형식입니다.');
    }
    const entries = [];
    for (const item of items) {
      const source = item.name.replace(/\\/g, '/');
      if (item.directory || source.startsWith('__MACOSX/') || !isAudio(source)) continue;
      const base = source.slice(source.lastIndexOf('/') + 1);
      if (base.startsWith('._')) continue;
      if (item.encrypted) throw new Error('암호가 걸린 ZIP은 열 수 없습니다.');
      entries.push({
        source, base, item,
        file: `${String(entries.length).padStart(5, '0')}.${extension(base)}`,
        title: stripExtension(base), index: item.index,
      });
    }
    for (const e of entries) {
      const stream = await entryStream(zipPath, e.item);
      e.duration = await this.probeStream(stream, e.base, e.item.size).catch(() => 0);
      stream.destroy();
    }
    return entries.sort((a, b) => naturalOrder(a.source, b.source));
  }

  /** 처음 열 때만 목록을 만들고, 그 뒤로는 저장해 둔 목록으로 바로 연다. */
  async open(zipPath, onSlowOpen) {
    const stat = await fs.promises.stat(zipPath);
    const name = path.basename(zipPath);
    const id = ZipLibrary.idOf(name, stat.size);
    const dir = path.join(this.root, id);
    const meta = await this.readMeta(dir).catch(() => null);
    if (meta && meta.tracks.length) {
      if (meta.source !== zipPath) { // 파일을 옮겨도 계속 재생되게 한다.
        meta.source = zipPath;
        await this.writeMeta(dir, meta);
      }
      return this.load(PATH_PREFIX + id);
    }
    if (onSlowOpen) onSlowOpen();
    const entries = await this.scan(zipPath);
    if (!entries.length) throw new Error('ZIP 안에 재생할 수 있는 파일이 없습니다.');
    await this.writeMeta(dir, {
      name: name.replace(/\.zip$/i, ''), source: zipPath,
      tracks: entries.map(e => ({ file: e.file, title: e.title, index: e.index, duration: e.duration })),
    });
    return this.load(PATH_PREFIX + id);
  }

  async load(zipPath) {
    const dir = this.dirFor(zipPath);
    const meta = dir && await this.readMeta(dir).catch(() => null);
    if (!meta) throw new Error('ZIP을 찾을 수 없습니다.');
    return {
      path: zipPath, name: meta.name, source: meta.source,
      tracks: meta.tracks.map(t => ({ uri: `${ENTRY_SCHEME}://${path.basename(dir)}/${t.file}`, title: t.title, duration: t.duration })),
    };
  }

  /** zipentry://id/파일명 주소를 실제 ZIP 항목으로 찾는다. */
  async resolve(uri) {
    const m = /^zipentry:\/\/([0-9a-f]+)\/(.+)$/.exec(uri);
    if (!m) throw new Error('잘못된 ZIP 주소입니다.');
    const meta = await this.readMeta(path.join(this.root, m[1])).catch(() => null);
    const track = meta && meta.tracks.find(t => t.file === m[2]);
    if (!track) throw new Error('ZIP 안에서 파일을 찾을 수 없습니다.');
    const item = (await itemsOf(meta.source))[track.index];
    if (!item) throw new Error('ZIP 안에서 파일을 찾을 수 없습니다.');
    return { zipPath: meta.source, item, title: track.title, name: m[2] };
  }
}

module.exports = { ZipLibrary, entryStream, itemsOf, decodeName, PATH_PREFIX };
