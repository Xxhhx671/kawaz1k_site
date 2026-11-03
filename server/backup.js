/* ============================================================
   kawaz1k.win — бэкапы данных.

   Раз в N минут весь склад (пользователи, заказы, деньги, чат…)
   снимается в один сжатый файл backups/backup-<дата>.json.gz.
   Хранятся последние BACKUP_KEEP копий, старые удаляются.

   Восстановление: POST /api/admin/backups/restore { name }
   (админ-доступ), данные возвращаются в хранилище целиком.
   ============================================================ */

const fs   = require('fs');
const path = require('path');
const zlib = require('zlib');
const db   = require('./db');

const ROOT  = path.join(__dirname, '..');
const DIR   = path.resolve(process.env.BACKUP_DIR || path.join(ROOT, 'backups'));
const KEEP  = Math.max(1, parseInt(process.env.BACKUP_KEEP, 10)  || 30);
const EVERY = Math.max(1, parseInt(process.env.BACKUP_EVERY_MIN, 10) || 15) * 60000;

const NAME_RE = /^backup-\d{8}-\d{6}-(auto|manual|boot)\.json\.gz$/;

const pad = n => String(n).padStart(2, '0');
const stamp = () => {
  const d = new Date();
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
};

function create(reason = 'auto') {
  fs.mkdirSync(DIR, { recursive: true });
  const name = `backup-${stamp()}-${reason}.json.gz`;
  const file = path.join(DIR, name);
  const tmp  = file + '.tmp';

  const payload = zlib.gzipSync(Buffer.from(JSON.stringify(db.dump()), 'utf8'));
  fs.writeFileSync(tmp, payload);
  fs.renameSync(tmp, file);              // атомарно: бэкап либо целиком, либо его нет

  prune();
  return { name, size: payload.length, ts: Date.now() };
}

function prune() {
  let files;
  try { files = fs.readdirSync(DIR).filter(f => NAME_RE.test(f)); }
  catch { return; }
  if (files.length <= KEEP) return;
  files
    .map(f => ({ f, t: fs.statSync(path.join(DIR, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t)
    .slice(KEEP)
    .forEach(x => { try { fs.unlinkSync(path.join(DIR, x.f)); } catch {} });
}

function list() {
  let files;
  try { files = fs.readdirSync(DIR).filter(f => NAME_RE.test(f)); }
  catch { return []; }
  return files
    .map(f => { const s = fs.statSync(path.join(DIR, f)); return { name: f, size: s.size, ts: s.mtimeMs }; })
    .sort((a, b) => b.ts - a.ts);
}

function restore(name) {
  if (!NAME_RE.test(String(name || ''))) throw new Error('Некорректное имя бэкапа');
  const file = path.join(DIR, name);
  if (!fs.existsSync(file)) throw new Error('Бэкап не найден');

  let data;
  try { data = JSON.parse(zlib.gunzipSync(fs.readFileSync(file)).toString('utf8')); }
  catch { throw new Error('Файл бэкапа повреждён'); }

  return db.importData(data);            // возвращает список записанных ключей
}

/* путь к файлу бэкапа (для скачивания) — null, если имя кривое или файла нет */
function filePath(name) {
  if (!NAME_RE.test(String(name || ''))) return null;
  const file = path.join(DIR, name);
  return fs.existsSync(file) ? file : null;
}

function start() {
  try { const b = create('boot'); console.log(`💾 Бэкап при старте: ${b.name}`); }
  catch (e) { console.warn('⚠️ Бэкап не создан:', e.message); }

  setInterval(() => {
    try { create('auto'); }
    catch (e) { console.warn('⚠️ Автобэкап не создан:', e.message); }
  }, EVERY).unref();

  console.log(`💾 Автобэкапы: каждые ${Math.round(EVERY / 60000)} мин, хранится ${KEEP} копий → ${DIR}`);
}

module.exports = { create, list, restore, start, filePath, DIR };
