// 라이브러리 목록을 만드는 계산. 화면과 분리해서 정렬 규칙을 한곳에 둔다.
(function () {
  const CHOSUNG = ['ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];
  const DOUBLE = { 'ㄲ': 'ㄱ', 'ㄸ': 'ㄷ', 'ㅃ': 'ㅂ', 'ㅆ': 'ㅅ', 'ㅉ': 'ㅈ' };

  // 인덱스에 표시할 첫 글자. 한글은 초성, 영어는 대문자, 나머지는 #
  function initialOf(name) {
    const first = (name || '').trim().charAt(0);
    const code = first.charCodeAt(0);
    if (code >= 0xAC00 && code <= 0xD7A3) {
      const c = CHOSUNG[Math.floor((code - 0xAC00) / 588)];
      return DOUBLE[c] || c;
    }
    if (/[a-zA-Z]/.test(first)) return first.toUpperCase();
    return '#';
  }
  // 삼성 뮤직처럼 한글, 영어, 그 외 순서로 둔다.
  function rank(name) {
    const i = initialOf(name);
    return i === '#' ? 2 : /[A-Z]/.test(i) ? 1 : 0;
  }
  function byName(a, b) {
    return rank(a) - rank(b) || a.localeCompare(b, 'ko', { numeric: true, sensitivity: 'base' });
  }

  const label = v => v || '알 수 없음';
  const shownName = t => t.tag || t.title;
  const inOrder = (a, b) => (a.track || 0) - (b.track || 0) || byName(a.title, b.title);
  const inAlbumOrder = (a, b) => byName(label(a.album), label(b.album)) || inOrder(a, b);

  function group(tracks, keyOf, nameOf) {
    const map = new Map();
    for (const t of tracks) {
      const key = keyOf(t);
      if (!map.has(key)) map.set(key, { key, name: nameOf(t), tracks: [] });
      map.get(key).tracks.push(t);
    }
    return [...map.values()];
  }
  const newest = list => Math.max(...list.map(t => t.added || 0));
  const latestYear = list => Math.max(...list.map(t => t.year || 0));
  const SORTS = {
    name: (a, b) => byName(a.name, b.name),
    added: (a, b) => newest(b.tracks) - newest(a.tracks) || byName(a.name, b.name),
    year: (a, b) => latestYear(b.tracks) - latestYear(a.tracks) || byName(a.name, b.name),
    count: (a, b) => b.tracks.length - a.tracks.length || byName(a.name, b.name),
  };

  function albums(tracks, sort) {
    const list = group(tracks, t => String(t.albumId || t.album), t => label(t.album));
    for (const a of list) {
      a.tracks.sort(inOrder);
      const first = a.tracks[0];
      a.artist = label(first.albumArtist || first.artist);
    }
    return list.sort(SORTS[sort] || SORTS.name);
  }
  function collection(tracks, field, sort) {
    const list = group(tracks.filter(t => field !== 'genre' || t.genre), t => label(t[field]), t => label(t[field]));
    for (const a of list) {
      a.tracks.sort(inAlbumOrder);
      a.albumCount = new Set(a.tracks.map(t => t.albumId || t.album)).size;
    }
    return list.sort(SORTS[sort] || SORTS.name);
  }
  function songs(tracks, sort) {
    const list = tracks.slice();
    if (sort === 'added') return list.sort((a, b) => (b.added || 0) - (a.added || 0) || byName(shownName(a), shownName(b)));
    return list.sort((a, b) => byName(shownName(a), shownName(b)));
  }

  // 띄어쓰기와 대소문자를 무시하고, 초성만 입력해도 찾는다.
  const squash = s => (s || '').toLowerCase().replace(/\s+/g, '');
  function chosungOf(text) {
    let out = '';
    for (const ch of text || '') {
      const code = ch.charCodeAt(0);
      if (code >= 0xAC00 && code <= 0xD7A3) out += CHOSUNG[Math.floor((code - 0xAC00) / 588)];
      else if (!/\s/.test(ch)) out += ch.toLowerCase();
    }
    return out;
  }
  function matcher(query) {
    const q = squash(query);
    const onlyChosung = /^[ㄱ-ㅎ]+$/.test(q);
    return text => (onlyChosung ? chosungOf(text).includes(q) : squash(text).includes(q));
  }
  function search(tracks, query) {
    const hit = matcher(query);
    return {
      songs: songs(tracks.filter(t => hit(t.title) || hit(t.tag) || hit(t.artist) || hit(t.album) || hit((t.dir || '').split('/').pop()))),
      albums: albums(tracks).filter(a => hit(a.name) || hit(a.artist)),
      artists: collection(tracks, 'artist').filter(a => hit(a.name)),
    };
  }

  window.LibUtil = { initialOf, byName, albums, collection, songs, search, shownName, label };
})();
