(() => {
  const panels = [...document.querySelectorAll('.panel')];
  const dotsNav = document.querySelector('.dots');
  const bar = document.querySelector('.autobar i');
  const curtain = document.querySelector('.curtain');
  const film = document.getElementById('film');
  const params = new URLSearchParams(location.search);
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---- split headings into words, wordmarks into letters (for the reveal animations) ----
  document.querySelectorAll('.panel h2').forEach(h => {
    const words = h.textContent.trim().split(/\s+/);
    h.textContent = '';
    words.forEach((w, i) => {
      const outer = document.createElement('span'); outer.className = 'w';
      const inner = document.createElement('span'); inner.textContent = w; inner.style.setProperty('--i', i);
      outer.appendChild(inner); h.appendChild(outer);
      if (i < words.length - 1) h.appendChild(document.createTextNode(' '));
    });
    h.classList.add('sw');
    h.setAttribute('aria-label', words.join(' '));
  });
  document.querySelectorAll('.wordmark').forEach(h => {
    const text = h.textContent; let k = 0;
    h.textContent = '';
    [...text].forEach(ch => {
      if (ch === ' ') { h.appendChild(document.createTextNode(' ')); return; }
      const l = document.createElement('span'); l.className = 'l'; l.textContent = ch; l.style.setProperty('--i', k++);
      h.appendChild(l);
    });
    h.classList.add('sw');
    h.setAttribute('aria-label', text.replace(/\s+/g, ''));
  });

  // ---- spec numbers count up when the dimensions section comes in ----
  const specDDs = [...document.querySelectorAll('.specs dd')];
  specDDs.forEach(dd => { dd.dataset.final = dd.textContent; });
  function countUp() {
    if (reduceMotion) return;
    const t0 = performance.now(), dur = 1500;
    const items = specDDs.map(dd => ({ dd, parts: dd.dataset.final.split(/(\d+(?:\.\d+)?)/) }));
    if (!items.some(it => it.parts.length > 1)) return;
    (function tick(now) {
      const t = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - t, 3);
      items.forEach(({ dd, parts }) => {
        if (parts.length < 2) return;
        dd.textContent = parts.map((x, j) => {
          if (j % 2 === 0) return x;
          const dec = (x.split('.')[1] || '').length;
          return (parseFloat(x) * e).toFixed(dec);
        }).join('');
      });
      if (t < 1) requestAnimationFrame(tick);
      else specDDs.forEach(dd => { dd.textContent = dd.dataset.final; });
    })(t0);
  }
  function onEnter(panel) {
    if (panel.id === 'dims') setTimeout(countUp, 350);
  }

  // Auto-advance (kiosk) is on for large screens with a mouse, or with ?kiosk=1. ?kiosk=0 turns it off.
  const wantKiosk = params.get('kiosk');
  const kiosk = wantKiosk === '1' || (wantKiosk !== '0' && matchMedia('(pointer: fine)').matches && innerWidth >= 900);

  const IDLE_MS = 14000;       // after a visitor touches anything, wait this long before auto-advancing again
  const DEFAULT_DWELL = 9;     // seconds per section
  let current = 0;
  let enteredAt = performance.now();
  let lastInput = -Infinity;
  let jumping = false;

  // ---- dots ----
  panels.forEach((p, i) => {
    const a = document.createElement('a');
    a.href = '#' + p.id;
    a.innerHTML = '<span>' + (p.dataset.label || '') + '</span>';
    a.addEventListener('click', e => { e.preventDefault(); go(i); markInput(); });
    dotsNav.appendChild(a);
  });
  const dots = [...dotsNav.children];

  // ---- videos: play only what is on screen ----
  const vids = [...document.querySelectorAll('video')];
  const vio = new IntersectionObserver(entries => {
    entries.forEach(en => {
      const v = en.target;
      if (en.isIntersecting) {
        if (v !== film) { try { v.currentTime = 0; } catch (_) {} }
        const pr = v.play(); if (pr && pr.catch) pr.catch(() => {});
      } else {
        v.pause();
      }
    });
  }, { threshold: 0.35 });
  vids.forEach(v => { v.muted = true; v.setAttribute('muted', ''); vio.observe(v); });

  // film: play once per visit to the first section, then the kiosk moves on; loop it when kiosk is off
  if (film) {
    film.loop = !kiosk;
    film.addEventListener('ended', () => {
      if (kiosk && current === 0 && !userActive()) next();
      else { film.currentTime = 0; film.play().catch(() => {}); }
    });
  }

  // ---- which panel is on screen ----
  const pio = new IntersectionObserver(entries => {
    entries.forEach(en => {
      const visible = en.isIntersecting && (en.intersectionRatio >= 0.55 || en.intersectionRect.height >= innerHeight * 0.5);
      if (visible) {
        const i = panels.indexOf(en.target);
        if (!en.target.classList.contains('in')) { en.target.classList.add('in'); onEnter(en.target); }
        if (i !== current) {
          current = i;
          enteredAt = performance.now();
          if (i === 0 && film) { try { film.currentTime = 0; } catch (_) {} film.play().catch(() => {}); }
        }
        dots.forEach((d, k) => d.classList.toggle('on', k === i));
      } else if (!en.isIntersecting) {
        // fully off screen: reset so the animations play again next time (kiosk loop)
        en.target.classList.remove('in');
      }
    });
  }, { threshold: [0, 0.1, 0.2, 0.3, 0.4, 0.55, 0.7] });
  panels.forEach(p => pio.observe(p));
  panels[0].classList.add('in');
  dots[0] && dots[0].classList.add('on');

  // ---- scroll parallax: each panel gets --p = its offset from the top of the screen, in screen heights ----
  if (!reduceMotion) {
    let ticking = false;
    const para = () => {
      ticking = false;
      const H = innerHeight;
      panels.forEach(p => {
        const r = p.getBoundingClientRect();
        if (r.bottom < -H || r.top > 2 * H) return;
        const v = Math.max(-1, Math.min(1, r.top / H));
        p.style.setProperty('--p', v.toFixed(4));
      });
    };
    addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(para); } }, { passive: true });
    addEventListener('resize', para);
    para();
  }

  function go(i) {
    i = Math.max(0, Math.min(panels.length - 1, i));
    panels[i].scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function next() {
    if (jumping) return;
    if (current >= panels.length - 1) {
      // fade out, jump to the top, fade in
      jumping = true;
      curtain.classList.add('on');
      setTimeout(() => {
        document.documentElement.style.scrollBehavior = 'auto';
        scrollTo(0, 0);
        document.documentElement.style.scrollBehavior = '';
        current = 0; enteredAt = performance.now();
        if (film) { try { film.currentTime = 0; } catch (_) {} film.play().catch(() => {}); }
        setTimeout(() => { curtain.classList.remove('on'); jumping = false; }, 120);
      }, 750);
      return;
    }
    go(current + 1);
  }

  function dwellFor(i) {
    const d = panels[i].dataset.dwell;
    if (d === 'film') {
      // wait for the film to end; fall back if it can't play
      return film && isFinite(film.duration) && film.duration > 0 && !film.error ? Infinity : 10;
    }
    return parseFloat(d) || DEFAULT_DWELL;
  }

  function userActive() { return performance.now() - lastInput < IDLE_MS; }

  // ---- input ----
  let cursorTimer;
  function markInput() {
    lastInput = performance.now();
    document.body.classList.remove('hide-cursor');
    clearTimeout(cursorTimer);
    cursorTimer = setTimeout(() => document.body.classList.add('hide-cursor'), 3000);
  }
  ['wheel', 'touchstart', 'pointerdown', 'keydown'].forEach(t => addEventListener(t, markInput, { passive: true }));
  addEventListener('pointermove', () => {
    document.body.classList.remove('hide-cursor');
    clearTimeout(cursorTimer);
    cursorTimer = setTimeout(() => document.body.classList.add('hide-cursor'), 3000);
  }, { passive: true });

  addEventListener('keydown', e => {
    if (['ArrowDown', 'PageDown', ' '].includes(e.key)) { e.preventDefault(); go(current + 1); }
    else if (['ArrowUp', 'PageUp'].includes(e.key)) { e.preventDefault(); go(current - 1); }
    else if (e.key === 'Home') { e.preventDefault(); go(0); }
    else if (e.key === 'End') { e.preventDefault(); go(panels.length - 1); }
    else if (e.key === 'f' || e.key === 'F') { toggleFs(); }
  });

  // ---- fullscreen ----
  const fsBtn = document.querySelector('.fs');
  function toggleFs() {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen && document.documentElement.requestFullscreen().catch(() => {});
    else document.exitFullscreen && document.exitFullscreen();
  }
  fsBtn && fsBtn.addEventListener('click', toggleFs);
  document.addEventListener('fullscreenchange', () => { if (fsBtn) fsBtn.style.display = document.fullscreenElement ? 'none' : ''; });

  // ---- kiosk loop ----
  if (kiosk) {
    setInterval(() => {
      if (jumping) return;
      if (userActive()) { bar.style.width = '0%'; return; }
      const dwell = dwellFor(current);
      if (!isFinite(dwell)) {
        // film section: show film progress
        if (film && film.duration) bar.style.width = (100 * film.currentTime / film.duration).toFixed(2) + '%';
        return;
      }
      const since = Math.max(performance.now() - Math.max(enteredAt, lastInput + IDLE_MS), 0) / 1000;
      bar.style.width = Math.min(100, 100 * since / dwell).toFixed(2) + '%';
      if (since >= dwell) next();
    }, 250);
  } else {
    bar.parentElement.style.display = 'none';
  }

  // keep the screen awake on the exhibition laptop where supported
  if (kiosk && 'wakeLock' in navigator) {
    const lock = () => navigator.wakeLock.request('screen').catch(() => {});
    lock();
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') lock(); });
  }
})();
