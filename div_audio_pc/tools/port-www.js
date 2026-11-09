// 폰 앱의 화면(music_apk/www)을 가져와 PC에 맞게 고친다. 처음 한 번, 폰 화면이 바뀌었을 때 다시 돌린다.
// 폰은 폴더를 탐색하고 PC는 재생목록에 파일을 넣는다. 그래서 탐색과 라이브러리 부분은 잘라 내고 tools/pc-part.js를 넣는다.
// bridge.js는 PC 재생 엔진이라 덮어쓰지 않는다. 바뀐 내용 때문에 고칠 자리를 못 찾으면 멈춘다.
const fs = require('fs');
const path = require('path');

const FROM = path.resolve(__dirname, '../../music_apk/www');
const TO = path.resolve(__dirname, '../www');
const read = f => fs.readFileSync(path.join(FROM, f), 'utf8');

function patcher(text) {
  const need = (found, what) => { if (found < 0) throw new Error('고칠 자리를 찾지 못했습니다: ' + what); return found; };
  return {
    put(a, b) {
      need(text.indexOf(a), a);
      text = text.replace(a, () => b);
      return this;
    },
    // from부터 until 바로 앞까지를 지우고 그 자리에 b를 넣는다.
    cut(from, until, b = '') {
      const start = need(text.indexOf(from), from), end = need(text.indexOf(until, start), until);
      text = text.slice(0, start) + b + text.slice(end);
      return this;
    },
    text: () => text,
  };
}

const NOTE = w => `<path d="M9 18V5.5l11-2V16" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/><circle cx="6.5" cy="18" r="2.5" fill="currentColor"/><circle cx="17.5" cy="16" r="2.5" fill="currentColor"/>`;
const DISC = w => `<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="${w}"/><circle cx="12" cy="12" r="2.5" fill="currentColor"/><path d="M12 6.4a5.6 5.6 0 0 1 5.6 5.6M12 17.6A5.6 5.6 0 0 1 6.4 12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>`;

const ICON_PIN = '<svg viewBox="0 0 24 24"><path d="M9 3.5h6M10 3.5v6L6.5 13.5h11L14 9.5v-6M12 13.5v7" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const ICON_MINI = '<svg viewBox="0 0 24 24"><rect x="3.5" y="5" width="17" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="1.6"/><rect x="11.5" y="11.5" width="6.5" height="5" rx="1" fill="currentColor"/></svg>';
const ICON_CLOSE = '<svg viewBox="0 0 24 24"><path d="M7 7l10 10M17 7 7 17" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';

// ---- 화면 구조 ----
const source = read('index.html');
const settingsIcon = /<button id="btnSettings2"[\s\S]*?<\/button>/.exec(source)[0];
const searchIcon = /<button id="btnSearch"[\s\S]*?<\/button>/.exec(source)[0];
const html = patcher(source)
  .put('<title>DIV AUDIO APP</title>', `<title>DIV AUDIO APP</title>
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; img-src 'self' data: blob:; media-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'">`)
  .put('<link rel="stylesheet" href="theme.css">', '<link rel="stylesheet" href="theme.css">\n<link rel="stylesheet" href="pc.css">')
  // 제목 표시줄 없이 창 단추를 화면 안에 둔다. 미니 플레이어와 플로팅(항상 위) 화면도 넣는다.
  .put('<div id="bg"><img id="bgArt" alt=""></div>', `<div id="bg"><img id="bgArt" alt=""></div>

<!-- 창 단추 -->
<div id="winbar" class="winbar">
  <span class="spacer"></span>
  <button id="winMini" class="wbtn" aria-label="미니 플레이어">${ICON_MINI}</button>
  <button id="winFloat" class="wbtn" aria-label="플로팅 (항상 위)">${ICON_PIN}</button>
  <button id="winMin" class="wbtn" aria-label="최소화"><svg viewBox="0 0 24 24"><path d="M6 12h12" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg></button>
  <button id="winMax" class="wbtn" aria-label="최대화"><svg viewBox="0 0 24 24"><rect class="maxIcon" x="6.5" y="6.5" width="11" height="11" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.6"/><g class="restoreIcon" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="5" y="8" width="11" height="11" rx="1.5"/><path d="M8 8V6.5A1.5 1.5 0 0 1 9.5 5h8A1.5 1.5 0 0 1 19 6.5v8a1.5 1.5 0 0 1-1.5 1.5H16"/></g></svg></button>
  <button id="winClose" class="wbtn close" aria-label="닫기">${ICON_CLOSE}</button>
</div>

<!-- 미니 플레이어 / 플로팅 -->
<div id="compact" class="compact">
  <div class="cpMain">
    <div class="cpArt"><svg viewBox="0 0 24 24" aria-hidden="true">${DISC('1.4')}</svg><img id="cpArt" alt="" hidden></div>
    <div class="cpBody">
      <div class="cpTop">
        <div class="cpText">
          <div id="cpTitle" class="name ellipsis"></div>
          <div id="cpSub" class="sub ellipsis"></div>
        </div>
        <label class="cpOpacity"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor"/></svg><input id="cpOpacity" class="seek thin" type="range" min="5" max="100" value="100" aria-label="투명도"><span id="cpOpacityValue">100%</span></label>
        <button id="cpPin" class="wbtn" aria-label="항상 위에 고정">${ICON_PIN}</button>
        <button id="cpExpand" class="wbtn" aria-label="원래 크기로"><svg viewBox="0 0 24 24"><path d="M14 4.5h5.5V10M10 19.5H4.5V14M19.5 4.5 13.5 10.5M4.5 19.5l6-6" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
        <button id="cpClose" class="wbtn close" aria-label="닫기">${ICON_CLOSE}</button>
      </div>
      <div class="cpCtl">
        <span id="cpTime" class="cpTime">00:00 / 00:00</span>
        <span class="spacer"></span>
        <button id="cpPrev" class="cpBtn" aria-label="이전 트랙"><svg viewBox="0 0 24 24"><path d="M5 4h2.6v16H5zM20 4v16L8.6 12z" fill="currentColor"/></svg></button>
        <button id="cpBack" class="cpBtn" aria-label="뒤로 건너뛰기"><svg viewBox="0 0 24 24"><path d="M12 5V1.5L7 6l5 4.5V7a6.5 6.5 0 1 1-6.5 6.5H3.5A8.5 8.5 0 1 0 12 5z" fill="currentColor"/></svg></button>
        <button id="cpPlay" class="cpBtn main" aria-label="재생/정지"><svg viewBox="0 0 24 24"><path id="cpIcon" d="M7 4l13 8-13 8z" fill="currentColor"/></svg></button>
        <button id="cpFwd" class="cpBtn" aria-label="앞으로 건너뛰기"><svg viewBox="0 0 24 24"><path d="M12 5V1.5L17 6l-5 4.5V7a6.5 6.5 0 1 0 6.5 6.5h2A8.5 8.5 0 1 1 12 5z" fill="currentColor"/></svg></button>
        <button id="cpNext" class="cpBtn" aria-label="다음 트랙"><svg viewBox="0 0 24 24"><path d="M16.4 4H19v16h-2.6zM4 4v16l11.4-8z" fill="currentColor"/></svg></button>
      </div>
    </div>
  </div>
  <input id="cpSeek" class="seek thin" type="range" min="0" max="1000" value="0" aria-label="현재 파일 위치">
</div>`)
  .cut('<!-- 파일 탐색 화면 -->', '<div id="mini"', `<!-- 재생목록 -->
<section id="folders" class="screen">
  <header class="bar icons">
    <h1 id="browseTitle" class="ellipsis">재생목록</h1>
    <span class="spacer"></span>
    ${searchIcon}
    ${settingsIcon}
  </header>
  <div id="searchBar" class="searchBar" hidden>
    <input id="searchInput" type="search" placeholder="곡, 앨범, 아티스트, 파일 이름" autocomplete="off" enterkeyhint="search">
    <button id="searchClose" class="textBtn">취소</button>
  </div>
  <div id="listTools" class="listTools" hidden>
    <span id="listInfo" class="sub"></span>
    <span class="spacer"></span>
    <button id="btnAddFiles" class="pill">파일 추가</button>
    <button id="btnAddFolder" class="pill">폴더 추가</button>
    <button id="btnSortList" class="pill">이름순 정렬</button>
    <button id="btnClearList" class="pill">비우기</button>
  </div>
  <div id="addStatus" class="addStatus" hidden></div>
  <ul id="playlist" class="list" hidden></ul>
  <div id="listEmpty" class="listEmpty">
    <svg viewBox="0 0 24 24" aria-hidden="true">${DISC('1.2')}</svg>
    <h2>음악 파일이나 폴더를 끌어다 놓으세요</h2>
    <p>폴더는 안에 든 곡을 모두 넣고, ZIP은 풀지 않고 그대로 재생합니다.</p>
    <div class="listEmptyActions">
      <button id="btnAddFiles2" class="cta">파일 추가</button>
      <button id="btnAddFolder2" class="cta ghost">폴더 추가</button>
    </div>
  </div>
  `)
  .put('</section>\n\n<!-- 플레이어 화면 -->', `</section>

<div id="dropLine" class="dropLine" hidden></div>
<div id="marquee" class="marquee" hidden></div>
<div class="dropFrame" aria-hidden="true"><span>놓으면 재생목록에 넣습니다</span></div>
<div id="rowMenu" class="rowMenu" role="menu" hidden>
  <button id="rowPlay">재생</button>
  <button id="rowInfo">자세히 보기</button>
  <button id="rowReveal">파일 위치 열기</button>
  <button id="rowRemove" class="danger">목록에서 빼기</button>
</div>

<!-- 플레이어 화면 -->`)
  .put(`<span id="sleepLabel">취침</span></button>
  </div>`, `<span id="sleepLabel">취침</span></button>
    <label class="vol" title="음량 (위/아래 화살표)"><svg viewBox="0 0 24 24"><path d="M4 9.5v5h3.5L12 19V5L7.5 9.5z" fill="currentColor"/><path d="M15.5 8.5a5 5 0 0 1 0 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg><input id="volume" class="seek thin" type="range" min="0" max="100" value="100" aria-label="음량"></label>
  </div>`)
  .put(NOTE('1.7'), DISC('1.4'))
  .cut('<span class="spacer"></span>\n    <button id="btnFiles"', '<button id="btnMarks"', `<button id="btnFold" class="icon" aria-label="플레이어 접기 (P)"><svg viewBox="0 0 24 24"><path d="m6 5 7 7-7 7M13 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
    <span class="spacer"></span>
    `)
  .put('<button id="miniPlay"', `<button id="miniExpand" class="icon" aria-label="플레이어 펼치기 (P)"><svg viewBox="0 0 24 24"><path d="m18 5-7 7 7 7M11 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
    <button id="miniPlay"`)
  .put('aria-label="폴더 전체 위치"', 'aria-label="재생목록 전체 위치"')
  .put('    <button id="btnPlayAll" class="pill" hidden>이어듣기</button>\n', '')
  .put('전체 백업 파일 저장 (Download)', '전체 백업 파일 저장')
  .put('      <button id="btnBackupShare" class="linkRow">전체 백업 파일 공유</button>\n', '')
  .put('<h2 class="sec">터치 동작</h2>', '<h2 class="sec">마우스 동작</h2>')
  .put('aria-label="터치 동작 사용"', 'aria-label="마우스 동작 사용"')
  .put(/<p class="setNote first">썸네일 한 번 터치[\s\S]*?<\/p>/.exec(source)[0], `<p class="setNote first">목록 클릭: 선택 (Ctrl, Shift로 여러 곡)<br>목록 더블클릭: 재생<br>고른 줄이나 폴더 제목 줄 끌기: 순서 변경<br>고르지 않은 줄이나 빈 곳 끌기: 범위 선택 (Ctrl: 더하기)<br>목록 오른쪽 클릭: 메뉴<br>썸네일 클릭: 재생/정지<br>썸네일 왼쪽/오른쪽 더블클릭: 뒤로/앞으로 건너뛰기<br>재생 화면 좌우로 끌기: 이전/다음 곡<br>북마크 왼쪽으로 끌기: 삭제<br>배속 버튼 좌우로 끌기: 속도 변경</p>
    </div>

    <h2 class="sec">키보드</h2>
    <div class="panel">
      <p class="setNote first">Space: 재생/정지<br>Enter: 고른 곡 재생<br>Delete: 고른 곡을 목록에서 빼기<br>Ctrl + A: 전체 선택<br>Ctrl + O: 파일 추가<br>← →: 뒤로/앞으로 건너뛰기<br>Ctrl + ← →: 이전/다음 곡<br>↑ ↓: 음량<br>B: 북마크 추가<br>S: 재생 속도 변경<br>P: 플레이어 접기/펼치기<br>Ctrl + F: 목록 검색<br>Esc: 뒤로 가기<br>키보드의 미디어 키도 사용할 수 있습니다.</p>`)
  .put('<button id="exportShare" class="cta ghost">공유하기</button>', '<button id="exportShare" class="cta ghost">복사하기</button>')
  .put('<button id="excerptShare" class="cta ghost">공유하기</button>', '<button id="excerptShare" class="cta ghost">이미지 복사</button>')
  .put('<div id="busy" class="dim" hidden><p>불러오는 중…</p></div>\n', '')
  .put('<script src="libutil.js"></script>\n', '')
  .text();

// ---- 동작 ----
const app = patcher(read('app.js'))
  .put('let browsing = null, folder = null,', 'let folder = null,')
  .put('let storeMode = false, sheetColl = null, systemFontLoaded = false;', 'let systemFontLoaded = false;')
  .put('let speed = 1, busyTimer = 0, toastTimer = 0,', 'let speed = 1, toastTimer = 0,')
  // 넓은 창에서는 왼쪽에 목록, 오른쪽에 플레이어를 함께 둔다.
  .put(`function show(id) { for (const s of ['folders', 'player', 'sheet', 'settings']) $(s).hidden = s !== id; }`,
    `const wideMq = matchMedia('(min-width: 860px)');
  const isWide = () => wideMq.matches;
  let leftScreen = 'folders';
  function show(id) {
    if (id !== 'player') leftScreen = id;
    const shown = isWide() && id === 'player' ? leftScreen : id;
    for (const s of ['folders', 'player', 'sheet', 'settings']) $(s).hidden = s !== shown;
  }
  wideMq.addEventListener('change', () => show(leftScreen));`)
  .put(`  const pathText = f => (f.crumbs || []).map(c => c.name).join(' › ');\n`, '')
  .put(`settingsFrom = $('player').hidden ? 'folders' : 'player';`, `if (!$('settings').hidden) return; // 넓은 창에서는 설정이 열린 채로 톱니바퀴를 또 누를 수 있다.
    settingsFrom = isWide() ? leftScreen : $('player').hidden ? 'folders' : 'player';`)
  // 재생 표시. 앨범 태그가 없으면 곡이 들어 있는 폴더 이름을 보여 준다.
  .put(`$('trackAlbum').textContent = folder.name;`, `$('trackAlbum').textContent = t.place;`)
  .put(`    B.getArt(t.uri).catch(() => null).then(url => { if (token === artToken) setArt(url); });
    tagsOf(t.uri).then(info => {
      const album = info && info.tags.find(x => x.label === '앨범');
      if (token === artToken && album) $('trackAlbum').textContent = album.value;
    });`, `    const art = B.getArt(t.uri).catch(() => null);
    art.then(url => { if (token === artToken) setArt(url); });
    tagsOf(t.uri).then(async info => {
      const album = info && info.tags.find(x => x.label === '앨범');
      if (token === artToken && album) $('trackAlbum').textContent = album.value;
      if (token === artToken) B.setMeta(t.title, album ? album.value : t.place, await art);
    });`)
  .put(`$('miniFolder').textContent = folder.name;`, `$('miniFolder').textContent = t.place;`)
  .put(`  function renderMini() {\n`, `  function renderMini() {\n    renderCompact();\n`)
  // 폴더 탐색과 라이브러리는 PC에서 쓰지 않는다.
  .cut('  // ---- 폴더 즐겨찾기 ----', '  function fmtSize(n) {', `  function closeSheet() { show(isWide() ? 'folders' : 'player'); }\n`)
  .cut('  async function browse(path) {', '  function renderMini() {')
  .cut('  async function disconnect(d) {', '  // 위치 저장은 재생 서비스가')
  .cut('  // ---- 라이브러리: 곡, 앨범', '  async function openFolder(f,')
  .put(`    folder = f;
    index = startIndex`, `    folder = f;
    document.body.classList.add('hasTrack');
    index = startIndex`)
  .put(`    save('lastFolder', f.path);\n`, '')
  .cut('  const sameTrack = ', '  function trackIndexOf(m) {', `  // 폰 앱과 PC는 폴더 위치가 달라서, 곡 이름이 같고 들어 있는 폴더 이름도 같으면 같은 곡으로 본다.
  const folderName = p => shortPath(p).split('/').pop();
  const sameTrack = (t, m) => t.uri === m.uri || (t.title === m.title && !!t.dir && (shortPath(t.dir) === shortPath(m.folder) || t.place === folderName(m.label || m.folder)));
  const belongsTo = (m, f) => f.tracks.some(t => sameTrack(t, m));
`)
  // 저장은 위치를 사용자가 고른다.
  .put(`.replace(/^primary:/, '');`, `.replace(/^primary:/, '').replace(/^[A-Za-z]:\\/?/, '');`)
  .put(`const SCOPES = [['here', '이 폴더'], ['tree', '하위 폴더 포함'], ['all', '모든 폴더']];`, `const SCOPES = [['here', '재생목록'], ['all', '전체']];`)
  .cut('  function inScope(m, base, scope) {', '  function groupLabel(folderPath) {', `  const inScope = (m, base, scope) => scope === 'all' || belongsTo(m, base);\n`)
  .put(`  $('btnExport').onclick = () => openExport({ path: folder.path, name: folder.name, virtual: folder.virtual, tracks: folder.tracks }, 'here');
  $('btnExportFolder').onclick = () => openExport({ path: browsing.path, name: browsing.name }, 'tree');
`, `  $('btnExport').onclick = () => openExport(folder, 'here');\n`)
  .put(`      const r = await B.saveText(exportFileName(), exporting.text);
      $('exportMenu').hidden = true;
      toast('Download 폴더에 저장했습니다.');
      lastExport = r.path;`, `      const r = await B.saveText(exportFileName(), exporting.text);
      if (r.cancelled) return;
      $('exportMenu').hidden = true;
      savedToast(r.path);
      lastExport = r.path;`)
  .put(`$('exportShare').onclick = () => { B.shareText(\`\${exportTitle()} 북마크\`, exporting.text).catch(() => toast('공유하지 못했습니다.')); };`,
    `$('exportShare').onclick = () => { B.shareText('', exporting.text).then(() => toast('클립보드에 복사했습니다.'), () => toast('복사하지 못했습니다.')); };`)
  .put(`      await B.saveImage(excerptName(), excerptData());
      $('excerptMenu').hidden = true;
      toast('갤러리의 DAA 앨범에 저장했습니다.');`, `      const r = await B.saveImage(excerptName(), excerptData());
      if (r.cancelled) return;
      $('excerptMenu').hidden = true;
      savedToast(r.path);`)
  .put(`$('excerptShare').onclick = () => { B.shareFile(excerptName(), 'image/jpeg', { data: excerptData() }).catch(() => toast('공유하지 못했습니다.')); };`,
    `$('excerptShare').onclick = () => { B.copyImage(excerptData()).then(() => toast('이미지를 클립보드에 복사했습니다.'), () => toast('복사하지 못했습니다.')); };`)
  .put(`      await B.saveText(backupName(), await backupText());
      toast('Download 폴더에 저장했습니다.');`, `      const r = await B.saveText(backupName(), await backupText());
      if (!r.cancelled) savedToast(r.path);`)
  .put(`  $('btnBackupShare').onclick = async () => {
    if (!marks().length) { toast('저장된 북마크가 없습니다.'); return; }
    B.shareFile(backupName(), 'application/json', { text: await backupText() }).catch(() => toast('공유하지 못했습니다.'));
  };
`, '')
  // 북마크 들여오기: 폴더 표시가 없는 파일은 지금 듣는 곡의 폴더로 들어온다.
  .put(`fromText(text, folder && folder.path)`, `fromText(text, track() && track().dir)`)
  .put(`      if (browsing && !$('folders').hidden) renderBrowser();\n`, '')
  .put(`해당 폴더의 곡을 연 뒤 들여와 주세요.`, `해당 폴더의 곡을 재생한 뒤 들여와 주세요.`)
  // 시트는 북마크 리스트만 남는다.
  .cut(`    $('btnExport').hidden = $('btnImportSheet').hidden = $('btnPlayAll').hidden = true;`, '    const list = folderMarks();', `    $('btnExport').hidden = $('btnImportSheet').hidden = true;
    $('sheetTitle').textContent = '북마크 리스트';
    $('sheetPath').textContent = '';
`)
  .put(`    track: '<svg viewBox="0 0 24 24">${NOTE('1.9')}</svg>',`, `    track: '<svg viewBox="0 0 24 24">${DISC('1.9')}</svg>',`)
  // 조작
  .put(`  $('btnUp').onclick = () => { if (browsing && browsing.parent != null) browse(browsing.parent); };
  $('btnResume').onclick = () => openFolder(browsing, undefined, undefined, true);
`, '')
  .put(`$('mini').onclick = () => show('player');`, `$('mini').onclick = openPlayer;`)
  .put(`if (dir === 'y' && dy < -30) show('player');`, `if (dir === 'y' && dy < -30) openPlayer();`)
  .put(`  B.onZipBusy(() => { busyTimer = setTimeout(() => { $('busy').hidden = false; }, 250); });\n`, '')
  .put(`$('btnBack').onclick = () => toList();`, `$('btnBack').onclick = () => show('folders');`)
  .put(`  $('btnPlayAll').onclick = () => openFolder(sheetColl, undefined, undefined, true);
  $('btnFiles').onclick = () => openSheet('files');
`, '')
  .put(`  $('btnFavs').onclick = () => openSheet('favs');\n`, '')
  .put(`  function hideBusy() { clearTimeout(busyTimer); $('busy').hidden = true; }`, `  function savedToast(file) { toast('저장했습니다.', '폴더 열기', () => B.showInFolder(file)); }`)
  .put(`    hideBusy();\n  }
  function realPath`, `  }
  function realPath`)
  // 시스템 글꼴: 파일 대신 설치된 글꼴을 쓴다.
  .put("new FontFace('DAA System', `url(\"${f.url}\")`, {", "new FontFace('DAA System', f.src, {")
  .put(`$('appFont').textContent = \`적용된 글꼴: \${name || '기기 기본 글꼴'}\`;`, `$('appFont').textContent = \`적용된 글꼴: \${name || '윈도우 기본 글꼴'}\`;`)
  .put(`// 삼성 글꼴 설정은 WebView에 적용되지 않아서, 폰이 쓰는 글꼴 파일을 직접 불러온다.`, `// 윈도우에 설치된 기본 글꼴을 쓴다.`)
  // 터치 전용 동작 정리: 넓은 창에서 재생 화면은 위아래로 끌지 않는다.
  .put(`      if (dir === 'x') {
        const stuck =`, `      if (dir !== 'x' && isWide()) return;
      if (dir === 'x') {
        const stuck =`)
  .put(`      const reset = () => { $('player').style.transform = ''; };`, `      if (isWide()) return;
      const reset = () => { $('player').style.transform = ''; };`)
  .put(`() => { toList().finally(reset); }`, `() => { show('folders'); reset(); }`)
  .put(`      if (!cancelled && (dy < -90 || vy < -0.7)) { reset(); openSheet('files'); return; }\n`, '')
  .cut(`  swipeBack('folders',`, `  swipeBack('sheet',`)
  // 재생 상태
  .put(`      if (!$('sheet').hidden && sheetMode === 'files') renderSheet();
      if (!$('folders').hidden && browsing) renderBrowser();
`, `      markRows();
      const now = $('playlist').querySelector('li.on');
      if (now) now.scrollIntoView({ block: 'nearest' });
`)
  // 안드로이드 뒤로 버튼 자리에 PC 조작과 재생목록을 넣는다.
  .put(/  \/\/ 안드로이드 뒤로가기 버튼[\s\S]*?nativeApp\.minimizeApp\(\);\n  \}\);\n/.exec(read('app.js'))[0], fs.readFileSync(path.join(__dirname, 'pc-part.js'), 'utf8'))
  // 시작: 지난 재생목록을 불러와 듣던 곡과 위치를 잡아 둔다.
  .cut('  async function start() {', '})();', `  async function start() {
    migrateZipUris();
    playlist.tracks = groupedOrder(await B.loadPlaylist().catch(() => []));
    if (playlist.tracks.length) await openFolder(playlist);
    renderPlaylist();
    addPaths(await B.takeOpened(), { play: true });
  }
  B.appVersion().then(version => { $('appVersion').textContent = \`DIV AUDIO APP 버전 \${version}\`; });
  start();
`)
  .text();

// ---- 복사 ----
fs.mkdirSync(TO, { recursive: true });
fs.writeFileSync(path.join(TO, 'index.html'), html);
fs.writeFileSync(path.join(TO, 'app.js'), app);
for (const f of ['style.css', 'theme.css', 'gestures.js']) fs.copyFileSync(path.join(FROM, f), path.join(TO, f));
fs.rmSync(path.join(TO, 'libutil.js'), { force: true });
console.log('완료');
