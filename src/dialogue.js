// Тоглоом шиг ярианы цонх: дэлгэцийн доор хэн ярьж байгаа нь, үг нь
// нэг нэгээр бичигдэнэ. Дарахад үргэлжилнэ. Энхжин хоёр хариултаас сонгоно.

export class Dialogue {
  constructor(names, characters) {
    const $ = (id) => document.getElementById(id);
    this.box = $('dialogue');
    this.speakerEl = $('dialogue-speaker');
    this.textEl = $('dialogue-text');
    this.choicesEl = $('dialogue-choices');
    this.actionBtn = $('dialogue-action');
    this.names = names;
    this.characters = characters;
    this._onTap = null;
    this.box.addEventListener('click', () => {
      if (this._onTap) this._onTap();
    });
  }

  _setSpeaker(who) {
    this.box.dataset.who = who;
    this.speakerEl.textContent = who === 'narrator' ? '' : this.names[who] || '';
    this.speakerEl.classList.toggle('hidden', who === 'narrator');
  }

  _talking(who, on) {
    for (const [key, ch] of Object.entries(this.characters)) {
      if (key === who) ch.setTalking(on);
      else ch.setTalking(false);
    }
  }

  // Нэг мөр үг: бичигдэж дуусаад, хэрэглэгч дарахад resolve болно
  say(who, text) {
    this._setSpeaker(who);
    this.box.classList.remove('hidden');
    this.box.classList.remove('done');
    this.textEl.textContent = '';
    this._talking(who, true);

    return new Promise((resolve) => {
      let i = 0;
      let finished = false;
      const chars = Array.from(text);
      const finish = () => {
        finished = true;
        clearInterval(timer);
        this.textEl.textContent = text;
        this.box.classList.add('done');
        this._talking(who, false);
      };
      const timer = setInterval(() => {
        i++;
        this.textEl.textContent = chars.slice(0, i).join('');
        if (i >= chars.length) finish();
      }, 34);
      this._onTap = () => {
        if (!finished) {
          finish();
          return;
        }
        this._onTap = null;
        resolve();
      };
    });
  }

  // Энхжингийн хоёр хариулт. Сонгосон индексийг буцаана.
  choose(options) {
    this.box.classList.add('hidden');
    this.choicesEl.innerHTML = '';
    this.choicesEl.classList.remove('hidden');
    return new Promise((resolve) => {
      options.forEach((text, index) => {
        const btn = document.createElement('button');
        btn.className = 'choice-btn';
        btn.textContent = text;
        btn.addEventListener('click', () => {
          this.choicesEl.classList.add('hidden');
          this.choicesEl.innerHTML = '';
          resolve(index);
        });
        this.choicesEl.appendChild(btn);
      });
    });
  }

  // Ганц том товч (жишээ нь "Үлээх")
  action(label) {
    this.actionBtn.textContent = label;
    this.actionBtn.classList.remove('hidden');
    return new Promise((resolve) => {
      const onClick = () => {
        this.actionBtn.removeEventListener('click', onClick);
        this.actionBtn.classList.add('hidden');
        resolve();
      };
      this.actionBtn.addEventListener('click', onClick);
    });
  }

  // Бичиг харуулаад, дарахыг хүлээхгүйгээр үлдээнэ
  show(who, text) {
    this._setSpeaker(who);
    this.textEl.textContent = text;
    this.box.classList.remove('hidden');
    this.box.classList.add('done', 'no-next');
    this._onTap = null;
  }

  hide() {
    this.box.classList.add('hidden');
    this.box.classList.remove('no-next');
    this.choicesEl.classList.add('hidden');
    this._onTap = null;
    this._talking(null, false);
  }

  // story.js доторх жагсаалтыг дарааллаар нь тоглуулна
  async run(lines) {
    for (const line of lines) {
      if (line.choices) {
        const index = await this.choose(line.choices.map((c) => c.text));
        const picked = line.choices[index];
        await this.say('enkhjin', picked.text);
        if (picked.reply && picked.reply.length) await this.run(picked.reply);
      } else {
        await this.say(line.who, line.text);
      }
    }
    this.hide();
  }
}
