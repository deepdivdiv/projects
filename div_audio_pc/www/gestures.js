// 드래그와 탭을 구분한다. 방향이 정해지기 전에는 터치를 가로채지 않아서 버튼과 스크롤이 그대로 동작한다.
(function () {
  const SLOP = 10;

  // dirs: 받을 방향(left, right, up, down). 다른 방향이면 손을 뗀 것으로 친다.
  function drag(el, o) {
    let p = null, suppressClick = false;

    el.addEventListener('pointerdown', e => {
      if (e.button > 0 || (o.canStart && !o.canStart(e))) return;
      p = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now(), lx: e.clientX, ly: e.clientY, lt: performance.now(), vx: 0, vy: 0, dir: null };
    });

    el.addEventListener('pointermove', e => {
      if (!p || e.pointerId !== p.id) return;
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      if (!p.dir) {
        if (Math.hypot(dx, dy) < SLOP) return;
        const horizontal = Math.abs(dx) > Math.abs(dy);
        const name = horizontal ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
        if (o.dirs && !o.dirs.includes(name)) { p = null; return; }
        p.dir = horizontal ? 'x' : 'y';
        try { el.setPointerCapture(e.pointerId); } catch { /* 이미 끝난 터치 */ }
        if (o.onStart) o.onStart(p.dir);
      }
      const now = performance.now(), dt = Math.max(1, now - p.lt);
      p.vx = (e.clientX - p.lx) / dt; p.vy = (e.clientY - p.ly) / dt;
      p.lx = e.clientX; p.ly = e.clientY; p.lt = now;
      if (o.onMove) o.onMove({ dir: p.dir, dx, dy });
    });

    function finish(e, cancelled) {
      if (!p || e.pointerId !== p.id) return;
      const s = p; p = null;
      if (s.dir) {
        suppressClick = true;
        setTimeout(() => { suppressClick = false; }, 60);
        if (o.onEnd) o.onEnd({ dir: s.dir, dx: e.clientX - s.x, dy: e.clientY - s.y, vx: s.vx, vy: s.vy, cancelled });
      } else if (!cancelled && o.onTap && performance.now() - s.t < 500) {
        o.onTap(e);
      }
    }
    el.addEventListener('pointerup', e => finish(e, false));
    el.addEventListener('pointercancel', e => finish(e, true));
    // 드래그를 끝낸 자리의 버튼이 눌리지 않게 한다.
    el.addEventListener('click', e => {
      if (suppressClick) { suppressClick = false; e.stopPropagation(); e.preventDefault(); }
    }, true);
  }

  window.Gesture = { drag };
})();
