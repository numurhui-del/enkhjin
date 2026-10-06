// HTML давхаргууд: эхлэх дэлгэц, зөвлөмж, дуу унтраах товч,
// cinematic хар зурвас, дахин үзэх товч.

const SPEAKER = '<path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor"/>';
const SOUND_ON = `<svg viewBox="0 0 24 24" width="20" height="20">${SPEAKER}<path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round"/></svg>`;
const SOUND_OFF = `<svg viewBox="0 0 24 24" width="20" height="20">${SPEAKER}<path d="M16.5 9.5l5 5M21.5 9.5l-5 5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`;

export class UI {
  constructor(text) {
    const $ = (id) => document.getElementById(id);
    this.intro = $('intro');
    this.hint = $('hint');
    this.joystick = $('joystick');
    this.muteBtn = $('mute-btn');
    this.bars = $('cinema-bars');
    this.replay = $('replay-btn');
    this.guide = $('touch-guide');
    this.error = $('error-screen');
    this.errorText = $('error-text');
    this.reloadBtn = $('reload-btn');
    this.text = text;
    this.flashEl = $('flash');

    document.title = text.pageTitle;
    $('intro-text').textContent = text.intro;
    this.reloadBtn.textContent = text.reload;
    this.reloadBtn.addEventListener('click', () => window.location.reload());
    this.hint.textContent = text.findMe;
    this.replay.textContent = text.replay;
    this.muteBtn.innerHTML = SOUND_ON;
  }

  setReady() {
    window.__gameReady = true;
  }

  // "Дэлхий үүсэж байна" бичиг бүдгэрч, ертөнц харагдаж эхэлнэ
  hideIntro() {
    this.intro.classList.add('hidden');
    this.muteBtn.classList.remove('hidden');
  }

  showError(message, withReload = false) {
    this.errorText.textContent = message;
    this.reloadBtn.classList.toggle('hidden', !withReload);
    this.error.classList.remove('hidden');
  }

  // Хуруугаар чирэхийг заасан жижиг анимэйшн (зөвхөн touch төхөөрөмж дээр)
  showGuide() {
    if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) {
      this.guide.classList.remove('hidden');
    }
  }

  hideGuide() {
    this.guide.classList.add('hidden');
  }

  onMuteToggle(callback) {
    this.muteBtn.addEventListener('click', () => {
      const muted = this.muteBtn.dataset.muted !== 'true';
      this.muteBtn.dataset.muted = String(muted);
      this.muteBtn.innerHTML = muted ? SOUND_OFF : SOUND_ON;
      callback(muted);
    });
  }

  showHint() {
    this.hint.classList.remove('hidden');
  }

  hideHint() {
    this.hint.classList.add('hidden');
  }

  showCinemaBars() {
    this.bars.classList.add('active');
  }

  onReplay(callback) {
    this.replay.addEventListener('click', () => {
      this.hideReplay();
      callback();
    });
  }

  // Том салют дэлбэрэхэд дэлгэц хором зуур гэрэлтэнэ
  flash() {
    const el = this.flashEl;
    el.classList.remove('go');
    void el.offsetWidth;
    el.classList.add('go');
  }

  showReplay() {
    this.replay.classList.remove('hidden');
  }

  hideReplay() {
    this.replay.classList.add('hidden');
  }
}
