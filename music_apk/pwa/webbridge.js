// 웹앱(PWA) 버전의 재생 엔진. 아이폰 Safari에서 '홈 화면에 추가'로 설치해서 쓴다.
// 네이티브 MusicPlayer 플러그인과 같은 모양의 window.WebBridge를 만들고, bridge.js가 이걸 Bridge로 쓴다.
// 웹은 폰의 폴더를 직접 읽을 수 없어서, 고른 음원/ZIP을 IndexedDB에 저장해 두고 '내 음악'으로 보여 준다.
(function () {
  'use strict';
  const W = typeof window !== 'undefined' ? window : globalThis;
  if (W.Capacitor && W.Capacitor.isNativePlatform && W.Capacitor.isNativePlatform()) return;
  const hasDom = typeof document !== 'undefined';

  const VERSION = '1.8 (웹)';
  const ROOT_NAME = '내 음악';
  const AUDIO_EXT = ['mp3', 'm4a', 'm4b', 'aac', 'wav', 'flac', 'ogg', 'oga', 'opus', 'aif', 'aiff', 'caf', 'weba', 'mka', 'amr'];
  const BAD_EXT = ['wma', 'ape', 'mid', 'midi', 'ra', 'dsf', 'dff', 'wv', 'tta', 'ac3', 'dts'];
  const IMG_EXT = ['jpg', 'jpeg', 'png', 'webp'];
  const MIME = {
    mp3: 'audio/mpeg', m4a: 'audio/mp4', m4b: 'audio/mp4', aac: 'audio/aac', wav: 'audio/wav', flac: 'audio/flac',
    ogg: 'audio/ogg', oga: 'audio/ogg', opus: 'audio/ogg', aif: 'audio/aiff', aiff: 'audio/aiff', caf: 'audio/x-caf',
    weba: 'audio/webm', mka: 'audio/x-matroska', amr: 'audio/amr', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
  };
  const ext = n => { const s = n.slice(n.lastIndexOf('/') + 1), i = s.lastIndexOf('.'); return i > 0 ? s.slice(i + 1).toLowerCase() : ''; };
  const stripExt = n => { const i = n.lastIndexOf('.'); return i > 0 ? n.slice(0, i) : n; };
  const mimeOf = n => MIME[ext(n)] || '';
  const byName = (a, b) => a.localeCompare(b, 'ko', { numeric: true });
  const notFound = () => new Error('폴더를 찾을 수 없습니다.');

  // ---------------------------------------------------------------- 바이트 읽기
  async function bytes(blob, start, len) {
    start = Math.max(0, start);
    const end = Math.min(blob.size, start + len);
    if (end <= start) return new Uint8Array(0);
    return new Uint8Array(await blob.slice(start, end).arrayBuffer());
  }
  const u16 = (b, o) => b[o] | (b[o + 1] << 8);
  const u32 = (b, o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16)) + b[o + 3] * 16777216;
  const u64 = (b, o) => u32(b, o) + u32(b, o + 4) * 4294967296;
  const b32 = (b, o) => b[o] * 16777216 + ((b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]);
  const b64 = (b, o) => b32(b, o) * 4294967296 + b32(b, o + 4);
  const ascii = (b, o, n) => String.fromCharCode(...b.subarray(o, o + n));
  const syncsafe = (b, o) => (b[o] & 127) * 2097152 + (((b[o + 1] & 127) << 14) | ((b[o + 2] & 127) << 7) | (b[o + 3] & 127));
  function find(b, text, from = 0) {
    outer: for (let i = from; i + text.length <= b.length; i++) {
      for (let k = 0; k < text.length; k++) if (b[i + k] !== text.charCodeAt(k)) continue outer;
      return i;
    }
    return -1;
  }

  // 윈도우에서 만든 ZIP과 옛 MP3 태그는 한글이 CP949라서, UTF-8이 아니면 CP949로 읽는다.
  const strictUtf8 = new TextDecoder('utf-8', { fatal: true });
  const plainUtf8 = new TextDecoder('utf-8');
  let korean;
  try { korean = new TextDecoder('euc-kr'); } catch (e) { korean = plainUtf8; }
  function guessText(b) { try { return strictUtf8.decode(b); } catch (e) { return korean.decode(b); } }

  // ---------------------------------------------------------------- ZIP
  async function parseZip(blob) {
    const tailLen = Math.min(blob.size, 65557);
    const tail = await bytes(blob, blob.size - tailLen, tailLen);
    let e = -1;
    for (let i = tail.length - 22; i >= 0; i--) {
      if (tail[i] === 0x50 && tail[i + 1] === 0x4b && tail[i + 2] === 5 && tail[i + 3] === 6) { e = i; break; }
    }
    if (e < 0) throw new Error('ZIP 파일이 아니거나 손상되었습니다.');
    let count = u16(tail, e + 10), cdSize = u32(tail, e + 12), cdOff = u32(tail, e + 16);
    if (count === 0xffff || cdSize === 0xffffffff || cdOff === 0xffffffff) {
      const l = e - 20;
      if (l >= 0 && u32(tail, l) === 0x07064b50) {
        const z = await bytes(blob, u64(tail, l + 8), 56);
        if (u32(z, 0) === 0x06064b50) { count = u64(z, 32); cdSize = u64(z, 40); cdOff = u64(z, 48); }
      }
    }
    const cd = await bytes(blob, cdOff, cdSize);
    const entries = [];
    let p = 0;
    for (let k = 0; k < count && p + 46 <= cd.length; k++) {
      if (u32(cd, p) !== 0x02014b50) break;
      const flags = u16(cd, p + 8), method = u16(cd, p + 10);
      let comp = u32(cd, p + 20), size = u32(cd, p + 24), off = u32(cd, p + 42);
      const nl = u16(cd, p + 28), xl = u16(cd, p + 30), cl = u16(cd, p + 32);
      const raw = cd.subarray(p + 46, p + 46 + nl);
      const name = (flags & 0x800 ? plainUtf8.decode(raw) : guessText(raw)).replace(/\\/g, '/');
      for (let x = p + 46 + nl, xe = x + xl; x + 4 <= xe;) {
        const id = u16(cd, x), len = u16(cd, x + 2);
        if (id === 1) {
          let q = x + 4;
          if (size === 0xffffffff) { size = u64(cd, q); q += 8; }
          if (comp === 0xffffffff) { comp = u64(cd, q); q += 8; }
          if (off === 0xffffffff) off = u64(cd, q);
        }
        x += 4 + len;
      }
      p += 46 + nl + xl + cl;
      if (!name.endsWith('/')) entries.push({ path: name, size, comp, method, off, encrypted: !!(flags & 1) });
    }
    return entries;
  }
  async function zipEntryBlob(blob, en, type) {
    const h = await bytes(blob, en.off, 30);
    if (u32(h, 0) !== 0x04034b50) throw new Error('ZIP 안의 파일을 읽지 못했습니다.');
    const start = en.off + 30 + u16(h, 26) + u16(h, 28);
    const raw = blob.slice(start, start + en.comp, type);
    if (en.method === 0) return raw;
    if (en.method === 8) {
      const out = await new Response(raw.stream().pipeThrough(new DecompressionStream('deflate-raw'))).blob();
      return out.slice(0, out.size, type);
    }
    throw new Error('지원하지 않는 압축 방식입니다.');
  }

  // ---------------------------------------------------------------- 재생 시간 / 태그 / 앨범아트
  async function id3End(blob) {
    const h = await bytes(blob, 0, 10);
    return h.length === 10 && ascii(h, 0, 3) === 'ID3' ? 10 + syncsafe(h, 6) + (h[5] & 0x10 ? 10 : 0) : 0;
  }
  const MP3_BR = {
    V1L1: [0, 32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448],
    V1L2: [0, 32, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384],
    V1L3: [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320],
    V2L1: [0, 32, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224, 256],
    V2L23: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
  };
  const MP3_SR = [[44100, 48000, 32000], [22050, 24000, 16000], [11025, 12000, 8000]];
  async function mp3Duration(blob) {
    const start = await id3End(blob);
    const b = await bytes(blob, start, 131072);
    for (let i = 0; i + 4 <= b.length; i++) {
      if (b[i] !== 0xff || (b[i + 1] & 0xe0) !== 0xe0) continue;
      const ver = (b[i + 1] >> 3) & 3, layer = (b[i + 1] >> 1) & 3, bri = b[i + 2] >> 4, sri = (b[i + 2] >> 2) & 3;
      if (ver === 1 || layer === 0 || bri === 0 || bri === 15 || sri === 3) continue;
      const v1 = ver === 3, L = 4 - layer, sr = MP3_SR[v1 ? 0 : ver === 2 ? 1 : 2][sri];
      const kbps = (v1 ? (L === 1 ? MP3_BR.V1L1 : L === 2 ? MP3_BR.V1L2 : MP3_BR.V1L3) : (L === 1 ? MP3_BR.V2L1 : MP3_BR.V2L23))[bri];
      const spf = L === 1 ? 384 : L === 2 || v1 ? 1152 : 576;
      const pad = (b[i + 2] >> 1) & 1;
      const flen = L === 1 ? (Math.floor(12000 * kbps / sr) + pad) * 4 : Math.floor((L === 3 && !v1 ? 72000 : 144000) * kbps / sr) + pad;
      // 우연히 FF Ex 바이트가 나온 것이면 다음 프레임 자리에 동기 신호가 없다.
      if (i + flen + 2 <= b.length && !(b[i + flen] === 0xff && (b[i + flen + 1] & 0xe0) === 0xe0)) continue;
      const mono = (b[i + 3] >> 6) === 3;
      const x = i + 4 + (L === 3 ? (v1 ? (mono ? 17 : 32) : (mono ? 9 : 17)) : 0);
      const tag = ascii(b, x, 4);
      if ((tag === 'Xing' || tag === 'Info') && (b[x + 7] & 1)) return b32(b, x + 8) * spf / sr * 1000;
      if (ascii(b, i + 36, 4) === 'VBRI') return b32(b, i + 50) * spf / sr * 1000;
      const v1tag = blob.size > 128 && ascii(await bytes(blob, blob.size - 128, 3), 0, 3) === 'TAG' ? 128 : 0;
      return (blob.size - start - i - v1tag) * 8 / kbps;
    }
    return 0;
  }
  function utf16(d, be) {
    let o = 0;
    if (d[0] === 0xff && d[1] === 0xfe) { be = false; o = 2; } else if (d[0] === 0xfe && d[1] === 0xff) { be = true; o = 2; }
    return new TextDecoder(be ? 'utf-16be' : 'utf-16le').decode(d.subarray(o, o + ((d.length - o) & ~1)));
  }
  function id3Text(enc, d) {
    const s = enc === 1 || enc === 2 ? utf16(d, enc === 2) : enc === 3 ? plainUtf8.decode(d) : guessText(d);
    return s.split('\0').find(x => x.trim()) ? s.split('\0').find(x => x.trim()).trim() : '';
  }
  function skipTerm(d, p, enc) {
    if (enc === 1 || enc === 2) { while (p + 1 < d.length && (d[p] || d[p + 1])) p += 2; return p + 2; }
    while (p < d.length && d[p]) p++;
    return p + 1;
  }
  async function id3Tags(blob) {
    const h = await bytes(blob, 0, 10);
    if (h.length < 10 || ascii(h, 0, 3) !== 'ID3') return {};
    const ver = h[3], b = await bytes(blob, 10, syncsafe(h, 6));
    const MAP = { TIT2: 'title', TT2: 'title', TPE1: 'artist', TP1: 'artist', TALB: 'album', TAL: 'album', TPE2: 'albumArtist', TP2: 'albumArtist', TCON: 'genre', TCO: 'genre', TYER: 'year', TYE: 'year', TDRC: 'year', TRCK: 'track', TRK: 'track', TPOS: 'disc', TPA: 'disc', COMM: 'comment', COM: 'comment' };
    const idLen = ver === 2 ? 3 : 4, hdr = ver === 2 ? 6 : 10, tags = {};
    let p = h[5] & 0x40 && ver > 2 ? (ver === 4 ? syncsafe(b, 0) : b32(b, 0) + 4) : 0;
    while (p + hdr <= b.length) {
      const id = ascii(b, p, idLen);
      if (!/^[A-Z0-9]+$/.test(id)) break;
      const len = ver === 2 ? (b[p + 3] << 16) | (b[p + 4] << 8) | b[p + 5] : ver === 4 ? syncsafe(b, p + 4) : b32(b, p + 4);
      const d = b.subarray(p + hdr, p + hdr + len);
      p += hdr + len;
      if (!d.length) continue;
      const key = MAP[id];
      if (key && !tags[key]) {
        const enc = d[0];
        const t = id.startsWith('COM') ? id3Text(enc, d.subarray(skipTerm(d, 4, enc))) : id3Text(enc, d.subarray(1));
        if (t) tags[key] = key === 'genre' ? t.replace(/^\(\d+\)/, '') || t : t;
      } else if ((id === 'APIC' || id === 'PIC') && !tags.pic) {
        const enc = d[0];
        let q, mime;
        if (ver === 2) { mime = ascii(d, 1, 3).toLowerCase() === 'png' ? 'image/png' : 'image/jpeg'; q = 4; } else {
          const z = d.indexOf(0, 1);
          mime = ascii(d, 1, z - 1).toLowerCase() || 'image/jpeg';
          if (!mime.includes('/')) mime = 'image/' + (mime === 'jpg' ? 'jpeg' : mime);
          q = z + 1;
        }
        q = skipTerm(d, q + 1, enc);
        if (q < d.length) tags.pic = { mime, data: d.slice(q) };
      }
    }
    return tags;
  }
  function memBoxes(b, s, e) {
    const out = [];
    for (let p = s; p + 8 <= e;) {
      let size = b32(b, p), h = 8;
      if (size === 1) { size = b64(b, p + 8); h = 16; } else if (size === 0) size = e - p;
      if (size < h || p + size > e) break;
      out.push({ t: ascii(b, p + 4, 4), s: p + h, e: p + size });
      p += size;
    }
    return out;
  }
  async function mp4Info(blob) {
    let moov = null;
    for (let p = 0; p + 8 <= blob.size;) {
      const h = await bytes(blob, p, 16);
      let size = b32(h, 0), hdr = 8;
      if (size === 1) { size = b64(h, 8); hdr = 16; } else if (size === 0) size = blob.size - p;
      if (size < hdr) break;
      if (ascii(h, 4, 4) === 'moov') { moov = await bytes(blob, p + hdr, size - hdr); break; }
      p += size;
    }
    const tags = {};
    if (!moov) return { duration: 0, tags };
    const kids = (box, skip = 0) => memBoxes(moov, box.s + skip, box.e);
    const root = { s: 0, e: moov.length };
    const mvhd = kids(root).find(x => x.t === 'mvhd');
    let duration = 0;
    if (mvhd) duration = moov[mvhd.s] === 1 ? b64(moov, mvhd.s + 24) / b32(moov, mvhd.s + 20) : b32(moov, mvhd.s + 16) / b32(moov, mvhd.s + 12);
    const udta = kids(root).find(x => x.t === 'udta');
    const meta = udta && kids(udta).find(x => x.t === 'meta');
    const ilst = meta && (kids(meta, 4).find(x => x.t === 'ilst') || kids(meta).find(x => x.t === 'ilst'));
    const KEYS = { '\xa9nam': 'title', '\xa9ART': 'artist', '\xa9alb': 'album', aART: 'albumArtist', '\xa9gen': 'genre', '\xa9day': 'year', '\xa9cmt': 'comment' };
    if (ilst) {
      for (const it of kids(ilst)) {
        const d = kids(it).find(x => x.t === 'data');
        if (!d) continue;
        const v = moov.subarray(d.s + 8, d.e), kind = b32(moov, d.s) & 0xffffff;
        if (KEYS[it.t]) tags[KEYS[it.t]] = plainUtf8.decode(v).trim();
        else if (it.t === 'trkn' && v.length >= 4) { const n = (v[2] << 8) | v[3], of = v.length >= 6 ? (v[4] << 8) | v[5] : 0; if (n) tags.track = n + (of ? '/' + of : ''); }
        else if (it.t === 'covr' && !tags.pic) tags.pic = { mime: kind === 14 ? 'image/png' : 'image/jpeg', data: v.slice() };
      }
    }
    return { duration: duration * 1000, tags };
  }
  function vorbisComments(b, tags) {
    const MAP = { TITLE: 'title', ARTIST: 'artist', ALBUM: 'album', ALBUMARTIST: 'albumArtist', GENRE: 'genre', DATE: 'year', TRACKNUMBER: 'track', DISCNUMBER: 'disc', COMMENT: 'comment', DESCRIPTION: 'comment' };
    let o = 4 + u32(b, 0);
    const n = u32(b, o); o += 4;
    for (let i = 0; i < n && o + 4 <= b.length; i++) {
      const l = u32(b, o), s = plainUtf8.decode(b.subarray(o + 4, o + 4 + l)), k = s.indexOf('=');
      o += 4 + l;
      const key = k > 0 && MAP[s.slice(0, k).toUpperCase()];
      if (key && !tags[key]) tags[key] = s.slice(k + 1).trim();
    }
  }
  async function flacInfo(blob) {
    let p = (await id3End(blob)) + 4, duration = 0;
    const tags = {};
    for (let n = 0; n < 128; n++) {
      const h = await bytes(blob, p, 4);
      if (h.length < 4) break;
      const type = h[0] & 0x7f, len = (h[1] << 16) | (h[2] << 8) | h[3];
      if (type === 0) {
        const b = await bytes(blob, p + 4, 18);
        const sr = (b[10] << 12) | (b[11] << 4) | (b[12] >> 4);
        if (sr) duration = ((b[13] & 15) * 4294967296 + b32(b, 14)) / sr * 1000;
      } else if (type === 4) vorbisComments(await bytes(blob, p + 4, len), tags);
      else if (type === 6 && !tags.pic) {
        const b = await bytes(blob, p + 4, len);
        let q = 4;
        const ml = b32(b, q), mime = ascii(b, q + 4, ml);
        q += 4 + ml;
        q += 4 + b32(b, q) + 16;
        tags.pic = { mime: mime || 'image/jpeg', data: b.slice(q + 4, q + 4 + b32(b, q)) };
      }
      p += 4 + len;
      if (h[0] & 0x80) break;
    }
    return { duration, tags };
  }
  async function wavDuration(blob) {
    const b = await bytes(blob, 0, 8192);
    let byteRate = 0;
    for (let p = 12; p + 8 <= b.length;) {
      const id = ascii(b, p, 4), len = u32(b, p + 4);
      if (id === 'fmt ') byteRate = u32(b, p + 16);
      if (id === 'data') return byteRate ? Math.min(len, blob.size - p - 8) / byteRate * 1000 : 0;
      p += 8 + len + (len & 1);
    }
    return 0;
  }
  async function oggDuration(blob) {
    const head = await bytes(blob, 0, 4096);
    let rate = 0;
    if (find(head, 'OpusHead') >= 0) rate = 48000;
    else { const i = find(head, '\x01vorbis'); if (i >= 0) rate = u32(head, i + 12); }
    if (!rate) return 0;
    const tail = await bytes(blob, blob.size - 65536, 65536);
    for (let i = tail.length - 14; i >= 0; i--) {
      if (tail[i] === 0x4f && tail[i + 1] === 0x67 && tail[i + 2] === 0x67 && tail[i + 3] === 0x53) return u64(tail, i + 6) / rate * 1000;
    }
    return 0;
  }
  async function readMedia(blob, e) {
    try {
      if (e === 'mp3') return { tags: await id3Tags(blob), duration: await mp3Duration(blob) };
      if (e === 'm4a' || e === 'm4b' || e === 'aac') {
        const h = await bytes(blob, 4, 4);
        if (ascii(h, 0, 4) === 'ftyp') return await mp4Info(blob);
        return { tags: await id3Tags(blob), duration: 0 };
      }
      if (e === 'flac') return await flacInfo(blob);
      if (e === 'wav') return { tags: {}, duration: await wavDuration(blob) };
      if (e === 'ogg' || e === 'oga' || e === 'opus') return { tags: {}, duration: await oggDuration(blob) };
    } catch (err) { /* 못 읽으면 재생할 때 길이를 다시 잰다 */ }
    return { tags: {}, duration: 0 };
  }

  // ---------------------------------------------------------------- 저장소 (IndexedDB)
  let dbp = null;
  function db() {
    return dbp || (dbp = new Promise((ok, no) => {
      const r = indexedDB.open('daa-web', 1);
      r.onupgradeneeded = () => {
        const d = r.result;
        d.createObjectStore('conns', { keyPath: 'id' });
        d.createObjectStore('blobs');
        d.createObjectStore('meta');
      };
      r.onsuccess = () => ok(r.result);
      r.onerror = () => no(r.error);
    }));
  }
  async function tx(store, mode, fn) {
    const d = await db();
    return new Promise((ok, no) => {
      const t = d.transaction(store, mode), req = fn(t.objectStore(store));
      let out;
      if (req) req.onsuccess = () => { out = req.result; };
      t.oncomplete = () => ok(out);
      t.onerror = t.onabort = () => no(t.error || new Error('저장 공간이 부족하거나 저장하지 못했습니다.'));
    });
  }
  const dbGet = (s, k) => tx(s, 'readonly', st => st.get(k));
  const dbPut = (s, v, k) => tx(s, 'readwrite', st => (k === undefined ? st.put(v) : st.put(v, k)));
  const dbAll = s => tx(s, 'readonly', st => st.getAll());
  const dbDropPrefix = (s, prefix) => tx(s, 'readwrite', st => st.delete(IDBKeyRange.bound(prefix, prefix + '￿')));

  let conns = [];
  const meta = new Map();
  let readyP = null;
  function ready() {
    return readyP || (readyP = (async () => {
      try {
        conns = (await dbAll('conns')) || [];
        for (const m of (await dbAll('meta')) || []) meta.set(m.uri, m);
      } catch (e) { conns = []; }
    })());
  }
  const connOf = key => conns.find(c => 'c:' + c.id === key);

  // ---------------------------------------------------------------- 폴더 트리
  function makeTree(files) {
    const root = { dirs: new Map(), files: [] };
    for (const f of files) {
      const parts = f.path.split('/').filter(Boolean);
      if (!parts.length || parts.some(s => s.startsWith('.') || s === '__MACOSX')) continue;
      let n = root;
      for (const s of parts.slice(0, -1)) {
        if (!n.dirs.has(s)) n.dirs.set(s, { dirs: new Map(), files: [] });
        n = n.dirs.get(s);
      }
      n.files.push({ ...f, name: parts[parts.length - 1] });
    }
    // 'A.zip' 안에 'A/' 폴더 하나만 있는 흔한 경우에는 그 한 단계를 건너뛴다.
    if (!root.files.length && root.dirs.size === 1) return [...root.dirs.values()][0];
    return root;
  }
  function countAudio(n) {
    if (n.count === undefined) {
      n.count = n.files.filter(f => AUDIO_EXT.includes(ext(f.name))).length;
      for (const d of n.dirs.values()) n.count += countAudio(d);
    }
    return n.count;
  }
  async function zipVolume(blob) {
    const entries = await parseZip(blob);
    return {
      root: makeTree(entries.map(en => ({
        path: en.path, size: en.size, encrypted: en.encrypted,
        // 압축된 음원은 매번 풀면 느려서 한 번 풀어 저장해 둔다.
        get: async uri => {
          if (en.method !== 0) {
            const saved = await dbGet('blobs', uri);
            if (saved) return saved;
            const out = await zipEntryBlob(blob, en, mimeOf(en.path));
            await dbPut('blobs', out, uri).catch(() => {});
            return out;
          }
          return zipEntryBlob(blob, en, mimeOf(en.path));
        },
      }))),
    };
  }
  const volumes = new Map();
  function volumeOf(key) {
    if (!volumes.has(key)) {
      volumes.set(key, (async () => {
        const c = connOf(key);
        if (!c) throw notFound();
        if (c.kind === 'zip') return zipVolume(await dbGet('blobs', key));
        return { root: makeTree(c.files.map(f => ({ path: f.name, size: f.size, get: uri => dbGet('blobs', uri) }))) };
      })());
      volumes.get(key).catch(() => volumes.delete(key));
    }
    return volumes.get(key);
  }
  function nestedVolume(key, f) {
    if (!volumes.has(key)) {
      busyCb();
      volumes.set(key, f.get(key).then(zipVolume));
      volumes.get(key).catch(() => volumes.delete(key));
    }
    return volumes.get(key);
  }
  async function resolveDir(path) {
    await ready();
    const parts = path.split('/'), head = parts.shift(), c = connOf(head);
    if (!c) throw notFound();
    let node = (await volumeOf(head)).root, cur = head, zip = false;
    const chain = [{ name: c.name, path: head }];
    for (const s of parts) {
      cur += '/' + s;
      zip = false;
      if (node.dirs.has(s)) { node = node.dirs.get(s); chain.push({ name: s, path: cur }); continue; }
      const f = node.files.find(x => x.name === s && ext(s) === 'zip');
      if (!f) throw notFound();
      node = (await nestedVolume(cur, f)).root;
      chain.push({ name: stripExt(s), path: cur });
      zip = true;
    }
    return { node, chain, zip };
  }
  async function fileOf(uri) {
    const cut = uri.lastIndexOf('/'), name = uri.slice(cut + 1);
    const { node } = await resolveDir(uri.slice(0, cut));
    const f = node.files.find(x => x.name === name);
    if (!f) throw new Error('파일을 찾을 수 없습니다.');
    return f;
  }
  async function blobOf(uri) {
    const blob = await (await fileOf(uri)).get(uri);
    if (!blob) throw new Error('파일을 찾을 수 없습니다.');
    return blob.type ? blob : blob.slice(0, blob.size, mimeOf(uri));
  }
  const displayPath = uri => { const i = uri.indexOf('/'), c = connOf(i < 0 ? uri : uri.slice(0, i)); return (c ? c.name : '') + (i < 0 ? '' : uri.slice(i)); };

  async function ensureMeta(uri, f, dir, added) {
    if (meta.has(uri)) return meta.get(uri);
    const { duration, tags } = await readMedia(await f.get(uri), ext(f.name));
    const { pic, ...rest } = tags;
    const m = { uri, title: stripExt(f.name), dir, duration: Math.round(duration) || 0, added: added || Math.floor(Date.now() / 1000), tags: rest, pic: !!pic };
    meta.set(uri, m);
    await dbPut('meta', m, uri).catch(() => {});
    return m;
  }

  async function listDir(path) {
    await ready();
    if (!path) {
      return {
        path: '', name: ROOT_NAME, isRoot: true, crumbs: [{ name: ROOT_NAME, path: '' }], zips: [], eggs: [], tracks: [], unplayable: [],
        dirs: conns.slice().sort((a, b) => byName(a.name, b.name)).map(c => ({ name: c.name, path: 'c:' + c.id, tree: c.id, count: c.count || 0 })),
      };
    }
    const { node, chain, zip } = await resolveDir(path);
    const dirs = [...node.dirs].map(([name, n]) => ({ name, path: path + '/' + name, count: countAudio(n) })).sort((a, b) => byName(a.name, b.name));
    const zips = [], eggs = [], tracks = [], unplayable = [], missing = [];
    for (const f of node.files.slice().sort((a, b) => byName(a.name, b.name))) {
      const e = ext(f.name), uri = path + '/' + f.name;
      if (e === 'zip') zips.push({ name: f.name, path: uri, size: f.size });
      else if (e === 'egg' || e === 'alz') eggs.push({ name: f.name, size: f.size });
      else if (AUDIO_EXT.includes(e) && !f.encrypted) {
        const t = { uri, title: stripExt(f.name), duration: 0, dir: path };
        if (!meta.has(uri)) missing.push([t, f]);
        else t.duration = meta.get(uri).duration;
        tracks.push(t);
      } else if (AUDIO_EXT.includes(e) || BAD_EXT.includes(e)) unplayable.push({ name: f.name, size: f.size });
    }
    if (missing.length) {
      if (missing.length > 8) busyCb();
      for (const [t, f] of missing) t.duration = (await ensureMeta(t.uri, f, path).catch(() => ({ duration: 0 }))).duration;
    }
    return {
      path, name: chain[chain.length - 1].name, parent: chain.length > 1 ? chain[chain.length - 2].path : '',
      crumbs: [{ name: ROOT_NAME, path: '' }, ...chain], dirs, zips, eggs, tracks, unplayable, zip,
    };
  }

  // ---------------------------------------------------------------- 가져오기
  function pickFiles(accept, multiple) {
    return new Promise(ok => {
      const inp = document.createElement('input');
      inp.type = 'file';
      inp.multiple = !!multiple;
      if (accept) inp.accept = accept;
      inp.style.cssText = 'position:fixed;left:-9999px;opacity:0';
      document.body.append(inp);
      const done = files => { inp.remove(); ok(files); };
      inp.addEventListener('change', () => done([...inp.files]));
      inp.addEventListener('cancel', () => done([]));
      inp.click();
    });
  }
  function progress(text) {
    const p = hasDom && document.querySelector('#busy p');
    if (p) p.textContent = text;
  }
  const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  function stamp() {
    const d = new Date(), p = n => String(n).padStart(2, '0');
    return `${d.getMonth() + 1}월 ${d.getDate()}일 ${p(d.getHours())}:${p(d.getMinutes())}`;
  }
  async function scanConn(c) {
    const key = 'c:' + c.id, root = (await volumeOf(key)).root, total = countAudio(root), added = Math.floor(c.added / 1000);
    let k = 0;
    const walk = async (node, path) => {
      for (const f of node.files) {
        if (!AUDIO_EXT.includes(ext(f.name)) || f.encrypted) continue;
        progress(`음악 정보를 읽는 중… ${++k}/${total}`);
        await ensureMeta(path + '/' + f.name, f, path, added).catch(() => {});
      }
      for (const [name, d] of node.dirs) await walk(d, path + '/' + name);
    };
    await walk(root, key);
    c.count = total;
    await dbPut('conns', c);
  }
  async function addConn(c, blobs) {
    for (const [k, b] of blobs) await dbPut('blobs', b, k);
    await dbPut('conns', c);
    conns.push(c);
    volumes.delete('c:' + c.id);
    await scanConn(c);
  }
  async function importFiles(files) {
    for (const z of files.filter(f => ext(f.name) === 'zip')) {
      progress(`${z.name} 저장하는 중…`);
      await parseZip(z);
      const c = { id: newId(), name: stripExt(z.name), kind: 'zip', size: z.size, added: Date.now() };
      await addConn(c, [['c:' + c.id, z]]);
    }
    const loose = files.filter(f => AUDIO_EXT.includes(ext(f.name)) || IMG_EXT.includes(ext(f.name)));
    if (loose.some(f => AUDIO_EXT.includes(ext(f.name)))) {
      const c = { id: newId(), name: '가져온 음악 ' + stamp(), kind: 'files', files: [], added: Date.now() };
      const used = new Set(), blobs = [];
      loose.forEach((f, i) => {
        let name = f.name.replace(/\//g, '_');
        if (used.has(name)) name = stripExt(name) + ` (${i})` + (ext(name) ? '.' + ext(name) : '');
        used.add(name);
        c.files.push({ name, size: f.size });
        blobs.push([`c:${c.id}/${name}`, f]);
      });
      progress('음악 저장하는 중…');
      await addConn(c, blobs);
    }
  }
  async function requestAccess() {
    const files = await pickFiles('', true);
    await ready();
    if (!files.length) return conns.length > 0;
    busyCb();
    askPersist();
    try { await importFiles(files); } catch (e) { alert('가져오지 못했습니다.\n' + (e.message || e)); }
    progress('불러오는 중…');
    if (!conns.length && hasDom) { const b = document.getElementById('busy'); if (b) b.hidden = true; }
    return conns.length > 0;
  }
  async function removeFolder(id) {
    const key = 'c:' + id;
    await tx('conns', 'readwrite', s => s.delete(id));
    await dbDropPrefix('blobs', key);
    await dbDropPrefix('meta', key + '/');
    conns = conns.filter(c => c.id !== id);
    for (const k of [...meta.keys()]) if (k.startsWith(key + '/')) meta.delete(k);
    for (const k of [...volumes.keys()]) if (k === key || k.startsWith(key + '/')) volumes.delete(k);
    return { granted: conns.length > 0 };
  }

  // ---------------------------------------------------------------- 라이브러리 / 태그 / 그림
  const hash = s => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h) || 1; };
  async function getLibrary() {
    await ready();
    const tracks = [];
    for (const m of meta.values()) {
      const head = m.uri.slice(0, m.uri.indexOf('/'));
      if (!connOf(head)) continue;
      const t = m.tags || {}, folderName = m.dir === head ? connOf(head).name : m.dir.slice(m.dir.lastIndexOf('/') + 1);
      const album = t.album || folderName;
      tracks.push({
        uri: m.uri, title: m.title, tag: t.title || '', artist: t.artist || '', album, albumId: hash(album + '\u0001' + (t.albumArtist || '')),
        albumArtist: t.albumArtist || '', genre: t.genre || '', year: parseInt(t.year, 10) || 0, track: parseInt(t.track, 10) || 0,
        added: m.added || 0, duration: m.duration || 0, dir: m.dir,
      });
    }
    return { tracks };
  }
  async function getTags(uri) {
    const blob = await blobOf(uri), { tags } = await readMedia(blob, ext(uri));
    const L = [['title', '제목'], ['artist', '아티스트'], ['album', '앨범'], ['albumArtist', '앨범 아티스트'], ['genre', '장르'], ['year', '연도'], ['track', '트랙'], ['disc', '디스크'], ['comment', '코멘트']];
    return {
      tags: L.filter(([k]) => tags[k]).map(([k, label]) => ({ label, value: String(tags[k]) })),
      tech: [{ label: '형식', value: blob.type || mimeOf(uri) || ext(uri).toUpperCase() }],
      size: blob.size, path: displayPath(uri),
    };
  }
  const artCache = new Map(), dirArt = new Map(), thumbCache = new Map();
  function folderArt(dir) {
    if (!dirArt.has(dir)) {
      dirArt.set(dir, (async () => {
        const { node } = await resolveDir(dir);
        const imgs = node.files.filter(f => IMG_EXT.includes(ext(f.name)));
        const f = imgs.find(x => /^(cover|folder|front|album)/i.test(x.name)) || imgs[0];
        return f ? URL.createObjectURL(await f.get(dir + '/' + f.name)) : null;
      })().catch(() => null));
    }
    return dirArt.get(dir);
  }
  function getArt(uri) {
    if (!artCache.has(uri)) {
      artCache.set(uri, (async () => {
        const m = meta.get(uri);
        if (!m || m.pic) {
          const { tags } = await readMedia(await blobOf(uri), ext(uri));
          if (tags.pic) return URL.createObjectURL(new Blob([tags.pic.data], { type: tags.pic.mime }));
        }
        return folderArt(uri.slice(0, uri.lastIndexOf('/')));
      })().catch(() => null));
    }
    return artCache.get(uri);
  }
  function getThumb(uri, size) {
    const s = size || 160, key = uri + '|' + s;
    if (!thumbCache.has(key)) {
      thumbCache.set(key, getArt(uri).then(async url => {
        if (!url || !hasDom) return url;
        try {
          const img = new Image();
          img.src = url;
          await img.decode();
          const r = Math.min(1, s / Math.max(img.naturalWidth, img.naturalHeight)), c = document.createElement('canvas');
          c.width = Math.max(1, Math.round(img.naturalWidth * r));
          c.height = Math.max(1, Math.round(img.naturalHeight * r));
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          return c.toDataURL('image/jpeg', 0.85);
        } catch (e) { return url; }
      }));
    }
    return thumbCache.get(key);
  }

  // ---------------------------------------------------------------- 재생
  let audio = null, q = [], qi = 0, playing = false, wantPlay = false, loading = false, speed = 1, queueFolder = null, loadToken = 0;
  let pendingSeek = null, currentUrl = null, lastEmit = 0, sleepAt = 0, sleepEnd = false, sleepTimer = 0;
  let stateCb = () => {}, errCb = () => {}, busyCb = () => {};
  const SILENT = (() => {
    const n = 800, b = new Uint8Array(44 + n), v = new DataView(b.buffer), w = (o, s) => { for (let i = 0; i < 4; i++) b[o + i] = s.charCodeAt(i); };
    w(0, 'RIFF'); v.setUint32(4, 36 + n, true); w(8, 'WAVE'); w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, 8000, true); v.setUint32(28, 8000, true); v.setUint16(32, 1, true); v.setUint16(34, 8, true); w(36, 'data'); v.setUint32(40, n, true);
    b.fill(128, 44);
    let s = '';
    for (const x of b) s += String.fromCharCode(x);
    return 'data:audio/wav;base64,' + btoa(s);
  })();
  const isTrackSrc = () => !!audio && !!currentUrl && audio.src === currentUrl;

  function player() {
    if (audio) return audio;
    audio = new Audio();
    audio.preload = 'auto';
    audio.addEventListener('loadedmetadata', () => {
      if (!isTrackSrc()) return;
      if (pendingSeek) { try { audio.currentTime = pendingSeek / 1000; } catch (e) { /* 아래 canplay에서 다시 */ } }
      pendingSeek = null;
      const t = q[qi], m = t && meta.get(t.uri), d = audio.duration * 1000;
      if (m && isFinite(d) && d > 0 && Math.abs(d - m.duration) > 1500) { m.duration = Math.round(d); dbPut('meta', m, m.uri).catch(() => {}); }
      emit();
    });
    audio.addEventListener('timeupdate', () => {
      if (!isTrackSrc()) return;
      if (sleepAt && Date.now() >= sleepAt) { sleepAt = 0; audio.pause(); }
      if (Date.now() - lastEmit > 450) emit();
    });
    audio.addEventListener('play', () => { if (isTrackSrc()) { playing = true; emit(); } });
    audio.addEventListener('pause', () => { if (isTrackSrc() && !audio.ended) { playing = false; emit(); } });
    audio.addEventListener('ended', () => {
      if (!isTrackSrc()) return;
      emit();
      if (sleepEnd) { sleepEnd = false; playing = false; emit(); return; }
      if (qi < q.length - 1) load(qi + 1, 0, true);
      else { playing = false; emit(); }
    });
    audio.addEventListener('error', () => { if (isTrackSrc()) { playing = false; errCb(); emit(); } });
    return audio;
  }
  // iOS는 사용자가 화면을 누른 순간에만 소리를 낼 수 있어서, 첫 터치 때 플레이어를 깨워 둔다.
  function unlock() {
    const a = player();
    if (eq.ctx && eq.ctx.state !== 'running') eq.ctx.resume().catch(() => {});
    if (a.src) return;
    a.src = SILENT;
    a.play().then(() => { if (a.src === SILENT) a.pause(); }).catch(() => {});
  }
  if (hasDom) for (const t of ['touchend', 'click', 'keydown']) document.addEventListener(t, unlock, { capture: true, passive: true });

  function positionMs() {
    if (pendingSeek != null || !isTrackSrc() || audio.readyState < 1) return pendingSeek || 0;
    return audio.currentTime * 1000;
  }
  function durationMs() {
    const t = q[qi];
    if (isTrackSrc() && audio.readyState >= 1 && isFinite(audio.duration)) return audio.duration * 1000;
    return t ? t.duration || 0 : 0;
  }
  const RESUME_KEY = '__webResume';
  const readResume = () => { try { return JSON.parse(localStorage.getItem(RESUME_KEY)) || { p: {}, f: {} }; } catch (e) { return { p: {}, f: {} }; } };
  function persist() {
    const t = q[qi];
    if (!t || !queueFolder) return;
    const r = readResume(), pos = positionMs(), dur = durationMs(), done = dur > 0 && pos >= dur - 3000;
    if (done) delete r.p[t.uri]; else if (pos > 0) r.p[t.uri] = Math.round(pos);
    r.f[queueFolder] = done && q[qi + 1] ? q[qi + 1].uri : t.uri;
    r.last = queueFolder;
    try { localStorage.setItem(RESUME_KEY, JSON.stringify(r)); } catch (e) { /* 저장 공간 부족 */ }
  }
  function emit() {
    lastEmit = Date.now();
    persist();
    const t = q[qi];
    stateCb({ index: qi, position: positionMs(), duration: durationMs(), playing, speed, uri: t && t.uri, sleepLeft: sleepAt ? Math.max(0, sleepAt - Date.now()) : 0, sleepEnd });
    sessionPosition();
  }
  async function doPlay() {
    const a = player();
    if (eq.ctx && eq.ctx.state !== 'running') eq.ctx.resume().catch(() => {});
    try { await a.play(); playing = true; } catch (e) { playing = false; }
    emit();
  }
  // 파일을 꺼내 오는 동안 play()/pause()가 오면 wantPlay에만 기록해 두고, 다 불러온 뒤 반영한다.
  async function load(i, pos, play) {
    const token = ++loadToken, t = q[i];
    wantPlay = !!play;
    qi = i;
    if (!t) return;
    loading = true;
    pendingSeek = pos || 0;
    let blob;
    try { blob = await blobOf(t.uri); } catch (e) {
      if (token === loadToken) { loading = false; playing = false; errCb(); emit(); }
      return;
    }
    if (token !== loadToken) return;
    loading = false;
    const a = player(), old = currentUrl;
    currentUrl = URL.createObjectURL(blob);
    a.src = currentUrl;
    a.defaultPlaybackRate = a.playbackRate = speed;
    a.load();
    if (old) URL.revokeObjectURL(old);
    sessionMeta(t);
    if (wantPlay) await doPlay(); else { playing = false; emit(); }
  }

  // 잠금 화면 / 제어 센터
  const session = typeof navigator !== 'undefined' && navigator.mediaSession;
  function folderTitle() {
    if (!queueFolder) return '';
    if (queueFolder.startsWith('c:')) { const c = connOf(queueFolder); return c ? c.name : queueFolder.slice(queueFolder.lastIndexOf('/') + 1); }
    return queueFolder.replace(/^lib:[^:]*:?/, '');
  }
  function sessionMeta(t) {
    if (!session || typeof MediaMetadata === 'undefined') return;
    const base = { title: t.title, artist: folderTitle(), album: 'DIV AUDIO APP' };
    session.metadata = new MediaMetadata(base);
    getThumb(t.uri, 512).then(url => {
      if (url && q[qi] === t) session.metadata = new MediaMetadata({ ...base, artwork: [{ src: url, sizes: '512x512', type: 'image/jpeg' }] });
    });
  }
  function sessionPosition() {
    if (!session || !session.setPositionState) return;
    const d = durationMs() / 1000;
    try { if (d > 0) session.setPositionState({ duration: d, playbackRate: speed, position: Math.min(d, positionMs() / 1000) }); } catch (e) { /* 무시 */ }
  }
  if (session) {
    const on = (name, fn) => { try { session.setActionHandler(name, fn); } catch (e) { /* 지원 안 함 */ } };
    on('play', () => api.play());
    on('pause', () => api.pause());
    on('previoustrack', () => { if (positionMs() > 3000 || qi === 0) api.seekTo(0); else api.skipTo(qi - 1, 0); });
    on('nexttrack', () => { if (qi < q.length - 1) api.skipTo(qi + 1, 0); });
    on('seekto', d => api.seekTo(d.seekTime * 1000));
  }

  // 이퀄라이저: 켜는 순간에만 Web Audio로 연결한다. (연결하면 잠금 화면 재생이 불안정해질 수 있다)
  const EQ_FREQ = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
  const eq = { ctx: null, filters: [] };
  function setEq(enabled, gains) {
    if (!enabled && !eq.ctx) return;
    if (!eq.ctx) {
      const AC = W.AudioContext || W.webkitAudioContext;
      if (!AC) return;
      eq.ctx = new AC();
      let node = eq.ctx.createMediaElementSource(player());
      eq.filters = EQ_FREQ.map((f, i) => {
        const b = eq.ctx.createBiquadFilter();
        b.type = i === 0 ? 'lowshelf' : i === EQ_FREQ.length - 1 ? 'highshelf' : 'peaking';
        b.frequency.value = f;
        b.Q.value = 1.1;
        node.connect(b);
        node = b;
        return b;
      });
      node.connect(eq.ctx.destination);
    }
    eq.filters.forEach((b, i) => { b.gain.value = enabled ? gains[i] || 0 : 0; });
    if (playing) eq.ctx.resume().catch(() => {});
  }

  // ---------------------------------------------------------------- 저장 / 공유
  function download(name, blob) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 60000);
  }
  // shareDone: 사용자가 공유 창을 취소하지 않고 실제로 저장/공유했는지 (백업 기록용)
  let shareDone = false;
  async function shareOrSave(name, blob) {
    const file = new File([blob], name, { type: blob.type });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file] }); shareDone = true; return; } catch (e) {
        if (e.name === 'AbortError') return;
      }
    }
    download(name, blob);
    shareDone = true;
  }
  const fromBase64 = (data, type) => { const s = atob(data), b = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i); return new Blob([b], { type }); };

  const api = {
    web: true,
    hasAccess: async () => { await ready(); return { granted: conns.length > 0, store: true, version: VERSION }; },
    requestAccess,
    removeFolder,
    requestNotifications: async () => {},
    listDir: path => listDir(path || ''),
    getArt: uri => getArt(uri),
    getThumb: (uri, size) => getThumb(uri, size),
    getLibrary,
    getSystemFonts: async () => ({ fonts: [] }),
    requestAudio: async () => true,
    getTags,
    saveText: async (name, text) => { await shareOrSave(name, new Blob([text], { type: 'text/plain' })); return { path: name }; },
    shareText: async (title, text) => {
      if (navigator.share) { try { await navigator.share({ title, text }); return; } catch (e) { if (e.name === 'AbortError') return; } }
      await navigator.clipboard.writeText(text);
      alert('클립보드에 복사했습니다.');
    },
    shareFile: async (name, mime, payload) => shareOrSave(name, payload.data ? fromBase64(payload.data, mime) : new Blob([payload.text || ''], { type: mime })),
    saveImage: async (name, data) => shareOrSave(name, fromBase64(data, 'image/jpeg')),
    pickText: async () => {
      const [f] = await pickFiles('.txt,.json,text/plain,application/json', false);
      return f ? { name: f.name, text: await f.text() } : { cancelled: true };
    },
    setQueue: async (tracks, index, position, play, folder) => {
      persist();
      queueFolder = folder;
      q = tracks;
      await load(index, position, play);
    },
    getResume: async (folder, uris) => {
      const r = readResume(), positions = {};
      for (const u of uris) if (r.p[u]) positions[u] = r.p[u];
      return { uri: r.f[folder], positions, lastFolder: r.last };
    },
    setSleep: async (delay, endOfTrack) => {
      clearTimeout(sleepTimer);
      sleepAt = delay ? Date.now() + delay : 0;
      sleepEnd = !!endOfTrack;
      if (delay) sleepTimer = setTimeout(() => { sleepAt = 0; if (audio) audio.pause(); playing = false; emit(); }, delay);
      emit();
    },
    play: async () => {
      wantPlay = true;
      if (loading) return;
      if (isTrackSrc()) return doPlay();
      if (q[qi]) return load(qi, pendingSeek || 0, true);
    },
    pause: async () => {
      wantPlay = false;
      if (audio) audio.pause();
      playing = false;
      emit();
    },
    seekTo: async position => {
      if (isTrackSrc() && audio.readyState >= 1) audio.currentTime = position / 1000; else pendingSeek = position;
      emit();
    },
    skipTo: async (index, position) => load(index, position || 0, wantPlay || playing),
    setSpeed: async s => {
      speed = s;
      if (audio) audio.defaultPlaybackRate = audio.playbackRate = s;
      emit();
    },
    setEq: async (enabled, gains) => setEq(enabled, gains),
    setTheme: async (dark, color) => {
      if (!hasDom) return;
      let m = document.querySelector('meta[name="theme-color"]');
      if (!m) { m = document.createElement('meta'); m.name = 'theme-color'; document.head.append(m); }
      if (color) m.content = color;
    },
    onZipBusy: cb => { busyCb = cb; },
    onError: cb => { errCb = cb; },
    onState: cb => { stateCb = cb; },
    _internals: { parseZip, zipEntryBlob, readMedia, makeTree, importFiles },
  };
  W.WebBridge = api;

  // ---------------------------------------------------------------- 데이터 지키기
  // 1) iOS에 '영구 보관'을 요청해서 저장 공간이 부족해도 자동으로 지우지 않게 한다.
  // 2) 백업 파일을 저장/공유할 때마다 기록해 두고, 백업 안 된 북마크가 쌓이면 백업하라고 알린다.
  //    (웹앱은 사용자 동작 없이 '파일' 앱에 저장할 수 없어서 완전 자동 백업은 불가능하다)
  const BACKUP_KEY = '__lastBackup', SNOOZE_KEY = '__backupSnooze';
  let persisted = null;
  const readJson = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch (e) { return d; } };
  const markHashes = () => readJson('bookmarks', []).map(m => hash(JSON.stringify(m)));
  function unsaved() {
    const done = new Set(readJson(BACKUP_KEY, {}).marks || []);
    return markHashes().filter(h => !done.has(h)).length;
  }
  function recordBackup() {
    try { localStorage.setItem(BACKUP_KEY, JSON.stringify({ at: Date.now(), marks: markHashes() })); } catch (e) { /* 무시 */ }
    const r = hasDom && document.getElementById('webRemind');
    if (r) r.remove();
    updateStatus();
  }
  for (const k of ['saveText', 'shareFile']) {
    const f = api[k];
    api[k] = async (name, ...rest) => {
      shareDone = false;
      const r = await f(name, ...rest);
      if (shareDone && /^DAA_북마크백업_/.test(name)) recordBackup();
      return r;
    };
  }
  async function askPersist() {
    try {
      if (navigator.storage && navigator.storage.persisted) {
        persisted = await navigator.storage.persisted();
        if (!persisted && navigator.storage.persist) persisted = await navigator.storage.persist();
      }
    } catch (e) { /* 지원 안 함 */ }
    updateStatus();
  }
  function updateStatus() {
    const anchor = hasDom && document.getElementById('btnImport');
    if (!anchor) return;
    let note = document.getElementById('webStore');
    if (!note) {
      note = document.createElement('p');
      note.id = 'webStore';
      note.className = 'setNote';
      note.style.whiteSpace = 'pre-line';
      anchor.parentNode.append(note);
    }
    const last = readJson(BACKUP_KEY, null), n = unsaved();
    const when = last ? new Date(last.at).toLocaleString('ko-KR', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '아직 없음';
    note.textContent = [
      '보관 상태: ' + (persisted ? '영구 보관 (저장 공간이 부족해도 iOS가 지우지 않음)' : persisted === false ? '일반 보관 (저장 공간이 부족하면 iOS가 지울 수 있음)' : '확인 중'),
      '마지막 백업: ' + when + (n ? ` · 백업 안 된 북마크 ${n}개` : ''),
      "홈 화면에서 앱 아이콘을 삭제하면 가져온 음악과 북마크가 함께 지워집니다. 백업 파일은 '파일' 앱이나 iCloud Drive에 저장해 두세요.",
    ].join('\n');
  }
  function banner(id, html, buttons) {
    if (document.getElementById(id)) return null;
    const box = document.createElement('div');
    box.id = id;
    box.style.cssText = 'position:fixed;left:12px;right:12px;bottom:calc(12px + env(safe-area-inset-bottom));z-index:9999;background:#1d1d27;color:#fff;border:1px solid #3a3a4a;border-radius:14px;padding:14px;font:14px/1.5 -apple-system,sans-serif;box-shadow:0 8px 30px rgba(0,0,0,.5)';
    box.innerHTML = html;
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:8px;justify-content:flex-end;margin-top:10px';
    for (const [label, main, fn] of buttons) {
      const b = document.createElement('button');
      b.textContent = label;
      b.style.cssText = `border:0;border-radius:10px;padding:8px 14px;font:600 14px -apple-system,sans-serif;color:#fff;background:${main ? '#ff5a7a' : '#333'}`;
      b.onclick = () => { box.remove(); fn(); };
      row.append(b);
    }
    box.append(row);
    document.body.append(box);
    return box;
  }
  function remind() {
    if (document.visibilityState !== 'visible') return;
    const n = unsaved(), last = readJson(BACKUP_KEY, null);
    if (!n || Date.now() < Number(localStorage.getItem(SNOOZE_KEY) || 0)) return;
    if (n < 3 && !(last && Date.now() - last.at > 7 * 864e5)) return;
    banner('webRemind', `<b>북마크 ${n}개가 아직 백업되지 않았습니다</b><br><span style="color:#aaa">앱을 지우거나 사이트 데이터를 지우면 함께 사라집니다. 공유 창에서 '파일에 저장'을 고르세요.</span>`, [
      ['나중에', false, () => { try { localStorage.setItem(SNOOZE_KEY, String(Date.now() + 864e5)); } catch (e) { /* 무시 */ } }],
      ['지금 백업', true, () => { const b = document.getElementById('btnBackupSave'); if (b) b.click(); }],
    ]);
  }

  // ---------------------------------------------------------------- 설치 안내 / 오프라인
  if (hasDom) {
    if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
    const standalone = navigator.standalone || (W.matchMedia && W.matchMedia('(display-mode: standalone)').matches);
    const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    document.addEventListener('DOMContentLoaded', () => {
      askPersist();
      if (ios && !standalone) {
        banner('webInstall', '<b>앱으로 설치하세요</b><br>아래 <b>공유 버튼(□↑)</b> → <b>\'홈 화면에 추가\'</b>를 누르면 앱처럼 쓸 수 있습니다.<br><span style="color:#aaa">Safari에서 가져온 음악과 북마크는 설치한 앱에 보이지 않으니, 설치 후 앱에서 가져와 주세요.</span>', [['닫기', false, () => {}]]);
        return;
      }
      setTimeout(remind, 4000);
      document.addEventListener('click', () => setTimeout(updateStatus, 300), true);
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { updateStatus(); setTimeout(remind, 1500); } });
    });
  }
})();
