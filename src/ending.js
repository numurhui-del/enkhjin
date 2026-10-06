import * as THREE from 'three';
import { easeInOutSine } from './utils.js';

// Төгсгөлийн cinematic хэсэг.
// Алхам бүр нь await хийгддэг тул дарааллыг уншихад хялбар,
// хугацааг өөрчлөхөд wait(...) доторх тоог л солиход хангалттай.

// Замын хэрчим саадын (нөгөө дүр, ширээ) дэргэдүүр өнгөрвөл тойрох цэг оруулна.
// Тойрох талыг бусад саад (мод, ширээ, шон) -оос хамгийн хол байгаагаар нь сонгож,
// цэг аль нэг саадын дотор унавал гадагш нь гаргана. Ингэснээр мөргөлдөж гацахгүй.
let worldColliders = [];
const BODY = 0.45;

function freeScore(x, z) {
  let best = Infinity;
  for (const c of worldColliders) {
    if (c.owner) continue;
    best = Math.min(best, Math.hypot(x - c.x, z - c.z) - c.r - BODY);
  }
  return best;
}

function pushOut(p) {
  for (let k = 0; k < 3; k++) {
    for (const c of worldColliders) {
      if (c.owner) continue;
      const dx = p.x - c.x;
      const dz = p.z - c.z;
      const d = Math.hypot(dx, dz);
      const min = c.r + BODY + 0.05;
      if (d < min && d > 1e-4) {
        p.x = c.x + (dx / d) * min;
        p.z = c.z + (dz / d) * min;
      }
    }
  }
  return p;
}

function detour(start, path, obstacles) {
  let pts = path.map((p) => p.clone());
  for (const { pos, clearance } of obstacles) {
    const out = [];
    let a = start;
    for (const b of pts) {
      const abx = b.x - a.x;
      const abz = b.z - a.z;
      const len2 = abx * abx + abz * abz || 1;
      const t = ((pos.x - a.x) * abx + (pos.z - a.z) * abz) / len2;
      if (t > 0.05 && t < 0.95) {
        const cx = a.x + abx * t;
        const cz = a.z + abz * t;
        if (Math.hypot(pos.x - cx, pos.z - cz) < clearance) {
          const nl = Math.hypot(abx, abz) || 1;
          const nx = -abz / nl;
          const nz = abx / nl;
          const p1 = new THREE.Vector3(pos.x + nx * clearance, 0, pos.z + nz * clearance);
          const p2 = new THREE.Vector3(pos.x - nx * clearance, 0, pos.z - nz * clearance);
          out.push(pushOut(freeScore(p1.x, p1.z) >= freeScore(p2.x, p2.z) ? p1 : p2));
        }
      }
      out.push(b);
      a = b;
    }
    pts = out;
  }
  return pts;
}

export async function playEnding(ctx) {
  const { wait: waitFn } = ctx;
  // нөхцөл биелтэл (эсвэл хамгийн ихдээ maxSeconds) хүлээнэ
  const waitUntil = async (cond, maxSeconds) => {
    let t = 0;
    while (!cond() && t < maxSeconds) {
      await waitFn(0.1);
      t += 0.1;
    }
  };
  const { her, me, bench, table, cake, dialogue, story, colliders, rig, fireworks, fireworkText, hearts, tags, audio, ui, wait, config } = ctx;

  worldColliders = colliders || [];
  ui.hideHint();
  ui.showCinemaBars();
  her.setState('idle');
  me.setState('idle');

  // 1. Хоёулаа бие бие рүүгээ харна
  const hp = her.root.position;
  const mp = me.root.position;
  her.faceTowards(mp.x, mp.z);
  me.faceTowards(hp.x, hp.z);

  const mid = hp.clone().add(mp).multiplyScalar(0.5);
  const dir = mp.clone().sub(hp).setY(0).normalize();
  const side = new THREE.Vector3(-dir.z, 0, dir.x);
  if (side.dot(rig.camera.position.clone().sub(mid)) < 0) side.negate();
  // Босоо утсан дээр хоёуланг нь багтаахын тулд camera-г холдуулна
  const cam = rig.camera;
  const halfWidth = Math.tan((cam.fov * Math.PI) / 360) * cam.aspect;
  const frameDist = Math.max(3.6, 2.0 / halfWidth);
  rig.animateTo(
    mid.clone().addScaledVector(side, frameDist).add(new THREE.Vector3(0, 1.4, 0)),
    mid.clone().add(new THREE.Vector3(0, 0.45, 0)),
    1.6
  );
  await wait(1.2);

  // 2. Хоорондоо ярилцана (дэлгэцийн доор үг нь бичигдэнэ)
  await dialogue.run(story.meet);

  // 3. Хамт бялуутай ширээ рүү алхана
  const T = table.position;
  let herSpot = T.clone().add(new THREE.Vector3(-0.72, 0, 1.25));
  let meSpot = T.clone().add(new THREE.Vector3(0.72, 0, 1.25));
  if (hp.x > mp.x) [herSpot, meSpot] = [meSpot, herSpot];
  const walkMid = new THREE.Vector3();
  rig.follow(() => walkMid.copy(her.root.position).add(me.root.position).multiplyScalar(0.5), {
    offset: new THREE.Vector3(1.2, 2.4, 4.6),
    lookOffset: new THREE.Vector3(0, 0.6, 0),
    lerp: 1.8,
  });
  // Энхжин түрүүлж явна, Мөнх-Очир зай гарсны дараа араас нь
  const herToTable = her.walkPath(detour(her.root.position, [herSpot], [{ pos: T, clearance: 1.3 }]), 1.6);
  await waitUntil(() => her.root.position.distanceTo(me.root.position) > 1.9, 2.5);
  const meToTable = me.walkPath(detour(me.root.position, [meSpot], [{ pos: T, clearance: 1.3 }]), 1.5);
  await Promise.all([meToTable, herToTable]);
  her.faceTowards(T.x, T.z);
  me.faceTowards(T.x, T.z);

  // Ширээний нөгөө талаас хоёуланг нь харуулна
  const tableDist = Math.max(3.2, 1.5 / (Math.tan((cam.fov * Math.PI) / 360) * cam.aspect));
  await rig.animateTo(
    T.clone().add(new THREE.Vector3(0, 1.55, -tableDist)),
    T.clone().add(new THREE.Vector3(0, 0.55, 0.7)),
    1.8
  );
  await dialogue.run(story.table);

  // 4. Энхжин нүдээ аниад хүслээ шивнэнэ, дараа нь лаагаа үлээнэ
  her.setEyesClosed(true);
  dialogue.show('narrator', story.wish.text);
  await wait(0.8);
  await dialogue.action(story.wish.button);
  dialogue.hide();
  cake.blowOut();
  audio.play('interaction');
  await wait(0.3);
  her.setEyesClosed(false);
  hearts.burst(table.cakePosition.clone().add(new THREE.Vector3(0, 0.8, 0)), 14);
  her.setState('cheer');
  me.setState('happy');
  await wait(1.8);
  her.setState('idle');
  me.setState('idle');

  // 5. Бие бие рүүгээ эргээд ярилцана
  her.faceTowards(me.root.position.x, me.root.position.z);
  me.faceTowards(her.root.position.x, her.root.position.z);
  await wait(0.5);
  await dialogue.run(story.afterWish);

  // 3. Хоёулаа модон сандал руу алхана
  const plan = bench.planSeats(hp, mp);
  const camMid = new THREE.Vector3();
  const offset = bench.toWorld(1.4, 0, 5.2).sub(bench.toWorld(0, 0, 0)).setY(2.6);
  rig.follow(() => camMid.copy(her.root.position).add(me.root.position).multiplyScalar(0.5), {
    offset,
    lookOffset: new THREE.Vector3(0, 0.8, 0),
    lerp: 1.6,
    scaleForPortrait: true,
  });

  // Сандал дээр хамт сууна.
  // Энхжин түрүүлж очоод цаад суудалд сууна. Мөнх-Очир зай гарсны дараа араас нь
  // явж, сандлын үзүүрт хүлээгээд, Энхжинг суусны дараа л өөрөө сууна.
  const herDone = her
    .walkPath(detour(her.root.position, plan.pathTo(her.root.position, 'far'), [{ pos: T, clearance: 1.3 }]), 1.5)
    .then(() => her.sitDown(plan.far.seat, plan.facing, plan.seatTop));
  let herSeated = false;
  herDone.then(() => {
    herSeated = true;
  });
  await waitUntil(() => her.root.position.distanceTo(me.root.position) > 2.2, 3);
  const mePath = detour(me.root.position, plan.pathTo(me.root.position, 'near'), [{ pos: T, clearance: 1.3 }]);
  const meLast = mePath.pop();
  if (mePath.length) await me.walkPath(mePath, 1.35);
  me.faceTowards(her.root.position.x, her.root.position.z);
  await waitUntil(() => herSeated, 12);
  await wait(0.3);
  await me.walkPath([meLast], 1.2);
  await me.sitDown(plan.near.seat, plan.facing, plan.seatTop);
  await wait(0.5);

  // Энхжин толгойгоо над руу бага зэрэг хазайлгана
  const toMe = new THREE.Vector3().subVectors(me.root.position, her.root.position);
  const herRight = new THREE.Vector3(Math.cos(plan.facing), 0, -Math.sin(plan.facing));
  const sideSign = Math.sign(toMe.dot(herRight)) || 1;
  // Энхжин Мөнх-Очир руу толгойгоороо налж ойрхон сууна
  her.setLean(-0.26 * sideSign);
  me.setLean(0);
  await wait(0.8);

  // Camera аажмаар ард нь гараад дээшээ хөдөлнө. Тэнгэр рүү харах үед нэрийн шошго бүдгэрнэ
  for (const tag of tags) tag.hide();
  const back = Math.max(1, 0.7 / cam.aspect);
  // дүрүүдийн дундуур биш, хажуугаар нь тойрч ард нь гарна
  await rig.animateTo(bench.toWorld(-3.4 * back, 2.0, -0.6 * back), bench.toWorld(0, 0.9, 0), 1.7, easeInOutSine);
  await rig.animateTo(bench.toWorld(0, 1.45 * back, -4.6 * back), bench.toWorld(0, 1.0, 2.5), 2.0, easeInOutSine);
  await wait(0.8);

  // 6. Шөнийн тэнгэр рүү харна
  audio.setMusicVolume(0.3, 3);
  await rig.animateTo(bench.toWorld(0, 1.2 + (back - 1) * 0.6, -5.4 * back), bench.toWorld(0, 11.5, 30), 5.5, easeInOutSine);

  // 7. Хэдэн секунд тайван
  await wait(2.2);

  // 8. Анхны салют
  fireworks.launch(bench.toWorld(0, 0, 34), bench.toWorld(0, 16, 34), {
    shape: 'sphere',
    color: '#ff5c8a',
    color2: '#ffffff',
    scale: 1.2,
    flight: 1.6,
  });
  await wait(2.8);

  // 9. Олон өнгийн салют дараалан
  const spread = () => {
    const aspect = rig.camera.aspect;
    return Math.max(4, Math.min(12, 13 * aspect));
  };
  // u: -1 (зүүн) ээс 1 (баруун), hScale: өндрийн харьцаа
  fireworks.startShow((u = Math.random() * 2 - 1, hScale = 1) => {
    const x = u * spread();
    const z = 30 + Math.random() * 10;
    const h = (16 + Math.random() * 8) * hScale;
    return { from: bench.toWorld(x * 0.85, 0, z), to: bench.toWorld(x, h, z) };
  });
  audio.setMusicVolume(0.4, 3);
  await wait(2.6);

  // Тэнгэрийн дэлгэцийн төвд байх цэг (дэлгэцийн хэмжээнээс хамаарна)
  const skyCenter = (dist) => {
    const cam = rig.camera;
    cam.updateMatrixWorld();
    const fwd = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 2).normalize().negate();
    const up = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 1).normalize();
    const halfH = dist * Math.tan((cam.fov * Math.PI) / 360);
    const halfW = halfH * cam.aspect;
    const center = cam.position.clone().addScaledVector(fwd, dist).addScaledVector(up, halfH * 0.12);
    return { center, halfW, halfH };
  };

  // 11. Тэнгэр дүүрэн том зүрхэн салют хүчтэй буудна
  const bigHeart = async () => {
    const { center, halfW, halfH } = skyCenter(36);
    // Тэнгэрийн дээд хэсэгт гарах гоё зүрх
    const radius = Math.min(halfW * 0.66, halfH * 0.42);
    center.addScaledVector(new THREE.Vector3().setFromMatrixColumn(rig.camera.matrixWorld, 1), halfH * 0.2);
    const from = center.clone();
    from.y = 0;
    fireworks.launch(from, center, { shape: 'bigHeart', color: '#ff4d86', radius, tail: true });
    await wait(5.5);
  };

  // 10. Мэндчилгээг салютаар тэнгэрт бичээд, дараа нь том зүрх буудна.
  // Дуусахад "Дахин үзэх" товч гарч, дарахад дахин үзүүлнэ.
  const showMessage = async () => {
    fireworks.pauseShow();
    await wait(0.7);
    const lines = rig.camera.aspect < 0.8 ? config.message.tall : config.message.wide;
    await fireworkText.play(lines);
    await bigHeart();
    fireworks.resumeShow();
    ui.showReplay();
  };
  ui.onReplay(showMessage);
  await showMessage();
}
