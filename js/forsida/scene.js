/* P. Blöndal – a realistic lot, one continuous camera move driven by scroll.
   Chapters (t): 0 house at golden hour · 1 sidewalk · 2 lawn · 3 driveway · 4 foundation · 5 pipes · 6 finished, golden hour.
   Everything is built in code from boxes, tubes and cards; surfaces use tileable textures mapped in world space. */
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const root = document.documentElement;
const story = document.getElementById('story');
const stage = document.getElementById('stage');
const canvas = document.getElementById('scene');
const labelsEl = document.getElementById('labels');
const reduce = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
const N = 6;
const TEXBASE = (document.querySelector('meta[name="pb-tex"]') || {}).content || 'tex/';

function fail(e) {
  if (e) console.warn('3D off:', e);
  root.classList.remove('story-on'); root.classList.add('no3d'); if (story) story.style.height = '';
  window.PBStory = null; window.dispatchEvent(new Event('pbstory'));
}
function webgl2() { try { return !!document.createElement('canvas').getContext('webgl2'); } catch (e) { return false; } }

/* ---------- small helpers ---------- */
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const ramp = (a, b, x) => clamp((x - a) / (b - a), 0, 1);
const ss = (x) => x * x * (3 - 2 * x);
const sm = (a, b, x) => ss(ramp(a, b, x));
const bump = (a, b, c, d, x) => sm(a, b, x) * (1 - sm(c, d, x));
const lerp = (a, b, k) => a + (b - a) * k;
const easeOutCubic = (x) => 1 - Math.pow(1 - x, 3);
function layers(x, n) { if (x >= 1) return 1; const f = x * n, i = Math.floor(f); return (i + ss(clamp((f - i) * 1.7, 0, 1))) / n; }
function rnd(seed) { let s = seed % 2147483647; if (s <= 0) s += 2147483646; return () => (s = (s * 16807) % 2147483647) / 2147483647; }
const C = (hex) => new THREE.Color(hex);
const R = (x0, x1, z0, z1) => ({ x0, x1, z0, z1 });
const inside = (r, x, z) => x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1;

if (!story || !webgl2()) fail('no webgl2');
else build().catch(fail);

async function build() {
  root.classList.add('story-on');
  const small = Math.min(screen.width, screen.height) < 700;
  const mobile = () => stage.clientWidth / Math.max(1, stage.clientHeight) < 0.85;

  /* ---------- renderer ---------- */
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, stencil: false, powerPreference: 'high-performance', preserveDrawingBuffer: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.62;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const maxAniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.25, 12000);
  camera.layers.enable(2); camera.layers.enable(3);

  /* ---------- textures (all tileable, mapped in metres) ---------- */
  const NAMES = ['grass', 'grass_n', 'dirt', 'dirt_n', 'pavers', 'pavers_n', 'concrete', 'concrete_n', 'asphalt', 'asphalt_n',
    'timber', 'timber_n', 'render', 'render_n', 'deck', 'deck_n', 'mold', 'mold_n', 'fill', 'fill_n', 'base', 'base_n',
    'sand', 'sand_n', 'clay', 'clay_n', 'rock', 'rock_n', 'gravel', 'gravel_n', 'hedge', 'hedge_n', 'bark', 'leaves'];
  const IMG = {};
  await Promise.all(NAMES.map((n) => new Promise((res, rej) => {
    const im = new Image(); im.decoding = 'async';
    im.onload = () => { IMG[n] = im; res(); }; im.onerror = () => rej(new Error('texture ' + n));
    im.src = TEXBASE + n + '.webp';
  })));
  function tex(n, metres, data) {
    const t = new THREE.Texture(IMG[n]);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    if (metres) t.repeat.set(1 / metres, 1 / metres);
    t.anisotropy = maxAniso;
    t.colorSpace = data ? THREE.NoColorSpace : THREE.SRGBColorSpace;
    t.needsUpdate = true;
    return t;
  }

  /* ---------- shader patches: world-space box UVs, a height scan that dissolves things, a noise mask ---------- */
  const NOISE = `
    float pbH(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
    float pbN(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
      return mix(mix(pbH(i), pbH(i + vec2(1.0, 0.0)), f.x), mix(pbH(i + vec2(0.0, 1.0)), pbH(i + vec2(1.0, 1.0)), f.x), f.y); }`;
  const SCAN = { cut: { value: 99 }, edge: { value: 0.3 }, glow: { value: new THREE.Color('#f90160').multiplyScalar(3.4) } };
  const RAW = { v: { value: 0 } };   // 0 = finished surfaces, 1 = stripped to soil and gravel
  function patch(mat, o) {
    o = o || {};
    const key = 'pb' + (o.box ? 'B' : '') + (o.scan ? 'S' : '') + (o.mask ? 'M' : '') + (o.depth ? 'D' : '');
    mat.customProgramCacheKey = () => key;
    mat.onBeforeCompile = (sh) => {
      if (o.scan) { sh.uniforms.uCut = SCAN.cut; sh.uniforms.uEdge = SCAN.edge; sh.uniforms.uGlow = SCAN.glow; }
      if (o.mask) sh.uniforms.uMask = o.mask.v;
      let v = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vDWP;');
      let box = '';
      if (o.box) box = `
        vec3 dwn = normalize(mat3(modelMatrix) * objectNormal);
        vec2 buv = abs(dwn.y) > 0.5 ? vec2(dwp.x, -dwp.z) : (abs(dwn.x) > 0.5 ? vec2(-dwp.z * sign(dwn.x), dwp.y + 0.37) : vec2(dwp.x * sign(dwn.z), dwp.y + 0.37));
        #ifdef USE_MAP
          vMapUv = (mapTransform * vec3(buv, 1.0)).xy;
        #endif
        #ifdef USE_NORMALMAP
          vNormalMapUv = (normalMapTransform * vec3(buv, 1.0)).xy;
        #endif`;
      v = v.replace('#include <project_vertex>', `#include <project_vertex>
        vec4 dwp = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          dwp = instanceMatrix * dwp;
        #endif
        dwp = modelMatrix * dwp; vDWP = dwp.xyz;` + box);
      sh.vertexShader = v;
      let decl = '\nvarying vec3 vDWP;\n' + NOISE;
      if (o.scan) decl += '\nuniform float uCut; uniform float uEdge; uniform vec3 uGlow;';
      if (o.mask) decl += '\nuniform float uMask;';
      let cut = '';
      if (o.scan) cut += `
        float dN = pbN(vDWP.xz * 1.3) * 0.5 + pbN(vDWP.xz * 4.7 + 7.0) * 0.22;
        float dHh = vDWP.y + dN;
        if (dHh > uCut) discard;
        float dGlow = 1.0 - smoothstep(0.0, uEdge, uCut - dHh);`;
      if (o.mask) cut += `
        float mN = pbN(vDWP.xz * 0.42) * 0.62 + pbN(vDWP.xz * 1.9 + 3.0) * 0.30 + pbN(vDWP.xz * 7.0) * 0.08;
        if (mN < uMask) discard;`;
      let f = sh.fragmentShader.replace('#include <common>', '#include <common>' + decl)
        .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>' + cut);
      if (o.scan && !o.depth) f = f.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += uGlow * dGlow;');
      sh.fragmentShader = f;
    };
    return mat;
  }
  const depthScan = patch(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }), { scan: true, depth: true });
  const depthMask = patch(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }), { mask: RAW, depth: true });

  /* ---------- materials ---------- */
  function std(o) {
    const m = new THREE.MeshStandardMaterial({ color: o.c != null ? o.c : 0xffffff, roughness: o.r != null ? o.r : 0.9, metalness: o.m || 0 });
    if (o.map) m.map = o.map;
    if (o.n) { m.normalMap = o.n; m.normalScale.set(o.ns || 1, o.ns || 1); }
    if (o.e) { m.emissive = C(o.e); m.emissiveIntensity = o.ei != null ? o.ei : 1; }
    if (o.env != null) m.envMapIntensity = o.env;
    if (o.side) m.side = o.side;
    return patch(m, { box: o.box !== false && (o.map || o.n), scan: o.scan, mask: o.mask });
  }
  const TX = {
    grass: tex('grass', 3), grassN: tex('grass_n', 3, 1), dirt: tex('dirt', 1.6), dirtN: tex('dirt_n', 1.6, 1),
    pav: tex('pavers', 2.4), pavN: tex('pavers_n', 2.4, 1), conc: tex('concrete', 2), concN: tex('concrete_n', 2, 1),
    asph: tex('asphalt', 4), asphN: tex('asphalt_n', 4, 1), timber: tex('timber', 2.4), timberN: tex('timber_n', 2.4, 1),
    render: tex('render', 2), renderN: tex('render_n', 2, 1), deck: tex('deck', 2.4), deckN: tex('deck_n', 2.4, 1),
    mold: tex('mold', 1), moldN: tex('mold_n', 1, 1), fill: tex('fill', 1.2), fillN: tex('fill_n', 1.2, 1),
    base: tex('base', 1), baseN: tex('base_n', 1, 1), sand: tex('sand', 1), sandN: tex('sand_n', 1, 1),
    clay: tex('clay', 1.4), clayN: tex('clay_n', 1.4, 1), rock: tex('rock', 2), rockN: tex('rock_n', 2, 1),
    gravel: tex('gravel', 1), gravelN: tex('gravel_n', 1, 1), hedge: tex('hedge', 1), hedgeN: tex('hedge_n', 1, 1),
    farGrass: tex('grass', 7), farGrassN: tex('grass_n', 7, 1), roofG: tex('gravel', 1.6)
  };
  const bark = tex('bark'); bark.repeat.set(1, 1);
  const leavesT = tex('leaves'); leavesT.wrapS = leavesT.wrapT = THREE.ClampToEdgeWrapping;

  // ground layers: top material and side material per layer (they fade together in the x-ray)
  const SOILMATS = [];
  function soil(o) { const m = std(Object.assign({ r: 0.97 }, o)); SOILMATS.push(m); return m; }
  const G = {
    turf: soil({ map: TX.grass, n: TX.grassN, ns: 0.7, mask: RAW, r: 0.95 }),
    turfS: soil({ map: TX.mold, n: TX.moldN, mask: RAW }),
    mold: soil({ map: TX.dirt, n: TX.dirtN }), moldS: soil({ map: TX.mold, n: TX.moldN }),
    fill: soil({ map: TX.fill, n: TX.fillN }), clay: soil({ map: TX.clay, n: TX.clayN }), rock: soil({ map: TX.rock, n: TX.rockN, r: 0.85 }),
    base: soil({ map: TX.base, n: TX.baseN }), sand: soil({ map: TX.sand, n: TX.sandN }), gravel: soil({ map: TX.gravel, n: TX.gravelN }),
    conc: soil({ map: TX.conc, n: TX.concN, ns: 0.6, mask: RAW, r: 0.88 }),
    pav: soil({ map: TX.pav, n: TX.pavN, ns: 0.9, mask: RAW, r: 0.86 }),
    asph: soil({ map: TX.asph, n: TX.asphN, r: 0.92 }),
    pubw: soil({ map: TX.conc, n: TX.concN, ns: 0.5, c: 0xe6e3dd, r: 0.9 }),
    curb: soil({ map: TX.conc, n: TX.concN, ns: 0.4, c: 0xc9c6c0, r: 0.85 }),
    stripe: soil({ c: 0xe9e3d6, r: 0.6 })
  };
  // outside the lot: the same looks, never see-through
  const O = {
    grass: std({ map: TX.farGrass, n: TX.farGrassN, ns: 0.6, r: 0.96, c: 0xe8eadc }),
    asph: std({ map: TX.asph, n: TX.asphN, r: 0.92 }),
    walk: std({ map: TX.conc, n: TX.concN, ns: 0.5, c: 0xe6e3dd }),
    curb: std({ map: TX.conc, n: TX.concN, ns: 0.4, c: 0xc9c6c0 }),
    pav: std({ map: TX.pav, n: TX.pavN, ns: 0.9, r: 0.86 }),
    hedge: std({ map: TX.hedge, n: TX.hedgeN, ns: 1.2, r: 0.9 })
  };
  const H = {   // the house and garden: dissolve with the scan
    render: std({ map: TX.render, n: TX.renderN, ns: 0.6, r: 0.92, scan: 1, c: 0xf4f2ee }),
    timber: std({ map: TX.timber, n: TX.timberN, ns: 1.0, r: 0.78, scan: 1 }),
    plaster: std({ map: TX.render, c: 0xd9cfc2, r: 0.95, env: 0.28, scan: 1 }),
    oak: std({ map: TX.deck, n: TX.deckN, ns: 0.4, c: 0xd0a77e, r: 0.6, env: 0.32, scan: 1 }),
    fascia: std({ c: 0x2a2c2f, r: 0.45, m: 0.55, scan: 1 }),
    frame: std({ c: 0x1b1c1e, r: 0.4, m: 0.6, scan: 1 }),
    roof: std({ map: TX.roofG, n: TX.gravelN, ns: 0.8, c: 0x6d6c69, r: 0.95, scan: 1 }),
    door: std({ map: TX.timber, n: TX.timberN, ns: 0.6, c: 0xb98a63, r: 0.6, scan: 1 }),
    gdoor: std({ c: 0x34373b, r: 0.42, m: 0.5, scan: 1 }),
    groove: std({ c: 0x1c1d20, r: 0.6, m: 0.3, scan: 1 }),
    fabric: std({ c: 0x6f6b66, r: 0.95, env: 0.3, scan: 1 }),
    rug: std({ c: 0xa49a8c, r: 1.0, env: 0.3, scan: 1 }),
    art: std({ c: 0x1f3b4d, r: 0.7, env: 0.35, scan: 1 }),
    lamp: std({ c: 0x2a2620, e: '#ffb46b', ei: 0, r: 0.6, scan: 1 }),
    bulb: std({ c: 0xfff1d6, e: '#ffc98a', ei: 0, r: 0.4, scan: 1 }),
    steel: std({ c: 0x232528, r: 0.38, m: 0.7, scan: 1 }),
    deck: std({ map: TX.deck, n: TX.deckN, ns: 0.9, r: 0.82, scan: 1 }),
    slat: std({ map: TX.deck, n: TX.deckN, ns: 0.6, c: 0xbfa98f, r: 0.82, scan: 1 }),
    water: patch(new THREE.MeshPhysicalMaterial({ color: 0x0d3b46, roughness: 0.06, metalness: 0, ior: 1.33, envMapIntensity: 1.2, emissive: C('#2fb6c9'), emissiveIntensity: 0 }), { scan: 1 }),
    hedge: std({ map: TX.hedge, n: TX.hedgeN, ns: 1.2, r: 0.9, scan: 1 }),
    bark: patch(new THREE.MeshStandardMaterial({ map: bark, roughness: 0.85 }), { scan: 1 }),
    leaves: patch(new THREE.MeshStandardMaterial({ map: leavesT, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.75, color: 0xdfe8c8 }), { scan: 1 }),
    stone: std({ map: TX.conc, n: TX.concN, ns: 0.6, c: 0xbab6af, r: 0.85, scan: 1 })
  };
  const glass = patch(new THREE.MeshPhysicalMaterial({
    color: 0x0a0e10, roughness: 0.035, metalness: 0, ior: 1.52, envMapIntensity: 1.35, transparent: true, opacity: 0.8,
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, depthWrite: false
  }), { scan: 1 });
  const leafDepth = patch(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: leavesT, alphaTest: 0.45 }), { scan: true, depth: true });
  const foot = std({ map: TX.conc, n: TX.concN, ns: 0.7, c: 0xb9b5ae, r: 0.9 });
  const padMat = std({ map: TX.gravel, n: TX.gravelN, ns: 1.0, c: 0xc9c2b6 });
  SOILMATS.push(padMat);
  const pipeMats = {};

  /* ---------- geometry builders ---------- */
  const world = new THREE.Group(); scene.add(world);
  const UNIT = new THREE.BoxGeometry(1, 1, 1);
  function setBox(m, x0, x1, y0, y1, z0, z1) {
    const h = y1 - y0; m.visible = h > 0.002; if (!m.visible) return;
    m.scale.set(x1 - x0, h, z1 - z0); m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  }
  function bx(x0, x1, y0, y1, z0, z1) { const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0); g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); return g; }
  // collects geometry per material and merges it into one mesh each
  function Bag() { this.g = new Map(); }
  Bag.prototype.add = function (mat, geo) { if (!this.g.has(mat)) this.g.set(mat, []); this.g.get(mat).push(geo); return geo; };
  Bag.prototype.box = function (mat, x0, x1, y0, y1, z0, z1) { return this.add(mat, bx(x0, x1, y0, y1, z0, z1)); };
  Bag.prototype.build = function (parent, o) {
    o = o || {}; const out = [];
    this.g.forEach((list, mat) => {
      const geo = mergeGeometries(list.map((g) => (g.index ? g : g)), false);
      const m = new THREE.Mesh(geo, mat); m.castShadow = o.cast !== false; m.receiveShadow = true;
      if (o.depth) m.customDepthMaterial = o.depth;
      if (o.layer) { m.layers.set(o.layer); }
      parent.add(m); out.push(m);
    });
    return out;
  };

  /* ---------- the lot layout ---------- */
  // Lot x -16..16, z -13..11; street (sidewalk, curb, road, curb, sidewalk) z 11..22.4.
  const HOUSE = R(-3, 11, -10, -2), GAR = R(-10, -3, -9, -2), UPPER = R(-1.5, 8.5, -10.5, -1.0);
  const DECK = R(11.3, 15.0, -9.5, -1.6);
  const SAMPLE = { stett: R(5, 8.5, 0, 2.5), gras: R(7, 10, 5, 8), hellur: R(-8.1, -5.1, 4.95, 7.95) };
  const PIT = [
    { r: R(-12, 13, -12, -10), type: 'lawn' }, { r: R(-12, -10, -10, 0), type: 'lawn' }, { r: R(11, 13, -10, 0), type: 'deckbed' },
    { r: R(-10, -3, -10, -9), type: 'lawn' }, { r: R(-10, -3, -2, 0), type: 'hellur' }, { r: R(-3, 11, -2, 0), type: 'stett' }
  ];
  const AREAS = [
    { r: R(-3, 11, 0, 2.5), type: 'stett' }, { r: R(0, 1.8, 2.5, 11), type: 'stett' },
    { r: R(-10, -3, 0, 11), type: 'hellur' }, { r: R(11.3, 15.0, -9.5, -1.6), type: 'deckbed' },
    { r: R(-16, 16, 11, 13), type: 'pubwalk' }, { r: R(-16, 16, 13, 13.2), type: 'curb' }, { r: R(-16, 16, 13.2, 20.2), type: 'road' },
    { r: R(-16, 16, 20.2, 20.4), type: 'curb2' }, { r: R(-16, 16, 20.4, 22.4), type: 'pubwalk' }
  ];
  const DEEP = [['fill', -1.5, -0.5], ['clay', -2.8, -1.5], ['rock', -4.5, -2.8]];
  const STRATA = {
    lawn: [['turf', -0.06, 0], ['mold', -0.32, -0.06], ['fill', -1.5, -0.32], ['clay', -2.8, -1.5], ['rock', -4.5, -2.8]],
    stett: [['conc', -0.12, 0], ['base', -0.5, -0.12]].concat(DEEP),
    hellur: [['pav', -0.06, 0], ['sand', -0.09, -0.06], ['base', -0.5, -0.09]].concat(DEEP),
    deckbed: [['gravel', -0.15, 0], ['base', -0.5, -0.15]].concat(DEEP),
    pubwalk: [['pubw', -0.1, 0], ['base', -0.6, -0.1], ['fill', -1.5, -0.6], ['clay', -2.8, -1.5], ['rock', -4.5, -2.8]],
    curb: [['curb', -0.45, 0], ['fill', -1.5, -0.45], ['clay', -2.8, -1.5], ['rock', -4.5, -2.8]],
    curb2: [['curb', -0.45, 0], ['fill', -1.5, -0.45], ['clay', -2.8, -1.5], ['rock', -4.5, -2.8]],
    road: [['asph', -0.2, -0.12], ['base', -0.7, -0.2], ['fill', -1.5, -0.7], ['clay', -2.8, -1.5], ['rock', -4.5, -2.8]],
    foot: [['clay', -2.8, -1.6], ['rock', -4.5, -2.8]]
  };
  const TOPM = { turf: G.turf, mold: G.mold }, SIDEM = { turf: G.turfS, mold: G.moldS };
  const topMat = (k) => TOPM[k] || G[k], sideMat = (k) => SIDEM[k] || G[k];
  const SOLID = [HOUSE, GAR, SAMPLE.stett, SAMPLE.gras, SAMPLE.hellur].concat(PIT.map((p) => p.r));

  // static ground: a grid of columns, faces shared by two equal neighbours are dropped so the x-ray stays clean
  (function () {
    let xs = [-16, 16], zs = [-13, 22.4];
    SOLID.concat(AREAS.map((a) => a.r)).forEach((r) => { xs.push(r.x0, r.x1); zs.push(r.z0, r.z1); });
    const uniq = (a) => a.filter((v, i) => a.indexOf(v) === i).sort((p, q) => p - q);
    xs = uniq(xs).filter((v) => v >= -16 && v <= 16); zs = uniq(zs).filter((v) => v >= -13 && v <= 22.4);
    const boxes = [];
    for (let i = 0; i < xs.length - 1; i++) for (let j = 0; j < zs.length - 1; j++) {
      const cx = (xs[i] + xs[i + 1]) / 2, cz = (zs[j] + zs[j + 1]) / 2;
      if (SOLID.some((r) => inside(r, cx, cz))) continue;
      const a = AREAS.filter((q) => inside(q.r, cx, cz))[0];
      STRATA[a ? a.type : 'lawn'].forEach((s) => boxes.push({ k: s[0], x0: xs[i], x1: xs[i + 1], y0: s[1], y1: s[2], z0: zs[j], z1: zs[j + 1] }));
    }
    [HOUSE, GAR].forEach((r) => STRATA.foot.forEach((s) => boxes.push({ k: s[0], x0: r.x0, x1: r.x1, y0: s[1], y1: s[2], z0: r.z0, z1: r.z1 })));
    // faces: count identical side faces; a pair means an inner wall that never shows
    const faces = new Map();
    const fkey = (ax, c, a0, a1, y0, y1, k) => ax + c.toFixed(3) + ':' + a0.toFixed(3) + ':' + a1.toFixed(3) + ':' + y0.toFixed(3) + ':' + y1.toFixed(3) + ':' + k;
    boxes.forEach((b) => {
      b.f = [fkey('x', b.x1, b.z0, b.z1, b.y0, b.y1, b.k), fkey('x', b.x0, b.z0, b.z1, b.y0, b.y1, b.k), fkey('z', b.z1, b.x0, b.x1, b.y0, b.y1, b.k), fkey('z', b.z0, b.x0, b.x1, b.y0, b.y1, b.k)];
      b.f.forEach((k) => faces.set(k, (faces.get(k) || 0) + 1));
    });
    const geo = new Map();
    const push = (mat, quad, n) => { if (!geo.has(mat)) geo.set(mat, { p: [], n: [] }); const g = geo.get(mat); for (const v of [0, 1, 2, 0, 2, 3]) { g.p.push(...quad[v]); g.n.push(...n); } };
    boxes.forEach((b) => {
      const { x0, x1, y0, y1, z0, z1 } = b, side = sideMat(b.k);
      if (faces.get(b.f[0]) < 2) push(side, [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]], [1, 0, 0]);
      if (faces.get(b.f[1]) < 2) push(side, [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], [-1, 0, 0]);
      if (faces.get(b.f[2]) < 2) push(side, [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], [0, 0, 1]);
      if (faces.get(b.f[3]) < 2) push(side, [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]], [0, 0, -1]);
      push(topMat(b.k), [[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]], [0, 1, 0]);
    });
    // road markings: none on a residential street in Iceland, but a manhole and a gully
    geo.forEach((g, mat) => {
      const bg = new THREE.BufferGeometry();
      bg.setAttribute('position', new THREE.Float32BufferAttribute(g.p, 3));
      bg.setAttribute('normal', new THREE.Float32BufferAttribute(g.n, 3));
      const m = new THREE.Mesh(bg, mat); m.receiveShadow = true; m.castShadow = false; m.renderOrder = mat === G.turf || mat === G.conc || mat === G.pav || mat === G.asph || mat === G.pubw || mat === G.curb ? 1 : 3;
      if (mat === G.turf || mat === G.conc || mat === G.pav || mat === G.turfS) m.customDepthMaterial = depthMask;
      world.add(m);
    });
  })();

  /* ---------- surroundings: lawns, the street both ways, neighbours, far houses, Esja ---------- */
  const env = new THREE.Group(); scene.add(env);
  (function () {
    const plane = (mat, x0, x1, z0, z1, y) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), mat); m.rotation.x = -Math.PI / 2; m.position.set((x0 + x1) / 2, y, (z0 + z1) / 2); m.receiveShadow = true; env.add(m); };
    const F = 5200;
    plane(O.grass, -F, -16, -F, 11, 0); plane(O.grass, 16, F, -F, 11, 0); plane(O.grass, -16, 16, -F, -13, 0); plane(O.grass, -F, F, 22.4, F, 0);
    plane(O.walk, -F, -16, 11, 13, 0); plane(O.walk, 16, F, 11, 13, 0); plane(O.walk, -F, -16, 20.4, 22.4, 0); plane(O.walk, 16, F, 20.4, 22.4, 0);
    plane(O.asph, -F, -16, 13.2, 20.2, -0.12); plane(O.asph, 16, F, 13.2, 20.2, -0.12);
    const b = new Bag();
    [[-F, -16], [16, F]].forEach(([a, c]) => { b.box(O.curb, a, c, -0.12, 0, 13, 13.2); b.box(O.curb, a, c, -0.12, 0, 20.2, 20.4); });
    b.build(env, { cast: false });
  })();

  // neighbours: same family of modern houses, simplified
  const lightsDusk = [];   // emissive materials that switch on at dusk: [material, intensity]
  const winGlow = std({ c: 0x141617, e: '#ffbf80', ei: 0, r: 0.2, env: 0.9 });
  lightsDusk.push([winGlow, 1.6]);
  function simpleHouse(bag, x, z, w, d, flip, seed) {
    const r = rnd(seed);
    const h1 = 3.1, h2 = r() > 0.4 ? 6.1 : 0;
    bag.box(O.walk, x, x + w, 0, 0.3, z, z + d);
    bag.box(neighbourRender, x, x + w, 0.3, h1, z, z + d);
    bag.box(neighbourFascia, x - 0.05, x + w + 0.05, h1, h1 + 0.3, z - 0.05, z + d + 0.05);
    if (h2) { const ux = x + w * 0.15, uw = w * 0.6; bag.box(r() > 0.5 ? neighbourTimber : neighbourRender, ux, ux + uw, h1 + 0.3, h2, z - 0.4, z + d * 0.8); bag.box(neighbourFascia, ux - 0.05, ux + uw + 0.05, h2, h2 + 0.25, z - 0.45, z + d * 0.8 + 0.05); }
    const front = z + d + 0.01, n = Math.max(2, Math.round(w / 3.4));
    for (let i = 0; i < n; i++) { const wx = x + 0.8 + i * (w - 1.6) / n; bag.box(r() > 0.45 ? winGlow : neighbourGlass, wx, wx + (w - 1.6) / n - 0.5, 0.9, 2.6, front, front + 0.02); }
    if (h2) bag.box(r() > 0.5 ? winGlow : neighbourGlass, x + w * 0.2, x + w * 0.6, h1 + 1.0, h2 - 0.6, z + d * 0.8 + 0.01, z + d * 0.8 + 0.03);
  }
  const neighbourRender = std({ map: TX.render, n: TX.renderN, c: 0xe9e6df, r: 0.92 });
  const neighbourTimber = std({ map: TX.timber, n: TX.timberN, r: 0.8, c: 0xb8aa98 });
  const neighbourFascia = std({ c: 0x2c2e31, r: 0.5, m: 0.5 });
  const neighbourGlass = std({ c: 0x101315, r: 0.08, env: 1.4 });
  (function () {
    const b = new Bag();
    simpleHouse(b, -34, -11, 13, 8, false, 3);
    simpleHouse(b, 21.5, -12, 12, 8.5, true, 7);
    // driveways and hedges next door
    b.box(O.pav, -31, -25, 0, 0.005, -3, 11); b.box(O.pav, 24, 30, 0, 0.005, -3.5, 11);
    b.box(O.hedge, -18.6, -17.8, 0, 1.25, -12.5, 9); b.box(O.hedge, 17.8, 18.6, 0, 1.3, -12.5, 9);
    // a street of houses further back, faded by the haze
    const r = rnd(11);
    for (let i = 0; i < 16; i++) {
      const x = -120 + i * 16 + r() * 6, z = -32 - r() * 34 - (i % 3) * 12;
      simpleHouse(b, x, z, 9 + r() * 6, 7 + r() * 3, false, 20 + i);
    }
    b.build(env);
  })();

  // a suburb fading into the haze: instanced houses, flat roofs, trees, and windows that light up at dusk
  const FARWIN_DAY = new THREE.Color(0x1d2226), FARWIN_DUSK = new THREE.Color(0xffc27a).multiplyScalar(1.8);
  const farWin = new THREE.MeshBasicMaterial({ color: 0x1d2226 });
  (function () {
    const r = rnd(77), n = small ? 700 : 1400, nt = small ? 500 : 1100;
    const box = new THREE.BoxGeometry(1, 1, 1); box.translate(0, 0.5, 0);
    const houses = new THREE.InstancedMesh(box, new THREE.MeshStandardMaterial({ roughness: 0.9 }), n);
    const roofs = new THREE.InstancedMesh(box, new THREE.MeshStandardMaterial({ color: 0x2d2f33, roughness: 0.75 }), n);
    const wins = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), farWin, n * 2);
    const tg = new THREE.IcosahedronGeometry(1, 1); tg.translate(0, 1, 0);
    const trees = new THREE.InstancedMesh(tg, new THREE.MeshStandardMaterial({ color: 0x3b4d2f, roughness: 0.95 }), nt);
    const pal = [0xd8d4cc, 0xc9c4ba, 0xbdb5a8, 0x4a4038, 0xa9b1b6, 0xd2ccbf, 0x8d8a85, 0xb7a58e].map((h) => new THREE.Color(h).multiplyScalar(0.82));
    const roofPal = [0x7a2e26, 0x3f5a46, 0x4b5560, 0x2d2f33, 0x2d2f33, 0x6d3b2e].map((h) => new THREE.Color(h));
    const gable = new THREE.BufferGeometry(); gable.setAttribute('position', new THREE.Float32BufferAttribute([-0.5,0,-0.5, 0.5,0,-0.5, 0,1,-0.5,  0.5,0,0.5, -0.5,0,0.5, 0,1,0.5,  -0.5,0,0.5, -0.5,0,-0.5, 0,1,-0.5,  -0.5,0,0.5, 0,1,-0.5, 0,1,0.5,  0.5,0,-0.5, 0.5,0,0.5, 0,1,0.5,  0.5,0,-0.5, 0,1,0.5, 0,1,-0.5], 3)); gable.computeVertexNormals();
    const peaks = new THREE.InstancedMesh(gable, new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0.3, side: THREE.DoubleSide }), n); let pi = 0;
    const o = new THREE.Object3D(), c = new THREE.Color();
    let hi = 0, wi = 0;
    for (let i = 0; i < n * 3 && hi < n; i++) {
      const d = 95 + Math.pow(r(), 1.4) * 1250, x = (r() - 0.5) * 2 * (180 + d * 1.3), z = -d - 15;
      if (Math.abs(x) < 46 && z > -80) continue;
      const w = 9 + r() * 7, dd = 7 + r() * 4, h = r() > 0.55 ? 6 + r() * 1.2 : 3.1 + r() * 0.6, rot = Math.round(r()) * Math.PI / 2 + (r() - 0.5) * 0.12;
      o.position.set(x, 0, z); o.rotation.set(0, rot, 0); o.scale.set(w, h, dd); o.updateMatrix(); houses.setMatrixAt(hi, o.matrix);
      houses.setColorAt(hi, c.copy(pal[Math.floor(r() * pal.length)]).multiplyScalar(0.9 + r() * 0.15));
      if (r() < 0.5) { o.position.set(x, h, z); o.scale.set(dd + 0.6, 1.4 + r() * 1.2, w + 0.4); o.rotation.set(0, rot + Math.PI / 2, 0); o.updateMatrix(); peaks.setMatrixAt(pi, o.matrix); peaks.setColorAt(pi++, roofPal[Math.floor(r() * roofPal.length)]); o.rotation.set(0, rot, 0); o.scale.set(0.001, 0.001, 0.001); }
      else { o.position.set(x, h, z); o.scale.set(w + 0.3, 0.32, dd + 0.3); }
      o.updateMatrix(); roofs.setMatrixAt(hi, o.matrix);
      for (let k = 0; k < 2 && wi < n * 2; k++) if (r() < 0.65) {
        const lx = (r() - 0.5) * w * 0.6, ly = 1.2 + (h > 5 && r() > 0.5 ? 3 : 0);
        o.position.set(x + Math.cos(rot) * lx + Math.sin(rot) * (dd / 2 + 0.05), ly + 0.6, z - Math.sin(rot) * lx + Math.cos(rot) * (dd / 2 + 0.05));
        o.rotation.set(0, rot, 0); o.scale.set(1.6, 1.1, 1); o.updateMatrix(); wins.setMatrixAt(wi++, o.matrix);
      }
      hi++;
    }
    houses.count = roofs.count = hi; wins.count = wi; peaks.count = pi;
    let ti = 0;
    for (let i = 0; i < nt * 2 && ti < nt; i++) {
      const d = 110 + Math.pow(r(), 1.3) * 1100, x = (r() - 0.5) * 2 * (150 + d * 1.3), z = -d - 12;
      if (Math.abs(x) < 60 && z > -130) continue;
      const sc = 1.1 + r() * 1.5; o.position.set(x, 0, z); o.rotation.set(0, r() * 6, 0); o.scale.set(sc, sc * (1.2 + r() * 0.8), sc); o.updateMatrix(); trees.setMatrixAt(ti++, o.matrix);
    }
    trees.count = ti;
    [houses, roofs, wins, trees, peaks].forEach((m) => { m.castShadow = false; m.receiveShadow = false; env.add(m); });
  })();

  // Esja on the horizon: a long flat-topped ridge with snow in the gullies, unlit and hazed
  const esjaMat = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false });
  (function () {
    const nx = 220, nd = 14, W = 9000, D = 1100, z0 = -3700;
    const g = new THREE.PlaneGeometry(W, D, nx, nd); g.rotateX(-Math.PI / 2);
    const p = g.attributes.position, col = [];
    const prof = (x) => {
      const u = (x + W / 2) / W;   // 0..1 west to east
      let h = 760 * sm(0.08, 0.28, u) * (1 - sm(0.78, 0.96, u)) + 260 * sm(0.0, 0.2, u);
      h += 90 * Math.sin(u * 37) * Math.sin(u * 11.0) + 40 * Math.sin(u * 91);
      h -= 120 * Math.exp(-Math.pow((u - 0.47) / 0.02, 2)) + 80 * Math.exp(-Math.pow((u - 0.63) / 0.015, 2));
      return Math.max(0, h) * 0.2;
    };
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), dz = p.getZ(i) + D / 2;   // 0 at the front edge
      const k = sm(0, 380, D - dz), y = prof(x) * k;
      p.setY(i, y); p.setZ(i, z0 - (D - dz));
      const gully = 0.5 + 0.5 * Math.sin(x * 0.013 + Math.sin(x * 0.004) * 3);
      const snow = clamp((y - 90) / 50, 0, 1) * (gully > 0.62 ? 1 : 0.25);
      const c = new THREE.Color().setRGB(0.20, 0.23, 0.29).lerp(new THREE.Color(0.80, 0.83, 0.88), snow).lerp(new THREE.Color(0.55, 0.6, 0.68), 0.55);
      col.push(c.r, c.g, c.b);
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.computeVertexNormals();
    const m = new THREE.Mesh(g, esjaMat); env.add(m);
  })();

  /* ---------- pavers for the driveway sample: real bricks so they can be laid one by one ---------- */
  const pavGeo = new RoundedBoxGeometry(0.2955, 0.06, 0.1455, 2, 0.007);
  const pavMat = std({ n: TX.concN, ns: 0.35, r: 0.86, mask: RAW, box: true });
  pavMat.normalMap = TX.concN; SOILMATS.push(pavMat);
  const pavList = [];
  (function () {
    const s = SAMPLE.hellur;
    for (let j = Math.round(s.z0 / 0.15); j * 0.15 < s.z1 - 1e-6; j++) {
      const z = j * 0.15 + 0.075, off = (((j % 2) + 2) % 2) * 0.15;
      for (let k = Math.floor((s.x0 + off) / 0.3) - 1; k * 0.3 - off < s.x1; k++) {
        const a = Math.max(s.x0, k * 0.3 - off), b = Math.min(s.x1, k * 0.3 - off + 0.3);
        if (b - a < 0.05) continue;
        pavList.push([(a + b) / 2, z, (b - a) / 0.3]);
      }
    }
  })();
  const pavGroup = new THREE.Group(); world.add(pavGroup);
  const pavMesh = new THREE.InstancedMesh(pavGeo, pavMat, pavList.length);
  pavMesh.castShadow = true; pavMesh.receiveShadow = true; pavMesh.renderOrder = 1; pavMesh.customDepthMaterial = depthMask;
  (function () {
    const tones = [0x68665f, 0x625f5b, 0x6e6b66, 0x5f5d5a, 0x726f69, 0x656260].map((h) => new THREE.Color(h));
    const r = rnd(5); const c = new THREE.Color();
    pavList.forEach((p, i) => { c.copy(tones[Math.floor(r() * tones.length)]).multiplyScalar(0.96 + r() * 0.08); pavMesh.setColorAt(i, c); });
  })();
  pavGroup.add(pavMesh);
  const dummy = new THREE.Object3D();
  function layPavers(fn) {
    for (let i = 0; i < pavList.length; i++) {
      const p = pavList[i], o = fn(i, p);
      dummy.position.set(p[0], -0.03 + o.y, p[1]); dummy.scale.set(p[2] * o.s, o.s, o.s); dummy.updateMatrix(); pavMesh.setMatrixAt(i, dummy.matrix);
    }
    pavMesh.instanceMatrix.needsUpdate = true;
  }

  /* ---------- columns that move: samples explode, the pit around the house is dug ---------- */
  function column(r, type, offs) {
    const c = { r, layers: [] };
    STRATA[type].forEach((s, i) => {
      if (type === 'hellur' && s[0] === 'pav') { c.layers.push({ m: null, y0: s[1], y1: s[2], off: offs ? offs[i] : 0, pav: true }); return; }
      const top = topMat(s[0]), side = sideMat(s[0]);
      const m = new THREE.Mesh(UNIT, [side, side, top, side, side, side]);
      m.castShadow = !!offs && i < 3; m.receiveShadow = true; m.renderOrder = ORDER(s[0]);
      if (s[0] === 'turf' || s[0] === 'conc') m.customDepthMaterial = depthMask;
      world.add(m);
      c.layers.push({ m, y0: s[1], y1: s[2], off: offs ? offs[i] || 0 : 0 });
    });
    return c;
  }
  function ORDER(k) { return ['turf', 'conc', 'pav', 'asph', 'pubw', 'curb', 'stripe'].indexOf(k) >= 0 ? 1 : k === 'mold' || k === 'base' || k === 'sand' || k === 'gravel' ? 2 : k === 'fill' ? 3 : k === 'clay' ? 4 : 5; }
  const colS = column(SAMPLE.stett, 'stett', [2.6, 1.5, 0.55]);
  const colG = column(SAMPLE.gras, 'lawn', [2.3, 1.45, 0.5]);
  const colH = column(SAMPLE.hellur, 'hellur', [2.65, 1.95, 1.25, 0.45]);
  const pits = PIT.map((p) => column(p.r, p.type, null));
  function placeColumn(c, e) {
    c.layers.forEach((L, i) => {
      const k = ss(clamp(e * 1.35 - i * 0.12, 0, 1)); L.lift = L.off * k;
      if (L.m) setBox(L.m, c.r.x0, c.r.x1, L.y0 + L.lift, L.y1 + L.lift, c.r.z0, c.r.z1);
    });
  }
  function digColumn(c, depth) { c.layers.forEach((L) => { if (L.m) setBox(L.m, c.r.x0, c.r.x1, L.y0, Math.min(L.y1, -depth), c.r.z0, c.r.z1); }); }

  // snow-melt loop inside the sidewalk sample
  const snow = new THREE.Group(); world.add(snow);
  (function () {
    const r = SAMPLE.stett, pts = [], rows = 7;
    for (let i = 0; i < rows; i++) {
      const z = r.z0 + 0.25 + i * (r.z1 - r.z0 - 0.5) / (rows - 1);
      const a = new THREE.Vector3(r.x0 + 0.3, 0, z), b = new THREE.Vector3(r.x1 - 0.3, 0, z);
      if (i % 2) pts.push(b, a); else pts.push(a, b);
    }
    const path = new THREE.CurvePath();
    for (let j = 0; j < pts.length - 1; j++) path.add(new THREE.LineCurve3(pts[j], pts[j + 1]));
    const m = new THREE.Mesh(new THREE.TubeGeometry(path, 200, 0.022, 8, false), new THREE.MeshStandardMaterial({ color: 0xc8402f, roughness: 0.45, emissive: C('#c8402f'), emissiveIntensity: 0.15 }));
    m.castShadow = true; snow.add(m);
  })();

  // turf roll for the lawn sample
  const rollGeo = new THREE.CylinderGeometry(1, 1, 1, 28); rollGeo.rotateX(Math.PI / 2);
  const roll = new THREE.Mesh(rollGeo, [G.turf, G.turfS, G.turfS]); roll.castShadow = true; world.add(roll); roll.visible = false;

  /* ---------- grass blades on the front lawn (and on the sample, which moves) ---------- */
  function blades(rects, excl, density, seed) {
    const r = rnd(seed), pos = [], nor = [], col = [];
    const base = new THREE.Color(), tip = new THREE.Color();
    rects.forEach((q) => {
      const n = Math.round((q.x1 - q.x0) * (q.z1 - q.z0) * density);
      for (let i = 0; i < n; i++) {
        const x = q.x0 + r() * (q.x1 - q.x0), z = q.z0 + r() * (q.z1 - q.z0);
        if (excl.some((e) => inside(e, x, z))) continue;
        const h = 0.035 + r() * 0.05, w = 0.006 + r() * 0.007, a = r() * Math.PI, bend = (r() - 0.5) * 0.06;
        const ca = Math.cos(a), sa = Math.sin(a), bx2 = Math.cos(a + 1.57) * bend, bz2 = Math.sin(a + 1.57) * bend;
        const v = [[x - ca * w, 0, z - sa * w], [x + ca * w, 0, z + sa * w], [x - ca * w * 0.6 + bx2 * 0.4, h * 0.55, z - sa * w * 0.6 + bz2 * 0.4], [x + ca * w * 0.6 + bx2 * 0.4, h * 0.55, z + sa * w * 0.6 + bz2 * 0.4], [x + bx2, h, z + bz2]];
        const tri = [0, 1, 3, 0, 3, 2, 2, 3, 4];
        const g = 0.8 + r() * 0.45; base.setRGB(0.11 * g, 0.17 * g, 0.05 * g); tip.setRGB(0.26 * g, 0.36 * g, 0.11 * g);
        if (r() < 0.12) tip.setRGB(0.36 * g, 0.36 * g, 0.16 * g);
        tri.forEach((k) => { pos.push(...v[k]); nor.push(-sa * 0.3, 1, ca * 0.3); const c = k < 2 ? base : k < 4 ? base.clone().lerp(tip, 0.6) : tip; col.push(c.r, c.g, c.b); });
      }
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    return g;
  }
  const bladeMat = patch(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, side: THREE.DoubleSide, envMapIntensity: 0.8 }), { mask: RAW });
  SOILMATS.push(bladeMat);
  const dens = small ? 160 : 420;
  const lawnRects = [R(2.05, 15.25, 2.6, 10.95), R(-15.2, -10.05, 0.2, 10.95), R(11.1, 15.25, 0.05, 2.6), R(13.05, 15.25, -1.5, 0.05)];
  const bladesMain = new THREE.Mesh(blades(lawnRects, [SAMPLE.gras], dens, 3), bladeMat); bladesMain.receiveShadow = true; world.add(bladesMain);
  const bladesS = new THREE.Mesh(blades([SAMPLE.gras], [], dens, 4), bladeMat); bladesS.receiveShadow = true;
  const bladesG = new THREE.Group(); bladesG.add(bladesS); world.add(bladesG);

  /* ---------- foundation: footing walls, footing base, house pad ---------- */
  const fnd = new THREE.Group(); world.add(fnd);
  const pads = [], footings = [];
  function foundation(r, skipEast) {
    const t = 0.35, b = 0.7;
    const pad = new THREE.Mesh(UNIT, padMat); pad.receiveShadow = true; pad.renderOrder = 2; fnd.add(pad); pads.push({ m: pad, r });
    const walls = [[r.x0, r.x1, r.z1 - t, r.z1], [r.x0, r.x1, r.z0, r.z0 + t], [r.x0, r.x0 + t, r.z0, r.z1]];
    if (!skipEast) walls.push([r.x1 - t, r.x1, r.z0, r.z1]);
    walls.forEach((w) => {
      footings.push(addBox(fnd, foot, w[0], w[1], -1.3, 0.3, w[2], w[3]));
      const cx = (w[0] + w[1]) / 2, cz = (w[2] + w[3]) / 2, wide = (w[1] - w[0]) > (w[3] - w[2]);
      footings.push(wide ? addBox(fnd, foot, w[0] - 0.18, w[1] + 0.18, -1.6, -1.3, cz - b / 2, cz + b / 2) : addBox(fnd, foot, cx - b / 2, cx + b / 2, -1.6, -1.3, w[2] - 0.18, w[3] + 0.18));
    });
  }
  function addBox(parent, mat, x0, x1, y0, y1, z0, z1) { const m = new THREE.Mesh(UNIT, mat); setBox(m, x0, x1, y0, y1, z0, z1); m.castShadow = true; m.receiveShadow = true; parent.add(m); m.userData.y = m.position.y; return m; }
  foundation(HOUSE, false); foundation(GAR, true);
  footings.push(addBox(fnd, foot, 3.83, 4.17, -1.3, 0.3, HOUSE.z0 + 0.35, HOUSE.z1 - 0.35));
  footings.push(addBox(fnd, foot, 3.65, 4.35, -1.6, -1.3, HOUSE.z0 + 0.35, HOUSE.z1 - 0.35));

  /* ---------- the house ---------- */
  const house = new THREE.Group(); world.add(house);
  const hb = new Bag(), gl = new Bag(), dusk = [];
  const SKIN = 0.12, WT = 0.35;
  // a wall with rectangular openings, split into boxes; the outer skin and the inner plaster are separate
  function wall(axis, plane, out, a0, a1, y0, y1, holes, skinMat, th) {
    th = th || WT;
    const as = [a0, a1], ys = [y0, y1];
    if (axis === 'z') as.push(a0 + th, a1 - th);
    holes.forEach((h) => { as.push(h.a0, h.a1); ys.push(h.y0, h.y1); });
    const uq = (v) => v.filter((x, i) => v.indexOf(x) === i).sort((p, q) => p - q);
    const A = uq(as).filter((v) => v >= a0 && v <= a1), Y = uq(ys).filter((v) => v >= y0 && v <= y1);
    for (let i = 0; i < A.length - 1; i++) for (let j = 0; j < Y.length - 1; j++) {
      const ca = (A[i] + A[i + 1]) / 2, cy = (Y[j] + Y[j + 1]) / 2;
      if (holes.some((h) => ca > h.a0 && ca < h.a1 && cy > h.y0 && cy < h.y1)) continue;
      const o0 = plane, o1 = plane - out * SKIN, i1 = plane - out * th;
      if (axis === 'z' && (A[i + 1] <= a0 + th + 1e-6 || A[i] >= a1 - th - 1e-6)) { hb.box(skinMat, A[i], A[i + 1], Y[j], Y[j + 1], Math.min(o0, i1), Math.max(o0, i1)); continue; }
      if (axis === 'z') { hb.box(skinMat, A[i], A[i + 1], Y[j], Y[j + 1], Math.min(o0, o1), Math.max(o0, o1)); hb.box(H.plaster, A[i], A[i + 1], Y[j], Y[j + 1], Math.min(o1, i1), Math.max(o1, i1)); }
      else { hb.box(skinMat, Math.min(o0, o1), Math.max(o0, o1), Y[j], Y[j + 1], A[i], A[i + 1]); hb.box(H.plaster, Math.min(o1, i1), Math.max(o1, i1), Y[j], Y[j + 1], A[i], A[i + 1]); }
    }
  }
  // window: frame, mullions and glass set back in the opening; optional sill
  function win(axis, plane, out, a0, a1, y0, y1, o) {
    o = o || {};
    const sb = o.sb || SKIN, f = 0.055, fd = 0.07, g = plane - out * sb;
    const bar = (b0, b1, c0, c1) => (axis === 'z' ? hb.box(H.frame, b0, b1, c0, c1, g - fd / 2, g + fd / 2) : hb.box(H.frame, g - fd / 2, g + fd / 2, c0, c1, b0, b1));
    bar(a0, a0 + f, y0, y1); bar(a1 - f, a1, y0, y1); bar(a0, a1, y0, y0 + f); bar(a0, a1, y1 - f, y1);
    (o.mull || []).forEach((m) => bar(m - f / 2, m + f / 2, y0, y1));
    (o.tran || []).forEach((t) => bar(a0, a1, t - f / 2, t + f / 2));
    if (axis === 'z') gl.add(glass, bx(a0 + f, a1 - f, y0 + f, y1 - f, g - 0.004, g + 0.004));
    else gl.add(glass, bx(g - 0.004, g + 0.004, y0 + f, y1 - f, a0 + f, a1 - f));
    if (o.sill) {
      if (axis === 'z') hb.box(H.fascia, a0 - 0.03, a1 + 0.03, y0 - 0.035, y0, Math.min(plane - out * sb, plane + out * 0.05), Math.max(plane - out * sb, plane + out * 0.05));
      else hb.box(H.fascia, Math.min(plane - out * sb, plane + out * 0.05), Math.max(plane - out * sb, plane + out * 0.05), y0 - 0.035, y0, a0 - 0.03, a1 + 0.03);
    }
  }
  const hole = (a0, a1, y0, y1) => ({ a0, a1, y0, y1 });
  // ground floor, white render
  const FR = [hole(-2.3, -0.6, 1.0, 2.4), hole(0.1, 2.05, 0.3, 2.7), hole(3.0, 10.5, 0.35, 3.0)];
  wall('z', HOUSE.z1, 1, HOUSE.x0, HOUSE.x1, 0.3, 3.3, FR, H.render);
  wall('z', HOUSE.z0, -1, HOUSE.x0, HOUSE.x1, 0.3, 3.3, [hole(0.0, 2.5, 1.0, 2.5), hole(5.0, 9.0, 1.0, 2.5)], H.render);
  wall('x', HOUSE.x1, 1, HOUSE.z0 + WT, HOUSE.z1 - WT, 0.3, 3.3, [hole(-8.6, -4.0, 0.35, 2.75)], H.render);
  wall('x', HOUSE.x0, -1, HOUSE.z0 + WT, HOUSE.z1 - WT, 0.3, 3.3, [], H.render);
  win('z', HOUSE.z1, 1, -2.3, -0.6, 1.0, 2.4, { sill: 1 });
  win('z', HOUSE.z1, 1, 1.42, 2.05, 0.3, 2.7, {});
  win('z', HOUSE.z1, 1, 3.0, 10.5, 0.35, 3.0, { mull: [5.5, 8.0] });
  win('z', HOUSE.z0, -1, 0.0, 2.5, 1.0, 2.5, { sill: 1, mull: [1.25] });
  win('z', HOUSE.z0, -1, 5.0, 9.0, 1.0, 2.5, { sill: 1, mull: [7.0] });
  win('x', HOUSE.x1, 1, -8.6, -4.0, 0.35, 2.75, { mull: [-6.3] });
  // entrance door: tall oak leaf with a frame
  hb.box(H.frame, 0.1, 1.42, 0.3, 2.7, HOUSE.z1 - 0.2, HOUSE.z1 - 0.13);
  hb.box(H.door, 0.16, 1.36, 0.3, 2.64, HOUSE.z1 - 0.16, HOUSE.z1 - 0.1);
  hb.box(H.steel, 1.22, 1.25, 1.0, 1.9, HOUSE.z1 - 0.1, HOUSE.z1 - 0.05);
  // garage, white render with a dark sectional door
  wall('z', GAR.z1, 1, GAR.x0, GAR.x1, 0.3, 3.1, [hole(-9.3, -3.8, 0.3, 2.55)], H.render);
  wall('z', GAR.z0, -1, GAR.x0, GAR.x1, 0.3, 3.1, [], H.render);
  wall('x', GAR.x0, -1, GAR.z0 + WT, GAR.z1 - WT, 0.3, 3.1, [hole(-6.0, -4.4, 1.4, 2.2)], H.render);
  win('x', GAR.x0, -1, -6.0, -4.4, 1.4, 2.2, { sill: 1 });
  hb.box(H.gdoor, -9.3, -3.8, 0.3, 2.55, GAR.z1 - 0.18, GAR.z1 - 0.12);
  [0.86, 1.42, 1.98].forEach((y) => hb.box(H.groove, -9.3, -3.8, y - 0.012, y + 0.012, GAR.z1 - 0.12, GAR.z1 - 0.115));
  hb.box(H.steel, -9.4, -3.7, 2.55, 2.62, GAR.z1 - 0.2, GAR.z1 - 0.1);
  // slabs, roofs with dark fascia, ceilings
  const slab = (r, y0, y1, ext) => {
    hb.box(H.fascia, r.x0 - ext, r.x1 + ext, y1 - 0.26, y1, r.z0 - ext, r.z1 + ext);
    hb.box(H.roof, r.x0 - ext + 0.05, r.x1 + ext - 0.05, y1, y1 + 0.02, r.z0 - ext + 0.05, r.z1 + ext - 0.05);
    hb.box(H.render, r.x0, r.x1, y0, y1 - 0.26, r.z0, r.z1);
  };
  slab(HOUSE, 3.3, 3.62, 0.04); slab(GAR, 3.1, 3.38, 0.04);
  hb.box(H.plaster, HOUSE.x0 + WT, HOUSE.x1 - WT, 3.28, 3.3, HOUSE.z0 + WT, HOUSE.z1 - WT);
  hb.box(H.plaster, GAR.x0 + WT, GAR.x1 - WT, 3.08, 3.1, GAR.z0 + WT, GAR.z1 - WT);
  hb.box(H.oak, HOUSE.x0 + WT, HOUSE.x1 - WT, 0.15, 0.3, HOUSE.z0 + WT, HOUSE.z1 - WT);
  hb.box(H.stone, GAR.x0 + WT, GAR.x1 - WT, 0.15, 0.3, GAR.z0 + WT, GAR.z1 - WT);
  // upper floor: dark timber box cantilevered over the entrance
  const UY0 = 3.62, UY1 = 6.5, UT = 0.3;
  hb.box(H.timber, UPPER.x0, UPPER.x1, UY0, UY0 + 0.28, UPPER.z0, UPPER.z1);     // floor slab, soffit underneath
  wall('z', UPPER.z1, 1, UPPER.x0, UPPER.x1, UY0 + 0.28, UY1, [hole(-0.9, 4.5, 4.15, 5.95), hole(5.4, 7.9, 4.15, 5.95)], H.timber, UT);
  wall('z', UPPER.z0, -1, UPPER.x0, UPPER.x1, UY0 + 0.28, UY1, [hole(0.5, 3.5, 4.4, 5.95), hole(5.0, 7.5, 4.4, 5.95)], H.timber, UT);
  wall('x', UPPER.x1, 1, UPPER.z0 + UT, UPPER.z1 - UT, UY0 + 0.28, UY1, [hole(-8.6, -5.2, 4.15, 5.95)], H.timber, UT);
  wall('x', UPPER.x0, -1, UPPER.z0 + UT, UPPER.z1 - UT, UY0 + 0.28, UY1, [hole(-6.2, -4.0, 4.4, 5.95)], H.timber, UT);
  win('z', UPPER.z1, 1, -0.9, 4.5, 4.15, 5.95, { mull: [1.8], sb: 0.1 });
  win('z', UPPER.z1, 1, 5.4, 7.9, 4.15, 5.95, { sb: 0.1 });
  win('z', UPPER.z0, -1, 0.5, 3.5, 4.4, 5.95, { sb: 0.1 });
  win('z', UPPER.z0, -1, 5.0, 7.5, 4.4, 5.95, { sb: 0.1 });
  win('x', UPPER.x1, 1, -8.6, -5.2, 4.15, 5.95, { sb: 0.1 });
  win('x', UPPER.x0, -1, -6.2, -4.0, 4.4, 5.95, { sb: 0.1 });
  hb.box(H.oak, UPPER.x0 + UT, UPPER.x1 - UT, UY0 + 0.28, UY0 + 0.3, UPPER.z0 + UT, UPPER.z1 - UT);
  slab(R(UPPER.x0, UPPER.x1, UPPER.z0, UPPER.z1), UY1, UY1 + 0.3, 0.03);
  hb.box(H.plaster, UPPER.x0 + UT, UPPER.x1 - UT, UY1 - 0.02, UY1, UPPER.z0 + UT, UPPER.z1 - UT);
  // entrance landing and the step under the cantilever
  hb.box(H.stone, -0.5, 2.6, 0, 0.15, HOUSE.z1, HOUSE.z1 + 0.9);
  // living room: rug, sofa, coffee table, dining table with pendants, floor lamp, art, a plant
  hb.box(H.rug, 4.4, 8.6, 0.3, 0.315, -6.6, -3.3);
  hb.box(H.fabric, 4.7, 8.3, 0.3, 0.72, -7.5, -6.55); hb.box(H.fabric, 4.7, 8.3, 0.3, 1.05, -7.78, -7.5);
  hb.box(H.fabric, 4.5, 4.75, 0.3, 0.85, -7.78, -6.55); hb.box(H.fabric, 8.25, 8.5, 0.3, 0.85, -7.78, -6.55);
  hb.box(H.oak, 5.7, 7.3, 0.62, 0.68, -5.3, -4.4); hb.box(H.steel, 5.8, 7.2, 0.3, 0.62, -5.2, -4.5);
  hb.box(H.oak, 9.0, 10.3, 1.0, 1.06, -7.2, -4.6); hb.box(H.steel, 9.1, 10.2, 0.3, 1.0, -7.1, -4.7);
  [-6.6, -5.9, -5.2].forEach((z) => { hb.box(H.steel, 9.64, 9.66, 2.15, 3.28, z - 0.01, z + 0.01); dusk.push(addLamp(9.65, 2.08, z, 0.16)); });
  hb.box(H.steel, 8.82, 8.86, 0.3, 1.55, -7.25, -7.21); dusk.push(addLamp(8.84, 1.62, -7.23, 0.22));
  hb.box(H.art, 5.5, 7.5, 1.35, 2.55, HOUSE.z0 + WT, HOUSE.z0 + WT + 0.03);
  hb.box(H.plaster, 3.0, 3.35, 0.3, 3.3, HOUSE.z0 + WT, HOUSE.z1 - WT);   // partition by the hall
  // upper bedroom glimpse
  hb.box(H.fabric, 0.2, 2.4, UY0 + 0.3, UY0 + 0.75, -7.0, -4.8); hb.box(H.rug, 0.1, 2.5, UY0 + 0.75, UY0 + 0.95, -7.2, -6.8);
  dusk.push(addLamp(3.0, UY0 + 0.95, -6.9, 0.14));
  // wall lights by the door and the garage, house number
  [[-0.35, 2.05], [-3.5 + 0.05, 2.05]].forEach(([x, y]) => { hb.box(H.steel, x - 0.06, x + 0.06, y - 0.16, y + 0.16, HOUSE.z1, HOUSE.z1 + 0.1); dusk.push(addLamp(x, y - 0.2, HOUSE.z1 + 0.05, 0.05, true)); });
  // soffit downlights under the cantilever
  [-0.4, 1.6, 3.6, 5.6, 7.6].forEach((x) => dusk.push(addLamp(x, UY0 - 0.01, -1.5, 0.07, true)));
  function addLamp(x, y, z, r, flat) {
    const geo = flat ? new THREE.CylinderGeometry(r, r, 0.02, 16) : new THREE.SphereGeometry(r, 16, 10);
    geo.translate(x, y, z); hb.add(H.bulb, geo); return [x, y, z];
  }
  lightsDusk.push([H.bulb, 9], [H.lamp, 4]);
  const houseMeshes = hb.build(house, { depth: depthScan });
  const glassMeshes = gl.build(house, { cast: false });
  houseMeshes.forEach((m) => m.layers.set(3));
  glassMeshes.forEach((m) => { m.layers.set(3); m.renderOrder = 6; });
  // house number plate (canvas text)
  (function () {
    const cv = document.createElement('canvas'); cv.width = 128; cv.height = 128; const g = cv.getContext('2d');
    g.fillStyle = '#1d1e20'; g.fillRect(0, 0, 128, 128); g.fillStyle = '#e9e5de'; g.font = '700 72px Archivo, Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('12', 64, 70);
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.34), patch(new THREE.MeshStandardMaterial({ map: t, roughness: 0.5, metalness: 0.3 }), { scan: 1 }));
    m.position.set(-0.35, 1.5, HOUSE.z1 + 0.012); m.layers.set(3); house.add(m);
  })();
  // interior light that spills out at dusk
  const pl1 = new THREE.PointLight(0xffb070, 0, 13, 1.6); pl1.position.set(7, 2.3, -5.4); house.add(pl1);
  const pl2 = new THREE.PointLight(0xffb070, 0, 9, 1.6); pl2.position.set(2.5, 5.5, -5.2); house.add(pl2);
  const pl3 = new THREE.PointLight(0xffc690, 0, 7, 1.8); pl3.position.set(2.0, 3.2, -0.6); house.add(pl3);

  /* ---------- garden: deck with hot tub and privacy fence, hedges, birches, bollards, mailbox, street lamps ---------- */
  const garden = new THREE.Group(); world.add(garden);
  const gb = new Bag();
  gb.box(H.deck, DECK.x0, DECK.x1, 0.12, 0.45, DECK.z0, DECK.z1);
  gb.box(H.deck, DECK.x0 - 0.9, DECK.x0, 0.12, 0.28, -4.4, -2.6);   // step down to the lawn... towards the house door
  // hot tub sunk into the deck, wooden rim, water
  (function () {
    const cx = 13.15, cz = -6.3, rr = 1.15;
    const rim = new THREE.CylinderGeometry(rr + 0.12, rr + 0.12, 0.14, 40, 1, true); rim.translate(cx, 0.52, cz); gb.add(H.stone, rim);
    const top = new THREE.RingGeometry(rr, rr + 0.12, 40); top.rotateX(-Math.PI / 2); top.translate(cx, 0.59, cz); gb.add(H.stone, top);
    const w = new THREE.CircleGeometry(rr, 40); w.rotateX(-Math.PI / 2); w.translate(cx, 0.5, cz); gb.add(H.water, w);
    lightsDusk.push([H.water, 0.9]);
  })();
  // privacy fence (skjólveggur): vertical slats on the street side and the east side of the deck
  (function () {
    const slat = new THREE.BoxGeometry(0.07, 1.8, 0.03);
    const add = (x, z, rotY) => { const g = slat.clone(); if (rotY) g.rotateY(Math.PI / 2); g.translate(x, 0.45 + 0.9, z); gb.add(H.slat, g); };
    for (let x = DECK.x0 + 1.4; x < DECK.x1 - 0.04; x += 0.095) add(x, DECK.z1 - 0.05, false);
    for (let z = DECK.z0 + 0.05; z < DECK.z1; z += 0.095) add(DECK.x1 - 0.05, z, true);
    [[DECK.x0 + 1.35, DECK.z1 - 0.1], [DECK.x1 - 0.1, DECK.z1 - 0.1], [DECK.x1 - 0.1, -5.5], [DECK.x1 - 0.1, DECK.z0 + 0.1]].forEach(([x, z]) => gb.box(H.slat, x - 0.06, x + 0.06, 0.45, 2.3, z - 0.06, z + 0.06));
  })();
  // hedges with a soft, uneven top
  function hedge(x0, x1, z0, z1, h, seed) {
    const g = new THREE.BoxGeometry(x1 - x0, h, z1 - z0, Math.ceil((x1 - x0) * 3), 6, Math.ceil((z1 - z0) * 3));
    const p = g.attributes.position, r = rnd(seed);
    const ph = r() * 100;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const n = Math.sin((x + ph) * 2.1) * Math.sin((z + ph) * 1.7) * 0.06 + Math.sin((x + z) * 5.3 + ph) * 0.03;
      const k = (y + h / 2) / h;
      p.setXYZ(i, x * (1 + n * 0.6), y + (k > 0.9 ? n * 1.6 : 0), z * (1 + n * 0.6));
    }
    g.computeVertexNormals(); g.translate((x0 + x1) / 2, h / 2, (z0 + z1) / 2); gb.add(H.hedge, g);
  }
  hedge(-16, -15.2, -12.8, 9.4, 1.3, 1); hedge(15.3, 16, -12.8, 9.4, 1.35, 2); hedge(-15.2, 15.3, -13, -12.3, 1.5, 3);
  // bollards along the walkway, mailbox
  [[-0.25, 4.3], [-0.25, 7.6], [2.05, 5.9], [2.05, 9.2]].forEach(([x, z]) => {
    const p = new THREE.CylinderGeometry(0.07, 0.07, 0.62, 16); p.translate(x, 0.31, z); gb.add(H.steel, p);
    dusk.push(null); const c = new THREE.CylinderGeometry(0.072, 0.072, 0.05, 16); c.translate(x, 0.5, z); gb.add(H.bulb, c);
  });
  gb.box(H.steel, 2.55, 2.6, 0, 1.0, 10.6, 10.65); gb.box(H.steel, 2.35, 2.8, 1.0, 1.32, 10.45, 10.8);
  const gardenMeshes = gb.build(garden, { depth: depthScan });
  gardenMeshes.forEach((m) => m.layers.set(3));
  // birches: a bent trunk, a few branches, leaf cards with normals pointing out of the crown
  (function () {
    const tb = new Bag(), lb = [];
    function birch(x, z, hgt, seed) {
      const r = rnd(seed), pts = [];
      for (let i = 0; i <= 6; i++) { const k = i / 6; pts.push(new THREE.Vector3(x + Math.sin(k * 3 + seed) * 0.18 * k, k * hgt, z + Math.cos(k * 2.3 + seed) * 0.14 * k)); }
      const curve = new THREE.CatmullRomCurve3(pts);
      const tg = new THREE.TubeGeometry(curve, 24, 1, 8, false), p = tg.attributes.position;
      for (let i = 0; i < p.count; i++) {   // taper: pull vertices toward the curve
        const v = new THREE.Vector3(p.getX(i), p.getY(i), p.getZ(i)); const k = clamp(v.y / hgt, 0, 1); const c = curve.getPoint(k);
        v.sub(c).multiplyScalar(lerp(0.11, 0.025, k)).add(c); p.setXYZ(i, v.x, v.y, v.z);
      }
      tg.computeVertexNormals(); swapUV(tg, 7); tb.add(H.bark, tg);
      const crown = new THREE.Vector3(x, hgt * 0.72, z), tips = [];
      for (let b = 0; b < 6; b++) {
        const k = 0.42 + b * 0.08, s = curve.getPoint(k), a = r() * Math.PI * 2, L = 0.9 + r() * 0.9;
        const e = new THREE.Vector3(s.x + Math.cos(a) * L, s.y + 0.5 + r() * 0.7, s.z + Math.sin(a) * L);
        const bc = new THREE.QuadraticBezierCurve3(s, new THREE.Vector3((s.x + e.x) / 2, s.y + 0.15, (s.z + e.z) / 2), e);
        tb.add(H.bark, swapUV(new THREE.TubeGeometry(bc, 8, 0.025, 5, false), 2)); tips.push(e);
      }
      tips.push(curve.getPoint(1));
      for (let i = 0; i < 70; i++) {
        const t0 = tips[i % tips.length], s = 0.75 + r() * 0.5;
        const c = new THREE.Vector3(t0.x + (r() - 0.5) * 1.6, t0.y + (r() - 0.6) * 1.3, t0.z + (r() - 0.5) * 1.6);
        const q = new THREE.PlaneGeometry(s, s);
        q.rotateX(r() * Math.PI); q.rotateY(r() * Math.PI * 2); q.rotateZ((r() - 0.5) * 1.2);
        q.translate(c.x, c.y, c.z);
        const n = q.attributes.normal, pp = q.attributes.position;
        for (let j = 0; j < n.count; j++) { const d = new THREE.Vector3(pp.getX(j), pp.getY(j), pp.getZ(j)).sub(crown).normalize(); n.setXYZ(j, d.x, d.y * 0.8 + 0.2, d.z); }
        lb.push(q);
      }
    }
    function swapUV(g, rep) { const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) { const u = uv.getX(i), v = uv.getY(i); uv.setXY(i, v, u * rep); } return g; }
    birch(14.8, 4.2, 5.6, 1); birch(-13.3, 6.4, 6.2, 2); birch(-6.6, -12.0, 6.6, 3); birch(6.4, -12.2, 5.9, 4); birch(14.4, -11.4, 5.2, 5);
    const trunks = tb.build(garden, { depth: depthScan }); trunks.forEach((m) => m.layers.set(3));
    const leaves = new THREE.Mesh(mergeGeometries(lb, false), H.leaves); leaves.castShadow = true; leaves.receiveShadow = true;
    leaves.customDepthMaterial = leafDepth; leaves.layers.set(2); garden.add(leaves);
  })();
  // street lamps (Reykjavík style: slim grey pole, flat LED head over the road)
  const lampHeads = new Bag();
  [[-20, 12.5], [21, 12.5], [52, 12.5], [-48, 12.5]].forEach(([x, z]) => {
    const p = new THREE.CylinderGeometry(0.06, 0.09, 6.2, 12); p.translate(x, 3.1, z); lampHeads.add(H.steel, p);
    lampHeads.box(H.steel, x - 0.05, x + 0.05, 6.05, 6.15, z, z + 1.4);
    lampHeads.box(H.steel, x - 0.18, x + 0.18, 5.98, 6.1, z + 1.25, z + 1.85);
    lampHeads.box(H.bulb, x - 0.15, x + 0.15, 5.96, 5.98, z + 1.3, z + 1.8);
  });
  lampHeads.build(env);
  const manhole = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.33, 0.02, 24), std({ c: 0x3a3c40, r: 0.5, m: 0.6 })); manhole.position.set(9.2, -0.115, 18.6); world.add(manhole);

  /* ---------- pipes, trenches, ghost block (x-ray) ---------- */
  const pipesG = new THREE.Group(); world.add(pipesG);
  const PC = { cold: '#2f86e0', hot: '#e0442f', sewer: '#cf6a2c', power: '#f2b233', fiber: '#f90160', drain: '#8cc63f' };
  const pipes = [];
  function pmat(hex) { if (!pipeMats[hex]) pipeMats[hex] = new THREE.MeshStandardMaterial({ color: C(hex), roughness: 0.42, emissive: C(hex), emissiveIntensity: 0.35 }); return pipeMats[hex]; }
  function pipe(points, r, color, from, to) {
    const v = points.map((p) => new THREE.Vector3(p[0], p[1], p[2])), path = new THREE.CurvePath();
    for (let i = 0; i < v.length - 1; i++) path.add(new THREE.LineCurve3(v[i], v[i + 1]));
    const segs = Math.max(12, Math.round(path.getLength() * 3));
    const m = new THREE.Mesh(new THREE.TubeGeometry(path, segs, r, 12, false), pmat(color)); pipesG.add(m);
    pipes.push({ m, segs, from, to });
  }
  const MAINS = [['sewer', 18.6, -2.75, 0.24], ['cold', 17.6, -1.75, 0.13], ['hot', 16.8, -1.35, 0.17], ['power', 15.9, -0.85, 0.07], ['fiber', 15.5, -0.6, 0.06]];
  MAINS.forEach((q) => pipe([[-15.97, q[2], q[1]], [15.97, q[2], q[1]]], q[3], PC[q[0]], 4.45, 4.7));
  const SERV = [['fiber', 7.35, -0.6, 15.5, 0.05], ['power', 7.7, -0.85, 15.9, 0.06], ['hot', 8.05, -1.35, 16.8, 0.09], ['cold', 8.4, -1.75, 17.6, 0.06]];
  SERV.forEach((q, i) => pipe([[q[1], q[2], q[3]], [q[1], q[2], -1.85]], q[4], PC[q[0]], 4.6 + i * 0.04, 4.86 + i * 0.03));
  pipe([[9.3, -1.35, -1.85], [9.3, -2.62, 18.45]], 0.1, PC.sewer, 4.66, 4.92);
  pipe([[9.3, -1.55, -1.5], [11.5, -1.55, -1.5], [11.5, -1.55, -10.5], [-3.5, -1.55, -10.5], [-3.5, -1.55, -9.5], [-10.5, -1.55, -9.5], [-10.5, -1.55, -1.5], [9.1, -1.55, -1.5]], 0.07, PC.drain, 4.76, 4.98);
  const shaftMat = new THREE.MeshStandardMaterial({ color: 0xe8e3d8, roughness: 0.7, side: THREE.DoubleSide });
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 2.6, 24, 1, true), shaftMat); shaft.position.set(9.2, -1.4, 18.6); world.add(shaft);
  const trenchMat = new THREE.MeshStandardMaterial({ color: 0xe2c48f, roughness: 1, transparent: true, opacity: 0, depthWrite: false });
  const trenches = [[7.05, 8.75, -1.85, -0.02, -1.9, 17.8], [9.0, 9.6, -2.6, -0.02, -1.9, 18.7]].map((b) => { const m = new THREE.Mesh(UNIT, trenchMat); setBox(m, ...b); m.renderOrder = 6; world.add(m); return m; });
  const outlineMat = new THREE.LineDashedMaterial({ color: 0xf2eee6, dashSize: 0.45, gapSize: 0.3, transparent: true, opacity: 0 });
  [HOUSE, GAR].forEach((r) => {
    const g = new THREE.BufferGeometry().setFromPoints([[r.x0, r.z0], [r.x1, r.z0], [r.x1, r.z1], [r.x0, r.z1], [r.x0, r.z0]].map((p) => new THREE.Vector3(p[0], 0.03, p[1])));
    const l = new THREE.Line(g, outlineMat); l.computeLineDistances(); world.add(l);
  });
  const ghostMat = new THREE.MeshBasicMaterial({ color: 0x121821, transparent: true, opacity: 0, depthWrite: false });
  const ghost = new THREE.Mesh(new THREE.BoxGeometry(32, 4.5, 35.4), ghostMat); ghost.position.set(0, -2.25, 4.7); ghost.renderOrder = 7; world.add(ghost);
  // a dark open box under the lot, so the x-ray looks into the ground and not at the sky below the horizon
  const voidMat = new THREE.MeshBasicMaterial({ color: 0x0d1116, side: THREE.BackSide, transparent: true, opacity: 0 });
  const voidBox = new THREE.Mesh(new THREE.BoxGeometry(32, 4.6, 35.4), voidMat); voidBox.position.set(0, -2.3 - 0.001, 4.7); voidBox.renderOrder = 0; world.add(voidBox);
  const ghostLineMat = new THREE.LineBasicMaterial({ color: 0xf2eee6, transparent: true, opacity: 0 });
  const ghostLines = new THREE.LineSegments(new THREE.EdgesGeometry(ghost.geometry), ghostLineMat); ghostLines.position.copy(ghost.position); ghostLines.renderOrder = 8; world.add(ghostLines);
  const strataLineMat = new THREE.LineDashedMaterial({ color: 0xd9bf8b, dashSize: 0.6, gapSize: 0.4, transparent: true, opacity: 0 });
  [-0.3, -1.5, -2.8].forEach((y) => {
    const g = new THREE.BufferGeometry().setFromPoints([[-16, -13], [16, -13], [16, 22.4], [-16, 22.4], [-16, -13]].map((p) => new THREE.Vector3(p[0], y, p[1])));
    const l = new THREE.Line(g, strataLineMat); l.computeLineDistances(); world.add(l);
  });

  /* ---------- sky, sun, environment ---------- */
  const sky = new Sky(); sky.scale.setScalar(11000); scene.add(sky);
  sky.material.uniforms.uGain = { value: 0.62 };
  sky.material.fragmentShader = 'uniform float uGain;\n' + sky.material.fragmentShader.replace('gl_FragColor = vec4( retColor, 1.0 );', 'gl_FragColor = vec4( retColor * uGain, 1.0 );');
  const su = sky.material.uniforms;
  const sun = new THREE.DirectionalLight(0xffffff, 3); sun.castShadow = true;
  sun.shadow.mapSize.set(small ? 2048 : 4096, small ? 2048 : 4096);
  const sc = sun.shadow.camera; sc.left = -30; sc.right = 30; sc.top = 30; sc.bottom = -30; sc.near = 1; sc.far = 220;
  sc.layers.enable(2); sc.layers.enable(3);
  sun.shadow.bias = -0.0002; sun.shadow.normalBias = 0.025;
  scene.add(sun); scene.add(sun.target); sun.target.position.set(1, 0, 0);
  const fill = new THREE.HemisphereLight(0xbfd2ff, 0x4a4036, 0.0); scene.add(fill);
  const DAY = { el: 38, az: 322, tur: 2.0, ray: 1.0, mie: 0.004, g: 0.8, sun: C('#fff0dc'), si: 3.6, exp: 0.95, env: 0.8, fog: C('#b4bfcc') };
  const GOLD = { el: 6.5, az: 312, tur: 3.2, ray: 2.8, mie: 0.006, g: 0.86, sun: C('#ffad66'), si: 3.4, exp: 1.12, env: 0.62, fog: C('#9a8f8c') };
  const sunDir = new THREE.Vector3();
  function sunVec(el, az) { const phi = THREE.MathUtils.degToRad(90 - el), th = THREE.MathUtils.degToRad(az); return new THREE.Vector3().setFromSphericalCoords(1, phi, th); }
  // the environment map follows the sky; a few are made up front and picked by the dusk level
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene(), envSky = new Sky(); envSky.scale.setScalar(1000); envScene.add(envSky);
  const envGround = new THREE.Mesh(new THREE.CircleGeometry(900, 32), new THREE.MeshBasicMaterial({ color: 0x3c3a30 })); envGround.rotation.x = -Math.PI / 2; envGround.position.y = -2; envScene.add(envGround);
  function skyState(k) {
    return {
      el: lerp(DAY.el, GOLD.el, k), az: lerp(DAY.az, GOLD.az, k), tur: lerp(DAY.tur, GOLD.tur, k), ray: lerp(DAY.ray, GOLD.ray, k),
      mie: lerp(DAY.mie, GOLD.mie, k), g: lerp(DAY.g, GOLD.g, k)
    };
  }
  function setSky(u, s) { u.turbidity.value = s.tur; u.rayleigh.value = s.ray; u.mieCoefficient.value = s.mie; u.mieDirectionalG.value = s.g; u.sunPosition.value.copy(sunVec(s.el, s.az)); }
  const ENVS = [];
  for (let i = 0; i <= 4; i++) {
    const s = skyState(i / 4); setSky(envSky.material.uniforms, s);
    envGround.material.color.setRGB(lerp(0.09, 0.06, i / 4), lerp(0.085, 0.05, i / 4), lerp(0.07, 0.04, i / 4));
    ENVS.push(pmrem.fromScene(envScene, 0.02, 0.1, 3000).texture);
  }
  scene.fog = new THREE.FogExp2(0xaab6c4, 0.0017);
  let envIdx = -1;
  function lighting(k) {
    const s = skyState(k); setSky(su, s);
    sunDir.copy(sunVec(s.el, s.az));
    sun.position.copy(sunDir).multiplyScalar(110).add(sun.target.position);
    sun.color.copy(DAY.sun).lerp(GOLD.sun, k); sun.intensity = lerp(DAY.si, GOLD.si, k);
    const ei = Math.round(k * 4); if (ei !== envIdx) { envIdx = ei; scene.environment = ENVS[ei]; }
    scene.environmentIntensity = lerp(DAY.env, GOLD.env, k);
    scene.fog.color.copy(DAY.fog).lerp(GOLD.fog, k);
    renderer.toneMappingExposure = lerp(DAY.exp, GOLD.exp, k) * expo;
    lightsDusk.forEach(([m, v]) => { m.emissiveIntensity = v * ssOn(k); });
    const on = ssOn(k);
    pl1.intensity = 26 * on; pl2.intensity = 12 * on; pl3.intensity = 6 * on;
    glass.opacity = lerp(0.82, 0.66, on);
    esjaMat.color.setRGB(1, 1, 1).lerp(new THREE.Color(1.25, 0.98, 0.92), k);
    sky.material.uniforms.uGain.value = lerp(0.62, 0.55, k);
    farWin.color.copy(FARWIN_DAY).lerp(FARWIN_DUSK, ssOn(k));
    bloom.strength = lerp(0.12, 0.42, k);
    stage.style.setProperty('--dusk', k.toFixed(3));
  }
  let lampOn = 1;   // the intro turns the lights on
  const ssOn = (k) => sm(0.25, 0.85, k) * lampOn;
  let expo = 1;

  /* ---------- post-processing ---------- */
  const rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: small ? 0 : 4 });
  const composer = new EffectComposer(renderer, rt);
  const renderPass = new RenderPass(scene, camera); composer.addPass(renderPass);
  let gtao = null;
  if (!small) {
    gtao = new GTAOPass(scene, camera, 4, 4);
    gtao.blendIntensity = 0.9;
    gtao.updateGtaoMaterial({ radius: 0.55, distanceExponent: 1.4, thickness: 1.2, scale: 1.0, samples: 12 });
    gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 });
    const orig = gtao.renderOverride.bind(gtao);
    gtao.renderOverride = function () { const l2 = camera.layers.isEnabled(2); camera.layers.disable(2); if (scanBusy) camera.layers.disable(3); orig.apply(null, arguments); if (l2) camera.layers.enable(2); camera.layers.enable(3); };
    composer.addPass(gtao);
  }
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.2, 0.55, 0.92); composer.addPass(bloom);
  composer.addPass(new OutputPass());
  const grade = new ShaderPass({
    uniforms: { tDiffuse: { value: null }, uSeed: { value: 0 }, uVig: { value: 0.22 }, uGrain: { value: 0.03 }, uRes: { value: new THREE.Vector2(1, 1) } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform sampler2D tDiffuse; uniform float uSeed, uVig, uGrain; uniform vec2 uRes; varying vec2 vUv;
      float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      void main(){
        vec4 c = texture2D(tDiffuse, vUv);
        vec2 d = vUv - 0.5; d.x *= uRes.x / uRes.y;
        float v = smoothstep(0.95, 0.25, length(d)); c.rgb *= mix(1.0 - uVig, 1.0, v);
        c.rgb = mix(c.rgb, c.rgb * c.rgb * (3.0 - 2.0 * c.rgb), 0.18);
        float g = h(vUv * uRes + uSeed) - 0.5; c.rgb += g * uGrain;
        gl_FragColor = c;
      }`
  });
  composer.addPass(grade);
  let fxaa = null;
  if (small) { fxaa = new ShaderPass(FXAAShader); composer.addPass(fxaa); }
  let scanBusy = false;

  /* ---------- labels (HTML, projected) ---------- */
  const labels = [], V3 = new THREE.Vector3();
  function label(text, pos, vis) {
    const el = document.createElement('div'); el.className = 'lbl'; el.innerHTML = '<i></i><span>' + text + '</span>';
    labelsEl.appendChild(el); labels.push({ el, pos, vis, on: false });
  }
  const ST = {};
  const lay = (c, i, text, which) => label(text, () => { const L = c.layers[i]; return [c.r.x1, L.y1 + (L.lift || 0), c.r.z0]; }, () => ramp(0.55, 0.9, ST[which]));
  lay(colS, 0, 'Steypa 10–12 cm', 'eS');
  label('Snjóbræðsla', () => [SAMPLE.stett.x1 - 0.3, snow.position.y, SAMPLE.stett.z0 + 0.25], () => ramp(0.55, 0.9, ST.eS));
  lay(colS, 1, 'Burðarlag 40 cm', 'eS'); lay(colS, 2, 'Frostfrí fylling', 'eS');
  lay(colG, 0, 'Túnþökur', 'eG'); lay(colG, 1, 'Gróðurmold 25 cm', 'eG'); lay(colG, 2, 'Fylling', 'eG');
  lay(colH, 0, 'Hellur 6 cm', 'eH'); lay(colH, 1, 'Sandur 3 cm', 'eH'); lay(colH, 2, 'Burðarlag 40 cm', 'eH'); lay(colH, 3, 'Frostfrí fylling', 'eH');
  label('Grafið niður á 1,6 m', () => [8.2, -1.6, -1.2], () => ST.lblDig);
  label('Sökklar', () => [1.0, 0.3 + ST.footY, HOUSE.z1], () => ST.lblFoot);
  label('Húspúði, þjappaður í lögum', () => [8.6, ST.padTop, -8.0], () => ST.lblPad);
  label('Stofnlagnir í götu', () => [3.2, -0.6, 15.5], () => ST.lblP);
  label('Heimæðar', () => [7.9, -0.6, 8.5], () => ST.lblP);
  label('Fráveita', () => [9.3, -2.0, 9.0], () => ST.lblP);
  label('Drenlögn', () => [-10.5, -1.55, -5.0], () => ST.lblP);

  /* ---------- camera keyframes: eye, target, lens; desktop pushes the subject right of the text ---------- */
  const K = [
    { eye: [27, 9.5, 36], tgt: [3.0, 2.6, -4.6], fov: 30, ox: 0.16, oy: 0.06 },
    { eye: [13.4, 2.9, 9.8], tgt: [6.8, 1.05, 1.15], fov: 34, ox: 0.15, oy: 0.04 },
    { eye: [16.4, 3.1, 15.8], tgt: [8.6, 0.85, 6.3], fov: 34, ox: 0.15, oy: 0.04 },
    { eye: [-0.2, 3.5, 16.2], tgt: [-6.6, 0.85, 6.5], fov: 34, ox: 0.15, oy: 0.04 },
    { eye: [17.5, 21, 16], tgt: [1.5, -1.0, -5.0], fov: 38, ox: 0.15, oy: 0.04 },
    { eye: [27, 12.5, 34], tgt: [2.5, -1.4, 5.0], fov: 36, ox: 0.15, oy: 0.04 },
    { eye: [-22, 9.0, 35], tgt: [1.0, 2.6, -4.6], fov: 30, ox: 0.16, oy: 0.06 }
  ];
  function key(i) {
    const k = K[i];
    if (!mobile()) return k;
    const e = k.eye.map((v, j) => k.tgt[j] + (v - k.tgt[j]) * (i === 0 || i === 6 ? 1.55 : i >= 4 ? 1.45 : 1.6));
    const tg = i === 4 ? [k.tgt[0] - 1.5, k.tgt[1], k.tgt[2] + 1] : k.tgt;
    return { eye: e, tgt: tg, fov: k.fov + 10, ox: 0, oy: i === 0 || i === 6 ? 0.2 : 0.22 };
  }
  const sway = { x: 0, y: 0, tx: 0, ty: 0 };
  const CAM = { eye: [0, 0, 0], tgt: [0, 0, 0], fov: 30, ox: 0, oy: 0 };
  let intro = 1;
  function camAt(t, out) {
    t = clamp(t || 0, 0, N);
    const i = Math.min(N - 1, Math.floor(t)), f = t - i;
    const a = key(i), b = key(i + 1); let k = ss(ramp(0.16, 0.9, f)); if (t >= N) k = 1;
    for (let j = 0; j < 3; j++) { out.eye[j] = lerp(a.eye[j], b.eye[j], k); out.tgt[j] = lerp(a.tgt[j], b.tgt[j], k); }
    out.fov = lerp(a.fov, b.fov, k); out.ox = lerp(a.ox, b.ox, k); out.oy = lerp(a.oy, b.oy, k);
    out.eye[1] += Math.sin(Math.PI * k) * (i < 3 ? 2.6 : 0);
    // intro: start higher and further out, glide in
    const q = 1 - easeOutCubic(intro);
    if (q > 0) { for (let j = 0; j < 3; j++) out.eye[j] += (out.eye[j] - out.tgt[j]) * 0.45 * q; out.eye[1] += 9 * q; }
    return out;
  }
  function applyCamera(cam, c, w, h) {
    cam.fov = c.fov; cam.aspect = w / h;
    const s = 1.2;
    cam.position.set(c.eye[0] + sway.x * s, c.eye[1] - sway.y * s * 0.6, c.eye[2]);
    cam.lookAt(c.tgt[0], c.tgt[1], c.tgt[2]);
    cam.setViewOffset(w, h, -c.ox * w, c.oy * h, w, h);
    cam.updateProjectionMatrix();
  }

  /* ---------- the whole state for a given t ---------- */
  function apply(t) {
    const duskK = clamp(1 - sm(0.1, 0.75, t) + sm(5.3, 5.95, t), 0, 1);
    lighting(duskK);
    const eS = bump(0.4, 0.9, 1.1, 1.5, t), sS = t > 1.0 && t < 1.6 ? ramp(1.1, 1.5, t) : 0;
    const eG = bump(1.45, 1.92, 2.1, 2.5, t), sG = t > 2.0 && t < 2.6 ? ramp(2.1, 2.5, t) : 0;
    const eH = bump(2.45, 2.92, 3.08, 3.42, t), sH = t > 3.0 && t < 3.5 ? ramp(3.08, 3.42, t) : 0;
    ST.eS = eS; ST.eG = eG; ST.eH = eH;
    const gone = sm(3.36, 3.7, t), back = sm(5.45, 5.92, t);
    const raw = sm(3.45, 3.8, t) * (1 - sm(5.38, 5.82, t));
    const digP = sm(3.56, 3.78, t), pour = sm(3.8, 3.93, t);
    const fillP = layers(ramp(3.88, 4.16, t), 5);
    const backfill = sm(4.28, 4.5, t);
    const dig = digP * (1 - backfill);
    const fade = sm(4.3, 4.52, t) * (1 - sm(5.3, 5.55, t));
    const xr = sm(4.4, 4.68, t) * (1 - sm(5.14, 5.4, t));
    const site = bump(3.6, 3.8, 4.24, 4.4, t);
    ST.dig = dig; ST.lblDig = site * ramp(0.7, 1, digP) * (1 - backfill); ST.lblFoot = site * ramp(0.6, 1, pour); ST.lblPad = site * ramp(0.15, 0.4, fillP);
    ST.lblP = bump(4.86, 4.98, 5.15, 5.28, t);

    // samples
    placeColumn(colS, eS);
    snow.visible = eS > 0.02; snow.position.y = -0.06 + 2.05 * ss(clamp(eS * 1.35 - 0.06, 0, 1));
    placeColumn(colG, eG);
    const turf = colG.layers[0], r = SAMPLE.gras, W = r.x1 - r.x0;
    roll.visible = false; bladesG.position.set(0, turf.lift || 0, 0); bladesG.scale.set(1, 1, 1);
    if (sG > 0 && sG < 1) {
      const sx = sG < 0.45 ? lerp(1, 0.06, ss(sG / 0.45)) : lerp(0.06, 1, ss((sG - 0.45) / 0.55));
      turf.m.scale.x = W * sx; turf.m.position.x = r.x0 + W * sx / 2;
      bladesG.scale.x = sx; bladesG.position.x = r.x0 * (1 - sx);
      const rad = 0.07 + 0.3 * (1 - sx);
      roll.visible = true; roll.scale.set(rad, rad, r.z1 - r.z0); roll.position.set(r.x0 + W * sx, turf.m.position.y + rad - 0.03, (r.z0 + r.z1) / 2);
    }
    placeColumn(colH, eH);
    const lp = colH.layers[0].lift || 0, nP = pavList.length;
    layPavers((i) => {
      let s = 1, y = lp;
      if (sH > 0 && sH < 1) {
        if (sH < 0.35) s = 1 - ss(sH / 0.35);
        else { const k = (sH - 0.35) / 0.65, d = (i / (nP - 1)) * 0.7, q = clamp((k - d) / 0.3, 0, 1); s = q > 0 ? 1 : 0; y = 1.4 * (1 - q) * (1 - q); }
      }
      return { y, s: Math.max(0.0001, s) };
    });
    // finished surfaces are stripped back to soil and gravel, and come back at the end
    RAW.v.value = raw * 1.04;
    pits.forEach((c) => digColumn(c, 1.6 * dig));
    // the house and garden dissolve top-down with a pink scan, and rebuild bottom-up
    const cut = back > 0 ? lerp(-0.4, 8.2, back) : lerp(8.2, -0.4, gone);
    SCAN.cut.value = cut; scanBusy = cut > -0.35 && cut < 8.1;
    house.visible = garden.visible = cut > -0.35;
    // footings: in place under the house, hidden once the scan passes, then poured in the pit
    const footY = (t > 3.62 && t < 5.5) ? -1.95 * (1 - pour) : 0; ST.footY = footY;
    footings.forEach((m) => { m.position.y = m.userData.y + footY; m.visible = fade < 0.995 && footY > -1.9; });
    setOpacity(foot, 1 - fade);
    const padTop = lerp(lerp(lerp(0.15, -1.6, digP), 0.15, fillP), 0, fade); ST.padTop = padTop;
    pads.forEach((p) => setBox(p.m, p.r.x0 + 0.35, p.r.x1 - 0.35, -1.6, padTop, p.r.z0 + 0.35, p.r.z1 - 0.35));
    // x-ray: surfaces fade keeping depth, a ghost block takes over, pipes grow in
    const so = 1 - xr;
    SOILMATS.forEach((m) => { setOpacity(m, so); m.visible = so > 0.01; });
    const gx = ramp(0.35, 1, xr);
    ghostMat.opacity = 0.5 * gx; ghost.visible = gx > 0.01; voidMat.opacity = ramp(0, 0.5, xr); voidBox.visible = xr > 0.005; ghostLineMat.opacity = 0.45 * gx; strataLineMat.opacity = 0.5 * gx;
    trenchMat.opacity = 0.3 * xr; outlineMat.opacity = 0.8 * xr; shaft.visible = xr > 0.02;
    pipes.forEach((p) => { const f = ramp(p.from, p.to, t), n = Math.round(f * p.segs); p.m.visible = n > 0; p.m.geometry.setDrawRange(0, n * 12 * 6); });
  }
  function setOpacity(m, o) {
    const tr = o < 0.999;
    if (m.transparent !== tr) { m.transparent = tr; m.needsUpdate = true; }
    m.opacity = o; m.depthWrite = true;
  }

  /* ---------- sizing ---------- */
  let S = 1, vh = innerHeight, W = 1, Hh = 1;
  function size() {
    W = stage.clientWidth; Hh = stage.clientHeight;
    renderer.setSize(W, Hh, false);
    const pr = renderer.getPixelRatio();
    composer.setPixelRatio(pr); composer.setSize(W, Hh);
    if (fxaa) fxaa.material.uniforms.resolution.value.set(1 / (W * pr), 1 / (Hh * pr));
    grade.uniforms.uRes.value.set(W * pr, Hh * pr);
    vh = innerHeight; S = Math.round(vh * 1.25);
    const hpx = (vh + N * S) + 'px';
    if (story.style.height !== hpx) { story.style.height = hpx; window.dispatchEvent(new Event('pb:size')); }
    dirty = true; kick();
  }

  /* ---------- overlays: chapter text, rail, minimap, labels ---------- */
  const chapters = [].slice.call(document.querySelectorAll('.ch'));
  const railBtns = [].slice.call(document.querySelectorAll('.rail button'));
  const mapEl = document.getElementById('minimap'), capEl = document.getElementById('mapcap');
  let lastActive = -1;
  function overlays(t) {
    chapters.forEach((el, i) => {
      const d = t - i; let o = clamp(1 - Math.abs(d) * 2.3, 0, 1);
      if (i === 0 && t < 0.02) o = 1; if (i === N && t > N - 0.02) o = 1;
      el.style.opacity = o.toFixed(3); el.style.transform = 'translate3d(0,' + (-d * 70).toFixed(1) + 'px,0)';
      const vis = o > 0.02; if (el._vis !== vis) { el._vis = vis; el.style.visibility = vis ? 'visible' : 'hidden'; }
    });
    const a = Math.round(t);
    if (a !== lastActive) {
      lastActive = a;
      railBtns.forEach((b, i) => b.setAttribute('aria-current', i === a ? 'step' : 'false'));
      if (mapEl) mapEl.setAttribute('data-ch', a);
      if (capEl) capEl.textContent = capEl.getAttribute('data-c' + a) || '';
      window.dispatchEvent(new CustomEvent('pb:chapter', { detail: a }));
    }
    labels.forEach((L) => {
      const o = intro < 1 ? 0 : L.vis();
      if (o < 0.02) { if (L.on) { L.el.style.opacity = '0'; L.on = false; } return; }
      const p = L.pos(); V3.set(p[0], p[1], p[2]).project(camera);
      if (V3.z > 1) { L.el.style.opacity = '0'; L.on = false; return; }
      const px = (V3.x * 0.5 + 0.5) * W;
      if (!L.sw) L.sw = L.el.lastChild.offsetWidth || 120;
      const flip = px + 22 + L.sw > W - (mobile() ? 6 : 150); if (L.flip !== flip) { L.flip = flip; L.el.classList.toggle('flip', flip); }
      L.el.style.transform = 'translate3d(' + px.toFixed(1) + 'px,' + ((-V3.y * 0.5 + 0.5) * Hh).toFixed(1) + 'px,0)';
      L.el.style.opacity = o.toFixed(3); L.on = true;
    });
  }

  /* ---------- loop: the scroll position (smoothed by Lenis) eases toward a target; render only when something moves ---------- */
  let T = 0, target = 0, dirty = true, raf = 0, last = 0, building = false, frameN = 0;
  function readTarget() { const r = story.getBoundingClientRect(); return clamp(-r.top / S, 0, N); }
  function render() {
    apply(T); camAt(T, CAM); applyCamera(camera, CAM, W, Hh);
    grade.uniforms.uSeed.value = (frameN++ % 64) * 1.37;
    composer.render(); overlays(T);
  }
  let slowEma = 0.016, slowN = 0, level = 0;
  function degrade() {
    level++;
    if (level === 1 && gtao) { gtao.enabled = false; }
    else if (level <= 2) { renderer.setPixelRatio(1); size(); }
    else { bloom.enabled = false; sun.shadow.mapSize.set(1024, 1024); if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; } }
    slowN = 0; slowEma = 0.016;
  }
  function frame(now) {
    raf = 0;
    const rawDt = ((now - last) || 16) / 1000;
    const dt = clamp(rawDt, 0.004, 0.05); last = now;
    target = readTarget();
    const moving = Math.abs(target - T) > 0.0004;
    if (moving) T = clamp(T + (target - T) * (reduce ? 1 : 1 - Math.exp(-dt * 7)), 0, N); else T = target;
    sway.x += (sway.tx - sway.x) * (1 - Math.exp(-dt * 3)); sway.y += (sway.ty - sway.y) * (1 - Math.exp(-dt * 3));
    const swaying = Math.abs(sway.tx - sway.x) + Math.abs(sway.ty - sway.y) > 0.002;
    const r = story.getBoundingClientRect(), onScreen = r.bottom > 0 && r.top < innerHeight;
    if (onScreen && (moving || swaying || building || dirty)) {
      render(); dirty = false;
      if (moving && rawDt < 0.5 && level < 3 && !/nosnap/.test(location.search)) { slowEma += (rawDt - slowEma) * 0.08; if (slowEma > 0.036) { if (++slowN > 45) degrade(); } else slowN = Math.max(0, slowN - 1); }
    }
    if (moving || swaying || building) raf = requestAnimationFrame(frame);
  }
  function kick() { if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame); } }
  addEventListener('scroll', kick, { passive: true });
  addEventListener('resize', size);
  if (window.matchMedia && matchMedia('(hover: hover)').matches && !reduce) {
    addEventListener('pointermove', (e) => { sway.tx = (e.clientX / innerWidth - 0.5); sway.ty = (e.clientY / innerHeight - 0.5); kick(); }, { passive: true });
  }

  /* ---------- snapshots of the same lot for the service cards (rendered on the main canvas, copied out in the same task) ---------- */
  function snapshots(list) {
    const cv = document.createElement('canvas'), ctx = cv.getContext('2d');
    let i = 0;
    function one() {
      if (i >= list.length) { dirty = true; kick(); return; }
      const j = list[i++];
      const aspect = 36 / 25, w = W, h = Hh;
      let cw = w, ch = w / aspect; if (ch > h) { ch = h; cw = h * aspect; }
      const pr = renderer.getPixelRatio(), outW = Math.min(760, Math.round(cw * pr)), outH = Math.round(outW / aspect);
      cv.width = outW; cv.height = outH;
      apply(j.t);
      const c = { eye: j.eye.slice(), tgt: j.tgt.slice(), fov: j.fov, ox: 0, oy: 0 };
      // frame the job in the centre crop
      camera.fov = c.fov; applyCamera(camera, c, w, h);
      camera.setViewOffset(w, h, 0, 0, w, h); camera.fov = 2 * THREE.MathUtils.radToDeg(Math.atan(Math.tan(THREE.MathUtils.degToRad(c.fov) / 2) * (h / ch))); camera.updateProjectionMatrix();
      composer.render();
      ctx.drawImage(canvas, (w - cw) / 2 * pr, (h - ch) / 2 * pr, cw * pr, ch * pr, 0, 0, outW, outH);
      let url = ''; try { url = cv.toDataURL('image/webp', 0.82); } catch (e) {}
      render();
      if (url && j.img) { j.img.src = url; j.img.closest('.card') && j.img.closest('.card').classList.add('has-img'); }
      if (window.requestIdleCallback) requestIdleCallback(one, { timeout: 600 }); else setTimeout(one, 120);
    }
    one();
  }

  /* ---------- intro: the camera glides in from above while the lights come on ---------- */
  function buildIntro(ms) {
    return new Promise((res) => {
      if (reduce || !ms) { intro = 1; lampOn = 1; expo = 1; dirty = true; kick(); res(); return; }
      building = true; const t0 = performance.now();
      (function step(now) {
        const k = clamp((now - t0) / ms, 0, 1);
        intro = k; lampOn = sm(0.35, 0.95, k); expo = lerp(0.35, 1, easeOutCubic(clamp(k * 1.6, 0, 1)));
        if (k < 1) requestAnimationFrame(step); else { building = false; res(); }
        dirty = true; kick();
      })(t0);
    });
  }

  size();
  intro = 0; lampOn = 0; expo = 0.35;
  T = target = readTarget();
  // compile everything before the first visible frame
  try { await renderer.compileAsync(scene, camera); } catch (e) {}
  render();

  window.PBStory = {
    prepare() { dirty = true; kick(); },
    build: buildIntro,
    snapshots(list) { if (/nosnap/.test(location.search)) return; snapshots(list); },
    timeFrame() { const t0 = performance.now(); render(); renderer.getContext().finish(); return performance.now() - t0; },
    chapterTop(i) { return story.getBoundingClientRect().top + scrollY + i * S + 2; },
    get S() { return S; }
  };
  window.dispatchEvent(new Event('pbstory'));
}
