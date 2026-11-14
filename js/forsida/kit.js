/* P. Blöndal – site equipment for the 3D story, built in code: a crawler excavator, a soil compactor,
   a tipper truck, temporary site fence panels. Each builder returns a group plus a function that poses it.
   Units are metres; the machines stand on y = 0 and face +x. */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const C = (h) => new THREE.Color(h);

/* ---------- shared materials ---------- */
export function kitMaterials() {
  const paint = new THREE.MeshPhysicalMaterial({ color: 0xe9a21a, roughness: 0.4, metalness: 0.05, clearcoat: 0.55, clearcoatRoughness: 0.38 });
  const paintDirty = new THREE.MeshPhysicalMaterial({ color: 0xb8892e, roughness: 0.7, metalness: 0.05, clearcoat: 0.15, clearcoatRoughness: 0.6 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x25272a, roughness: 0.55, metalness: 0.45 });
  const black = new THREE.MeshStandardMaterial({ color: 0x141516, roughness: 0.6, metalness: 0.3 });
  const rubber = new THREE.MeshStandardMaterial({ color: 0x171717, roughness: 0.92, metalness: 0.05 });
  const track = new THREE.MeshStandardMaterial({ color: 0x2a2724, roughness: 0.78, metalness: 0.55 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x8c9095, roughness: 0.38, metalness: 0.85 });
  const worn = new THREE.MeshStandardMaterial({ color: 0x6b655d, roughness: 0.55, metalness: 0.7 });
  const chrome = new THREE.MeshStandardMaterial({ color: 0xdfe3e6, roughness: 0.1, metalness: 1.0 });
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x0c1114, roughness: 0.04, metalness: 0.1, envMapIntensity: 1.7, clearcoat: 1, clearcoatRoughness: 0.05 });
  const lamp = new THREE.MeshStandardMaterial({ color: 0xeeeae2, roughness: 0.25, emissive: C('#fff1d6'), emissiveIntensity: 0 });
  const amber = new THREE.MeshStandardMaterial({ color: 0xe0861a, roughness: 0.3, emissive: C('#ff9a2a'), emissiveIntensity: 0 });
  const decal = new THREE.MeshStandardMaterial({ color: 0x1b1c1e, roughness: 0.5 });
  const galv = new THREE.MeshStandardMaterial({ color: 0xa9adb0, roughness: 0.42, metalness: 0.8 });
  const conc = new THREE.MeshStandardMaterial({ color: 0x9c9890, roughness: 0.92 });
  const truckBody = new THREE.MeshPhysicalMaterial({ color: 0xd9d6cf, roughness: 0.5, metalness: 0.2, clearcoat: 0.2 });
  const cabPaint = new THREE.MeshPhysicalMaterial({ color: 0xe8e6e1, roughness: 0.35, metalness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.15 });
  return { paint, paintDirty, dark, black, rubber, track, steel, worn, chrome, glass, lamp, amber, decal, galv, conc, truckBody, cabPaint };
}

/* ---------- geometry helpers ---------- */
function idx(g) { if (!g.index) g.setIndex([...Array(g.attributes.position.count).keys()]); return g; }
export function box(x0, x1, y0, y1, z0, z1) { const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0); g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); return g; }
export function rbox(x0, x1, y0, y1, z0, z1, r) {
  const g = new RoundedBoxGeometry(x1 - x0, y1 - y0, z1 - z0, 2, Math.min(r, (x1 - x0) / 2.1, (y1 - y0) / 2.1, (z1 - z0) / 2.1));
  g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); return idx(g);
}
// a side profile (x,y points) extruded along z from z0 to z1 with rounded edges
export function prof(pts, z0, z1, bevel) {
  const s = new THREE.Shape(); s.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) s.lineTo(pts[i][0], pts[i][1]); s.closePath();
  const b = bevel || 0, d = Math.max(0.001, z1 - z0 - 2 * b);
  const g = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: b > 0, bevelThickness: b, bevelSize: b * 0.9, bevelSegments: 2, curveSegments: 6 });
  g.translate(0, 0, z0 + b); return idx(g);
}
// a plan shape (x,z points) extruded upward from y0 to y1
export function plan(pts, y0, y1, bevel) {
  const s = new THREE.Shape(); s.moveTo(pts[0][0], -pts[0][1]); for (let i = 1; i < pts.length; i++) s.lineTo(pts[i][0], -pts[i][1]); s.closePath();
  const b = bevel || 0, d = Math.max(0.001, y1 - y0 - 2 * b);
  const g = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: b > 0, bevelThickness: b, bevelSize: b * 0.9, bevelSegments: 2, curveSegments: 10 });
  g.rotateX(-Math.PI / 2); g.translate(0, y0 + b, 0); return idx(g);
}
export function cyl(r, len, axis, x, y, z, seg, r2) {
  const g = new THREE.CylinderGeometry(r2 != null ? r2 : r, r, len, seg || 16);
  if (axis === 'x') g.rotateZ(-Math.PI / 2); else if (axis === 'z') g.rotateX(Math.PI / 2);
  g.translate(x, y, z); return g;
}
const arc = (cx, cy, r, a0, a1, n) => { const o = []; for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * i / n; o.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); } return o; };
// geometry collected per material, merged into one mesh each
export class Bag {
  constructor() { this.m = new Map(); }
  add(mat, g) { if (!this.m.has(mat)) this.m.set(mat, []); this.m.get(mat).push(idx(g)); return g; }
  build(parent, o) {
    o = o || {};
    this.m.forEach((list, mat) => {
      const mesh = new THREE.Mesh(mergeGeometries(list, false), mat);
      mesh.castShadow = o.cast !== false; mesh.receiveShadow = true; parent.add(mesh);
    });
    return parent;
  }
}
// a hydraulic cylinder between two moving points: barrel from a, chrome rod to b
class Ram {
  constructor(parent, M, rb, rr) {
    this.b = new THREE.Mesh(new THREE.CylinderGeometry(rb, rb, 1, 14), M.paint); this.r = new THREE.Mesh(new THREE.CylinderGeometry(rr, rr, 1, 10), M.chrome);
    this.e = new THREE.Mesh(new THREE.CylinderGeometry(rb * 1.15, rb * 1.15, 0.12, 14), M.dark);
    [this.b, this.r, this.e].forEach((m) => { m.castShadow = true; parent.add(m); });
    this.up = new THREE.Vector3(0, 1, 0); this.d = new THREE.Vector3(); this.q = new THREE.Quaternion();
  }
  set(a, b, frac) {   // frac: share of the length that is barrel
    this.d.subVectors(b, a); const L = this.d.length(); this.d.normalize(); this.q.setFromUnitVectors(this.up, this.d);
    const lb = L * frac, lr = L - lb * 0.92;
    this.b.quaternion.copy(this.q); this.b.scale.set(1, lb, 1); this.b.position.copy(a).addScaledVector(this.d, lb / 2);
    this.e.quaternion.copy(this.q); this.e.position.copy(a).addScaledVector(this.d, lb);
    this.r.quaternion.copy(this.q); this.r.scale.set(1, lr, 1); this.r.position.copy(b).addScaledVector(this.d, -lr / 2);
  }
}

/* ---------- crawler excavator (about 14 t): tracks, upper house with cab, boom, arm, bucket, rams ---------- */
export function excavator(M, soilMat) {
  const root = new THREE.Group();
  /* undercarriage */
  const lower = new Bag();
  const TL = 1.5, TR = 0.39, TW = 0.6;
  [-1, 1].forEach((sd) => {
    const z0 = sd > 0 ? 0.7 : -1.3;
    const loop = [[-TL, 0]].concat([[TL, 0]], arc(TL, TR, TR, -Math.PI / 2, Math.PI / 2, 10), [[-TL, 2 * TR]], arc(-TL, TR, TR, Math.PI / 2, Math.PI * 1.5, 10));
    lower.add(M.track, prof(loop, z0, z0 + TW, 0.025));
    // grousers on the top run and round the ends
    for (let x = -TL; x <= TL + 1e-3; x += 0.19) lower.add(M.track, box(x - 0.035, x + 0.035, 2 * TR, 2 * TR + 0.045, z0 + 0.01, z0 + TW - 0.01));
    [[TL, -Math.PI / 2, Math.PI / 2], [-TL, Math.PI / 2, Math.PI * 1.5]].forEach(([cx, a0, a1]) => {
      for (let i = 1; i < 8; i++) {
        const a = a0 + (a1 - a0) * i / 8, g = box(-0.035, 0.035, TR, TR + 0.045, z0 + 0.01, z0 + TW - 0.01);
        g.rotateZ(a - Math.PI / 2); g.translate(cx, TR, 0); lower.add(M.track, g);
      }
    });
    // sprocket hub, idler hub, carrier rollers, track frame on the inside
    const zo = sd > 0 ? z0 + TW + 0.005 : z0 - 0.005;
    lower.add(M.worn, cyl(0.25, 0.04, 'z', -TL, TR, zo, 18)); lower.add(M.dark, cyl(0.12, 0.06, 'z', -TL, TR, zo, 12));
    lower.add(M.worn, cyl(0.22, 0.04, 'z', TL, TR, zo, 18)); lower.add(M.dark, cyl(0.1, 0.06, 'z', TL, TR, zo, 12));
    const zi = sd > 0 ? z0 - 0.26 : z0 + TW;
    lower.add(M.dark, rbox(-TL + 0.1, TL - 0.1, 0.18, 0.62, zi, zi + 0.26, 0.05));
  });
  lower.add(M.dark, rbox(-0.65, 0.65, 0.32, 0.92, -0.72, 0.72, 0.06));
  lower.add(M.dark, cyl(0.92, 0.12, 'y', 0, 0.98, 0, 32));
  lower.build(root);

  /* upper structure: swings on the ring */
  const upper = new THREE.Group(); upper.position.y = 1.04; root.add(upper);
  const ub = new Bag();
  ub.add(M.dark, rbox(-1.15, 1.42, 0, 0.2, -1.22, 1.22, 0.04));
  // counterweight: round at the back
  const cw = arc(0, 0, 1.62, Math.PI - 0.8, Math.PI + 0.8, 16).concat([[-0.92, -1.16], [-0.92, 1.16]]);
  ub.add(M.paint, plan(cw, 0.2, 1.16, 0.05));
  ub.add(M.black, plan(arc(0, 0, 1.635, Math.PI - 0.78, Math.PI + 0.78, 16).concat([[-1.02, -1.15], [-1.02, 1.15]]), 0.2, 0.36, 0.01));
  // engine hood with louvres, exhaust, tool box, handrails
  ub.add(M.paint, rbox(-0.98, 0.18, 0.2, 1.1, -1.22, 0.24, 0.07));
  for (let i = 0; i < 6; i++) ub.add(M.black, box(-0.85 + i * 0.12, -0.8 + i * 0.12, 0.5, 0.95, -1.235, -1.21));
  ub.add(M.black, box(-0.8, -0.1, 1.1, 1.115, -1.0, -0.1));
  ub.add(M.black, cyl(0.055, 0.42, 'y', -0.35, 1.31, -0.85, 10));
  ub.add(M.paint, rbox(0.18, 1.42, 0.2, 0.86, -1.22, -0.28, 0.06));
  [[-0.9, 0.12, -1.18, -1.18], [-0.9, 0.12, 0.2, 0.2]].forEach(([x0, x1, z0, z1]) => {
    ub.add(M.paint, cyl(0.022, x1 - x0, 'x', (x0 + x1) / 2, 1.42, z0, 8));
    [x0 + 0.05, x1 - 0.05].forEach((x) => ub.add(M.paint, cyl(0.02, 0.3, 'y', x, 1.26, z0, 8)));
  });
  // cab: dark frame, big glass, a little roof, lights
  const cabZ0 = 0.3, cabZ1 = 1.22;
  const cabP = [[0.02, 0.2], [1.42, 0.2], [1.42, 0.5], [1.3, 1.78], [0.18, 1.84], [0.02, 1.62]];
  ub.add(M.paint, prof(cabP, cabZ0, cabZ1, 0.03));
  [[0.1, 0.16], [0.66, 0.72], [1.24, 1.3]].forEach(([x0, x1]) => [cabZ0 - 0.015, cabZ1 + 0.003].forEach((z) => ub.add(M.black, box(x0, x1, 0.6, 1.72, z, z + 0.012))));
  ub.add(M.glass, prof([[1.36, 0.62], [1.43, 0.6], [1.32, 1.74], [1.25, 1.75]], cabZ0 + 0.07, cabZ1 - 0.07, 0));
  ub.add(M.glass, box(0.14, 1.32, 0.62, 1.68, cabZ1 + 0.002, cabZ1 + 0.012));
  ub.add(M.glass, box(0.24, 1.24, 0.66, 1.66, cabZ0 - 0.012, cabZ0 - 0.002));
  ub.add(M.dark, box(0.7, 0.76, 0.6, 1.72, cabZ1 + 0.003, cabZ1 + 0.02));
  ub.add(M.paint, rbox(0.12, 1.36, 1.8, 1.88, cabZ0 + 0.02, cabZ1 - 0.02, 0.02));
  [cabZ0 + 0.15, cabZ1 - 0.15].forEach((z) => ub.add(M.lamp, box(1.28, 1.36, 1.8, 1.9, z - 0.08, z + 0.08)));
  ub.add(M.black, box(1.36, 1.38, 0.95, 1.15, cabZ1 + 0.1, cabZ1 + 0.26));
  ub.add(M.black, cyl(0.012, 0.25, 'z', 1.37, 1.05, cabZ1 + 0.02, 6));
  // boom foot bracket
  ub.add(M.dark, rbox(0.95, 1.55, 0.2, 0.86, -0.28, 0.24, 0.04));
  // a small brand plate on the counterweight
  ub.add(M.decal, box(-1.58, -1.5, 0.55, 0.78, -0.45, 0.45));
  ub.build(upper);

  /* boom: banana profile, pivot at B0 on the bracket */
  const B0 = new THREE.Vector3(1.32, 0.72, -0.02);
  const boom = new THREE.Group(); boom.position.copy(B0); upper.add(boom);
  const bb = new Bag();
  const BT = [4.62, 0.52];   // arm pin in boom space
  const boomP = [].concat(arc(0, 0, 0.26, -Math.PI * 0.75, Math.PI * 0.6, 8), [[1.05, 0.98], [2.15, 1.5], [3.3, 1.16]], arc(BT[0], BT[1], 0.25, Math.PI * 0.45, -Math.PI * 0.55, 8), [[3.35, 0.62], [2.25, 0.9], [1.15, 0.38]]);
  bb.add(M.paint, prof(boomP, -0.25, 0.25, 0.035));
  bb.add(M.dark, cyl(0.13, 0.62, 'z', 0, 0, 0, 16)); bb.add(M.dark, cyl(0.12, 0.56, 'z', BT[0], BT[1], 0, 16));
  bb.add(M.dark, box(1.45, 1.75, 0.38, 0.58, -0.31, 0.31));   // boom ram lugs
  bb.add(M.dark, box(2.05, 2.35, 1.36, 1.6, -0.12, 0.12));     // arm ram lug
  bb.add(M.lamp, box(1.9, 2.02, 1.22, 1.36, 0.25, 0.32));
  // hoses along the top
  const hp = new THREE.CatmullRomCurve3([[0.3, 0.32], [1.1, 1.08], [2.15, 1.58], [3.3, 1.26], [4.2, 0.95]].map((p) => new THREE.Vector3(p[0], p[1], 0.14)));
  bb.add(M.black, new THREE.TubeGeometry(hp, 24, 0.028, 6, false));
  bb.add(M.black, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(hp.points.map((p) => new THREE.Vector3(p.x, p.y, -0.14))), 24, 0.028, 6, false));
  bb.build(boom);

  /* arm (stick) */
  const arm = new THREE.Group(); arm.position.set(BT[0], BT[1], 0); boom.add(arm);
  const ab = new Bag();
  const AT = [2.55, 0];   // bucket pin in arm space
  const armP = [[-0.66, 0.5], [-0.25, 0.46], [1.0, 0.3]].concat(arc(AT[0], AT[1], 0.16, Math.PI * 0.5, -Math.PI * 0.5, 6), [[1.0, -0.3], [0.05, -0.34], [-0.38, -0.14], [-0.68, 0.24]]);
  ab.add(M.paint, prof(armP, -0.21, 0.21, 0.03));
  ab.add(M.dark, cyl(0.1, 0.5, 'z', AT[0], AT[1], 0, 14)); ab.add(M.dark, box(-0.7, -0.45, 0.32, 0.56, -0.1, 0.1)); ab.add(M.dark, box(0.12, 0.42, 0.28, 0.44, -0.1, 0.1));
  ab.build(arm);

  /* bucket: side plates, curved back, teeth, a heap of soil when loaded */
  const bucket = new THREE.Group(); bucket.position.set(AT[0], AT[1], 0); arm.add(bucket);
  const kb = new Bag();
  const outer = [[-0.12, 0.16], [0.22, 0.28], [0.62, 0.2], [0.94, -0.06], [1.08, -0.42], [1.02, -0.78], [0.86, -1.0]];
  const side = outer.concat([[0.64, -0.92], [0.42, -0.62], [0.12, -0.32], [-0.14, -0.06]]);
  [-0.52, 0.47].forEach((z) => kb.add(M.paint, prof(side, z, z + 0.05, 0.008)));
  for (let i = 0; i < outer.length - 1; i++) {   // back plate, segment by segment
    const a = outer[i], b = outer[i + 1], dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy);
    const g = box(0, L, -0.035, 0.035, -0.5, 0.5); g.rotateZ(Math.atan2(dy, dx)); g.translate(a[0], a[1], 0); kb.add(i > 3 ? M.worn : M.paint, g);
  }
  kb.add(M.worn, box(0.6, 0.9, -1.0, -0.94, -0.5, 0.5));   // cutting edge
  for (let i = 0; i < 5; i++) { const z = -0.4 + i * 0.2, g = prof([[0, 0], [0.24, 0.04], [0.24, 0.07], [0, 0.1]], z - 0.04, z + 0.04, 0.005); g.rotateZ(-2.6); g.translate(0.68, -0.96, 0); kb.add(M.worn, g); }
  kb.add(M.dark, box(-0.18, 0.12, 0.08, 0.32, -0.16, 0.16));
  kb.build(bucket);
  const loadG = new THREE.IcosahedronGeometry(1, 3), lp = loadG.attributes.position;
  for (let i = 0; i < lp.count; i++) { const v = new THREE.Vector3(lp.getX(i), lp.getY(i), lp.getZ(i)); const n = 1 + 0.18 * Math.sin(v.x * 7.1 + v.z * 3.3) * Math.cos(v.y * 5.7); v.multiplyScalar(n); lp.setXYZ(i, v.x, v.y, v.z); }
  loadG.computeVertexNormals(); loadG.scale(0.42, 0.26, 0.46);
  const load = new THREE.Mesh(loadG, soilMat); load.position.set(0.52, -0.42, 0); load.castShadow = true; bucket.add(load);

  /* rams */
  const boomRams = [-1, 1].map(() => new Ram(upper, M, 0.085, 0.05));
  const armRam = new Ram(upper, M, 0.09, 0.05), bucketRam = new Ram(upper, M, 0.075, 0.045);
  const V = () => new THREE.Vector3();
  const pA = V(), pB = V(), inv = new THREE.Matrix4();
  function local(obj, x, y, z, out) { out.set(x, y, z); obj.updateMatrixWorld(); out.applyMatrix4(obj.matrixWorld); inv.copy(upper.matrixWorld).invert(); return out.applyMatrix4(inv); }

  /* pose: angles in radians. swing turns the house, boom lifts from horizontal, arm and bucket fold */
  function pose(p) {
    upper.rotation.y = p.swing || 0;
    boom.rotation.z = p.boom != null ? p.boom : 0.35;
    arm.rotation.z = p.arm != null ? p.arm : -1.9;
    bucket.rotation.z = p.bucket != null ? p.bucket : -0.6;
    load.visible = (p.load || 0) > 0.02; load.scale.setScalar(Math.max(0.01, p.load || 0));
    root.updateMatrixWorld(true);
    [-0.3, 0.3].forEach((z, i) => { local(upper, 1.58, 0.28, z, pA); local(boom, 1.6, 0.42, z * 0.9, pB); boomRams[i].set(pA, pB, 0.58); });
    local(boom, 2.2, 1.5, 0, pA); local(arm, -0.6, 0.45, 0, pB); armRam.set(pA, pB, 0.6);
    local(arm, 0.28, 0.4, 0, pA); local(bucket, -0.08, 0.24, 0, pB); bucketRam.set(pA, pB, 0.62);
  }
  pose({});
  // the bucket tip in world space, for placing soil
  function tip(out) { bucket.updateMatrixWorld(); return out.set(0.78, -0.98, 0).applyMatrix4(bucket.matrixWorld); }
  root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return { root, upper, boom, arm, bucket, pose, tip };
}

/* a dig cycle: phase 0..1 -> joint angles. Digs in front, swings to dump on the side given by dumpSide (+1 left, -1 right) */
export function digPose(ph, dumpSide, reach) {
  const s = (a, b, x) => { const k = Math.min(1, Math.max(0, (x - a) / (b - a))); return k * k * (3 - 2 * k); };
  const L = (a, b, k) => a + (b - a) * k;
  ph = ((ph % 1) + 1) % 1; reach = reach == null ? 1 : reach;
  // keyframes: reach out, dig (curl), lift, swing, dump, swing back
  const k1 = s(0.0, 0.3, ph), k2 = s(0.3, 0.45, ph), k3 = s(0.42, 0.6, ph), k4 = s(0.6, 0.72, ph), k5 = s(0.72, 0.95, ph);
  let boom = L(0.05, -0.32, k1); boom = L(boom, 0.42, k2); boom = L(boom, 0.05, k5);
  let arm = L(-1.15 * reach - 0.35, -2.35, k1); arm = L(arm, -2.2, k2); arm = L(arm, -1.75, k4); arm = L(arm, -1.15 * reach - 0.35, k5);
  let bucket = L(-0.25, -1.75, k1); bucket = L(bucket, -1.8, k2); bucket = L(bucket, 0.25, k4); bucket = L(bucket, -0.25, k5);
  let swing = L(0, dumpSide * 1.35, k3); swing = L(swing, 0, k5);
  const load = Math.min(s(0.12, 0.3, ph), 1 - s(0.62, 0.7, ph));
  return { boom, arm, bucket, swing, load };
}

/* ---------- single-drum soil compactor (about 11 t) ---------- */
export function roller(M) {
  const root = new THREE.Group(), b = new Bag();
  // rear frame: engine hood sloping to the front, two big tyres
  b.add(M.paint, rbox(-3.2, -1.0, 0.75, 1.75, -0.95, 0.95, 0.12));
  b.add(M.paint, prof([[-3.15, 1.7], [-1.05, 1.7], [-1.3, 2.05], [-2.9, 2.08]], -0.85, 0.85, 0.05));
  for (let i = 0; i < 7; i++) b.add(M.black, box(-3.21, -3.2, 1.0, 1.5, -0.7 + i * 0.2, -0.62 + i * 0.2));
  [-1, 1].forEach((sd) => {
    const t = cyl(0.8, 0.62, 'z', -2.4, 0.8, sd * 0.88, 28); b.add(M.rubber, t);
    for (let i = 0; i < 16; i++) { const a = i * Math.PI / 8, g = box(-0.06, 0.06, 0.77, 0.83, -0.3, 0.3); g.rotateZ(a); g.translate(-2.4, 0.8 - 0.8, 0); g.translate(0, 0.8, sd * 0.88); b.add(M.rubber, g); }
    b.add(M.worn, cyl(0.42, 0.64, 'z', -2.4, 0.8, sd * 0.88, 20));
  });
  // cab on the rear frame
  b.add(M.dark, prof([[-2.6, 1.75], [-1.3, 1.75], [-1.25, 3.05], [-2.55, 3.1]], -0.72, 0.72, 0.03));
  b.add(M.glass, box(-1.28, -1.26, 1.95, 2.95, -0.62, 0.62));
  [-0.735, 0.725].forEach((z) => b.add(M.glass, box(-2.5, -1.35, 1.95, 2.95, z, z + 0.01)));
  b.add(M.paint, rbox(-2.68, -1.18, 3.08, 3.18, -0.8, 0.8, 0.03));
  b.add(M.amber, cyl(0.08, 0.12, 'y', -1.9, 3.24, 0, 12));
  // articulation and front frame round the drum
  b.add(M.dark, box(-1.05, -0.6, 0.55, 1.15, -0.35, 0.35));
  b.add(M.paint, rbox(-0.65, 0.95, 1.05, 1.55, -1.18, 1.18, 0.06));
  [-1, 1].forEach((sd) => b.add(M.paint, prof([[-0.5, 1.1], [1.6, 1.1], [1.6, 0.55], [1.3, 0.35], [-0.2, 0.35], [-0.5, 0.6]], sd > 0 ? 1.05 : -1.2, sd > 0 ? 1.2 : -1.05, 0.02)));
  b.build(root);
  // the drum turns as the machine moves
  const drum = new THREE.Group(); drum.position.set(0.75, 0.76, 0); root.add(drum);
  const db = new Bag();
  db.add(M.steel, cyl(0.76, 2.1, 'z', 0, 0, 0, 40)); db.add(M.dark, cyl(0.5, 2.16, 'z', 0, 0, 0, 24));
  for (let i = 0; i < 12; i++) { const g = box(-0.02, 0.02, 0.74, 0.77, -1.05, 1.05); g.rotateZ(i * Math.PI / 6); db.add(M.worn, g); }
  db.build(drum);
  root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return { root, roll(dist) { drum.rotation.z = -dist / 0.76; } };
}

/* ---------- three-axle tipper truck: cab, chassis, body that tips back ---------- */
export function tipper(M, loadMat) {
  const root = new THREE.Group(), b = new Bag();
  // chassis rails and wheels (three axles, cab at +x)
  b.add(M.dark, box(-3.6, 3.0, 0.75, 1.05, -0.55, 0.55));
  [[2.25, 0.5], [-1.45, 0.5], [-2.85, 0.5]].forEach(([x, r]) => [-1, 1].forEach((sd) => {
    b.add(M.rubber, cyl(r, 0.42, 'z', x, r, sd * 1.0, 24)); b.add(M.steel, cyl(r * 0.5, 0.44, 'z', x, r, sd * 1.0, 16));
  }));
  [[2.25], [-2.15]].forEach(([x]) => b.add(M.dark, rbox(x - 0.85, x + 0.85, 1.0, 1.06, -1.25, 1.25, 0.02)));
  // cab
  b.add(M.cabPaint, rbox(2.55, 4.35, 0.95, 3.25, -1.22, 1.22, 0.12));
  b.add(M.glass, prof([[4.3, 2.05], [4.38, 2.05], [4.32, 3.0], [4.24, 3.0]], -1.08, 1.08, 0));
  [-1.235, 1.225].forEach((z) => b.add(M.glass, box(3.35, 4.2, 2.05, 2.95, z, z + 0.01)));
  b.add(M.dark, box(4.35, 4.4, 0.95, 1.55, -1.1, 1.1));
  [-0.8, 0.8].forEach((z) => b.add(M.lamp, box(4.36, 4.42, 1.05, 1.25, z - 0.18, z + 0.18)));
  b.add(M.amber, box(3.0, 3.6, 3.25, 3.36, -0.6, 0.6));
  b.build(root);
  // tipping body
  const body = new THREE.Group(); body.position.set(-3.55, 1.12, 0); root.add(body);
  const bb = new Bag();
  const L = 5.6, Hb = 1.35, Wb = 2.42;
  bb.add(M.paint, box(0, L, 0, 0.1, -Wb / 2, Wb / 2));
  [-1, 1].forEach((sd) => bb.add(M.paint, prof([[0, 0], [L, 0], [L, Hb], [0.2, Hb]], sd > 0 ? Wb / 2 - 0.08 : -Wb / 2, sd > 0 ? Wb / 2 : -Wb / 2 + 0.08, 0.01)));
  bb.add(M.paint, box(L - 0.1, L, 0, Hb + 0.25, -Wb / 2, Wb / 2));
  bb.add(M.paint, box(-0.04, 0.06, 0.05, Hb, -Wb / 2 + 0.05, Wb / 2 - 0.05));
  for (let i = 1; i < 5; i++) [-1, 1].forEach((sd) => bb.add(M.paintDirty, box(i * 1.1 - 0.05, i * 1.1 + 0.05, 0.05, Hb, sd * (Wb / 2 + 0.01) - 0.02, sd * (Wb / 2 + 0.01) + 0.02)));
  bb.build(body);
  const heapG = new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), hp = heapG.attributes.position;
  for (let i = 0; i < hp.count; i++) { const n = 1 + 0.1 * Math.sin(hp.getX(i) * 9) * Math.cos(hp.getZ(i) * 7); hp.setXYZ(i, hp.getX(i) * n, hp.getY(i) * n, hp.getZ(i) * n); }
  heapG.computeVertexNormals(); heapG.scale(2.6, 0.75, 1.1);
  const heap = new THREE.Mesh(heapG, loadMat); heap.position.set(L / 2, 0.55, 0); heap.castShadow = true; body.add(heap);
  root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return { root, tip(k, loadLeft) { body.rotation.z = 0.85 * k; heap.visible = loadLeft > 0.02; heap.scale.set(1, Math.max(0.02, loadLeft), 1); heap.position.x = L / 2 - (1 - loadLeft) * 1.2; } };
}

/* ---------- temporary site fence: mesh panels on concrete feet; returns geometry for a run of panels ---------- */
export function fenceMesh(maxAniso, wire, spacing) {
  const cv = document.createElement('canvas'); cv.width = 64; cv.height = 128; const g = cv.getContext('2d');
  g.clearRect(0, 0, 64, 128); g.fillStyle = '#fff';
  const s = spacing || 16; for (let i = 0; i < 64; i += s) g.fillRect(i, 0, wire || 3, 128); for (let j = 0; j < 128; j += s * 2) g.fillRect(0, j, 64, wire || 3);
  const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = maxAniso || 4; return t;
}
