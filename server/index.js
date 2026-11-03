require('dotenv').config();
const express  = require('express');
const http     = require('http');
const path     = require('path');
const crypto   = require('crypto');
const helmet   = require('helmet');
const { WebSocketServer } = require('ws');
const db       = require('./db');
const money    = require('./money');
const backup   = require('./backup');

const app    = express();
const server = http.createServer(app);
const PORT   = process.env.PORT || 3000;
const INVITE = process.env.INVITE_CODE || 'EmirDI1804';

/* ── лимиты чата ── */
const CHAT_MAX_MSGS  = 200;
const CHAT_MSG_LEN   = 400;
const CHAT_RATE_MS   = 1500;

const ROOT = path.join(__dirname, '..');

app.set('trust proxy', 1);

/* безопасность заголовков: запрет фреймов, свой CSP, referrer-policy.
   script-src/style-src с 'unsafe-inline' — в разметке есть inline-onclick
   и инлайновые стили (цвета/шрифты), поэтому полностью запрещать их нельзя. */
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      'default-src': ["'self'"],
      'script-src':  ["'self'", "'unsafe-inline'"],
      'style-src':   ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      'font-src':    ["'self'", 'https://fonts.gstatic.com', 'data:'],
      'img-src':     ["'self'", 'data:', 'blob:'],
      'connect-src': ["'self'"],
      'object-src':  ["'none'"],
      'frame-ancestors': ["'none'"],
      'base-uri':    ["'self'"],
      'form-action': ["'self'"]
    }
  },
  crossOriginEmbedderPolicy: false,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' }
}));

app.use(express.json({ limit: '5mb' }));

// Отдаём ТОЛЬКО публичные файлы. Раньше раздавалась вся папка проекта,
// и любой мог скачать /data/users.json, /.env и /server/index.js.
app.use('/css', express.static(path.join(ROOT, 'css')));
app.use('/js',  express.static(path.join(ROOT, 'js')));
app.get('/', (req, res) => res.sendFile(path.join(ROOT, 'index.html')));

const STORAGE = db.init();
console.log(`✅ Хранилище готово: ${STORAGE === 'sqlite' ? 'SQLite (data/kawaz1k.db)' : 'JSON-файлы (data/*.json)'}`);

/* ── WebSocket ── */
const wss = new WebSocketServer({ server });
const clients = new Set();

/* частота сообщений в чате: ключ (ник ИЛИ ip) → отметки времени в окне */
const rateBuckets = new Map();
function rateOk(key, { minGap = 0, max = Infinity, windowMs = 60000 } = {}) {
  const now = Date.now();
  const arr = (rateBuckets.get(key) || []).filter(t => now - t < windowMs);
  if (arr.length >= max) return false;
  if (minGap && arr.length && now - arr[arr.length - 1] < minGap) return false;
  arr.push(now);
  rateBuckets.set(key, arr);
  return true;
}
function broadcast(data) {
  const str = JSON.stringify(data);
  for (const ws of clients) {
    if (ws.readyState === 1) ws.send(str);
  }
}

/* ── чат: роли (guest / user / admin) ── */
const findUser = nick => db.read('users').find(u => u.nick.toLowerCase() === String(nick || '').toLowerCase());
const roleOf   = user => !user ? 'guest' : (user.role === 'admin' ? 'admin' : 'user');
const broadcastSystem = text => broadcast({ type: 'system', id: db.uid(), text: String(text).slice(0, 200) });

/* ── чат: баны и мьюты (по нику и по IP; until=0 → навсегда) ── */
function restrictionFor(nick, ip) {
  const now = Date.now();
  const n = String(nick || '').toLowerCase();
  return db.read('mutes').find(m =>
    (!m.until || m.until > now) &&
    ((m.nick && m.nick.toLowerCase() === n) || (m.ip && ip && m.ip === ip))
  ) || null;
}

/* ── чат: команды модерации (только роль admin) ── */
const MOD_HELP = 'Команды: /ban ник [мин] · /unban ник · /mute ник [мин] · /unmute ник · /kick ник';
function modCommand(raw, senderNick, role, senderIp) {
  const parts = String(raw).slice(1).trim().split(/\s+/);
  const cmd   = (parts[0] || '').toLowerCase();
  const target = String(parts[1] || '').trim().slice(0, 30);
  const mins   = Math.min(43200, Math.max(0, parseInt(parts[2], 10) || 0));   // максимум 30 суток

  if (['help', '?', 'хелп'].includes(cmd)) return { handled: true, notice: MOD_HELP };

  const isModCmd = ['ban', 'unban', 'mute', 'unmute', 'kick'].includes(cmd);
  if (!isModCmd) {
    // админу — подсказка об опечатке, остальным — обычный текст
    return role === 'admin'
      ? { handled: true, notice: 'Неизвестная команда. ' + MOD_HELP }
      : { handled: false };
  }
  if (role !== 'admin') return { handled: true, notice: 'Команды модерации доступны только администраторам' };
  if (!target) return { handled: true, notice: 'Укажи ник. ' + MOD_HELP };

  const online = [...clients].find(w => w.nick && w.nick.toLowerCase() === target.toLowerCase());
  const same = m => m.nick && m.nick.toLowerCase() === target.toLowerCase();

  if (cmd === 'kick') {
    if (!online) return { handled: true, notice: `${target} сейчас не в чате` };
    try { online.send(JSON.stringify({ type: 'notice', text: 'Вы исключены из чата администратором' })); online.close(); } catch {}
    broadcastSystem(`👢 ${target} исключён из чата`);
    modlog('chat.kick', `${target} (кикнул ${senderNick})`);
    return { handled: true };
  }

  if (cmd === 'unban' || cmd === 'unmute') {
    const list = db.read('mutes');
    const keep = list.filter(m => !same(m));
    if (keep.length === list.length) return { handled: true, notice: `${target} нет в списке ограничений` };
    db.write('mutes', keep);
    broadcastSystem(`✅ С ${target} снято ограничение`);
    modlog('chat.' + cmd, `${target} (снял ${senderNick})`);
    return { handled: true };
  }

  /* ban / mute — старое ограничение по этому нику перезаписывается */
  const until = mins ? Date.now() + mins * 60000 : 0;
  const list  = db.read('mutes').filter(m => !same(m));
  list.push({
    id: db.uid(), kind: cmd === 'ban' ? 'ban' : 'mute',
    nick: target, ip: online ? online.ip : '',
    until, by: senderNick, ts: Date.now()
  });
  db.write('mutes', list);

  const dur = until ? (mins >= 60 ? `${Math.round(mins / 60)} ч` : `${mins} мин`) : 'навсегда';
  const what = cmd === 'ban' ? 'блокировка' : 'мут';
  broadcastSystem(`${cmd === 'ban' ? '🔨' : '🔇'} ${target} — ${what} чата: ${dur}`);
  modlog('chat.' + cmd, `${target} на ${dur} (дал ${senderNick})`);
  if (online && cmd === 'ban') {
    try { online.send(JSON.stringify({ type: 'notice', text: 'Вы заблокированы в чате' })); } catch {}
  }
  return { handled: true };
}

wss.on('connection', ws => {
  clients.add(ws);
  ws.ip = (ws._socket && ws._socket.remoteAddress) || '?';
  const ip = ws.ip;
  const history = db.read('chat');
  ws.send(JSON.stringify({ type: 'history', messages: history }));

  ws.on('message', raw => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    if (msg.type === 'send') {
      const nick = (msg.nick || '').trim().slice(0, 30);
      const text = (msg.text || '').trim().slice(0, CHAT_MSG_LEN);
      if (!nick || !text) return;

      const user = findUser(nick);
      const role = roleOf(user);

      /* команды модерации — до проверки лимитов, чтобы админ не «попал» в кап */
      if (text[0] === '/') {
        const run = modCommand(text, nick, role, ip);
        if (run.handled) {
          if (run.notice) ws.send(JSON.stringify({ type: 'notice', text: run.notice }));
          return;
        }
      }

      /* мут/бан — по нику или по IP */
      const restricted = restrictionFor(nick, ip);
      if (restricted) {
        const kind  = restricted.kind === 'ban' ? 'блокировка' : 'мут';
        const until = restricted.until
          ? 'до ' + new Date(restricted.until).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
          : 'навсегда';
        ws.send(JSON.stringify({ type: 'notice', text: `В чате у вас ${kind} (${until}).` }));
        return;
      }

      // лимит по нику (перебор ников не помогает) и по IP (сменил ник — всё равно кап)
      if (!rateOk('nick:' + nick, { minGap: CHAT_RATE_MS })) return;
      if (!rateOk('ip:' + ip, { minGap: 700, max: 30 })) return;

      ws.nick = nick;
      ws.role = role;

      /* цитата ответа — чистим до безопасных размеров */
      const replyTo = (msg.replyTo && typeof msg.replyTo === 'object' && msg.replyTo.nick)
        ? { nick: String(msg.replyTo.nick).slice(0, 30), text: String(msg.replyTo.text || '').slice(0, 120) }
        : null;

      const item = {
        id: db.uid(), nick, text, ts: Date.now(),
        role,
        color: (user && isColor(user.nickColor)) ? user.nickColor.toLowerCase() : ''
      };
      if (replyTo) item.replyTo = replyTo;

      const msgs = db.read('chat');
      msgs.push(item);
      if (msgs.length > CHAT_MAX_MSGS) msgs.splice(0, msgs.length - CHAT_MAX_MSGS);
      db.write('chat', msgs);

      broadcast({ type: 'message', message: item });
    }
  });

  ws.on('close', () => clients.delete(ws));
  ws.on('error', () => clients.delete(ws));
});

setInterval(() => {
  broadcast({ type: 'online', count: clients.size });
}, 5000);

setInterval(() => {
  const now = Date.now();
  for (const [k, arr] of rateBuckets) {
    if (!arr.length || now - arr[arr.length - 1] > 300000) rateBuckets.delete(k);
  }
  /* вычищаем истёкшие мьюты/баны */
  const mutes = db.read('mutes');
  const alive = mutes.filter(m => !m.until || m.until > now);
  if (alive.length !== mutes.length) db.write('mutes', alive);
}, 60000).unref();

/* ── helpers ── */
const safeEqual = (a, b) => {
  const x = Buffer.from(String(a || ''));
  const y = Buffer.from(String(b || ''));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

function requireAdmin(req, res, next) {
  if (!safeEqual(req.headers['x-invite-code'], INVITE))
    return res.status(401).json({ error: 'Unauthorized' });
  next();
}

/* ── сессии: живут не вечно, а SESSION_TTL_DAYS дней (по умолчанию 30) ── */
const SESSION_TTL_MS = Math.max(1, Number(process.env.SESSION_TTL_DAYS) || 30) * 86400000;

/* старые сессии хранились строкой "sid": "ник" — поддерживаем оба формата */
const sessionNick = rec => (typeof rec === 'string' ? rec : (rec && rec.nick)) || '';
const sessionRec  = (rec, nick) => typeof rec === 'string'
  ? { nick, exp: Date.now() + SESSION_TTL_MS }
  : { nick, exp: rec.exp || Date.now() + SESSION_TTL_MS };

function requireSession(req, res, next) {
  const sid = String(req.headers['x-session-id'] || '');
  const sessions = db.read('sessions');
  const rec = sid && Object.prototype.hasOwnProperty.call(sessions, sid) ? sessions[sid] : null;
  const nick = sessionNick(rec);
  if (!nick) return res.status(401).json({ error: 'Not logged in' });

  const exp = (typeof rec === 'object' && rec.exp) || 0;
  if (exp && exp < Date.now()) {
    delete sessions[sid];
    db.write('sessions', sessions);
    return res.status(401).json({ error: 'Сессия истекла, войдите заново' });
  }
  if (!exp) {                                   // миграция старого формата — сразу со сроком
    sessions[sid] = { nick, exp: Date.now() + SESSION_TTL_MS };
    db.write('sessions', sessions);
  }

  req.sessionId   = sid;
  req.sessionNick = nick;
  next();
}

/* ── журнал входов (кто и когда входил, с какого IP) ── */
function logAuth(kind, nick, ok, req, note) {
  try {
    const items = db.read('logins');
    items.unshift({
      id: db.uid(),
      kind,                                        // login | register | logout | admin
      nick: String(nick || '').slice(0, 30),
      ok: !!ok,
      note: String(note || '').slice(0, 80),
      ip: (req && req.ip) || '',
      ua: String((req && req.headers['user-agent']) || '').slice(0, 120),
      ts: Date.now()
    });
    if (items.length > 300) items.length = 300;
    db.write('logins', items);
  } catch (e) { console.warn('⚠️ logAuth:', e.message); }
}

/* ── журнал действий администратора (модерация, деньги, бэкапы) ── */
function modlog(action, detail, req) {
  try {
    const items = db.read('modlog');
    items.unshift({
      id: db.uid(),
      action,                                      // balance.set | order.reject | chat.delete | ...
      detail: String(detail || '').slice(0, 200),
      ip: (req && req.ip) || '',
      ts: Date.now()
    });
    if (items.length > 500) items.length = 500;
    db.write('modlog', items);
  } catch (e) { console.warn('⚠️ modlog:', e.message); }
}

/* пароли: scrypt + соль. Старые пароли в открытом виде принимаются
   один раз и сразу перехэшируются при входе. */
const hashPass = pass => {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(pass), salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
};
const checkPass = (pass, stored) => {
  stored = String(stored || '');
  if (!stored.startsWith('scrypt$')) return safeEqual(pass, stored);   // legacy
  const [, salt, hash] = stored.split('$');
  const test = crypto.scryptSync(String(pass), salt, 64).toString('hex');
  return safeEqual(test, hash);
};

const newSession = nick => {
  const sid = crypto.randomBytes(24).toString('hex');
  const sessions = db.read('sessions');
  sessions[sid] = { nick, exp: Date.now() + SESSION_TTL_MS };
  db.write('sessions', sessions);
  return sid;
};

const publicUser  = ({ pass: _p, ...safe }) => safe;                       // для самого пользователя
/* картинки профиля в списках отдаём не data-URL'ами (до 2 МБ на человека),
   а ссылками /api/media/... — браузер кэширует их навсегда (версия ?v= меняется с содержимым) */
const mediaHash = v => crypto.createHash('md5').update(String(v)).digest('hex').slice(0, 8);
const mediaUrl  = (u, kind) => u[kind] ? `/api/media/${encodeURIComponent(u.nick)}/${kind}?v=${mediaHash(u[kind])}` : '';
const catalogUser = u => ({ nick: u.nick, avatar: mediaUrl(u, 'avatar'), banner: mediaUrl(u, 'banner'),
                            bio: u.bio || '', nickColor: u.nickColor || '', createdAt: u.createdAt });   // для всех (без баланса)

/* ── реферальная система ── */
const REF_BONUS = Math.max(0, Number(process.env.REF_BONUS) || 5);   // ₽ пригласившему за нового участника

const genRefCode = users => {
  let code;
  do { code = 'kz' + Math.random().toString(36).slice(2, 8); }
  while (users.some(u => (u.refCode || '') === code));
  return code;
};

const refStats = nick => {
  const invited = db.read('users').filter(u => u.referrer === nick).length;
  const earned  = db.read('transactions')
    .filter(t => t.nick === nick && t.reason === 'referral')
    .reduce((a, t) => a + t.amount, 0);
  return { invited, earned };
};

/* что видит сам владелец: свои поля + ссылка и статистика приглашений */
const mePayload = u => ({ ...publicUser(u), ref: { code: u.refCode || '', bonus: REF_BONUS, ...refStats(u.nick) } });

const NICK_RE = /^[\p{L}\p{N}_.\- ]{2,24}$/u;
const MAX_AVATAR = 700000;      // символов data-URL
const MAX_BANNER = 2200000;
const MAX_PHOTO  = 700000;
const isColor = v => typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v);
const isImageUrl = v => typeof v === 'string' && /^data:image\/(png|jpe?g|gif|webp);base64,[A-Za-z0-9+/=]+$/.test(v);

/* простой лимит попыток на IP (защита от перебора паролей/инвайтов) */
const hits = new Map();
const limit = (max, windowMs) => (req, res, next) => {
  const key = req.path + '|' + req.ip;
  const now = Date.now();
  const arr = (hits.get(key) || []).filter(t => now - t < windowMs);
  if (arr.length >= max) return res.status(429).json({ error: 'Слишком много попыток. Подождите минуту.' });
  arr.push(now);
  hits.set(key, arr);
  next();
};
setInterval(() => {
  const now = Date.now();
  for (const [k, arr] of hits) if (!arr.some(t => now - t < 60000)) hits.delete(k);
}, 60000).unref();

/* ── auth (admin) ── */
app.post('/api/auth', limit(10, 60000), (req, res) => {
  const code = req.body && req.body.code;
  const ok = safeEqual(code, INVITE);

  /* кто вошёл в частный вход, будучи авторизованным — тому аккаунту
     даём роль admin (видно в чате, даёт команды модерации) */
  let asAdmin = false;
  if (ok) {
    const sid = String(req.headers['x-session-id'] || '');
    const sessions = db.read('sessions');
    const rec = sid ? sessions[sid] : null;
    const exp = (rec && typeof rec === 'object' && rec.exp) || 0;
    const nick = sessionNick(rec);
    if (nick && (!exp || exp >= Date.now())) {
      const users = db.read('users');
      const u = users.find(x => x.nick === nick);
      if (u && u.role !== 'admin') {
        u.role = 'admin';
        db.write('users', users);
        modlog('user.role', `${nick}: роль admin`, req);
      }
      asAdmin = !!u;
    }
  }

  logAuth('admin', ok ? 'админ' : String(code || '').slice(0, 30), ok, req, ok ? '' : 'неверный инвайт');
  ok ? res.json({ ok: true, asAdmin }) : res.status(401).json({ ok: false });
});

/* ── user auth ── */
app.post('/api/user/register', limit(10, 60000), (req, res) => {
  const { nick: rawNick, pass, invite, ref: rawRef } = req.body || {};
  const nick = String(rawNick || '').trim();
  if (!nick || !pass || !String(invite || '').trim())
    return res.status(400).json({ error: 'Заполните ник, пароль и инвайт-код' });
  if (!NICK_RE.test(nick))
    return res.status(400).json({ error: 'Ник: 2–24 символа (буквы, цифры, _ . - и пробел)' });
  if (String(pass).length < 4 || String(pass).length > 64)
    return res.status(400).json({ error: 'Пароль: от 4 до 64 символов' });

  const users   = db.read('users');
  const invites = db.read('invites');

  if (users.find(u => u.nick.toLowerCase() === nick.toLowerCase())) {
    logAuth('register', nick, false, req, 'ник занят');
    return res.status(409).json({ error: 'Ник занят' });
  }

  const inv = invites.find(i => i.code === String(invite).trim() && !i.used);
  if (!inv) {
    logAuth('register', nick, false, req, 'неверный инвайт');
    return res.status(400).json({ error: 'Неверный или использованный инвайт-код' });
  }

  /* код пригласившего: неверный код не блокирует регистрацию, просто не начисляем бонус */
  const refCode   = String(rawRef || '').trim().toLowerCase();
  const referrer  = refCode ? users.find(u => (u.refCode || '').toLowerCase() === refCode) : null;
  const selfRef   = refCode && !referrer;

  const newUser = {
    nick, pass: hashPass(pass), balance: 0,
    avatar: '', banner: '', bio: '', createdAt: Date.now(),
    refCode: genRefCode(users),
    ...(referrer && referrer.nick !== nick ? { referrer: referrer.nick } : {})
  };
  users.push(newUser);
  db.write('users', users);

  inv.used = true;
  inv.usedBy = nick;
  db.write('invites', invites);

  /* бонус пригласившему — отдельной записью в журнал операций */
  if (referrer && REF_BONUS > 0) {
    money.changeBalance(referrer.nick, REF_BONUS, { reason: 'referral', ref: nick, by: 'system' });
    modlog('ref.bonus', `${referrer.nick} ← ${nick} (+${REF_BONUS} ₽)`);
  }

  logAuth('register', nick, true, req, referrer ? `реферал: ${referrer.nick}` : (selfRef ? 'чужой реф-код' : ''));
  res.status(201).json({ sessionId: newSession(nick), user: mePayload(newUser) });
});

app.post('/api/user/login', limit(15, 60000), (req, res) => {
  const { nick, pass } = req.body || {};
  if (!nick || !pass) return res.status(400).json({ error: 'Введите ник и пароль' });

  const users = db.read('users');
  const user  = users.find(u => u.nick.toLowerCase() === String(nick).trim().toLowerCase());
  if (!user || !checkPass(pass, user.pass)) {
    logAuth('login', nick, false, req, 'неверные данные');
    return res.status(401).json({ error: 'Неверный ник или пароль' });
  }

  // миграция старых паролей в открытом виде
  if (!String(user.pass).startsWith('scrypt$')) {
    user.pass = hashPass(pass);
    db.write('users', users);
  }

  logAuth('login', user.nick, true, req);
  res.json({ sessionId: newSession(user.nick), user: mePayload(user) });
});

app.post('/api/user/logout', requireSession, (req, res) => {
  const sessions = db.read('sessions');
  delete sessions[req.sessionId];
  db.write('sessions', sessions);
  logAuth('logout', req.sessionNick, true, req);
  res.json({ ok: true });
});

app.get('/api/user/me', requireSession, (req, res) => {
  const user = db.read('users').find(u => u.nick === req.sessionNick);
  if (!user) return res.status(401).json({ error: 'Not logged in' });
  res.json(mePayload(user));
});

app.patch('/api/user/me', requireSession, (req, res) => {
  const users = db.read('users');
  const idx   = users.findIndex(u => u.nick === req.sessionNick);
  if (idx === -1) return res.status(401).json({ error: 'Not logged in' });

  const u = users[idx];
  const { bio, avatar, banner, newNick, oldPass, newPass } = req.body || {};

  /* всё проверяем ДО изменений — чтобы при ошибке ничего не сохранилось наполовину */
  if (avatar) {
    if (!isImageUrl(avatar)) return res.status(400).json({ error: 'Аватар: неверный формат картинки' });
    if (avatar.length > MAX_AVATAR) return res.status(413).json({ error: 'Аватар слишком большой' });
  }
  if (banner) {
    if (!isImageUrl(banner)) return res.status(400).json({ error: 'Баннер: неверный формат картинки' });
    if (banner.length > MAX_BANNER) return res.status(413).json({ error: 'Баннер слишком большой' });
  }

  let nickToSet = null;
  if (newNick !== undefined && String(newNick).trim() && String(newNick).trim() !== u.nick) {
    nickToSet = String(newNick).trim();
    if (!NICK_RE.test(nickToSet))
      return res.status(400).json({ error: 'Ник: 2–24 символа (буквы, цифры, _ . - и пробел)' });
    const taken = users.find((x, i) => i !== idx && x.nick.toLowerCase() === nickToSet.toLowerCase());
    if (taken) return res.status(409).json({ error: 'Ник занят' });
  }

  let passToSet = null;
  if (oldPass || newPass) {
    if (!oldPass || !newPass) return res.status(400).json({ error: 'Введите старый и новый пароль' });
    if (!checkPass(oldPass, u.pass)) return res.status(400).json({ error: 'Неверный старый пароль' });
    if (String(newPass).length < 4 || String(newPass).length > 64)
      return res.status(400).json({ error: 'Пароль: от 4 до 64 символов' });
    passToSet = hashPass(newPass);
  }

  if (bio !== undefined)    u.bio    = String(bio).slice(0, 300);
  if (avatar !== undefined) u.avatar = avatar || '';
  if (banner !== undefined) u.banner = banner || '';
  if (passToSet) u.pass = passToSet;

  const sessions = db.read('sessions');
  if (nickToSet) {
    // переносим ВСЕ сессии пользователя на новый ник (раньше обновлялась только текущая)
    for (const sid of Object.keys(sessions))
      if (sessionNick(sessions[sid]) === u.nick) sessions[sid] = sessionRec(sessions[sid], nickToSet);
    u.nick = nickToSet;
  }
  if (passToSet) {
    // после смены пароля выходим со всех остальных устройств
    for (const sid of Object.keys(sessions))
      if (sessionNick(sessions[sid]) === u.nick && sid !== req.sessionId) delete sessions[sid];
  }
  if (nickToSet || passToSet) db.write('sessions', sessions);

  users[idx] = u;
  db.write('users', users);
  res.json(publicUser(u));
});

/* ── users search (публично, без баланса) ── */
app.get('/api/users', (req, res) => {
  const q = String(req.query.q || '').trim().toLowerCase().slice(0, 32);
  const users = db.read('users');
  let list = q ? users.filter(u => u.nick.toLowerCase().includes(q)) : users.slice();
  // сначала ники, которые начинаются с запроса, потом остальные; без запроса — новые сверху
  if (q) list.sort((a, b) =>
    (b.nick.toLowerCase().startsWith(q) - a.nick.toLowerCase().startsWith(q)) || a.nick.localeCompare(b.nick));
  else list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  res.json(list.slice(0, 24).map(catalogUser));
});

app.get('/api/media/:nick/:kind', (req, res) => {
  const kind = req.params.kind;
  if (kind !== 'avatar' && kind !== 'banner') return res.status(404).end();
  const nick = String(req.params.nick || '').toLowerCase();
  const u = db.read('users').find(x => x.nick.toLowerCase() === nick);
  const m = u && /^data:(image\/[a-z]+);base64,([A-Za-z0-9+/=]+)$/.exec(u[kind] || '');
  if (!m) return res.status(404).end();
  res.set({
    'Content-Type': m[1],
    'Cache-Control': 'public, max-age=31536000, immutable',
    'X-Content-Type-Options': 'nosniff'
  });
  res.send(Buffer.from(m[2], 'base64'));
});

app.get('/api/users/:nick', (req, res) => {
  const nick = String(req.params.nick || '').toLowerCase();
  const u = db.read('users').find(x => x.nick.toLowerCase() === nick);
  if (!u) return res.status(404).json({ error: 'Not found' });
  const mine = db.read('orders').filter(o => o.nick === u.nick);
  res.json({
    ...catalogUser(u),
    stats: {                                     // публичная статистика профиля
      orders: mine.length,
      done:   mine.filter(o => o.status === 'done').length,
      refs:   db.read('users').filter(x => x.referrer === u.nick).length
    }
  });
});

/* ── users list (админ, с балансом) ── */
app.get('/api/admin/users', requireAdmin, (req, res) => {
  const q = String(req.query.q || '').toLowerCase();
  const users = db.read('users');
  const list = q ? users.filter(u => u.nick.toLowerCase().includes(q)) : users;
  res.json(list.slice(0, 100).map(u => ({ nick: u.nick, avatar: mediaUrl(u, 'avatar'), balance: u.balance || 0, nickColor: u.nickColor || '', createdAt: u.createdAt })));
});

/* ── цвет ника (админ: любому пользователю и себе) ── */
app.patch('/api/admin/users/:nick/color', requireAdmin, (req, res) => {
  const color = String((req.body && req.body.color) || '').trim();
  if (color && !isColor(color)) return res.status(400).json({ error: 'Цвет в формате #RRGGBB' });
  const users = db.read('users');
  const u = users.find(x => x.nick === req.params.nick);
  if (!u) return res.status(404).json({ error: 'Not found' });
  u.nickColor = color.toLowerCase();
  db.write('users', users);
  modlog('user.color', `${u.nick}: ${color ? color.toLowerCase() : 'сброшен'}`, req);
  res.json(catalogUser(u));
});

/* ── invites (admin) ── */
app.get('/api/invites', requireAdmin, (req, res) => res.json(db.read('invites')));

app.post('/api/invites', requireAdmin, (req, res) => {
  const invites = db.read('invites');
  const code = 'kawaz-' + Math.random().toString(36).slice(2, 9).toUpperCase();
  const inv = { code, used: false, ts: Date.now() };
  invites.push(inv);
  db.write('invites', invites);
  modlog('invite.create', code, req);
  res.status(201).json(inv);
});

app.delete('/api/invites/:code', requireAdmin, (req, res) => {
  const invites = db.read('invites').filter(i => i.code !== req.params.code);
  db.write('invites', invites);
  modlog('invite.delete', req.params.code, req);
  res.json({ ok: true });
});

/* ── scripts ── */
app.get('/api/scripts', (req, res) => res.json(db.read('scripts')));

app.post('/api/scripts', requireAdmin, (req, res) => {
  const { name, tag, ver, desc, loadstring } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'name required' });
  const s = {
    id: 's' + db.uid(),
    name: name.trim().slice(0, 80),
    tag: (tag || 'СКРИПТ').trim().slice(0, 20),
    ver: (ver || 'v1.0').trim().slice(0, 20),
    desc: (desc || '').trim().slice(0, 200),
    loadstring: (loadstring || '').trim().slice(0, 1000)
  };
  const scripts = db.read('scripts');
  scripts.push(s);
  db.write('scripts', scripts);
  modlog('script.add', `${s.name} ${s.ver}`, req);
  res.status(201).json(s);
});

app.delete('/api/scripts/:id', requireAdmin, (req, res) => {
  const victim = db.read('scripts').find(s => s.id === req.params.id);
  db.write('scripts', db.read('scripts').filter(s => s.id !== req.params.id));
  if (victim) modlog('script.delete', victim.name, req);
  res.json({ ok: true });
});

/* ── orders ── */
const ORDER_STATUSES = ['pending', 'in_progress', 'done', 'rejected'];

app.get('/api/orders', requireAdmin, (req, res) => res.json(db.read('orders')));

/* свои заказы — видит только автор */
app.get('/api/orders/mine', requireSession, (req, res) => {
  const list = db.read('orders')
    .filter(o => o.nick === req.sessionNick)
    .sort((a, b) => (b.ts || 0) - (a.ts || 0))
    .slice(0, 30);
  res.json(list);
});

app.post('/api/orders', requireSession, (req, res) => {
  const { name, desc, budget } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'name required' });
  const b = parseInt(budget, 10);
  if (isNaN(b) || b < 15 || b > 50) return res.status(400).json({ error: 'budget 15..50' });

  const users = db.read('users');
  const user  = users.find(u => u.nick === req.sessionNick);
  if (!user) return res.status(404).json({ error: 'User not found' });
  if ((user.balance || 0) < b) return res.status(400).json({ error: 'Недостаточно баланса' });

  // деньги списываем через общий журнал: счёт и запись «за что» меняются вместе
  const id = db.uid();
  const paid = money.changeBalance(req.sessionNick, -b, { reason: 'order', ref: id, by: 'user' });
  if (!paid.ok) return res.status(400).json({ error: paid.error });

  const order = {
    id, nick: req.sessionNick,
    name: name.trim().slice(0, 80), desc: (desc || '').trim().slice(0, 500),
    budget: b, status: 'pending', refunded: false, ts: Date.now()
  };
  const orders = db.read('orders');
  orders.push(order);
  db.write('orders', orders);
  modlog('order.create', `${req.sessionNick} — ${order.name} (${b} ₽)`, req);
  res.status(201).json(order);
});

app.patch('/api/orders/:id', requireAdmin, (req, res) => {
  const orders = db.read('orders');
  const o = orders.find(x => x.id === req.params.id);
  if (!o) return res.status(404).json({ error: 'Not found' });

  const status = req.body && req.body.status;
  if (!status) return res.json(o);
  if (!ORDER_STATUSES.includes(status)) return res.status(400).json({ error: 'bad status' });
  if (o.status === 'rejected')
    return res.status(409).json({ error: 'Заказ уже отклонён и оплачен возвратом — создайте новый' });

  /* отклонён → деньги возвращаются на баланс заказчика (один раз) */
  if (status === 'rejected' && !o.refunded) {
    const back = money.changeBalance(o.nick, +o.budget, { reason: 'refund', ref: o.id, by: 'admin' });
    if (!back.ok) return res.status(400).json({ error: back.error || 'Не удалось вернуть деньги' });
    o.refunded = true;
  }

  o.status = status;
  db.write('orders', orders);
  modlog('order.' + status, `${o.nick} — ${o.name} (${o.budget} ₽)${o.refunded ? ', возврат выполнен' : ''}`, req);
  res.json(o);
});

/* ── история баланса (для самого пользователя) ── */
app.get('/api/transactions', requireSession, (req, res) => {
  res.json(money.history(req.sessionNick, 50));
});

/* ── balance (admin) ── */
app.patch('/api/users/:nick/balance', requireAdmin, (req, res) => {
  const amount = parseInt(req.body.amount, 10);
  if (isNaN(amount) || Math.abs(amount) > 100000) return res.status(400).json({ error: 'amount required' });

  const r = money.changeBalance(req.params.nick, amount, { reason: 'admin', by: 'admin' });
  if (!r.ok) return res.status(404).json({ error: r.error });

  modlog('balance.set', `${req.params.nick}: ${amount > 0 ? '+' : ''}${amount} ₽ (остаток ${r.balance})`, req);
  const { pass: _p, ...safe } = r.user;
  res.json(safe);
});

/* ── coder apps ── */
app.get('/api/coder-apps', requireAdmin, (req, res) => res.json(db.read('coderApps')));

app.post('/api/coder-apps', limit(5, 60000), (req, res) => {
  const { name, tg, age, help, years, projects, explain, photos } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'name required' });
  const app_ = {
    id: db.uid(), name: name.trim().slice(0, 80),
    tg: (tg || '').trim().slice(0, 50),
    age: (age || '').toString().slice(0, 5),
    help: (help || '').trim().slice(0, 500),
    years: (years || '').toString().slice(0, 5),
    projects: (projects || '').trim().slice(0, 500),
    explain: (explain || '').trim().slice(0, 500),
    photos: Array.isArray(photos)
      ? photos.filter(p => isImageUrl(p) && p.length <= MAX_PHOTO).slice(0, 5) : [],
    ts: Date.now()
  };
  const apps = db.read('coderApps');
  apps.push(app_);
  db.write('coderApps', apps);
  res.status(201).json(app_);
});

app.delete('/api/coder-apps/:id', requireAdmin, (req, res) => {
  const victim = db.read('coderApps').find(a => a.id === req.params.id);
  db.write('coderApps', db.read('coderApps').filter(a => a.id !== req.params.id));
  if (victim) modlog('coder.delete', victim.name, req);
  res.json({ ok: true });
});

/* ── feedback ── */
app.get('/api/feedback', requireAdmin, (req, res) => res.json(db.read('feedback')));

app.post('/api/feedback', limit(10, 60000), (req, res) => {
  const { type, text } = req.body;
  if (!text?.trim()) return res.status(400).json({ error: 'text required' });
  const allowed = ['problem', 'improve', 'add'];
  const item = {
    id: db.uid(),
    type: allowed.includes(type) ? type : 'problem',
    text: text.trim().slice(0, 2000),
    created_at: new Date().toISOString()
  };
  const items = db.read('feedback');
  items.unshift(item);
  db.write('feedback', items);
  res.status(201).json(item);
});

app.delete('/api/feedback/:id', requireAdmin, (req, res) => {
  const victim = db.read('feedback').find(i => i.id === req.params.id);
  db.write('feedback', db.read('feedback').filter(i => i.id !== req.params.id));
  if (victim) modlog('feedback.delete', victim.text.slice(0, 80), req);
  res.json({ ok: true });
});

/* ── news ── */
app.get('/api/news', (req, res) => res.json(db.read('news')));

app.post('/api/news', requireAdmin, (req, res) => {
  const { title, desc, added, improved } = req.body;
  if (!title?.trim()) return res.status(400).json({ error: 'title required' });
  const item = {
    id: db.uid(),
    title: title.trim().slice(0, 70),
    description: (desc || '').trim().slice(0, 140),
    added: (added || '').trim().slice(0, 140),
    improved: (improved || '').trim().slice(0, 140),
    created_at: new Date().toISOString()
  };
  const items = db.read('news');
  items.unshift(item);
  db.write('news', items);
  modlog('news.create', item.title, req);
  res.status(201).json(item);
});

app.delete('/api/news/:id', requireAdmin, (req, res) => {
  const victim = db.read('news').find(i => i.id === req.params.id);
  db.write('news', db.read('news').filter(i => i.id !== req.params.id));
  if (victim) modlog('news.delete', victim.title, req);
  res.json({ ok: true });
});

/* ── chat ── */
app.get('/api/chat', requireAdmin, (req, res) => res.json(db.read('chat')));

app.delete('/api/chat/:id', requireAdmin, (req, res) => {
  const before = db.read('chat');
  const victim = before.find(i => i.id === req.params.id);
  const after  = before.filter(i => i.id !== req.params.id);
  db.write('chat', after);
  broadcast({ type: 'delete', id: req.params.id });
  if (victim) modlog('chat.delete', `${victim.nick}: ${victim.text.slice(0, 90)}`, req);
  res.json({ ok: true });
});

/* ── журналы (админ): входы, действия, бэкапы ── */
app.get('/api/admin/logins', requireAdmin, (req, res) => res.json(db.read('logins').slice(0, 150)));
app.get('/api/admin/modlog', requireAdmin, (req, res) => res.json(db.read('modlog').slice(0, 150)));

/* ── ограничения в чате (баны/мьюты) ── */
app.get('/api/admin/mutes', requireAdmin, (req, res) => {
  const now = Date.now();
  res.json(db.read('mutes').filter(m => !m.until || m.until > now));
});

app.delete('/api/admin/mutes/:id', requireAdmin, (req, res) => {
  const list = db.read('mutes');
  const victim = list.find(m => m.id === req.params.id);
  if (!victim) return res.status(404).json({ error: 'Not found' });
  db.write('mutes', list.filter(m => m.id !== victim.id));
  modlog('chat.un' + victim.kind, `${victim.nick} (снято вручную)`, req);
  broadcastSystem(`✅ С ${victim.nick} снято ограничение`);
  res.json({ ok: true });
});

app.get('/api/admin/backups', requireAdmin, (req, res) => res.json(backup.list()));

/* скачать бэкап себе — на Render free диск эфемерный, копии стоит выгружать */
app.get('/api/admin/backups/:name', requireAdmin, (req, res) => {
  const file = backup.filePath(req.params.name);
  if (!file) return res.status(404).json({ error: 'Бэкап не найден' });
  res.download(file);
});

app.post('/api/admin/backups', requireAdmin, (req, res) => {
  try {
    const b = backup.create('manual');
    modlog('backup.create', `${b.name} (${Math.round(b.size / 1024)} КБ)`, req);
    res.status(201).json(b);
  } catch (e) { res.status(500).json({ error: 'Не удалось создать бэкап: ' + e.message }); }
});

app.post('/api/admin/backups/restore', requireAdmin, (req, res) => {
  try {
    const name = req.body && req.body.name;
    // перед восстановлением страховочная копия текущего состояния
    backup.create('manual');
    const keys = backup.restore(name);
    modlog('backup.restore', `${name} → ${keys.length} набор(ов)`, req);
    res.json({ ok: true, keys });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

/* ── статус (админ) ── */
app.get('/api/admin/status', requireAdmin, (req, res) => {
  const count = key => { const v = db.read(key); return Array.isArray(v) ? v.length : Object.keys(v).length; };
  res.json({
    storage: db.backend(),
    uptimeSec: Math.round(process.uptime()),
    online: clients.size,
    users: count('users'),
    orders: count('orders'),
    tx: count('transactions'),
    backups: backup.list().length
  });
});

/* ── ping ── */
app.get('/ping', (req, res) => res.json({ ok: true, ts: Date.now() }));

/* ── fallback ── */
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

app.get('*', (req, res) => res.sendFile(path.join(ROOT, 'index.html')));

/* ── ошибки (битый JSON, слишком большое тело) — всегда JSON, а не HTML ── */
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Файл слишком большой' });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Некорректный запрос' });
  console.error(err);
  res.status(500).json({ error: 'Ошибка сервера' });
});

server.listen(PORT, () => {
  console.log(`🚀 http://localhost:${PORT}`);
  require('./keepalive')();   // самопинг, чтобы Render не усыплял сервер
  backup.start();             // снимок данных + автобэкапы каждые 15 минут
  const SITE_URL = process.env.SITE_URL;
  if (SITE_URL) {
    setInterval(() => {
      fetch(`${SITE_URL}/ping`)
        .then(() => console.log('🏓 ping ok'))
        .catch(e => console.warn('⚠️ ping fail:', e.message));
    }, 10 * 60 * 1000);
  }
});
