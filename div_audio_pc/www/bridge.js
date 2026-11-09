// 재생 엔진. 폰 앱의 재생 서비스가 하던 일을 PC에서는 여기서 한다.
// 소리 경로: audio -> 음량 보정 -> 10밴드 EQ -> 취침 페이드 -> 음량 -> 스피커
(function () {
  const N = window.daa;
  const FREQUENCIES = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
  const Q = 1.41;
  const END_MARGIN_MS = 3000, SAVE_EVERY_MS = 2000, TICK_MS = 250, SLEEP_FADE_MS = 15000;
  const RESUME_KEY = 'nativeResume';

  const audio = new Audio();
  audio.preload = 'auto';
  audio.preservesPitch = true;
  const ctx = new AudioContext({ latencyHint: 'playback' });
  const source = ctx.createMediaElementSource(audio);
  const preamp = ctx.createGain(), fade = ctx.createGain(), volume = ctx.createGain();
  const filters = FREQUENCIES.map(f => {
    const b = ctx.createBiquadFilter();
    b.type = 'peaking'; b.frequency.value = f; b.Q.value = Q; b.gain.value = 0;
    return b;
  });
  [source, preamp, ...filters, fade, volume, ctx.destination].reduce((a, b) => { a.connect(b); return b; });

  let q = [], i = 0, folder = null, wanted = false, speed = 1, pending = null, loaded = false;
  let sleepAt = 0, sleepEnd = false, lastSave = 0;
  let stateCb = () => {}, errorCb = () => {}, openCb = () => {}, addCb = () => {}, windowCb = () => {};

  // ---- 이어듣기 저장 ----
  const readResume = () => { try { return JSON.parse(localStorage.getItem(RESUME_KEY)) || { p: {}, f: {} }; } catch { return { p: {}, f: {} }; } };
  const resume = readResume();
  const writeResume = () => localStorage.setItem(RESUME_KEY, JSON.stringify(resume));
  const mediaUrl = uri => '/media/' + encodeURIComponent(uri);
  const position = () => (pending !== null ? pending : Math.round(audio.currentTime * 1000));
  const duration = () => (Number.isFinite(audio.duration) && loaded ? Math.round(audio.duration * 1000) : (q[i] ? q[i].duration : 0));

  function saveNow() {
    const t = q[i];
    if (!t) return;
    const pos = position(), dur = duration();
    const finished = dur > 0 && pos >= dur - END_MARGIN_MS;
    if (finished || pos <= 0) delete resume.p[t.uri]; else resume.p[t.uri] = pos;
    if (folder !== null) {
      resume.f[folder] = finished && q[i + 1] ? q[i + 1].uri : t.uri;
      resume.last = folder;
    }
    writeResume();
    lastSave = performance.now();
  }

  function emit() {
    const t = q[i];
    stateCb({
      index: i, position: position(), duration: duration(), playing: wanted, speed, uri: t && t.uri,
      sleepLeft: sleepAt ? Math.max(0, sleepAt - Date.now()) : 0, sleepEnd,
    });
  }

  function start() {
    if (ctx.state === 'suspended') ctx.resume();
    audio.play().catch(() => {}); // 곡을 연달아 넘기면 앞선 재생 요청은 취소된다.
  }

  function load(index, pos, play) {
    i = index; pending = pos || 0; wanted = !!play; loaded = false;
    audio.src = mediaUrl(q[i].uri);
    audio.load();
    emit();
  }

  audio.addEventListener('loadedmetadata', () => {
    loaded = true;
    if (pending > 0 && pending < audio.duration * 1000) audio.currentTime = pending / 1000;
    pending = null;
    audio.playbackRate = speed;
    if (wanted) start();
    emit();
  });
  audio.addEventListener('ended', () => {
    const t = q[i];
    if (t) { delete resume.p[t.uri]; writeResume(); }
    if (sleepEnd) { sleepEnd = false; wanted = false; emit(); return; }
    if (i < q.length - 1) load(i + 1, 0, true);
    else { wanted = false; saveNow(); emit(); }
  });
  audio.addEventListener('error', () => {
    if (!audio.src) return;
    wanted = false;
    errorCb();
    emit();
  });
  audio.addEventListener('seeked', emit);

  setInterval(() => {
    if (sleepAt) {
      const left = sleepAt - Date.now();
      fade.gain.value = left >= SLEEP_FADE_MS ? 1 : Math.max(0, left / SLEEP_FADE_MS);
      if (left <= 0) { sleepAt = 0; wanted = false; audio.pause(); fade.gain.value = 1; saveNow(); emit(); }
    }
    if (!wanted) return;
    emit();
    if (performance.now() - lastSave >= SAVE_EVERY_MS) saveNow();
  }, TICK_MS);
  window.addEventListener('beforeunload', saveNow);

  // ---- 미디어 키, 윈도우 재생 표시 ----
  const session = navigator.mediaSession;
  let mediaCb = () => {};
  for (const action of ['play', 'pause', 'previoustrack', 'nexttrack']) session.setActionHandler(action, () => mediaCb(action));

  N.on((name, data) => {
    if (name === 'open') openCb(data);
    if (name === 'addProgress') addCb(data);
    if (name === 'window') windowCb(data);
  });

  window.Bridge = {
    appVersion: () => N.version(),
    collect: paths => N.call('collect', paths),
    pickFiles: () => N.call('pickFiles'),
    pickFolder: () => N.call('pickFolder'),
    loadPlaylist: () => N.call('loadPlaylist'),
    savePlaylist: tracks => N.call('savePlaylist', tracks),
    takeOpened: () => N.call('takeOpened'),
    setTheme: (dark, background) => N.call('setTheme', dark, background),
    revealTrack: uri => N.call('revealTrack', uri),
    listDir: place => N.call('placeInfo', place),
    getArt: uri => N.call('getArt', uri),
    getThumb: (uri, size) => N.call('getThumb', uri, size),
    getTags: uri => N.call('getTags', uri),
    // 윈도우의 한글 기본 글꼴은 맑은 고딕, 영문은 Segoe UI다.
    getSystemFonts: async () => ({
      name: '맑은 고딕',
      fonts: [
        { src: 'local("Segoe UI")', weight: '400' }, { src: 'local("Segoe UI Bold")', weight: '700' },
        { src: 'local("Malgun Gothic")', weight: '400', range: 'U+1100-11FF, U+3130-318F, U+A960-A97F, U+AC00-D7FB' },
        { src: 'local("Malgun Gothic Bold")', weight: '700', range: 'U+1100-11FF, U+3130-318F, U+A960-A97F, U+AC00-D7FB' },
      ],
    }),
    saveText: (name, text) => N.call('saveText', name, text),
    saveImage: (name, data) => N.call('saveImage', name, data),
    shareText: (title, text) => N.call('copyText', text),
    copyImage: data => N.call('copyImage', data),
    showInFolder: file => N.call('showInFolder', file),
    pickText: () => N.call('pickText'),
    pathOf: file => N.pathOf(file),
    // 창: mode는 full(보통), mini(작은 플레이어), float(작은 플레이어를 항상 위에)
    windowState: () => N.call('windowState'),
    setWindowMode: mode => N.call('setWindowMode', mode),
    setOpacity: value => N.call('setOpacity', value),
    windowAction: action => N.call('windowAction', action),
    onWindow: f => { windowCb = f; },

    async setQueue(tracks, index, pos, play, folderPath) {
      saveNow();
      q = tracks; folder = folderPath;
      load(index, pos, play);
    },
    // 재생을 끊지 않고 목록만 바꾼다.
    syncQueue(tracks, index) { q = tracks; i = index; },
    stop() {
      saveNow();
      q = []; i = 0; wanted = false; loaded = false; pending = null;
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
      session.metadata = null;
      document.title = 'DIV AUDIO APP';
    },
    async getResume(folderPath, uris) {
      const positions = {};
      for (const u of uris) if (resume.p[u]) positions[u] = resume.p[u];
      return { uri: resume.f[folderPath], positions, lastFolder: resume.last };
    },
    async play() {
      if (!q[i]) return;
      wanted = true;
      if (loaded) start();
      emit();
    },
    async pause() { wanted = false; audio.pause(); saveNow(); emit(); },
    async seekTo(pos) {
      if (loaded) audio.currentTime = pos / 1000; else pending = pos;
      saveNow(); emit();
    },
    async skipTo(index, pos) {
      if (!q[index]) return;
      saveNow();
      if (index === i && loaded) { audio.currentTime = (pos || 0) / 1000; emit(); return; }
      load(index, pos, wanted);
    },
    async setSpeed(s) { speed = s; audio.defaultPlaybackRate = s; audio.playbackRate = s; emit(); },
    async setSleep(delay, endOfTrack) {
      sleepAt = delay ? Date.now() + delay : 0;
      sleepEnd = !!endOfTrack;
      fade.gain.value = 1;
      emit();
    },
    async setEq(enabled, gains) {
      let boost = 0;
      filters.forEach((f, n) => {
        const g = enabled ? gains[n] || 0 : 0;
        f.gain.value = g;
        boost = Math.max(boost, g);
      });
      preamp.gain.value = Math.pow(10, -boost / 20); // 키운 만큼 낮춰 소리가 찢어지지 않게 한다.
    },
    setVolume: v => { volume.gain.value = v * v; }, // 귀에 고르게 들리도록 곡선으로 준다.
    setMeta(title, album, art) {
      session.metadata = new MediaMetadata({ title, artist: album, artwork: art ? [{ src: art, sizes: '512x512', type: 'image/jpeg' }] : [] });
      document.title = `${title} - DIV AUDIO APP`;
    },
    onMedia: f => { mediaCb = f; },
    onOpen: f => { openCb = f; },
    onAddProgress: f => { addCb = f; },
    onError: f => { errorCb = f; },
    onState: f => { stateCb = f; },
  };
  // 자동 시험에서 실제 소리가 나오는지 재기 위한 측정 지점.
  window.__daaMeter = () => { const a = ctx.createAnalyser(); volume.connect(a); return { analyser: a, audio, filters, fade, volume, preamp, ctx }; };
})();
