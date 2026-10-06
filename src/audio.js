// Дууны систем (Web Audio API)
//
// config.audio.files дотор заасан файл байвал түүнийг тоглуулна.
// Файл байхгүй бол browser дотор шууд синтезээр үүсгэсэн дуу
// (хөгжмийн хайрцаг аялгуу, салютын тэсрэлт гэх мэт) тоглоно.
// Ингэснээр copyright асуудалгүй, файлгүй үед ч дуутай ажиллана.

const MELODY = [
  76, null, 79, null, 77, 76, 74, null,
  72, null, 76, null, 74, 72, 71, null,
  69, null, 72, null, 77, null, 76, 74,
  74, null, null, 71, 72, null, null, null,
];
const CHORDS = [
  [60, 64, 67],
  [57, 60, 64],
  [53, 57, 60],
  [55, 59, 62],
];
const ARP = [0, 1, 2, 3, 2, 1, 2, 1];

const midiToFreq = (m) => 440 * Math.pow(2, (m - 69) / 12);

export class AudioManager {
  constructor(cfg) {
    this.cfg = cfg;
    this.ctx = null;
    this.buffers = {};
    this.muted = false;
    this.loading = Promise.resolve();
    this._musicTimer = null;
    this._musicSource = null;
  }

  // Утсан дээр дуу зөвхөн хэрэглэгч товч дарсны дараа асна.
  // Тиймээс үүнийг "Эхлэх" товчны click дотор дуудна.
  unlock() {
    // iPhone чимээгүй (silent) горимд байсан ч дуугарахаар тохируулна (iOS 17+)
    try {
      if (navigator.audioSession) navigator.audioSession.type = 'playback';
    } catch (err) {
      // дэмжихгүй browser
    }
    if (this.ctx) {
      if (this.ctx.state !== 'running') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    const vol = this.cfg.volume;
    // master → compressor → чанга дуу хагарахгүй, жигд сонсогдоно
    this.compressor = ctx.createDynamicsCompressor();
    this.compressor.threshold.value = -14;
    this.compressor.knee.value = 12;
    this.compressor.ratio.value = 4;
    this.compressor.attack.value = 0.004;
    this.compressor.release.value = 0.25;
    this.compressor.connect(ctx.destination);
    this.master = ctx.createGain();
    this.master.gain.value = vol.master;
    this.master.connect(this.compressor);
    this.musicGain = ctx.createGain();
    this.musicGain.gain.value = vol.music;
    this.musicGain.connect(this.master);
    this.sfxGain = ctx.createGain();
    this.sfxGain.connect(this.master);

    // Задгай тэнгэрийн цуурай (салютын дуу алсад цуурайтна)
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this._makeImpulse(3.2, 2.4);
    const reverbOut = ctx.createGain();
    reverbOut.gain.value = 0.9;
    this.reverb.connect(reverbOut).connect(this.master);
    const musicSend = ctx.createGain();
    musicSend.gain.value = 0.25;
    this.musicGain.connect(musicSend).connect(this.reverb);

    // iOS Safari дээр context-ийг асаахын тулд чимээгүй жижиг дуу тоглуулна
    const silent = ctx.createBuffer(1, 1, 22050);
    const src = ctx.createBufferSource();
    src.buffer = silent;
    src.connect(ctx.destination);
    src.start(0);
    ctx.resume();

    this.noise = this._makeNoise(5);
    this.loading = this._loadAll();

    document.addEventListener('visibilitychange', () => {
      if (!this.ctx) return;
      if (document.hidden) this.ctx.suspend();
      else this.ctx.resume();
    });
  }

  async _loadAll() {
    const entries = Object.entries(this.cfg.files);
    await Promise.all(
      entries.map(async ([name, url]) => {
        if (!url) return;
        try {
          const res = await fetch(url);
          if (!res.ok) return;
          const data = await res.arrayBuffer();
          this.buffers[name] = await new Promise((resolve, reject) =>
            this.ctx.decodeAudioData(data, resolve, reject)
          );
        } catch (err) {
          // Файл байхгүй эсвэл уншигдсангүй: синтез дуу ашиглана
        }
      })
    );
  }

  _makeImpulse(seconds, decay) {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }

  // Нэг дууны гаралт: зүүн/баруун байрлал + цуурай руу илгээх
  _bus(pan = 0, wet = 0.35) {
    const ctx = this.ctx;
    const input = ctx.createGain();
    let node = input;
    if (ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, pan));
      input.connect(p);
      node = p;
    }
    node.connect(this.sfxGain);
    const send = ctx.createGain();
    send.gain.value = wet;
    node.connect(send).connect(this.reverb);
    return input;
  }

  _makeNoise(seconds) {
    const ctx = this.ctx;
    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  setMuted(muted) {
    this.muted = muted;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setTargetAtTime(muted ? 0 : this.cfg.volume.master, t, 0.05);
  }

  setMusicVolume(v, seconds = 1.5) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.musicGain.gain.cancelScheduledValues(t);
    this.musicGain.gain.setTargetAtTime(v, t, seconds / 3);
  }

  // name: firework | big | salute | launch | crackle | sizzle | interaction
  // delay: дуу хэдэн секундын дараа сонсогдох (алсын салютын дуу гэрлээс хоцорно)
  play(name, { volume = 1, rate = 1, pan = 0, delay = 0, duration = 1, size = 1, count = 40, whistle = false } = {}) {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;

    // Утсан дээр хэт олон дуу зэрэг тоглуулбал гацна: хязгаарлана
    const now = ctx.currentTime;
    this._voices = (this._voices || []).filter((end) => end > now);
    const optional = name === 'crackle' || name === 'sizzle';
    if (this._voices.length > (optional ? 6 : 12)) return;
    this._voices.push(now + delay + Math.max(1, duration) + 1.5);

    const base = this.cfg.volume[name] ?? 1;
    const t = now + 0.02 + delay;
    const buffer = this.buffers[name];
    if (buffer) {
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.playbackRate.value = rate;
      const g = ctx.createGain();
      g.gain.value = base * volume;
      src.connect(g).connect(this._bus(pan, name === 'big' ? 0.5 : 0.3));
      src.start(t);
      return;
    }
    const v = base * volume;
    switch (name) {
      case 'firework':
        this._bang(t, v, pan, size, rate);
        break;
      case 'big':
        this._bang(t, v * 1.15, pan, 1.9, 0.8);
        this._crackle(t + 0.5, v * 0.5, pan, 1.6, 50);
        break;
      case 'salute':
        this._bang(t, v * 1.25, pan, 1.5, 1.15);
        break;
      case 'launch':
        this._launch(t, v, pan, duration, whistle);
        break;
      case 'crackle':
        this._crackle(t, v, pan, duration, count);
        break;
      case 'sizzle':
        this._sizzle(t, v, pan, duration);
        break;
      case 'interaction':
        this._synthChime(v);
        break;
      default:
    }
  }

  async startMusic() {
    await this.loading;
    if (!this.ctx || this._musicTimer || this._musicSource) return;
    const buffer = this.buffers.music;
    if (buffer) {
      const src = this.ctx.createBufferSource();
      src.buffer = buffer;
      src.loop = true;
      src.connect(this.musicGain);
      src.start();
      this._musicSource = src;
    } else {
      this._startSynthMusic();
    }
  }

  // ---------- Синтез хөгжим (өөрийн зохиосон энгийн аялгуу) ----------

  _startSynthMusic() {
    const ctx = this.ctx;
    const eighth = 60 / 74 / 2;
    let step = 0;
    let next = ctx.currentTime + 0.15;
    this._musicTimer = setInterval(() => {
      if (ctx.state !== 'running') return;
      if (next < ctx.currentTime - 0.5) next = ctx.currentTime + 0.05;
      while (next < ctx.currentTime + 0.3) {
        const bar = Math.floor(step / 8) % 4;
        const chord = CHORDS[bar];
        const pos = step % 8;
        const a = ARP[pos];
        const arpNote = a === 3 ? chord[0] + 12 : chord[a];
        this._bell(arpNote, next, 0.05, 1.1);
        const m = MELODY[step % MELODY.length];
        if (m !== null) this._bell(m, next, 0.075, 1.6);
        if (pos === 0) this._pad(chord[0] - 12, next, 0.07, eighth * 8);
        step++;
        next += eighth;
      }
    }, 60);
  }

  _bell(midi, time, vol, dur) {
    const ctx = this.ctx;
    const f = midiToFreq(midi);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(vol, time + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    g.connect(this.musicGain);
    const o1 = ctx.createOscillator();
    o1.type = 'sine';
    o1.frequency.value = f;
    const o2 = ctx.createOscillator();
    o2.type = 'sine';
    o2.frequency.value = f * 3;
    const g2 = ctx.createGain();
    g2.gain.value = 0.12;
    o1.connect(g);
    o2.connect(g2).connect(g);
    o1.start(time);
    o2.start(time);
    o1.stop(time + dur + 0.05);
    o2.stop(time + dur + 0.05);
  }

  _pad(midi, time, vol, dur) {
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(vol, time + 0.4);
    g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    g.connect(this.musicGain);
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = midiToFreq(midi);
    o.connect(g);
    o.start(time);
    o.stop(time + dur + 0.05);
  }

  // ---------- Синтез дууны эффект ----------

  _noiseSource(time, offset, duration) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.start(time, offset, duration);
    return src;
  }

  _env(time, peak, attack, release) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), time + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, time + attack + release);
    return g;
  }

  _filter(type, freq, q = 0.7) {
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    return f;
  }

  // Салют дэлбэрэх буу: хурц "тас" + өргөн "бум" + гүн доргилт
  // + хэсэг хугацааны дараа уулнаас ойсон цуурай
  _bang(t, vol, pan, size, rate) {
    const ctx = this.ctx;
    const out = this._bus(pan, 0.45);
    const s = Math.max(0.4, size);

    // хурц тас (дэлбэрэлтийн эхний агшин)
    const crack = this._noiseSource(t, Math.random(), 0.08);
    crack.connect(this._filter('highpass', 900)).connect(this._env(t, vol * 1.1 * Math.min(1.3, s), 0.001, 0.06)).connect(out);

    // бум: дуу алсад сарних тусам бүдгэрнэ
    const body = this._noiseSource(t, Math.random() * 0.3, 2.4 * s);
    const lp = this._filter('lowpass', 2400 * rate, 0.6);
    lp.frequency.setValueAtTime(2400 * rate, t);
    lp.frequency.exponentialRampToValueAtTime(90, t + 1.1 * s);
    body.connect(lp).connect(this._env(t, vol * 0.95 * Math.min(1.4, s), 0.004, 1.5 * s)).connect(out);

    // цээжинд мэдрэгдэх доргилт
    const sub = ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(85 * rate, t);
    sub.frequency.exponentialRampToValueAtTime(28, t + 0.5 * s);
    sub.connect(this._env(t, vol * 0.9 * Math.min(1.5, s), 0.004, 0.7 * s)).connect(out);
    sub.start(t);
    sub.stop(t + 0.8 * s + 0.1);

    // уулнаас ойсон цуурай (0.4 аас 0.7 секундын дараа, бүдэг, нам)
    const et = t + 0.4 + Math.random() * 0.3;
    const echo = this._noiseSource(et, Math.random() * 0.5, 1.6 * s);
    echo
      .connect(this._filter('lowpass', 500, 0.5))
      .connect(this._env(et, vol * 0.28 * Math.min(1.4, s), 0.03, 1.3 * s))
      .connect(this._bus(-pan * 0.5, 0.8));
  }

  // Хөөрөх: газраас "түг" гэх буудах чимээ, дараа нь агаар зүсэх шуугиан.
  // Заримдаа исгэрэх (whistle) пуужин.
  _launch(t, vol, pan, duration, whistle) {
    const ctx = this.ctx;
    const out = this._bus(pan, 0.35);

    // зуурмагнаас буудах түг
    const thump = ctx.createOscillator();
    thump.type = 'sine';
    thump.frequency.setValueAtTime(110, t);
    thump.frequency.exponentialRampToValueAtTime(38, t + 0.14);
    thump.connect(this._env(t, vol * 0.75, 0.003, 0.22)).connect(out);
    thump.start(t);
    thump.stop(t + 0.3);
    const puff = this._noiseSource(t, Math.random(), 0.2);
    puff.connect(this._filter('lowpass', 420)).connect(this._env(t, vol * 0.6, 0.002, 0.16)).connect(out);

    // агаар зүсэх шуугиан (бага зэрэг шаржигнана)
    const dur = Math.max(0.6, duration * 0.85);
    const hiss = this._noiseSource(t + 0.05, Math.random() * 0.4, dur);
    const bp = this._filter('bandpass', 1400, 1.4);
    bp.frequency.setValueAtTime(1400, t);
    bp.frequency.exponentialRampToValueAtTime(3800, t + dur);
    const hg = ctx.createGain();
    hg.gain.setValueAtTime(0.0001, t + 0.05);
    hg.gain.exponentialRampToValueAtTime(0.16 * vol, t + 0.25);
    hg.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    hiss.connect(bp).connect(hg).connect(out);

    if (whistle) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(900, t + 0.1);
      o.frequency.exponentialRampToValueAtTime(2300, t + dur);
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 22;
      const lg = ctx.createGain();
      lg.gain.value = 40;
      lfo.connect(lg).connect(o.frequency);
      const wg = ctx.createGain();
      wg.gain.setValueAtTime(0.0001, t + 0.1);
      wg.gain.exponentialRampToValueAtTime(0.07 * vol, t + 0.3);
      wg.gain.setValueAtTime(0.07 * vol, t + dur - 0.2);
      wg.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(wg).connect(out);
      o.start(t + 0.1);
      lfo.start(t + 0.1);
      o.stop(t + dur + 0.05);
      lfo.stop(t + dur + 0.05);
    }
  }

  // Тачигнах: олон жижиг "тас тас" чимээ санамсаргүй хугацаанд
  _crackle(t, vol, pan, duration, count) {
    // Нэг гаралтаар бүх тачигналыг дамжуулна (олон node үүсгэхгүй, утсан дээр хөнгөн)
    const n = Math.min(count, 32);
    const out = this._bus(pan, 0.5);
    const hp = this._filter('highpass', 2500, 0.7);
    hp.connect(out);
    for (let i = 0; i < n; i++) {
      const ct = t + Math.random() * duration;
      const c = this._noiseSource(ct, Math.random() * 1.8, 0.03);
      c.connect(this._env(ct, vol * (0.25 + Math.random() * 0.45), 0.001, 0.025 + Math.random() * 0.02)).connect(hp);
    }
  }

  // Алтан бургас унахдаа гаргах зөөлөн шаржигнах чимээ
  _sizzle(t, vol, pan, duration) {
    const ctx = this.ctx;
    const src = this._noiseSource(t, Math.random() * 0.3, Math.min(duration, 1.9));
    const src2 = this._noiseSource(t + 1.6, Math.random() * 0.3, Math.max(0.1, Math.min(duration - 1.6, 1.9)));
    const hp = this._filter('highpass', 4500, 0.5);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.09 * vol, t + 0.4);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    src.connect(hp);
    src2.connect(hp);
    hp.connect(g).connect(this._bus(pan, 0.6));
  }

  _synthChime(vol) {
    const ctx = this.ctx;
    const t = ctx.currentTime;
    [84, 88, 91, 96].forEach((m, i) => {
      const st = t + i * 0.09;
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = midiToFreq(m);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, st);
      g.gain.exponentialRampToValueAtTime(0.25 * vol, st + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, st + 0.7);
      o.connect(g).connect(this.sfxGain);
      o.start(st);
      o.stop(st + 0.75);
    });
  }
}
