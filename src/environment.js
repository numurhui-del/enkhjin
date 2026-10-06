import * as THREE from 'three';
import { mulberry32 } from './utils.js';
import { getGlowTexture } from './effects.js';

// Шөнийн романтик цэцэрлэг: зүлэг, мод, цэцэг, чулуун зам,
// модон сандал, гэрэл, сар, од, гэрэлт цох.
// Бүгд код дотор үүснэ, model файл шаардлагагүй.

const SEAT_TOP = 0.42;  // сандлын суудлын өндөр
const SEAT_Z = 0.16;    // character суух цэг (сандлын local z)

const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const SKY_FRAG = /* glsl */ `
uniform vec3 topColor;
uniform vec3 midColor;
uniform vec3 horizonColor;
varying vec3 vDir;
void main() {
  float h = vDir.y;
  vec3 col = mix(horizonColor, midColor, smoothstep(-0.02, 0.22, h));
  col = mix(col, topColor, smoothstep(0.2, 0.85, h));
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

const STAR_VERT = /* glsl */ `
attribute float aSize;
attribute float aPhase;
uniform float uTime;
uniform float uPixelRatio;
varying float vAlpha;
void main() {
  vAlpha = 0.55 + 0.45 * sin(uTime * (0.8 + aPhase * 0.6) + aPhase * 6.2831);
  gl_PointSize = aSize * uPixelRatio;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const STAR_FRAG = /* glsl */ `
varying float vAlpha;
void main() {
  float d = length(gl_PointCoord - 0.5);
  if (d > 0.5) discard;
  float a = smoothstep(0.5, 0.0, d) * vAlpha;
  gl_FragColor = vec4(vec3(1.0, 0.97, 0.9), a);
  #include <colorspace_fragment>
}`;

const FIREFLY_VERT = /* glsl */ `
attribute float aPhase;
uniform float uTime;
uniform float uScale;
varying float vAlpha;
void main() {
  vec3 p = position;
  p.x += sin(uTime * 0.6 + aPhase * 7.0) * 0.6;
  p.y += sin(uTime * 0.9 + aPhase * 3.0) * 0.35;
  p.z += cos(uTime * 0.5 + aPhase * 5.0) * 0.6;
  vAlpha = 0.35 + 0.65 * pow(0.5 + 0.5 * sin(uTime * 2.2 + aPhase * 12.0), 2.0);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = 0.16 * uScale / -mv.z;
  gl_Position = projectionMatrix * mv;
}`;

const FIREFLY_FRAG = /* glsl */ `
varying float vAlpha;
void main() {
  float d = length(gl_PointCoord - 0.5);
  if (d > 0.5) discard;
  float a = pow(smoothstep(0.5, 0.0, d), 1.5) * vAlpha;
  gl_FragColor = vec4(vec3(1.0, 0.93, 0.55), a);
  #include <colorspace_fragment>
}`;

export function createEnvironment(scene, config) {
  const rng = mulberry32(config.world.seed);
  const colliders = [];
  const updaters = [];

  // ---------------- Сандлын координат ----------------
  const [bx, bz] = config.bench.position;
  const br = config.bench.rotationY;
  const cosR = Math.cos(br);
  const sinR = Math.sin(br);
  const benchToWorld = (lx, y, lz) =>
    new THREE.Vector3(bx + lx * cosR + lz * sinR, y, bz - lx * sinR + lz * cosR);
  const worldToBench = (p) => {
    const dx = p.x - bx;
    const dz = p.z - bz;
    return { x: dx * cosR - dz * sinR, z: dx * sinR + dz * cosR };
  };

  const [sx, sz] = config.player.start;
  const [mx, mz] = config.me.position;
  const [tx, tz] = config.table.position;
  const nearTable = (x, z, d) => Math.hypot(x - tx, z - tz) < d;

  // ---------------- Тэнгэр, манан, гэрэл ----------------
  const horizon = new THREE.Color('#2a2560');
  scene.fog = new THREE.Fog(horizon, 24, 75);
  scene.background = horizon.clone();

  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(220, 32, 16),
    new THREE.ShaderMaterial({
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      uniforms: {
        topColor: { value: new THREE.Color('#050818') },
        midColor: { value: new THREE.Color('#121844') },
        horizonColor: { value: horizon.clone() },
      },
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    })
  );
  sky.renderOrder = -10;
  scene.add(sky);

  scene.add(new THREE.HemisphereLight('#8fa2ff', '#1f3b2a', 2.0));
  scene.add(new THREE.AmbientLight('#5a5aa0', 0.9));
  const moonLight = new THREE.DirectionalLight('#d4dcff', 2.2);
  moonLight.position.set(-30, 45, -60);
  scene.add(moonLight);

  // ---------------- Газар ----------------
  const groundGeo = new THREE.PlaneGeometry(150, 150, 60, 60);
  groundGeo.rotateX(-Math.PI / 2);
  const gpos = groundGeo.attributes.position;
  const gcol = [];
  const cA = new THREE.Color('#3f8a4c');
  const cB = new THREE.Color('#2f6e3d');
  const cHill = new THREE.Color('#24553a');
  const tmp = new THREE.Color();
  for (let i = 0; i < gpos.count; i++) {
    const x = gpos.getX(i);
    const z = gpos.getZ(i);
    const r = Math.hypot(x, z);
    let y = 0;
    if (r > 26) {
      y = (r - 26) * 0.14 + Math.sin(x * 0.21) * Math.cos(z * 0.17) * 1.4 * Math.min(1, (r - 26) / 10);
    }
    gpos.setY(i, y);
    tmp.copy(cA).lerp(cB, rng());
    if (r > 26) tmp.lerp(cHill, Math.min(1, (r - 26) / 20));
    gcol.push(tmp.r, tmp.g, tmp.b);
  }
  groundGeo.setAttribute('color', new THREE.Float32BufferAttribute(gcol, 3));
  groundGeo.computeVertexNormals();
  const ground = new THREE.Mesh(
    groundGeo,
    new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })
  );
  scene.add(ground);

  // ---------------- Чулуун зам ----------------
  const toV = (x, z) => new THREE.Vector3(x, 0, z);
  const mainDir = new THREE.Vector2(mx - sx, mz - sz).normalize();
  const perp = new THREE.Vector2(-mainDir.y, mainDir.x);
  const lerpP = (k, side) =>
    toV(sx + (mx - sx) * k + perp.x * side, sz + (mz - sz) * k + perp.y * side);
  const mainCurve = new THREE.CatmullRomCurve3([
    toV(sx, sz),
    lerpP(0.3, 1.4),
    lerpP(0.62, -1.1),
    toV(mx - mainDir.x * 1.2, mz - mainDir.y * 1.2),
  ]);
  const benchCurve = new THREE.CatmullRomCurve3([
    toV(mx, mz),
    benchToWorld(-2.6, 0, -1.4),
    benchToWorld(-2.1, 0, 1.2),
    benchToWorld(0, 0, 1.3),
  ]);
  const tableCurve = new THREE.CatmullRomCurve3([
    toV(mx + 0.6, mz - 0.4),
    toV((mx + tx) / 2 + 0.4, (mz + tz) / 2 + 0.6),
    toV(tx, tz + 1.4),
  ]);
  const pathPoints = [
    ...mainCurve.getSpacedPoints(60),
    ...benchCurve.getSpacedPoints(24),
    ...tableCurve.getSpacedPoints(12),
  ];

  const stones = [];
  const addStones = (curve, spacing) => {
    const len = curve.getLength();
    const n = Math.floor(len / spacing);
    for (let i = 0; i <= n; i++) {
      const p = curve.getPointAt(i / n);
      const t = curve.getTangentAt(i / n);
      for (const side of [-0.32, 0.32]) {
        stones.push({
          x: p.x - t.z * side + (rng() - 0.5) * 0.18,
          z: p.z + t.x * side + (rng() - 0.5) * 0.18,
          s: 0.75 + rng() * 0.45,
          r: rng() * Math.PI,
        });
      }
    }
  };
  addStones(mainCurve, 0.75);
  addStones(benchCurve, 0.75);
  addStones(tableCurve, 0.75);

  const stoneMesh = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.3, 0.33, 0.1, 7),
    new THREE.MeshLambertMaterial({ flatShading: true }),
    stones.length
  );
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const v = new THREE.Vector3();
  const sc = new THREE.Vector3();
  const stoneColor = new THREE.Color();
  stones.forEach((st, i) => {
    q.setFromEuler(e.set(0, st.r, 0));
    m4.compose(v.set(st.x, 0.03, st.z), q, sc.set(st.s, 1, st.s));
    stoneMesh.setMatrixAt(i, m4);
    stoneMesh.setColorAt(i, stoneColor.setHSL(0.68, 0.08, 0.55 + rng() * 0.15));
  });
  scene.add(stoneMesh);

  const nearPath = (x, z, d) => {
    for (const p of pathPoints) {
      if ((p.x - x) ** 2 + (p.z - z) ** 2 < d * d) return true;
    }
    return false;
  };

  const benchClear = (x, z) => {
    const l = worldToBench({ x, z });
    if (Math.hypot(l.x, l.z) < 5) return false;
    // сандлын урд талын тэнгэр харагдах хэсгийг модгүй үлдээнэ
    if (l.z > 0 && l.z < 24 && Math.abs(l.x) < l.z * 0.7 + 3) return false;
    return true;
  };

  // ---------------- Мод ----------------
  const trees = [];
  for (let i = 0; i < 600 && trees.length < 75; i++) {
    const a = rng() * Math.PI * 2;
    const r = 6 + rng() * 40;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    if (nearPath(x, z, 3)) continue;
    if (!benchClear(x, z)) continue;
    if (Math.hypot(x - sx, z - sz) < 4.5 || Math.hypot(x - mx, z - mz) < 4.5) continue;
    if (nearTable(x, z, 5)) continue;
    if (trees.some((t) => Math.hypot(t.x - x, t.z - z) < 2.6)) continue;
    const ground = r > 26 ? (r - 26) * 0.14 : 0;
    trees.push({ x, z, y: ground, s: 0.8 + rng() * 0.7, pine: rng() < 0.55, rot: rng() * Math.PI });
  }

  const pines = trees.filter((t) => t.pine);
  const rounds = trees.filter((t) => !t.pine);
  const trunkMesh = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.14, 0.2, 1, 6),
    new THREE.MeshLambertMaterial({ color: '#5a3b2a', flatShading: true }),
    trees.length
  );
  const coneGeos = [
    new THREE.ConeGeometry(1.2, 1.5, 7),
    new THREE.ConeGeometry(0.95, 1.3, 7),
    new THREE.ConeGeometry(0.65, 1.1, 7),
  ];
  const leafMat = new THREE.MeshLambertMaterial({ flatShading: true });
  const coneMeshes = coneGeos.map((g) => new THREE.InstancedMesh(g, leafMat, Math.max(1, pines.length)));
  const roundMesh = new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(1, 0),
    leafMat,
    Math.max(1, rounds.length)
  );
  const leafColor = new THREE.Color();

  trees.forEach((t, i) => {
    q.setFromEuler(e.set(0, t.rot, 0));
    m4.compose(v.set(t.x, t.y + 0.5 * t.s, t.z), q, sc.set(t.s, t.s, t.s));
    trunkMesh.setMatrixAt(i, m4);
    if (t.x ** 2 + t.z ** 2 < (config.world.walkRadius + 2) ** 2) {
      colliders.push({ x: t.x, z: t.z, r: 0.35 * t.s });
    }
  });
  pines.forEach((t, i) => {
    leafColor.setHSL(0.36 + rng() * 0.06, 0.45, 0.2 + rng() * 0.08);
    const heights = [1.4, 2.2, 2.9];
    coneMeshes.forEach((mesh, k) => {
      q.setFromEuler(e.set(0, t.rot + k, 0));
      m4.compose(v.set(t.x, t.y + heights[k] * t.s, t.z), q, sc.set(t.s, t.s, t.s));
      mesh.setMatrixAt(i, m4);
      mesh.setColorAt(i, leafColor);
    });
  });
  rounds.forEach((t, i) => {
    leafColor.setHSL(0.3 + rng() * 0.08, 0.42, 0.22 + rng() * 0.08);
    q.setFromEuler(e.set(rng(), t.rot, rng()));
    m4.compose(v.set(t.x, t.y + 1.9 * t.s, t.z), q, sc.set(1.25 * t.s, 1.15 * t.s, 1.25 * t.s));
    roundMesh.setMatrixAt(i, m4);
    roundMesh.setColorAt(i, leafColor);
  });
  if (pines.length === 0) coneMeshes.forEach((m) => (m.count = 0));
  if (rounds.length === 0) roundMesh.count = 0;
  scene.add(trunkMesh, roundMesh, ...coneMeshes);

  // ---------------- Бут ----------------
  const bushes = [];
  for (let i = 0; i < 300 && bushes.length < 26; i++) {
    const a = rng() * Math.PI * 2;
    const r = 5 + rng() * 19;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    if (nearPath(x, z, 1.8)) continue;
    if (Math.hypot(x - mx, z - mz) < 3 || Math.hypot(x - sx, z - sz) < 3) continue;
    // эхлэх цэгийн ард camera байрлах тул тэнд бут тавихгүй
    if (z > sz - 2 && Math.abs(x - sx) < 6) continue;
    if (nearTable(x, z, 3.5)) continue;
    const l = worldToBench({ x, z });
    if (Math.hypot(l.x, l.z) < 3.5) continue;
    bushes.push({ x, z, s: 0.45 + rng() * 0.35 });
  }
  const bushMesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), leafMat, bushes.length);
  bushes.forEach((b, i) => {
    q.setFromEuler(e.set(rng(), rng() * 3, 0));
    m4.compose(v.set(b.x, b.s * 0.6, b.z), q, sc.set(b.s * 1.2, b.s, b.s * 1.2));
    bushMesh.setMatrixAt(i, m4);
    bushMesh.setColorAt(i, leafColor.setHSL(0.33 + rng() * 0.05, 0.45, 0.24 + rng() * 0.06));
    colliders.push({ x: b.x, z: b.z, r: b.s * 0.9 });
  });
  scene.add(bushMesh);

  // ---------------- Цэцэг, өвс ----------------
  const flowerColors = ['#ff8fb8', '#ffffff', '#ffe066', '#c9a7ff', '#ff6b6b', '#8fd3ff'].map(
    (c) => new THREE.Color(c)
  );
  const flowers = [];
  for (let p = 0; p < 40; p++) {
    const a = rng() * Math.PI * 2;
    const r = 2 + rng() * 21;
    const cx = Math.cos(a) * r;
    const cz = Math.sin(a) * r;
    const color = flowerColors[Math.floor(rng() * flowerColors.length)];
    const n = 5 + Math.floor(rng() * 8);
    for (let i = 0; i < n; i++) {
      const x = cx + (rng() - 0.5) * 2.2;
      const z = cz + (rng() - 0.5) * 2.2;
      if (nearPath(x, z, 0.8) || nearTable(x, z, 1.9)) continue;
      flowers.push({ x, z, h: 0.14 + rng() * 0.12, color });
    }
  }
  // Сандал, миний орчимд цэцэг нэмнэ
  for (let i = 0; i < 40; i++) {
    const a = rng() * Math.PI * 2;
    const r = 1.6 + rng() * 2.4;
    const near = i % 2 === 0 ? benchToWorld(0, 0, 0) : toV(mx, mz);
    const x = near.x + Math.cos(a) * r;
    const z = near.z + Math.sin(a) * r;
    if (nearPath(x, z, 0.7)) continue;
    const l = worldToBench({ x, z });
    if (Math.abs(l.x) < 2.2 && l.z > -0.8 && l.z < 1.6) continue;
    if (nearTable(x, z, 1.9)) continue;
    flowers.push({ x, z, h: 0.14 + rng() * 0.12, color: flowerColors[i % flowerColors.length] });
  }

  const stemMesh = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.012, 0.012, 1, 4),
    new THREE.MeshLambertMaterial({ color: '#3d8a3f' }),
    flowers.length
  );
  const headMesh = new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(0.075, 0),
    new THREE.MeshLambertMaterial({ flatShading: true, emissive: '#221122' }),
    flowers.length
  );
  flowers.forEach((f, i) => {
    q.identity();
    m4.compose(v.set(f.x, f.h / 2, f.z), q, sc.set(1, f.h, 1));
    stemMesh.setMatrixAt(i, m4);
    m4.compose(v.set(f.x, f.h, f.z), q, sc.set(1, 0.6, 1));
    headMesh.setMatrixAt(i, m4);
    headMesh.setColorAt(i, f.color);
  });
  scene.add(stemMesh, headMesh);

  const grassCount = 600;
  const grassMesh = new THREE.InstancedMesh(
    new THREE.ConeGeometry(0.05, 0.24, 4),
    new THREE.MeshLambertMaterial({ flatShading: true }),
    grassCount
  );
  let gi = 0;
  for (let i = 0; i < grassCount * 3 && gi < grassCount; i++) {
    const a = rng() * Math.PI * 2;
    const r = Math.sqrt(rng()) * 25;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    if (nearPath(x, z, 0.6) || nearTable(x, z, 1.2)) continue;
    const s = 0.6 + rng() * 0.8;
    q.setFromEuler(e.set((rng() - 0.5) * 0.4, 0, (rng() - 0.5) * 0.4));
    m4.compose(v.set(x, 0.1 * s, z), q, sc.set(s, s, s));
    grassMesh.setMatrixAt(gi, m4);
    grassMesh.setColorAt(gi, leafColor.setHSL(0.3 + rng() * 0.06, 0.5, 0.28 + rng() * 0.1));
    gi++;
  }
  grassMesh.count = gi;
  scene.add(grassMesh);

  // ---------------- Модон сандал ----------------
  const bench = new THREE.Group();
  const wood = new THREE.MeshLambertMaterial({ color: '#9a6a43', flatShading: true });
  const woodDark = new THREE.MeshLambertMaterial({ color: '#6b4429', flatShading: true });
  const box = (w, h, d, mat, x, y, z, rx = 0) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.rotation.x = rx;
    bench.add(m);
    return m;
  };
  for (const z of [-0.18, 0, 0.18]) box(2.75, 0.05, 0.16, wood, 0, SEAT_TOP - 0.025, z);
  for (const y of [0.68, 0.88]) box(2.75, 0.12, 0.05, wood, 0, y, -0.32, -0.12);
  for (const x of [-1.24, 1.24]) {
    box(0.08, SEAT_TOP - 0.05, 0.08, woodDark, x, (SEAT_TOP - 0.05) / 2, 0.18);
    box(0.08, 0.95, 0.08, woodDark, x, 0.475, -0.28, -0.12);
    box(0.08, 0.06, 0.55, woodDark, x, SEAT_TOP + 0.18, -0.02);
    box(0.06, 0.2, 0.06, woodDark, x, SEAT_TOP + 0.08, 0.2);
  }
  bench.position.set(bx, 0, bz);
  bench.rotation.y = br;
  scene.add(bench);
  for (const lx of [-0.8, 0, 0.8]) {
    const p = benchToWorld(lx, 0, 0);
    colliders.push({ x: p.x, z: p.z, r: 0.5 });
  }

  // ---------------- Бялуутай дугуй ширээ ----------------
  const TABLE_TOP = 0.62;
  const table = new THREE.Group();
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.06, 20), wood);
  top.position.y = TABLE_TOP - 0.03;
  const cloth = new THREE.Mesh(
    new THREE.CylinderGeometry(0.64, 0.7, 0.16, 20, 1, true),
    new THREE.MeshLambertMaterial({ color: '#ffd1e3', side: THREE.DoubleSide })
  );
  cloth.position.y = TABLE_TOP - 0.1;
  const clothTop = new THREE.Mesh(new THREE.CircleGeometry(0.64, 20), new THREE.MeshLambertMaterial({ color: '#fff0f6' }));
  clothTop.rotation.x = -Math.PI / 2;
  clothTop.position.y = TABLE_TOP + 0.002;
  const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, TABLE_TOP, 8), woodDark);
  leg.position.y = TABLE_TOP / 2;
  const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.34, 0.05, 12), woodDark);
  foot.position.y = 0.025;
  table.add(top, cloth, clothTop, leg, foot);
  table.position.set(tx, 0, tz);
  scene.add(table);
  colliders.push({ x: tx, z: tz, r: 0.72 });

  // ---------------- Гудамжны гэрэл ----------------
  const lampSpots = [toV(mx - 1.8, mz + 0.6), benchToWorld(3.0, 0, -0.5), toV(tx + 1.6, tz - 1.0)];
  const glowTex = getGlowTexture();
  const lamps = lampSpots.map((p) => {
    const g = new THREE.Group();
    const post = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.08, 2.1, 8),
      new THREE.MeshLambertMaterial({ color: '#2b2b36' })
    );
    post.position.y = 1.05;
    const lantern = new THREE.Mesh(
      new THREE.BoxGeometry(0.24, 0.3, 0.24),
      new THREE.MeshBasicMaterial({ color: '#ffd9a0' })
    );
    lantern.position.y = 2.22;
    const cap = new THREE.Mesh(
      new THREE.ConeGeometry(0.22, 0.16, 4),
      new THREE.MeshLambertMaterial({ color: '#2b2b36' })
    );
    cap.position.y = 2.45;
    cap.rotation.y = Math.PI / 4;
    const glow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glowTex,
        color: '#ffc27a',
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    );
    glow.position.y = 2.22;
    glow.scale.setScalar(1.6);
    const light = new THREE.PointLight('#ffc27a', 9, 13, 2);
    light.position.y = 2.1;
    g.add(post, lantern, cap, glow, light);
    g.position.copy(p);
    scene.add(g);
    colliders.push({ x: p.x, z: p.z, r: 0.25 });
    return { light, glow, phase: rng() * 10 };
  });
  updaters.push((t) => {
    for (const l of lamps) {
      const f = 1 + Math.sin(t * 7 + l.phase) * 0.03 + Math.sin(t * 13 + l.phase) * 0.02;
      l.light.intensity = 9 * f;
      l.glow.scale.setScalar(1.6 * f);
    }
  });

  // ---------------- Сар ----------------
  const moonPos = benchToWorld(-17, 23, 105);
  const moon = new THREE.Mesh(
    new THREE.SphereGeometry(6, 24, 16),
    new THREE.MeshBasicMaterial({ color: '#fff4d6', fog: false })
  );
  moon.position.copy(moonPos);
  const moonGlow = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowTex,
      color: '#c9d4ff',
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      fog: false,
      blending: THREE.AdditiveBlending,
    })
  );
  moonGlow.position.copy(moonPos);
  moonGlow.scale.setScalar(36);
  scene.add(moonGlow, moon);
  moonLight.position.copy(moonPos);

  // ---------------- Одод ----------------
  const starCount = 900;
  const starPos = new Float32Array(starCount * 3);
  const starSize = new Float32Array(starCount);
  const starPhase = new Float32Array(starCount);
  for (let i = 0; i < starCount; i++) {
    const u = rng();
    const y = 0.08 + u * 0.92;
    const a = rng() * Math.PI * 2;
    const rr = Math.sqrt(1 - y * y);
    starPos[i * 3] = Math.cos(a) * rr * 200;
    starPos[i * 3 + 1] = y * 200;
    starPos[i * 3 + 2] = Math.sin(a) * rr * 200;
    starSize[i] = 1 + rng() * rng() * 3.2;
    starPhase[i] = rng();
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  starGeo.setAttribute('aSize', new THREE.BufferAttribute(starSize, 1));
  starGeo.setAttribute('aPhase', new THREE.BufferAttribute(starPhase, 1));
  const starMat = new THREE.ShaderMaterial({
    vertexShader: STAR_VERT,
    fragmentShader: STAR_FRAG,
    uniforms: { uTime: { value: 0 }, uPixelRatio: { value: 1 } },
    transparent: true,
    depthWrite: false,
    fog: false,
  });
  const stars = new THREE.Points(starGeo, starMat);
  stars.renderOrder = -9;
  stars.frustumCulled = false;
  scene.add(stars);
  updaters.push((t) => (starMat.uniforms.uTime.value = t));

  // ---------------- Гэрэлт цох ----------------
  const flyCount = 60;
  const flyPos = new Float32Array(flyCount * 3);
  const flyPhase = new Float32Array(flyCount);
  for (let i = 0; i < flyCount; i++) {
    const a = rng() * Math.PI * 2;
    const r = 2 + rng() * 18;
    flyPos[i * 3] = Math.cos(a) * r;
    flyPos[i * 3 + 1] = 0.5 + rng() * 2.2;
    flyPos[i * 3 + 2] = Math.sin(a) * r;
    flyPhase[i] = rng();
  }
  const flyGeo = new THREE.BufferGeometry();
  flyGeo.setAttribute('position', new THREE.BufferAttribute(flyPos, 3));
  flyGeo.setAttribute('aPhase', new THREE.BufferAttribute(flyPhase, 1));
  const flyMat = new THREE.ShaderMaterial({
    vertexShader: FIREFLY_VERT,
    fragmentShader: FIREFLY_FRAG,
    uniforms: { uTime: { value: 0 }, uScale: { value: 800 } },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const flies = new THREE.Points(flyGeo, flyMat);
  flies.frustumCulled = false;
  scene.add(flies);
  updaters.push((t) => (flyMat.uniforms.uTime.value = t));

  // ---------------- Сандал руу очих төлөвлөгөө ----------------
  // Хоёр character сандлын аль нэг үзүүрээр тойрч ирээд урд талд нь зогсоод сууна.
  function planSeats(herPos, mePos) {
    const lh = worldToBench(herPos);
    const lm = worldToBench(mePos);
    const side = Math.sign(lh.x + lm.x) || 1;
    const pathFor = (l, seatX) => {
      const pts = [];
      if (l.z < 0.6) {
        if (l.z < -0.5) pts.push(benchToWorld(side * 2.2, 0, -1.1));
        pts.push(benchToWorld(side * 2.2, 0, 1.1));
      }
      pts.push(benchToWorld(seatX, 0, 1.08));
      return pts;
    };
    const farSeat = -side * 0.56;
    const nearSeat = side * 0.56;
    return {
      me: { path: pathFor(lm, farSeat), seat: benchToWorld(farSeat, 0, SEAT_Z) },
      her: { path: pathFor(lh, nearSeat), seat: benchToWorld(nearSeat, 0, SEAT_Z) },
      facing: br,
      seatTop: SEAT_TOP,
    };
  }

  return {
    colliders,
    table: {
      position: new THREE.Vector3(tx, 0, tz),
      cakePosition: new THREE.Vector3(tx, TABLE_TOP + 0.005, tz),
    },
    bench: { toWorld: benchToWorld, toLocal: worldToBench, planSeats, rotationY: br },
    setViewport(heightPx, fovDeg, pixelRatio) {
      flyMat.uniforms.uScale.value = heightPx / (2 * Math.tan((fovDeg * Math.PI) / 360));
      starMat.uniforms.uPixelRatio.value = pixelRatio;
    },
    update(t) {
      for (const fn of updaters) fn(t);
    },
  };
}
