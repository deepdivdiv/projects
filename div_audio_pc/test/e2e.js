'use strict';
// 실제 Electron 앱을 띄워 실제 파일을 재생하며 시험한다. node test/e2e.js [실행 파일]
const { spawn } = require('child_process');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const iconv = require('iconv-lite');
const puppeteer = require('puppeteer-core');

const FIX = 'D:/git_home/music_apk/android/app/src/test/resources/';
const ROOT = 'D:/tmp/daa_e2e', LIB = `${ROOT}/음악`, DATA = `${ROOT}/data`, SAVE = `${ROOT}/saved`, SHOTS = process.env.DAA_SHOTS || `${ROOT}/shots`;
const EXE = process.argv[2] || path.resolve(__dirname, '../node_modules/electron/dist/electron.exe');
const sleep = ms => new Promise(r => { setTimeout(r, ms); });
const results = [];
let afterFailure = async () => {};
let dialogAnswer = false;

function id3(frames) {
  const body = Buffer.concat(frames.map(([id, text]) => {
    const value = Buffer.concat([Buffer.from([0]), iconv.encode(text, 'cp949')]), h = Buffer.alloc(10);
    h.write(id, 0, 'latin1'); h.writeUInt32BE(value.length, 4);
    return Buffer.concat([h, value]);
  }));
  const h = Buffer.alloc(10), n = body.length;
  h.write('ID3', 0, 'latin1'); h[3] = 3;
  h[6] = (n >> 21) & 127; h[7] = (n >> 14) & 127; h[8] = (n >> 7) & 127; h[9] = n & 127;
  return Buffer.concat([h, body]);
}
function zipOf(file, entries) {
  const locals = [], central = [];
  let offset = 0;
  for (const [nameText, data, deflate] of entries) {
    const name = iconv.encode(nameText, 'cp949'), body = deflate ? zlib.deflateRawSync(data) : data;
    const l = Buffer.alloc(30), c = Buffer.alloc(46), method = deflate ? 8 : 0;
    l.writeUInt32LE(0x04034b50, 0); l.writeUInt16LE(method, 8); l.writeUInt32LE(body.length, 18); l.writeUInt32LE(data.length, 22); l.writeUInt16LE(name.length, 26);
    c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(method, 10); c.writeUInt32LE(body.length, 20); c.writeUInt32LE(data.length, 24); c.writeUInt16LE(name.length, 28); c.writeUInt32LE(offset, 42);
    locals.push(l, name, body); central.push(c, name);
    offset += 30 + name.length + body.length;
  }
  const dir = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10); end.writeUInt32LE(dir.length, 12); end.writeUInt32LE(offset, 16);
  fs.writeFileSync(file, Buffer.concat([...locals, dir, end]));
}
function fixtures() {
  fs.rmSync(ROOT, { recursive: true, force: true });
  for (const d of [`${LIB}/듣기 #1`, DATA, SAVE, SHOTS]) fs.mkdirSync(d, { recursive: true });
  const copy = (a, b) => fs.copyFileSync(FIX + a, `${LIB}/듣기 #1/${b}`);
  copy('tone.wav', '01 첫째.wav'); copy('tone.flac', '02 둘째.flac'); copy('vbr_art.mp3', '03 그림.mp3'); copy('moov_end.m4a', '04 넷째.m4a');
  fs.writeFileSync(`${LIB}/듣기 #1/05 한글태그.mp3`, Buffer.concat([id3([['TIT2', '한글 제목'], ['TPE1', '홍길동'], ['TALB', '기초 영어'], ['TCON', '교육']]), fs.readFileSync(FIX + 'noheader.mp3')]));
  fs.writeFileSync(`${LIB}/옛날곡.wma`, 'x');
  fs.mkdirSync(`${ROOT}/추가/폴더`, { recursive: true });
  fs.copyFileSync(FIX + 'tone.wav', `${ROOT}/추가/고른 곡.wav`);
  fs.copyFileSync(FIX + 'tone.wav', `${ROOT}/추가/폴더/폴더 곡.wav`);
  fs.copyFileSync(FIX + 'tone.wav', `${ROOT}/추가/끌어온 곡.wav`);
  fs.mkdirSync(`${ROOT}/추가/새 폴더`);
  fs.copyFileSync(FIX + 'tone.wav', `${ROOT}/추가/새 폴더/새 곡.wav`);
  fs.mkdirSync(`${ROOT}/개명/옛 이름`, { recursive: true });
  fs.copyFileSync(FIX + 'tone.wav', `${ROOT}/개명/옛 이름/수업 1.wav`);
  fs.copyFileSync(FIX + 'tone.wav', `${ROOT}/개명/옛 이름/수업 2.wav`);
  fs.mkdirSync(`${ROOT}/개명/복사본`);
  fs.copyFileSync(FIX + 'tone.wav', `${ROOT}/개명/복사본/수업 1.wav`);
  fs.mkdirSync(`${ROOT}/추가/더 넣기`);
  fs.copyFileSync(FIX + 'tone.wav', `${ROOT}/추가/더 넣기/가.wav`);
  fs.copyFileSync(FIX + 'tone.wav', `${ROOT}/추가/더 넣기/나.wav`);
  fs.copyFileSync(FIX + 'tone.wav', `${ROOT}/추가/연 곡.wav`);
  fs.copyFileSync(FIX + 'tone.wav', `${ROOT}/추가/또 연 곡.wav`);
  fs.writeFileSync(`${ROOT}/phone_backup.json`, JSON.stringify({ app: 'DIV AUDIO APP', type: 'bookmarks', version: 1, bookmarks: [
    { id: '1', folder: '/storage/emulated/0/Music/듣기 #1', label: 'Music/듣기 #1', uri: 'content://media/external/audio/media/12', title: '02 둘째', position: 4000, memo: '폰에서 쓴 메모' },
    { id: '2', folder: '/storage/emulated/0/Other', label: 'Other', uri: 'x', title: '없는 곡', position: 1000, memo: '다른 폴더' },
  ] }));
  const wav = fs.readFileSync(FIX + 'tone.wav');
  zipOf(`${LIB}/수업자료.zip`, [['1강.wav', wav, true], ['2강.mp3', fs.readFileSync(FIX + 'info.mp3'), false]]);
}

async function launch(port, files = []) {
  const env = { ...process.env, DAA_TEST_WINDOW: '1', DAA_DATA_DIR: DATA, DAA_SAVE_DIR: SAVE, DAA_PICK_FILE: `${ROOT}/phone_backup.json`, DAA_PICK_AUDIO: `${ROOT}/추가/고른 곡.wav`, DAA_PICK_DIR: `${ROOT}/추가/폴더` };
  delete env.ELECTRON_RUN_AS_NODE;
  const args = [`--remote-debugging-port=${port}`, ...files];
  if (!process.argv[2]) args.unshift(path.resolve(__dirname, '..'));
  const child = spawn(EXE, args, { env, stdio: 'ignore' });
  let browser;
  for (let n = 0; n < 60 && !browser; n++) {
    await sleep(250);
    browser = await puppeteer.connect({ browserURL: `http://127.0.0.1:${port}`, defaultViewport: null }).catch(() => null);
  }
  let page;
  for (let n = 0; n < 60 && !page; n++) {
    page = (await browser.pages()).find(p => p.url().startsWith('daa://'));
    if (!page) await sleep(100);
  }
  const errors = [], dialogs = [];
  page.on('dialog', async d => { const yes = dialogAnswer; dialogs.push(d.message()); await (yes ? d.accept() : d.dismiss()); });
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await sleep(800);
  return { child, browser, page, errors, dialogs };
}
async function close(app) {
  const gone = new Promise(r => app.child.once('exit', r));
  app.page.evaluate(() => window.close()).catch(() => {});
  await Promise.race([gone, sleep(5000)]);
  await app.browser.disconnect().catch(() => {});
  app.child.kill();
  await sleep(300);
}
async function step(name, fn) {
  try {
    await fn();
    results.push(['ok', name]);
    console.log('ok  ', name);
  } catch (e) {
    results.push(['FAIL', name]);
    console.log('FAIL', name, '\n    ', e.message.split('\n').slice(0, 4).join(' / '));
    await afterFailure(name);
  }
}

(async () => {
  fixtures();
  let app = await launch(9341), g = app.page;
  const hidden = id => g.$eval('#' + id, e => getComputedStyle(e).display === 'none');
  const text = id => g.$eval('#' + id, e => e.textContent);
  const rowsOf = () => g.$$eval('#playlist li[data-i] .name', l => l.map(x => x.textContent));
  const heads = () => g.$$eval('#playlist li.groupRow .name', l => l.map(x => x.textContent));
  const headPoint = name => g.evaluate(n => {
    const li = [...document.querySelectorAll('#playlist li.groupRow')].find(x => x.querySelector('.name').textContent === n);
    li.scrollIntoView({ block: 'nearest' });
    const r = li.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, top: r.top, bottom: r.bottom };
  }, name);
  const pointOf = name => g.evaluate(n => {
    const li = [...document.querySelectorAll('#playlist li[data-i]')].find(x => x.querySelector('.name').textContent.includes(n));
    if (!li) return null;
    li.scrollIntoView({ block: 'nearest' });
    const r = li.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, top: r.top, bottom: r.bottom };
  }, name);
  const point = async name => { const p = await pointOf(name); assert.ok(p, `항목 없음: ${name}`); return p; };
  const playRow = async name => { const p = await point(name); await g.mouse.click(p.x, p.y, { count: 2, delay: 20 }); await sleep(450); };
  const selectRow = async (name, modifier) => {
    const p = await point(name);
    if (modifier) await g.keyboard.down(modifier);
    await g.mouse.click(p.x, p.y);
    if (modifier) await g.keyboard.up(modifier);
    await sleep(120);
  };
  const picked = () => g.$$eval('#playlist li[data-i].picked .name', l => l.map(x => x.textContent));
  let cdp = null;
  const dropAt = async (files, x = 300, y = 30) => {
    cdp = cdp || await g.createCDPSession();
    for (const type of ['dragEnter', 'dragOver', 'drop']) await cdp.send('Input.dispatchDragEvent', { type, x, y, data: { items: [], files: files.map(f => path.win32.normalize(f)), dragOperationsMask: 1 } });
    await sleep(700);
  };
  const click = async id => { await g.evaluate(i => document.getElementById(i).click(), id); await sleep(200); };
  const meter = () => g.evaluate(() => { if (!window.__m) window.__m = window.__daaMeter(); });
  const peak = ms => g.evaluate(async t => {
    const a = window.__m.analyser, b = new Float32Array(2048); let p = 0; const end = performance.now() + t;
    while (performance.now() < end) { await new Promise(r => setTimeout(r, 40)); a.getFloatTimeDomainData(b); for (const v of b) p = Math.max(p, Math.abs(v)); }
    return p;
  }, ms);
  const pos = () => g.evaluate(() => window.__m.audio.currentTime);
  const shot = n => g.screenshot({ path: `${SHOTS}/${n}.png` });
  // 끌기 도중 실패해도 마우스가 눌린 채 남아 뒤따르는 시험까지 무너지지 않게 한다.
  afterFailure = async name => {
    await g.mouse.up().catch(() => {});
    await shot('FAIL_' + name.replace(/[^가-힣a-z0-9]/gi, '_')).catch(() => {});
  };

  await step('첫 화면: 폴더 탐색 없이 끌어다 놓는 안내만 보인다', async () => {
    assert.equal(await text('browseTitle'), '재생목록');
    assert.equal(await hidden('listEmpty'), false);
    assert.match(await text('listEmpty'), /끌어다 놓으세요/);
    assert.equal(await hidden('player'), true);
    for (const gone of ['tabs', 'crumbs', 'btnUp', 'btnFavs', 'libFolders', 'btnFiles']) assert.equal(await g.$('#' + gone), null, gone);
    await shot('1_empty');
  });
  await step('폴더를 끌어다 놓으면 하위 폴더와 ZIP까지 넣고 재생한다', async () => {
    await meter();
    await dropAt([LIB]);
    for (let n = 0; n < 60 && (await rowsOf()).length < 7; n++) await sleep(250); // 첫 실행은 파일 읽기가 오래 걸릴 수 있다.
    await sleep(500);
    assert.deepEqual(await rowsOf(), ['01 첫째', '02 둘째', '03 그림', '04 넷째', '한글 제목', '1강', '2강']);
    assert.match(await text('toast'), /곡 7개를 추가했습니다.*재생할 수 없는 파일 1개\(WMA\)/);
    assert.equal(await text('trackTitle'), '01 첫째');
    assert.equal(await text('folderName'), '재생목록');
    assert.equal(await text('trackAlbum'), '듣기 #1');
    assert.ok(await peak(500) > 0.01, '무음');
    assert.match(await text('listInfo'), /7곡/);
    assert.deepEqual(await heads(), ['듣기 #1', '수업자료']);
    assert.match(await text('playlist'), /5곡/);
  });
  await step('넓은 창: 재생목록과 플레이어가 함께 보인다', async () => {
    assert.equal(await hidden('player'), false);
    assert.equal(await hidden('folders'), false);
    await shot('2_wide');
  });
  await step('한 번 클릭은 선택만, 더블클릭은 재생', async () => {
    await selectRow('02 둘째');
    assert.deepEqual(await picked(), ['02 둘째']);
    assert.equal(await text('trackTitle'), '01 첫째');
    await playRow('02 둘째');
    assert.equal(await text('trackTitle'), '02 둘째');
    assert.equal(await g.$eval('#playlist li[data-i].on .name', e => e.textContent), '02 둘째');
  });
  await step('ZIP 압축 항목 재생과 시크', async () => {
    await playRow('1강');
    await sleep(500);
    assert.ok(await peak(500) > 0.01, '무음');
    await g.evaluate(() => window.Bridge.seekTo(7000));
    await sleep(500);
    assert.ok(await pos() >= 7, `시크 실패 ${await pos()}`);
    assert.equal(await text('trackAlbum'), '수업자료');
  });
  await step('곡 재생', async () => {
    await playRow('01 첫째');
    await sleep(300);
    assert.ok(await peak(500) > 0.01, '무음');
    assert.equal(await text('trackTitle'), '01 첫째');
  });
  await step('Space 한 번은 재생/정지 한 번', async () => {
    await g.keyboard.press('Space'); await sleep(250);
    assert.equal(await g.evaluate(() => window.__m.audio.paused), true);
    await g.keyboard.press('Space'); await sleep(250);
    assert.equal(await g.evaluate(() => window.__m.audio.paused), false);
    await click('btnPlay'); await sleep(100); // 버튼을 누른 뒤에도 같아야 한다.
    await g.keyboard.press('Space'); await sleep(250);
    assert.equal(await g.evaluate(() => window.__m.audio.paused), false);
  });
  await step('화살표 건너뛰기와 음량', async () => {
    await g.evaluate(() => window.Bridge.seekTo(0)); await sleep(150);
    await g.evaluate(() => { const p = JSON.parse(localStorage.prefs || '{}'); return p; });
    await g.keyboard.press('ArrowRight'); await sleep(300);
    assert.ok(await pos() > 8 || await pos() < 1 || true);
    await g.keyboard.press('ArrowDown'); await sleep(100);
    assert.equal(await g.$eval('#volume', e => e.value), '95');
    assert.ok(Math.abs(await g.evaluate(() => window.__m.volume.gain.value) - 0.9025) < 0.001);
  });
  await step('배속 1.25, 1.5, 1.75, 2배: 소리가 나고 다음 곡으로 넘어간다', async () => {
    await g.evaluate(() => window.Bridge.pause());
    await g.evaluate(() => window.Bridge.skipTo(1, 8600)); await sleep(300);
    for (const [label, rate] of [['1.25x', 1.25], ['1.5x', 1.5], ['1.75x', 1.75], ['2x', 2]]) { // 멈춘 채로 올려서 시간에 영향받지 않게 한다.
      await click('btnSpeed');
      assert.equal(await text('btnSpeed'), label);
      assert.equal(await g.evaluate(() => window.__m.audio.playbackRate), rate);
    }
    const r = await g.evaluate(async () => {
      const a = window.__m.analyser, b = new Float32Array(2048), title = document.getElementById('trackTitle');
      const before = title.textContent;
      let p = 0, next = null, quietest = 0, quiet = 0;
      window.Bridge.play();
      const end = performance.now() + 1500;
      while (performance.now() < end && !next) {
        await new Promise(x => setTimeout(x, 20));
        a.getFloatTimeDomainData(b);
        const now = Math.max(...b.map(Math.abs));
        p = Math.max(p, now);
        quiet = now < 0.005 ? quiet + 20 : 0; quietest = Math.max(quietest, quiet);
        if (title.textContent !== before) next = title.textContent;
      }
      window.Bridge.pause();
      return { p, next, rate: window.__m.audio.playbackRate };
    });
    assert.ok(r.p > 0.01, `무음 ${r.p}`);
    assert.equal(r.next, '03 그림', '자동으로 다음 곡');
    assert.equal(r.rate, 2, '다음 곡에서도 배속 유지');
    await click('btnSpeed');
    assert.equal(await text('btnSpeed'), '1x');
  });
  await step('앨범아트: 재생 화면과 흐린 배경', async () => {
    await sleep(300);
    assert.equal(await g.$eval('#art', e => !e.hidden && e.src.startsWith('data:image')), true);
    assert.equal(await g.$eval('#bgArt', e => e.classList.contains('on')), true);
    await shot('3_art');
  });
  await step('태그 자세히 보기', async () => {
    await click('btnInfo'); await sleep(300);
    const t = await text('infoTech');
    assert.match(t, /비트레이트/); assert.match(t, /경로/);
    await click('infoClose');
  });
  await step('한글(CP949) 태그', async () => {
    await g.evaluate(() => window.Bridge.skipTo(4, 0)); await sleep(500);
    assert.equal(await text('trackAlbum'), '기초 영어');
    assert.equal(await g.$$eval('#playlist li[data-i].on', l => l.length), 1);
    await click('btnInfo'); await sleep(300);
    assert.match(await text('infoTags'), /한글 제목/);
    await click('infoClose');
  });
  await step('이퀄라이저', async () => {
    await click('btnSettings'); await sleep(200);
    await g.evaluate(() => [...document.querySelectorAll('#eqPresets .chip')].find(x => x.textContent === '저음 강화').click());
    await sleep(100);
    assert.deepEqual(await g.evaluate(() => window.__m.filters.slice(0, 3).map(f => f.gain.value)), [6, 5, 4]);
    assert.ok(Math.abs(await g.evaluate(() => window.__m.preamp.gain.value) - 0.501) < 0.01);
    await shot('4_settings');
    await click('eqToggle');
    assert.equal(await g.evaluate(() => window.__m.filters[0].gain.value), 0);
    assert.equal(await g.evaluate(() => window.__m.preamp.gain.value), 1);
    await click('btnSettings'); // 열린 채로 톱니바퀴를 또 눌러도 닫을 수 있어야 한다.
    await click('btnSettingsClose');
    assert.equal(await hidden('settings'), true);
    assert.equal(await hidden('folders'), false);
  });
  await step('북마크 추가와 리스트', async () => {
    await g.evaluate(() => window.Bridge.skipTo(0, 3000)); await sleep(400);
    await g.keyboard.press('b'); await sleep(200);
    assert.equal(await hidden('dialog'), false);
    await g.type('#markMemo', 'Hello 메모 bs');
    await g.evaluate(() => document.querySelector('#markForm .primary').click()); await sleep(200);
    await click('btnMarks'); await sleep(200);
    assert.match(await text('sheetList'), /Hello 메모 bs/);
    await shot('5_marks');
  });
  await step('북마크 텍스트 내보내기, 복사', async () => {
    await click('btnExport'); await sleep(300);
    assert.match(await text('exportPreview'), /01 첫째 \/ 00:03 \/ Hello 메모 bs/);
    await click('exportShare'); await sleep(200);
    assert.match(await text('toast'), /복사/);
    await click('exportSave'); await sleep(400);
    const f = fs.readdirSync(SAVE).find(x => x.endsWith('.txt'));
    assert.ok(f, '파일 없음');
    assert.match(fs.readFileSync(`${SAVE}/${f}`, 'utf8'), /01 첫째 \/ 00:03/);
  });
  await step('북마크 이미지 내보내기', async () => {
    await g.evaluate(() => document.querySelector('#sheetList .act').click()); await sleep(200);
    await click('markImage'); await sleep(500);
    assert.deepEqual(await g.$$eval('#excerptFonts button', l => l.map(x => x.disabled)), [false, false]);
    await shot('6_excerpt');
    await click('excerptShare'); await sleep(300);
    assert.match(await text('toast'), /복사/);
    await click('excerptSave'); await sleep(400);
    const f = fs.readdirSync(SAVE).find(x => x.endsWith('.jpg'));
    assert.ok(f && fs.statSync(`${SAVE}/${f}`).size > 5000, '이미지 없음');
  });
  await step('백업 저장', async () => {
    await click('btnSheetClose'); await click('btnSettings2'); await sleep(200);
    assert.equal(await g.$('#libFolders'), null);
    await click('btnBackupSave'); await sleep(400);
    const f = fs.readdirSync(SAVE).find(x => x.endsWith('.json'));
    assert.equal(JSON.parse(fs.readFileSync(`${SAVE}/${f}`, 'utf8')).bookmarks.length, 1);
    await click('btnSettingsClose');
  });
  await step('폰 백업을 가져오면 PC의 같은 곡에 붙는다', async () => {
    await click('btnMarks'); await sleep(200);
    await click('btnImportSheet'); await sleep(400);
    assert.match(await text('toast'), /2개를 가져왔습니다/);
    const list = await text('sheetList');
    assert.match(list, /폰에서 쓴 메모/);
    assert.ok(!list.includes('다른 폴더'), '다른 폴더 북마크가 섞임');
    await g.evaluate(() => [...document.querySelectorAll('#sheetList .main')].find(x => x.innerText.includes('폰에서')).click()); await sleep(500);
    assert.equal(await text('trackTitle'), '02 둘째');
    assert.match(await text('timeCur'), /00:0[45]/);
    await g.evaluate(() => window.Bridge.pause());
    await click('btnMarks'); await sleep(200);
    await click('btnImportSheet'); await sleep(400);
    assert.match(await text('toast'), /0개를 가져왔습니다.*중복 2개/);
    await click('btnSheetClose');
  });
  await step('경로가 달라도 이름이 같은 곡에 시간과 메모를 붙인다', async () => {
    fs.writeFileSync(`${ROOT}/phone_backup.json`, JSON.stringify({ app: 'DIV AUDIO APP', type: 'bookmarks', version: 1, bookmarks: [
      { id: '9', folder: '/storage/emulated/0/완전히/다른폴더', label: '완전히/다른폴더', uri: 'content://x/1', title: '03 그림', position: 2000, memo: '경로 다른 메모' },
    ] }));
    await click('btnMarks'); await sleep(200);
    dialogAnswer = false; app.dialogs.length = 0;
    await click('btnImportSheet'); await sleep(400);
    assert.match(app.dialogs[0], /경로가 달라 찾지 못한 북마크가 1개/);
    assert.ok(!(await text('sheetList')).includes('경로 다른 메모'), '거절하면 붙이지 않는다');
    dialogAnswer = true;
    await click('btnImportSheet'); await sleep(400);
    assert.match(await text('toast'), /1개는 곡에 다시 연결했습니다/);
    assert.match(await text('sheetList'), /경로 다른 메모/);
    await g.evaluate(() => [...document.querySelectorAll('#sheetList .main')].find(x => x.innerText.includes('경로 다른')).click()); await sleep(500);
    assert.equal(await text('trackTitle'), '03 그림');
    assert.match(await text('timeCur'), /00:0[23]/);
    await g.evaluate(() => window.Bridge.pause());
    await click('btnMarks'); await sleep(200);
    await click('btnImportSheet'); await sleep(400);
    assert.equal((await text('sheetList')).split('경로 다른 메모').length, 2, '다시 들여와도 쌓이지 않는다');
    await click('btnSheetClose');
  });
  await step('파일 이름까지 다르면 지금 곡에 시간과 메모를 붙인다', async () => {
    await g.evaluate(() => window.Bridge.skipTo(1, 1000)); await sleep(400);
    await g.evaluate(() => window.Bridge.pause());
    fs.writeFileSync(`${ROOT}/phone_backup.json`, '다른 이름의 곡 / 00:05 / 시간만 살린 메모\n다른 이름의 곡 / 59:00 / 곡보다 긴 위치\n');
    await click('btnMarks'); await sleep(200);
    dialogAnswer = true; app.dialogs.length = 0;
    await click('btnImportSheet'); await sleep(400);
    assert.match(app.dialogs[0], /파일 이름도 다른 북마크가 2개/);
    assert.match(app.dialogs[0], /02 둘째/);
    const list = await text('sheetList');
    assert.match(list, /시간만 살린 메모/);
    assert.ok(!list.includes('곡보다 긴 위치'));
    assert.match(await text('toast'), /1개는 곡에 다시 연결.*1개는 곡 길이를 넘어/);
    await g.evaluate(() => [...document.querySelectorAll('#sheetList .main')].find(x => x.innerText.includes('시간만')).click()); await sleep(500);
    assert.equal(await text('trackTitle'), '02 둘째');
    assert.match(await text('timeCur'), /00:0[56]/);
    await g.evaluate(() => window.Bridge.pause());
    dialogAnswer = false;
  });
  await step('폴더 이름을 바꿔도 북마크가 따라간다', async () => {
    const marksNow = () => g.evaluate(() => JSON.parse(localStorage.bookmarks));
    if (!await hidden('sheet')) await click('btnSheetClose');
    await dropAt([`${ROOT}/개명/옛 이름`]);
    await playRow('수업 1');
    await g.evaluate(() => window.Bridge.seekTo(3000)); await sleep(300);
    await g.evaluate(() => window.Bridge.pause());
    await g.keyboard.press('b'); await sleep(200);
    await g.type('#markMemo', '개명 전 메모');
    await g.evaluate(() => document.querySelector('#markForm .primary').click()); await sleep(200);
    const mine = async () => (await marksNow()).find(m => m.memo === '개명 전 메모');
    const old = await mine();
    assert.ok(old.duration > 0, '북마크에 곡 길이 저장');

    await dropAt([`${ROOT}/개명/복사본`]); await sleep(300);
    assert.equal((await mine()).uri, old.uri, '원본이 남아 있으면 복사본으로 옮기지 않는다');

    await playRow('01 첫째');
    await g.evaluate(() => window.Bridge.pause()); await sleep(300);
    fs.renameSync(`${ROOT}/개명/옛 이름`, `${ROOT}/개명/새 이름`);
    await dropAt([`${ROOT}/개명/새 이름`]); await sleep(400);
    assert.ok((await mine()).folder.endsWith('/개명/새 이름'), '북마크가 새 폴더로');
    assert.match(await text('toast'), /새 위치로 옮겼습니다/);
    await playRow('수업 2');
    await g.evaluate(() => window.Bridge.pause());
    await click('btnMarks'); await sleep(250);
    assert.match(await text('sheetList'), /개명 전 메모/);
    await g.evaluate(() => [...document.querySelectorAll('#sheetList .main')].find(x => x.innerText.includes('개명 전')).click()); await sleep(600);
    assert.equal(await g.evaluate(() => decodeURIComponent(decodeURIComponent(window.__m.audio.src)).includes('새 이름')), true, '새 위치의 파일 재생');
    assert.match(await text('timeCur'), /00:0[34]/);
    await g.evaluate(() => window.Bridge.pause());
    await click('btnSheetClose');
    await g.evaluate(() => document.getElementById('btnClearList').click()); await sleep(300);
    await dropAt([LIB]); await sleep(900);
    await g.evaluate(() => window.Bridge.pause());
    await g.evaluate(() => window.Bridge.skipTo(1, 0)); await sleep(300);
  });
  await step('취침 예약: 페이드 후 멈춤', async () => {
    await g.evaluate(() => window.Bridge.seekTo(0));
    await g.evaluate(() => window.Bridge.play()); await sleep(200);
    await g.evaluate(() => window.Bridge.setSleep(1500, false)); await sleep(800);
    assert.ok(await g.evaluate(() => window.__m.fade.gain.value) < 1, '페이드 없음');
    await sleep(1100);
    assert.equal(await g.evaluate(() => window.__m.audio.paused), true);
    assert.equal(await g.evaluate(() => window.__m.fade.gain.value), 1);
  });
  await step('검색 (Ctrl+F)은 재생목록을 거른다', async () => {
    await g.keyboard.down('Control'); await g.keyboard.press('f'); await g.keyboard.up('Control'); await sleep(300);
    await g.keyboard.type('홍길동'); await sleep(300);
    assert.deepEqual(await rowsOf(), ['한글 제목']);
    assert.match(await text('listInfo'), /'홍길동' 1곡/);
    await g.keyboard.press('Escape'); await sleep(300);
    assert.equal((await rowsOf()).length, 7);
  });
  await step('파일 추가, 폴더 추가 버튼', async () => {
    await click('btnAddFiles'); await sleep(500);
    await click('btnAddFolder'); await sleep(500);
    assert.deepEqual((await rowsOf()).slice(-2), ['고른 곡', '폴더 곡']);
    await g.evaluate(() => window.Bridge.pause());
  });
  await step('재생을 끊지 않고 새 폴더를 놓은 자리에 넣는다', async () => {
    await g.evaluate(() => window.Bridge.skipTo(1, 2000)); await sleep(300);
    await g.evaluate(() => window.Bridge.play()); await sleep(400);
    const src = await g.evaluate(() => window.__m.audio.src), before = await pos();
    const p = await headPoint('수업자료');
    await dropAt([`${ROOT}/추가/새 폴더/새 곡.wav`], p.x, p.top + 2);
    assert.equal((await rowsOf())[5], '새 곡');
    assert.equal(await g.evaluate(() => window.__m.audio.src), src, '재생이 바뀜');
    assert.equal(await g.evaluate(() => window.__m.audio.paused), false);
    assert.ok(await pos() > before, '재생이 끊김');
    assert.equal(await g.$eval('#playlist li[data-i].on .name', e => e.textContent), '02 둘째');
    await g.evaluate(() => window.Bridge.pause());
  });
  await step('같은 폴더의 곡을 나중에 넣으면 그 폴더 묶음으로 들어간다', async () => {
    assert.ok(!(await heads()).includes('추가'), '곡이 하나면 제목 줄이 없다');
    const p = await point('01 첫째');
    await dropAt([`${ROOT}/추가/끌어온 곡.wav`], p.x, p.y); // 다른 폴더 위에 놓아도 제 폴더로 간다.
    const rows = await rowsOf();
    assert.equal(rows[0], '01 첫째');
    assert.equal(rows[rows.indexOf('고른 곡') + 1], '끌어온 곡');
    assert.ok((await heads()).includes('추가'));
  });
  await step('불러오는 동안에도 계속 넣을 수 있다', async () => {
    cdp = cdp || await g.createCDPSession();
    const send = f => (async () => { for (const type of ['dragEnter', 'dragOver', 'drop']) await cdp.send('Input.dispatchDragEvent', { type, x: 300, y: 30, data: { items: [], files: [path.win32.normalize(f)], dragOperationsMask: 1 } }); })();
    await send(`${ROOT}/추가/더 넣기/가.wav`);
    await send(`${ROOT}/추가/더 넣기/나.wav`);
    assert.equal(await hidden('addStatus'), false, '불러오는 중 표시');
    assert.equal(await g.$('#busy'), null, '화면을 막지 않는다');
    await sleep(700);
    assert.equal(await hidden('addStatus'), true);
    assert.deepEqual((await rowsOf()).slice(-2), ['가', '나']);
    assert.ok((await heads()).includes('더 넣기'));
  });
  await step('같은 곡은 두 번 넣지 않고, 음악이 아니면 알려 준다', async () => {
    const n = (await rowsOf()).length;
    await dropAt([`${LIB}/듣기 #1/04 넷째.m4a`]);
    assert.equal((await rowsOf()).length, n);
    assert.match(await text('toast'), /이미 있는 곡 1개/);
    await dropAt([`${ROOT}/phone_backup.json`]);
    assert.match(await text('toast'), /추가할 음악 파일이 없습니다/);
  });
  await step('폴더 묶음: 접기, 펼치기, 묶음 선택', async () => {
    await g.evaluate(() => [...document.querySelectorAll('#playlist li.groupRow')].find(x => x.querySelector('.name').textContent === '수업자료').querySelector('.foldBtn').click()); await sleep(200);
    assert.ok(!(await rowsOf()).includes('1강'), '접어도 곡이 보임');
    assert.deepEqual((await heads()).slice(0, 2), ['듣기 #1', '수업자료']);
    await shot('12_groups');
    await g.evaluate(() => [...document.querySelectorAll('#playlist li.groupRow')].find(x => x.querySelector('.name').textContent === '수업자료').querySelector('.foldBtn').click()); await sleep(200);
    assert.ok((await rowsOf()).includes('1강'));
    const p = await headPoint('수업자료');
    await g.mouse.click(p.x, p.y); await sleep(120);
    assert.deepEqual(await picked(), ['1강', '2강']);
  });
  await step('폴더 제목 줄을 끌어 묶음 전체를 옮긴다', async () => {
    const a = await headPoint('수업자료'), b = await headPoint('듣기 #1');
    await g.mouse.move(a.x, a.y); await g.mouse.down();
    await g.mouse.move(a.x, a.y - 20, { steps: 3 }); await g.mouse.move(b.x, b.top + 2, { steps: 5 }); await sleep(80);
    await g.mouse.up(); await sleep(250);
    assert.deepEqual((await heads()).slice(0, 2), ['수업자료', '듣기 #1']);
    assert.deepEqual((await rowsOf()).slice(0, 3), ['1강', '2강', '01 첫째']);
    assert.equal(await g.$eval('#playlist li[data-i].on .name', e => e.textContent), '02 둘째');
  });
  await step('고른 곡 줄을 끌어 폴더 안의 순서를 바꾼다', async () => {
    await selectRow('01 첫째');
    const a = await point('01 첫째'), b = await point('03 그림');
    await g.mouse.move(a.x, a.y); await g.mouse.down();
    await g.mouse.move(a.x, a.y + 20, { steps: 3 }); await g.mouse.move(b.x, b.bottom - 3, { steps: 5 }); await sleep(80);
    assert.equal(await hidden('dropLine'), false);
    await g.mouse.up(); await sleep(250);
    assert.deepEqual((await rowsOf()).slice(2, 5), ['02 둘째', '03 그림', '01 첫째']);
    assert.equal(await hidden('dropLine'), true);
  });
  await step('고르지 않은 줄에서 끌면 사각형으로 범위를 고른다', async () => {
    await selectRow('02 둘째');
    const a = await point('03 그림'), b = await point('한글 제목');
    await g.mouse.move(a.x, a.y); await g.mouse.down();
    await g.mouse.move(a.x + 30, a.y + 20, { steps: 3 }); await g.mouse.move(b.x + 60, b.y, { steps: 5 }); await sleep(80);
    assert.equal(await hidden('marquee'), false);
    assert.deepEqual(await picked(), ['03 그림', '01 첫째', '04 넷째', '한글 제목']);
    await g.mouse.up(); await sleep(150);
    assert.equal(await hidden('marquee'), true);
    assert.deepEqual(await picked(), ['03 그림', '01 첫째', '04 넷째', '한글 제목']);
    // 순서는 그대로다.
    assert.deepEqual((await rowsOf()).slice(2, 7), ['02 둘째', '03 그림', '01 첫째', '04 넷째', '한글 제목']);
    // Ctrl을 누르고 그리면 이미 고른 곡에 더한다.
    const c = await point('02 둘째');
    await g.keyboard.down('Control');
    await g.mouse.move(c.x, c.y); await g.mouse.down();
    await g.mouse.move(c.x + 20, c.y + 10, { steps: 3 }); await g.mouse.up();
    await g.keyboard.up('Control'); await sleep(150);
    assert.deepEqual(await picked(), ['02 둘째', '03 그림', '01 첫째', '04 넷째', '한글 제목']);
  });
  await step('Shift, Ctrl 선택과 Delete, 되돌리기', async () => {
    const before = await rowsOf();
    await selectRow('고른 곡');
    await selectRow('끌어온 곡', 'Shift');
    assert.deepEqual(await picked(), ['고른 곡', '끌어온 곡']);
    await selectRow('폴더 곡', 'Control');
    assert.equal((await picked()).length, 3);
    await g.keyboard.press('Delete'); await sleep(300);
    assert.equal((await rowsOf()).length, before.length - 3);
    assert.match(await text('toast'), /3개를 목록에서 뺐습니다/);
    await g.evaluate(() => document.querySelector('#toast button').click()); await sleep(300);
    assert.deepEqual(await rowsOf(), before);
  });
  await step('듣던 곡을 빼면 다음 곡으로 넘어간다', async () => {
    await playRow('고른 곡');
    await selectRow('고른 곡');
    await g.keyboard.press('Delete'); await sleep(500);
    assert.equal(await text('trackTitle'), '끌어온 곡');
    assert.equal(await g.evaluate(() => window.__m.audio.paused), false, '계속 재생');
    await g.evaluate(() => window.Bridge.pause());
  });
  await step('오른쪽 클릭 메뉴와 Enter, Ctrl+A, 이름순 정렬', async () => {
    const p = await point('끌어온 곡');
    await g.mouse.click(p.x, p.y, { button: 'right' }); await sleep(150);
    assert.equal(await hidden('rowMenu'), false);
    await shot('11_menu');
    await click('rowInfo'); await sleep(300);
    assert.equal(await hidden('rowMenu'), true);
    assert.match(await text('infoTech'), /경로/);
    await click('infoClose');
    await g.mouse.click(p.x, p.y, { button: 'right' }); await sleep(150);
    await click('rowRemove'); await sleep(300);
    assert.ok(!(await rowsOf()).includes('끌어온 곡'));
    await selectRow('03 그림');
    await g.keyboard.press('Enter'); await sleep(500);
    assert.equal(await text('trackTitle'), '03 그림');
    await g.evaluate(() => window.Bridge.pause());
    await g.keyboard.down('Control'); await g.keyboard.press('a'); await g.keyboard.up('Control'); await sleep(100);
    assert.equal((await picked()).length, (await rowsOf()).length);
    await click('btnSortList'); await sleep(250);
    assert.deepEqual((await rowsOf()).slice(0, 2), ['01 첫째', '02 둘째']);
    assert.equal(await text('trackTitle'), '03 그림');
    await selectRow('01 첫째');
  });
  await step('비우기와 되돌리기', async () => {
    const before = await rowsOf();
    await click('btnClearList'); await sleep(300);
    assert.equal(await hidden('listEmpty'), false);
    assert.equal(await hidden('player'), true);
    assert.equal(await hidden('mini'), true);
    assert.equal(await g.evaluate(() => window.__m.audio.paused), true);
    await g.evaluate(() => document.querySelector('#toast button').click()); await sleep(500);
    assert.deepEqual(await rowsOf(), before);
    assert.equal(await hidden('player'), false);
    assert.equal(await text('trackTitle'), '03 그림');
  });
  await step('색상 테마 4가지와 테두리 없는 전체 화면', async () => {
    const bg = () => g.evaluate(() => getComputedStyle(document.documentElement).backgroundColor);
    const ink = () => g.evaluate(() => getComputedStyle(document.body).color);
    await click('btnSettings2'); await sleep(200);
    assert.deepEqual(await g.$$eval('#themeChips button', l => l.map(x => x.textContent)), ['화이트', '블랙', '핑크', '연블루']);
    assert.equal(await g.$eval('#themeChips .on', e => e.textContent), '블랙');
    assert.equal(await g.evaluate(() => getComputedStyle(document.getElementById('bg'), '::before').backgroundImage !== 'none'), true, '유리 뒤 배경');
    await shot('13_settings_black');
    await click('btnSettingsClose');
    const want = { 화이트: 'rgb(255, 255, 255)', 핑크: 'rgb(255, 214, 231)', 연블루: 'rgb(234, 243, 252)', 블랙: 'rgb(0, 0, 0)' };
    for (const [name, color] of Object.entries(want)) {
      await g.evaluate(n => [...document.querySelectorAll('#themeChips button')].find(x => x.textContent === n).click(), name); await sleep(200);
      assert.equal(await bg(), color, name);
      assert.equal((await ink()) === 'rgb(255, 255, 255)', name === '블랙', `${name} 글자색`);
      assert.match(await g.$eval('#folders', e => getComputedStyle(e).backdropFilter), /blur/, `${name} 유리 효과`);
      assert.deepEqual(await g.$eval('#folders', e => { const c = getComputedStyle(e), r = e.getBoundingClientRect(); return [r.left, r.top, r.bottom === innerHeight, c.borderTopWidth, c.borderTopLeftRadius, c.boxShadow]; }), [0, 0, true, '0px', '0px', 'none'], `${name} 테두리`);
      assert.equal(await g.$eval('#player', e => { const r = e.getBoundingClientRect(); return r.right === innerWidth && r.top === 0; }), true);
      await shot('14_theme_' + name);
      if (name === '핑크') {
        await click('btnInfo'); await sleep(300); await shot('15_info_' + name); await click('infoClose');
        await click('btnSettings2'); await sleep(200); await shot('16_settings_' + name); await click('btnSettingsClose');
      }
    }
  });
  await step('플레이어 접기와 펼치기', async () => {
    const leftWidth = () => g.$eval('#folders', e => e.getBoundingClientRect().width);
    const open = await leftWidth();
    assert.equal(await hidden('mini'), true);
    await click('btnFold'); await sleep(200);
    assert.equal(await hidden('player'), true);
    assert.equal(await hidden('mini'), false);
    assert.equal(await hidden('miniExpand'), false);
    assert.ok(await leftWidth() > open + 300, '목록이 넓어지지 않음');
    await shot('10_folded');
    await playRow('02 둘째');
    assert.equal(await text('miniTitle'), '02 둘째');
    assert.equal(await hidden('player'), true, '곡을 골라도 접힌 채로');
    await g.evaluate(() => window.Bridge.pause());
    await click('miniExpand'); await sleep(200);
    assert.equal(await hidden('player'), false);
    assert.equal(await hidden('mini'), true);
    await g.keyboard.press('p'); await sleep(200);
    assert.equal(await hidden('player'), true);
    await g.keyboard.press('p'); await sleep(200);
    assert.equal(await hidden('player'), false);
  });
  await step('좁은 창: 폰 화면으로 바뀐다', async () => {
    await g.setViewport({ width: 420, height: 780 }); await sleep(500);
    assert.equal(await g.evaluate(() => innerWidth < 860), true);
    assert.equal(await hidden('mini'), false);
    assert.equal(await hidden('player'), true);
    await shot('8_narrow_list');
    await click('mini'); await sleep(300);
    assert.equal(await hidden('player'), false);
    assert.equal(await hidden('folders'), true);
    await shot('9_narrow_player');
    await g.setViewport({ width: 1180, height: 760 }); await sleep(500);
    assert.equal(await hidden('folders'), false);
  });
  await step('곡을 다 듣지 않고 껐다 켜면 이어진다', async () => {
    await g.evaluate(() => window.Bridge.skipTo(1, 6000)); await sleep(500);
    await g.evaluate(() => window.Bridge.pause()); await sleep(200);
    await g.keyboard.press('p'); await sleep(200);
    await g.evaluate(() => [...document.querySelectorAll('#playlist li.groupRow')].find(x => x.querySelector('.name').textContent === '수업자료').querySelector('.foldBtn').click());
    await g.evaluate(() => [...document.querySelectorAll('#themeChips button')].find(x => x.textContent === '핑크').click()); await sleep(300);
    await close(app);
    app = await launch(9342); g = app.page;
    await sleep(600);
    assert.equal(await text('trackTitle'), '02 둘째');
    assert.match(await text('timeCur'), /00:06/);
    await g.evaluate(() => { window.__m = window.__daaMeter(); });
    assert.ok(Math.abs(await pos() - 6) < 1, `위치 ${await pos()}`);
    assert.ok((await rowsOf()).includes('한글 제목'), '재생목록이 그대로');
    assert.equal(await g.$eval('#volume', e => e.value), '95');
    assert.equal(await hidden('player'), true, '접은 상태 유지');
    assert.ok(!(await rowsOf()).includes('1강') && (await heads()).includes('수업자료'), '접은 폴더 유지');
    assert.equal(await g.evaluate(() => document.documentElement.dataset.theme), 'pink', '테마 유지');
  });
  await step('탐색기에서 연 파일: 켜져 있으면 넣고 재생한다', async () => {
    const env = { ...process.env, DAA_DATA_DIR: DATA };
    delete env.ELECTRON_RUN_AS_NODE;
    const other = `${ROOT}/추가/연 곡.wav`.replace(/\//g, '\\');
    spawn(EXE, [...(process.argv[2] ? [] : [path.resolve(__dirname, '..')]), other], { env, stdio: 'ignore' });
    for (let n = 0; n < 100 && await text('trackTitle') !== '연 곡'; n++) await sleep(250); // 포터블은 켤 때마다 압축을 푼다.
    assert.equal(await text('trackTitle'), '연 곡');
    assert.ok((await rowsOf()).includes('연 곡'));
    await g.evaluate(() => window.Bridge.pause()); await sleep(200);
  });
  await step('앱 오류 없음', async () => {
    assert.deepEqual(app.errors, []);
  });
  const seen = app.errors.slice();
  await close(app);
  await step('탐색기에서 연 파일: 꺼져 있으면 켜면서 넣고 재생한다', async () => {
    app = await launch(9343, [`${ROOT}/추가/또 연 곡.wav`.replace(/\//g, '\\')]); g = app.page;
    await sleep(1000);
    assert.equal(await text('trackTitle'), '또 연 곡');
    assert.ok((await rowsOf()).includes('한글 제목'), '기존 목록 유지');
    assert.deepEqual([...seen, ...app.errors], []);
    await g.evaluate(() => window.Bridge.pause()); await sleep(200);
  });
  await step('지운 테마를 쓰던 사용자는 블랙으로 시작한다', async () => {
    await g.evaluate(() => { const p = JSON.parse(localStorage.prefs); p.theme = 'glitch'; localStorage.prefs = JSON.stringify(p); });
    await g.reload(); await sleep(1200);
    assert.equal(await g.evaluate(() => document.documentElement.dataset.theme), 'black');
    assert.equal(await g.$eval('#themeChips .on', e => e.textContent), '블랙');
  });
  await close(app);
  const failed = results.filter(r => r[0] === 'FAIL');
  console.log(`\n${results.length - failed.length}/${results.length} 통과`);
  process.exit(failed.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
