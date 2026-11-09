'use strict';
// 재생 엔진(Chromium)이 해석할 수 있는 형식과, 음원이지만 재생은 못 하고 목록에만 보여 줄 형식.
const PLAYABLE = new Set(['mp3', 'wav', 'flac', 'ogg', 'oga', 'opus', 'm4a', 'm4b', 'aac', 'weba']);
const UNPLAYABLE = new Set(['wma', 'ape', 'aif', 'aiff', 'aifc', 'alac', 'dsf', 'dff', 'mid', 'midi', 'wv', 'tta', 'mpc', 'ra', 'rm', 'm4p', 'amr', 'awb', '3ga', 'mka']);
const MIME = {
  mp3: 'audio/mpeg', wav: 'audio/wav', flac: 'audio/flac', ogg: 'audio/ogg', oga: 'audio/ogg', opus: 'audio/ogg',
  m4a: 'audio/mp4', m4b: 'audio/mp4', aac: 'audio/aac', weba: 'audio/webm',
};

function extension(name) {
  const dot = name.lastIndexOf('.');
  return dot < 0 ? '' : name.slice(dot + 1).toLowerCase();
}
const isAudio = name => PLAYABLE.has(extension(name));
const isUnplayable = name => UNPLAYABLE.has(extension(name));
const isZip = name => extension(name) === 'zip';
const isEgg = name => extension(name) === 'egg';
const stripExtension = name => (isAudio(name) || isUnplayable(name) ? name.slice(0, name.lastIndexOf('.')) : name);
const mimeOf = name => MIME[extension(name)] || 'application/octet-stream';

const collator = new Intl.Collator('ko', { numeric: true, sensitivity: 'base' });
const naturalOrder = (a, b) => collator.compare(a, b);

/** 한 번에 limit개씩만 돌린다. 하드디스크가 여러 파일을 동시에 읽느라 느려지지 않게 한다. */
async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  }));
  return out;
}

module.exports = { extension, isAudio, isUnplayable, isZip, isEgg, stripExtension, mimeOf, naturalOrder, mapLimit };
