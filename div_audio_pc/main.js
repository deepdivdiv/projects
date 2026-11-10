'use strict';
const { app, BrowserWindow, Menu, clipboard, dialog, ipcMain, nativeImage, nativeTheme, protocol, screen, session, shell } = require('electron');
const fs = require('fs');
const path = require('path');
const { Worker } = require('worker_threads');
const iconv = require('iconv-lite');
const { ZipLibrary } = require('./src/zip');
const { clean, parentOf } = require('./src/playlist');
const { isAudio, stripExtension } = require('./src/formats');
const { Media } = require('./src/media');
const tags = require('./src/tags');

const APP_ID = 'com.snet.divaudio.pc';
const WWW = path.join(__dirname, 'www');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png' };
const THUMB_SIZE = 160, ART_SIZE = 1000, CACHE_LIMIT = 300, FLUSH_MS = 10000, OPEN_BATCH_MS = 200;
const MIN_WIDTH = 360, MIN_HEIGHT = 620;
// 미니 플레이어와 플로팅의 높이. www/pc.css의 .compact 배치와 맞춘다. 너비만 바꿀 수 있다.
const COMPACT = { mini: 112, float: 112 }, COMPACT_WIDTH = 400, COMPACT_MIN_WIDTH = 320, COMPACT_MAX_WIDTH = 720;
// 작은 창의 투명도. 아주 흐리게 해도 잃어버리지 않도록 마우스를 올리면 HOVER_OPACITY까지 진하게 보인다. 조절하는 동안은 고른 값 그대로 보인다.
const MIN_OPACITY = 0.05, HOVER_OPACITY = 0.5, ADJUST_MS = 1500, HOVER_CHECK_MS = 150;
const PICK_FILTERS = [{ name: '음악 파일과 ZIP', extensions: ['mp3', 'wav', 'flac', 'ogg', 'oga', 'opus', 'm4a', 'm4b', 'aac', 'weba', 'zip'] }, { name: '모든 파일', extensions: ['*'] }];

protocol.registerSchemesAsPrivileged([{ scheme: 'daa', privileges: { standard: true, secure: true, stream: true, supportFetchAPI: true, corsEnabled: true } }]);
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.setAppUserModelId(APP_ID);
if (process.env.DAA_DATA_DIR) app.setPath('userData', process.env.DAA_DATA_DIR);
if (!app.requestSingleInstanceLock()) app.quit();

let win = null, zips, media;
const dataFile = name => path.join(app.getPath('userData'), name);

// ---- 설정 ----
function readJson(name, fallback) {
  try { return JSON.parse(fs.readFileSync(dataFile(name), 'utf8')); } catch { return fallback; }
}
const writeJson = (name, value) => fs.writeFileSync(dataFile(name), JSON.stringify(value));
// 쓰다가 꺼져도 재생목록이 깨지지 않도록 다른 이름으로 쓴 뒤 바꾼다.
async function writeSafely(name, value) {
  const temp = dataFile(name + '.tmp');
  await fs.promises.writeFile(temp, JSON.stringify(value));
  await fs.promises.rename(temp, dataFile(name));
}

// ---- 파일 열기: 탐색기의 연결 프로그램, 실행 파일 위에 끌어다 놓기 ----
const pathsIn = argv => argv.slice(app.isPackaged ? 1 : 2).filter(a => !a.startsWith('-') && fs.existsSync(a));
const opened = pathsIn(process.argv);
let openTimer = null;
function openLater(paths) {
  opened.push(...paths);
  clearTimeout(openTimer); // 여러 파일을 한꺼번에 열면 파일마다 따로 신호가 온다.
  openTimer = setTimeout(() => {
    if (win && opened.length) win.webContents.send('event', 'open', opened.splice(0));
  }, OPEN_BATCH_MS);
}

// ---- 곡 모으기 ----
const jobs = new Map();
let worker = null, lastJob = 0;
function failJobs(e) {
  for (const job of jobs.values()) job.reject(e);
  jobs.clear();
  worker = null;
}
function startWorker() {
  worker = new Worker(path.join(__dirname, 'src', 'collect-worker.js'), { workerData: { dataDir: app.getPath('userData') } });
  worker.on('message', ({ id, value, error, progress }) => {
    if (progress) { if (win) win.webContents.send('event', 'addProgress', progress); return; }
    const job = jobs.get(id);
    jobs.delete(id);
    if (error) job.reject(new Error(error)); else job.resolve(value);
  });
  worker.on('error', failJobs);
}
function collect(paths) {
  if (!worker) startWorker();
  return new Promise((resolve, reject) => {
    jobs.set(++lastJob, { resolve, reject });
    worker.postMessage({ id: lastJob, paths });
  });
}

// ---- 앨범아트 ----
const pictures = new Map();
function remember(key, value) {
  if (pictures.size >= CACHE_LIMIT) pictures.delete(pictures.keys().next().value);
  pictures.set(key, value);
  return value;
}
function toDataUrl(picture, size) {
  const image = nativeImage.createFromBuffer(picture.data);
  if (image.isEmpty()) return `data:${picture.format};base64,${picture.data.toString('base64')}`;
  const fitted = image.getSize().width > size ? image.resize({ width: size, quality: 'good' }) : image;
  return `data:image/jpeg;base64,${fitted.toJPEG(88).toString('base64')}`;
}
async function artOf(uri, size) {
  const key = `${uri}|${size}`;
  if (pictures.has(key)) return pictures.get(key);
  const picture = await media.picture(uri).catch(() => null);
  return remember(key, picture ? toDataUrl(picture, size) : null);
}

// ---- 저장 ----
const safeName = name => name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').slice(0, 180);
async function askSavePath(name, where, filters) {
  const defaultPath = path.join(app.getPath(where), safeName(name));
  if (process.env.DAA_SAVE_DIR) return path.join(process.env.DAA_SAVE_DIR, safeName(name)); // 자동 시험용
  const r = await dialog.showSaveDialog(win, { defaultPath, filters });
  return r.canceled ? null : r.filePath;
}
function decodeText(buffer) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    return iconv.decode(buffer, 'cp949'); // 메모장의 옛 저장 방식
  }
}

const api = {
  collect,
  async pickFiles() {
    if (process.env.DAA_PICK_AUDIO) return process.env.DAA_PICK_AUDIO.split('|'); // 자동 시험용
    const r = await dialog.showOpenDialog(win, { title: '음악 파일 추가', properties: ['openFile', 'multiSelections'], filters: PICK_FILTERS });
    return r.canceled ? [] : r.filePaths;
  },
  async pickFolder() {
    if (process.env.DAA_PICK_DIR) return [process.env.DAA_PICK_DIR]; // 자동 시험용
    const r = await dialog.showOpenDialog(win, { title: '폴더 추가', properties: ['openDirectory', 'multiSelections'] });
    return r.canceled ? [] : r.filePaths;
  },
  async loadPlaylist() {
    const list = readJson('playlist.json', []);
    if (!Array.isArray(list)) return [];
    // 예전에 넣은 ZIP 곡에는 ZIP 안의 폴더가 없어서 채워 넣는다.
    const zipFolders = new Map();
    for (const t of list) {
      if (typeof t.subdir === 'string' || !(t.dir || '').startsWith('zip:')) continue;
      if (!zipFolders.has(t.dir)) {
        const zip = await zips.load(t.dir).catch(() => null);
        zipFolders.set(t.dir, new Map(zip ? zip.tracks.map(z => [z.uri, z.folder]) : []));
      }
      const folder = zipFolders.get(t.dir).get(t.uri);
      if (typeof folder === 'string') t.subdir = folder;
    }
    return list;
  },
  savePlaylist: tracks => writeSafely('playlist.json', tracks),
  takeOpened: () => opened.splice(0),
  setTheme(dark, background) {
    nativeTheme.themeSource = dark ? 'dark' : 'light';
    if (win) win.setBackgroundColor(background);
    writeJson('theme.json', { dark, background });
  },
  // 북마크의 원래 자리에 어떤 곡이 있는지 알려 준다. 폴더가 사라졌으면 오류, ZIP이 사라졌으면 곡이 없다고 답한다.
  async placeInfo(place) {
    if (!place.startsWith('zip:')) {
      const names = await fs.promises.readdir(place);
      return { tracks: names.filter(isAudio).map(name => ({ title: stripExtension(name) })) };
    }
    const zip = await zips.load(place);
    return { name: zip.name, parent: zip.source ? parentOf(clean(zip.source)) : null, tracks: fs.existsSync(zip.source) ? zip.tracks : [] };
  },
  async revealTrack(uri) {
    const s = await media.source(uri);
    shell.showItemInFolder(s.file || (await zips.resolve(uri)).zipPath);
  },
  getArt: uri => artOf(uri, ART_SIZE),
  getThumb: (uri, size) => artOf(uri, size || THUMB_SIZE),
  getTags: uri => media.tags(uri),
  async saveText(name, text) {
    const json = name.endsWith('.json');
    const file = await askSavePath(name, 'downloads', [json ? { name: '백업 파일', extensions: ['json'] } : { name: '텍스트', extensions: ['txt'] }]);
    if (!file) return { cancelled: true };
    await fs.promises.writeFile(file, text);
    return { path: file };
  },
  async saveImage(name, base64) {
    const file = await askSavePath(name, 'pictures', [{ name: 'JPEG 이미지', extensions: ['jpg'] }]);
    if (!file) return { cancelled: true };
    await fs.promises.writeFile(file, Buffer.from(base64, 'base64'));
    return { path: file };
  },
  copyText: text => clipboard.writeText(text),
  copyImage: base64 => clipboard.writeImage(nativeImage.createFromBuffer(Buffer.from(base64, 'base64'))),
  showInFolder: file => shell.showItemInFolder(file),
  // ---- 창 ----
  windowState: () => windowState(),
  setWindowMode(mode) {
    if (!(mode in COMPACT) && mode !== 'full') throw new Error('알 수 없는 창 모드입니다.');
    applyMode(mode);
    return windowState();
  },
  setOpacity(value) {
    view.opacity = Math.min(1, Math.max(MIN_OPACITY, Number(value) || 1));
    lastAdjust = Date.now();
    updateOpacity();
  },
  windowAction(action) {
    if (action === 'minimize') win.minimize();
    else if (action === 'maximize') { if (win.isMaximized()) win.unmaximize(); else win.maximize(); }
    else if (action === 'close') win.close();
  },
  async pickText() {
    if (process.env.DAA_PICK_FILE) return { text: decodeText(await fs.promises.readFile(process.env.DAA_PICK_FILE)) }; // 자동 시험용
    const r = await dialog.showOpenDialog(win, { title: '백업 파일 선택', properties: ['openFile'], filters: [{ name: '북마크 파일', extensions: ['json', 'txt'] }] });
    if (r.canceled) return { cancelled: true };
    return { text: decodeText(await fs.promises.readFile(r.filePaths[0])) };
  },
};

// ---- 창 모드 ----
// full: 보통 창. mini: 작은 플레이어. float: 작은 플레이어를 항상 위에 두고 투명도를 고른다.
// 보통 창의 크기(window.json)와 작은 창의 자리(compact.json)를 따로 기억한다.
const view = { mode: 'full', opacity: 1, maximized: false, ...readJson('compact.json', {}) };
let fullBounds = null, lastAdjust = 0, shownOpacity = 1, hoverTimer = null;
const windowState = () => ({ mode: view.mode, opacity: view.opacity, maximized: !!win && win.isMaximized() });
const sendWindow = () => { if (win) win.webContents.send('event', 'window', windowState()); };
// 기억한 자리가 지금 연결된 화면 밖이면 창이 있는 화면의 오른쪽 아래에 둔다.
function compactBounds(height) {
  const width = Math.min(COMPACT_MAX_WIDTH, Math.max(COMPACT_MIN_WIDTH, view.width || COMPACT_WIDTH));
  const saved = view.x !== undefined && { x: view.x, y: view.y, width, height };
  if (saved && screen.getAllDisplays().some(d => {
    const a = d.workArea;
    return saved.x < a.x + a.width - 40 && saved.x + width > a.x + 40 && saved.y >= a.y - 10 && saved.y < a.y + a.height - 40;
  })) return saved;
  const a = screen.getDisplayMatching(win.getBounds()).workArea;
  return { x: a.x + a.width - width - 16, y: a.y + a.height - height - 16, width, height };
}
function updateOpacity() {
  let target = 1;
  if (view.mode !== 'full') {
    const c = screen.getCursorScreenPoint(), b = win.getBounds();
    const over = c.x >= b.x && c.x < b.x + b.width && c.y >= b.y && c.y < b.y + b.height;
    target = over && Date.now() - lastAdjust > ADJUST_MS ? Math.max(view.opacity, HOVER_OPACITY) : view.opacity;
  }
  if (target !== shownOpacity) { shownOpacity = target; win.setOpacity(target); }
}
function rememberCompact() {
  if (view.mode === 'full' || win.isMinimized()) return;
  const b = win.getBounds();
  Object.assign(view, { x: b.x, y: b.y, width: b.width });
}
function applyMode(mode) {
  const from = view.mode;
  if (from === 'full') {
    view.maximized = win.isMaximized();
    if (win.isMinimized()) win.restore();
    if (win.isMaximized()) win.unmaximize();
    fullBounds = win.getBounds();
  } else {
    rememberCompact();
  }
  view.mode = mode;
  if (mode === 'full') {
    win.setAlwaysOnTop(false);
    clearInterval(hoverTimer);
    hoverTimer = null;
    updateOpacity();
    win.setMaximumSize(0, 0);
    win.setMinimumSize(MIN_WIDTH, MIN_HEIGHT);
    win.setMaximizable(true);
    if (from !== 'full' && fullBounds) win.setBounds(fullBounds);
    if (from !== 'full' && view.maximized) win.maximize();
  } else {
    const height = COMPACT[mode];
    win.setMaximizable(false);
    win.setMinimumSize(COMPACT_MIN_WIDTH, height);
    win.setMaximumSize(COMPACT_MAX_WIDTH, height);
    win.setBounds(compactBounds(height));
    win.setAlwaysOnTop(mode === 'float', 'floating');
    updateOpacity();
    if (!hoverTimer) hoverTimer = setInterval(() => { if (win && !win.isMinimized()) updateOpacity(); }, HOVER_CHECK_MS);
  }
  writeJson('compact.json', view);
  sendWindow();
}

function createWindow() {
  win = new BrowserWindow({
    width: 1180, height: 780, ...readJson('window.json', {}), minWidth: MIN_WIDTH, minHeight: MIN_HEIGHT, frame: false,
    title: 'DIV AUDIO APP', backgroundColor: readJson('theme.json', {}).background || '#000000', show: false, autoHideMenuBar: true,
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true, backgroundThrottling: false },
  });
  win.once('ready-to-show', () => {
    // 지난번에 작은 창으로 끝냈으면 작은 창으로 시작한다.
    const start = view.mode;
    view.mode = 'full';
    if (start !== 'full') applyMode(start);
    if (!process.env.DAA_TEST_WINDOW) { win.show(); return; }
    // 자동 시험용: 쓰고 있는 프로그램의 포커스를 뺏지 않고, 실제 마우스 입력이 시험에 섞이지 않게 한다.
    win.setFocusable(false);
    win.setIgnoreMouseEvents(true);
    win.showInactive();
  });
  win.on('close', () => {
    if (view.mode !== 'full') { rememberCompact(); if (fullBounds) writeJson('window.json', fullBounds); }
    else if (!win.isMaximized() && !win.isMinimized()) writeJson('window.json', win.getBounds());
    writeJson('compact.json', view);
  });
  win.on('maximize', sendWindow);
  win.on('unmaximize', sendWindow);
  win.on('closed', () => { clearInterval(hoverTimer); win = null; });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', e => e.preventDefault());
  win.loadURL('daa://app/index.html');
}

function serve(request) {
  const url = new URL(request.url);
  if (url.pathname.startsWith('/media/')) {
    const uri = decodeURIComponent(url.pathname.slice('/media/'.length));
    return media.respond(uri, request.headers.get('range')).catch(() => new Response(null, { status: 404 }));
  }
  const file = path.normalize(path.join(WWW, decodeURIComponent(url.pathname)));
  if (!file.startsWith(WWW + path.sep)) return new Response(null, { status: 403 });
  return fs.promises.readFile(file).then(
    body => new Response(body, { headers: { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' } }),
    () => new Response(null, { status: 404 }),
  );
}

app.on('second-instance', (_, argv) => {
  if (!win) return;
  openLater(pathsIn(argv));
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
});
app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => session.defaultSession.flushStorageData());

app.whenReady().then(() => {
  nativeTheme.themeSource = readJson('theme.json', { dark: true }).dark ? 'dark' : 'light';
  Menu.setApplicationMenu(null);
  zips = new ZipLibrary(dataFile('zips'));
  media = new Media(zips);
  protocol.handle('daa', serve);
  ipcMain.handle('call', async (_, name, args) => {
    try {
      return { value: await api[name](...args) };
    } catch (e) {
      return { error: e.message || '처리하지 못했습니다.' };
    }
  });
  ipcMain.handle('version', () => app.getVersion());
  // 북마크와 위치는 화면 저장소에 있다. 전원이 나가도 잃지 않도록 자주 디스크에 내려 쓴다.
  setInterval(() => session.defaultSession.flushStorageData(), FLUSH_MS);
  createWindow();
});
