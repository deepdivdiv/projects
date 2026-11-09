'use strict';
// 곡 주소(file:// 또는 zipentry://)를 실제 내용으로 바꾼다.
const fs = require('fs');
const path = require('path');
const { fileURLToPath } = require('url');
const { Readable } = require('stream');
const { mimeOf } = require('./formats');
const tags = require('./tags');
const { entryStream } = require('./zip');

class Media {
  constructor(zips) {
    this.zips = zips;
  }

  /** {name, size, label, open(start, end)} */
  async source(uri) {
    if (uri.startsWith('zipentry:')) {
      const { zipPath, item, title, name } = await this.zips.resolve(uri);
      return {
        name, size: item.size, label: `${zipPath.replace(/\\/g, '/')} › ${title}`,
        open: (start, end) => entryStream(zipPath, item, start, end),
      };
    }
    if (!uri.startsWith('file:')) throw new Error('잘못된 주소입니다.');
    const file = fileURLToPath(uri);
    const { size } = await fs.promises.stat(file);
    return {
      name: path.basename(file), size, file, label: file.replace(/\\/g, '/'),
      open: async (start, end) => fs.createReadStream(file, { start, end }),
    };
  }

  async metadata(uri, covers) {
    const s = await this.source(uri);
    if (s.file) return { source: s, meta: await tags.parseFile(s.file, covers) };
    const stream = await s.open(0, s.size - 1);
    try {
      return { source: s, meta: await tags.parseStream(stream, s.name, s.size, covers) };
    } finally {
      stream.destroy();
    }
  }

  async tags(uri) {
    const { source, meta } = await this.metadata(uri, false);
    return { tags: tags.tagList(meta), tech: tags.techList(meta, source.name), size: source.size, path: source.label };
  }

  async picture(uri) {
    return tags.picture((await this.metadata(uri, true)).meta);
  }

  /** 시크할 수 있도록 Range 요청에 맞는 부분만 돌려준다. */
  async respond(uri, rangeHeader) {
    const s = await this.source(uri);
    const m = /^bytes=(\d+)-(\d*)$/.exec(rangeHeader || '');
    const start = m ? Number(m[1]) : 0;
    const end = m && m[2] ? Math.min(Number(m[2]), s.size - 1) : s.size - 1;
    if (start >= s.size) {
      return new Response(null, { status: 416, headers: { 'content-range': `bytes */${s.size}` } });
    }
    const headers = { 'content-type': mimeOf(s.name), 'accept-ranges': 'bytes', 'content-length': String(end - start + 1) };
    if (m) headers['content-range'] = `bytes ${start}-${end}/${s.size}`;
    return new Response(Readable.toWeb(await s.open(start, end)), { status: m ? 206 : 200, headers });
  }
}

module.exports = { Media };
