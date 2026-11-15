/* P. Blöndal – a realistic lot, one continuous camera move driven by scroll. The lot is built up in the order the work is done:
   Chapters (t): 0 pipes (x-ray) · 1 foundation, then the building rises · 2 asphalt · 3 concrete sidewalks · 4 pavers · 5 lawn · 6 fence and gate · 7 finished.
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
const N = 7;
const TEXBASE = (document.querySelector('meta[name="pb-tex"]') || {}).content || 'tex/';
// language from <html lang>: the labels in the scene come in Icelandic and English
const EN = (root.lang || '').slice(0, 2) === 'en';
const loc = (is, en) => (EN ? en : is);
// light theme = daylight (afternoon at the ends), dark theme = golden hour at the start and the end
const isDark = () => root.getAttribute('data-theme') === 'dark';

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
    'sand', 'sand_n', 'clay', 'clay_n', 'rock', 'rock_n', 'gravel', 'gravel_n', 'hedge', 'hedge_n', 'bark', 'leaves', 'clad', 'clad_n'];
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
  const GRIME = `{
    float gy = vDWP.y, ga = vDWP.x + vDWP.z;
    float gr = 0.955 + 0.09 * pbH(vec2(floor(ga / 0.9), 7.0));
    gr *= 1.0 - 0.14 * (1.0 - smoothstep(1.1, 2.6, gy));
    float st = pbN(vec2(ga * 2.3, 1.0)) * smoothstep(0.3, 0.8, pbN(vec2(ga * 0.27, 5.0)));
    gr *= 1.0 - 0.2 * st * smoothstep(7.4, 11.5, gy);
    gr *= 1.0 - 0.1 * st * smoothstep(8.2, 7.0, gy) * smoothstep(4.5, 7.6, gy);
    diffuseColor.rgb *= gr;
  }`;
  const SCAN = { cut: { value: 99 }, edge: { value: 0.3 }, glow: { value: new THREE.Color('#f90160').multiplyScalar(3.4) } };
  // each finished surface is laid in its own chapter: 1.04 = not laid yet (the soil or gravel under it shows), 0 = laid.
  // sweep = [ax, az, b, w]: the surface comes in along a direction (w = how much of the edge follows it rather than the noise)
  const mask = (sweep) => ({ v: { value: 1.04 }, sw: { value: new THREE.Vector4(...(sweep || [0, 0, 0, 0])) } });
  const MASK = {
    asph: mask([1 / 46, 0, 12 / 46, 0.82]),       // the yard, paved in strips from the east end
    conc: mask([1 / 68, 0, 0.5, 0.55]),           // aprons and sidewalks, poured from the east end
    pav: mask([0, 1 / 10.5, -3.5 / 10.5, 0.6]),   // the car park, laid from the street inwards
    turf: mask()                                  // turf: patches
  };
  function patch(mat, o) {
    o = o || {};
    const key = 'pb' + (o.box ? 'B' : '') + (o.scan ? 'S' : '') + (o.mask ? 'M' : '') + (o.depth ? 'D' : '') + (o.grime ? 'G' : '');
    mat.customProgramCacheKey = () => key;
    mat.onBeforeCompile = (sh) => {
      if (o.scan) { sh.uniforms.uCut = SCAN.cut; sh.uniforms.uEdge = SCAN.edge; sh.uniforms.uGlow = SCAN.glow; }
      if (o.mask) { sh.uniforms.uMask = o.mask.v; sh.uniforms.uSweep = o.mask.sw; }
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
      if (o.mask) decl += '\nuniform float uMask; uniform vec4 uSweep;';
      let cut = '';
      if (o.scan) cut += `
        float dN = pbN(vDWP.xz * 1.3) * 0.5 + pbN(vDWP.xz * 4.7 + 7.0) * 0.22;
        float dHh = vDWP.y + dN;
        if (dHh > uCut) discard;
        float dGlow = 1.0 - smoothstep(0.0, uEdge, uCut - dHh);`;
      if (o.mask) cut += `
        float mN = pbN(vDWP.xz * 0.42) * 0.62 + pbN(vDWP.xz * 1.9 + 3.0) * 0.30 + pbN(vDWP.xz * 7.0) * 0.08;
        float mS = clamp(dot(vDWP.xz, uSweep.xy) + uSweep.z, 0.0, 1.0);
        if (mix(mN, mS, uSweep.w) < uMask) discard;`;
      let f = sh.fragmentShader.replace('#include <common>', '#include <common>' + decl)
        .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>' + cut);
      if (o.scan && !o.depth) f = f.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += uGlow * dGlow;');
      if (o.grime) f = f.replace('#include <map_fragment>', '#include <map_fragment>\n' + GRIME);
      sh.fragmentShader = f;
    };
    return mat;
  }
  const depthScan = patch(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }), { scan: true, depth: true });
  // shadow casters that are masked need the same mask in their depth material
  const DEPTHM = new Map();
  const depthMask = (m) => { if (!DEPTHM.has(m)) DEPTHM.set(m, patch(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }), { mask: m, depth: true })); return DEPTHM.get(m); };

  /* ---------- materials ---------- */
  function std(o) {
    const m = new THREE.MeshStandardMaterial({ color: o.c != null ? o.c : 0xffffff, roughness: o.r != null ? o.r : 0.9, metalness: o.m || 0 });
    if (o.map) m.map = o.map;
    if (o.n) { m.normalMap = o.n; m.normalScale.set(o.ns || 1, o.ns || 1); }
    if (o.e) { m.emissive = C(o.e); m.emissiveIntensity = o.ei != null ? o.ei : 1; }
    if (o.env != null) m.envMapIntensity = o.env;
    if (o.side) m.side = o.side;
    return patch(m, { box: o.box !== false && (o.map || o.n), scan: o.scan, mask: o.mask, grime: o.grime });
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
    farGrass: tex('grass', 7), farGrassN: tex('grass_n', 7, 1), roofG: tex('gravel', 1.6), clad: tex('clad', 1.8), cladN: tex('clad_n', 1.8, 1)
  };
  const bark = tex('bark'); bark.repeat.set(1, 1);
  const leavesT = tex('leaves'); leavesT.wrapS = leavesT.wrapT = THREE.ClampToEdgeWrapping;

  // ground layers: top material and side material per layer (they fade together in the x-ray)
  const SOILMATS = [];
  function soil(o) { const m = std(Object.assign({ r: 0.97 }, o)); SOILMATS.push(m); return m; }
  const G = {
    turf: soil({ map: TX.grass, n: TX.grassN, ns: 0.7, mask: MASK.turf, r: 0.95 }),
    turfS: soil({ map: TX.mold, n: TX.moldN, mask: MASK.turf }),
    mold: soil({ map: TX.dirt, n: TX.dirtN }), moldS: soil({ map: TX.mold, n: TX.moldN }),
    fill: soil({ map: TX.fill, n: TX.fillN }), clay: soil({ map: TX.clay, n: TX.clayN }), rock: soil({ map: TX.rock, n: TX.rockN, r: 0.85 }),
    base: soil({ map: TX.base, n: TX.baseN }), sand: soil({ map: TX.sand, n: TX.sandN }), gravel: soil({ map: TX.gravel, n: TX.gravelN }),
    conc: soil({ map: TX.conc, n: TX.concN, ns: 0.6, mask: MASK.conc, r: 0.88 }),
    pav: soil({ map: TX.pav, n: TX.pavN, ns: 0.9, mask: MASK.pav, r: 0.86 }),
    asph: soil({ map: TX.asph, n: TX.asphN, r: 0.92 }),               // the street: there from the start
    asphY: soil({ map: TX.asph, n: TX.asphN, r: 0.9, c: 0xe2e0dc, mask: MASK.asph }),   // the yard: laid in its chapter
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
  const H = {   // the building and the site furniture: dissolve with the scan
    clad: std({ map: TX.clad, n: TX.cladN, ns: 1.0, r: 0.34, m: 0.62, c: 0xcdd5dc, scan: 1, grime: 1 }),
    truck: std({ c: 0xeceae4, r: 0.45, m: 0.1, scan: 1 }),
    cab: std({ c: 0x1f3a56, r: 0.3, m: 0.45, scan: 1 }),
    tyre: std({ c: 0x161616, r: 0.9, scan: 1 }),
    cladL: std({ map: TX.clad, n: TX.cladN, ns: 1.0, r: 0.45, m: 0.5, c: 0xdfe3e6, scan: 1 }),
    band: std({ c: 0xcfd3d0, r: 0.3, e: '#fff1d8', ei: 0, scan: 1 }),
    panel: std({ c: 0xf2f1ec, e: '#fff4e2', ei: 0, r: 0.6, scan: 1 }),
    line: std({ c: 0xeeeae2, r: 0.7, mask: MASK.pav }),
    grate: std({ c: 0x2a2c2f, r: 0.5, m: 0.6, mask: MASK.asph }),
    dwin: std({ c: 0x0f1215, e: '#ffd6a0', ei: 0, r: 0.12, env: 1.3, scan: 1 }),
    wlight: std({ c: 0xf4efe6, e: '#fff0d8', ei: 0, r: 0.3, scan: 1 }),
    bollard: std({ c: 0xd6a51c, r: 0.45, m: 0.15, scan: 1 }),
    film: std({ c: 0xb7966b, r: 0.42, env: 1.1, scan: 1 }),
    pallet: std({ map: TX.timber, n: TX.timberN, ns: 0.5, c: 0xe2cfae, r: 0.85, scan: 1 }),
    glassC: std({ c: 0x0b0e11, r: 0.06, m: 0.3, env: 1.6, scan: 1 }),
    chrome: std({ c: 0xc0c4c8, r: 0.22, m: 0.95, scan: 1 }),
    tail: std({ c: 0x7c1510, r: 0.35, scan: 1 }),
    lens: std({ c: 0xe6e8ea, r: 0.12, m: 0.4, scan: 1 }),
    trailer: std({ c: 0xe8e8e4, r: 0.5, m: 0.12, scan: 1 }),
    tractor: std({ c: 0x22344a, r: 0.3, m: 0.5, scan: 1 }),
    fenceP: std({ c: 0x3c4741, r: 0.5, m: 0.4, scan: 1 }),
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
  // Lot x -44..44, z -43..14; street (sidewalk, curb, road, curb, sidewalk) z 14..26.4.
  // A 64 x 30 m steel-clad hall with six drive-in doors, a two-storey office with a glass front, a concrete yard and a car park.
  const BX0 = -44, BX1 = 44, BZ0 = -43, BZ1 = 26.4;
  const HALL = R(-32, 32, -38, -8), OFFICE = R(-32, -14, -8, 0);
  const HOUSE = HALL, FOOTPRINTS = [HALL, OFFICE];
  // samples: a block of each surface that lifts out to show its layers (concrete apron, asphalt yard, lawn, car park)
  const SAMPLE = { stett: R(4, 7.5, -5.5, -2.5), asph: R(-6, -2.5, 6, 9), gras: R(-40.5, -37.5, -17, -14), hellur: R(-30.3, -27.3, 9.0, 12.0) };
  const PIT = [
    { r: R(-34, 34, -40, -38), type: 'lawn' }, { r: R(-34, -32, -38, 2), type: 'lawn' }, { r: R(32, 34, -38, -6), type: 'lawn' },
    { r: R(-12, 32, -8, -6), type: 'yard' }, { r: R(-14, -12, -8, 2), type: 'yard' }, { r: R(-32, -14, 0, 2), type: 'stett' }
  ];
  // the yard: a concrete apron in front of the doors, asphalt out to the street; a concrete sidewalk along the office; pavers in the car park
  const AREAS = [
    { r: R(-12, 34, -6, -2), type: 'yard' }, { r: R(-12, 34, -2, 14), type: 'asphy' }, { r: R(-34, -12, 2, 3.5), type: 'stett' }, { r: R(-42, -12, 3.5, 14), type: 'hellur' },
    { r: R(BX0, BX1, 14, 16), type: 'pubwalk' }, { r: R(BX0, BX1, 16, 16.2), type: 'curb' }, { r: R(BX0, BX1, 16.2, 24.2), type: 'road' },
    { r: R(BX0, BX1, 24.2, 24.4), type: 'curb' }, { r: R(BX0, BX1, 24.4, 26.4), type: 'pubwalk' }
  ];
  const DEEP = [['fill', -1.5, -0.6], ['clay', -2.8, -1.5], ['rock', -4.5, -2.8]];
  const STRATA = {
    lawn: [['turf', -0.06, 0], ['mold', -0.32, -0.06], ['fill', -1.5, -0.32], ['clay', -2.8, -1.5], ['rock', -4.5, -2.8]],
    stett: [['conc', -0.12, 0], ['base', -0.6, -0.12]].concat(DEEP),
    yard: [['conc', -0.22, 0], ['base', -0.72, -0.22], ['fill', -1.5, -0.72], ['clay', -2.8, -1.5], ['rock', -4.5, -2.8]],
    asphy: [['asphY', -0.08, 0], ['base', -0.6, -0.08], ['fill', -1.5, -0.6], ['clay', -2.8, -1.5], ['rock', -4.5, -2.8]],
    hellur: [['pav', -0.08, 0], ['sand', -0.11, -0.08], ['base', -0.6, -0.11]].concat(DEEP),
    pubwalk: [['pubw', -0.1, 0], ['base', -0.6, -0.1]].concat(DEEP),
    curb: [['curb', -0.45, 0], ['fill', -1.5, -0.45], ['clay', -2.8, -1.5], ['rock', -4.5, -2.8]],
    road: [['asph', -0.2, -0.12], ['base', -0.7, -0.2], ['fill', -1.5, -0.7], ['clay', -2.8, -1.5], ['rock', -4.5, -2.8]],
    foot: [['clay', -2.8, -1.6], ['rock', -4.5, -2.8]]
  };
  const TOPM = { turf: G.turf, mold: G.mold }, SIDEM = { turf: G.turfS, mold: G.moldS };
  const MASKOF = new Map([[G.turf, MASK.turf], [G.turfS, MASK.turf], [G.conc, MASK.conc], [G.pav, MASK.pav], [G.asphY, MASK.asph]]);
  const topMat = (k) => TOPM[k] || G[k], sideMat = (k) => SIDEM[k] || G[k];
  const SOLID = FOOTPRINTS.concat([SAMPLE.stett, SAMPLE.asph, SAMPLE.gras, SAMPLE.hellur]).concat(PIT.map((p) => p.r));
  // the building's main measures, used by the foundation, the walls and the labels
  const EAVE = 11.0, PAR = 11.7, CT = 0.25, UP = 1.1, OH = 8.0, OF = 4.0;
  const DOORS = [-8, -1, 6, 13, 20, 27], DW = 2.4, DH = 5.8;

  // static ground: a grid of columns, faces shared by two equal neighbours are dropped so the x-ray stays clean
  (function () {
    let xs = [BX0, BX1], zs = [BZ0, BZ1];
    SOLID.concat(AREAS.map((a) => a.r)).forEach((r) => { xs.push(r.x0, r.x1); zs.push(r.z0, r.z1); });
    const uniq = (a) => a.filter((v, i) => a.indexOf(v) === i).sort((p, q) => p - q);
    xs = uniq(xs).filter((v) => v >= BX0 && v <= BX1); zs = uniq(zs).filter((v) => v >= BZ0 && v <= BZ1);
    const boxes = [];
    for (let i = 0; i < xs.length - 1; i++) for (let j = 0; j < zs.length - 1; j++) {
      const cx = (xs[i] + xs[i + 1]) / 2, cz = (zs[j] + zs[j + 1]) / 2;
      if (SOLID.some((r) => inside(r, cx, cz))) continue;
      const a = AREAS.filter((q) => inside(q.r, cx, cz))[0];
      STRATA[a ? a.type : 'lawn'].forEach((s) => boxes.push({ k: s[0], x0: xs[i], x1: xs[i + 1], y0: s[1], y1: s[2], z0: zs[j], z1: zs[j + 1] }));
    }
    FOOTPRINTS.forEach((r) => STRATA.foot.forEach((s) => boxes.push({ k: s[0], x0: r.x0, x1: r.x1, y0: s[1], y1: s[2], z0: r.z0, z1: r.z1 })));
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
      const m = new THREE.Mesh(bg, mat); m.receiveShadow = true; m.castShadow = false; m.renderOrder = mat === G.turf || mat === G.conc || mat === G.pav || mat === G.asph || mat === G.asphY || mat === G.pubw || mat === G.curb ? 1 : 3;
      const mk = MASKOF.get(mat); if (mk) m.customDepthMaterial = depthMask(mk);
      world.add(m);
    });
  })();

  /* ---------- surroundings: lawns, the street both ways, neighbours, far houses, Esja ---------- */
  const env = new THREE.Group(); scene.add(env);
  (function () {
    const plane = (mat, x0, x1, z0, z1, y) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), mat); m.rotation.x = -Math.PI / 2; m.position.set((x0 + x1) / 2, y, (z0 + z1) / 2); m.receiveShadow = true; env.add(m); };
    const F = 5200;
    plane(O.grass, -F, BX0, -F, 14, 0); plane(O.grass, BX1, F, -F, 14, 0); plane(O.grass, BX0, BX1, -F, BZ0, 0); plane(O.grass, -F, F, 26.4, F, 0);
    plane(O.walk, -F, BX0, 14, 16, 0); plane(O.walk, BX1, F, 14, 16, 0); plane(O.walk, -F, BX0, 24.4, 26.4, 0); plane(O.walk, BX1, F, 24.4, 26.4, 0);
    plane(O.asph, -F, BX0, 16.2, 24.2, -0.12); plane(O.asph, BX1, F, 16.2, 24.2, -0.12);
    const b = new Bag();
    [[-F, BX0], [BX1, F]].forEach(([a, c]) => { b.box(O.curb, a, c, -0.12, 0, 16, 16.2); b.box(O.curb, a, c, -0.12, 0, 24.2, 24.4); });
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
  const neighbourDoor = std({ c: 0x34373b, r: 0.42, m: 0.5 });   // not the building's door material: that one is hidden until the building rises
  (function () {
    const b = new Bag();
    // industrial neighbours: big clad boxes with asphalt yards
    const ind = [0xd7dadc, 0x8e98a1, 0x5d636a, 0xc9c3b6].map((c) => std({ map: TX.clad, n: TX.cladN, r: 0.5, m: 0.45, c }));
    function industrial(x0, x1, z0, z1, h, seed, yardTo) {
      const r = rnd(seed), m = ind[seed % ind.length];
      b.box(m, x0, x1, 0, h, z0, z1); b.box(neighbourFascia, x0 - 0.05, x1 + 0.05, h, h + 0.3, z0 - 0.05, z1 + 0.05);
      const nd = Math.floor((x1 - x0) / 9);
      for (let i = 0; i < nd; i++) { const cx = x0 + 4 + i * 9; b.box(neighbourDoor, cx, cx + 4.2, 0, 4.6, z1, z1 + 0.04); }
      b.box(r() > 0.5 ? winGlow : neighbourGlass, x0 + 1, x0 + Math.min(14, (x1 - x0) * 0.35), h - 2.6, h - 1.4, z1 + 0.01, z1 + 0.05);
      b.box(O.asph, x0 - 2, x1 + 2, 0, 0.006, z1, yardTo != null ? yardTo : 14);
    }
    industrial(-104, -52, -34, -10, 9.5, 1); industrial(52, 98, -32, -8, 8.2, 2); industrial(-74, -52, -66, -44, 7.5, 3, -34); industrial(56, 84, -66, -40, 10, 4, -32);
    industrial(-34, 6, -88, -56, 8.5, 5, -46); industrial(16, 46, -94, -60, 11, 6, -46); industrial(-118, -80, -90, -56, 9, 7, -44); industrial(76, 124, -102, -76, 8, 8, -66);
    industrial(-158, -114, -36, -12, 10.5, 9); industrial(110, 152, -38, -14, 9, 10);
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
    const indPal = [0xb9bec2, 0xa3abb2, 0x6c757e, 0x8b939b, 0xc4c0b8, 0x4f565e].map((h) => new THREE.Color(h).multiplyScalar(0.8));
    const roofPal = [0x7a2e26, 0x3f5a46, 0x4b5560, 0x2d2f33, 0x2d2f33, 0x6d3b2e].map((h) => new THREE.Color(h));
    const gable = new THREE.BufferGeometry(); gable.setAttribute('position', new THREE.Float32BufferAttribute([-0.5,0,-0.5, 0.5,0,-0.5, 0,1,-0.5,  0.5,0,0.5, -0.5,0,0.5, 0,1,0.5,  -0.5,0,0.5, -0.5,0,-0.5, 0,1,-0.5,  -0.5,0,0.5, 0,1,-0.5, 0,1,0.5,  0.5,0,-0.5, 0.5,0,0.5, 0,1,0.5,  0.5,0,-0.5, 0,1,0.5, 0,1,-0.5], 3)); gable.computeVertexNormals();
    const peaks = new THREE.InstancedMesh(gable, new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0.3, side: THREE.DoubleSide }), n); let pi = 0;
    const o = new THREE.Object3D(), c = new THREE.Color();
    let hi = 0, wi = 0;
    for (let i = 0; i < n * 3 && hi < n; i++) {
      const d = 95 + Math.pow(r(), 1.4) * 1250, x = (r() - 0.5) * 2 * (180 + d * 1.3), z = -d - 15;
      if (Math.abs(x) < 130 && z > -150) continue;
      const big = d < 430 && r() < 0.5;
      const w = big ? 22 + r() * 30 : 9 + r() * 7, dd = big ? 16 + r() * 18 : 7 + r() * 4, h = big ? 6.5 + r() * 5 : (r() > 0.55 ? 6 + r() * 1.2 : 3.1 + r() * 0.6), rot = Math.round(r()) * Math.PI / 2 + (r() - 0.5) * (big ? 0.03 : 0.12);
      o.position.set(x, 0, z); o.rotation.set(0, rot, 0); o.scale.set(w, h, dd); o.updateMatrix(); houses.setMatrixAt(hi, o.matrix);
      houses.setColorAt(hi, c.copy(big ? indPal[Math.floor(r() * indPal.length)] : pal[Math.floor(r() * pal.length)]).multiplyScalar(0.9 + r() * 0.15));
      if (!big && r() < 0.5) { o.position.set(x, h, z); o.scale.set(dd + 0.6, 1.4 + r() * 1.2, w + 0.4); o.rotation.set(0, rot + Math.PI / 2, 0); o.updateMatrix(); peaks.setMatrixAt(pi, o.matrix); peaks.setColorAt(pi++, roofPal[Math.floor(r() * roofPal.length)]); o.rotation.set(0, rot, 0); o.scale.set(0.001, 0.001, 0.001); }
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
      if (Math.abs(x) < 120 && z > -150) continue;
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
  const pavGeo = new RoundedBoxGeometry(0.2955, 0.08, 0.1455, 2, 0.007);
  const pavMat = std({ n: TX.concN, ns: 0.35, r: 0.86, mask: MASK.pav, box: true });
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
  pavMesh.castShadow = true; pavMesh.receiveShadow = true; pavMesh.renderOrder = 1; pavMesh.customDepthMaterial = depthMask(MASK.pav);
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
      dummy.position.set(p[0], -0.04 + o.y, p[1]); dummy.scale.set(p[2] * o.s, o.s, o.s); dummy.updateMatrix(); pavMesh.setMatrixAt(i, dummy.matrix);
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
      const mk = MASKOF.get(top); if (mk) m.customDepthMaterial = depthMask(mk);
      world.add(m);
      c.layers.push({ m, y0: s[1], y1: s[2], off: offs ? offs[i] || 0 : 0 });
    });
    return c;
  }
  function ORDER(k) { return ['turf', 'conc', 'pav', 'asph', 'asphY', 'pubw', 'curb', 'stripe'].indexOf(k) >= 0 ? 1 : k === 'mold' || k === 'base' || k === 'sand' || k === 'gravel' ? 2 : k === 'fill' ? 3 : k === 'clay' ? 4 : 5; }
  const colS = column(SAMPLE.stett, 'yard', [2.9, 1.8, 0.6]);
  const colA = column(SAMPLE.asph, 'asphy', [2.6, 1.6, 0.55]);
  const colG = column(SAMPLE.gras, 'lawn', [2.3, 1.45, 0.5]);
  const colH = column(SAMPLE.hellur, 'hellur', [2.8, 2.1, 1.35, 0.5]);
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
  const bladeMat = patch(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, side: THREE.DoubleSide, envMapIntensity: 0.8 }), { mask: MASK.turf });
  SOILMATS.push(bladeMat);
  const dens = small ? 110 : 300;
  const lawnRects = [R(-43.1, -34.1, -30, -3)];
  const bladesMain = new THREE.Mesh(blades(lawnRects, [SAMPLE.gras], dens, 3), bladeMat); bladesMain.receiveShadow = true; world.add(bladesMain);
  const bladesS = new THREE.Mesh(blades([SAMPLE.gras], [], dens, 4), bladeMat); bladesS.receiveShadow = true;
  const bladesG = new THREE.Group(); bladesG.add(bladesS); world.add(bladesG);

  /* ---------- foundation: strip footings under the walls, column footings for the steel frame, the pad ---------- */
  const fnd = new THREE.Group(); world.add(fnd);
  const pads = [], footings = [];
  function addBox(parent, mat, x0, x1, y0, y1, z0, z1) { const m = new THREE.Mesh(UNIT, mat); setBox(m, x0, x1, y0, y1, z0, z1); m.castShadow = true; m.receiveShadow = true; parent.add(m); m.userData.y = m.position.y; return m; }
  function footWall(x0, x1, z0, z1) {
    footings.push(addBox(fnd, foot, x0, x1, -1.3, 0.3, z0, z1));
    const b = 0.8, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    footings.push((x1 - x0) > (z1 - z0) ? addBox(fnd, foot, x0 - 0.22, x1 + 0.22, -1.6, -1.3, cz - b / 2, cz + b / 2) : addBox(fnd, foot, cx - b / 2, cx + b / 2, -1.6, -1.3, z0 - 0.22, z1 + 0.22));
  }
  FOOTPRINTS.forEach((r) => { const pad = new THREE.Mesh(UNIT, padMat); pad.receiveShadow = true; pad.renderOrder = 2; fnd.add(pad); pads.push({ m: pad, r }); });
  const t = 0.35;
  footWall(HALL.x0, HALL.x1, HALL.z1 - t, HALL.z1); footWall(HALL.x0, HALL.x1, HALL.z0, HALL.z0 + t);
  footWall(HALL.x0, HALL.x0 + t, HALL.z0 + t, HALL.z1 - t); footWall(HALL.x1 - t, HALL.x1, HALL.z0 + t, HALL.z1 - t);
  footWall(OFFICE.x0, OFFICE.x1, OFFICE.z1 - t, OFFICE.z1); footWall(OFFICE.x0, OFFICE.x0 + t, OFFICE.z0, OFFICE.z1 - t); footWall(OFFICE.x1 - t, OFFICE.x1, OFFICE.z0, OFFICE.z1 - t);
  // column footings: a square pad and a pedestal with anchor bolts, every 8 m down the middle of the hall
  const boltGeo = [], CZ = (HALL.z0 + HALL.z1) / 2;
  for (let x = -24; x <= 24; x += 8) {
    footings.push(addBox(fnd, foot, x - 0.9, x + 0.9, -1.6, -1.1, CZ - 0.9, CZ + 0.9));
    footings.push(addBox(fnd, foot, x - 0.3, x + 0.3, -1.1, 0.3, CZ - 0.3, CZ + 0.3));
    [[-0.16, -0.16], [0.16, -0.16], [-0.16, 0.16], [0.16, 0.16]].forEach(([dx, dz]) => { const g = new THREE.CylinderGeometry(0.018, 0.018, 0.22, 6); g.translate(x + dx, 0.41, CZ + dz); boltGeo.push(g); });
  }
  const bolts = new THREE.Mesh(mergeGeometries(boltGeo, false), std({ c: 0x8a8d90, r: 0.35, m: 0.9 })); bolts.userData.y = 0; fnd.add(bolts); footings.push(bolts);

  /* ---------- the building: a steel-clad hall with drive-in doors, an office with a glass front ---------- */
  const house = new THREE.Group(); world.add(house);
  const hb = new Bag(), gl = new Bag();
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
  const slab = (r, y0, y1, ext) => {
    hb.box(H.fascia, r.x0 - ext, r.x1 + ext, y1 - 0.26, y1, r.z0 - ext, r.z1 + ext);
    hb.box(H.roof, r.x0 - ext + 0.05, r.x1 + ext - 0.05, y1, y1 + 0.02, r.z0 - ext + 0.05, r.z1 + ext - 0.05);
    hb.box(H.render, r.x0, r.x1, y0, y1 - 0.26, r.z0, r.z1);
  };
  // a single-material wall with openings (the hall: cladding inside and out)
  function shell(mat, axis, plane, out, a0, a1, y0, y1, holes, th) {
    const as = [a0, a1], ys = [y0, y1];
    holes.forEach((h) => { as.push(h.a0, h.a1); ys.push(h.y0, h.y1); });
    const uq = (v) => v.filter((x, i) => v.indexOf(x) === i).sort((p, q) => p - q);
    const A = uq(as).filter((v) => v >= a0 && v <= a1), Y = uq(ys).filter((v) => v >= y0 && v <= y1);
    for (let i = 0; i < A.length - 1; i++) for (let j = 0; j < Y.length - 1; j++) {
      const ca = (A[i] + A[i + 1]) / 2, cy = (Y[j] + Y[j + 1]) / 2;
      if (holes.some((h) => ca > h.a0 && ca < h.a1 && cy > h.y0 && cy < h.y1)) continue;
      const p0 = Math.min(plane, plane - out * th), p1 = Math.max(plane, plane - out * th);
      if (axis === 'z') hb.box(mat, A[i], A[i + 1], Y[j], Y[j + 1], p0, p1); else hb.box(mat, p0, p1, Y[j], Y[j + 1], A[i], A[i + 1]);
    }
  }
  // a thin dark flashing along a wall at height y, broken by the openings
  function ledge(axis, plane, out, a0, a1, y, holes) {
    const cuts = holes.filter((h) => h.y0 < y && h.y1 > y).sort((p, q) => p.a0 - q.a0), segs = [];
    let a = a0; cuts.forEach((h) => { if (h.a0 > a) segs.push([a, h.a0]); a = Math.max(a, h.a1); }); if (a < a1) segs.push([a, a1]);
    const o0 = Math.min(plane, plane + out * 0.075), o1 = Math.max(plane, plane + out * 0.075);
    segs.forEach(([p, q]) => (axis === 'z' ? hb.box(H.fascia, p, q, y, y + 0.05, o0, o1) : hb.box(H.fascia, o0, o1, y, y + 0.05, p, q)));
  }
  const PDOORS = [[2.0, 3.0], [16.0, 17.0]];
  const BY0 = 8.3, BY1 = 9.2;
  const band = (a0, a1) => hole(a0, a1, BY0, BY1);
  const FRONT = DOORS.map((c) => hole(c - DW, c + DW, 0.3, DH)).concat(PDOORS.map((p) => hole(p[0], p[1], 0.3, 2.4)));
  const EDOOR = hole(-22.5, -21.4, 0.3, 2.4);
  // concrete upstand all round, a drip flashing on top of it, trapezoidal steel cladding above
  shell(H.stone, 'z', HALL.z1 + 0.04, 1, HALL.x0 - 0.04, HALL.x1 + 0.04, 0.3, UP, FRONT, CT + 0.04);
  shell(H.stone, 'z', HALL.z0 - 0.04, -1, HALL.x0 - 0.04, HALL.x1 + 0.04, 0.3, UP, [], CT + 0.04);
  shell(H.stone, 'x', HALL.x1 + 0.04, 1, HALL.z0 + CT, HALL.z1 - CT, 0.3, UP, [EDOOR], CT + 0.04);
  shell(H.stone, 'x', HALL.x0 - 0.04, -1, HALL.z0 + CT, HALL.z1 - CT, 0.3, UP, [], CT + 0.04);
  ledge('z', HALL.z1, 1, OFFICE.x1, HALL.x1 + 0.04, UP, FRONT); ledge('z', HALL.z0, -1, HALL.x0 - 0.04, HALL.x1 + 0.04, UP, []);
  ledge('x', HALL.x1, 1, HALL.z0 - 0.04, HALL.z1 + 0.04, UP, [EDOOR]); ledge('x', HALL.x0, -1, HALL.z0 - 0.04, HALL.z1, UP, []);
  shell(H.clad, 'z', HALL.z1, 1, HALL.x0, HALL.x1, UP, PAR, FRONT.concat([band(-12, 31)]), CT);
  shell(H.clad, 'z', HALL.z0, -1, HALL.x0, HALL.x1, UP, PAR, [band(-30, 30)], CT);
  shell(H.clad, 'x', HALL.x1, 1, HALL.z0 + CT, HALL.z1 - CT, UP, PAR, [EDOOR, band(-36, -26), band(-18, -10)], CT);
  shell(H.clad, 'x', HALL.x0, -1, HALL.z0 + CT, HALL.z1 - CT, UP, PAR, [band(-36, -12)], CT);
  // dark corner flashings
  [[HALL.x1, HALL.z1, UP], [HALL.x0, HALL.z0, UP], [HALL.x1, HALL.z0, UP], [HALL.x0, HALL.z1, OH + 0.3]].forEach(([x, z, y0]) => hb.box(H.fascia, x - 0.1, x + 0.1, y0, PAR, z - 0.1, z + 0.1));
  hb.box(H.fascia, OFFICE.x1 - 0.02, OFFICE.x1 + 0.12, UP, PAR, HALL.z1 - 0.02, HALL.z1 + 0.12);
  // light bands: translucent panels in dark frames that glow at dusk
  function bandRun(axis, plane, out, a0, a1) {
    const n = Math.max(1, Math.round((a1 - a0) / 2.4)), st = (a1 - a0) / n;
    const mm = (p, q) => [Math.min(plane - out * p, plane - out * q), Math.max(plane - out * p, plane - out * q)];
    const [q0, q1] = mm(0.16, 0.1), [f0, f1] = mm(0.17, -0.012), [s0, s1] = mm(0.17, -0.06);
    if (axis === 'z') {
      gl.add(H.band, bx(a0, a1, BY0, BY1, q0, q1));
      for (let i = 0; i <= n; i++) { const a = a0 + i * st; hb.box(H.frame, a - 0.035, a + 0.035, BY0, BY1, f0, f1); }
      hb.box(H.fascia, a0 - 0.04, a1 + 0.04, BY0 - 0.05, BY0, s0, s1); hb.box(H.frame, a0, a1, BY1 - 0.04, BY1, f0, f1);
    } else {
      gl.add(H.band, bx(q0, q1, BY0, BY1, a0, a1));
      for (let i = 0; i <= n; i++) { const a = a0 + i * st; hb.box(H.frame, f0, f1, BY0, BY1, a - 0.035, a + 0.035); }
      hb.box(H.fascia, s0, s1, BY0 - 0.05, BY0, a0 - 0.04, a1 + 0.04); hb.box(H.frame, f0, f1, BY1 - 0.04, BY1, a0, a1);
    }
  }
  bandRun('z', HALL.z1, 1, -12, 31); bandRun('z', HALL.z0, -1, -30, 30);
  bandRun('x', HALL.x1, 1, -36, -26); bandRun('x', HALL.x1, 1, -18, -10); bandRun('x', HALL.x0, -1, -36, -12);
  // drive-in doors: sectional panels with grooves and a row of windows, dark frames, yellow bollards, a floodlight over each
  const zF = HALL.z1;
  DOORS.forEach((c) => {
    hb.box(H.gdoor, c - DW, c + DW, 0.3, DH, zF - 0.2, zF - 0.14);
    for (let y = 0.91; y < DH - 0.1; y += 0.61) hb.box(H.groove, c - DW, c + DW, y - 0.012, y + 0.012, zF - 0.14, zF - 0.135);
    for (let k = 0; k < 6; k++) { const w0 = c - DW + 0.32 + k * 0.73; hb.box(H.dwin, w0, w0 + 0.5, 3.47, 3.84, zF - 0.14, zF - 0.128); }
    hb.box(H.frame, c - DW - 0.12, c - DW, 0.3, DH + 0.12, zF, zF + 0.08); hb.box(H.frame, c + DW, c + DW + 0.12, 0.3, DH + 0.12, zF, zF + 0.08);
    hb.box(H.frame, c - DW - 0.12, c + DW + 0.12, DH, DH + 0.12, zF, zF + 0.08);
    [-1, 1].forEach((sd) => {
      const g = new THREE.CylinderGeometry(0.1, 0.1, 1.1, 14); g.translate(c + sd * (DW + 0.32), 0.55, zF + 0.32); hb.add(H.bollard, g);
      const k2 = new THREE.CylinderGeometry(0.102, 0.102, 0.12, 14); k2.translate(c + sd * (DW + 0.32), 0.86, zF + 0.32); hb.add(H.frame, k2);
    });
    hb.box(H.frame, c - 0.24, c + 0.24, DH + 0.5, DH + 0.72, zF, zF + 0.3);
    hb.box(H.wlight, c - 0.2, c + 0.2, DH + 0.49, DH + 0.5, zF + 0.03, zF + 0.27); hb.box(H.wlight, c - 0.17, c + 0.17, DH + 0.54, DH + 0.68, zF + 0.3, zF + 0.31);
  });
  PDOORS.forEach(([a, b2]) => {
    hb.box(H.gdoor, a, b2, 0.3, 2.4, zF - 0.18, zF - 0.12);
    hb.box(H.frame, a - 0.06, a, 0.3, 2.46, zF, zF + 0.05); hb.box(H.frame, b2, b2 + 0.06, 0.3, 2.46, zF, zF + 0.05); hb.box(H.frame, a - 0.06, b2 + 0.06, 2.4, 2.46, zF, zF + 0.05);
    hb.box(H.fascia, a - 0.35, b2 + 0.35, 2.75, 2.85, zF, zF + 0.9);
    hb.box(H.wlight, (a + b2) / 2 - 0.16, (a + b2) / 2 + 0.16, 2.74, 2.75, zF + 0.3, zF + 0.62);
  });
  // escape door on the east end
  hb.box(H.gdoor, HALL.x1 - 0.18, HALL.x1 - 0.12, 0.3, 2.4, EDOOR.a0, EDOOR.a1);
  hb.box(H.fascia, HALL.x1, HALL.x1 + 0.9, 2.75, 2.85, EDOOR.a0 - 0.35, EDOOR.a1 + 0.35);
  hb.box(H.wlight, HALL.x1 + 0.3, HALL.x1 + 0.62, 2.74, 2.75, (EDOOR.a0 + EDOOR.a1) / 2 - 0.16, (EDOOR.a0 + EDOOR.a1) / 2 + 0.16);
  // roof: slab inside the parapet, membrane, raised rooflight strips, rooftop units, cap on the parapet
  hb.box(H.clad, HALL.x0 + CT, HALL.x1 - CT, EAVE - 0.35, EAVE, HALL.z0 + CT, HALL.z1 - CT);
  hb.box(H.roof, HALL.x0 + CT, HALL.x1 - CT, EAVE, EAVE + 0.03, HALL.z0 + CT, HALL.z1 - CT);
  hb.box(H.fascia, HALL.x0 - 0.04, HALL.x1 + 0.04, PAR, PAR + 0.1, HALL.z1 - CT - 0.04, HALL.z1 + 0.04);
  hb.box(H.fascia, HALL.x0 - 0.04, HALL.x1 + 0.04, PAR, PAR + 0.1, HALL.z0 - 0.04, HALL.z0 + CT + 0.04);
  hb.box(H.fascia, HALL.x0 - 0.04, HALL.x0 + CT + 0.04, PAR, PAR + 0.1, HALL.z0, HALL.z1);
  hb.box(H.fascia, HALL.x1 - CT - 0.04, HALL.x1 + 0.04, PAR, PAR + 0.1, HALL.z0, HALL.z1);
  [-31, -23, -15].forEach((z) => { hb.box(H.cladL, -28.1, 28.1, EAVE + 0.03, EAVE + 0.3, z - 0.72, z + 0.72); gl.add(H.band, bx(-28, 28, EAVE + 0.3, EAVE + 0.56, z - 0.62, z + 0.62)); });
  [[-20, -20, 3, 1.6, 2.2], [10, -27, 2.2, 1.4, 2], [22, -18.5, 2.6, 1.5, 1.8], [-6, -35, 1.8, 1.2, 1.6], [-26, -34, 2.4, 1.3, 1.6]].forEach(([x, z, w, h, d]) => {
    hb.box(H.cladL, x - w / 2, x + w / 2, EAVE + 0.03, EAVE + 0.03 + h, z - d / 2, z + d / 2);
    hb.box(H.fascia, x - w / 2 + 0.2, x + w / 2 - 0.2, EAVE + 0.03 + h, EAVE + 0.08 + h, z - d / 2 + 0.2, z + d / 2 - 0.2);
  });
  // downpipes with hoppers under the parapet
  [[-12.6, zF + 0.08], [-4.5, zF + 0.08], [9.5, zF + 0.08], [31.4, zF + 0.08], [HALL.x1 + 0.08, -14], [HALL.x1 + 0.08, -36.5], [HALL.x0 - 0.08, -24], [-20, HALL.z0 - 0.08], [12, HALL.z0 - 0.08]].forEach(([x, z]) => {
    const g = new THREE.CylinderGeometry(0.07, 0.07, EAVE - 0.6, 10); g.translate(x, 0.3 + (EAVE - 0.6) / 2, z); hb.add(H.steel, g);
    hb.box(H.steel, x - 0.14, x + 0.14, EAVE - 0.75, EAVE - 0.3, z - 0.14, z + 0.14);
  });
  // office: white render with a glass curtain wall on the front and the west end
  wall('z', OFFICE.z1, 1, OFFICE.x0, OFFICE.x1, 0.3, OH, [hole(-31.2, -14.8, 0.35, OH - 0.35)], H.render, 0.3);
  wall('x', OFFICE.x0, -1, OFFICE.z0, OFFICE.z1 - 0.3, 0.3, OH, [hole(-7.0, -1.0, 0.35, OH - 0.35)], H.render, 0.3);
  wall('x', OFFICE.x1, 1, OFFICE.z0, OFFICE.z1 - 0.3, 0.3, OH, [hole(-6.2, -1.4, OF + 0.6, OH - 0.8)], H.render, 0.3);
  const mull = []; for (let x = -29.56; x < -14.9; x += 1.64) mull.push(x);
  win('z', OFFICE.z1, 1, -31.2, -14.8, 0.35, OH - 0.35, { mull, tran: [OF - 0.05, OF + 0.25], sb: 0.1 });
  win('x', OFFICE.x0, -1, -7.0, -1.0, 0.35, OH - 0.35, { mull: [-5.0, -3.0], tran: [OF - 0.05, OF + 0.25], sb: 0.1 });
  win('x', OFFICE.x1, 1, -6.2, -1.4, OF + 0.6, OH - 0.8, { mull: [-3.8], sb: 0.1, sill: 1 });
  slab(OFFICE, OH, OH + 0.3, 0.04);
  hb.box(H.fascia, OFFICE.x0 + 0.3, OFFICE.x1 - 0.3, OF - 0.05, OF + 0.25, OFFICE.z0 + 0.3, OFFICE.z1 - 0.3);   // floor slab, a dark band behind the glass
  hb.box(H.stone, OFFICE.x0 + 0.3, OFFICE.x1 - 0.3, 0.15, 0.3, OFFICE.z0 + 0.3, OFFICE.z1 - 0.3);
  hb.box(H.stone, OFFICE.x0 + 0.3, OFFICE.x1 - 0.3, OF + 0.25, OF + 0.27, OFFICE.z0 + 0.3, OFFICE.z1 - 0.3);
  hb.box(H.plaster, OFFICE.x0 + 0.3, OFFICE.x1 - 0.3, OF - 0.07, OF - 0.05, OFFICE.z0 + 0.3, OFFICE.z1 - 0.3);
  hb.box(H.plaster, OFFICE.x0 + 0.3, OFFICE.x1 - 0.3, OH - 0.02, OH, OFFICE.z0 + 0.3, OFFICE.z1 - 0.3);
  hb.box(H.plaster, OFFICE.x0 + 0.3, OFFICE.x1 - 0.3, 0.3, OH, OFFICE.z0, OFFICE.z0 + 0.04);   // lining on the hall wall behind the offices
  // ceiling light panels on both floors, desks, a reception counter
  [OF - 0.08, OH - 0.03].forEach((y) => { for (let x = -31.2; x < -15; x += 2.4) for (let z = -7.2; z < -1; z += 2.0) hb.box(H.panel, x, x + 1.2, y - 0.02, y, z, z + 0.6); });
  [0.3, OF + 0.27].forEach((y0) => { for (let x = -30.8; x < -16; x += 3.2) { hb.box(H.oak, x, x + 1.6, y0 + 0.72, y0 + 0.76, -4.0, -3.2); hb.box(H.steel, x + 0.05, x + 1.55, y0, y0 + 0.72, -3.95, -3.9); hb.box(H.fabric, x + 0.5, x + 1.1, y0, y0 + 0.9, -2.9, -2.4); } });
  hb.box(H.oak, -26.4, -23.6, 0.3, 1.1, -2.0, -1.4);
  // entrance: glass door in the curtain wall and a steel canopy
  hb.box(H.frame, -24.55, -23.09, 0.3, 2.6, OFFICE.z1 - 0.13, OFFICE.z1 - 0.07);
  hb.box(H.fascia, -26.7, -20.9, 3.15, 3.32, OFFICE.z1, OFFICE.z1 + 2.6);
  [-25.4, -23.8, -22.2].forEach((x) => { const g = new THREE.CylinderGeometry(0.07, 0.07, 0.02, 16); g.translate(x, 3.14, OFFICE.z1 + 1.6); hb.add(H.bulb, g); });
  lightsDusk.push([H.bulb, 9], [H.panel, 2.2], [H.band, 0.45], [H.dwin, 0.9], [H.wlight, 7]);
  const houseMeshes = hb.build(house, { depth: depthScan });
  const glassMeshes = gl.build(house, { cast: false });
  houseMeshes.forEach((m) => m.layers.set(3));
  glassMeshes.forEach((m) => { m.layers.set(3); m.renderOrder = 6; });
  // light that spills out of the office at dusk
  const pl1 = new THREE.PointLight(0xffd6a8, 0, 18, 1.6); pl1.position.set(-23, 2.6, -4); house.add(pl1);
  const pl2 = new THREE.PointLight(0xffd6a8, 0, 18, 1.6); pl2.position.set(-23, 6.6, -4); house.add(pl2);
  const pl3 = new THREE.PointLight(0xffc690, 0, 9, 1.8); pl3.position.set(-23.8, 3.0, 1.6); house.add(pl3);

  /* ---------- site: hedges, light poles, markings, wear, vehicles, goods, the fence ---------- */
  // each kind comes in its own chapter: poles with the asphalt, plants with the lawn, the fence in its own, vehicles at the end
  const garden = new THREE.Group(); world.add(garden);
  const plantsG = new THREE.Group(), polesG = new THREE.Group(), fleetG = new THREE.Group(), fenceG = new THREE.Group();
  garden.add(plantsG, polesG, fleetG, fenceG);
  const gb = new Bag(), plb = new Bag(), pob = new Bag();   // vehicles and goods, plants, poles
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
    g.computeVertexNormals(); g.translate((x0 + x1) / 2, h / 2, (z0 + z1) / 2); plb.add(H.hedge, g);
  }
  hedge(BX1 - 0.8, BX1, BZ0 + 0.2, 13.6, 1.4, 2); hedge(BX0 + 0.4, BX1 - 0.8, BZ0, BZ0 + 0.7, 1.6, 3);
  // the fence: welded mesh panels between posts on the west boundary, along the street in front of the yard and between
  // the yard and the car park, with a 12 m sliding gate at the yard entrance. Built outwards from the gate, one post at a time.
  const HF = 1.9, BAY = 2.5, GATE = { x0: 8, x1: 20, z: 13.7 };
  const RUNS = [[GATE.x1, 13.7, 43.2, 13.7], [GATE.x0, 13.7, -12, 13.7], [-12, 13.7, -12, 3.6], [BX0 + 0.4, 13.6, BX0 + 0.4, BZ0 + 0.7]];
  const meshMat = (() => {
    const cv = document.createElement('canvas'); cv.width = 64; cv.height = 128; const g = cv.getContext('2d');
    g.fillStyle = '#fff'; for (let i = 0; i < 64; i += 16) g.fillRect(i, 0, 4, 128); g.fillRect(0, 0, 64, 4); g.fillRect(0, 7, 64, 3);
    const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = maxAniso;
    return new THREE.MeshStandardMaterial({ map: t, color: 0x3c4741, roughness: 0.5, metalness: 0.4, transparent: true, depthWrite: false, side: THREE.DoubleSide });
  })();
  const meshPlane = (w, h) => { const g = new THREE.PlaneGeometry(w, h), uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w / 0.2, uv.getY(i) * h / 0.4); return g; };
  const posts = [], bays = [];   // posts: [x, z, order]; bays: [x, z, along x?, width, order]
  RUNS.forEach(([x0, z0, x1, z1]) => {
    const L = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(L / BAY)), alongX = Math.abs(x1 - x0) > Math.abs(z1 - z0);
    for (let k = 0; k <= n; k++) posts.push([lerp(x0, x1, k / n), lerp(z0, z1, k / n), (k / n) * L / 56]);
    for (let k = 0; k < n; k++) bays.push([lerp(x0, x1, (k + 0.5) / n), lerp(z0, z1, (k + 0.5) / n), alongX, L / n, ((k + 1) / n) * L / 56]);
  });
  const postGeo = new THREE.BoxGeometry(0.06, HF + 0.1, 0.06); postGeo.translate(0, (HF + 0.1) / 2, 0);
  const postMesh = new THREE.InstancedMesh(postGeo, H.fenceP, posts.length); postMesh.castShadow = true; postMesh.receiveShadow = true; fenceG.add(postMesh);
  const bayMesh = new THREE.InstancedMesh(meshPlane(BAY, HF), meshMat, bays.length); bayMesh.receiveShadow = true; bayMesh.layers.set(2); bayMesh.renderOrder = 5; fenceG.add(bayMesh);
  const railGeo = mergeGeometries([bx(-BAY / 2, BAY / 2, HF / 2 - 0.07, HF / 2 - 0.02, -0.025, 0.025), bx(-BAY / 2, BAY / 2, -HF / 2 + 0.05, -HF / 2 + 0.1, -0.025, 0.025)], false);
  const railMesh = new THREE.InstancedMesh(railGeo, H.fenceP, bays.length); railMesh.castShadow = true; railMesh.receiveShadow = true; fenceG.add(railMesh);
  // the gate: a steel frame with mesh infill on a guide rail, open (slid along the fence to the east) until the fence is up
  const gate = new THREE.Group(); fenceG.add(gate);
  (function () {
    const fb = new Bag(), W = GATE.x1 - GATE.x0, z = GATE.z - 0.14, f = 0.05;
    fb.box(H.fenceP, GATE.x0, GATE.x1, 0.12, 0.2, z - f, z + f); fb.box(H.fenceP, GATE.x0, GATE.x1, HF - 0.06, HF + 0.02, z - f, z + f);
    for (let k = 0; k <= 6; k++) { const x = GATE.x0 + k * W / 6; fb.box(H.fenceP, x - 0.04, x + 0.04, 0.12, HF + 0.02, z - f, z + f); }
    [[GATE.x0 + 0.6, 0.06], [GATE.x1 - 0.6, 0.06]].forEach(([x, r]) => { const w = new THREE.CylinderGeometry(r, r, 0.05, 14); w.rotateX(Math.PI / 2); w.translate(x, r, z); fb.add(H.steel, w); });
    fb.build(gate);
    const inf = new THREE.Mesh(meshPlane(W - 0.1, HF - 0.24), meshMat); inf.position.set((GATE.x0 + GATE.x1) / 2, 0.16 + (HF - 0.24) / 2 + 0.02, z); inf.layers.set(2); inf.renderOrder = 5; gate.add(inf);
    // gate posts, heavier than the rest, and the guide rail the gate runs on when open
    const gp = new Bag();
    [GATE.x0 - 0.08, GATE.x1 + 0.08].forEach((x) => gp.box(H.fenceP, x - 0.07, x + 0.07, 0, HF + 0.25, GATE.z - 0.07, GATE.z + 0.07));
    gp.box(H.steel, GATE.x1, GATE.x1 + W, 0, 0.05, z - 0.04, z + 0.04);
    gp.build(fenceG);
  })();
  const fo = new THREE.Object3D();
  function fenceAt(t) {
    const k = ramp(5.42, 6.0, t);
    fenceG.visible = k > 0;
    if (!fenceG.visible) return;
    // a post drops into its hole, then the panel after it drops onto the posts
    posts.forEach(([x, z, o], i) => {
      const q = clamp((k - o * 0.78) / 0.07, 0, 1);
      fo.position.set(x, 2.4 * (1 - q) * (1 - q), z); fo.rotation.set(0, 0, 0); fo.scale.set(1, Math.max(0.0001, ss(clamp(q * 3, 0, 1))), 1); fo.updateMatrix(); postMesh.setMatrixAt(i, fo.matrix);
    });
    bays.forEach(([x, z, ax, w, o], i) => {
      const q = clamp((k - o * 0.78 - 0.05) / 0.08, 0, 1);
      fo.position.set(x, 0.06 + HF / 2 + 1.6 * (1 - q) * (1 - q), z); fo.rotation.set(0, ax ? 0 : Math.PI / 2, 0); fo.scale.set(q > 0 ? w / BAY : 0.0001, q > 0 ? 1 : 0.0001, 1); fo.updateMatrix(); bayMesh.setMatrixAt(i, fo.matrix); railMesh.setMatrixAt(i, fo.matrix);
    });
    postMesh.instanceMatrix.needsUpdate = true; bayMesh.instanceMatrix.needsUpdate = true; railMesh.instanceMatrix.needsUpdate = true;
    gate.visible = k > 0.12;
    gate.position.x = (GATE.x1 - GATE.x0) * (1 - ss(ramp(5.98, 6.32, t)));
  }
  // light poles in the yard and the car park
  [[-42.9, 8.5], [-16.5, 13.8], [4.25, 12.8]].forEach(([x, z]) => {
    const p = new THREE.CylinderGeometry(0.07, 0.11, 8, 12); p.translate(x, 4, z); pob.add(H.steel, p);
    pob.box(H.steel, x - 0.3, x + 0.3, 7.9, 8.05, z - 0.7, z + 0.15); pob.box(H.bulb, x - 0.26, x + 0.26, 7.88, 7.9, z - 0.66, z + 0.1);
  });
  const sb = new Bag();
  // painted bays in the car park (none across the sample), gratings for storm water
  const BAYS = []; for (let x = -40.75; x < -13; x += 2.5) BAYS.push(x);
  BAYS.forEach((x) => { if (x < SAMPLE.hellur.x0 - 0.1 || x > SAMPLE.hellur.x1 + 0.1) sb.box(H.line, x - 0.05, x + 0.05, 0.002, 0.006, 8.6, 13.4); });
  sb.box(H.line, BAYS[0], BAYS[BAYS.length - 1], 0.002, 0.006, 8.5, 8.6);
  const GRATES = [[2, 3], [25.5, 4.5], [-21.5, 6.0], [-37.5, 6.0]];
  GRATES.forEach(([x, z]) => sb.box(H.grate, x - 0.3, x + 0.3, 0.002, 0.008, z - 0.3, z + 0.3));
  sb.build(world, { cast: false });
  // wear on the hard surfaces: a see-through layer with saw-cut joints, wheel tracks and oil spots, laid with the surface under it
  function wearTex(r, ppm, draw, cut) {
    const cv = document.createElement('canvas'); cv.width = Math.round((r.x1 - r.x0) * ppm); cv.height = Math.round((r.z1 - r.z0) * ppm);
    const g = cv.getContext('2d'), X = (x) => (x - r.x0) * ppm, Z = (z) => (z - r.z0) * ppm;
    draw(g, X, Z, ppm);
    (cut || []).forEach((q) => g.clearRect(X(q.x0), Z(q.z0), (q.x1 - q.x0) * ppm, (q.z1 - q.z0) * ppm));
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = maxAniso;
    return t;
  }
  const wearMat = (t, m) => patch(new THREE.MeshStandardMaterial({ map: t, transparent: true, depthWrite: false, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), { mask: m });
  function wearQuads(list, r, mat) {
    const u = (x) => (x - r.x0) / (r.x1 - r.x0), v = (z) => 1 - (z - r.z0) / (r.z1 - r.z0), y = 0.003;
    const geos = list.map((q) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute([q.x0, y, q.z1, q.x1, y, q.z1, q.x1, y, q.z0, q.x0, y, q.z0], 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0], 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute([u(q.x0), v(q.z1), u(q.x1), v(q.z1), u(q.x1), v(q.z0), u(q.x0), v(q.z0)], 2));
      g.setIndex([0, 1, 2, 0, 2, 3]); return g;
    });
    const m = new THREE.Mesh(mergeGeometries(geos, false), mat); m.receiveShadow = true; m.renderOrder = 2; world.add(m); return m;
  }
  const blot = (g, x, y, rad, a, sx) => {
    g.save(); g.translate(x, y); g.scale(sx || 1, 1);
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, rad); gr.addColorStop(0, 'rgba(24,22,20,' + a + ')'); gr.addColorStop(0.6, 'rgba(24,22,20,' + a * 0.45 + ')'); gr.addColorStop(1, 'rgba(24,22,20,0)');
    g.fillStyle = gr; g.fillRect(-rad, -rad, rad * 2, rad * 2); g.restore();
  };
  const APRON = R(-14, 34, -8, 14);
  const apronTex = wearTex(APRON, small ? 24 : 40, (g, X, Z, k) => {
    const r = rnd(41);
    for (let i = 0; i < 90; i++) blot(g, X(APRON.x0 + r() * 48), Z(APRON.z0 + r() * 22), (1.4 + r() * 3.6) * k, 0.035 + r() * 0.055, 0.6 + r() * 0.9);
    DOORS.forEach((c) => {
      blot(g, X(c), Z(-5.2), 3.2 * k, 0.07, 0.8);
      const bend = c < 10 ? -3.5 : 3.5;
      [-0.95, 0.95].forEach((o) => { for (let w = 0; w < 4; w++) {
        g.strokeStyle = 'rgba(32,29,26,' + (0.075 - w * 0.015) + ')'; g.lineWidth = (0.3 + w * 0.2) * k; g.lineCap = 'round';
        g.beginPath(); g.moveTo(X(c + o), Z(-8)); g.lineTo(X(c + o), Z(-1)); g.quadraticCurveTo(X(c + o), Z(7), X(c + o + bend), Z(14)); g.stroke();
      } });
      for (let i = 0; i < 6; i++) blot(g, X(c + (r() - 0.5) * 3.2), Z(-7 + r() * 8), (0.15 + r() * 0.45) * k, 0.12 + r() * 0.16, 0.7 + r() * 0.8);
    });
    // saw-cut joints in the concrete apron and the sidewalk beside the office; none in the asphalt
    g.strokeStyle = 'rgba(40,38,35,0.6)'; g.lineWidth = Math.max(1, 0.03 * k);
    [-11.5, -4.5, 2.5, 9.5, 16.5, 23.5, 30.5].forEach((x) => { g.beginPath(); g.moveTo(X(x), Z(-8)); g.lineTo(X(x), Z(-2)); g.stroke(); });
    g.beginPath(); g.moveTo(X(-14), Z(-5)); g.lineTo(X(34), Z(-5)); g.stroke();
    [-2, 0.8].forEach((z) => { g.beginPath(); g.moveTo(X(-14), Z(z)); g.lineTo(X(-12), Z(z)); g.stroke(); });
  }, [SAMPLE.stett, SAMPLE.asph]);
  const apronMat = wearMat(apronTex, MASK.conc);
  wearQuads([R(-12, 34, -6, -2)], APRON, apronMat);
  wearQuads([R(-12, 34, -2, 14)], APRON, wearMat(apronTex, MASK.asph));
  const apronPit = wearQuads([R(-12, 32, -8, -6), R(-14, -12, -8, 2)], APRON, apronMat);
  const PARK = R(-42, -12, 3.5, 14);
  const parkTex = wearTex(PARK, small ? 20 : 32, (g, X, Z, k) => {
    const r = rnd(43);
    for (let i = 0; i < 40; i++) blot(g, X(PARK.x0 + r() * 30), Z(PARK.z0 + r() * 10.5), (1.2 + r() * 2.8) * k, 0.02 + r() * 0.035, 0.6 + r() * 0.9);
    [5.2, 6.9].forEach((z) => { for (let w = 0; w < 3; w++) { g.strokeStyle = 'rgba(30,28,25,' + (0.04 - w * 0.01) + ')'; g.lineWidth = (0.35 + w * 0.25) * k; g.beginPath(); g.moveTo(X(-42), Z(z)); g.lineTo(X(-12), Z(z)); g.stroke(); } });
    BAYS.slice(0, -1).forEach((x) => { const cx = x + 1.25; blot(g, X(cx), Z(10.0 + r() * 2.2), (0.3 + r() * 0.4) * k, 0.1 + r() * 0.14, 0.8); });
  }, [SAMPLE.hellur]);
  wearQuads([PARK], PARK, wearMat(parkTex, MASK.pav));
  // vehicles: a box truck and a semi-trailer at the doors, cars in the bays
  function tyre(x, z, r, w, axis) {
    const t = new THREE.CylinderGeometry(r, r, w, 20); t.rotateZ(Math.PI / 2); t.translate(x, r, z); gb.add(H.tyre, t);
    const h = new THREE.CylinderGeometry(r * 0.55, r * 0.55, w + 0.01, 14); h.rotateZ(Math.PI / 2); h.translate(x, r, z); gb.add(H.chrome, h);
  }
  (function () {   // box truck at the fourth door
    const x = 13, zb = zF + 0.45, L = 7.2, Wd = 2.5;
    gb.box(H.truck, x - Wd / 2, x + Wd / 2, 1.1, 3.75, zb, zb + L);
    gb.box(H.frame, x - Wd / 2 - 0.01, x + Wd / 2 + 0.01, 1.1, 1.18, zb, zb + L);
    gb.box(H.steel, x - 0.9, x + 0.9, 0.62, 1.1, zb + 0.3, zb + L + 2.3);
    gb.box(H.cab, x - Wd / 2, x + Wd / 2, 0.9, 2.55, zb + L + 0.15, zb + L + 2.45);
    gb.box(H.cab, x - Wd / 2 + 0.06, x + Wd / 2 - 0.06, 2.55, 3.15, zb + L + 0.15, zb + L + 2.05);
    gb.box(H.glassC, x - Wd / 2 + 0.1, x + Wd / 2 - 0.1, 2.05, 3.0, zb + L + 2.05, zb + L + 2.08);
    gb.box(H.frame, x - Wd / 2 + 0.1, x + Wd / 2 - 0.1, 0.95, 1.35, zb + L + 2.45, zb + L + 2.5);
    [-1, 1].forEach((sd) => gb.box(H.lens, x + sd * (Wd / 2 - 0.35) - 0.18, x + sd * (Wd / 2 - 0.35) + 0.18, 1.05, 1.25, zb + L + 2.45, zb + L + 2.52));
    [zb + 1.1, zb + 2.25, zb + L + 1.45].forEach((z) => [-1, 1].forEach((sd) => tyre(x + sd * (Wd / 2 - 0.2), z, 0.5, 0.32)));
  })();
  (function () {   // semi-trailer backed up to the last door, tractor towards the street
    const x = 27, W2 = 1.28, z0 = zF + 1.1, z1 = z0 + 13.6;
    gb.box(H.trailer, x - W2, x + W2, 1.25, 4.0, z0, z1);
    gb.box(H.frame, x - W2 - 0.012, x + W2 + 0.012, 1.17, 1.27, z0, z1); gb.box(H.frame, x - W2 - 0.012, x + W2 + 0.012, 3.95, 4.03, z0, z1);
    for (let z = z0 + 1.2; z < z1 - 0.5; z += 1.2) [-1, 1].forEach((sd) => gb.box(H.frame, x + sd * W2 - 0.012, x + sd * W2 + 0.012, 1.27, 3.95, z - 0.03, z + 0.03));
    gb.box(H.steel, x - 0.55, x + 0.55, 0.78, 1.17, z0 + 0.4, z1 - 0.2);
    gb.box(H.frame, x - 0.015, x + 0.015, 1.3, 3.95, z0 - 0.02, z0);
    [-1, 1].forEach((sd) => gb.box(H.tail, x + sd * (W2 - 0.25) - 0.15, x + sd * (W2 - 0.25) + 0.15, 0.95, 1.1, z0 - 0.04, z0));
    gb.box(H.frame, x - W2 + 0.1, x + W2 - 0.1, 0.55, 0.72, z0 + 0.15, z0 + 0.3);
    [z0 + 1.7, z0 + 3.05, z0 + 4.4].forEach((z) => [-1, 1].forEach((sd) => tyre(x + sd * (W2 - 0.3), z, 0.52, 0.42)));
    [-1, 1].forEach((sd) => gb.box(H.steel, x + sd * 0.85 - 0.06, x + sd * 0.85 + 0.06, 0.05, 1.17, z1 - 3.6, z1 - 3.48));
    const c0 = z1 - 2.3, cab0 = z1 + 1.35, cab1 = z1 + 3.75;
    gb.box(H.steel, x - 0.48, x + 0.48, 0.6, 1.05, c0, cab1 - 0.2);
    gb.box(H.frame, x - 1.2, x + 1.2, 0.95, 1.08, c0, c0 + 2.2);
    gb.box(H.tractor, x - 1.25, x + 1.25, 1.05, 3.55, cab0, cab1);
    gb.box(H.tractor, x - 1.18, x + 1.18, 3.55, 4.0, cab0 + 0.15, cab1 - 0.5);
    gb.box(H.glassC, x - 1.15, x + 1.15, 2.25, 3.35, cab1, cab1 + 0.02);
    [-1, 1].forEach((sd) => gb.box(H.glassC, x + sd * 1.25 - 0.01, x + sd * 1.25 + 0.01, 2.3, 3.3, cab1 - 1.0, cab1 - 0.1));
    gb.box(H.frame, x - 1.25, x + 1.25, 0.45, 0.95, cab1, cab1 + 0.14);
    [-1, 1].forEach((sd) => gb.box(H.lens, x + sd * 0.9 - 0.2, x + sd * 0.9 + 0.2, 0.62, 0.8, cab1 + 0.14, cab1 + 0.17));
    gb.box(H.frame, x - 1.0, x + 1.0, 1.25, 2.0, cab1, cab1 + 0.03);
    [c0 + 0.65, c0 + 1.95].forEach((z) => [-1, 1].forEach((sd) => tyre(x + sd * 0.95, z, 0.52, 0.5)));
    [-1, 1].forEach((sd) => tyre(x + sd * 1.0, cab1 - 0.95, 0.52, 0.32));
  })();
  const PAINT = [0xe6e6e3, 0x9aa1a8, 0x3a3f45, 0x121315, 0x1d2a3e, 0x6a1d1d].map((c) => patch(new THREE.MeshPhysicalMaterial({ color: c, metalness: 0.5, roughness: 0.36, clearcoat: 1, clearcoatRoughness: 0.1, envMapIntensity: 1.1 }), { scan: 1 }));
  const carShape = (pts) => { const sh = new THREE.Shape(); sh.moveTo(pts[0][0], pts[0][1]); pts.slice(1).forEach((q) => sh.lineTo(q[0], q[1])); sh.closePath(); return sh; };
  const BODY = carShape([[-2.2, 0.3], [2.16, 0.3], [2.26, 0.42], [2.27, 0.66], [2.14, 0.84], [1.12, 0.98], [-1.52, 0.99], [-2.12, 0.94], [-2.27, 0.78], [-2.27, 0.44]]);
  const GLASSH = carShape([[-1.5, 0.95], [-0.94, 1.38], [0.32, 1.41], [1.1, 0.95]]);
  function carExtrude(shape, width, bevel) {
    const g = new THREE.ExtrudeGeometry(shape, { depth: width - 2 * bevel, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel * 0.8, bevelSegments: 3, curveSegments: 1 });
    g.translate(0, 0, -(width - 2 * bevel) / 2); g.rotateY(-Math.PI / 2);
    g.setIndex([...Array(g.attributes.position.count).keys()]); return g;
  }
  function car(x, z, rot, paint) {
    const put = (mat, g) => { if (!g.index) g.setIndex([...Array(g.attributes.position.count).keys()]); g.rotateY(rot); g.translate(x, 0, z); gb.add(mat, g); };
    const W = 1.8;
    put(paint, carExtrude(BODY, W, 0.08));
    put(H.glassC, carExtrude(GLASSH, W - 0.12, 0.04));
    const roof = new RoundedBoxGeometry(W - 0.26, 0.04, 1.2, 2, 0.015); roof.translate(0, 1.445, -0.3); put(paint, roof);
    put(paint, bx(-(W - 0.1) / 2, (W - 0.1) / 2, 0.98, 1.43, -0.34, -0.22));
    [-1, 1].forEach((sx) => {
      put(paint, bx(sx * 0.9 - 0.06, sx * 0.9 + 0.06, 1.0, 1.1, 0.95, 1.08)); put(paint, bx(sx * 1.0 - 0.05, sx * 1.0 + 0.05, 1.0, 1.12, 0.96, 1.07));
      put(H.lens, bx(sx * 0.62 - 0.19, sx * 0.62 + 0.19, 0.66, 0.77, 2.24, 2.335)); put(H.tail, bx(sx * 0.66 - 0.18, sx * 0.66 + 0.18, 0.8, 0.9, -2.335, -2.25));
      [-1, 1].forEach((sz) => {
        const t = new THREE.CylinderGeometry(0.33, 0.33, 0.22, 18); t.rotateZ(Math.PI / 2); t.translate(sx * (W / 2 - 0.12), 0.33, sz * 1.42); put(H.tyre, t);
        const h = new THREE.CylinderGeometry(0.2, 0.2, 0.23, 14); h.rotateZ(Math.PI / 2); h.translate(sx * (W / 2 - 0.12), 0.33, sz * 1.42); put(H.chrome, h);
      });
    });
    put(H.frame, bx(-0.5, 0.5, 0.42, 0.6, 2.26, 2.33));
  }
  [[-39.5, 0], [-34.5, Math.PI], [-32.0, 0], [-17.0, Math.PI], [-14.5, 0]].forEach(([x, rot], i) => car(x, 11.1, rot, PAINT[[0, 1, 4, 3, 2][i]]));
  car(-12.85, -3.4, Math.PI, PAINT[5]);
  // goods on pallets between two doors: two wrapped loads stacked, and a stack of empty pallets
  (function () {
    const x0 = 22.9, x1 = 24.1;
    const pal = (z0, y) => { gb.box(H.pallet, x0, x1, y, y + 0.022, z0, z0 + 0.8); gb.box(H.pallet, x0, x1, y + 0.122, y + 0.144, z0, z0 + 0.8); [x0, (x0 + x1) / 2 - 0.05, x1 - 0.1].forEach((bx0) => gb.box(H.pallet, bx0, bx0 + 0.1, y + 0.022, y + 0.122, z0, z0 + 0.8)); };
    pal(zF + 0.05, 0); gb.box(H.film, x0 + 0.02, x1 - 0.02, 0.144, 1.14, zF + 0.07, zF + 0.83);
    pal(zF + 0.05, 1.14); gb.box(H.film, x0 + 0.02, x1 - 0.02, 1.284, 2.18, zF + 0.07, zF + 0.83);
    for (let i = 0; i < 8; i++) pal(zF + 0.95, i * 0.144);
  })();
  [[gb, fleetG], [plb, plantsG], [pob, polesG]].forEach(([b, grp]) => b.build(grp, { depth: depthScan }).forEach((m) => m.layers.set(3)));
  [postMesh, railMesh].forEach((m) => { m.customDepthMaterial = depthScan; m.layers.set(3); });
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
    [[41.5, -2, 6.4], [36.5, -9, 6.0], [35.5, -27.5, 6.6], [41.5, -33, 5.8], [-41.5, -4, 6.2], [-36.5, -27, 6.8], [-41.5, -35, 6.0], [-36.5, -40.5, 6.4]].forEach((q, i) => birch(q[0], q[1], q[2], i + 1));
    const trunks = tb.build(plantsG, { depth: depthScan }); trunks.forEach((m) => m.layers.set(3));
    const leaves = new THREE.Mesh(mergeGeometries(lb, false), H.leaves); leaves.castShadow = true; leaves.receiveShadow = true;
    leaves.customDepthMaterial = leafDepth; leaves.layers.set(2); plantsG.add(leaves);
  })();
  // street lamps along the sidewalk
  // the street is there from the start, so its lamps have their own materials (the building's are hidden until it rises)
  const streetSteel = std({ c: 0x232528, r: 0.38, m: 0.7 }), streetBulb = std({ c: 0xfff1d6, e: '#ffc98a', ei: 0, r: 0.4 });
  lightsDusk.push([streetBulb, 9]);
  const lampHeads = new Bag();
  [[-46, 15.4], [-8, 15.4], [48, 15.4], [86, 15.4]].forEach(([x, z]) => {
    const p = new THREE.CylinderGeometry(0.06, 0.09, 6.2, 12); p.translate(x, 3.1, z); lampHeads.add(streetSteel, p);
    lampHeads.box(streetSteel, x - 0.05, x + 0.05, 6.05, 6.15, z, z + 1.4);
    lampHeads.box(streetSteel, x - 0.18, x + 0.18, 5.98, 6.1, z + 1.25, z + 1.85);
    lampHeads.box(streetBulb, x - 0.15, x + 0.15, 5.96, 5.98, z + 1.3, z + 1.8);
  });
  lampHeads.build(env);
  const manhole = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.33, 0.02, 24), std({ c: 0x3a3c40, r: 0.5, m: 0.6 })); manhole.position.set(21.0, -0.115, 23.0); world.add(manhole);

  /* ---------- pipes, trenches, ghost block (x-ray) ---------- */
  const pipesG = new THREE.Group(); world.add(pipesG);
  const PC = { cold: '#2f86e0', hot: '#e0442f', sewer: '#cf6a2c', power: '#f2b233', fiber: '#f90160', drain: '#8cc63f', storm: '#8fa6bb' };
  const pipes = [];
  function pmat(hex) { if (!pipeMats[hex]) pipeMats[hex] = new THREE.MeshStandardMaterial({ color: C(hex), roughness: 0.42, emissive: C(hex), emissiveIntensity: 0.35 }); return pipeMats[hex]; }
  function pipe(points, r, color, from, to) {
    const v = points.map((p) => new THREE.Vector3(p[0], p[1], p[2])), path = new THREE.CurvePath();
    for (let i = 0; i < v.length - 1; i++) path.add(new THREE.LineCurve3(v[i], v[i + 1]));
    const segs = Math.max(12, Math.round(path.getLength() * 3));
    const m = new THREE.Mesh(new THREE.TubeGeometry(path, segs, r, 12, false), pmat(color)); pipesG.add(m);
    pipes.push({ m, segs, from, to });
  }
  // the pipes are laid while the page opens (from/to: share of the opening), mains first, then the lines into the building
  const MAINS = [['sewer', 23.0, -3.0, 0.3], ['storm', 21.8, -2.4, 0.26], ['cold', 20.6, -1.8, 0.15], ['hot', 19.6, -1.4, 0.2], ['power', 18.4, -0.9, 0.08], ['fiber', 17.8, -0.6, 0.06]];
  MAINS.forEach((q) => pipe([[BX0 + 0.03, q[2], q[1]], [BX1 - 0.03, q[2], q[1]]], q[3], PC[q[0]], 0.12, 0.5));
  const SERV = [['fiber', 18.6, -0.6, 17.8, 0.05], ['power', 19.0, -0.9, 18.4, 0.07], ['hot', 19.5, -1.4, 19.6, 0.11], ['cold', 20.0, -1.8, 20.6, 0.08]];
  SERV.forEach((q, i) => pipe([[q[1], q[2], q[3]], [q[1], q[2], HALL.z1 + 0.15]], q[4], PC[q[0]], 0.38 + i * 0.05, 0.62 + i * 0.04));
  pipe([[21.0, -1.5, HALL.z1 + 0.15], [21.0, -2.9, 22.8]], 0.12, PC.sewer, 0.42, 0.68);
  GRATES.forEach(([x, z], i) => pipe([[x, -0.25, z], [x, -1.2, z + 0.4], [x, -2.2, 21.55]], 0.11, PC.storm, 0.48 + i * 0.04, 0.76));
  pipe([[-32.5, -1.6, 0.5], [-13.5, -1.6, 0.5], [-13.5, -1.6, -7.5], [32.5, -1.6, -7.5], [32.5, -1.6, -38.5], [-32.5, -1.6, -38.5], [-32.5, -1.6, 0.5]], 0.08, PC.drain, 0.55, 0.86);
  const shaftMat = new THREE.MeshStandardMaterial({ color: 0xe8e3d8, roughness: 0.7, side: THREE.DoubleSide });
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 3.0, 24, 1, true), shaftMat); shaft.position.set(21.0, -1.6, 23.0); world.add(shaft);
  const trenchMat = new THREE.MeshStandardMaterial({ color: 0xe2c48f, roughness: 1, transparent: true, opacity: 0, depthWrite: false });
  const trenches = [[18.2, 20.4, -1.85, -0.02, HALL.z1 + 0.1, 20.8], [20.7, 21.3, -2.9, -0.02, HALL.z1 + 0.1, 23.2]].map((b) => { const m = new THREE.Mesh(UNIT, trenchMat); setBox(m, ...b); m.renderOrder = 6; world.add(m); return m; });
  const outlineMat = new THREE.LineDashedMaterial({ color: 0xf2eee6, dashSize: 0.45, gapSize: 0.3, transparent: true, opacity: 0 });
  FOOTPRINTS.forEach((r) => {
    const g = new THREE.BufferGeometry().setFromPoints([[r.x0, r.z0], [r.x1, r.z0], [r.x1, r.z1], [r.x0, r.z1], [r.x0, r.z0]].map((p) => new THREE.Vector3(p[0], 0.03, p[1])));
    const l = new THREE.Line(g, outlineMat); l.computeLineDistances(); world.add(l);
  });
  const ghostMat = new THREE.MeshBasicMaterial({ color: 0x121821, transparent: true, opacity: 0, depthWrite: false });
  const ghost = new THREE.Mesh(new THREE.BoxGeometry(BX1 - BX0, 4.5, BZ1 - BZ0), ghostMat); ghost.position.set((BX0 + BX1) / 2, -2.25, (BZ0 + BZ1) / 2); ghost.renderOrder = 7; world.add(ghost);
  // a dark open box under the lot, so the x-ray looks into the ground and not at the sky below the horizon
  const voidMat = new THREE.MeshBasicMaterial({ color: 0x0d1116, side: THREE.BackSide, transparent: true, opacity: 0 });
  const voidBox = new THREE.Mesh(new THREE.BoxGeometry(BX1 - BX0, 4.6, BZ1 - BZ0), voidMat); voidBox.position.set((BX0 + BX1) / 2, -2.3 - 0.001, (BZ0 + BZ1) / 2); voidBox.renderOrder = 0; world.add(voidBox);
  const ghostLineMat = new THREE.LineBasicMaterial({ color: 0xf2eee6, transparent: true, opacity: 0 });
  const ghostLines = new THREE.LineSegments(new THREE.EdgesGeometry(ghost.geometry), ghostLineMat); ghostLines.position.copy(ghost.position); ghostLines.renderOrder = 8; world.add(ghostLines);
  const strataLineMat = new THREE.LineDashedMaterial({ color: 0xd9bf8b, dashSize: 0.6, gapSize: 0.4, transparent: true, opacity: 0 });
  [-0.3, -1.5, -2.8].forEach((y) => {
    const g = new THREE.BufferGeometry().setFromPoints([[BX0, BZ0], [BX1, BZ0], [BX1, BZ1], [BX0, BZ1], [BX0, BZ0]].map((p) => new THREE.Vector3(p[0], y, p[1])));
    const l = new THREE.Line(g, strataLineMat); l.computeLineDistances(); world.add(l);
  });

  /* ---------- sky, sun, environment ---------- */
  const sky = new Sky(); sky.scale.setScalar(11000); scene.add(sky);
  sky.material.uniforms.uGain = { value: 0.62 };
  sky.material.fragmentShader = 'uniform float uGain;\n' + sky.material.fragmentShader.replace('gl_FragColor = vec4( retColor, 1.0 );', 'gl_FragColor = vec4( retColor * uGain, 1.0 );');
  const su = sky.material.uniforms;
  // clouds: broken cumulus on a dome that follows the camera, lit from the sun's side
  const cloudMat = new THREE.ShaderMaterial({
    uniforms: { uSun: { value: new THREE.Vector3(0, 1, 0) }, uLit: { value: new THREE.Color(1, 1, 1) }, uShade: { value: new THREE.Color(0.5, 0.5, 0.5) }, uHaze: { value: new THREE.Color(0.5, 0.5, 0.5) }, uCover: { value: 0.52 } },
    vertexShader: 'varying vec3 vDir; void main(){ vec4 wp = modelMatrix * vec4(position, 1.0); vDir = wp.xyz - cameraPosition; gl_Position = projectionMatrix * viewMatrix * wp; }',
    fragmentShader: `uniform vec3 uSun, uLit, uShade, uHaze; uniform float uCover; varying vec3 vDir;
      float h2(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
      float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h2(i), h2(i + vec2(1.0, 0.0)), f.x), mix(h2(i + vec2(0.0, 1.0)), h2(i + vec2(1.0, 1.0)), f.x), f.y); }
      float fbm(vec2 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 6; i++){ s += a * n2(p); p = mat2(1.6, 1.2, -1.2, 1.6) * p + 7.3; a *= 0.5; } return s; }
      float dens(vec2 p){ float n = fbm(p) * 0.85 + 0.15 * n2(p * 0.31 + 3.0); return smoothstep(uCover, uCover + 0.13, n); }
      void main(){
        vec3 d = normalize(vDir);
        if (d.y < 0.008) discard;
        vec2 p = d.xz / (d.y + 0.06) * 1.3 + vec2(3.7, 1.9);
        float c = dens(p);
        if (c < 0.002) discard;
        vec2 sd = normalize(uSun.xz + vec2(1e-4));
        float sh = clamp(dens(p + sd * 0.09) * 0.55 + dens(p + sd * 0.24) * 0.45, 0.0, 1.0);
        float lit = max(1.0 - sh * 0.85, (1.0 - c) * 0.85);
        vec3 col = mix(mix(uShade, uLit, lit), uHaze, (1.0 - smoothstep(0.0, 0.25, d.y)) * 0.55);
        gl_FragColor = vec4(col, c * smoothstep(0.004, 0.05, d.y) * 0.95);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    transparent: true, depthWrite: false, side: THREE.BackSide, fog: false
  });
  const clouds = new THREE.Mesh(new THREE.SphereGeometry(5000, 48, 16, 0, Math.PI * 2, 0, Math.PI / 2), cloudMat);
  clouds.frustumCulled = false; clouds.renderOrder = -1;
  clouds.onBeforeRender = (r, sc, cam) => { clouds.position.copy(cam.position); clouds.updateMatrixWorld(); };
  scene.add(clouds);
  const sun = new THREE.DirectionalLight(0xffffff, 3); sun.castShadow = true;
  sun.shadow.mapSize.set(small ? 2048 : 4096, small ? 2048 : 4096);
  const sc = sun.shadow.camera; sc.left = -64; sc.right = 64; sc.top = 64; sc.bottom = -64; sc.near = 1; sc.far = 380;
  sc.layers.enable(2); sc.layers.enable(3);
  sun.shadow.bias = -0.0002; sun.shadow.normalBias = 0.025;
  scene.add(sun); scene.add(sun.target); sun.target.position.set(0, 0, -12);
  const fill = new THREE.HemisphereLight(0xbfd2ff, 0x4a4036, 0.0); scene.add(fill);
  const DAY = { el: 38, az: 322, tur: 2.0, ray: 1.0, mie: 0.004, g: 0.8, sun: C('#fff0dc'), si: 3.6, exp: 0.95, env: 0.8, fog: C('#b4bfcc') };
  const GOLD = { el: 8.5, az: 312, tur: 2.9, ray: 2.3, mie: 0.006, g: 0.86, sun: C('#ffbd84'), si: 3.5, exp: 1.1, env: 0.66, fog: C('#a19893') };
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
    sun.position.copy(sunDir).multiplyScalar(190).add(sun.target.position);
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
    cloudMat.uniforms.uSun.value.copy(sunDir); cloudMat.uniforms.uLit.value.copy(sun.color).multiplyScalar(lerp(2.6, 2.3, k));
    cloudMat.uniforms.uShade.value.copy(scene.fog.color).multiplyScalar(lerp(1.0, 0.85, k)); cloudMat.uniforms.uCover.value = lerp(0.5, 0.53, k); cloudMat.uniforms.uHaze.value.copy(scene.fog.color).multiplyScalar(lerp(1.25, 1.15, k));
    farWin.color.copy(FARWIN_DAY).lerp(FARWIN_DUSK, ssOn(k));
    bloom.strength = lerp(0.12, 0.42, k);
    stage.style.setProperty('--dusk', k.toFixed(3));
  }
  let lampOn = 1;   // the intro turns the lights on
  const ssOn = (k) => sm(0.25, 0.85, k) * lampOn;
  let expo = 1;
  // the theme sets the time of day at the ends of the story: 1 = golden hour with the lights on (dark), LIGHTK = afternoon (light)
  const LIGHTK = 0.4;   // light theme: late afternoon at the ends instead of golden hour
  let themeTarget = isDark() ? 1 : LIGHTK, themeK = themeTarget;
  const EXPO0 = () => (themeTarget > 0.5 ? 0.35 : 1.7);   // the intro fades the scene in from black (dark) or from white (light)

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
  lay(colA, 0, loc('Malbik', 'Asphalt'), 'eA'); lay(colA, 1, loc('Burðarlag 50 cm', 'Base course 50 cm'), 'eA'); lay(colA, 2, loc('Frostfrí fylling', 'Frost-free fill'), 'eA');
  lay(colS, 0, loc('Steypa 20 cm, járnbent', 'Reinforced concrete 20 cm'), 'eS');
  label(loc('Snjóbræðsla', 'Snow-melt pipes'), () => [SAMPLE.stett.x1 - 0.3, snow.position.y, SAMPLE.stett.z0 + 0.25], () => ramp(0.55, 0.9, ST.eS));
  lay(colS, 1, loc('Burðarlag 50 cm', 'Base course 50 cm'), 'eS'); lay(colS, 2, loc('Frostfrí fylling', 'Frost-free fill'), 'eS');
  lay(colG, 0, loc('Túnþökur', 'Turf'), 'eG'); lay(colG, 1, loc('Gróðurmold 25 cm', 'Topsoil 25 cm'), 'eG'); lay(colG, 2, loc('Fylling', 'Fill'), 'eG');
  lay(colH, 0, loc('Hellur 8 cm', 'Pavers 8 cm'), 'eH'); lay(colH, 1, loc('Sandur 3 cm', 'Bedding sand 3 cm'), 'eH'); lay(colH, 2, loc('Burðarlag 50 cm', 'Base course 50 cm'), 'eH'); lay(colH, 3, loc('Frostfrí fylling', 'Frost-free fill'), 'eH');
  label(loc('Grafið niður á 1,6 m', 'Dug down to 1.6 m'), () => [12, -1.6, HALL.z1 + 1.1], () => ST.lblDig);
  label(loc('Sökklar', 'Foundation walls'), () => [-30, 0.3 + ST.footY, HALL.z0], () => ST.lblFoot);
  label(loc('Súlufætur', 'Column footings'), () => [-24, 0.3 + ST.footY, (HALL.z0 + HALL.z1) / 2], () => ST.lblFoot);
  label(loc('Púði, þjappaður í lögum', 'Compacted fill pad'), () => [0, ST.padTop, -14], () => ST.lblPad);
  label(loc('Stofnlagnir í götu', 'Street mains'), () => [28, -2.4, 21.8], () => ST.lblP);
  label(loc('Heimæðar', 'Service lines'), () => [19.3, -0.6, 4], () => ST.lblP);
  label(loc('Fráveita', 'Sewer'), () => [21.0, -2.7, 17.5], () => ST.lblP);
  label(loc('Ofanvatn', 'Stormwater'), () => [2, -0.7, 3.4], () => ST.lblP);
  label(loc('Drenlögn', 'Perimeter drain'), () => [6, -1.6, -7.5], () => ST.lblP);
  label(loc('Grindverk 2 m, soðið net', 'Welded mesh fence, 2 m'), () => [35.5, HF, 13.7], () => ST.lblF);
  label(loc('Rennihlið 12 m', 'Sliding gate, 12 m'), () => [GATE.x0 + 2 + gate.position.x, HF, GATE.z], () => ST.lblF);

  /* ---------- camera keyframes: eye, target, lens; desktop pushes the subject right of the text ---------- */
  const K = [
    { eye: [68, 29.9, 75.2], tgt: [-3.0, -1.5, -4.0], fov: 36, ox: 0.2, oy: 0.05 },        // 0 pipes, through the ground
    { eye: [57.5, 55.3, 47.3], tgt: [0, -1.0, -19.0], fov: 38, ox: 0.15, oy: 0.04 },       // 1 foundation from above
    { eye: [4.5, 3.4, 18.5], tgt: [-4.1, 1.3, 7.6], fov: 34, ox: 0.15, oy: 0.04 },         // 2 the asphalt sample in the yard
    { eye: [14.5, 3.4, 7.0], tgt: [5.9, 1.3, -3.9], fov: 34, ox: 0.15, oy: 0.04 },         // 3 the concrete sample at a door
    { eye: [-19.5, 3.7, 22.25], tgt: [-28.8, 0.95, 10.45], fov: 34, ox: 0.15, oy: 0.04 },  // 4 the paver sample in the car park
    { eye: [-48.0, 3.4, 2.0], tgt: [-39.0, 0.95, -15.5], fov: 34, ox: 0.15, oy: 0.04 },    // 5 the turf sample on the west lawn
    { eye: [0, 3.6, 31], tgt: [11, 1.3, 13.7], fov: 34, ox: 0.15, oy: 0.04 },           // 6 the gate from across the street, the fence running off east
    { eye: [-60, 14, 58], tgt: [-4.0, 5.0, -16.0], fov: 30, ox: 0.16, oy: 0.06 }           // 7 finished
  ];
  function key(i) {
    const k = K[i];
    if (!mobile()) return k;
    const wide = i === N, high = i <= 1;
    const e = k.eye.map((v, j) => k.tgt[j] + (v - k.tgt[j]) * (wide ? 1.8 : high ? 1.45 : 1.6));
    const tg = i === 1 ? [k.tgt[0] - 1.5, k.tgt[1], k.tgt[2] + 1] : k.tgt;
    return { eye: e, tgt: tg, fov: k.fov + 10, ox: 0, oy: i === 0 || wide ? 0.2 : 0.22 };
  }
  // the long moves between close-ups lift and pull back in the middle, so the camera clears poles and the building
  const ARC = [0, 0, 0, 5, 4, 8, 4], TARC = [0, 0, 0, 2, 2, 3, 1], PULL = [0, 0.2, 0, 0.5, 0.4, 1.1, 0.3];
  const sway = { x: 0, y: 0, tx: 0, ty: 0 };
  const CAM = { eye: [0, 0, 0], tgt: [0, 0, 0], fov: 30, ox: 0, oy: 0 };
  let intro = 1;
  function camAt(t, out) {
    t = clamp(t || 0, 0, N);
    const i = Math.min(N - 1, Math.floor(t)), f = t - i;
    const a = key(i), b = key(i + 1); let k = ss(ramp(0.16, 0.9, f)); if (t >= N) k = 1;
    for (let j = 0; j < 3; j++) { out.eye[j] = lerp(a.eye[j], b.eye[j], k); out.tgt[j] = lerp(a.tgt[j], b.tgt[j], k); }
    out.fov = lerp(a.fov, b.fov, k); out.ox = lerp(a.ox, b.ox, k); out.oy = lerp(a.oy, b.oy, k);
    out.eye[1] += Math.sin(Math.PI * k) * ARC[i];
    out.tgt[1] += Math.sin(Math.PI * k) * TARC[i];
    const pull = Math.sin(Math.PI * k) * PULL[i]; if (pull > 0) for (let j = 0; j < 3; j++) out.eye[j] += (out.eye[j] - out.tgt[j]) * pull;
    // intro: start higher and further out, glide in
    const q = 1 - easeOutCubic(intro);
    if (q > 0) { for (let j = 0; j < 3; j++) out.eye[j] += (out.eye[j] - out.tgt[j]) * 0.4 * q; out.eye[1] += 16 * q; }
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
    const duskK = clamp(1 - sm(0.1, 0.75, t) + sm(6.3, 6.95, t), 0, 1) * themeK;
    lighting(duskK);
    // 0: the pipes, seen through the ground (they are laid while the page opens)
    const xr = 1 - sm(0.2, 0.5, t);
    ST.lblP = mobile() ? 0 : 1 - sm(0.16, 0.34, t);   // on a phone the hero text needs the room: no pipe labels
    // 1: the pit is dug, the footings poured, the pad filled in layers and the pit backfilled; then the building rises
    const digP = sm(0.6, 0.82, t), pour = sm(0.84, 0.97, t);
    const fillP = layers(ramp(0.94, 1.2, t), 5);
    const backfill = sm(1.22, 1.38, t);
    const dig = digP * (1 - backfill);
    const rise = sm(1.36, 1.86, t);
    const site = bump(0.58, 0.78, 1.22, 1.38, t);
    ST.dig = dig; ST.lblDig = site * ramp(0.7, 1, digP) * (1 - backfill); ST.lblFoot = site * ramp(0.6, 1, pour); ST.lblPad = site * ramp(0.15, 0.4, fillP);
    // 2–5: the surfaces, one kind per chapter; a sample block lifts out to show the layers under each
    MASK.asph.v.value = 1.04 * (1 - sm(1.58, 2.0, t));
    MASK.conc.v.value = 1.04 * (1 - sm(2.5, 2.92, t));
    MASK.pav.v.value = 1.04 * (1 - sm(3.45, 3.88, t));
    MASK.turf.v.value = 1.04 * (1 - sm(4.45, 4.88, t));
    const eA = bump(1.86, 2.06, 2.14, 2.45, t);
    const eS = bump(2.86, 3.06, 3.14, 3.45, t);
    const eH = bump(3.82, 4.0, 4.3, 4.55, t), sH = ramp(4.0, 4.3, t);
    const eG = bump(4.82, 5.0, 5.3, 5.55, t), sG = ramp(5.0, 5.3, t);
    ST.eA = eA; ST.eS = eS; ST.eH = eH; ST.eG = eG;
    // 6: the fence goes up and the gate slides shut
    fenceAt(t); ST.lblF = bump(5.8, 6.0, 6.32, 6.52, t);
    // what stands on the lot comes with its chapter: light poles with the asphalt, hedges and trees with the lawn, vehicles at the end
    const poles = ss(ramp(1.84, 2.08, t)); polesG.visible = poles > 0.001; polesG.scale.y = Math.max(0.001, poles);
    const grow = ss(ramp(4.62, 5.08, t)); plantsG.visible = grow > 0.001; plantsG.scale.y = Math.max(0.001, grow);
    fleetG.visible = t > 6.5;

    // samples
    placeColumn(colA, eA);
    placeColumn(colS, eS);
    snow.visible = eS > 0.02; snow.position.y = -0.06 + 2.05 * ss(clamp(eS * 1.35 - 0.06, 0, 1));
    placeColumn(colG, eG);
    // the turf on the lawn sample is rolled out while the sample is up
    const turf = colG.layers[0], r = SAMPLE.gras, W = r.x1 - r.x0;
    roll.visible = false; bladesG.position.set(0, turf.lift || 0, 0); bladesG.scale.set(1, 1, 1);
    if (t > 4.45 && sG < 1) {
      const sx = lerp(0.06, 1, ss(sG));
      turf.m.scale.x = W * sx; turf.m.position.x = r.x0 + W * sx / 2;
      bladesG.scale.x = sx; bladesG.position.x = r.x0 * (1 - sx);
      const rad = 0.07 + 0.3 * (1 - sx);
      roll.visible = true; roll.scale.set(rad, rad, r.z1 - r.z0); roll.position.set(r.x0 + W * sx, turf.m.position.y + rad - 0.03, (r.z0 + r.z1) / 2);
    }
    // pavers on the car park sample: laid one by one from the street side while the sample is up
    placeColumn(colH, eH);
    const lp = colH.layers[0].lift || 0, nP = pavList.length;
    layPavers((i) => {
      const d = (1 - i / (nP - 1)) * 0.7, q = clamp((sH - d) / 0.3, 0, 1);
      return { y: lp + 1.4 * (1 - q) * (1 - q), s: q > 0 ? 1 : 0.0001 };
    });
    pits.forEach((c) => digColumn(c, 1.6 * dig)); apronPit.visible = dig < 0.001;
    // the building rises bottom-up behind a pink scan line once the foundation is done (not our work, so it just appears)
    const cut = rise >= 1 ? 99 : lerp(-0.4, 13.8, rise);
    SCAN.cut.value = cut; scanBusy = cut > -0.35 && cut < 13.7;
    house.visible = cut > -0.35;
    // footings are poured in the pit, the pad comes up in compacted layers
    const footY = -1.95 * (1 - pour); ST.footY = footY;
    footings.forEach((m) => { m.position.y = m.userData.y + footY; m.visible = footY > -1.9; });
    const padTop = lerp(lerp(0, -1.6, digP), 0.15, fillP); ST.padTop = padTop;
    pads.forEach((p) => setBox(p.m, p.r.x0 + 0.35, p.r.x1 - 0.35, -1.6, padTop, p.r.z0 + 0.35, p.r.z1 - 0.35));
    // x-ray: surfaces fade keeping depth, a ghost block takes over, the pipes show
    const so = 1 - xr;
    SOILMATS.forEach((m) => { setOpacity(m, so); m.visible = so > 0.01; });
    const gx = ramp(0.35, 1, xr);
    ghostMat.opacity = 0.5 * gx; ghost.visible = gx > 0.01; voidMat.opacity = ramp(0, 0.5, xr); voidBox.visible = xr > 0.005; ghostLineMat.opacity = 0.45 * gx; strataLineMat.opacity = 0.5 * gx;
    trenchMat.opacity = 0.3 * xr; outlineMat.opacity = 0.8 * xr; shaft.visible = xr > 0.02;
    pipes.forEach((p) => { const f = ramp(p.from, p.to, intro), n = Math.round(f * p.segs); p.m.visible = n > 0; p.m.geometry.setDrawRange(0, n * 12 * 6); });
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
    const theming = Math.abs(themeTarget - themeK) > 0.002;
    if (theming) themeK += (themeTarget - themeK) * (reduce ? 1 : 1 - Math.exp(-dt * 2.6)); else themeK = themeTarget;
    target = readTarget();
    const moving = Math.abs(target - T) > 0.0004;
    if (moving) T = clamp(T + (target - T) * (reduce ? 1 : 1 - Math.exp(-dt * 7)), 0, N); else T = target;
    sway.x += (sway.tx - sway.x) * (1 - Math.exp(-dt * 3)); sway.y += (sway.ty - sway.y) * (1 - Math.exp(-dt * 3));
    const swaying = Math.abs(sway.tx - sway.x) + Math.abs(sway.ty - sway.y) > 0.002;
    const r = story.getBoundingClientRect(), onScreen = r.bottom > 0 && r.top < innerHeight;
    if (onScreen && (moving || swaying || building || theming || dirty)) {
      render(); dirty = false;
      if (moving && rawDt < 0.5 && level < 3 && !/nosnap/.test(location.search)) { slowEma += (rawDt - slowEma) * 0.08; if (slowEma > 0.036) { if (++slowN > 45) degrade(); } else slowN = Math.max(0, slowN - 1); }
    }
    if (moving || swaying || building || theming) raf = requestAnimationFrame(frame);
  }
  function kick() { if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame); } }
  addEventListener('scroll', kick, { passive: true });
  addEventListener('resize', size);
  // switching between light and dark eases the sky between daylight and golden hour
  new MutationObserver(() => { const d = isDark() ? 1 : LIGHTK; if (d !== themeTarget) { themeTarget = d; dirty = true; kick(); } }).observe(root, { attributes: true, attributeFilter: ['data-theme'] });
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
      building = true; const t0 = performance.now(), e0 = EXPO0();
      (function step(now) {
        const k = clamp((now - t0) / ms, 0, 1);
        intro = k; lampOn = sm(0.35, 0.95, k); expo = lerp(e0, 1, easeOutCubic(clamp(k * 1.6, 0, 1)));
        if (k < 1) requestAnimationFrame(step); else { building = false; res(); }
        dirty = true; kick();
      })(t0);
    });
  }

  size();
  intro = 0; lampOn = 0; expo = EXPO0();
  T = target = readTarget();
  // compile everything before the first visible frame
  try { await renderer.compileAsync(scene, camera); } catch (e) {}
  render();
  root.classList.add('scene-in');   // the canvas stays hidden until it has something to show

  window.PBStory = {
    prepare() { dirty = true; kick(); },
    build: buildIntro,
    snapshots(list) { if (/nosnap/.test(location.search)) return; snapshots(list); },
    timeFrame() { const t0 = performance.now(); render(); renderer.getContext().finish(); return performance.now() - t0; },
    chapterTop(i) { return story.getBoundingClientRect().top + scrollY + i * S + 2; },
    get S() { return S; }
  };
  // testing only (?nosnap): jump straight to the scroll position instead of easing toward it
  if (/nosnap/.test(location.search)) window.__pbDev = { jump() { T = target = readTarget(); dirty = true; kick(); }, get T() { return T; }, N };
  window.dispatchEvent(new Event('pbstory'));
}
