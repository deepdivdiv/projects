(function () {
  const $ = id => document.getElementById(id);
  const B = window.Bridge;
  const PLAY = 'M7 4l13 8-13 8z', PAUSE = 'M6 4h4.5v16H6zM13.5 4H18v16h-4.5z';

  let browsing = null, folder = null, index = 0, position = 0, duration = 0, playing = false;
  const SPEEDS = [1, 2, 4, 8, 16];
  let storeMode = false, sheetColl = null, systemFontLoaded = false;
  let speed = 1, busyTimer = 0, toastTimer = 0, infoToken = null, lastExport = null;
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
    if (sheetMode === 'coll') { show('folders'); return; }
    if (sheetMode === 'favs') { if (browsing && libTab === 'folder') renderBrowser(); show('folders'); } else show('player');
  }
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
  function hideBusy() { clearTimeout(busyTimer); $('busy').hidden = true; }
  async function browse(path) {
    if (libTab !== 'folder') setTab('folder', true);
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
    $('folderHead').hidden = false;
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
    renderTabs();
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
  // ---- 라이브러리: 곡, 앨범, 아티스트, 장르 ----
  const L = window.LibUtil;
  const TABS = [['folder', '폴더'], ['songs', '곡'], ['albums', '앨범'], ['artists', '아티스트'], ['genres', '장르']];
  const SORT_NAMES = { name: '이름순', added: '최근 추가순', year: '발매순', count: '곡 많은순' };
  const SORT_ORDER = { songs: ['name', 'added'], albums: ['name', 'added', 'year'], artists: ['name', 'count'], genres: ['name', 'count'] };
  const CHUNK = 120;
  let libTab = load('libTab', 'folder');
  let library = null, libDenied = false, libItems = [], libShown = 0, libRender = null, libQuery = '';

  async function loadLibrary() {
    if (library) return library;
    const r = await B.getLibrary().catch(() => ({ tracks: [] }));
    libDenied = !!r.denied;
    if (!r.denied) library = r.tracks;
    return library;
  }
  function renderTabs() {
    const box = $('tabs'); box.textContent = '';
    for (const [key, name] of TABS) {
      const b = el('button', key === libTab ? 'on' : '', name);
      b.onclick = () => setTab(key);
      box.append(b);
    }
    const on = box.querySelector('.on');
    if (on) box.scrollLeft = on.offsetLeft - 60;
  }
  function libraryVisible(on) {
    for (const id of ['folderHead', 'browseList']) $(id).hidden = on;
    if (on) {
      for (const id of ['browseEmpty', 'btnUp', 'btnResume', 'btnConnect', 'access']) $(id).hidden = true;
      $('browseTitle').textContent = '라이브러리';
    } else {
      for (const id of ['libBar', 'libWrap', 'libEmpty']) $(id).hidden = true;
    }
  }
  function setTab(key, quiet) {
    libTab = key;
    save('libTab', key);
    renderTabs();
    if (quiet) { libraryVisible(key !== 'folder'); return; }
    if (key === 'folder') {
      libraryVisible(false);
      if (browsing) renderBrowser(); else browse('');
      return;
    }
    renderLibrary();
  }
  const sortOf = tab => (load('libSorts', {})[tab]) || 'name';
  function makeCollection(kind, item) {
    return { path: `lib:${kind}:${item.key}`, name: item.name, tracks: item.tracks, virtual: true, tab: kind + 's', crumbs: [{ name: item.name }] };
  }
  const songCollection = list => ({ path: 'lib:songs', name: '곡', tracks: list, virtual: true, tab: 'songs', crumbs: [{ name: '곡' }] });
  async function collectionByPath(path) {
    const tracks = await loadLibrary();
    if (!tracks) return null;
    if (path === 'lib:songs') return songCollection(L.songs(tracks, sortOf('songs')));
    const m = path.match(/^lib:(album|artist|genre):(.*)$/);
    if (!m) return null;
    const list = m[1] === 'album' ? L.albums(tracks) : L.collection(tracks, m[1]);
    const item = list.find(x => x.key === m[2]);
    return item ? makeCollection(m[1], item) : null;
  }
  function songRow(t, i, coll) {
    const li = row({ tile: 'track', thumb: t.uri, name: L.shownName(t), sub: `${L.label(t.artist)} · ${L.label(t.album)}`, onTap: () => playFrom(coll, i) });
    li.append(action('info', '자세히 보기', () => openInfo(t)));
    if (track() && track().uri === t.uri) li.classList.add('on');
    return li;
  }
  function albumCard(a) {
    const li = el('li'), b = el('button', 'albumCard');
    const tile = el('span', 'tile track');
    tile.innerHTML = ICONS.track;
    watchThumb(tile, a.tracks[0].uri, 360);
    b.append(tile, el('div', 'name ellipsis', a.name), el('div', 'sub ellipsis', `${a.artist} · 곡 ${a.tracks.length}개`));
    b.onclick = () => openCollection(makeCollection('album', a));
    li.append(b);
    return li;
  }
  function groupRow(kind, g) {
    return row({ tile: 'track', thumb: g.tracks[0].uri, name: g.name, sub: `앨범 ${g.albumCount}개 · 곡 ${g.tracks.length}개`, onTap: () => openCollection(makeCollection(kind, g)) });
  }
  function showLibMessage(text, withButton) {
    $('libWrap').hidden = $('libBar').hidden = true;
    $('libEmpty').hidden = false;
    $('libEmptyText').textContent = text;
    $('btnLibAccess').hidden = !withButton;
  }
  // 곡이 많아도 빠르도록 나눠서 그리고, 스크롤이 내려가면 이어서 그린다.
  function fillList(upTo) {
    const ul = $('libList');
    const end = Math.min(upTo, libItems.length);
    for (; libShown < end; libShown++) ul.append(libRender(libItems[libShown], libShown));
  }
  async function renderLibrary() {
    libraryVisible(true);
    show('folders');
    const tracks = await loadLibrary();
    if (!tracks) { showLibMessage('앨범과 아티스트를 보려면 음악 접근을 허용해 주세요.', true); return; }
    if (!tracks.length) { showLibMessage('폰에서 음악을 찾지 못했습니다.'); return; }
    $('libEmpty').hidden = true;
    $('libWrap').hidden = $('libBar').hidden = false;
    const ul = $('libList'), tab = libTab, sort = sortOf(tab);
    ul.textContent = ''; ul.scrollTop = 0; libShown = 0;
    ul.className = 'list' + (tab === 'albums' ? ' grid' : '');
    let unit = '곡';
    if (tab === 'songs') {
      libItems = L.songs(tracks, sort);
      const coll = songCollection(libItems);
      libRender = (t, i) => songRow(t, i, coll);
    } else if (tab === 'albums') {
      libItems = L.albums(tracks, sort); unit = '앨범'; libRender = albumCard;
    } else {
      const kind = tab === 'artists' ? 'artist' : 'genre';
      libItems = L.collection(tracks, kind, sort);
      unit = tab === 'artists' ? '아티스트' : '장르';
      libRender = g => groupRow(kind, g);
    }
    $('libCount').textContent = `${unit} ${libItems.length}개`;
    $('libSort').hidden = false;
    $('libSort').textContent = SORT_NAMES[sort];
    fillList(CHUNK);
    renderRail(sort === 'name');
  }
  const itemName = it => (it.name !== undefined ? it.name : L.shownName(it));
  function renderRail(on) {
    const rail = $('rail'); rail.textContent = '';
    const letters = [...new Set(libItems.map(it => L.initialOf(itemName(it))))];
    rail.hidden = !on || letters.length < 2;
    $('libList').classList.toggle('noRail', rail.hidden);
    for (const c of letters) rail.append(el('span', '', c));
    rail.dataset.letters = letters.join('');
  }
  function jumpToLetter(letter) {
    const i = libItems.findIndex(it => L.initialOf(itemName(it)) === letter);
    if (i < 0) return;
    fillList(Math.max(libShown, i + CHUNK));
    const target = $('libList').children[i];
    if (target) $('libList').scrollTop = target.offsetTop - $('libList').offsetTop;
  }
  function railAt(e) {
    const rail = $('rail'), r = rail.getBoundingClientRect();
    const letters = [...rail.dataset.letters];
    const i = Math.min(letters.length - 1, Math.max(0, Math.floor((e.clientY - r.top) / r.height * letters.length)));
    $('railHint').textContent = letters[i];
    $('railHint').hidden = false;
    jumpToLetter(letters[i]);
  }
  $('rail').onpointerdown = e => { $('rail').setPointerCapture(e.pointerId); railAt(e); };
  $('rail').onpointermove = e => { if ($('rail').hasPointerCapture(e.pointerId)) railAt(e); };
  $('rail').onpointerup = $('rail').onpointercancel = () => { $('railHint').hidden = true; };
  $('libList').addEventListener('scroll', () => {
    const ul = $('libList');
    if (ul.scrollTop + ul.clientHeight > ul.scrollHeight - 800) fillList(libShown + CHUNK);
  });
  $('libSort').onclick = () => {
    const order = SORT_ORDER[libTab], s = load('libSorts', {});
    s[libTab] = order[(order.indexOf(sortOf(libTab)) + 1) % order.length];
    save('libSorts', s);
    renderLibrary();
  };
  $('btnLibAccess').onclick = async () => {
    if (await B.requestAudio()) { library = null; renderLibrary(); }
    else toast('설정에서 음악 접근을 허용해 주세요.');
  };
  function openCollection(coll) {
    sheetColl = coll; sheetMode = 'coll';
    renderSheet();
    show('sheet');
  }

  // ---- 검색 ----
  function renderSearch() {
    const q = libQuery.trim();
    if (!q) { setTab(libTab); return; }
    libraryVisible(true);
    $('libEmpty').hidden = true;
    $('libWrap').hidden = false; $('libBar').hidden = false;
    $('rail').hidden = true;
    $('libSort').hidden = true;
    const ul = $('libList');
    ul.className = 'list noRail'; ul.textContent = ''; ul.scrollTop = 0;
    const found = L.search(library || [], q);
    const coll = { ...songCollection(found.songs), path: 'lib:search', name: '검색 결과', crumbs: [{ name: '검색 결과' }] };
    const section = (title, count) => { ul.append(el('li', 'secTitle', `${title} ${count}`)); };
    if (found.albums.length) {
      section('앨범', found.albums.length);
      for (const a of found.albums.slice(0, 20)) {
        ul.append(row({ tile: 'track', thumb: a.tracks[0].uri, name: a.name, sub: `${a.artist} · 곡 ${a.tracks.length}개`, onTap: () => openCollection(makeCollection('album', a)) }));
      }
    }
    if (found.artists.length) {
      section('아티스트', found.artists.length);
      for (const g of found.artists.slice(0, 20)) ul.append(groupRow('artist', g));
    }
    if (found.songs.length) {
      section('곡', found.songs.length);
      found.songs.slice(0, 200).forEach((t, i) => ul.append(songRow(t, i, coll)));
    }
    const total = found.albums.length + found.artists.length + found.songs.length;
    $('libCount').textContent = total ? `'${q}' 검색 결과` : `'${q}' 결과가 없습니다.`;
  }
  $('btnSearch').onclick = async () => {
    $('searchBar').hidden = false;
    $('tabs').hidden = true;
    $('searchInput').value = ''; libQuery = '';
    $('searchInput').focus();
    await loadLibrary();
    if (!library) { closeSearch(); setTab('songs'); }
  };
  function closeSearch() {
    $('searchBar').hidden = true;
    $('tabs').hidden = false;
    libQuery = '';
    setTab(libTab);
  }
  $('searchClose').onclick = closeSearch;
  $('searchInput').oninput = () => { libQuery = $('searchInput').value; renderSearch(); };

  // 재생 목록이 폴더가 아니면 라이브러리로 돌아간다.
  async function toList() {
    if (!folder.virtual) return browse(folder.path);
    if (libTab === 'folder') setTab(folder.tab); else { show('folders'); renderLibrary(); }
  }

  async function openFolder(f, startIndex, startPos, autoplay) {
    if (folder && folder.path === f.path && startIndex === undefined) { show('player'); return; }
    const uris = f.tracks.map(t => t.uri);
    const saved = await B.getResume(f.path, uris).catch(() => ({ positions: {} }));
    const old = load('resume', {})[f.path]; // 이전 버전이 저장한 위치
    const uri = saved.uri || (old && old.uri);
    const found = uri ? uris.indexOf(uri) : -1;
    folder = f;
    index = startIndex ?? Math.max(found, 0);
    position = startPos ?? (found < 0 ? 0 : saved.positions[uri] || (saved.uri ? 0 : old.position) || 0);
    duration = f.tracks[index].duration;
    save('lastFolder', f.path);
    renderTrack(); renderProgress(); show('player');
    await B.setQueue(f.tracks, index, position, !!autoplay, f.path);
  }

  // ---- 파일 / 북마크 리스트 ----
  // 다른 기기나 스토어 버전에서 가져온 북마크는 주소가 달라서 경로와 곡 이름으로도 찾는다.
  const sameTrack = (t, m) => t.uri === m.uri || (t.title === m.title && !!t.dir && shortPath(t.dir) === shortPath(m.folder));
  function folderKeys(f) {
    const keys = [f.path, shortPath(f.path)];
    if (f.zip && f.parent != null) keys.push(shortPath(f.parent + '/' + f.name));
    return keys;
  }
  function belongsTo(m, f) {
    if (f.virtual) return f.tracks.some(t => sameTrack(t, m));
    const keys = folderKeys(f);
    return keys.includes(m.folder) || keys.includes(shortPath(m.folder)) || (!!m.label && keys.includes(m.label));
  }
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
    if (base.virtual) return belongsTo(m, base);
    if (m.folder === base.path) return true;
    if (scope === 'here' || base.path.startsWith('zip:')) return false;
    const path = realPath(m.folder);
    return !!path && (!base.path || shortPath(path) === shortPath(base.path) || shortPath(path).startsWith(shortPath(base.path) + '/'));
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
  $('btnExport').onclick = () => openExport({ path: folder.path, name: folder.name, virtual: folder.virtual, tracks: folder.tracks }, 'here');
  $('btnExportFolder').onclick = () => openExport({ path: browsing.path, name: browsing.name }, 'tree');
  $('exportSave').onclick = async () => {
    try {
      const r = await B.saveText(exportFileName(), exporting.text);
      $('exportMenu').hidden = true;
      toast('Download 폴더에 저장했습니다.');
      lastExport = r.path;
    } catch (e) { toast('파일을 저장하지 못했습니다.'); }
  };
  $('exportShare').onclick = () => { B.shareText(`${exportTitle()} 북마크`, exporting.text).catch(() => toast('공유하지 못했습니다.')); };
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
      await B.saveImage(excerptName(), excerptData());
      $('excerptMenu').hidden = true;
      toast('갤러리의 DAA 앨범에 저장했습니다.');
    } catch (e) { toast(e.message || '이미지를 저장하지 못했습니다.'); }
  };
  $('excerptShare').onclick = () => { B.shareFile(excerptName(), 'image/jpeg', { data: excerptData() }).catch(() => toast('공유하지 못했습니다.')); };

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
      await B.saveText(backupName(), await backupText());
      toast('Download 폴더에 저장했습니다.');
    } catch (e) { toast('파일을 저장하지 못했습니다.'); }
  };
  $('btnBackupShare').onclick = async () => {
    if (!marks().length) { toast('저장된 북마크가 없습니다.'); return; }
    B.shareFile(backupName(), 'application/json', { text: await backupText() }).catch(() => toast('공유하지 못했습니다.'));
  };
  const clean = v => (typeof v === 'string' ? v : '');
  function fromBackup(data) {
    if (!data || data.type !== 'bookmarks' || !Array.isArray(data.bookmarks)) throw new Error('format');
    return data.bookmarks
      .filter(m => m && clean(m.title) && Number.isFinite(m.position) && m.position >= 0)
      .map(m => ({ folder: clean(m.folder) || clean(m.label), label: clean(m.label), uri: clean(m.uri), title: m.title, position: m.position, memo: clean(m.memo) }));
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
  async function importMarks() {
    let picked;
    try { picked = await B.pickText(); } catch (e) { toast(e.message || '파일을 읽지 못했습니다.'); return; }
    if (picked.cancelled) return;
    const text = picked.text || '';
    try {
      const list = text.trim().startsWith('{') ? fromBackup(JSON.parse(text)) : fromText(text, folder && folder.path);
      if (!list.length) throw new Error('format');
      await locateZips(marks());
      const added = mergeMarks(list), skipped = list.length - added;
      toast(`북마크 ${added}개를 가져왔습니다.` + (skipped ? ` (중복 ${skipped}개 제외)` : ''));
      if (!$('sheet').hidden) renderSheet();
      if (browsing && !$('folders').hidden) renderBrowser();
    } catch (e) {
      toast(e.message === 'folder' ? '폴더 표시가 없는 파일입니다. 해당 폴더의 곡을 연 뒤 들여와 주세요.' : '북마크 파일이 아닙니다.');
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
    $('btnExport').hidden = $('btnImportSheet').hidden = $('btnPlayAll').hidden = true;
    if (sheetMode === 'coll') {
      const c = sheetColl, total = c.tracks.reduce((s, t) => s + t.duration, 0);
      $('sheetTitle').textContent = c.name;
      $('sheetPath').textContent = `곡 ${c.tracks.length}개 · ${fmt(total)}`;
      $('sheetEmpty').hidden = true;
      $('btnPlayAll').hidden = false;
      c.tracks.forEach((t, i) => {
        const li = row({ tile: 'track', thumb: t.uri, name: L.shownName(t), sub: `${L.label(t.artist)} · ${fmt(t.duration)}`, onTap: () => playFrom(c, i) });
        li.append(action('info', '자세히 보기', () => openInfo(t)));
        if (track() && track().uri === t.uri) li.classList.add('on');
        ul.append(li);
      });
      return;
    }
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
        const li = row({ tile: { text: i + 1, cls: 'num' }, thumb: t.uri, name: t.title, sub: fmt(t.duration), onTap: () => playFrom(folder, i) });
        li.append(action('info', '자세히 보기', () => openInfo(t)));
        if (i === index) li.classList.add('on');
        ul.append(li);
      });
      $('sheetEmpty').hidden = true;
      return;
    }
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
      all.push({ id: Date.now() + '-' + Math.random().toString(36).slice(2, 7), folder: ref.dir || folder.path, uri: ref.uri, title: ref.title, position: ms, memo });
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
    settingsFrom = $('player').hidden ? 'folders' : 'player';
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

  // ---- 조작 ----
  $('btnUp').onclick = () => { if (browsing && browsing.parent != null) browse(browsing.parent); };
  $('btnResume').onclick = () => openFolder(browsing, undefined, undefined, true);
  $('mini').onclick = () => show('player');
  $('miniPlay').onclick = e => { e.stopPropagation(); playing ? B.pause() : B.play(); };
  B.onZipBusy(() => { busyTimer = setTimeout(() => { $('busy').hidden = false; }, 250); });
  $('btnSpeed').onclick = () => B.setSpeed(SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length]);
  $('btnBack').onclick = () => toList();
  $('btnPlayAll').onclick = () => openFolder(sheetColl, undefined, undefined, true);
  $('btnFiles').onclick = () => openSheet('files');
  $('btnMarks').onclick = () => openSheet('marks');
  $('btnSheetClose').onclick = closeSheet;
  $('btnFavs').onclick = () => openSheet('favs');
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
      const reset = () => { $('player').style.transform = ''; };
      if (!cancelled && (dy > 120 || vy > 0.7)) { animateTo($('player'), `translateY(${window.innerHeight}px)`, () => { toList().finally(reset); }); return; }
      if (!cancelled && (dy < -90 || vy < -0.7)) { reset(); openSheet('files'); return; }
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
  swipeBack('folders', () => libTab === 'folder' && !!browsing && browsing.parent != null, () => browse(browsing.parent));
  // 라이브러리에서는 좌우로 밀어 탭을 바꾼다.
  window.Gesture.drag($('libWrap'), {
    canStart: e => prefs.gestures && !libQuery && !e.target.closest('.rail'),
    onEnd({ dir, dx, cancelled }) {
      if (cancelled || dir !== 'x' || Math.abs(dx) < 70) return;
      const keys = TABS.map(t => t[0]), i = keys.indexOf(libTab) + (dx < 0 ? 1 : -1);
      if (i >= 0 && i < keys.length) setTab(keys[i]);
    },
  });
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
      if (dir === 'y' && dy < -30) show('player');
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
      if (!$('sheet').hidden && sheetMode === 'files') renderSheet();
      if (!$('folders').hidden && browsing) renderBrowser();
    }
    renderProgress();
  });

  // 안드로이드 뒤로가기 버튼: 입력창 > 리스트 > 플레이어 > 폴더 순으로 닫고, 마지막엔 앱을 내린다.
  const nativeApp = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App;
  if (nativeApp) nativeApp.addListener('backButton', () => {
    const open = ['excerptMenu', 'markMenu', 'sleepMenu', 'licenses', 'info', 'exportMenu'].find(id => !$(id).hidden);
    if (open) closeBottom(open);
    else if (!$('dialog').hidden) $('dialog').hidden = true;
    else if (!$('settings').hidden) closeSettings();
    else if (!$('sheet').hidden) closeSheet();
    else if (!$('player').hidden) $('btnBack').click();
    else if (!$('searchBar').hidden) closeSearch();
    else if (libTab === 'folder' && browsing && browsing.parent != null) browse(browsing.parent);
    else nativeApp.minimizeApp();
  });

  // ---- 시스템 글꼴 ----
  // 삼성 글꼴 설정은 WebView에 적용되지 않아서, 폰이 쓰는 글꼴 파일을 직접 불러온다.
  async function applySystemFont() {
    let name = '';
    try {
      const r = await B.getSystemFonts();
      const faces = r.fonts.map(f => new FontFace('DAA System', `url("${f.url}")`, { weight: f.weight, unicodeRange: f.range || 'U+0-10FFFF' }));
      for (const face of await Promise.all(faces.map(f => f.load()))) document.fonts.add(face);
      if (faces.length) { name = r.name || ''; systemFontLoaded = true; }
    } catch (e) { name = ''; }
    $('appFont').textContent = `적용된 글꼴: ${name || '기기 기본 글꼴'}`;
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
    $('access').hidden = true;
    migrateZipUris();
    B.requestNotifications().catch(() => {});
    const native = await B.getResume('', []).catch(() => ({}));
    const last = native.lastFolder || load('lastFolder', null);
    if (last) {
      try {
        if (last.startsWith('lib:')) {
          const coll = await collectionByPath(last);
          if (coll) { renderTabs(); await openFolder(coll); return; }
        } else {
          const r = await B.listDir(last);
          if (r.tracks.length) { browsing = r; if (libTab === 'folder') renderBrowser(); await openFolder(r); return; }
        }
      } catch (e) { /* 폴더가 사라졌으면 맨 위에서 시작한다 */ }
    }
    if (libTab === 'folder') await browse(''); else setTab(libTab);
  }
  async function connectFolder() { if (await B.requestAccess()) { $('access').hidden = true; start(); } }
  $('btnAccess').onclick = connectFolder;
  $('btnConnect').onclick = async () => { await B.requestAccess(); browse(''); };
  B.hasAccess().then(({ granted, store, version }) => {
    storeMode = !!store;
    $('appVersion').textContent = `DIV AUDIO APP 버전 ${version || ''}`;
    renderTabs();
    if (granted) start(); else if (libTab !== 'folder') setTab(libTab); else showAccess();
  });
})();
