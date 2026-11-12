(function () {
  const $ = id => document.getElementById(id);
  const B = window.Bridge;
  const PLAY = 'M7 4l13 8-13 8z', PAUSE = 'M6 4h4.5v16H6zM13.5 4H18v16h-4.5z';

  let folder = null, index = 0, position = 0, duration = 0, playing = false;
  const SPEEDS = [1, 1.25, 1.5, 1.75, 2];
  let systemFontLoaded = false;
  let speed = 1, toastTimer = 0, infoToken = null, lastExport = null;
  let dragging = false, sheetMode = null, editing = null, artToken = 0, currentArt = null;
  let sleepUntil = 0, sleepEnd = false;

  // ---- 저장 ----
  const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
  const save = (k, v) => localStorage.setItem(k, JSON.stringify(v));
  const marks = () => load('bookmarks', []);

  // ---- 시간 ----
  const pad = n => String(n).padStart(2, '0');
  function fmt(ms) {
    const s = Math.max(0, Math.floor(ms / 1000)), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60);
    return (h ? h + ':' + pad(m) : pad(m)) + ':' + pad(s % 60);
  }
  function parseTime(t) {
    const p = t.trim().split(':');
    if (p.length < 2 || p.length > 3 || !p.every(x => /^\d+$/.test(x))) return null;
    return p.reduce((a, x) => a * 60 + Number(x), 0) * 1000;
  }

  // ---- 폴더 계산 ----
  const track = () => folder && folder.tracks[index];
  const folderTotal = () => folder.tracks.reduce((a, t) => a + t.duration, 0);
  const folderPos = () => folder.tracks.slice(0, index).reduce((a, t) => a + t.duration, 0) + position;
  function locate(ms) {
    let left = ms;
    for (let i = 0; i < folder.tracks.length; i++) {
      if (left < folder.tracks[i].duration) return { index: i, position: left };
      left -= folder.tracks[i].duration;
    }
    const last = folder.tracks.length - 1;
    return { index: last, position: folder.tracks[last].duration };
  }

  // ---- 화면 전환 ----
  const BOTTOM_SHEETS = { info: () => closeInfo() };
  function closeBottom(id) { (BOTTOM_SHEETS[id] || (() => { $(id).hidden = true; }))(); }
  const wideMq = matchMedia('(min-width: 860px)');
  const isWide = () => wideMq.matches;
  let leftScreen = 'folders';
  function show(id) {
    if (id !== 'player') leftScreen = id;
    const shown = isWide() && id === 'player' ? leftScreen : id;
    for (const s of ['folders', 'player', 'sheet', 'settings']) $(s).hidden = s !== shown;
  }
  wideMq.addEventListener('change', () => show(leftScreen));
  function setSeek(el, ratio) { el.value = Math.round(ratio * 1000); el.style.setProperty('--p', ratio * 100 + '%'); }

  function renderProgress() {
    if (!folder) return;
    const total = folderTotal(), fr = total ? folderPos() / total : 0, tr = duration ? position / duration : 0;
    $('folderPct').textContent = Math.floor(fr * 100) + '%';
    if (!dragging) {
      setSeek($('folderSeek'), fr); setSeek($('trackSeek'), tr);
      $('folderTime').textContent = `${fmt(folderPos())} / ${fmt(total)}`;
      $('timeCur').textContent = fmt(position);
    }
    $('timeDur').textContent = fmt(duration);
    $('playIcon').setAttribute('d', playing ? PAUSE : PLAY);
    renderMini();
  }
  // 같은 앨범의 곡으로 넘어갈 때 깜빡이지 않도록 결과가 온 뒤에만 교체한다.
  function setArt(url) {
    if (url === currentArt) return;
    currentArt = url;
    $('art').hidden = !url;
    $('bgArt').classList.toggle('on', !!url);
    if (url) { $('art').src = url; $('bgArt').src = url; }
  }
  function renderTrack() {
    const t = track(); if (!t) return;
    $('folderName').textContent = folder.name;
    $('trackTitle').textContent = t.title;
    $('trackAlbum').textContent = t.place;
    const token = ++artToken;
    const art = B.getArt(t.uri).catch(() => null);
    art.then(url => { if (token === artToken) setArt(url); });
    tagsOf(t.uri).then(async info => {
      const album = info && info.tags.find(x => x.label === '앨범');
      if (token === artToken && album) $('trackAlbum').textContent = album.value;
      if (token === artToken) B.setMeta(t.title, album ? album.value : t.place, await art);
    });
  }

  // ---- 리스트 공통 ----
  const ICONS = {
    folder: '<svg viewBox="0 0 24 24"><path d="M3 7.5A2.5 2.5 0 0 1 5.5 5h3.7c.7 0 1.3.3 1.8.8l1 1.2h6.5A2.5 2.5 0 0 1 21 9.5v7a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 16.5z" fill="currentColor"/></svg>',
    zip: '<svg viewBox="0 0 24 24"><path d="M6 3h8l5 5v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/><path d="M10 4v2h2v2h-2v2h2v2h-2v3h2" fill="none" stroke="currentColor" stroke-width="1.7"/></svg>',
    track: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.9"/><circle cx="12" cy="12" r="2.5" fill="currentColor"/><path d="M12 6.4a5.6 5.6 0 0 1 5.6 5.6M12 17.6A5.6 5.6 0 0 1 6.4 12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
    star: '<svg viewBox="0 0 24 24"><path d="m12 3.5 2.6 5.4 5.9.8-4.3 4.1 1 5.9-5.2-2.8-5.2 2.8 1-5.9-4.3-4.1 5.9-.8z" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/></svg>',
    starOn: '<svg viewBox="0 0 24 24"><path d="m12 3.5 2.6 5.4 5.9.8-4.3 4.1 1 5.9-5.2-2.8-5.2 2.8 1-5.9-4.3-4.1 5.9-.8z" fill="currentColor"/></svg>',
    info: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 11v6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><circle cx="12" cy="7.6" r="1.3" fill="currentColor"/></svg>',
    more: '<svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.9" fill="currentColor"/><circle cx="12" cy="12" r="1.9" fill="currentColor"/><circle cx="19" cy="12" r="1.9" fill="currentColor"/></svg>',
    edit: '<svg viewBox="0 0 24 24"><path d="M4 20l1-4L16.5 4.5a2.1 2.1 0 0 1 3 3L8 19z" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/></svg>',
    trash: '<svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  };
  const CHEVRON = '<svg class="chev" viewBox="0 0 24 24"><path d="m9 5 7 7-7 7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }
  // 화면에 보이는 항목만 작은 앨범아트를 불러온다.
  const thumbCache = new Map();
  const thumbWatcher = new IntersectionObserver(entries => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      thumbWatcher.unobserve(e.target);
      const { uri, size } = e.target.dataset;
      B.getThumb(uri, size ? Number(size) : undefined).catch(() => null).then(url => {
        thumbCache.set(uri + '|' + size, url);
        showThumb(e.target, url);
      });
    }
  }, { rootMargin: '200px' });
  function showThumb(tileEl, url) {
    if (!url) return;
    const img = el('img');
    img.alt = ''; img.src = url;
    tileEl.textContent = '';
    tileEl.append(img);
  }
  function watchThumb(tileEl, uri, size) {
    const key = uri + '|' + (size || '');
    if (thumbCache.has(key)) { showThumb(tileEl, thumbCache.get(key)); return; }
    tileEl.dataset.uri = uri;
    tileEl.dataset.size = size || '';
    thumbWatcher.observe(tileEl);
  }

  // tile: 아이콘 이름 또는 { text, cls }. thumb를 주면 앨범아트가 있을 때 아이콘을 대신한다.
  function row({ tile, name, sub, memo, onTap, chevron, thumb }) {
    const li = el('li'), b = el('button', 'main');
    b.onclick = onTap;
    const t = el('span', 'tile ' + (tile.cls || tile));
    if (tile.text !== undefined) t.textContent = tile.text; else t.innerHTML = ICONS[tile];
    if (thumb) watchThumb(t, thumb);
    const text = el('span', 'text');
    text.append(el('div', 'name ellipsis', name));
    if (sub) text.append(el('div', 'sub ellipsis', sub));
    if (memo) text.append(el('div', 'memo', memo));
    b.append(t, text);
    if (chevron) b.insertAdjacentHTML('beforeend', CHEVRON);
    li.append(b);
    return li;
  }
  function action(icon, label, onTap) {
    const b = el('button', 'act'); b.innerHTML = ICONS[icon]; b.setAttribute('aria-label', label); b.onclick = onTap;
    return b;
  }
  function closeSheet() { show(isWide() ? 'folders' : 'player'); }
  function fmtSize(n) {
    if (n >= 1073741824) return (n / 1073741824).toFixed(1) + 'GB';
    if (n >= 1048576) return Math.round(n / 1048576) + 'MB';
    return Math.max(1, Math.round(n / 1024)) + 'KB';
  }

  // ---- 파일 탐색 ----
  function toast(text, actionLabel, onAction) {
    clearTimeout(toastTimer);
    const box = $('toast');
    box.textContent = '';
    box.append(el('span', '', text));
    if (actionLabel) {
      const b = el('button', '', actionLabel);
      b.onclick = () => { box.hidden = true; onAction(); };
      box.append(b);
    }
    box.hidden = false;
    toastTimer = setTimeout(() => { box.hidden = true; }, actionLabel ? 5000 : 3000);
  }
  function savedToast(file) { toast('저장했습니다.', '폴더 열기', () => B.showInFolder(file)); }
  function renderMini() {
    renderCompact();
    const t = track();
    $('mini').hidden = !t;
    if (!t) return;
    const total = folderTotal();
    $('miniTitle').textContent = t.title;
    $('miniFolder').textContent = t.place;
    $('miniBar').style.width = (total ? folderPos() / total * 100 : 0) + '%';
    $('miniIcon').setAttribute('d', playing ? PAUSE : PLAY);
  }
  // 위치 저장은 재생 서비스가 맡는다. 화면이 꺼져 있어도 위치를 잃지 않게 하기 위해서다.
  async function savedPosition(path, uri) {
    const r = await B.getResume(path, [uri]).catch(() => null);
    return (r && r.positions[uri]) || 0;
  }
  // 리스트에서 곡을 고르면 들었던 곳부터 이어서 재생한다.
  async function playFrom(r, i) {
    const pos = await savedPosition(r.path, r.tracks[i].uri);
    if (folder && folder.path === r.path) { B.skipTo(i, pos); B.play(); show('player'); }
    else openFolder(r, i, pos, true);
  }
  async function openFolder(f, startIndex, startPos, autoplay) {
    if (folder && folder.path === f.path && startIndex === undefined) { show('player'); return; }
    const uris = f.tracks.map(t => t.uri);
    const saved = await B.getResume(f.path, uris).catch(() => ({ positions: {} }));
    const old = load('resume', {})[f.path]; // 이전 버전이 저장한 위치
    const uri = saved.uri || (old && old.uri);
    const found = uri ? uris.indexOf(uri) : -1;
    folder = f;
    document.body.classList.add('hasTrack');
    index = startIndex ?? Math.max(found, 0);
    position = startPos ?? (found < 0 ? 0 : saved.positions[uri] || (saved.uri ? 0 : old.position) || 0);
    duration = f.tracks[index].duration;
    renderTrack(); renderProgress(); show('player');
    await B.setQueue(f.tracks, index, position, !!autoplay, f.path);
    adoptMarks();
  }

  // ---- 파일 / 북마크 리스트 ----
  // 다른 기기나 스토어 버전에서 가져온 북마크는 주소가 달라서 경로와 곡 이름으로도 찾는다.
  // 폰 앱과 PC는 폴더 위치가 달라서, 곡 이름이 같고 들어 있는 폴더 이름도 같으면 같은 곡으로 본다.
  const folderName = p => shortPath(p).split('/').pop();
  const sameTrack = (t, m) => t.uri === m.uri || (t.title === m.title && !!t.dir && (shortPath(t.dir) === shortPath(m.folder) || t.place === folderName(m.label || m.folder)));
  const belongsTo = (m, f) => f.tracks.some(t => sameTrack(t, m));
  function trackIndexOf(m) {
    const i = folder.tracks.findIndex(t => sameTrack(t, m));
    return i >= 0 ? i : folder.tracks.findIndex(t => t.title === m.title);
  }
  function folderMarks() {
    return marks().filter(m => belongsTo(m, folder)).sort((a, b) => (trackIndexOf(a) - trackIndexOf(b)) || a.position - b.position);
  }

  // ---- 파일 자세히 보기 ----
  const tagCache = new Map();
  async function tagsOf(uri) {
    if (!tagCache.has(uri)) {
      const info = await B.getTags(uri).catch(() => null);
      if (!info) return null;
      tagCache.set(uri, info);
    }
    return tagCache.get(uri);
  }
  function fillPairs(dl, pairs) {
    dl.textContent = '';
    for (const p of pairs) {
      const line = el('div');
      line.append(el('dt', '', p.label), el('dd', '', p.value));
      dl.append(line);
    }
  }
  async function openInfo(t) {
    infoToken = t.uri;
    const tile = $('infoTile');
    tile.innerHTML = ICONS.track;
    $('infoTitle').textContent = t.title;
    $('infoAlbum').textContent = '';
    fillPairs($('infoTags'), []);
    fillPairs($('infoTech'), [{ label: '길이', value: fmt(t.duration) }]);
    $('infoEmpty').hidden = true;
    $('info').hidden = false;
    B.getThumb(t.uri).catch(() => null).then(url => { if (infoToken === t.uri) showThumb(tile, url); });
    const info = await tagsOf(t.uri);
    if (infoToken !== t.uri) return;
    const tags = info ? info.tags : [];
    const tech = [{ label: '길이', value: fmt(t.duration) }, ...(info ? info.tech : [])];
    if (info && info.size) tech.push({ label: '크기', value: fmtSize(info.size) });
    if (info && info.path) tech.push({ label: '경로', value: info.path });
    const album = tags.find(x => x.label === '앨범');
    $('infoAlbum').textContent = album ? album.value : '';
    fillPairs($('infoTags'), tags);
    fillPairs($('infoTech'), tech);
    $('infoEmpty').hidden = tags.length > 0;
  }
  function closeInfo() { infoToken = null; $('info').hidden = true; }

  // ---- 북마크 내보내기 ----
  // 한 줄에 하나: 파일명(확장자 제외) / 분:초 / 메모. 폴더가 여러 개면 [폴더] 제목으로 묶는다.
  const pad2 = n => String(n).padStart(2, '0');
  function stamp() {
    const d = new Date();
    return `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}_${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(d.getSeconds())}`;
  }
  const naturally = (x, y) => x.localeCompare(y, 'ko', { numeric: true });
  // 스토어 버전의 경로는 문서 주소라서 읽을 수 있는 경로로 바꿔 비교한다.
  const plainPath = p => (p.startsWith('content:') ? decodeURIComponent(p.split('/document/').pop()) : p);
  const shortPath = p => plainPath(p).replace(/^\/storage\/emulated\/0\/?/, '').replace(/^primary:/, '').replace(/^[A-Za-z]:\/?/, '');
  const SCOPES = [['here', '재생목록'], ['all', '전체']];
  const zipInfo = new Map();
  let exporting = null;

  // ZIP 북마크는 'zip:id'로 저장되어 있어서 실제 위치를 물어봐야 한다.
  async function locateZips(list) {
    for (const path of new Set(list.map(m => m.folder))) {
      if (!path.startsWith('zip:') || zipInfo.has(path)) continue;
      const r = await B.listDir(path).catch(() => null);
      if (r) zipInfo.set(path, { parent: r.parent == null ? null : plainPath(r.parent), name: r.name });
    }
  }
  function realPath(folderPath) {
    // 일반 폴더는 그대로, ZIP은 들어 있는 폴더 아래의 경로로 본다.
    const z = zipInfo.get(folderPath);
    if (!folderPath.startsWith('zip:')) return folderPath;
    return z && z.parent != null ? z.parent + '/' + z.name : null;
  }
  const inScope = (m, base, scope) => scope === 'all' || belongsTo(m, base);
  function groupLabel(folderPath) {
    const path = realPath(folderPath);
    if (path) return shortPath(path) || folderPath;
    return (zipInfo.get(folderPath) || {}).name || '위치를 알 수 없는 ZIP';
  }
  function exportLine(m) {
    const memo = (m.memo || '').replace(/\s*\n\s*/g, ' ').trim();
    return [m.title, fmt(m.position), ...(memo ? [memo] : [])].join(' / ');
  }
  function buildExport(list) {
    const groups = new Map();
    for (const m of list) {
      if (!groups.has(m.folder)) groups.set(m.folder, []);
      groups.get(m.folder).push(m);
    }
    const sorted = [...groups.entries()]
      .map(([path, items]) => ({ label: groupLabel(path), items: items.sort((x, y) => naturally(x.title, y.title) || x.position - y.position) }))
      .sort((x, y) => naturally(x.label, y.label));
    if (sorted.length <= 1) return sorted.length ? sorted[0].items.map(exportLine).join('\n') + '\n' : '';
    return sorted.map(g => `[${g.label}]\n${g.items.map(exportLine).join('\n')}`).join('\n\n') + '\n';
  }
  function exportFileName() { return `북마크_${exportTitle()}_${stamp()}.txt`; }
  const exportTitle = () => (exporting.single ? exporting.single.title : exporting.scope === 'all' ? '전체' : exporting.base.name);
  function renderExport() {
    const { base, scope } = exporting, all = marks();
    const list = all.filter(m => inScope(m, base, scope));
    const box = $('exportScopes'); box.textContent = '';
    for (const [key, label] of SCOPES) {
      const count = all.filter(m => inScope(m, base, key)).length;
      const b = el('button', 'chip' + (key === scope ? ' on' : ''), `${label} ${count}`);
      b.onclick = () => { exporting.scope = key; renderExport(); };
      box.append(b);
    }
    exporting.text = buildExport(list);
    $('exportCount').textContent = `${exportTitle()} · ${list.length}개`;
    $('exportPreview').textContent = exporting.text || '내보낼 북마크가 없습니다.';
    $('exportSave').disabled = $('exportShare').disabled = !list.length;
  }
  async function openExport(base, scope) {
    await locateZips(marks());
    exporting = { base, scope };
    renderExport();
    $('exportMenu').hidden = false;
  }
  $('btnExport').onclick = () => openExport(folder, 'here');
  $('exportSave').onclick = async () => {
    try {
      const r = await B.saveText(exportFileName(), exporting.text);
      if (r.cancelled) return;
      $('exportMenu').hidden = true;
      savedToast(r.path);
      lastExport = r.path;
    } catch (e) { toast('파일을 저장하지 못했습니다.'); }
  };
  $('exportShare').onclick = () => { B.shareText('', exporting.text).then(() => toast('클립보드에 복사했습니다.'), () => toast('복사하지 못했습니다.')); };
  // 아래쪽 창은 닫기 버튼, 바깥 터치로 닫는다.
  for (const [id, closeId] of [['info', 'infoClose'], ['exportMenu', 'exportClose'], ['licenses', 'licensesClose'], ['sleepMenu', 'sleepClose'], ['markMenu', 'markMenuClose'], ['excerptMenu', 'excerptClose']]) {
    $(closeId).onclick = () => closeBottom(id);
    $(id).onclick = e => { if (e.target === $(id)) closeBottom(id); };
  }
  BOTTOM_SHEETS.info = closeInfo;

  // ---- 북마크 하나 내보내기 ----
  let menuMark = null;
  function singleText(m) {
    const memo = (m.memo || '').trim();
    return [`[${fmt(m.position)}]`, ...(memo ? [memo] : []), m.title].join('\n') + '\n';
  }
  function openMarkMenu(m) {
    menuMark = m;
    $('markMenuTitle').textContent = m.title;
    $('markMenuSub').textContent = fmt(m.position) + (m.memo ? ' · ' + m.memo.split('\n')[0] : '');
    $('markMenu').hidden = false;
  }
  $('markText').onclick = () => {
    const m = menuMark;
    $('markMenu').hidden = true;
    exporting = { single: m, text: singleText(m) };
    $('exportScopes').textContent = '';
    $('exportCount').textContent = `${m.title} · ${fmt(m.position)}`;
    $('exportPreview').textContent = exporting.text;
    $('exportSave').disabled = $('exportShare').disabled = false;
    $('exportMenu').hidden = false;
  };
  $('markImage').onclick = () => { $('markMenu').hidden = true; openExcerpt(menuMark); };
  $('markEdit').onclick = () => { $('markMenu').hidden = true; openDialog(menuMark); };
  $('markDelete').onclick = () => { $('markMenu').hidden = true; removeMark(menuMark); };
  function removeMark(m) {
    const before = marks();
    save('bookmarks', before.filter(x => x.id !== m.id));
    if (!$('sheet').hidden) renderSheet();
    toast('북마크를 삭제했습니다.', '되돌리기', () => { save('bookmarks', before); if (!$('sheet').hidden) renderSheet(); });
  }

  // 글자 수에 맞춰 크기를 줄이고 한국어는 글자 단위로도 줄바꿈한다.
  function wrapText(ctx, text, width) {
    const lines = [];
    for (const paragraph of text.split('\n')) {
      let line = '';
      for (const word of paragraph.split(/(\s+)/)) {
        if (ctx.measureText(line + word).width <= width) { line += word; continue; }
        if (line.trim()) { lines.push(line.trim()); line = ''; }
        for (const ch of word.trimStart()) {
          if (ctx.measureText(line + ch).width > width) { lines.push(line); line = ''; }
          line += ch;
        }
      }
      lines.push(line.trim());
    }
    return lines;
  }
  function fitLine(ctx, text, width) {
    if (ctx.measureText(text).width <= width) return text;
    let out = text;
    while (out && ctx.measureText(out + '…').width > width) out = out.slice(0, -1);
    return out + '…';
  }
  const loadImage = url => new Promise(resolve => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
  const EXCERPT_FONTS = { system: '"DAA System", system-ui, sans-serif', basic: 'system-ui, sans-serif' };
  async function drawExcerpt(canvas, m, artUrl, EXCERPT_FONT) {
    const ctx = canvas.getContext('2d'), S = canvas.width, P = 96, W = S - P * 2;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, S, S);
    const img = artUrl ? await loadImage(artUrl) : null;
    if (img) {
      const scale = Math.max(S / img.width, S / img.height);
      ctx.drawImage(img, (S - img.width * scale) / 2, (S - img.height * scale) / 2, img.width * scale, img.height * scale);
      ctx.fillStyle = 'rgba(0,0,0,.62)';
      ctx.fillRect(0, 0, S, S);
    }
    const memo = (m.memo || '').trim();
    const footer = 110, timeSize = 42, gap = 34;
    const room = S - P * 2 - footer - timeSize - gap;
    let size = 70, lines = [];
    for (; size >= 34; size -= 4) {
      ctx.font = `600 ${size}px ${EXCERPT_FONT}`;
      lines = memo ? wrapText(ctx, memo, W) : [];
      if (lines.length * size * 1.45 <= room) break;
    }
    size = Math.max(size, 34);
    ctx.font = `600 ${size}px ${EXCERPT_FONT}`;
    const lineHeight = size * 1.45, maxLines = Math.floor(room / lineHeight);
    if (lines.length > maxLines) {
      lines = lines.slice(0, maxLines);
      lines[maxLines - 1] = fitLine(ctx, lines[maxLines - 1] + '…', W);
    }
    const block = timeSize + (lines.length ? gap + lines.length * lineHeight : 0);
    let y = P + (S - P * 2 - footer - block) / 2;
    ctx.textBaseline = 'top';
    ctx.fillStyle = 'rgba(255,255,255,.8)';
    ctx.font = `700 ${timeSize}px ${EXCERPT_FONT}`;
    ctx.fillText(`[${fmt(m.position)}]`, P, y);
    y += timeSize + gap;
    ctx.fillStyle = '#fff';
    ctx.font = `600 ${size}px ${EXCERPT_FONT}`;
    for (const line of lines) { ctx.fillText(line, P, y); y += lineHeight; }
    ctx.fillStyle = 'rgba(255,255,255,.3)';
    ctx.fillRect(P, S - P - 74, 64, 3);
    ctx.fillStyle = 'rgba(255,255,255,.82)';
    ctx.font = `500 34px ${EXCERPT_FONT}`;
    ctx.fillText(fitLine(ctx, m.title, W), P, S - P - 46);
  }
  // 배경은 앨범아트가 기본이고, 고른 이미지는 이번 내보내기에만 쓴다.
  let excerptMark = null, excerptArt = null, excerptImage = null;
  const excerptFont = () => (systemFontLoaded ? prefs.excerptFont || 'system' : 'basic');
  async function redrawExcerpt() {
    await drawExcerpt($('excerptCanvas'), excerptMark, excerptImage || excerptArt, EXCERPT_FONTS[excerptFont()]);
    const fonts = $('excerptFonts'); fonts.textContent = '';
    for (const [key, name] of [['basic', '기본 글꼴'], ['system', '시스템 글꼴']]) {
      const b = el('button', 'chip' + (excerptFont() === key ? ' on' : ''), name);
      b.disabled = key === 'system' && !systemFontLoaded;
      b.onclick = () => { prefs.excerptFont = key; savePrefs(); redrawExcerpt(); };
      fonts.append(b);
    }
    const bgs = $('excerptBgs'); bgs.textContent = '';
    const art = el('button', 'chip' + (excerptImage ? '' : ' on'), excerptArt ? '앨범아트' : '기본 배경');
    art.onclick = () => { setExcerptImage(null); redrawExcerpt(); };
    const mine = el('button', 'chip' + (excerptImage ? ' on' : ''), excerptImage ? '다른 이미지' : '이미지 선택');
    mine.onclick = () => $('excerptFile').click();
    bgs.append(art, mine);
  }
  function setExcerptImage(url) {
    if (excerptImage) URL.revokeObjectURL(excerptImage);
    excerptImage = url;
  }
  $('excerptFile').onchange = async () => {
    const file = $('excerptFile').files[0];
    $('excerptFile').value = '';
    if (!file) return;
    const url = URL.createObjectURL(file);
    if (!await loadImage(url)) { URL.revokeObjectURL(url); toast('이 이미지는 열 수 없습니다.'); return; }
    setExcerptImage(url);
    redrawExcerpt();
  };
  async function openExcerpt(m) {
    excerptMark = m;
    setExcerptImage(null);
    const i = trackIndexOf(m);
    excerptArt = i >= 0 ? await B.getArt(folder.tracks[i].uri).catch(() => null) : null;
    await redrawExcerpt();
    $('excerptMenu').hidden = false;
  }
  const excerptData = () => $('excerptCanvas').toDataURL('image/jpeg', 0.92).split(',')[1];
  const excerptName = () => `북마크_${excerptMark.title}_${fmt(excerptMark.position).replace(/:/g, '-')}.jpg`;
  $('excerptSave').onclick = async () => {
    try {
      const r = await B.saveImage(excerptName(), excerptData());
      if (r.cancelled) return;
      $('excerptMenu').hidden = true;
      savedToast(r.path);
    } catch (e) { toast(e.message || '이미지를 저장하지 못했습니다.'); }
  };
  $('excerptShare').onclick = () => { B.copyImage(excerptData()).then(() => toast('이미지를 클립보드에 복사했습니다.'), () => toast('복사하지 못했습니다.')); };

  // ---- 북마크 백업과 들여오기 ----
  async function backupText() {
    const list = marks();
    await locateZips(list);
    return JSON.stringify({
      app: 'DIV AUDIO APP', type: 'bookmarks', version: 1, exportedAt: new Date().toISOString(),
      bookmarks: list.map(m => ({ ...m, label: m.label || groupLabel(m.folder) })),
    }, null, 2);
  }
  const backupName = () => `DAA_북마크백업_${stamp()}.json`;
  $('btnBackupSave').onclick = async () => {
    if (!marks().length) { toast('저장된 북마크가 없습니다.'); return; }
    try {
      const r = await B.saveText(backupName(), await backupText());
      if (!r.cancelled) savedToast(r.path);
    } catch (e) { toast('파일을 저장하지 못했습니다.'); }
  };
  const clean = v => (typeof v === 'string' ? v : '');
  function fromBackup(data) {
    if (!data || data.type !== 'bookmarks' || !Array.isArray(data.bookmarks)) throw new Error('format');
    return data.bookmarks
      .filter(m => m && clean(m.title) && Number.isFinite(m.position) && m.position >= 0)
      .map(m => ({ folder: clean(m.folder) || clean(m.label), label: clean(m.label), uri: clean(m.uri), title: m.title, position: m.position, memo: clean(m.memo), duration: Number.isFinite(m.duration) ? m.duration : 0 }));
  }
  // 내보낸 텍스트: [폴더] 제목 아래에 '파일명 / 분:초 / 메모', 또는 한 건짜리 '[분:초] 메모 파일명'
  function fromText(text, currentFolder) {
    const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
    const first = lines.find(l => l.trim());
    const single = first && first.trim().match(/^\[(\d+(?::\d+){1,2})\]$/);
    if (single) {
      const body = lines.map(l => l.trim()).filter(Boolean).slice(1);
      if (!body.length || !currentFolder) throw new Error('folder');
      return [{ folder: currentFolder, label: '', uri: '', title: body[body.length - 1], position: parseTime(single[1]), memo: body.slice(0, -1).join('\n') }];
    }
    const out = [];
    let group = null;
    for (const raw of lines) {
      const line = raw.trim();
      if (!line) continue;
      const header = line.match(/^\[(.+)\]$/);
      if (header) { group = header[1]; continue; }
      const m = line.match(/^(.+?) \/ (\d+(?::\d+){1,2})(?: \/ (.*))?$/);
      if (!m) throw new Error('format');
      const home = group || currentFolder;
      if (!home) throw new Error('folder');
      out.push({ folder: home, label: group || '', uri: '', title: m[1], position: parseTime(m[2]), memo: m[3] || '' });
    }
    return out;
  }
  function mergeMarks(incoming) {
    const all = marks();
    const key = m => [shortPath(m.label || m.folder), m.title, Math.round(m.position / 1000), (m.memo || '').trim()].join('\u0000');
    const seen = new Set(all.flatMap(m => [key(m), key({ ...m, label: '' })]));
    let added = 0;
    for (const m of incoming) {
      if (seen.has(key(m)) || seen.has(key({ ...m, label: '' }))) continue;
      seen.add(key(m));
      all.push({ ...m, id: Date.now() + '-' + Math.random().toString(36).slice(2, 9) });
      added++;
    }
    save('bookmarks', all);
    return added;
  }
  // 경로가 다른 곳에서 만든 북마크는 지금 목록에 보이지 않는다. 사용자가 허락하면 시간과 메모만 살려 곡에 다시 붙인다.
  // 흔한 파일 이름이 다른 폴더의 곡에 잘못 붙을 수 있어서 자동으로 붙이지 않고 묻는다.
  function attachMark(all, m, t) {
    const same = x => x !== m && x.uri === t.uri && Math.round(x.position / 1000) === Math.round(m.position / 1000) && (x.memo || '').trim() === (m.memo || '').trim();
    if (all.some(same)) { all.splice(all.indexOf(m), 1); return; }
    Object.assign(m, { folder: t.dir || folder.path, label: '', uri: t.uri, title: t.title, duration: t.duration });
  }
  // 폴더 이름을 바꾸면 경로가 달라져 북마크가 보이지 않는다. 원래 자리에서 곡이 사라졌고 이름과 길이가 같은 곡이 있으면 그 곡으로 옮긴다.
  // 원본이 남아 있으면 복사본이므로 옮기지 않는다.
  const LENGTH_SLACK_MS = 1500;
  async function adoptMarks() {
    const opened = folder;
    if (!opened) return;
    const places = new Map();
    const titlesAt = path => {
      if (!places.has(path)) places.set(path, B.listDir(path).then(r => new Set((r.tracks || []).map(t => t.title)), () => new Set()));
      return places.get(path);
    };
    const sameLength = (m, t) => !m.duration || !t.duration || Math.abs(m.duration - t.duration) <= LENGTH_SLACK_MS;
    const moved = [];
    for (const m of marks()) {
      // 같은 곡이 여럿이면 나중에 넣은 쪽이 옮겨진 폴더다.
      const t = [...opened.tracks].reverse().find(x => x.title === m.title && sameLength(m, x) && !(x.uri === m.uri && belongsTo(m, opened)));
      if (t && !(await titlesAt(m.folder)).has(m.title)) moved.push([m.id, t]);
    }
    if (!moved.length || folder !== opened) return;
    const all = marks();
    for (const [id, t] of moved) {
      const m = all.find(x => x.id === id);
      if (m) attachMark(all, m, t);
    }
    save('bookmarks', all);
    toast(`폴더가 바뀐 북마크 ${moved.length}개를 새 위치로 옮겼습니다.`);
    if (!$('sheet').hidden) renderSheet();
  }
  const fitsIn = (m, t) => !t.duration || m.position <= t.duration;
  function relinkMarks(incoming) {
    if (!folder) return { linked: 0, tooLong: 0 };
    const key = m => [m.title, Math.round(m.position / 1000), (m.memo || '').trim()].join('\u0000');
    const wanted = new Set(incoming.map(key)), all = marks();
    // 폴더 표시가 없는 파일은 지금 폴더 소속으로 들어오므로 곡까지 찾아야 찾은 것이다.
    const lost = all.filter(m => wanted.has(key(m)) && !(belongsTo(m, folder) && trackIndexOf(m) >= 0));
    const namesake = m => folder.tracks.find(t => t.title === m.title);
    const named = lost.filter(namesake), rest = lost.filter(m => !namesake(m));
    let linked = 0, tooLong = 0;
    const attachAll = (list, trackOf) => {
      for (const m of list) {
        const t = trackOf(m);
        if (fitsIn(m, t)) { attachMark(all, m, t); linked++; } else tooLong++;
      }
    };
    if (named.length && confirm(`경로가 달라 찾지 못한 북마크가 ${named.length}개 있습니다.\n파일 이름이 같은 곡에 시간과 메모를 붙일까요?`)) attachAll(named, namesake);
    const now = track();
    if (rest.length && now && confirm(`파일 이름도 다른 북마크가 ${rest.length}개 있습니다.\n지금 곡 '${now.title}'에 시간과 메모를 붙일까요?`)) attachAll(rest, () => now);
    save('bookmarks', all);
    return { linked, tooLong };
  }
  async function importMarks() {
    let picked;
    try { picked = await B.pickText(); } catch (e) { toast(e.message || '파일을 읽지 못했습니다.'); return; }
    if (picked.cancelled) return;
    const text = picked.text || '';
    try {
      const list = text.trim().startsWith('{') ? fromBackup(JSON.parse(text)) : fromText(text, track() && track().dir);
      if (!list.length) throw new Error('format');
      await locateZips(marks());
      const added = mergeMarks(list), skipped = list.length - added;
      const { linked, tooLong } = relinkMarks(list);
      toast(`북마크 ${added}개를 가져왔습니다.` + (skipped ? ` (중복 ${skipped}개 제외)` : '') + (linked ? ` ${linked}개는 곡에 다시 연결했습니다.` : '') + (tooLong ? ` ${tooLong}개는 곡 길이를 넘어서 연결하지 않았습니다.` : ''));
      if (!$('sheet').hidden) renderSheet();
    } catch (e) {
      toast(e.message === 'folder' ? '폴더 표시가 없는 파일입니다. 해당 폴더의 곡을 재생한 뒤 들여와 주세요.' : '북마크 파일이 아닙니다.');
    }
  }
  $('btnImport').onclick = importMarks;
  $('btnImportSheet').onclick = importMarks;

  // ---- 취침 예약 ----
  const SLEEP_CHOICES = [10, 15, 30, 45, 60, 90];
  function sleepText() {
    if (sleepEnd) return '곡 끝';
    const left = sleepUntil - Date.now();
    return left > 0 ? fmt(left + 999) : '';
  }
  function renderSleepLabel() {
    const text = sleepText();
    $('sleepLabel').textContent = text || '취침';
    $('btnSleep').classList.toggle('on', !!text);
    if ($('sleepMenu').hidden) return;
    $('sleepStatus').textContent = sleepEnd ? '이 곡이 끝나면 멈춥니다.' : text ? `${text} 뒤에 멈춥니다.` : '설정된 예약이 없습니다.';
  }
  setInterval(renderSleepLabel, 1000);
  function setSleep(minutes, endOfTrack) {
    B.setSleep(minutes * 60000, !!endOfTrack);
    $('sleepMenu').hidden = true;
    toast(endOfTrack ? '이 곡이 끝나면 멈춥니다.' : minutes ? `${minutes}분 뒤에 멈춥니다.` : '취침 예약을 껐습니다.');
  }
  function openSleep() {
    const box = $('sleepChoices'); box.textContent = '';
    for (const min of SLEEP_CHOICES) {
      const b = el('button', 'chip', min + '분');
      b.onclick = () => setSleep(min);
      box.append(b);
    }
    const end = el('button', 'chip', '이 곡 끝까지');
    end.onclick = () => setSleep(0, true);
    const custom = el('input', 'chip');
    custom.type = 'number'; custom.inputMode = 'numeric'; custom.placeholder = '직접(분)';
    custom.setAttribute('aria-label', '직접 입력(분)');
    custom.onchange = () => {
      const n = Math.round(Number(custom.value));
      if (n >= 1 && n <= 600) setSleep(n); else toast('1분에서 600분 사이로 입력해 주세요.');
    };
    const off = el('button', 'chip', '끄기');
    off.onclick = () => setSleep(0);
    box.append(end, custom, off);
    $('sleepMenu').hidden = false;
    renderSleepLabel();
  }
  $('btnSleep').onclick = openSleep;
  $('btnInfo').onclick = () => { if (track()) openInfo(track()); };

  function openSheet(mode) { sheetMode = mode; renderSheet(); show('sheet'); }
  function renderSheet() {
    const ul = $('sheetList'); ul.textContent = '';
    $('btnExport').hidden = $('btnImportSheet').hidden = true;
    $('sheetTitle').textContent = '북마크 리스트';
    $('sheetPath').textContent = '';
    const list = folderMarks();
    $('btnExport').hidden = !list.length;
    $('btnImportSheet').hidden = false;
    $('sheetEmpty').textContent = '저장된 북마크가 없습니다.';
    $('sheetEmpty').hidden = list.length > 0;
    for (const m of list) {
      const li = row({ tile: { text: fmt(m.position), cls: 'time' }, name: m.title, memo: m.memo, onTap: () => jumpTo(m) });
      li.append(action('more', '북마크 메뉴', () => openMarkMenu(m)));
      swipeToDelete(li, m);
      ul.append(li);
    }
  }
  function jumpTo(m) {
    const i = trackIndexOf(m);
    if (i < 0) { alert('파일을 찾을 수 없습니다.'); return; }
    B.skipTo(i, m.position); B.play(); show('player');
  }

  // ---- 북마크 입력 ----
  function openDialog(m) {
    editing = m || null;
    const t = track();
    $('dialogTitle').textContent = m ? '북마크 수정' : '북마크 추가';
    $('dialogFile').textContent = m ? m.title : t.title;
    $('markTime').value = fmt(m ? m.position : position);
    $('markMemo').value = m ? m.memo : '';
    $('markError').hidden = true;
    $('dialog').hidden = false;
  }
  $('markTime').oninput = () => { $('markError').hidden = true; };
  $('markCancel').onclick = () => { $('dialog').hidden = true; };
  $('markForm').onsubmit = e => {
    e.preventDefault();
    const ref = editing ? folder.tracks[trackIndexOf(editing)] : track();
    const ms = parseTime($('markTime').value);
    if (ms === null || (ref && ms > ref.duration)) { $('markError').hidden = false; return; }
    const all = marks(), memo = $('markMemo').value.trim();
    if (editing) {
      const m = all.find(x => x.id === editing.id);
      if (m) { m.position = ms; m.memo = memo; }
    } else {
      all.push({ id: Date.now() + '-' + Math.random().toString(36).slice(2, 7), folder: ref.dir || folder.path, uri: ref.uri, title: ref.title, position: ms, memo, duration: ref.duration });
    }
    save('bookmarks', all);
    $('dialog').hidden = true;
    if (!$('sheet').hidden) renderSheet();
  };

  // ---- 설정 ----
  const SKIP_CHOICES = [5, 10, 15, 20, 30, 60];
  const EQ_PRESETS = {
    '기본': [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    '음성·강의': [-6, -4, -2, 0, 2, 4, 4, 2, 0, -2],
    '저음 강화': [6, 5, 4, 2, 0, 0, 0, 0, 0, 0],
    '고음 강화': [0, 0, 0, 0, 0, 1, 3, 4, 5, 6],
    '보컬': [-2, -1, 0, 2, 4, 4, 3, 1, 0, -1],
    '록': [4, 3, 2, 0, -1, 0, 2, 3, 4, 4],
    '팝': [-1, 0, 2, 3, 3, 1, 0, 0, 1, 2],
    '재즈': [3, 2, 0, 1, -1, -1, 0, 1, 2, 3],
    '클래식': [3, 2, 1, 0, 0, 0, -1, 0, 2, 3],
  };
  const EQ_LABELS = ['31', '62', '125', '250', '500', '1k', '2k', '4k', '8k', '16k'];
  const EQ_RANGE = 12;
  const prefs = { gestures: true, skipBack: 10, skipFwd: 10, eqOn: false, eqPreset: '기본', eqGains: EQ_PRESETS['기본'].slice(), ...load('prefs', {}) };
  let settingsFrom = 'folders';

  function savePrefs() { save('prefs', prefs); }
  function applySkipLabels() {
    $('btnBack10').querySelector('b').textContent = prefs.skipBack;
    $('btnFwd10').querySelector('b').textContent = prefs.skipFwd;
    $('btnBack10').setAttribute('aria-label', prefs.skipBack + '초 뒤로');
    $('btnFwd10').setAttribute('aria-label', prefs.skipFwd + '초 앞으로');
  }
  function renderSkip(key, chipsId, valueId) {
    const box = $(chipsId), value = prefs[key];
    box.textContent = '';
    $(valueId).textContent = value + '초';
    for (const s of SKIP_CHOICES) {
      const b = el('button', 'chip' + (s === value ? ' on' : ''), s);
      b.onclick = () => setSkip(key, s, chipsId, valueId);
      box.append(b);
    }
    const custom = el('input', 'chip' + (SKIP_CHOICES.includes(value) ? '' : ' on'));
    custom.type = 'number'; custom.inputMode = 'numeric'; custom.min = 1; custom.max = 600;
    custom.placeholder = '직접';
    custom.setAttribute('aria-label', '직접 입력(초)');
    if (!SKIP_CHOICES.includes(value)) custom.value = value;
    custom.onchange = () => {
      const n = Math.round(Number(custom.value));
      if (n >= 1 && n <= 600) setSkip(key, n, chipsId, valueId);
      else { toast('1초에서 600초 사이로 입력해 주세요.'); renderSkip(key, chipsId, valueId); }
    };
    box.append(custom);
  }
  function setSkip(key, value, chipsId, valueId) {
    prefs[key] = value;
    savePrefs(); applySkipLabels(); renderSkip(key, chipsId, valueId);
  }

  function applyEq() {
    B.setEq(prefs.eqOn, prefs.eqGains).catch(() => {});
    $('eqToggle').classList.toggle('on', prefs.eqOn);
    $('eqToggle').setAttribute('aria-checked', prefs.eqOn);
    $('eqPanel').classList.toggle('off', !prefs.eqOn);
    savePrefs();
  }
  function renderEqPresets() {
    const box = $('eqPresets'); box.textContent = '';
    for (const name of [...Object.keys(EQ_PRESETS), ...(prefs.eqPreset === '사용자' ? ['사용자'] : [])]) {
      const b = el('button', 'chip' + (name === prefs.eqPreset ? ' on' : ''), name);
      b.onclick = () => {
        if (name === '사용자') return;
        prefs.eqPreset = name; prefs.eqGains = EQ_PRESETS[name].slice(); prefs.eqOn = true;
        renderEq();
      };
      box.append(b);
    }
  }
  function drawBand(i) {
    const band = $('eqBands').children[i], g = prefs.eqGains[i];
    const top = (EQ_RANGE - g) / (EQ_RANGE * 2) * 100;
    band.querySelector('.db').textContent = g > 0 ? '+' + g : g;
    band.querySelector('.knob').style.top = top + '%';
    const fill = band.querySelector('.fill');
    fill.style.top = Math.min(top, 50) + '%';
    fill.style.height = Math.abs(top - 50) + '%';
  }
  function renderEq() {
    const box = $('eqBands');
    if (!box.children.length) {
      EQ_LABELS.forEach((label, i) => {
        const band = el('div', 'band');
        band.append(el('div', 'db'));
        const track = el('div', 'track');
        track.append(el('div', 'fill'), el('div', 'knob'));
        band.append(track, el('div', 'hz', label));
        const move = e => {
          const r = track.getBoundingClientRect();
          const ratio = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
          const g = Math.round(EQ_RANGE - ratio * EQ_RANGE * 2);
          if (g === prefs.eqGains[i]) return;
          prefs.eqGains[i] = g;
          prefs.eqOn = true;
          if (prefs.eqPreset !== '사용자') { prefs.eqPreset = '사용자'; renderEqPresets(); }
          drawBand(i);
          applyEq();
        };
        band.onpointerdown = e => { band.setPointerCapture(e.pointerId); move(e); };
        band.onpointermove = e => { if (band.hasPointerCapture(e.pointerId)) move(e); };
        box.append(band);
      });
    }
    EQ_LABELS.forEach((_, i) => drawBand(i));
    renderEqPresets();
    applyEq();
  }
  function openSettings() {
    if (!$('settings').hidden) return; // 넓은 창에서는 설정이 열린 채로 톱니바퀴를 또 누를 수 있다.
    settingsFrom = isWide() ? leftScreen : $('player').hidden ? 'folders' : 'player';
    renderSkip('skipBack', 'skipBackChips', 'skipBackValue');
    renderSkip('skipFwd', 'skipFwdChips', 'skipFwdValue');
    renderEq();
    $('gestureToggle').classList.toggle('on', prefs.gestures);
    show('settings');
  }
  function closeSettings() { document.activeElement && document.activeElement.blur(); show(settingsFrom); }
  $('btnSettings').onclick = openSettings;
  $('btnLicenses').onclick = () => { $('licensesText').textContent = window.LICENSES; $('licenses').hidden = false; };
  $('btnSettings2').onclick = openSettings;
  $('btnSettingsClose').onclick = closeSettings;
  $('eqToggle').onclick = () => { prefs.eqOn = !prefs.eqOn; applyEq(); };
  $('gestureToggle').onclick = () => {
    prefs.gestures = !prefs.gestures;
    savePrefs();
    $('gestureToggle').classList.toggle('on', prefs.gestures);
  };
  $('eqReset').onclick = () => { prefs.eqPreset = '기본'; prefs.eqGains = EQ_PRESETS['기본'].slice(); renderEq(); };
  applySkipLabels();
  applyEq();

  // ---- 색상 테마 ----
  const THEMES = {
    white: { name: '화이트', bg: '#ffffff' }, black: { name: '블랙', bg: '#000000', dark: true },
    pink: { name: '핑크', bg: '#FFD6E7' }, blue: { name: '연블루', bg: '#eaf3fc' },
  };
  function setTheme(wanted) {
    const key = THEMES[wanted] ? wanted : 'black', theme = THEMES[key];
    prefs.theme = key;
    savePrefs();
    document.documentElement.dataset.theme = key;
    document.documentElement.classList.toggle('light', !theme.dark);
    B.setTheme(!!theme.dark, theme.bg).catch(() => {});
    for (const b of $('themeChips').children) b.classList.toggle('on', b.dataset.theme === key);
  }
  for (const [key, theme] of Object.entries(THEMES)) {
    const b = el('button', 'chip themeChip', theme.name);
    b.dataset.theme = key;
    b.style.setProperty('--swatch', theme.bg);
    b.onclick = () => setTheme(key);
    $('themeChips').append(b);
  }
  setTheme(prefs.theme);

  // ---- 조작 ----
  $('mini').onclick = openPlayer;
  $('miniPlay').onclick = e => { e.stopPropagation(); playing ? B.pause() : B.play(); };
  $('btnSpeed').onclick = () => B.setSpeed(SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length]);
  $('btnBack').onclick = () => show('folders');
  $('btnMarks').onclick = () => openSheet('marks');
  $('btnSheetClose').onclick = closeSheet;
  $('btnAddMark').onclick = () => openDialog();
  $('btnPlay').onclick = () => (playing ? B.pause() : B.play());
  const seekBack = () => { position = Math.max(0, position - prefs.skipBack * 1000); B.seekTo(position); };
  const seekForward = () => { position = Math.min(duration, position + prefs.skipFwd * 1000); B.seekTo(position); };
  const prevTrack = () => { if (index > 0) B.skipTo(index - 1, 0); else B.seekTo(0); };
  const nextTrack = () => { if (index < folder.tracks.length - 1) B.skipTo(index + 1, 0); };
  $('btnPrev').onclick = prevTrack;
  $('btnNext').onclick = nextTrack;
  $('btnBack10').onclick = seekBack;
  $('btnFwd10').onclick = seekForward;

  // ---- 터치 동작 ----
  const thumbEl = document.querySelector('.thumb');
  function animateTo(node, transform, done) {
    node.classList.add('snap');
    node.style.transform = transform;
    setTimeout(() => {
      node.classList.remove('snap');
      if (done) done();
    }, 200);
  }
  function showHint(text, side) {
    const h = $('gestureHint');
    h.hidden = true;
    h.className = 'gestureHint' + (side ? ' ' + side : '');
    h.textContent = text;
    void h.offsetWidth; // 같은 힌트를 연달아 띄워도 애니메이션이 다시 돌게 한다.
    h.hidden = false;
    clearTimeout(showHint.timer);
    showHint.timer = setTimeout(() => { h.hidden = true; }, 700);
  }
  // 한 번 터치는 두 번 터치인지 잠깐 기다린다. 건너뛴 직후의 터치는 바로 이어서 건너뛴다.
  const DOUBLE_TAP_MS = 260, KEEP_SKIPPING_MS = 700;
  let tapTimer = 0, lastTapSide = null, lastSkipAt = 0;
  function skipBySide(side) {
    if (side === 'left') { seekBack(); showHint(`-${prefs.skipBack}초`, 'left'); }
    else { seekForward(); showHint(`+${prefs.skipFwd}초`, 'right'); }
    lastSkipAt = performance.now();
  }
  function artTap(e) {
    const r = $('player').getBoundingClientRect();
    const side = e.clientX - r.left < r.width / 2 ? 'left' : 'right';
    if (performance.now() - lastSkipAt < KEEP_SKIPPING_MS && side === lastTapSide) { skipBySide(side); return; }
    if (tapTimer && side === lastTapSide) {
      clearTimeout(tapTimer); tapTimer = 0;
      skipBySide(side);
      return;
    }
    clearTimeout(tapTimer);
    lastTapSide = side;
    tapTimer = setTimeout(() => {
      tapTimer = 0;
      showHint(playing ? '일시정지' : '재생');
      $('btnPlay').click();
    }, DOUBLE_TAP_MS);
  }
  const onLastTrack = () => index >= folder.tracks.length - 1;
  window.Gesture.drag($('player'), {
    canStart: e => prefs.gestures && !!folder && !e.target.closest('button, input'),
    onMove({ dir, dx, dy }) {
      if (dir !== 'x' && isWide()) return;
      if (dir === 'x') {
        const stuck = (dx > 0 && index === 0) || (dx < 0 && onLastTrack());
        thumbEl.style.transform = `translateX(${stuck ? dx * 0.25 : dx}px)`;
      } else {
        $('player').style.transform = `translateY(${dy > 0 ? dy : dy * 0.25}px)`;
      }
    },
    onEnd({ dir, dx, dy, vx, vy, cancelled }) {
      const width = $('player').clientWidth;
      if (dir === 'x') {
        const go = !cancelled && (Math.abs(dx) > width * 0.25 || Math.abs(vx) > 0.6);
        const toNext = dx < 0;
        if (!go || (toNext ? onLastTrack() : index === 0)) { animateTo(thumbEl, '', null); return; }
        animateTo(thumbEl, `translateX(${toNext ? -width : width}px)`, () => {
          (toNext ? nextTrack : prevTrack)();
          thumbEl.style.transform = `translateX(${toNext ? width : -width}px)`;
          void thumbEl.offsetWidth;
          animateTo(thumbEl, '', null);
        });
        return;
      }
      if (isWide()) return;
      const reset = () => { $('player').style.transform = ''; };
      if (!cancelled && (dy > 120 || vy > 0.7)) { animateTo($('player'), `translateY(${window.innerHeight}px)`, () => { show('folders'); reset(); }); return; }
      animateTo($('player'), '', null);
    },
    onTap: e => { if (e.target.closest('.artWrap')) artTap(e); },
  });

  // 목록 화면은 오른쪽으로 밀면 뒤로 간다.
  function swipeBack(id, canGoBack, goBack) {
    const node = $(id);
    window.Gesture.drag(node, {
      dirs: ['right'],
      canStart: e => prefs.gestures && canGoBack() && !e.target.closest('input, textarea, .band, .chips, .crumbs, .tabs'),
      onMove: ({ dx }) => { node.style.transform = `translateX(${Math.max(0, dx)}px)`; },
      onEnd({ dx, vx, cancelled }) {
        if (!cancelled && (dx > node.clientWidth * 0.3 || vx > 0.7)) {
          animateTo(node, `translateX(${node.clientWidth}px)`, () => { goBack(); node.style.transform = ''; });
        } else animateTo(node, '', null);
      },
    });
  }
  swipeBack('sheet', () => true, closeSheet);
  swipeBack('settings', () => true, closeSettings);

  // 북마크는 왼쪽으로 밀면 삭제한다. 되돌리기가 있어서 바로 지운다.
  function swipeToDelete(li, m) {
    window.Gesture.drag(li, {
      dirs: ['left'],
      canStart: () => prefs.gestures,
      onStart: () => li.classList.add('swiping'),
      onMove: ({ dx }) => { li.style.transform = `translateX(${Math.min(0, dx)}px)`; },
      onEnd({ dx, vx, cancelled }) {
        li.classList.remove('swiping');
        if (!cancelled && (dx < -li.clientWidth * 0.4 || vx < -0.8)) {
          animateTo(li, `translateX(${-li.clientWidth}px)`, () => removeMark(m));
        } else animateTo(li, '', null);
      },
    });
  }

  // 미니 플레이어: 좌우로 곡 전환, 위로 재생 화면
  window.Gesture.drag($('mini'), {
    canStart: e => prefs.gestures && !e.target.closest('button'),
    onEnd({ dir, dx, dy, cancelled }) {
      if (cancelled || !folder) return;
      if (dir === 'x' && Math.abs(dx) > 50) (dx < 0 ? nextTrack : prevTrack)();
      if (dir === 'y' && dy < -30) openPlayer();
    },
  });

  // 배속 버튼은 좌우로 밀어서 바꾼다.
  (function speedDrag() {
    const STEP = 34;
    let from = 0;
    window.Gesture.drag($('btnSpeed'), {
      dirs: ['left', 'right'],
      canStart: () => prefs.gestures,
      onStart: () => { from = SPEEDS.indexOf(speed); },
      onMove({ dx }) {
        const i = Math.min(SPEEDS.length - 1, Math.max(0, from + Math.trunc(dx / STEP)));
        if (SPEEDS[i] !== speed) B.setSpeed(SPEEDS[i]);
      },
    });
  })();

  // 아래쪽 창은 위쪽을 잡고 내려서 닫는다.
  for (const id of ['info', 'exportMenu', 'licenses', 'sleepMenu', 'markMenu', 'excerptMenu']) {
    const panel = $(id).querySelector('.infoPanel');
    window.Gesture.drag(panel, {
      dirs: ['down'],
      canStart: e => !!e.target.closest('.infoHead') && !e.target.closest('button'),
      onMove: ({ dy }) => { panel.style.transform = `translateY(${Math.max(0, dy)}px)`; },
      onEnd({ dy, vy, cancelled }) {
        if (!cancelled && (dy > 90 || vy > 0.7)) {
          animateTo(panel, `translateY(${panel.offsetHeight}px)`, () => { closeBottom(id); panel.style.transform = ''; });
        } else animateTo(panel, '', null);
      },
    });
  }

  function bindSeek(el, onCommit, onPreview) {
    el.addEventListener('input', () => { dragging = true; el.style.setProperty('--p', el.value / 10 + '%'); onPreview(el.value / 1000); });
    el.addEventListener('change', () => { dragging = false; onCommit(el.value / 1000); });
  }
  bindSeek($('trackSeek'), r => B.seekTo(r * duration), r => { $('timeCur').textContent = fmt(r * duration); });
  bindSeek($('folderSeek'), r => {
    const p = locate(r * folderTotal());
    if (p.index === index) B.seekTo(p.position); else B.skipTo(p.index, p.position);
  }, r => { $('folderTime').textContent = `${fmt(r * folderTotal())} / ${fmt(folderTotal())}`; });

  B.onError(() => toast('이 파일은 재생할 수 없습니다.'));
  B.onState(s => {
    // 목록을 바꾸는 순간 이전 목록의 상태가 늦게 도착해도 새 폴더에 섞이지 않게 한다.
    if (folder && s.uri && (folder.tracks[s.index] || {}).uri !== s.uri) return;
    const changed = s.index !== index;
    sleepUntil = s.sleepLeft > 0 ? Date.now() + s.sleepLeft : 0;
    sleepEnd = !!s.sleepEnd;
    renderSleepLabel();
    index = s.index; position = s.position; playing = s.playing;
    if (s.speed && s.speed !== speed) {
      speed = s.speed;
      $('btnSpeed').textContent = speed + 'x';
      $('btnSpeed').classList.toggle('on', speed > 1);
    }
    duration = s.duration > 0 ? s.duration : (track() ? track().duration : 0);
    if (s.duration > 0 && track()) track().duration = s.duration;
    if (changed) {
      renderTrack();
      markRows();
      const now = $('playlist').querySelector('li.on');
      if (now) now.scrollIntoView({ block: 'nearest' });
    }
    renderProgress();
  });

  // ---- PC 조작 ----
  function goBack() {
    const open = ['excerptMenu', 'markMenu', 'sleepMenu', 'licenses', 'info', 'exportMenu'].find(id => !$(id).hidden);
    if (open) closeBottom(open);
    else if (!$('rowMenu').hidden) closeRowMenu();
    else if (!$('dialog').hidden) $('dialog').hidden = true;
    else if (!$('settings').hidden) closeSettings();
    else if (!$('sheet').hidden) closeSheet();
    else if (!isWide() && !$('player').hidden) $('btnBack').click();
    else if (!$('searchBar').hidden) closeSearch();
    else selectOnly([]);
  }
  window.addEventListener('mouseup', e => { if (e.button === 3) goBack(); });

  function setVolume(value) {
    prefs.volume = Math.min(100, Math.max(0, Math.round(value)));
    savePrefs();
    B.setVolume(prefs.volume / 100);
    setSeek($('volume'), prefs.volume / 100);
    $('volume').value = prefs.volume;
  }
  $('volume').oninput = () => setVolume(Number($('volume').value));
  document.querySelector('.vol').addEventListener('wheel', e => { e.preventDefault(); setVolume(prefs.volume + (e.deltaY < 0 ? 5 : -5)); }, { passive: false });
  setVolume(prefs.volume ?? 100);

  // 플레이어 접기: 넓은 창에서 목록을 전체로 쓰고 아래 재생 바만 남긴다. 곡을 골라도 저절로 펼치지 않는다.
  function setFolded(on) {
    prefs.playerFolded = on;
    savePrefs();
    document.body.classList.toggle('folded', on);
  }
  function openPlayer() { if (isWide() && prefs.playerFolded) setFolded(false); else show('player'); }
  $('btnFold').onclick = () => setFolded(true);
  document.body.classList.toggle('folded', !!prefs.playerFolded);

  // ---- 창 ----
  // 제목 표시줄 없이 화면 위쪽 띠를 잡아 옮긴다. full: 보통 창, mini: 작은 플레이어, float: 작은 플레이어를 항상 위에 띄운다.
  // 작은 창 두 가지는 투명도를 5%까지 낮출 수 있다.
  // renderMini가 이 부분보다 먼저 불릴 수 있어서 var로 둔다.
  var winMode = 'full', compactArt, cpDragging = false;
  function compactOn() { return winMode === 'mini' || winMode === 'float'; }
  function showOpacity(value) {
    const pct = Math.round(value * 100);
    $('cpOpacity').value = pct;
    $('cpOpacity').style.setProperty('--p', (pct - 5) / 95 * 100 + '%');
    $('cpOpacityValue').textContent = '투명도 ' + pct + '%';
  }
  function applyWindow(s) {
    winMode = s.mode;
    document.body.classList.toggle('cpMode', s.mode !== 'full');
    document.body.classList.toggle('floating', s.mode === 'float');
    document.body.classList.toggle('maximized', !!s.maximized);
    $('winMax').setAttribute('aria-label', s.maximized ? '이전 크기로' : '최대화');
    $('winMax').title = $('winMax').getAttribute('aria-label');
    $('cpPin').classList.toggle('on', s.mode === 'float');
    $('cpPin').title = s.mode === 'float' ? '고정 풀기' : '항상 위에 고정';
    showOpacity(s.opacity);
    if (s.mode !== 'full') { closeRowMenu(); renderCompact(); }
  }
  const setMode = mode => B.setWindowMode(mode).then(applyWindow);
  $('winMini').onclick = () => setMode('mini');
  $('winFloat').onclick = () => setMode('float');
  $('winMin').onclick = () => B.windowAction('minimize');
  $('winMax').onclick = () => B.windowAction('maximize');
  for (const id of ['winClose', 'cpClose']) $(id).onclick = () => B.windowAction('close');
  $('cpExpand').onclick = () => setMode('full');
  $('cpPin').onclick = () => setMode(winMode === 'float' ? 'mini' : 'float');
  B.onWindow(applyWindow);
  B.windowState().then(applyWindow);

  function setOpacity(pct) {
    pct = Math.min(100, Math.max(5, Math.round(pct)));
    showOpacity(pct / 100);
    B.setOpacity(pct / 100);
  }
  $('cpOpacity').oninput = () => setOpacity(Number($('cpOpacity').value));
  document.querySelector('.cpOpacity').addEventListener('wheel', e => { e.preventDefault(); setOpacity(Number($('cpOpacity').value) + (e.deltaY < 0 ? 5 : -5)); }, { passive: false });

  // 미니 플레이어 표시. 재생 표시(renderMini)가 바뀔 때마다 같이 그린다.
  function renderCompact() {
    if (!compactOn()) return;
    const t = track();
    document.body.classList.toggle('cpEmpty', !t);
    $('cpTitle').textContent = t ? t.title : '재생할 곡이 없습니다';
    $('cpSub').textContent = t ? $('trackAlbum').textContent : '재생목록에 곡을 끌어다 놓으세요';
    $('cpIcon').setAttribute('d', playing ? PAUSE : PLAY);
    $('cpTime').textContent = t ? `${fmt(position)} / ${fmt(duration)}` : '';
    if (!cpDragging) setSeek($('cpSeek'), t && duration ? position / duration : 0);
    const art = t ? currentArt : null;
    if (art !== compactArt) {
      compactArt = art;
      $('cpArt').hidden = !art;
      if (art) $('cpArt').src = art;
    }
  }
  $('cpSeek').addEventListener('input', () => {
    cpDragging = true;
    $('cpSeek').style.setProperty('--p', $('cpSeek').value / 10 + '%');
    $('cpTime').textContent = `${fmt($('cpSeek').value / 1000 * duration)} / ${fmt(duration)}`;
  });
  $('cpSeek').addEventListener('change', () => { cpDragging = false; if (track()) B.seekTo($('cpSeek').value / 1000 * duration); });
  $('cpPlay').onclick = () => togglePlay();
  $('cpPrev').onclick = () => { if (folder) prevTrack(); };
  $('cpNext').onclick = () => { if (folder) nextTrack(); };
  $('cpBack').onclick = () => { if (folder) skipBySide('left'); };
  $('cpFwd').onclick = () => { if (folder) skipBySide('right'); };
  // 앨범아트와 제목은 늦게 도착하기도 해서 바뀌는 대로 따라 그린다.
  new MutationObserver(renderCompact).observe($('trackAlbum'), { childList: true, characterData: true, subtree: true });
  new MutationObserver(renderCompact).observe($('art'), { attributes: true, attributeFilter: ['src', 'hidden'] });

  // ---- 재생목록 ----
  // 끌어다 놓거나 고른 곡을 모아 두는 목록 하나가 앱의 중심이다. 곡은 주소로 구분해서 같은 곡은 두 번 넣지 않는다.
  const playlist = { path: 'list:main', name: '재생목록', tracks: [], virtual: true };
  const selected = new Set();
  const EDGE_PX = 40, SCROLL_STEP = 14, DRAG_START_PX = 6;
  const foldedGroups = new Set(prefs.foldedGroups || []);
  let anchor = -1, query = '';

  const rowIndex = node => { const li = node.closest('#playlist li[data-i]'); return li ? Number(li.dataset.i) : -1; };
  const trackRows = () => [...$('playlist').querySelectorAll('li[data-i]')];
  const headOf = node => node.closest('#playlist li.groupRow');
  const tracksOfHead = li => playlist.tracks.slice(Number(li.dataset.at), Number(li.dataset.at) + Number(li.dataset.count));

  // 같은 폴더의 곡은 항상 붙어 있게 한다. 폴더 순서는 먼저 나온 곡을 따른다.
  // ZIP의 곡은 한데 붙어 있고, 그 안에서 다시 ZIP 안의 폴더별로 붙어 있게 한다.
  // ZIP 맨 위의 곡은 ZIP 줄 바로 아래, 안의 폴더들보다 앞에 둔다.
  const groupKey = t => (t.subdir ? `${t.dir}/${t.subdir}` : t.dir);
  function groupedOrder(list) {
    const dirs = new Map();
    for (const t of list) {
      if (!dirs.has(t.dir)) dirs.set(t.dir, new Map([[t.dir, []]]));
      const subs = dirs.get(t.dir), key = groupKey(t);
      if (!subs.has(key)) subs.set(key, []);
      subs.get(key).push(t);
    }
    return [...dirs.values()].flatMap(subs => [...subs.values()].flat());
  }
  function groupsOf(list) {
    const groups = [];
    list.forEach((t, i) => {
      const last = groups[groups.length - 1], key = groupKey(t);
      if (last && last.key === key) last.tracks.push(t);
      else groups.push({ key, dir: t.dir, subdir: t.subdir || '', place: t.place, start: i, tracks: [t] });
    });
    return groups;
  }
  const matches = (t, q) => [t.title, t.tag, t.artist, t.album, t.place].some(v => (v || '').toLowerCase().includes(q));
  function markRows() {
    const current = track();
    for (const li of $('playlist').children) {
      const tracks = li.dataset.i === undefined ? tracksOfHead(li) : [playlist.tracks[li.dataset.i]];
      li.classList.toggle('on', tracks.includes(current));
      li.classList.toggle('picked', tracks.every(t => selected.has(t.uri)));
    }
  }
  // depth 1은 ZIP 줄 아래에 한 단계 들여 쓴 ZIP 안의 폴더 줄이다.
  function groupRow(g, name, depth = 0) {
    const total = g.tracks.reduce((s, t) => s + t.duration, 0), zip = g.dir.startsWith('zip:');
    const li = row({ tile: zip && !g.subdir ? 'zip' : 'folder', name, sub: `${g.tracks.length}곡 · ${fmt(total)}` });
    li.classList.add('groupRow');
    li.classList.toggle('subGroup', depth > 0);
    li.classList.toggle('closed', foldedGroups.has(g.key));
    li.dataset.at = g.start;
    li.dataset.count = g.tracks.length;
    li.title = zip ? [g.place, g.subdir].filter(Boolean).join('/') : g.dir;
    const fold = el('button', 'act foldBtn');
    fold.innerHTML = CHEVRON;
    fold.setAttribute('aria-label', '폴더 접기/펼치기');
    fold.onclick = () => toggleGroup(g.key);
    li.prepend(fold);
    li.append(action('trash', '폴더를 목록에서 빼기', () => removeTracks(g.tracks)));
    return li;
  }
  function toggleGroup(key) {
    if (!foldedGroups.delete(key)) foldedGroups.add(key);
    prefs.foldedGroups = [...foldedGroups];
    savePrefs();
    renderPlaylist();
  }
  // 이름이 같은 폴더는 상위 폴더까지 보여 구분한다.
  function groupNames(groups) {
    const seen = {};
    for (const g of groups) if (!g.subdir) seen[g.place] = (seen[g.place] || 0) + 1;
    return g => (seen[g.place] > 1 && !g.dir.startsWith('zip:') ? shortPath(g.dir).split('/').slice(-2).join('/') : g.place);
  }
  // depth 0: 묶음 없음, 1: 폴더나 ZIP 아래, 2: ZIP 안의 폴더 아래
  function playlistRow(t, i, depth) {
    const about = [t.artist, t.album].filter(Boolean).join(' · ') || (depth ? '' : t.place);
    const li = row({ tile: 'track', thumb: t.uri, name: t.tag || t.title, sub: about });
    li.dataset.i = li.dataset.at = i;
    li.classList.toggle('inGroup', depth > 0);
    li.classList.toggle('deep', depth > 1);
    li.querySelector('.main').prepend(el('span', 'idx', i + 1));
    li.append(el('span', 'dur', fmt(t.duration)), action('trash', '목록에서 빼기', () => removeTracks([t])));
    return li;
  }
  function renderPlaylist() {
    const ul = $('playlist'), list = playlist.tracks, q = query.trim().toLowerCase(), rows = document.createDocumentFragment();
    const groups = groupsOf(list), nameOf = groupNames(groups);
    const foundIn = g => g.tracks.map((t, n) => [t, g.start + n]).filter(([t]) => !q || matches(t, q));
    const folded = key => !q && foldedGroups.has(key);
    let shown = 0;
    for (let n = 0; n < groups.length;) {
      // 같은 폴더나 ZIP의 묶음은 붙어 있다. ZIP 안에 폴더가 있으면 ZIP 줄 아래에 폴더 줄을 둔다.
      let end = n + 1;
      while (end < groups.length && groups[end].dir === groups[n].dir) end++;
      const inner = groups.slice(n, end).map(g => [g, foundIn(g)]).filter(([, f]) => f.length);
      n = end;
      if (!inner.length) continue;
      const g = inner[0][0];
      if (inner.some(([s]) => s.subdir)) {
        const all = groups.filter(s => s.dir === g.dir);
        const zip = { key: g.dir, dir: g.dir, subdir: '', place: g.place, start: all[0].start, tracks: all.flatMap(s => s.tracks) };
        rows.append(groupRow(zip, g.place));
        for (const [, f] of inner) shown += f.length;
        if (folded(zip.key)) continue;
        for (const [s, f] of inner) {
          if (s.subdir) rows.append(groupRow(s, s.subdir.split('/').join(' › '), 1));
          if (s.subdir && folded(s.key)) continue;
          for (const [t, i] of f) rows.append(playlistRow(t, i, s.subdir ? 2 : 1));
        }
        continue;
      }
      for (const [s, f] of inner) {
        const inGroup = s.tracks.length > 1;
        if (inGroup) rows.append(groupRow(s, nameOf(s)));
        shown += f.length;
        if (inGroup && folded(s.key)) continue;
        for (const [t, i] of f) rows.append(playlistRow(t, i, inGroup ? 1 : 0));
      }
    }
    ul.textContent = '';
    ul.append(rows);
    ul.hidden = $('listTools').hidden = !list.length;
    $('listEmpty').hidden = list.length > 0;
    const total = list.reduce((s, t) => s + t.duration, 0);
    $('listInfo').textContent = q ? `'${query.trim()}' ${shown}곡` : `${list.length}곡 · ${fmt(total)}`;
    markRows();
  }
  function selectOnly(tracks) {
    selected.clear();
    for (const t of tracks) selected.add(t.uri);
    markRows();
  }
  const selectedTracks = () => playlist.tracks.filter(t => selected.has(t.uri));

  // 목록을 바꾼다. 듣고 있는 곡이 남아 있으면 끊지 않고, 빠졌으면 바로 다음 곡으로 넘어간다.
  async function applyTracks(changed) {
    const list = groupedOrder(changed), current = track(), before = playlist.tracks, wasPlaying = playing;
    const kept = new Set(list.map(t => t.uri));
    playlist.tracks = list;
    for (const uri of [...selected]) if (!kept.has(uri)) selected.delete(uri);
    B.savePlaylist(list).catch(() => toast('재생목록을 저장하지 못했습니다.'));
    if (!list.length) closePlaylist();
    else if (!folder) await openFolder(playlist);
    else if (kept.has(current.uri)) {
      index = list.findIndex(t => t.uri === current.uri);
      B.syncQueue(list, index);
    } else {
      const next = before.slice(index + 1).find(t => kept.has(t.uri)) || list[list.length - 1];
      index = list.findIndex(t => t.uri === next.uri); position = 0; duration = next.duration;
      renderTrack();
      await B.setQueue(list, index, 0, wasPlaying, playlist.path);
    }
    renderPlaylist();
    renderProgress();
    adoptMarks();
  }
  function closePlaylist() {
    B.stop();
    folder = null; index = 0; position = 0; duration = 0; playing = false; artToken++;
    setArt(null);
    document.body.classList.remove('hasTrack');
    renderMini();
    show('folders');
  }

  function addedText(fresh, repeated, r) {
    const parts = [];
    if (fresh) parts.push(`곡 ${fresh}개를 추가했습니다.`);
    if (repeated) parts.push(`이미 있는 곡 ${repeated}개는 건너뛰었습니다.`);
    const kinds = Object.keys(r.skipped);
    if (kinds.length) parts.push(`재생할 수 없는 파일 ${kinds.reduce((s, k) => s + r.skipped[k], 0)}개(${kinds.join(', ')})는 뺐습니다.`);
    if (r.errors.length) parts.push(r.errors[0] + (r.errors.length > 1 ? ` 외 ${r.errors.length - 1}개` : ''));
    return parts.join(' ') || '추가할 음악 파일이 없습니다.';
  }
  // 불러오는 동안에도 계속 넣을 수 있다. 넣은 순서대로 하나씩 처리한다.
  let addQueue = Promise.resolve(), adding = 0;
  function showLoading(text) {
    $('addStatus').textContent = text;
    $('addStatus').hidden = !text;
  }
  const loadingText = progress => `불러오는 중…${progress}${adding > 1 ? ` (대기 ${adding - 1}건)` : ''}`;
  // at: 넣을 자리(없으면 맨 뒤). play: 넣은 곡을 바로 재생한다. 목록이 비어 있었으면 재생을 시작한다.
  function addPaths(paths, options = {}) {
    if (!paths.length) return addQueue;
    adding++;
    showLoading(loadingText(''));
    addQueue = addQueue.then(() => addNow(paths, options)).finally(() => {
      adding--;
      showLoading(adding ? loadingText('') : '');
    });
    return addQueue;
  }
  async function addNow(paths, { at, play }) {
    let r;
    try {
      r = await B.collect(paths);
    } catch (e) {
      toast(e.message || '파일을 불러오지 못했습니다.');
      return;
    }
    const known = new Set(playlist.tracks.map(t => t.uri));
    const fresh = r.tracks.filter(t => !known.has(t.uri) && known.add(t.uri));
    const wasEmpty = !folder;
    // 이미 있는 폴더의 곡은 놓은 자리와 상관없이 그 폴더의 끝으로 들어간다. 묶음이 끌려오지 않게 한다.
    const dirs = new Set(playlist.tracks.map(groupKey)), list = playlist.tracks.slice();
    list.splice(at ?? list.length, 0, ...fresh.filter(t => !dirs.has(groupKey(t))));
    list.push(...fresh.filter(t => dirs.has(groupKey(t))));
    if (fresh.length) await applyTracks(list);
    toast(addedText(fresh.length, r.tracks.length - fresh.length, r));
    if (r.tracks.length && (play || wasEmpty)) playFrom(playlist, playlist.tracks.findIndex(t => t.uri === r.tracks[0].uri));
  }
  B.onAddProgress(({ done, total }) => showLoading(loadingText(` ${done} / ${total}`)));
  B.onOpen(paths => addPaths(paths, { play: true }));

  function removeTracks(tracks) {
    if (!tracks.length) return;
    const before = playlist.tracks, gone = new Set(tracks.map(t => t.uri));
    applyTracks(before.filter(t => !gone.has(t.uri)));
    toast(`곡 ${tracks.length}개를 목록에서 뺐습니다.`, '되돌리기', () => applyTracks(before));
  }
  function moveSelected(at) {
    const list = playlist.tracks, rest = list.filter(t => !selected.has(t.uri));
    const place = list.slice(0, at).filter(t => !selected.has(t.uri)).length;
    rest.splice(place, 0, ...selectedTracks());
    applyTracks(rest);
  }
  function sortTracks() {
    applyTracks(playlist.tracks.slice().sort((a, b) => naturally(a.dir, b.dir) || naturally(a.subdir || '', b.subdir || '') || naturally(a.title, b.title)));
  }
  const addFiles = async () => addPaths(await B.pickFiles());
  const addFolder = async () => addPaths(await B.pickFolder());
  for (const id of ['btnAddFiles', 'btnAddFiles2']) $(id).onclick = addFiles;
  for (const id of ['btnAddFolder', 'btnAddFolder2']) $(id).onclick = addFolder;
  $('btnSortList').onclick = sortTracks;
  $('btnClearList').onclick = () => removeTracks(playlist.tracks);

  // 클릭은 선택, 더블클릭은 재생이다. Ctrl과 Shift로 여러 곡을 고른다.
  let justMoved = false;
  function pick(i, e) {
    const t = playlist.tracks[i];
    if (e.shiftKey && anchor >= 0) {
      const rows = trackRows().map(li => Number(li.dataset.i));
      const a = rows.indexOf(anchor), b = rows.indexOf(i);
      if (a >= 0) { selectOnly(rows.slice(Math.min(a, b), Math.max(a, b) + 1).map(n => playlist.tracks[n])); return; }
    }
    anchor = i;
    if (!e.ctrlKey) { selectOnly([t]); return; }
    if (selected.has(t.uri)) selected.delete(t.uri); else selected.add(t.uri);
    markRows();
  }
  $('playlist').addEventListener('click', e => {
    if (justMoved || e.target.closest('.act')) return;
    const head = headOf(e.target), i = rowIndex(e.target);
    if (head) selectOnly(tracksOfHead(head));
    else if (i >= 0) pick(i, e);
    else selectOnly([]);
  });
  $('playlist').addEventListener('dblclick', e => {
    const head = headOf(e.target), i = head ? Number(head.dataset.at) : rowIndex(e.target);
    if (i >= 0 && !e.target.closest('.act')) playFrom(playlist, i);
  });

  // 재생목록 안에서 넣을 자리를 찾아 표시한다. 줄은 위아래로 정렬되어 있어서 반씩 좁혀 찾는다.
  // 폴더 제목 줄과 곡 줄 모두 data-at에 그 자리의 곡 번호가 있다.
  const slotToIndex = slot => { const li = $('playlist').children[slot]; return li ? Number(li.dataset.at) : playlist.tracks.length; };
  function slotAt(y) {
    const rows = $('playlist').children;
    let low = 0, high = rows.length;
    while (low < high) {
      const mid = (low + high) >> 1, r = rows[mid].getBoundingClientRect();
      if (y < r.top + r.height / 2) high = mid; else low = mid + 1;
    }
    return low;
  }
  function showSlot(slot) {
    const ul = $('playlist'), rows = ul.children, box = ul.getBoundingClientRect(), line = $('dropLine');
    const y = slot < rows.length ? rows[slot].getBoundingClientRect().top : rows[rows.length - 1].getBoundingClientRect().bottom;
    line.style.top = Math.min(box.bottom, Math.max(box.top, y)) - 1 + 'px';
    line.style.left = box.left + 12 + 'px';
    line.style.width = box.width - 24 + 'px';
    line.hidden = false;
  }
  function scrollNearEdge(y) {
    const ul = $('playlist'), box = ul.getBoundingClientRect();
    if (y < box.top + EDGE_PX) ul.scrollTop -= SCROLL_STEP;
    else if (y > box.bottom - EDGE_PX) ul.scrollTop += SCROLL_STEP;
  }

  // 끌기: 고른 줄이나 폴더 제목 줄을 끌면 순서를 바꾸고, 고르지 않은 줄이나 빈 곳에서 끌면 사각형으로 범위를 고른다.
  // Ctrl을 누르고 범위를 그리면 이미 고른 곡에 더한다. 검색 중에는 보이는 순서가 전체 순서와 달라서 순서를 바꾸지 않는다.
  let press = null, marqueeFrame = 0;
  $('playlist').addEventListener('pointerdown', e => {
    if (e.button !== 0 || e.target.closest('.act')) return;
    const head = headOf(e.target), i = rowIndex(e.target), ul = $('playlist');
    if (e.offsetX > ul.clientWidth && e.target === ul) return; // 스크롤바
    const pickedRow = i >= 0 && selected.has(playlist.tracks[i].uri) && !e.shiftKey && !e.ctrlKey;
    const move = !query.trim() && (head || pickedRow);
    press = { id: e.pointerId, x: e.clientX, y: e.clientY, i, head, move, moving: false };
    if (!move) Object.assign(press, { top: e.clientY - ul.getBoundingClientRect().top + ul.scrollTop, base: e.ctrlKey ? new Set(selected) : new Set() });
  });
  $('playlist').addEventListener('pointermove', e => {
    if (!press || e.pointerId !== press.id) return;
    press.cx = e.clientX; press.cy = e.clientY;
    if (!press.moving) {
      if (Math.hypot(e.clientX - press.x, e.clientY - press.y) < DRAG_START_PX) return;
      press.moving = true;
      $('playlist').setPointerCapture(e.pointerId);
      closeRowMenu();
      if (press.head) selectOnly(tracksOfHead(press.head));
      if (!press.move) { $('marquee').hidden = false; marqueeLoop(); }
    }
    if (!press.move) { drawMarquee(); return; }
    scrollNearEdge(e.clientY);
    press.slot = slotAt(e.clientY);
    showSlot(press.slot);
  });
  // 범위 사각형. 끝에 대고 있으면 목록이 굴러가며 계속 넓어진다.
  function marqueeLoop() {
    if (!press || press.move || !press.moving) return;
    scrollNearEdge(press.cy);
    drawMarquee();
    marqueeFrame = requestAnimationFrame(marqueeLoop);
  }
  function drawMarquee() {
    const ul = $('playlist'), box = ul.getBoundingClientRect(), m = $('marquee');
    const y0 = box.top + press.top - ul.scrollTop, y1 = Math.min(box.bottom, Math.max(box.top, press.cy));
    const top = Math.max(box.top, Math.min(y0, y1)), bottom = Math.min(box.bottom, Math.max(y0, y1));
    const left = Math.max(box.left, Math.min(press.x, press.cx)), right = Math.min(box.right, Math.max(press.x, press.cx));
    Object.assign(m.style, { left: left + 'px', top: top + 'px', width: Math.max(0, right - left) + 'px', height: Math.max(0, bottom - top) + 'px' });
    // 줄은 위아래로 정렬되어 있어서 사각형 위쪽에 걸친 줄부터 아래로 훑는다.
    const rows = ul.children, chosen = new Set(press.base), from = Math.min(y0, y1), to = Math.max(y0, y1);
    let first = slotAt(from);
    if (first > 0 && rows[first - 1].getBoundingClientRect().bottom > from) first--;
    for (let n = first; n < rows.length; n++) {
      const li = rows[n], r = li.getBoundingClientRect();
      if (r.top >= to) break;
      if (r.bottom <= from) continue;
      // 접힌 폴더는 제목 줄에 걸치면 안의 곡을 모두 고른다.
      const tracks = li.dataset.i !== undefined ? [playlist.tracks[li.dataset.i]] : li.classList.contains('closed') ? tracksOfHead(li) : [];
      for (const t of tracks) chosen.add(t.uri);
    }
    selected.clear();
    for (const uri of chosen) selected.add(uri);
    markRows();
  }
  function endPress(e, cancelled) {
    if (!press || e.pointerId !== press.id) return;
    const done = press;
    press = null;
    if (!done.moving) return;
    $('dropLine').hidden = $('marquee').hidden = true;
    cancelAnimationFrame(marqueeFrame);
    justMoved = true;
    setTimeout(() => { justMoved = false; }, 60); // 끌기를 끝낸 자리의 클릭이 선택을 바꾸지 않게 한다.
    if (!done.move) { const first = playlist.tracks.findIndex(t => selected.has(t.uri)); if (first >= 0) anchor = first; return; }
    if (!cancelled) moveSelected(slotToIndex(done.slot));
  }
  $('playlist').addEventListener('pointerup', e => endPress(e, false));
  $('playlist').addEventListener('pointercancel', e => endPress(e, true));

  // 탐색기에서 끌어다 놓기. 목록 위에 놓으면 그 자리에, 다른 곳에 놓으면 맨 뒤에 넣는다.
  const carriesFiles = e => [...e.dataTransfer.types].includes('Files');
  function dropSlot(e) {
    const ul = $('playlist');
    return ul.contains(e.target) && !query.trim() && ul.children.length ? slotAt(e.clientY) : null;
  }
  function endDrag() { document.body.classList.remove('dropping'); $('dropLine').hidden = true; }
  document.addEventListener('dragover', e => {
    e.preventDefault();
    if (!carriesFiles(e)) return;
    e.dataTransfer.dropEffect = 'copy';
    document.body.classList.add('dropping');
    const slot = dropSlot(e);
    if (slot === null) { $('dropLine').hidden = true; return; }
    scrollNearEdge(e.clientY);
    showSlot(slot);
  });
  document.addEventListener('dragleave', e => { if (!e.relatedTarget) endDrag(); });
  document.addEventListener('drop', e => {
    e.preventDefault();
    const slot = dropSlot(e);
    endDrag();
    addPaths([...e.dataTransfer.files].map(f => B.pathOf(f)).filter(Boolean), { at: slot === null ? undefined : slotToIndex(slot) });
  });

  // 오른쪽 클릭 메뉴
  let menuTrack = null;
  function closeRowMenu() { $('rowMenu').hidden = true; }
  $('playlist').addEventListener('contextmenu', e => {
    const head = headOf(e.target), i = rowIndex(e.target);
    if (!head && i < 0) return;
    e.preventDefault();
    menuTrack = head ? tracksOfHead(head)[0] : playlist.tracks[i];
    if (head) selectOnly(tracksOfHead(head));
    else if (!selected.has(menuTrack.uri)) { anchor = i; selectOnly([menuTrack]); }
    const menu = $('rowMenu');
    menu.hidden = false;
    menu.style.left = Math.min(e.clientX, innerWidth - menu.offsetWidth - 8) + 'px';
    menu.style.top = Math.min(e.clientY, innerHeight - menu.offsetHeight - 8) + 'px';
  });
  document.addEventListener('pointerdown', e => { if (!e.target.closest('#rowMenu')) closeRowMenu(); });
  $('playlist').addEventListener('scroll', closeRowMenu);
  const fromMenu = run => () => { closeRowMenu(); run(menuTrack); };
  $('rowPlay').onclick = fromMenu(t => playFrom(playlist, playlist.tracks.indexOf(t)));
  $('rowInfo').onclick = fromMenu(openInfo);
  $('rowReveal').onclick = fromMenu(t => B.revealTrack(t.uri).catch(() => toast('파일을 찾을 수 없습니다.')));
  $('rowRemove').onclick = fromMenu(() => removeTracks(selectedTracks()));

  // 검색은 재생목록을 걸러서 보여 준다.
  function closeSearch() {
    $('searchBar').hidden = true;
    query = '';
    renderPlaylist();
  }
  $('btnSearch').onclick = () => {
    $('searchBar').hidden = false;
    $('searchInput').value = '';
    $('searchInput').focus();
  };
  $('searchClose').onclick = closeSearch;
  $('searchInput').oninput = () => { query = $('searchInput').value; renderPlaylist(); };

  const togglePlay = () => { if (folder) (playing ? B.pause() : B.play()); };
  function openSearch() {
    if (!folder || compactOn()) return;
    show('folders');
    $('btnSearch').click();
  }
  // 재생목록이 보이고 위에 다른 창이 없을 때만 목록 키가 듣는다.
  const listActive = () => !$('folders').hidden && [...document.querySelectorAll('.dim')].every(d => d.hidden);
  const KEYS = {
    ' ': togglePlay,
    ArrowLeft: e => { if (!folder) return; if (e.ctrlKey) prevTrack(); else skipBySide('left'); },
    ArrowRight: e => { if (!folder) return; if (e.ctrlKey) nextTrack(); else skipBySide('right'); },
    ArrowUp: () => setVolume(prefs.volume + 5),
    ArrowDown: () => setVolume(prefs.volume - 5),
    Delete: () => { if (listActive()) removeTracks(selectedTracks()); },
    Enter: () => { const t = selectedTracks()[0]; if (t && listActive()) playFrom(playlist, playlist.tracks.indexOf(t)); },
    b: () => { if (track() && !compactOn()) openDialog(); },
    s: () => { if (folder) $('btnSpeed').click(); },
    p: () => { if (folder && isWide() && !compactOn()) setFolded(!prefs.playerFolded); },
  };
  document.addEventListener('keydown', e => {
    const t = e.target, typing = t.matches('textarea, input:not([type=range])'), key = e.key.toLowerCase();
    if (e.key === 'Escape') { if (typing) t.blur(); goBack(); return; }
    if (e.ctrlKey && key === 'f') { e.preventDefault(); openSearch(); return; }
    if (e.ctrlKey && key === 'o') { e.preventDefault(); addFiles(); return; }
    if (typing || !$('dialog').hidden || e.altKey || e.metaKey) return;
    if (e.ctrlKey && key === 'a') {
      e.preventDefault();
      if (listActive()) selectOnly(query.trim() ? trackRows().map(li => playlist.tracks[li.dataset.i]) : playlist.tracks);
      return;
    }
    if (e.key === 'Enter' && t.closest('button')) return;
    const run = KEYS[e.key.length === 1 ? key : e.key];
    if (!run) return;
    e.preventDefault();
    run(e);
  });
  // 버튼을 누른 뒤 Space가 그 버튼을 다시 누르지 않게 한다.
  document.addEventListener('click', e => { const b = e.target.closest('button, input[type=range]'); if (b) b.blur(); });
  // 아이콘 버튼에 마우스를 올리면 설명이 보인다.
  for (const b of document.querySelectorAll('button[aria-label]')) b.title = b.getAttribute('aria-label');

  B.onMedia(action => {
    if (action === 'play') B.play();
    else if (action === 'pause') B.pause();
    else if (!folder) return;
    else if (action === 'previoustrack') prevTrack();
    else nextTrack();
  });

  // ---- 시스템 글꼴 ----
  // 윈도우에 설치된 기본 글꼴을 쓴다.
  async function applySystemFont() {
    let name = '';
    try {
      const r = await B.getSystemFonts();
      const faces = r.fonts.map(f => new FontFace('DAA System', f.src, { weight: f.weight, unicodeRange: f.range || 'U+0-10FFFF' }));
      for (const face of await Promise.all(faces.map(f => f.load()))) document.fonts.add(face);
      if (faces.length) { name = r.name || ''; systemFontLoaded = true; }
    } catch (e) { name = ''; }
    $('appFont').textContent = `적용된 글꼴: ${name || '윈도우 기본 글꼴'}`;
  }
  applySystemFont();

  // ---- 시작 ----
  function migrateZipUris() {
    const fix = u => (u || '').replace(/^file:.*\/zips\/([0-9a-f]+)\/(\d+\.\w+)$/, 'zipentry://$1/$2');
    save('bookmarks', marks().map(m => ({ ...m, uri: fix(m.uri) })));
    const r = load('resume', {});
    for (const k in r) r[k].uri = fix(r[k].uri);
    save('resume', r);
  }
  async function start() {
    migrateZipUris();
    playlist.tracks = groupedOrder(await B.loadPlaylist().catch(() => []));
    if (playlist.tracks.length) await openFolder(playlist);
    renderPlaylist();
    addPaths(await B.takeOpened(), { play: true });
  }
  B.appVersion().then(version => { $('appVersion').textContent = `DIV AUDIO APP 버전 ${version}`; });
  start();
})();
