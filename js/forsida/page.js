(function () {
  'use strict';
  var root = document.documentElement;
  root.classList.add('js');
  var reduce = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  var hover = !!(window.matchMedia && matchMedia('(hover: hover) and (pointer: fine)').matches);
  var story = document.getElementById('story');
  if (story) root.classList.add('story-on');
  var gsap = window.gsap, ST = window.ScrollTrigger, Split = window.SplitText;
  if (gsap && ST) gsap.registerPlugin(ST);
  if (gsap && Split) gsap.registerPlugin(Split); else root.classList.add('no-split');
  var NCH = Math.max(1, document.querySelectorAll('.ch').length - 1);
  function storyHeight() { if (story) story.style.height = (innerHeight + NCH * Math.round(innerHeight * 1.25)) + 'px'; }
  storyHeight();
  var hd = document.getElementById('hd');
  var prog = hd.querySelector('.prog');

  /* ---------- Lenis: smooth scrolling, driven by GSAP's ticker so ScrollTrigger and the 3D stay in step ---------- */
  var lenis = null;
  if (!reduce && window.Lenis) {
    try {
      lenis = new Lenis({ lerp: 0.085, wheelMultiplier: 0.95, anchors: true, autoRaf: !gsap });
      if (gsap) {
        if (ST) lenis.on('scroll', ST.update);
        gsap.ticker.add(function (time) { lenis.raf(time * 1000); });
        gsap.ticker.lagSmoothing(0);
      }
    } catch (e) { lenis = null; }
  }
  function scrollToY(y) { if (lenis) lenis.scrollTo(y, { duration: 1.5 }); else window.scrollTo({ top: y, behavior: reduce ? 'auto' : 'smooth' }); }

  /* ---------- the story: wait for the stage pictures (afangar.js) ---------- */
  var S = null, sceneReady = new Promise(function (res) {
    window.addEventListener('pb:size', function () { if (ST) ST.refresh(); });
    function done() { S = window.PBStory || null; res(S); }
    if ('PBStory' in window) done(); else window.addEventListener('pbstory', done, { once: true });
    setTimeout(function () { if (!S) { root.classList.remove('story-on'); root.classList.add('no3d'); story.style.height = ''; res(null); } }, 12000);
  });

  /* ---------- split headings (React Bits style: words rise out of a mask) ---------- */
  function splitWords(el) {
    if (!Split || !el) return null;
    try { return Split.create(el, { type: 'words', wordsClass: 'w', mask: 'words', maskClass: 'wmask' }); } catch (e) { return null; }
  }

  /* ---------- intro: logo in the middle flies into the header, then the camera glides in ---------- */
  var intro = document.getElementById('intro');
  // two logos (dark letters for the light theme, light letters for the dark theme): use the one that is showing
  function shown(list) { list = [].slice.call(list); for (var i = 0; i < list.length; i++) if (getComputedStyle(list[i]).display !== 'none') return list[i]; return list[0]; }
  var brand = document.querySelector('.brand');
  var ilogo = shown(intro.querySelectorAll('img')), hlogo = shown(brand.querySelectorAll('img'));
  var heroH = document.querySelector('.ch-hero .disp');
  var fontsReady = document.fonts && document.fonts.ready ? document.fonts.ready.catch(function () {}) : Promise.resolve();
  var heroSplit = null, heroShown = false;
  if (gsap && Split && !reduce) fontsReady.then(function () {
    if (heroShown) return;
    heroSplit = splitWords(heroH);
    if (heroSplit) gsap.set(heroSplit.words, { yPercent: 110, opacity: 0 });
  });
  function heroIn() {
    heroShown = true;
    root.classList.add('hero-in');
    if (heroSplit) gsap.to(heroSplit.words, { yPercent: 0, opacity: 1, duration: 1.1, ease: 'expo.out', stagger: 0.06, delay: 0.05 });
    countStats(document.querySelectorAll('.ch-hero .stats b'), 0.5);
  }
  function afterIntro() {
    intro.hidden = true; root.classList.remove('intro-on'); brand.style.opacity = '';
    if (lenis) lenis.start();
    if (S) {
      S.build(2600);
      setTimeout(heroIn, reduce ? 0 : 900);
    } else heroIn();
  }
  var skipped = false, logoDone = false;
  function finish() {
    if (skipped) return; skipped = true;
    sceneReady.then(function () { intro.classList.remove('wait'); afterIntro(); });
    if (!S) intro.classList.add('wait');
  }
  function skip() {
    if (intro.getAnimations) intro.getAnimations({ subtree: true }).forEach(function (a) { a.finish(); });
    finish();
  }
  var seen = false; try { seen = !!document.referrer && new URL(document.referrer).origin === location.origin; } catch (e) {}
  var deep = !!location.hash || /[?&]verk=/.test(location.search);
  if (reduce || seen || deep || !ilogo.animate) {
    intro.hidden = true;
    sceneReady.then(function () { if (S) S.build(reduce || deep ? 0 : 2200); heroIn(); });
  } else {
    intro.hidden = false; root.classList.add('intro-on'); brand.style.opacity = '0';
    ilogo = shown(intro.querySelectorAll('img')); hlogo = shown(brand.querySelectorAll('img'));
    if (lenis) lenis.stop();
    intro.addEventListener('click', skip);
    addEventListener('keydown', function (e) { if (e.key === 'Escape') skip(); });
    var E = 'cubic-bezier(.2,.75,.2,1)';
    ilogo.animate([{ opacity: 0, transform: 'scale(.92)', filter: 'blur(6px)' }, { opacity: 1, transform: 'scale(1)', filter: 'blur(0)' }], { duration: 650, easing: E, fill: 'forwards' }).finished
      .then(function () { return Promise.race([sceneReady, new Promise(function (r) { setTimeout(r, 380); })]); })
      .then(function () { if (!S && !skipped) { intro.classList.add('wait'); return sceneReady; } })
      .then(function () {
        if (skipped) return;
        intro.classList.remove('wait');
        var a = ilogo.getBoundingClientRect(), b = hlogo.getBoundingClientRect();
        var s = b.width / a.width, dx = (b.left + b.width / 2) - (a.left + a.width / 2), dy = (b.top + b.height / 2) - (a.top + a.height / 2);
        var bg = getComputedStyle(intro).backgroundColor, bg0 = bg.replace(/^rgba?\(([^,]+),([^,]+),([^,)]+).*$/, 'rgba($1,$2,$3,0)');
        intro.animate([{ backgroundColor: bg }, { backgroundColor: bg0 }], { duration: 900, delay: 120, easing: E, fill: 'forwards' });
        return ilogo.animate([{ transform: 'translate(0,0) scale(1)' }, { transform: 'translate(' + dx + 'px,' + dy + 'px) scale(' + s + ')' }], { duration: 820, easing: 'cubic-bezier(.7,0,.2,1)', fill: 'forwards' }).finished;
      })
      .then(function () { logoDone = true; finish(); })
      .catch(function () { finish(); });
  }

  function toHash() {
    if (!location.hash) return;
    var t = null; try { t = document.querySelector(location.hash); } catch (e) {}
    if (t) { var y = t.getBoundingClientRect().top + scrollY; if (lenis) lenis.scrollTo(y, { immediate: true, force: true }); else window.scrollTo(0, y); }
  }
  if (deep) { addEventListener('load', function () { setTimeout(toHash, 60); }); window.addEventListener('pb:size', function () { if (scrollY > 0 || location.hash) setTimeout(toHash, 30); }, { once: true }); }

  /* ---------- mobile menu ---------- */
  var mb = document.getElementById('menuBtn'), mn = document.getElementById('mnav');
  if (mb && mn) {
    var setMenu = function (o) { mn.hidden = !o; mb.setAttribute('aria-expanded', o ? 'true' : 'false'); var ic = document.getElementById('menuIco'); if (ic) ic.setAttribute('d', o ? 'M6 6l12 12M18 6L6 18' : 'M4 7h16M4 12h16M4 17h16'); };
    mb.addEventListener('click', function () { setMenu(mn.hidden); });
    mn.addEventListener('click', function (e) { if (e.target.closest('a')) setMenu(false); });
    addEventListener('resize', function () { if (innerWidth > 1179) setMenu(false); });
  }

  /* ---------- light / dark: same switch and the same remembered choice (pb-theme) as the rest of the site ---------- */
  var tb = document.getElementById('themeBtn'), tmeta = document.querySelector('meta[name="theme-color"]');
  function isDark() { var a = root.getAttribute('data-theme'); return a ? a === 'dark' : !!(window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches); }
  function syncTheme() { if (tmeta) tmeta.setAttribute('content', isDark() ? '#0c0d0f' : '#f4f0e8'); if (tb) tb.setAttribute('aria-pressed', isDark() ? 'true' : 'false'); }
  var themeTimer = 0;
  if (tb) tb.addEventListener('click', function () {
    var n = isDark() ? 'light' : 'dark';
    root.classList.add('theming'); clearTimeout(themeTimer); themeTimer = setTimeout(function () { root.classList.remove('theming'); }, 700);
    root.setAttribute('data-theme', n);
    try { localStorage.setItem('pb-theme', n); } catch (e) {}
    syncTheme();
  });
  syncTheme();

  /* ---------- chapter headings rise in when their chapter becomes active ---------- */
  var chSplits = [];
  if (gsap && Split && !reduce) fontsReady.then(function () {
    document.querySelectorAll('.ch:not(.ch-hero) .disp').forEach(function (h, i) { chSplits[i + 1] = splitWords(h); });
    window.addEventListener('pb:chapter', function (e) {
      var sp = chSplits[e.detail]; if (!sp) return;
      gsap.fromTo(sp.words, { yPercent: 105 }, { yPercent: 0, duration: 0.9, ease: 'expo.out', stagger: 0.05, overwrite: true });
    });
  });

  /* ---------- header: transparent over the stage, solid after it; progress through the story ---------- */
  function onScroll() {
    var r = story.getBoundingClientRect(), total = Math.max(1, r.height - innerHeight);
    var p = Math.min(1, Math.max(0, -r.top / total));
    prog.style.setProperty('--p', p.toFixed(4));
    prog.style.opacity = r.bottom > innerHeight * 0.5 ? '1' : '0';
    hd.classList.toggle('solid', r.bottom < 80);
  }
  if (lenis) lenis.on('scroll', onScroll); else addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', onScroll); onScroll();

  /* ---------- rail: jump to a chapter ---------- */
  document.querySelectorAll('.rail button').forEach(function (b, i) {
    b.addEventListener('click', function () { if (S) scrollToY(S.chapterTop(i)); });
  });

  /* ---------- count-up numbers ---------- */
  function countStats(els, delay) {
    if (!gsap || reduce) return;
    els.forEach(function (b) {
      var m = /^(\d+)(.*)$/.exec(b.textContent.trim()); if (!m) return;
      var to = +m[1], rest = m[2], o = { v: 0 };
      gsap.to(o, { v: to, duration: 1.6, delay: delay || 0, ease: 'power3.out', onUpdate: function () { b.textContent = Math.round(o.v) + rest; } });
    });
  }

  /* ---------- sections: headings split into words, blocks rise in, numbers count, words light up ---------- */
  if (gsap && ST && !reduce) fontsReady.then(function () {
    document.querySelectorAll('.sec .disp').forEach(function (h) {
      var sp = splitWords(h); if (!sp) return;
      gsap.set(sp.words, { yPercent: 108 });
      ST.create({ trigger: h, start: 'top 88%', once: true, onEnter: function () { gsap.to(sp.words, { yPercent: 0, duration: 1.0, ease: 'expo.out', stagger: 0.06 }); } });
    });
    var rv = [].slice.call(document.querySelectorAll('.rv'));
    rv.forEach(function (el) { if (el.getBoundingClientRect().top > innerHeight * 0.95) gsap.set(el, { opacity: 0, y: 34 }); });
    ST.batch(rv, { start: 'top 90%', once: true, onEnter: function (els) { gsap.to(els, { opacity: 1, y: 0, duration: 1.0, ease: 'expo.out', stagger: 0.08, overwrite: true }); } });
    var big = document.querySelector('.bigfact b');
    if (big) ST.create({ trigger: big, start: 'top 90%', once: true, onEnter: function () { countStats([big], 0.1); } });
    document.querySelectorAll('.sreveal').forEach(function (p) {
      var sp = Split ? Split.create(p, { type: 'words' }) : null; if (!sp) return;
      gsap.fromTo(sp.words, { opacity: 0.16 }, { opacity: 1, ease: 'none', stagger: 0.08, scrollTrigger: { trigger: p, start: 'top 82%', end: 'bottom 48%', scrub: true } });
    });
    ST.refresh();
  });

  /* ---------- scroll-velocity band: two rows drift in opposite directions, faster while you scroll ---------- */
  (function () {
    var rows = [].slice.call(document.querySelectorAll('.band-row'));
    if (!rows.length) return;
    rows.forEach(function (r) {
      var html = r.innerHTML, guard = 0;
      while (r.scrollWidth < innerWidth * 1.3 && guard++ < 8) r.innerHTML += html;
      r._half = r.scrollWidth; r.innerHTML += r.innerHTML;
      r._dir = +r.getAttribute('data-dir') || -1; r._x = r._dir < 0 ? 0 : -r._half;
    });
    if (reduce) return;
    var lastY = scrollY, vel = 0, dirSign = 1, t0 = performance.now();
    function tick() {
      var now = performance.now(), dt = Math.min(0.05, (now - t0) / 1000); t0 = now;
      var y = lenis ? lenis.scroll : scrollY, dy = y - lastY; lastY = y;
      var v = lenis ? lenis.velocity : dy;
      vel += (v - vel) * Math.min(1, dt * 6);
      if (Math.abs(v) > 0.5) dirSign = v > 0 ? 1 : -1;
      var speed = 46 + Math.min(900, Math.abs(vel) * 38);
      rows.forEach(function (r) {
        r._x += r._dir * dirSign * speed * dt;
        if (r._x <= -r._half) r._x += r._half; if (r._x > 0) r._x -= r._half;
        r.style.transform = 'translate3d(' + r._x.toFixed(1) + 'px,0,0)';
      });
    }
    if (gsap) gsap.ticker.add(tick); else (function loop() { tick(); requestAnimationFrame(loop); })();
  })();

  /* ---------- magnet buttons: the main buttons lean toward the pointer ---------- */
  if (gsap && hover && !reduce) {
    document.querySelectorAll('.btn:not(.sm), .bignum').forEach(function (el) {
      var qx = gsap.quickTo(el, 'x', { duration: 0.5, ease: 'power3.out' }), qy = gsap.quickTo(el, 'y', { duration: 0.5, ease: 'power3.out' });
      el.addEventListener('pointermove', function (e) {
        var r = el.getBoundingClientRect();
        qx((e.clientX - (r.left + r.width / 2)) * 0.28); qy((e.clientY - (r.top + r.height / 2)) * 0.36);
      });
      el.addEventListener('pointerleave', function () { qx(0); qy(0); });
    });
  }

  /* ---------- service cards: arrow buttons ---------- */
  var cards = document.getElementById('cards');
  document.querySelectorAll('.cards-nav button').forEach(function (b) {
    b.addEventListener('click', function () {
      var c = cards.querySelector('.card'); var step = c ? c.getBoundingClientRect().width + 18 : 320;
      cards.scrollBy({ left: step * (+b.getAttribute('data-d')), behavior: reduce ? 'auto' : 'smooth' });
    });
  });
  if (cards) cards.setAttribute('data-lenis-prevent-horizontal', '');

  /* ---------- form: this is a preview, nothing is sent ---------- */
  var f = document.getElementById('quote'), msg = document.getElementById('fmsg');
  if (f && msg && f.hasAttribute('data-preview')) f.addEventListener('submit', function (e) {
    e.preventDefault();
    var bad = [].slice.call(f.querySelectorAll('[required]')).filter(function (i) { return !i.value.trim() || (i.type === 'email' && !/^\S+@\S+\.\S+$/.test(i.value)); })[0];
    if (bad) { msg.textContent = 'Vinsamlegast fylltu út: ' + bad.parentNode.firstChild.textContent.trim().toLowerCase() + '.'; bad.focus(); return; }
    msg.textContent = 'Þetta er prufusíða, svo formið sendir ekki. Á pblondal.is fer fyrirspurnin beint til okkar.';
  });
})();
