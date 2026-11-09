'use strict';
// 태그, 길이, 앨범아트를 읽는다. 한글 태그는 CP949로 저장된 경우가 많아서 되살린다.
const iconv = require('iconv-lite');
const { mimeOf } = require('./formats');

let loaded = null;
const mm = () => (loaded ||= import('music-metadata'));

/** 폰 앱의 화면과 같은 순서로 보여 준다. */
const ORDER = ['제목', '아티스트', '앨범', '앨범 아티스트', '장르', '연도', '트랙', '디스크', '작곡가', '작사가', '출판사', 'BPM', '저작권', '인코딩', '코멘트', '가사'];

const HANGUL = /[가-힣]/;
/** 태그가 Latin-1로 읽혔지만 실제로는 UTF-8이나 CP949인 글자를 되살린다. */
function fixText(value) {
  if (typeof value !== 'string' || !/[\u0080-ÿ]/.test(value) || /[^\u0000-ÿ]/.test(value)) return value;
  const bytes = Buffer.from(value, 'latin1');
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch { /* UTF-8이 아니다 */ }
  const korean = iconv.decode(bytes, 'cp949');
  return HANGUL.test(korean) && !korean.includes('�') ? korean : value;
}
const first = v => (Array.isArray(v) ? v[0] : v);
const joined = v => (Array.isArray(v) ? v.filter(Boolean).map(fixText).join(', ') : fixText(v));
const numberPair = p => (p && p.no ? (p.of ? `${p.no}/${p.of}` : String(p.no)) : '');
const textOf = v => (v && typeof v === 'object' ? v.text || (v.syncText || []).map(x => x.text).join('\n') : v);

function nativeText(meta, wanted) {
  for (const list of Object.values(meta.native || {})) {
    for (const t of list) {
      if (typeof t.id === 'string' && t.id.toLowerCase() === `txxx:${wanted}` && t.value) return first(t.value);
    }
  }
  return '';
}

function tagList(meta) {
  const c = meta.common;
  const values = {
    제목: fixText(c.title), 아티스트: fixText(c.artist) || joined(c.artists), 앨범: fixText(c.album),
    '앨범 아티스트': fixText(c.albumartist), 장르: joined(c.genre),
    연도: c.date ? String(c.date) : c.year ? String(c.year) : '',
    트랙: numberPair(c.track), 디스크: numberPair(c.disk), 작곡가: joined(c.composer), 작사가: joined(c.lyricist),
    출판사: joined(c.label), BPM: c.bpm ? String(c.bpm) : '', 저작권: fixText(c.copyright), 인코딩: fixText(c.encodedby),
    코멘트: fixText(textOf(first(c.comment))) || fixText(nativeText(meta, 'comment')),
    가사: fixText(textOf(first(c.lyrics))) || fixText(nativeText(meta, 'lyrics')),
  };
  return ORDER.filter(label => values[label]).map(label => ({ label, value: String(values[label]).trim() })).filter(t => t.value);
}

function techList(meta, name) {
  const f = meta.format, tech = [{ label: '형식', value: f.codec || f.container || mimeOf(name) }];
  if (f.bitrate) tech.push({ label: '비트레이트', value: `${Math.round(f.bitrate / 1000)} kbps` });
  if (f.sampleRate) tech.push({ label: '샘플레이트', value: `${f.sampleRate} Hz` });
  return tech;
}

const duration = meta => Math.round((meta.format.duration || 0) * 1000);

/** 목록과 라이브러리에 쓰는 값만 뽑는다. */
function summary(meta) {
  const c = meta.common;
  return {
    duration: duration(meta), tag: fixText(c.title) || '', artist: fixText(c.artist) || '', album: fixText(c.album) || '',
    albumArtist: fixText(c.albumartist) || '', genre: fixText(first(c.genre)) || '', year: c.year || 0, track: (c.track && c.track.no) || 0,
  };
}

async function parseFile(file, covers) {
  return (await mm()).parseFile(file, { duration: false, skipCovers: !covers });
}
async function parseStream(stream, name, size, covers) {
  return (await mm()).parseStream(stream, { path: name, size, mimeType: mimeOf(name) }, { duration: false, skipCovers: !covers });
}

const picture = meta => {
  const p = (meta.common.picture || [])[0];
  return p ? { data: Buffer.from(p.data), format: p.format } : null;
};

module.exports = { fixText, tagList, techList, summary, parseFile, parseStream, picture, duration };
