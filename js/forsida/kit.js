/* P. Blöndal – site equipment for the 3D story, built in code: shared materials, geometry helpers
   and the wire mesh used by the temporary site fence and the finished fence. No work machines:
   each chapter shows the state of the site, not the machines doing the work. Units are metres. */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const C = (h) => new THREE.Color(h);

/* ---------- shared materials ---------- */
export function kitMaterials() {
  const dark = new THREE.MeshStandardMaterial({ color: 0x25272a, roughness: 0.55, metalness: 0.45 });
  const black = new THREE.MeshStandardMaterial({ color: 0x141516, roughness: 0.6, metalness: 0.3 });
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x0c1114, roughness: 0.04, metalness: 0.1, envMapIntensity: 1.7, clearcoat: 1, clearcoatRoughness: 0.05 });
  const lamp = new THREE.MeshStandardMaterial({ color: 0xeeeae2, roughness: 0.25, emissive: C('#fff1d6'), emissiveIntensity: 0 });
  const amber = new THREE.MeshStandardMaterial({ color: 0xe0861a, roughness: 0.3, emissive: C('#ff9a2a'), emissiveIntensity: 0 });
  const galv = new THREE.MeshStandardMaterial({ color: 0xa9adb0, roughness: 0.42, metalness: 0.8 });
  const conc = new THREE.MeshStandardMaterial({ color: 0x9c9890, roughness: 0.92 });
  return { dark, black, glass, lamp, amber, galv, conc };
}

/* ---------- geometry helpers ---------- */
function idx(g) { if (!g.index) g.setIndex([...Array(g.attributes.position.count).keys()]); return g; }
export function box(x0, x1, y0, y1, z0, z1) { const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0); g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); return g; }
export function cyl(r, len, axis, x, y, z, seg, r2) {
  const g = new THREE.CylinderGeometry(r2 != null ? r2 : r, r, len, seg || 16);
  if (axis === 'x') g.rotateZ(-Math.PI / 2); else if (axis === 'z') g.rotateX(Math.PI / 2);
  g.translate(x, y, z); return g;
}
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

/* ---------- wire mesh texture for fence panels (white wires on transparent, tiled) ---------- */
export function fenceMesh(maxAniso, wire, spacing) {
  const cv = document.createElement('canvas'); cv.width = 64; cv.height = 128; const g = cv.getContext('2d');
  g.clearRect(0, 0, 64, 128); g.fillStyle = '#fff';
  const s = spacing || 16; for (let i = 0; i < 64; i += s) g.fillRect(i, 0, wire || 3, 128); for (let j = 0; j < 128; j += s * 2) g.fillRect(0, j, 64, wire || 3);
  const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = maxAniso || 4; return t;
}
