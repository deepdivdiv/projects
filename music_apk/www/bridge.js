// 네이티브 재생 플러그인과 화면 사이의 연결부.
// 앱 안에서는 MusicPlayer 플러그인을, 브라우저 미리보기에서는 샘플 데이터 가짜 플레이어를 쓴다.
(function () {
  const native = window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()
    ? window.Capacitor.Plugins.MusicPlayer : null;

  if (native) {
    window.Bridge = {
      hasAccess: () => native.hasAccess(),
      removeFolder: tree => native.removeFolder({ tree }),
      requestAccess: () => native.requestAccess().then(r => r.granted),
      requestNotifications: () => native.requestNotifications(),
      listDir: path => native.listDir({ path: path || '' }),
      getArt: uri => native.getArt({ uri }).then(r => r.dataUrl || null),
      getThumb: (uri, size) => native.getThumb({ uri, size }).then(r => r.dataUrl || null),
      getLibrary: () => native.getLibrary(),
      getSystemFonts: () => native.getSystemFonts().then(r => ({ ...r, fonts: r.fonts.map(f => ({ ...f, url: window.Capacitor.convertFileSrc(f.path) })) })),
      requestAudio: () => native.requestAudio().then(r => r.granted),
      getTags: uri => native.getTags({ uri }),
      saveText: (name, text) => native.saveText({ name, text }),
      shareText: (title, text) => native.shareText({ title, text }),
      setQueue: (tracks, index, position, play, folder) => native.setQueue({ tracks, index, position, play, folder }),
      getResume: (folder, uris) => native.getResume({ folder, uris }),
      setSleep: (delay, endOfTrack) => native.setSleep({ delay, endOfTrack }),
      shareFile: (name, mime, payload) => native.shareFile({ name, mime, ...payload }),
      saveImage: (name, data) => native.saveImage({ name, data }),
      pickText: () => native.pickText(),
      play: () => native.play(),
      pause: () => native.pause(),
      seekTo: position => native.seekTo({ position }),
      skipTo: (index, position) => native.skipTo({ index, position }),
      setSpeed: speed => native.setSpeed({ speed }),
      setEq: (enabled, gains) => native.setEq({ enabled, gains }),
      setTheme: (dark, color) => native.setTheme({ dark, color }),
      onZipBusy: cb => native.addListener('zipBusy', cb),
      onError: cb => native.addListener('playError', cb),
      onState: cb => native.addListener('state', cb),
    };
    return;
  }

  // ---- 브라우저 미리보기용 ----
  const ROOT = '/storage/emulated/0', MUSIC = ROOT + '/Music';
  const tracks = (name, lens) => lens.map((s, i) => ({ uri: name + i, title: `${String(i + 1).padStart(2, '0')}_${name}`, duration: s * 1000 }));
  const art = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600"><defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="#ff7a59"/><stop offset=".5" stop-color="#d6336c"/><stop offset="1" stop-color="#3b5bdb"/></linearGradient></defs><rect width="600" height="600" fill="url(#g)"/><circle cx="300" cy="300" r="150" fill="#ffd43b"/></svg>');
  const pale = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600"><rect width="600" height="600" fill="#fff4d6"/><circle cx="300" cy="300" r="170" fill="#ffe08a"/></svg>');
  const crumbs = path => {
    const out = /store/.test(location.hash) ? [{ name: '내 폴더', path: '' }] : [{ name: '내장 메모리', path: ROOT }]; let cur = ROOT;
    for (const part of path.slice(ROOT.length).split('/').filter(Boolean)) { cur += '/' + part; out.push({ name: part, path: cur }); }
    return out;
  };
  const dir = (path, parent, c) => ({ path, name: crumbs(path).pop().name, parent, crumbs: crumbs(path), dirs: [], zips: [], eggs: [], tracks: [], ...c });
  const tree = {
    [ROOT]: dir(ROOT, undefined, { dirs: [{ name: 'Download', path: ROOT + '/Download', count: 0 }, { name: 'Music', path: MUSIC, count: 5 }] }),
    [ROOT + '/Download']: dir(ROOT + '/Download', ROOT),
    [MUSIC]: dir(MUSIC, ROOT, {
      dirs: [{ name: '강의 녹음', path: MUSIC + '/강의 녹음', count: 2 }, { name: '영어 듣기', path: MUSIC + '/영어 듣기', count: 4 }],
      zips: [{ name: '수업자료.zip', path: MUSIC + '/수업자료.zip', size: 48234567 }],
      eggs: [{ name: '옛날자료.egg', size: 120400000 }],
      tracks: [...tracks('단독 파일', [240]), { uri: 'flac0', title: '무손실 음원', duration: 300000 }, { uri: 'wav0', title: '녹음', duration: 90000 }],
      unplayable: [{ name: '옛날곡.wma', size: 5200000 }],
    }),
    [MUSIC + '/영어 듣기']: dir(MUSIC + '/영어 듣기', MUSIC, { tracks: tracks('영어 듣기', [684, 512, 903, 455]) }),
    [MUSIC + '/강의 녹음']: dir(MUSIC + '/강의 녹음', MUSIC, { tracks: tracks('강의 녹음', [3600, 2700]) }),
  };
  function mockLibrary() {
    const albums = [
      ['윈터필드 1부', '임의주X김명준', 'ACO', '드라마', 2024, 12], ['윈터필드 2부', '임의주X김명준', 'ACO', '드라마', 2025, 8],
      ['삼천의 밤', '박성영X정주원', 'ACO', '드라마', 2023, 6], ['Deadman Switch', 'Kim', 'Studio K', 'Rock', 2022, 5],
      ['Tinder Box', '나은혁X박요한', 'ACO', '드라마', 2021, 4], ['가을 강의', '홍길동', '', '교육', 2020, 3],
    ];
    const out = [];
    albums.forEach(([album, artist, albumArtist, genre, year, n], a) => {
      for (let k = 1; k <= n; k++) out.push({ uri: `${a === 0 ? '영어' : 'lib'}${a}_${k}`, title: `${album} ${k}화`, tag: `${album} ${k}화`, artist, album, albumId: a + 1, albumArtist, genre, year, track: k, added: 1700000000 + a * 1000 + k, duration: (200 + k * 7) * 1000, dir: ROOT + '/Music/' + album });
    });
    out.push({ uri: 'lib_none', title: '태그없음', tag: '', artist: '', album: '', albumId: 99, albumArtist: '', genre: '', year: 0, track: 0, added: 1, duration: 60000, dir: ROOT + '/Download' });
    return out;
  }
  const zipFolder = () => ({ ...dir(MUSIC, MUSIC), path: 'zip:sample', name: '수업자료', zip: true, crumbs: [...crumbs(MUSIC), { name: '수업자료', path: 'zip:sample' }], tracks: tracks('수업자료', [300, 240]) });
  let extracted = false;
  const storeMock = /store/.test(location.hash);
  let connected = [];

  let q = [], i = 0, pos = 0, playing = false, speed = 1, cb = () => {}, busy = () => {}, queueFolder = null, sleepAt = 0, sleepEnd = false;
  // 재생 서비스의 위치 저장을 흉내 낸다. 새로고침이 앱 재시작 역할을 한다.
  const R = () => JSON.parse(localStorage.getItem('__mockResume') || '{"p":{},"f":{}}');
  function persist() {
    if (!q[i] || !queueFolder) return;
    const r = R(), done = pos >= q[i].duration - 3000;
    if (done) delete r.p[q[i].uri]; else r.p[q[i].uri] = pos;
    r.f[queueFolder] = done && q[i + 1] ? q[i + 1].uri : q[i].uri;
    r.last = queueFolder;
    localStorage.setItem('__mockResume', JSON.stringify(r));
  }
  const emit = () => {
    persist();
    cb({ index: i, position: pos, duration: q[i] ? q[i].duration : 0, playing, speed, uri: q[i] && q[i].uri, sleepLeft: sleepAt ? Math.max(0, sleepAt - Date.now()) : 0, sleepEnd });
  };
  setInterval(() => {
    if (!playing || !q[i]) return;
    pos += 500 * speed;
    if (sleepAt && Date.now() >= sleepAt) { sleepAt = 0; playing = false; }
    if (pos >= q[i].duration) {
      if (sleepEnd) { sleepEnd = false; playing = false; pos = q[i].duration; }
      else if (i < q.length - 1) { i++; pos = 0; } else { playing = false; pos = q[i].duration; }
    }
    emit();
  }, 500);
  window.Bridge = {
    setTheme: async () => {},
    hasAccess: async () => ({ version: '1.1', granted: storeMock ? connected.length > 0 : !/noaccess/.test(location.hash) || !!window.__granted, store: storeMock }),
    requestAccess: async () => { window.__granted = true; if (storeMock && !connected.includes(MUSIC)) connected.push(MUSIC); return true; },
    removeFolder: async tree => { connected = connected.filter(x => x !== tree); return { granted: connected.length > 0 }; },
    requestNotifications: async () => {},
    listDir: async path => {
      if (path === 'zip:sample' || path === MUSIC + '/수업자료.zip') {
        if (!extracted) { busy(); await new Promise(r => setTimeout(r, 400)); extracted = true; }
        return zipFolder();
      }
      if (storeMock && !path) {
        return { path: '', name: '내 폴더', isRoot: true, crumbs: [{ name: '내 폴더', path: '' }], zips: [], eggs: [], tracks: [], unplayable: [],
          dirs: connected.map(c => ({ name: c.split('/').pop(), path: c, tree: c, count: 0 })) };
      }
      const r = tree[path || ROOT];
      if (!r) throw new Error('폴더를 찾을 수 없습니다.');
      return r;
    },
    getArt: async uri => (uri.startsWith('영어') ? art : uri.startsWith('단독') ? pale : null),
    getSystemFonts: async () => window.__sysFonts || { fonts: [] },
    getLibrary: async () => (/nolib/.test(location.hash) && !window.__libOk ? { denied: true } : { tracks: mockLibrary() }),
    requestAudio: async () => { window.__libOk = true; return true; },
    getThumb: async uri => { window.__thumbs = (window.__thumbs || 0) + 1; return uri.startsWith('영어') ? art : uri.startsWith('단독') ? pale : null; },
    getTags: async uri => (uri.startsWith('영어') ? {
      tags: [{ label: '제목', value: '듣기 1강' }, { label: '아티스트', value: '홍길동' }, { label: '앨범', value: '기초 영어 듣기' }, { label: '장르', value: '교육' }, { label: '연도', value: '2024' }, { label: '트랙', value: '1/4' }, { label: '코멘트', value: '여러 줄 메모\n두 번째 줄' }],
      tech: [{ label: '형식', value: 'audio/mpeg' }, { label: '비트레이트', value: '128 kbps' }, { label: '샘플레이트', value: '44100 Hz' }],
      size: 10934000, path: '/storage/emulated/0/Music/영어 듣기/01_영어 듣기.mp3',
    } : { tags: [], tech: [] }),
    saveText: async (name, text) => { window.__saved = { name, text }; return { path: '/storage/emulated/0/Download/' + name }; },
    shareText: async (title, text) => { window.__shared = { title, text }; },
    setQueue: async (t, idx, p, play, folder) => { persist(); queueFolder = folder; q = t; i = idx; pos = p; playing = !!play; emit(); },
    getResume: async (folder, uris) => {
      const r = R(), positions = {};
      for (const u of uris) if (r.p[u]) positions[u] = r.p[u];
      return { uri: r.f[folder], positions, lastFolder: r.last };
    },
    setSleep: async (delay, end) => { sleepAt = delay ? Date.now() + delay : 0; sleepEnd = !!end; emit(); },
    shareFile: async (name, mime, payload) => { window.__sharedFile = { name, mime, ...payload }; },
    saveImage: async (name, data) => { window.__image = { name, size: data.length }; },
    pickText: async () => window.__pick || { cancelled: true },
    play: async () => { playing = true; emit(); },
    pause: async () => { playing = false; emit(); },
    seekTo: async p => { pos = p; emit(); },
    skipTo: async (idx, p) => { i = idx; pos = p || 0; emit(); },
    setSpeed: async s => { speed = s; emit(); },
    setEq: async (enabled, gains) => { window.__eq = { enabled, gains: gains.slice() }; },
    onZipBusy: f => { busy = f; },
    onError: f => { window.__playError = f; },
    onState: f => { cb = f; },
  };
})();
