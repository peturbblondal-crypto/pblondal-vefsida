/* P. Blöndal – the story on the home page as eight pictures of the same lot, from the first trench to the finished yard.
   Scroll drives one number, t, from 0 to 7 (one chapter each, .ch in index.html). Each picture holds through its chapter,
   and the next one is wiped in across the band between chapters, the way the work moves across the site. The view pans
   slowly over the panorama as you scroll (on a phone it travels across it), with a gentle push-in.
   Reduced motion: no pan or zoom, and the pictures switch at the middle of each step instead of wiping.
   Exposes window.PBStory so page.js drives the intro, the rail and the chapter headings. */
(function () {
  'use strict';
  var story = document.getElementById('story'), stage = document.getElementById('stage'), pics = document.getElementById('pics');
  if (!story || !stage || !pics) { window.PBStory = null; window.dispatchEvent(new Event('pbstory')); return; }
  var reduce = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  var N = 7;
  var base = (document.querySelector('meta[name="pb-pics"]') || {}).content || 'img/afangar/';
  // where the work is in each picture, as a share of its width: the view pans between these as you scroll
  var FOCUS = [0.6, 0.62, 0.3, 0.5, 0.26, 0.45, 0.4, 0.52];
  var FEATHER = 22;   // width of the soft edge of the wipe, % of the band

  var clamp = function (x, a, b) { return x < a ? a : x > b ? b : x; };
  var ramp = function (a, b, x) { return clamp((x - a) / (b - a), 0, 1); };
  var ss = function (x) { return x * x * (3 - 2 * x); };
  var lerp = function (a, b, k) { return a + (b - a) * k; };

  /* ---------- one layer per picture; the first comes with the page, the rest load in order behind it ---------- */
  var wrap = document.createElement('div'); wrap.className = 'pics-in';
  var first = pics.querySelector('img');
  pics.insertBefore(wrap, first); wrap.appendChild(first);
  [].slice.call(pics.querySelectorAll('img')).forEach(function (im) { if (im !== first) im.remove(); });
  var L = [first];
  for (var k = 1; k <= N; k++) {
    var im = document.createElement('img');
    im.alt = ''; im.width = +first.getAttribute('width') || 3148; im.height = +first.getAttribute('height') || 968;
    im.decoding = 'async'; im.style.visibility = 'hidden';
    wrap.appendChild(im); L.push(im);
  }
  var ready = [];
  function load(i) {
    return new Promise(function (res) {
      var im = L[i];
      var done = function () { ready[i] = true; res(); };
      var dec = function () { if (im.decode) im.decode().then(done, done); else done(); };
      if (!im.getAttribute('src')) im.src = base + 'afangi-' + (i + 1) + '.webp';
      if (im.complete && im.naturalWidth) dec(); else { im.onload = dec; im.onerror = done; }
    });
  }
  var firstReady = load(0);
  firstReady.then(function () { var i = 1; (function next() { if (i <= N) load(i++).then(function () { dirty = true; kick(); next(); }); })(); });

  /* ---------- sizing ---------- */
  var S = 1;
  function size() {
    var vh = innerHeight; S = Math.round(vh * 1.25);
    var hpx = (vh + N * S) + 'px';
    if (story.style.height !== hpx) { story.style.height = hpx; window.dispatchEvent(new Event('pb:size')); }
    dirty = true; kick();
  }

  /* ---------- the frame for a given t ---------- */
  var shown = [], lastActive = -1;
  function show(i, on) { if (shown[i] !== on) { shown[i] = on; L[i].style.visibility = on ? 'visible' : 'hidden'; } }
  function setMask(el, v) { el.style.webkitMaskImage = v; el.style.maskImage = v; }
  function focusAt(t) {   // a continuous pan: at each chapter the view rests on that picture's work
    var i = Math.min(N - 1, Math.floor(t));
    return lerp(FOCUS[i], FOCUS[i + 1], ss(ramp(0, 1, t - i)));
  }
  function render(t) {
    var i = Math.min(N - 1, Math.floor(t)), f = t - i, p, x, zoom;
    if (reduce) { var c = Math.round(t); i = c; p = 0; x = FOCUS[c]; zoom = 1; }
    else { p = t >= N ? 0 : ss(ramp(0.3, 0.7, f)); x = focusAt(t) + Math.sin(t * 1.3) * 0.015; zoom = 1.035 + 0.025 * (0.5 - 0.5 * Math.cos(t * 0.9)); }
    if (t >= N && !reduce) i = N;
    var nx = i + 1;
    // the picture behind: wholly shown; the next one: wiped in from the left with a soft edge
    for (var k = 0; k <= N; k++) show(k, k === i || (k === nx && p > 0.001 && ready[k]));
    L[i].style.zIndex = 1; setMask(L[i], 'none');
    if (nx <= N && shown[nx]) {
      L[nx].style.zIndex = 2;
      var e = p * (100 + FEATHER) - FEATHER;
      setMask(L[nx], p > 0.999 ? 'none' : 'linear-gradient(90deg,#000 ' + e.toFixed(2) + '%,transparent ' + (e + FEATHER).toFixed(2) + '%)');
    }
    var pos = (clamp(x, 0, 1) * 100).toFixed(2) + '% 50%';
    for (k = 0; k <= N; k++) if (shown[k]) L[k].style.objectPosition = pos;
    wrap.style.transform = 'scale(' + zoom.toFixed(4) + ')';
    overlays(t);
  }

  /* ---------- chapter text, rail ---------- */
  var chapters = [].slice.call(document.querySelectorAll('.ch'));
  var railBtns = [].slice.call(document.querySelectorAll('.rail button'));
  function overlays(t) {
    chapters.forEach(function (el, i) {
      var d = t - i, o = clamp(1 - Math.abs(d) * 2.3, 0, 1);
      if (i === 0 && t < 0.02) o = 1; if (i === N && t > N - 0.02) o = 1;
      el.style.opacity = o.toFixed(3); if (!reduce) el.style.transform = 'translate3d(0,' + (-d * 60).toFixed(1) + 'px,0)';
      var vis = o > 0.02; if (el._vis !== vis) { el._vis = vis; el.style.visibility = vis ? 'visible' : 'hidden'; }
    });
    var a = Math.round(t);
    if (a !== lastActive) {
      lastActive = a;
      railBtns.forEach(function (b, i) { b.setAttribute('aria-current', i === a ? 'step' : 'false'); });
      window.dispatchEvent(new CustomEvent('pb:chapter', { detail: a }));
    }
  }

  /* ---------- loop: the scroll position eases toward its target; draw only when something moves ---------- */
  var T = 0, target = 0, dirty = true, raf = 0, last = 0;
  function readTarget() { var r = story.getBoundingClientRect(); return clamp(-r.top / S, 0, N); }
  function frame(now) {
    raf = 0;
    var dt = clamp(((now - last) || 16) / 1000, 0.004, 0.05); last = now;
    target = readTarget();
    var moving = Math.abs(target - T) > 0.0004;
    if (moving) T = clamp(T + (target - T) * (reduce ? 1 : 1 - Math.exp(-dt * 8)), 0, N); else T = target;
    var r = story.getBoundingClientRect(), onScreen = r.bottom > 0 && r.top < innerHeight;
    if (onScreen && (moving || dirty)) { render(T); dirty = false; }
    if (moving) raf = requestAnimationFrame(frame);
  }
  function kick() { if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame); } }
  addEventListener('scroll', kick, { passive: true });
  addEventListener('resize', size);

  /* ---------- intro: the first picture fades up ---------- */
  function build(ms) {
    return firstReady.then(function () {
      pics.classList.add('in'); dirty = true; kick();
      if (reduce || !ms) return;
      return new Promise(function (res) { setTimeout(res, Math.min(ms, 1200)); });
    });
  }

  size();
  T = target = readTarget();
  render(T);
  // testing hook (only with ?nosnap): jump straight to the scroll position without easing
  if (/nosnap/.test(location.search)) window.__pbDev = { redraw: function () { dirty = true; kick(); }, jump: function () { T = target = readTarget(); dirty = true; kick(); } };
  window.PBStory = {
    prepare: function () { dirty = true; kick(); },
    build: build,
    snapshots: function () {},
    chapterTop: function (i) { return story.getBoundingClientRect().top + scrollY + i * S + 2; },
    get S() { return S; }
  };
  window.dispatchEvent(new Event('pbstory'));
})();
