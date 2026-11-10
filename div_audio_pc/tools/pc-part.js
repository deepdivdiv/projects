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
  // ZIP 안에 폴더가 있으면 그 폴더별로 묶는다. ZIP 맨 위의 곡은 ZIP 이름으로 묶는다.
  const groupKey = t => (t.subdir ? `${t.dir}/${t.subdir}` : t.dir);
  function groupedOrder(list) {
    const groups = new Map();
    for (const t of list) {
      const key = groupKey(t);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(t);
    }
    return [...groups.values()].flat();
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
  function groupRow(g, name) {
    const total = g.tracks.reduce((s, t) => s + t.duration, 0), zip = g.dir.startsWith('zip:');
    const li = row({ tile: zip && !g.subdir ? 'zip' : 'folder', name, sub: `${g.tracks.length}곡 · ${fmt(total)}` });
    li.classList.add('groupRow');
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
  // 이름이 같은 폴더는 상위 폴더까지 보여 구분한다. ZIP 안의 폴더는 'ZIP 이름 › 폴더'로 보인다.
  function groupNames(groups) {
    const seen = {};
    for (const g of groups) seen[g.place] = (seen[g.place] || 0) + 1;
    return g => {
      if (g.subdir) return `${g.place} › ${g.subdir.split('/').join(' › ')}`;
      return seen[g.place] > 1 && !g.dir.startsWith('zip:') ? shortPath(g.dir).split('/').slice(-2).join('/') : g.place;
    };
  }
  function playlistRow(t, i, inGroup) {
    const about = [t.artist, t.album].filter(Boolean).join(' · ') || (inGroup ? '' : t.place);
    const li = row({ tile: 'track', thumb: t.uri, name: t.tag || t.title, sub: about });
    li.dataset.i = li.dataset.at = i;
    li.classList.toggle('inGroup', inGroup);
    li.querySelector('.main').prepend(el('span', 'idx', i + 1));
    li.append(el('span', 'dur', fmt(t.duration)), action('trash', '목록에서 빼기', () => removeTracks([t])));
    return li;
  }
  function renderPlaylist() {
    const ul = $('playlist'), list = playlist.tracks, q = query.trim().toLowerCase(), rows = document.createDocumentFragment();
    const groups = groupsOf(list), nameOf = groupNames(groups);
    let shown = 0;
    for (const g of groups) {
      const found = g.tracks.map((t, n) => [t, g.start + n]).filter(([t]) => !q || matches(t, q));
      if (!found.length) continue;
      const inGroup = g.tracks.length > 1;
      if (inGroup) rows.append(groupRow(g, nameOf(g)));
      shown += found.length;
      if (inGroup && !q && foldedGroups.has(g.dir)) continue;
      for (const [t, i] of found) rows.append(playlistRow(t, i, inGroup));
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
