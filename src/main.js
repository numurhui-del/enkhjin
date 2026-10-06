import * as THREE from 'three';
import { CONFIG } from './config.js';
import { Character } from './character.js';
import { Cake } from './cake.js';
import { createEnvironment } from './environment.js';
import { Controls } from './controls.js';
import { Player } from './player.js';
import { CameraRig } from './camera.js';
import { Fireworks } from './fireworks.js';
import { FireworkText } from './fireworkText.js';
import { AudioManager } from './audio.js';
import { NameTag, HeartParticles, DustPuffs, makeGlow } from './effects.js';
import { easeInOutCubic } from './utils.js';
import { UI } from './ui.js';
import { playEnding } from './ending.js';
import { Dialogue } from './dialogue.js';
import { STORY } from './story.js';

const ui = new UI(CONFIG.text);

// ---------------- Renderer, scene, camera ----------------
const container = document.getElementById('app');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
} catch (err) {
  ui.showError(CONFIG.text.noWebGL);
  throw err;
}

// Утасны гүйцэтгэлээс хамаарч pixel ratio-г автоматаар бууруулна
const isTouch = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
const quality = {
  // утсан дээр (ялангуяа iPhone) хэт өндөр нарийвчлал гацалт үүсгэдэг
  dpr: Math.min(window.devicePixelRatio || 1, isTouch ? 1.5 : 2),
  time: 0,
  frames: 0,
};
renderer.setPixelRatio(quality.dpr);
renderer.setSize(window.innerWidth, window.innerHeight, false);
container.appendChild(renderer.domElement);

renderer.domElement.addEventListener('webglcontextlost', (e) => {
  e.preventDefault();
  ui.showError(CONFIG.text.contextLost, true);
});

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(CONFIG.camera.fov, 1, 0.1, 500);

const audio = new AudioManager(CONFIG.audio);
const env = createEnvironment(scene, CONFIG);

// ---------------- Characters ----------------
const her = new Character(CONFIG.characters.enkhjin);
her.root.position.set(CONFIG.player.start[0], 0, CONFIG.player.start[1]);
her.setFacing(CONFIG.player.startFacing);
scene.add(her.root);

const me = new Character(CONFIG.characters.me);
me.root.position.set(CONFIG.me.position[0], 0, CONFIG.me.position[1]);
me.faceTowards(her.root.position.x, her.root.position.z);
me.setFacing(me.targetFacing);
scene.add(me.root);

// Бялуу эхнээсээ ширээн дээр байна
const cake = new Cake(CONFIG.cake);
cake.group.position.copy(env.table.cakePosition);
scene.add(cake.group);
// Мөнх-Очирын эргэн тойрны саад. Тэр хөдлөх үед байрлал нь дагаж шинэчлэгдэнэ.
const meCollider = { x: me.root.position.x, z: me.root.position.z, r: 0.85, owner: me };
env.colliders.push(meCollider);

// ---------------- Systems ----------------
const controls = new Controls(ui.joystick);
const dialogue = new Dialogue(CONFIG.names, { me, enkhjin: her });
const player = new Player(her, controls, env.colliders, CONFIG);
const rig = new CameraRig(camera, CONFIG.camera);
rig.follow(() => her.root.position);

const fireworks = new Fireworks(scene, camera, { ...CONFIG.fireworks, maxParticles: isTouch ? 9000 : CONFIG.fireworks.maxParticles }, audio);
const fireworkText = new FireworkText(scene, camera, fireworks, audio);
const hearts = new HeartParticles(scene);
const dust = new DustPuffs(scene);
const tags = [
  new NameTag(scene, camera, me, CONFIG.names.me, { color: '#6aa7ff', height: 2.3 }),
  new NameTag(scene, camera, her, CONFIG.names.enkhjin, { color: '#ff7eb6', height: 2.25 }),
];

// Тоглоомын цагаар ажилладаг wait (tab нуугдах үед зогсоно)
const timers = [];
const wait = (seconds) => new Promise((resolve) => timers.push({ t: seconds, resolve }));

let state = 'intro'; // intro | play | ending

// Энхжин заавал өөрөө алхаж ирэх ёстой: алхсан зайг тоолно
let walked = 0;
const lastPos = new THREE.Vector3();
let dustTimer = 0;

// Хоёр дүр бие биеэ нэвтрэхгүй: хэт ойртвол түлхэж салгана.
// Алхаж буй нь зогсож буйгаа тойрч гарахын тулд хажуу тийш бага зэрэг гулсана.
const MIN_GAP = 1.3;
function separateCharacters(a, b) {
  const pa = a.root.position;
  const pb = b.root.position;
  let dx = pb.x - pa.x;
  let dz = pb.z - pa.z;
  let d = Math.hypot(dx, dz);
  if (d >= MIN_GAP) return;
  // сандал дээр суух агшинд суудлын байрлалыг өөрчлөхгүй
  if (a.slide || b.slide || (a.sitTarget && b.sitTarget)) return;
  if (d < 1e-4) {
    dx = 1;
    dz = 0;
    d = 1;
  }
  const nx = dx / d;
  const nz = dz / d;
  const push = MIN_GAP - d;
  const aMoving = !!a.path || !!a.followCfg;
  const bMoving = !!b.path || !!b.followCfg;
  let wa = 0.5;
  let wb = 0.5;
  if (aMoving && !bMoving) [wa, wb] = [1, 0];
  else if (bMoving && !aMoving) [wa, wb] = [0, 1];
  if (a.sitTarget) [wa, wb] = [0, 1];
  if (b.sitTarget) [wa, wb] = [1, 0];
  pa.x -= nx * push * wa;
  pa.z -= nz * push * wa;
  pb.x += nx * push * wb;
  pb.z += nz * push * wb;
  if (aMoving) {
    pa.x -= nz * push * 0.35;
    pa.z += nx * push * 0.35;
  }
  if (bMoving) {
    pb.x += nz * push * 0.35;
    pb.z -= nx * push * 0.35;
  }
}

// Дүрүүд ширээ, сандал, мод, гэрлийн шон зэргийг нэвтлэхгүй.
// Алхаж буй дүр саадыг тойрч гарахын тулд зорьж буй тал руугаа гулсана.
function resolveObstacles(ch) {
  if (ch.slide || ch.sitTarget) return;
  const p = ch.root.position;
  const target = ch.path ? ch.path[0] : null;
  for (const c of env.colliders) {
    if (c.owner) continue;
    const dx = p.x - c.x;
    const dz = p.z - c.z;
    const min = c.r + ch.radius;
    const d2 = dx * dx + dz * dz;
    if (d2 >= min * min || d2 < 1e-8) continue;
    const d = Math.sqrt(d2);
    const nx = dx / d;
    const nz = dz / d;
    p.x = c.x + nx * min;
    p.z = c.z + nz * min;
    if (target) {
      // саадын хажуугаар зорилго руугаа ойртох чиглэлд гулсана
      let tx = -nz;
      let tz = nx;
      if (tx * (target.x - p.x) + tz * (target.z - p.z) < 0) {
        tx = -tx;
        tz = -tz;
      }
      p.x += tx * 0.04;
      p.z += tz * 0.04;
    }
  }
}

function triggerEnding() {
  if (state === 'ending') return;
  state = 'ending';
  controls.disable();
  player.enabled = false;
  ui.hideGuide();
  playEnding({ her, me, colliders: env.colliders, bench: env.bench, table: env.table, cake, dialogue, story: STORY, rig, fireworks, fireworkText, hearts, tags, audio, ui, wait, config: CONFIG });
}

// ---------------- Дэлхий үүсэх, Энхжин төрөх ----------------
// Link нээмэгц эхэлнэ: "Дэлхий үүсэж байна" бичиг бүдгэрч, camera тэнгэрээс
// доош бууж, Энхжин гэрэл дунд төрж гарч ирнэ.
let birth = null;
const birthGlow = makeGlow('#ffd1e6', { opacity: 0 });
birthGlow.visible = false;
scene.add(birthGlow);

function easeOutBack(t) {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

function updateBirth(dt) {
  if (!birth) return;
  birth.t += dt;
  const k = Math.min(1, birth.t / 0.9);
  her.root.scale.setScalar(her.look.scale * Math.max(0.001, easeOutBack(k)));
  const g = Math.min(1, birth.t / 1.6);
  birthGlow.scale.setScalar(0.5 + g * 4.5);
  birthGlow.material.opacity = (1 - g) * 0.9;
  if (birth.t > 1.6) {
    birthGlow.visible = false;
    birth = null;
  }
}

async function runIntro() {
  const p = her.root.position;
  her.root.visible = false;
  tags[1].sprite.visible = false;

  // тэнгэрээс эхэлнэ
  camera.position.set(p.x, 40, p.z + 26);
  rig.lookAt.set(p.x, 0, p.z - 8);
  rig.mode = 'hold';
  camera.lookAt(rig.lookAt);

  await wait(1.8);
  ui.hideIntro();
  const scaleK = rig._distanceScale();
  await rig.animateTo(
    p.clone().addScaledVector(rig.offset, scaleK),
    p.clone().add(rig.lookOffset),
    3.6,
    easeInOutCubic
  );

  // Энхжин гэрэл дунд төрнө
  her.root.visible = true;
  her.root.scale.setScalar(0.001);
  birth = { t: 0 };
  birthGlow.position.set(p.x, 0.9, p.z);
  birthGlow.visible = true;
  hearts.burst(p.clone().add(new THREE.Vector3(0, 1.3, 0)), 12);
  audio.play('interaction');
  await wait(0.9);
  tags[1].sprite.visible = true;
  rig.follow(() => her.root.position);

  state = 'play';
  walked = 0;
  lastPos.copy(her.root.position);
  controls.enable();
  ui.showHint();
  ui.showGuide();
  controls.onFirstMove = () => {
    ui.hideGuide();
    setTimeout(() => ui.hideHint(), 3000);
  };
}

// Утсан дээр дуу зөвхөн хүрэлтийн дараа асдаг тул анхны хүрэлтээр асаана
const audioEvents = ['pointerdown', 'pointerup', 'touchstart', 'touchend', 'click', 'keydown'];
function unlockAudio() {
  audio.unlock();
  audio.startMusic();
  if (audio.ctx && audio.ctx.state === 'running') {
    for (const ev of audioEvents) window.removeEventListener(ev, unlockAudio);
  }
}
for (const ev of audioEvents) window.addEventListener(ev, unlockAudio, { passive: true, capture: true });
// Зарим browser (жишээ нь компьютер дээрх Chrome) хүрэлтгүйгээр ч зөвшөөрдөг тул шууд оролдоно
unlockAudio();

ui.onMuteToggle((muted) => audio.setMuted(muted));

// ---------------- Resize ----------------
// Хэмжээг frame бүр шалгана: утас эргүүлэх, хаягийн мөр нуугдах үед
// resize event хоцорч эсвэл огт ирэхгүй тохиолдол байдаг.
let lastW = 0;
let lastH = 0;
let lastDpr = 0;
function resize() {
  // Safari-ийн хаягийн мөр нуугдах, гарах үед ч бүтэн дэлгэцийг дүүргэхийн тулд
  // window биш, дэлгэц дүүргэсэн #app хэсгийн бодит хэмжээг авна
  const rect = container.getBoundingClientRect();
  const w = Math.round(rect.width) || window.innerWidth;
  const h = Math.round(rect.height) || window.innerHeight;
  if (w === 0 || h === 0) return;
  if (w === lastW && h === lastH && quality.dpr === lastDpr) return;
  lastW = w;
  lastH = h;
  lastDpr = quality.dpr;
  renderer.setPixelRatio(quality.dpr);
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  // Босоо утсан дээр өргөн харагдуулахын тулд fov-г бага зэрэг томруулна
  camera.fov = camera.aspect < 0.7 ? CONFIG.camera.fov + 6 : CONFIG.camera.fov;
  camera.updateProjectionMatrix();
  const heightPx = h * quality.dpr;
  fireworks.setViewport(heightPx, camera.fov);
  fireworkText.setViewport(heightPx, camera.fov);
  env.setViewport(heightPx, camera.fov, quality.dpr);
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 250));
if (window.visualViewport) window.visualViewport.addEventListener('resize', resize);
resize();
rig.snap();

function adaptQuality(rawDt) {
  if (document.hidden || state === 'intro') return;
  quality.time += rawDt;
  quality.frames++;
  if (quality.time < 2) return;
  const avg = quality.time / quality.frames;
  quality.time = 0;
  quality.frames = 0;
  if (avg > 1 / 40 && quality.dpr > 1) {
    quality.dpr = Math.max(1, quality.dpr - 0.25);
  }
}

// ---------------- Main loop ----------------
const clock = new THREE.Clock();
let elapsed = 0;

// Нэг хэсэгт алдаа гарсан ч тоглоом зогсохгүй, дараагийн frame үргэлжилнэ
let loggedError = false;
renderer.setAnimationLoop(() => {
  try {
    frame();
  } catch (err) {
    if (!loggedError) console.error(err);
    loggedError = true;
  }
});

function frame() {
  const rawDt = clock.getDelta();
  adaptQuality(rawDt);
  resize();
  const dt = Math.min(rawDt, 1 / 20);
  elapsed += dt;

  if (state === 'play') {
    player.update(dt);
    const hp = her.root.position;
    const mp = me.root.position;
    walked += Math.hypot(hp.x - lastPos.x, hp.z - lastPos.z);
    lastPos.copy(hp);
    // Би Энхжин рүү үргэлж харж хүлээнэ
    me.faceTowards(hp.x, hp.z);
    const near = Math.hypot(hp.x - mp.x, hp.z - mp.z) < CONFIG.interactionRadius;
    if (near && walked >= CONFIG.minWalkDistance) {
      triggerEnding();
    }
  }

  // Алхах үед хөлийн доороос жижиг тоос бужигнана
  if (her.state === 'walk') {
    dustTimer -= dt;
    if (dustTimer <= 0) {
      dust.puff(her.root.position);
      dustTimer = 0.18;
    }
  }

  updateBirth(dt);
  her.update(dt);
  me.update(dt);
  if (state === 'ending') {
    resolveObstacles(her);
    resolveObstacles(me);
  }
  separateCharacters(her, me);
  meCollider.x = me.root.position.x;
  meCollider.z = me.root.position.z;
  cake.update(elapsed, dt);
  env.update(elapsed);
  fireworks.update(dt);
  fireworkText.update(dt);
  hearts.update(dt);
  dust.update(dt);
  for (const tag of tags) tag.update(elapsed, dt);

  for (let i = timers.length - 1; i >= 0; i--) {
    timers[i].t -= dt;
    if (timers[i].t <= 0) {
      const { resolve } = timers[i];
      timers.splice(i, 1);
      resolve();
    }
  }

  rig.update(dt);
  renderer.render(scene, camera);
}

// Бүх зүйл бэлэн болмогц дэлхий үүсэж эхэлнэ
ui.setReady();
runIntro();
