const fs   = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const FILES = {
  feedback: path.join(DATA_DIR, 'feedback.json'),
  news:     path.join(DATA_DIR, 'news.json'),
};

/* ── создать папку и файлы если нет ── */
function init() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

  if (!fs.existsSync(FILES.feedback)) {
    write('feedback', []);
  }

  if (!fs.existsSync(FILES.news)) {
    const day = 86400000;
    write('news', [
      {
        id: uid(), created_at: new Date(Date.now() - day * 2).toISOString(),
        title: 'Запуск kawaz1k.win',
        description: 'Открыт новый сайт универсального скрипта для Roblox.',
        added: 'Консоль с копированием, инструкция, форма жалоб',
        improved: 'Дизайн, скорость и мобильная версия'
      },
      {
        id: uid(), created_at: new Date(Date.now() - day * 5).toISOString(),
        title: 'Universal v5.0.3',
        description: 'Один скрипт работает сразу во всех играх.',
        added: 'Режим Universal для любых проектов',
        improved: 'Стабильность и анти-детект'
      },
      {
        id: uid(), created_at: new Date(Date.now() - day * 9).toISOString(),
        title: 'Частный вход',
        description: 'Открыта администрация сайта по инвайт-коду.',
        added: 'Панель: жалобы и публикация новостей',
        improved: 'Фильтрация входа по invite-code'
      }
    ]);
  }
}

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

function read(key) {
  try {
    return JSON.parse(fs.readFileSync(FILES[key], 'utf8'));
  } catch { return []; }
}

function write(key, data) {
  fs.writeFileSync(FILES[key], JSON.stringify(data, null, 2), 'utf8');
}

module.exports = { init, read, write, uid };
