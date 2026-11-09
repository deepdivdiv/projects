'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const iconv = require('iconv-lite');
const { ZipLibrary, entryStream, itemsOf } = require('../src/zip');
const { Collector, ProbeCache, clean, parentOf, fileUri } = require('../src/playlist');
const { Media } = require('../src/media');
const tags = require('../src/tags');

const FIX = 'D:/git_home/music_apk/android/app/src/test/resources/';
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'daa-'));
const read = async stream => { const out = []; for await (const c of stream) out.push(c); return Buffer.concat(out); };

// 한글(CP949) 이름, 저장/압축 방식을 섞은 ZIP을 직접 만든다.
function makeZip(file, entries) {
  const locals = [], central = [];
  let offset = 0;
  entries.forEach(e => {
    const name = e.utf8 ? Buffer.from(e.name) : iconv.encode(e.name, 'cp949');
    const body = e.deflate ? zlib.deflateRawSync(e.data) : e.data;
    const flags = (e.utf8 ? 0x800 : 0) | (e.encrypted ? 1 : 0);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(flags, 6); local.writeUInt16LE(e.deflate ? 8 : 0, 8);
    local.writeUInt32LE(body.length, 18); local.writeUInt32LE(e.data.length, 22); local.writeUInt16LE(name.length, 26);
    locals.push(local, name, body);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(flags, 8); c.writeUInt16LE(e.deflate ? 8 : 0, 10);
    c.writeUInt32LE(body.length, 20); c.writeUInt32LE(e.data.length, 24); c.writeUInt16LE(name.length, 28); c.writeUInt32LE(offset, 42);
    central.push(c, name);
    offset += 30 + name.length + body.length;
  });
  const dir = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(dir.length, 12); end.writeUInt32LE(offset, 16);
  fs.writeFileSync(file, Buffer.concat([...locals, dir, end]));
}

const mp3 = fs.readFileSync(FIX + 'info.mp3');
const wav = fs.readFileSync(FIX + 'tone.wav');
const zipPath = path.join(tmp, '수업자료.zip');
makeZip(zipPath, [
  { name: '10강.mp3', data: mp3 }, { name: '2강.wav', data: wav, deflate: true }, { name: '__MACOSX/._x.mp3', data: mp3 },
  { name: '폴더/메모.txt', data: Buffer.from('x') }, { name: '폴더/3강.flac', data: fs.readFileSync(FIX + 'tone.flac'), utf8: true },
]);
const library = new ZipLibrary(path.join(tmp, 'zips'), async (s, n, size) => tags.duration(await tags.parseStream(s, n, size, false)));

test('길이: 파일 형식별로 맞다', async () => {
  for (const f of ['info.mp3', 'noheader.mp3', 'vbr_art.mp3', 'mono22k.mp3', 'tone.flac', 'tone.ogg', 'tone.opus', 'tone.wav', 'moov_end.m4a', 'moov_start.m4a']) {
    const ms = tags.duration(await tags.parseFile(FIX + f, false));
    assert.ok(Math.abs(ms - 10000) < 800, `${f}: ${ms}`);
  }
});

test('태그: CP949와 UTF-8 글자를 되살리고 영문은 건드리지 않는다', () => {
  assert.equal(tags.fixText(iconv.encode('한글 제목', 'cp949').toString('latin1')), '한글 제목');
  assert.equal(tags.fixText(Buffer.from('한글').toString('latin1')), '한글');
  assert.equal(tags.fixText('Hello'), 'Hello');
  assert.equal(tags.fixText('Beyoncé'), 'Beyoncé');
  assert.equal(tags.fixText('이미 정상'), '이미 정상');
});

test('태그: 폰 앱과 같은 이름으로 나온다', async () => {
  const media = new Media(library);
  const r = await media.tags(fileUri(FIX + 'tag_v24.mp3'));
  assert.ok(r.tags.some(t => t.label === '제목'), JSON.stringify(r.tags));
  assert.ok(r.tech.some(t => t.label === '비트레이트'));
  assert.ok(r.size > 0);
  assert.ok((await media.picture(fileUri(FIX + 'vbr_art.mp3'))).data.length > 0);
});

test('ZIP: 목록, 정렬, CP949 이름, 맥 찌꺼기 제외', async () => {
  const z = await library.open(zipPath);
  assert.deepEqual(z.tracks.map(t => t.title), ['2강', '10강', '3강']);
  assert.equal(z.name, '수업자료');
  for (const t of z.tracks) assert.ok(Math.abs(t.duration - 10000) < 800, `${t.title}: ${t.duration}`);
  assert.match(z.tracks[0].uri, /^zipentry:\/\/[0-9a-f]{16}\/\d{5}\.wav$/);
});

test('ZIP: 두 번째부터는 목록을 다시 만들지 않는다', async () => {
  let slow = 0;
  await library.open(zipPath, () => { slow++; });
  assert.equal(slow, 0);
});

test('ZIP: 압축/무압축 항목 모두 원하는 구간을 정확히 읽는다', async () => {
  const items = await itemsOf(zipPath);
  const stored = items.find(i => i.name === '10강.mp3'), deflated = items.find(i => i.name === '2강.wav');
  assert.ok((await read(await entryStream(zipPath, stored))).equals(mp3));
  assert.ok((await read(await entryStream(zipPath, deflated))).equals(wav));
  assert.ok((await read(await entryStream(zipPath, stored, 100, 199))).equals(mp3.subarray(100, 200)));
  const mid = wav.length >> 1;
  assert.ok((await read(await entryStream(zipPath, deflated, mid, mid + 70000))).equals(wav.subarray(mid, mid + 70001)));
  assert.ok((await read(await entryStream(zipPath, deflated, wav.length - 10, wav.length - 1))).equals(wav.subarray(wav.length - 10)));
});

test('ZIP: 암호, 손상, 빈 ZIP은 알아듣게 거부한다', async () => {
  const locked = path.join(tmp, 'locked.zip');
  makeZip(locked, [{ name: 'a.mp3', data: mp3, encrypted: true }]);
  await assert.rejects(library.open(locked), /암호/);
  const broken = path.join(tmp, 'broken.zip');
  fs.writeFileSync(broken, 'not a zip');
  await assert.rejects(library.open(broken), /손상/);
  const none = path.join(tmp, 'none.zip');
  makeZip(none, [{ name: 'a.txt', data: Buffer.from('x') }]);
  await assert.rejects(library.open(none), /재생할 수 있는/);
});

test('ZIP: 옮겨도 같은 id로 이어진다', async () => {
  const first = await library.open(zipPath);
  const moved = path.join(tmp, 'sub');
  fs.mkdirSync(moved);
  const target = path.join(moved, '수업자료.zip');
  fs.copyFileSync(zipPath, target);
  const again = await library.open(target);
  assert.equal(first.path, again.path);
  assert.equal((await library.load(first.path)).source, target);
  await library.open(zipPath);
});

test('Range: 시크용 부분 응답', async () => {
  const media = new Media(library);
  const uri = fileUri(FIX + 'info.mp3');
  const r = await media.respond(uri, 'bytes=10-19');
  assert.equal(r.status, 206);
  assert.equal(r.headers.get('content-range'), `bytes 10-19/${mp3.length}`);
  assert.ok(Buffer.from(await r.arrayBuffer()).equals(mp3.subarray(10, 20)));
  assert.equal((await media.respond(uri, `bytes=${mp3.length}-`)).status, 416);
  assert.equal((await media.respond(uri)).status, 200);
  const z = await library.open(zipPath);
  const part = await media.respond(z.tracks[0].uri, 'bytes=1000-');
  assert.equal(Buffer.from(await part.arrayBuffer()).length, wav.length - 1000);
});

test('경로 계산', () => {
  assert.equal(clean('D:\\Music\\'), 'D:/Music');
  assert.equal(clean('d:\\'), 'D:/');
  assert.equal(parentOf('D:/'), '');
  assert.equal(parentOf('D:/Music'), 'D:/');
  assert.equal(parentOf('D:/Music/a'), 'D:/Music');
});

test('끌어다 놓은 폴더와 파일을 곡으로 모은다', async () => {
  const dir = path.join(tmp, 'lib');
  fs.mkdirSync(path.join(dir, '앨범 #1'), { recursive: true });
  fs.mkdirSync(path.join(dir, '.숨김'));
  fs.copyFileSync(FIX + 'tag_v24.mp3', path.join(dir, '앨범 #1', '100% 곡.mp3'));
  fs.copyFileSync(FIX + 'tone.flac', path.join(dir, '2.flac'));
  fs.copyFileSync(FIX + 'tone.wav', path.join(dir, '10.wav'));
  fs.copyFileSync(FIX + 'tone.wav', path.join(dir, '.숨김', 'x.wav'));
  fs.writeFileSync(path.join(dir, 'a.wma'), 'x'); fs.writeFileSync(path.join(dir, 'b.egg'), 'x'); fs.writeFileSync(path.join(dir, 'c.txt'), 'x');
  fs.copyFileSync(zipPath, path.join(dir, 'z.zip'));
  const c = new Collector({ zips: library, cache: new ProbeCache(path.join(tmp, 'cache.json')) });

  const r = await c.collect([dir]);
  assert.deepEqual(r.tracks.map(t => t.title).slice(0, 3), ['2', '10', '100% 곡']);
  assert.equal(r.tracks.length, 6, '폴더, 하위 폴더, ZIP의 곡이 모두 들어온다');
  assert.deepEqual(r.skipped, { WMA: 1, EGG: 1 });
  assert.deepEqual(r.errors, []);
  assert.equal(r.tracks[2].place, '앨범 #1');
  assert.ok(r.tracks[2].dir.endsWith('/lib/앨범 #1'));
  assert.ok((await new Media(library).source(r.tracks[2].uri)).size > 0, '특수문자 파일명');
  const inZip = r.tracks[3];
  assert.ok(inZip.uri.startsWith('zipentry:') && inZip.dir.startsWith('zip:'));
  assert.equal(inZip.place, 'z');

  const one = await c.collect([path.join(dir, '2.flac')]);
  assert.deepEqual(one.tracks.map(t => t.title), ['2']);
  const order = await c.collect([path.join(dir, '10.wav'), path.join(dir, '2.flac')]);
  assert.deepEqual(order.tracks.map(t => t.title), ['2', '10'], '고른 순서와 상관없이 이름순');
});

test('열 수 없는 파일은 이유를 알려 주고 나머지는 넣는다', async () => {
  const dir = path.join(tmp, 'bad');
  fs.mkdirSync(dir);
  fs.writeFileSync(path.join(dir, 'broken.zip'), 'not a zip');
  fs.copyFileSync(FIX + 'tone.wav', path.join(dir, 'ok.wav'));
  const c = new Collector({ zips: library, cache: new ProbeCache(path.join(tmp, 'c2.json')) });
  const r = await c.collect([dir, path.join(dir, '없음.mp3')]);
  assert.deepEqual(r.tracks.map(t => t.title), ['ok']);
  assert.equal(r.errors.length, 2);
  assert.ok(r.errors.some(e => e.startsWith('broken.zip: ') && /손상/.test(e)));
  assert.ok(r.errors.some(e => /찾을 수 없습니다/.test(e)));
});
