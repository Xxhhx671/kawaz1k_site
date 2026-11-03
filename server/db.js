/* ============================================================
   kawaz1k.win — хранилище данных.

   Основной бэкенд: SQLite (better-sqlite3), одна таблица kv.
     ✔ атомарные записи (WAL), один файл вместо кучи JSON,
       данные не теряются при обрыве питания / перезапуске.
   Резервный бэкенд: привычные data/*.json.
     Включается автоматически, если модуль SQLite не установился,
     или принудительно переменной окружения DB=json.

   API не изменился: init / read / write / uid.
   Плюс: has / dump / importData / backend — для бэкапов и статуса.
   ============================================================ */

const fs   = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_FILE  = path.join(DATA_DIR, 'kawaz1k.db');

/* все ключи хранилища — имена файлов раньше были такими же */
const KEYS = [
  'feedback', 'news', 'chat', 'users', 'sessions', 'invites',
  'orders', 'coderApps', 'scripts', 'transactions', 'logins', 'modlog', 'mutes'
];

const FILES = {};
KEYS.forEach(k => { FILES[k] = path.join(DATA_DIR, k + '.json'); });

/* sessions — объект, всё остальное — массивы */
const DEFAULTS = { sessions: () => ({}) };
const defaultValue = k => (DEFAULTS[k] ? DEFAULTS[k]() : []);

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

/* ── SQLite ── */
let sql = null;          // объект Database или null (тогда работаем на JSON)
let backend = 'json';

function openSqlite() {
  if (process.env.DB === 'json') return null;
  let Database;
  try { Database = require('better-sqlite3'); }
  catch (e) { console.warn('⚠️ Модуль SQLite не найден (' + e.message + ') — работаем на JSON-файлах'); return null; }
  try {
    const db = new Database(DB_FILE);
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = NORMAL');
    db.exec(`CREATE TABLE IF NOT EXISTS kv (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    )`);
    return db;
  } catch (e) {
    console.warn('⚠️ Не удалось открыть SQLite (' + e.message + ') — работаем на JSON-файлах');
    return null;
  }
}

let sqlGet, sqlSet;
function prepare() {
  if (!sql) return;
  sqlGet = sql.prepare('SELECT value FROM kv WHERE key = ?');
  sqlSet = sql.prepare(`INSERT INTO kv (key, value, updated_at) VALUES (?, ?, ?)
                        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`);
}

function sqlHas(key)  { return !!sqlGet.get(key); }
function sqlRead(key) { const r = sqlGet.get(key); return r ? JSON.parse(r.value) : defaultValue(key); }
function sqlWrite(key, data) { sqlSet.run(key, JSON.stringify(data), Date.now()); }

function jsonHas(key)  { return fs.existsSync(FILES[key]); }
function jsonRead(key) { return JSON.parse(fs.readFileSync(FILES[key], 'utf8')); }
function jsonWrite(key, data) {
  const file = FILES[key];
  const tmp  = file + '.tmp';
  // атомарная запись: сначала временный файл, потом rename —
  // файл не повредится, если процесс упадёт посреди записи
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, file);
}

/* ── перенос старых JSON-файлов в SQLite (один раз, при первом старте) ── */
function migrateJsonToSqlite() {
  let moved = 0;
  for (const key of KEYS) {
    if (sqlHas(key) || !fs.existsSync(FILES[key])) continue;
    try { sqlWrite(key, jsonRead(key)); moved++; }
    catch (e) { console.warn(`⚠️ миграция ${key}:`, e.message); }
  }
  if (moved) console.log(`🚚 Перенесено в SQLite: ${moved} набор(ов) данных`);
}

/* ── стартовые данные (как только файла/ключа ещё нет) ── */
function seed() {
  if (!has('scripts')) {
    write('scripts', [
      { id: 's1', name: 'kawaz1k — Universal', tag: 'УНИВЕРСАЛ', ver: 'v5.0.3',
        desc: 'ESP, speed, fly, noclip, anti-AFK',
        loadstring: 'loadstring(game:HttpGet("https://raw.githubusercontent.com/Xxhhx671/kawaz1k/refs/heads/main/kawaz1k.lua.txt"))()' },
      { id: 's2', name: 'kawaz1k — Free', tag: 'FREE', ver: 'v1.0',
        desc: 'Базовый набор функций',
        loadstring: 'loadstring(game:HttpGet("https://raw.githubusercontent.com/Xxhhx671/kawaz1k/refs/heads/main/kawaz-free.txt"))()' }
    ]);
  }

  if (!has('news')) {
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

function init() {
  fs.mkdirSync(DATA_DIR, { recursive: true });

  sql = openSqlite();
  prepare();
  backend = sql ? 'sqlite' : 'json';

  if (sql) migrateJsonToSqlite();

  // сначала стартовые данные (scripts/news), потом пустые файлы под остальное —
  // иначе в JSON-режиме «свежий» пустой файл выглядит как «данные уже есть»
  seed();
  if (!sql) KEYS.forEach(k => { if (!jsonHas(k)) jsonWrite(k, defaultValue(k)); });

  return backend;
}

/* ── публичное API ── */
function has(key) { return sql ? sqlHas(key) : jsonHas(key); }

function read(key) {
  if (!KEYS.includes(key)) return defaultValue(key);
  try {
    return sql ? sqlRead(key) : jsonRead(key);
  } catch (e) {
    console.warn(`⚠️ db.read(${key}):`, e.message);
    return defaultValue(key);
  }
}

function write(key, data) {
  if (!KEYS.includes(key)) return;
  if (sql) { sqlWrite(key, data); return; }
  jsonWrite(key, data);
}

/* снимок всего хранилища — из него делается бэкап */
function dump() {
  const out = {};
  for (const k of KEYS) out[k] = read(k);
  return out;
}

/* восстановление из бэкапа: пишем только известные ключи, которые есть в файле */
function importData(obj) {
  if (!obj || typeof obj !== 'object') throw new Error('Некорректный файл бэкапа');
  const keys = KEYS.filter(k => Object.prototype.hasOwnProperty.call(obj, k));
  if (!keys.length) throw new Error('В бэкапе нет данных');
  if (sql) {
    const run = sql.transaction(() => keys.forEach(k => sqlWrite(k, obj[k])));
    run();
  } else {
    keys.forEach(k => jsonWrite(k, obj[k]));
  }
  return keys;
}

const backendName = () => backend;

module.exports = { init, read, write, has, uid, dump, importData, backend: backendName, KEYS };
