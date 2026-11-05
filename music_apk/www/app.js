(function () {
  const $ = id => document.getElementById(id);
  const B = window.Bridge;
  const PLAY = 'M7 4l13 8-13 8z', PAUSE = 'M6 4h4.5v16H6zM13.5 4H18v16h-4.5z';

  let browsing = null, folder = null, index = 0, position = 0, duration = 0, playing = false;
  const SPEEDS = [1, 2, 4, 8, 16];
  let storeMode = false;
  let speed = 1, busyTimer = 0, toastTimer = 0, infoToken = null, lastExport = null;
  let dragging = false, sheetMode = null, editing = null, lastSave = 0, artToken = 0, currentArt = null;

  // ---- 저장 ----
  const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
  const save = (k, v) => localStorage.setItem(k, JSON.stringify(v));
  const marks = () => load('bookmarks', []);
  const saveResume = () => { if (folder) { const r = load('resume', {}); r[folder.path] = { uri: track()?.uri, position }; save('resume', r); } };

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
  function show(id) { for (const s of ['folders', 'player', 'sheet', 'settings']) $(s).hidden = s !== id; }
  const pathText = f => (f.crumbs || []).map(c => c.name).join(' › ');
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
    $('trackAlbum').textContent = folder.name;
    const token = ++artToken;
    B.getArt(t.uri).catch(() => null).then(url => { if (token === artToken) setArt(url); });
    tagsOf(t.uri).then(info => {
      const album = info && info.tags.find(x => x.label === '앨범');
      if (token === artToken && album) $('trackAlbum').textContent = album.value;
    });
  }

  // ---- 리스트 공통 ----
  const ICONS = {
    folder: '<svg viewBox="0 0 24 24"><path d="M3 7.5A2.5 2.5 0 0 1 5.5 5h3.7c.7 0 1.3.3 1.8.8l1 1.2h6.5A2.5 2.5 0 0 1 21 9.5v7a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 16.5z" fill="currentColor"/></svg>',
    zip: '<svg viewBox="0 0 24 24"><path d="M6 3h8l5 5v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/><path d="M10 4v2h2v2h-2v2h2v2h-2v3h2" fill="none" stroke="currentColor" stroke-width="1.7"/></svg>',
    track: '<svg viewBox="0 0 24 24"><path d="M9 18V5.5l11-2V16" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/><circle cx="6.5" cy="18" r="2.5" fill="currentColor"/><circle cx="17.5" cy="16" r="2.5" fill="currentColor"/></svg>',
    star: '<svg viewBox="0 0 24 24"><path d="m12 3.5 2.6 5.4 5.9.8-4.3 4.1 1 5.9-5.2-2.8-5.2 2.8 1-5.9-4.3-4.1 5.9-.8z" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/></svg>',
    starOn: '<svg viewBox="0 0 24 24"><path d="m12 3.5 2.6 5.4 5.9.8-4.3 4.1 1 5.9-5.2-2.8-5.2 2.8 1-5.9-4.3-4.1 5.9-.8z" fill="currentColor"/></svg>',
    info: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 11v6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><circle cx="12" cy="7.6" r="1.3" fill="currentColor"/></svg>',
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
      const uri = e.target.dataset.uri;
      B.getThumb(uri).catch(() => null).then(url => {
        thumbCache.set(uri, url);
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
  function watchThumb(tileEl, uri) {
    if (thumbCache.has(uri)) { showThumb(tileEl, thumbCache.get(uri)); return; }
    tileEl.dataset.uri = uri;
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
  // ---- 폴더 즐겨찾기 ----
  const favs = () => load('favorites', []);
  const isFav = path => favs().some(f => f.path === path);
  function toggleFav(item) {
    const list = favs();
    save('favorites', isFav(item.path) ? list.filter(f => f.path !== item.path) : [...list, item]);
  }
  function starButton(item) {
    const b = action(isFav(item.path) ? 'starOn' : 'star', '즐겨찾기', () => {
      toggleFav(item);
      const on = isFav(item.path);
      b.innerHTML = ICONS[on ? 'starOn' : 'star'];
      b.classList.toggle('on', on);
    });
    b.classList.add('star');
    b.classList.toggle('on', isFav(item.path));
    return b;
  }
  function closeSheet() {
    if (sheetMode === 'favs') { if (browsing) renderBrowser(); show('folders'); } else show('player');
  }
  function fmtSize(n) {
    if (n >= 1073741824) return (n / 1073741824).toFixed(1) + 'GB';
    if (n >= 1048576) return Math.round(n / 1048576) + 'MB';
    return Math.max(1, Math.round(n / 1024)) + 'KB';
  }

  // ---- 파일 탐색 ----
  function toast(text) {
    clearTimeout(toastTimer);
    $('toast').textContent = text;
    $('toast').hidden = false;
    toastTimer = setTimeout(() => { $('toast').hidden = true; }, 3000);
  }
  function hideBusy() { clearTimeout(busyTimer); $('busy').hidden = true; }
  async function browse(path) {
    try {
      browsing = await B.listDir(path);
    } catch (e) {
      hideBusy();
      alert(e.message || '폴더를 열지 못했습니다.');
      if (!browsing) browsing = await B.listDir('');
      return null;
    }
    hideBusy();
    renderBrowser();
    show('folders');
    return browsing;
  }
  function renderBrowser() {
    const r = browsing, ul = $('browseList');
    $('access').hidden = true;
    $('browseList').hidden = false;
    $('btnUp').hidden = r.parent == null;
    $('browseTitle').textContent = r.name;
    const nav = $('crumbs'); nav.textContent = '';
    r.crumbs.forEach((c, i) => {
      if (i) nav.append(el('i', '', '›'));
      const b = el('button', '', c.name);
      b.onclick = () => browse(c.path);
      nav.append(b);
    });
    nav.scrollLeft = nav.scrollWidth;

    const total = r.tracks.reduce((s, t) => s + t.duration, 0);
    const parts = [];
    if (r.dirs.length) parts.push('폴더 ' + r.dirs.length);
    if (r.zips.length) parts.push('ZIP ' + r.zips.length);
    if (r.tracks.length) parts.push(`음악 ${r.tracks.length}개 · ${fmt(total)}`);
    $('browseInfo').textContent = parts.join('  ·  ');
    $('btnExportFolder').hidden = !marks().length;
    const here = folder && folder.path === r.path;
    $('btnResume').hidden = !r.tracks.length;
    $('btnConnect').hidden = !(storeMode && r.isRoot);
    $('btnResume').textContent = here ? '재생 화면' : '이어듣기';

    ul.textContent = '';
    for (const d of r.dirs) {
      const li = row({ tile: 'folder', name: d.name, sub: d.count ? `음악 ${d.count}개` : '', onTap: () => browse(d.path) });
      if (d.tree) li.append(action('trash', '연결 해제', () => disconnect(d)));
      else li.append(starButton({ path: d.path, name: d.name, where: pathText(r) }));
      ul.append(li);
    }
    for (const z of r.zips) {
      const li = row({ tile: 'zip', name: z.name, sub: `ZIP · ${fmtSize(z.size)}`, onTap: () => browse(z.path) });
      li.append(starButton({ path: z.path, name: z.name, zip: true, where: pathText(r) }));
      ul.append(li);
    }
    for (const g of r.eggs) {
      const li = row({ tile: 'zip', name: g.name, sub: `EGG · ${fmtSize(g.size)} · 열 수 없음`, onTap: () => alert('EGG 형식은 아직 지원하지 않습니다.\n알집이나 반디집에서 ZIP으로 변환해 주세요.') });
      li.classList.add('off');
      ul.append(li);
    }
    for (const u of r.unplayable || []) {
      const kind = u.name.split('.').pop().toUpperCase();
      const li = row({ tile: 'track', name: u.name, sub: `${kind} · ${fmtSize(u.size)} · 재생 불가`, onTap: () => toast(`${kind} 형식은 재생할 수 없습니다.`) });
      li.classList.add('off');
      ul.append(li);
    }
    r.tracks.forEach((t, i) => {
      const li = row({ tile: 'track', thumb: t.uri, name: t.title, sub: fmt(t.duration), onTap: () => playFrom(r, i) });
      li.append(action('info', '자세히 보기', () => openInfo(t)));
      if (here && i === index) li.classList.add('on');
      ul.append(li);
    });
    $('browseEmpty').hidden = ul.childElementCount > 0;
    renderMini();
  }
  function renderMini() {
    const t = track();
    $('mini').hidden = !t;
    if (!t) return;
    const total = folderTotal();
    $('miniTitle').textContent = t.title;
    $('miniFolder').textContent = folder.name;
    $('miniBar').style.width = (total ? folderPos() / total * 100 : 0) + '%';
    $('miniIcon').setAttribute('d', playing ? PAUSE : PLAY);
  }
  async function disconnect(d) {
    if (!confirm(`'${d.name}' 폴더 연결을 해제할까요?\n폰의 파일은 지워지지 않습니다.`)) return;
    const r = await B.removeFolder(d.tree);
    if (r.granted) browse(''); else showAccess();
  }
  function showAccess() {
    browsing = null;
    show('folders');
    for (const id of ['btnUp', 'btnResume', 'btnConnect', 'btnExportFolder', 'browseEmpty']) $(id).hidden = true;
    $('browseList').textContent = ''; $('crumbs').textContent = ''; $('browseInfo').textContent = '';
    $('browseList').hidden = true;
    $('browseTitle').textContent = 'DIV AUDIO APP';
    if (storeMode) {
      $('accessTitle').textContent = '음악 폴더를 연결해 주세요';
      $('accessText').textContent = '음악이 들어 있는 폴더를 고르면 하위 폴더와 ZIP까지 앱에서 볼 수 있습니다.';
      $('btnAccess').textContent = '음악 폴더 연결';
    }
    $('access').hidden = false;
  }
  function playFrom(r, i) {
    if (folder && folder.path === r.path) { B.skipTo(i, 0); B.play(); show('player'); }
    else openFolder(r, i, 0, true);
  }
  async function openFolder(f, startIndex, startPos, autoplay) {
    if (folder && folder.path === f.path && startIndex === undefined) { show('player'); return; }
    saveResume();
    folder = f;
    const r = load('resume', {})[f.path];
    const found = r ? f.tracks.findIndex(t => t.uri === r.uri) : -1;
    index = startIndex ?? Math.max(found, 0);
    position = startPos ?? (found >= 0 ? r.position : 0);
    duration = f.tracks[index].duration;
    save('lastFolder', f.path);
    renderTrack(); renderProgress(); show('player');
    await B.setQueue(f.tracks, index, position, !!autoplay);
  }

  // ---- 파일 / 북마크 리스트 ----
  function folderMarks() {
    return marks().filter(m => m.folder === folder.path).sort((a, b) => {
      const d = folder.tracks.findIndex(t => t.uri === a.uri) - folder.tracks.findIndex(t => t.uri === b.uri);
      return d || a.position - b.position;
    });
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
  const naturally = (x, y) => x.localeCompare(y, 'ko', { numeric: true });
  // 스토어 버전의 경로는 문서 주소라서 읽을 수 있는 경로로 바꿔 비교한다.
  const plainPath = p => (p.startsWith('content:') ? decodeURIComponent(p.split('/document/').pop()) : p);
  const shortPath = p => plainPath(p).replace(/^\/storage\/emulated\/0\/?/, '').replace(/^primary:/, '');
  const SCOPES = [['here', '이 폴더'], ['tree', '하위 폴더 포함'], ['all', '모든 폴더']];
  const zipInfo = new Map();
  let exporting = null;

  // ZIP 북마크는 'zip:id'로 저장되어 있어서 실제 위치를 물어봐야 한다.
  async function locateZips(list) {
    for (const path of new Set(list.map(m => m.folder))) {
      if (!path.startsWith('zip:') || zipInfo.has(path)) continue;
      const r = await B.listDir(path).catch(() => null);
      if (r) zipInfo.set(path, { parent: r.parent == null ? null : plainPath(r.parent), name: r.name });
    }
    hideBusy();
  }
  function realPath(folderPath) {
    // 일반 폴더는 그대로, ZIP은 들어 있는 폴더 아래의 경로로 본다.
    const z = zipInfo.get(folderPath);
    if (!folderPath.startsWith('zip:')) return folderPath;
    return z && z.parent != null ? z.parent + '/' + z.name : null;
  }
  function inScope(m, base, scope) {
    if (scope === 'all') return true;
    if (m.folder === base.path) return true;
    if (scope === 'here' || base.path.startsWith('zip:')) return false;
    const path = realPath(m.folder);
    return !!path && (!base.path || plainPath(path).startsWith(plainPath(base.path) + '/'));
  }
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
  function exportFileName() {
    const d = new Date(), p2 = n => String(n).padStart(2, '0');
    const stamp = `${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}_${p2(d.getHours())}${p2(d.getMinutes())}${p2(d.getSeconds())}`;
    return `북마크_${exportTitle()}_${stamp}.txt`;
  }
  const exportTitle = () => (exporting.scope === 'all' ? '전체' : exporting.base.name);
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
  $('btnExport').onclick = () => openExport({ path: folder.path, name: folder.name }, 'here');
  $('btnExportFolder').onclick = () => openExport({ path: browsing.path, name: browsing.name }, 'tree');
  $('exportClose').onclick = () => { $('exportMenu').hidden = true; };
  $('exportMenu').onclick = e => { if (e.target === $('exportMenu')) $('exportMenu').hidden = true; };
  $('exportSave').onclick = async () => {
    try {
      const r = await B.saveText(exportFileName(), exporting.text);
      $('exportMenu').hidden = true;
      toast('Download 폴더에 저장했습니다.');
      lastExport = r.path;
    } catch (e) { toast('파일을 저장하지 못했습니다.'); }
  };
  $('exportShare').onclick = () => { B.shareText(`${exportTitle()} 북마크`, exporting.text).catch(() => toast('공유하지 못했습니다.')); };
  $('infoClose').onclick = closeInfo;
  $('info').onclick = e => { if (e.target === $('info')) closeInfo(); };
  $('btnInfo').onclick = () => { if (track()) openInfo(track()); };

  function openSheet(mode) { sheetMode = mode; renderSheet(); show('sheet'); }
  function renderSheet() {
    const ul = $('sheetList'); ul.textContent = '';
    $('btnExport').hidden = true;
    if (sheetMode === 'favs') {
      const list = favs();
      $('sheetTitle').textContent = '즐겨찾기';
      $('sheetPath').textContent = '';
      $('sheetEmpty').textContent = '폴더 옆의 별을 누르면 여기에 모입니다.';
      $('sheetEmpty').hidden = list.length > 0;
      for (const f of list) {
        const li = row({ tile: f.zip ? 'zip' : 'folder', name: f.name, sub: f.where, onTap: () => browse(f.path) });
        const star = action('starOn', '즐겨찾기 해제', () => { toggleFav(f); renderSheet(); });
        star.classList.add('star', 'on');
        li.append(star);
        ul.append(li);
      }
      return;
    }
    const files = sheetMode === 'files';
    $('sheetTitle').textContent = files ? '파일 리스트' : '북마크 리스트';
    $('sheetPath').textContent = pathText(folder);
    if (files) {
      folder.tracks.forEach((t, i) => {
        const li = row({ tile: { text: i + 1, cls: 'num' }, thumb: t.uri, name: t.title, sub: fmt(t.duration), onTap: () => { B.skipTo(i, 0); B.play(); show('player'); } });
        li.append(action('info', '자세히 보기', () => openInfo(t)));
        if (i === index) li.classList.add('on');
        ul.append(li);
      });
      $('sheetEmpty').hidden = true;
      return;
    }
    const list = folderMarks();
    $('btnExport').hidden = !list.length;
    $('sheetEmpty').textContent = '저장된 북마크가 없습니다.';
    $('sheetEmpty').hidden = list.length > 0;
    for (const m of list) {
      const li = row({ tile: { text: fmt(m.position), cls: 'time' }, name: m.title, memo: m.memo, onTap: () => jumpTo(m) });
      li.append(
        action('edit', '수정', () => openDialog(m)),
        action('trash', '삭제', () => { save('bookmarks', marks().filter(x => x.id !== m.id)); renderSheet(); }),
      );
      ul.append(li);
    }
  }
  function jumpTo(m) {
    const i = folder.tracks.findIndex(t => t.uri === m.uri);
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
    const ref = editing ? folder.tracks.find(t => t.uri === editing.uri) : track();
    const ms = parseTime($('markTime').value);
    if (ms === null || (ref && ms > ref.duration)) { $('markError').hidden = false; return; }
    const all = marks(), memo = $('markMemo').value.trim();
    if (editing) {
      const m = all.find(x => x.id === editing.id);
      if (m) { m.position = ms; m.memo = memo; }
    } else {
      all.push({ id: Date.now() + '-' + Math.random().toString(36).slice(2, 7), folder: folder.path, uri: ref.uri, title: ref.title, position: ms, memo });
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
  const prefs = { skipBack: 10, skipFwd: 10, eqOn: false, eqPreset: '기본', eqGains: EQ_PRESETS['기본'].slice(), ...load('prefs', {}) };
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
    settingsFrom = $('player').hidden ? 'folders' : 'player';
    renderSkip('skipBack', 'skipBackChips', 'skipBackValue');
    renderSkip('skipFwd', 'skipFwdChips', 'skipFwdValue');
    renderEq();
    show('settings');
  }
  function closeSettings() { document.activeElement && document.activeElement.blur(); show(settingsFrom); }
  $('btnSettings').onclick = openSettings;
  $('btnLicenses').onclick = () => { $('licensesText').textContent = window.LICENSES; $('licenses').hidden = false; };
  $('licensesClose').onclick = () => { $('licenses').hidden = true; };
  $('btnSettings2').onclick = openSettings;
  $('btnSettingsClose').onclick = closeSettings;
  $('eqToggle').onclick = () => { prefs.eqOn = !prefs.eqOn; applyEq(); };
  $('eqReset').onclick = () => { prefs.eqPreset = '기본'; prefs.eqGains = EQ_PRESETS['기본'].slice(); renderEq(); };
  applySkipLabels();
  applyEq();

  // ---- 조작 ----
  $('btnUp').onclick = () => { if (browsing && browsing.parent != null) browse(browsing.parent); };
  $('btnResume').onclick = () => openFolder(browsing, undefined, undefined, true);
  $('mini').onclick = () => show('player');
  $('miniPlay').onclick = e => { e.stopPropagation(); playing ? B.pause() : B.play(); };
  B.onZipBusy(() => { busyTimer = setTimeout(() => { $('busy').hidden = false; }, 250); });
  $('btnSpeed').onclick = () => B.setSpeed(SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length]);
  $('btnBack').onclick = () => { saveResume(); browse(folder.path); };
  $('btnFiles').onclick = () => openSheet('files');
  $('btnMarks').onclick = () => openSheet('marks');
  $('btnSheetClose').onclick = closeSheet;
  $('btnFavs').onclick = () => openSheet('favs');
  $('btnAddMark').onclick = () => openDialog();
  $('btnPlay').onclick = () => (playing ? B.pause() : B.play());
  $('btnPrev').onclick = () => { if (index > 0) B.skipTo(index - 1, 0); else B.seekTo(0); };
  $('btnNext').onclick = () => { if (index < folder.tracks.length - 1) B.skipTo(index + 1, 0); };
  $('btnBack10').onclick = () => B.seekTo(Math.max(0, position - prefs.skipBack * 1000));
  $('btnFwd10').onclick = () => B.seekTo(Math.min(duration, position + prefs.skipFwd * 1000));

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
    const changed = s.index !== index;
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
      if (!$('sheet').hidden && sheetMode === 'files') renderSheet();
      if (!$('folders').hidden && browsing) renderBrowser();
    }
    renderProgress();
    if (Date.now() - lastSave > 5000 || !playing) { lastSave = Date.now(); saveResume(); }
  });

  // 안드로이드 뒤로가기 버튼: 입력창 > 리스트 > 플레이어 > 폴더 순으로 닫고, 마지막엔 앱을 내린다.
  const nativeApp = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App;
  if (nativeApp) nativeApp.addListener('backButton', () => {
    if (!$('licenses').hidden) $('licenses').hidden = true;
    else if (!$('info').hidden) closeInfo();
    else if (!$('exportMenu').hidden) $('exportMenu').hidden = true;
    else if (!$('dialog').hidden) $('dialog').hidden = true;
    else if (!$('settings').hidden) closeSettings();
    else if (!$('sheet').hidden) closeSheet();
    else if (!$('player').hidden) $('btnBack').click();
    else if (browsing && browsing.parent != null) browse(browsing.parent);
    else nativeApp.minimizeApp();
  });

  // ---- 시작 ----
  function migrateZipUris() {
    const fix = u => (u || '').replace(/^file:.*\/zips\/([0-9a-f]+)\/(\d+\.\w+)$/, 'zipentry://$1/$2');
    save('bookmarks', marks().map(m => ({ ...m, uri: fix(m.uri) })));
    const r = load('resume', {});
    for (const k in r) r[k].uri = fix(r[k].uri);
    save('resume', r);
  }
  async function start() {
    $('access').hidden = true;
    migrateZipUris();
    B.requestNotifications().catch(() => {});
    const last = load('lastFolder', null);
    if (last) {
      try {
        const r = await B.listDir(last);
        if (r.tracks.length) { browsing = r; renderBrowser(); await openFolder(r); return; }
      } catch (e) { /* 폴더가 사라졌으면 맨 위에서 시작한다 */ }
    }
    await browse('');
  }
  async function connectFolder() { if (await B.requestAccess()) { $('access').hidden = true; start(); } }
  $('btnAccess').onclick = connectFolder;
  $('btnConnect').onclick = async () => { await B.requestAccess(); browse(''); };
  B.hasAccess().then(({ granted, store }) => {
    storeMode = !!store;
    if (granted) start(); else showAccess();
  });
})();
