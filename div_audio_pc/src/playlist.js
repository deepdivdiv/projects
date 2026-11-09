'use strict';
// 끌어다 놓거나 고른 파일과 폴더를 재생목록의 곡으로 바꾼다. 경로는 화면이 다루기 쉽도록 항상 슬래시로 쓴다.
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { extension, isAudio, isUnplayable, isZip, isEgg, stripExtension, naturalOrder, mapLimit } = require('./formats');
const tags = require('./tags');

const SKIP = new Set(['$recycle.bin', 'system volume information', 'node_modules']);
const PROBE_LIMIT = 6;
const slash = p => p.split('\\').join('/');
const clean = p => { const s = slash(p); return /^[A-Za-z]:\/?$/.test(s) ? `${s[0].toUpperCase()}:/` : s.replace(/\/+$/, ''); };
const hidden = name => name.startsWith('.') || SKIP.has(name.toLowerCase());
const fileUri = p => pathToFileURL(p).href;

function parentOf(p) {
  const cut = p.lastIndexOf('/');
  if (cut < 0 || /^[A-Za-z]:\/$/.test(p)) return '';
  return cut === 2 ? p.slice(0, 3) : p.slice(0, cut);
}
const placeOf = dir => (dir.endsWith(':/') ? dir.slice(0, 2) : path.posix.basename(dir));

/** 파일별 길이와 태그를 기억한다. 파일이 바뀌지 않았으면 다시 읽지 않는다. */
class ProbeCache {
  constructor(file) {
    this.file = file;
    this.items = new Map();
    this.timer = null;
    try {
      this.items = new Map(Object.entries(JSON.parse(fs.readFileSync(file, 'utf8'))));
    } catch { /* 처음 실행 */ }
  }

  scheduleSave() {
    if (this.timer) return;
    this.timer = setTimeout(() => { this.timer = null; this.save(); }, 3000);
    this.timer.unref();
  }

  save() {
    try {
      fs.writeFileSync(this.file, JSON.stringify(Object.fromEntries(this.items)));
    } catch { /* 다음 실행 때 다시 읽으면 된다 */ }
  }

  async get(file, stat) {
    const stamp = `${stat.size}|${Math.round(stat.mtimeMs)}`;
    const known = this.items.get(file);
    if (known && known.stamp === stamp) return known;
    let info;
    try {
      info = tags.summary(await tags.parseFile(file, false));
    } catch {
      info = { duration: 0, tag: '', artist: '', album: '', albumArtist: '', genre: '', year: 0, track: 0 };
    }
    const record = { ...info, stamp };
    this.items.set(file, record);
    this.scheduleSave();
    return record;
  }
}

class Collector {
  constructor({ zips, cache }) {
    this.zips = zips;
    this.cache = cache;
  }

  /** 폴더 아래의 파일을 이름순으로 모은다. 바로가기는 따라가지 않아 무한히 돌지 않는다. */
  async walk(dir, found) {
    const children = await fs.promises.readdir(dir, { withFileTypes: true }).catch(() => []);
    children.sort((a, b) => naturalOrder(a.name, b.name));
    for (const c of children) {
      if (hidden(c.name)) continue;
      const full = `${dir.replace(/\/$/, '')}/${c.name}`;
      if (c.isDirectory()) await this.walk(full, found);
      else if (c.isFile()) found.push(full);
    }
    return found;
  }

  async audioTrack(file) {
    const stat = await fs.promises.stat(file);
    const info = await this.cache.get(file, stat), dir = parentOf(file);
    return {
      uri: fileUri(file), title: stripExtension(path.posix.basename(file)), duration: info.duration,
      tag: info.tag, artist: info.artist, album: info.album, dir, place: placeOf(dir),
    };
  }

  async zipTracks(file) {
    const zip = await this.zips.open(file);
    return zip.tracks.map(t => ({ ...t, dir: zip.path, place: zip.name }));
  }

  /** 곡 목록과 함께, 뺀 파일의 종류별 개수와 열지 못한 이유를 돌려준다. */
  async collect(paths, onProgress) {
    const files = [], skipped = {}, errors = [];
    for (const input of [...paths].map(clean).sort(naturalOrder)) {
      const stat = await fs.promises.stat(input).catch(() => null);
      if (!stat) errors.push(`${path.posix.basename(input)}: 파일을 찾을 수 없습니다.`);
      else if (stat.isDirectory()) await this.walk(input, files);
      else files.push(input);
    }
    const wanted = files.filter(f => {
      if (isAudio(f) || isZip(f)) return true;
      if (isEgg(f) || isUnplayable(f)) { const kind = extension(f).toUpperCase(); skipped[kind] = (skipped[kind] || 0) + 1; }
      return false;
    });
    let done = 0;
    const groups = await mapLimit(wanted, PROBE_LIMIT, async file => {
      try {
        return isZip(file) ? await this.zipTracks(file) : [await this.audioTrack(file)];
      } catch (e) {
        errors.push(`${path.posix.basename(file)}: ${e.message}`);
        return [];
      } finally {
        if (onProgress && ++done % 20 === 0) onProgress(done, wanted.length);
      }
    });
    return { tracks: groups.flat(), skipped, errors };
  }
}

module.exports = { Collector, ProbeCache, clean, parentOf, fileUri };
