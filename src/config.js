// =============================================================
//  ТОХИРГОО
//  Текст, character-ийн өнгө, үс, байрлал, дуу бүгд энд байна.
//  Ихэнх өөрчлөлтийг зөвхөн энэ файлаас хийхэд хангалттай.
// =============================================================

export const CONFIG = {
  text: {
    pageTitle: 'Энхжинд',
    intro: 'Дэлхий үүсэж байна',
    findMe: 'Хуруугаа чирээд Мөнх-Очир руу алхаарай',
    replay: 'Дахин үзэх',
    noWebGL: 'Энэ browser дээр 3D нээгдсэнгүй. Chrome эсвэл Safari-аар дахин нээгээрэй.',
    contextLost: 'Дэлгэц түр гацлаа. Доорх товчийг дараад дахин эхлүүлээрэй.',
    reload: 'Дахин ачаалах',
  },

  // Дүрүүдийн толгой дээр харагдах нэр
  names: {
    me: 'Мөнх-Очир',
    enkhjin: 'Энхжин',
  },

  // Тэнгэрт салютаар бичигдэх мэндчилгээ.
  // scale: мөрийн хэмжээ, colors: зүүн талаас баруун тал руу шилжих өнгө
  message: {
    // Хэвтээ дэлгэц (компьютер)
    wide: [
      { text: 'Төрсөн өдрийн мэнд', scale: 1.0, colors: ['#ffe0ef', '#ffe8a8'] },
      { text: 'Энхжин', scale: 1.7, colors: ['#ff6f9c', '#ffc1dd'] },
    ],
    // Босоо дэлгэц (утас): томоор харагдуулахын тулд гурван мөр
    tall: [
      { text: 'Төрсөн өдрийн', scale: 1.0, colors: ['#ffe0ef', '#ffe8a8'] },
      { text: 'мэнд', scale: 1.0, colors: ['#ffe0ef', '#ffe8a8'] },
      { text: 'Энхжин', scale: 1.45, colors: ['#ff6f9c', '#ffc1dd'] },
    ],
  },

  // Энхжин хаанаас эхлэх, хэр хурдан алхах
  player: {
    start: [0, 13],      // [x, z]
    startFacing: Math.PI, // Math.PI = урагшаа (над руу) харна
    speed: 3.0,
    radius: 0.45,
  },

  // Миний character-ийн тогтмол байрлал
  me: {
    position: [0, -4],   // [x, z]
  },

  // Энэ зайнаас ойртоход ending автоматаар эхэлнэ
  interactionRadius: 1.9,
  // Ending эхлэхээс өмнө Энхжин хамгийн багадаа ийм зай алхсан байх ёстой
  minWalkDistance: 8,

  // Модон сандал. rotationY = Math.PI бол сандал хойшоо (салют буудах тал руу) харна
  bench: {
    position: [-3.6, -7.6],
    rotationY: Math.PI,
  },

  // Бялуутай дугуй ширээ
  table: {
    position: [3.0, -7.0],
  },

  world: {
    walkRadius: 23,  // Энхжин үүнээс цааш явж чадахгүй
    seed: 14,        // Мод, цэцгийн байрлалыг өөрчлөх бол энэ тоог соль
  },

  camera: {
    fov: 50,
    followOffset: [0, 6.2, 8.2],
    lookOffset: [0, 0.9, 0],
    followLerp: 4,
  },

  // ---------------------------------------------------------
  //  CHARACTER-ИЙН ХАРАГДАХ БАЙДАЛ
  //  hairStyle: 'bob' | 'pigtails' | 'long' | 'bun' | 'short'
  //  outfit:    'dress' | 'shirt'
  //  accessory: 'bow' | 'none'
  // ---------------------------------------------------------
  characters: {
    enkhjin: {
      skin: '#ffdcc8',
      hair: '#b3302b',
      hairStyle: 'bob',
      outfit: 'dress',
      top: '#ff8fb8',      // цамц / даашинзны дээд хэсэг
      bottom: '#ffc2d8',   // банзал эсвэл өмд
      shoes: '#ffffff',
      cheeks: '#ff8fa3',
      eyes: '#24161a',
      accessory: 'bow',
      accessoryColor: '#ff4f7b',
      scale: 1.0,
    },
    me: {
      skin: '#f3c9a8',
      hair: '#1b1717',
      hairStyle: 'short',
      outfit: 'shirt',
      top: '#6aa7ff',
      bottom: '#34446a',
      shoes: '#2a2a33',
      cheeks: '#ff9aa8',
      eyes: '#1a1416',
      accessory: 'none',
      accessoryColor: '#ffffff',
      scale: 1.08,
    },
  },

  cake: {
    plate: '#ffffff',
    sponge: '#fff1dd',
    frosting: '#ff9ec7',
    berries: '#e3264a',
    candle: '#7ec8ff',
    flame: '#ffd36b',
  },

  fireworks: {
    maxParticles: 14000,
    colors: ['#ff5c8a', '#ffd166', '#7bdff2', '#b388ff', '#ff8fab', '#ffffff', '#9bf6a0', '#ff4d6d'],
  },

  // ---------------------------------------------------------
  //  ДУУ
  //  Файл байхгүй бол browser дотор синтезээр үүсгэсэн
  //  энгийн дуу автоматаар тоглоно. Өөрийн файлаа тавихад л
  //  тэр нь автоматаар орлоно.
  // ---------------------------------------------------------
  audio: {
    files: {
      music: 'assets/audio/music.mp3',
      firework: 'assets/audio/firework.mp3',
      launch: 'assets/audio/launch.mp3',
      interaction: 'assets/audio/interaction.mp3',
      big: 'assets/audio/big-firework.mp3',
    },
    volume: {
      master: 0.9,
      music: 0.45,
      firework: 0.7,
      launch: 0.35,
      interaction: 0.6,
      big: 1.0,
      salute: 1.0,
      crackle: 0.8,
      sizzle: 0.9,
    },
  },
};
