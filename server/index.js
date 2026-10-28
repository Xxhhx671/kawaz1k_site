require('dotenv').config();
const express = require('express');
const path    = require('path');
const db      = require('./db');

const app    = express();
const PORT   = process.env.PORT || 3000;
const INVITE = process.env.INVITE_CODE || '18041804';

app.use(express.json());
app.use(express.static(path.join(__dirname, '..')));

db.init();
console.log('✅ JSON-хранилище готово');

/* ── проверка инвайт-кода ── */
function requireAdmin(req, res, next) {
  if (req.headers['x-invite-code'] !== INVITE)
    return res.status(401).json({ error: 'Unauthorized' });
  next();
}

/* ── auth ── */
app.post('/api/auth', (req, res) => {
  const { code } = req.body;
  code === INVITE ? res.json({ ok: true }) : res.status(401).json({ ok: false });
});

/* ── feedback ── */
app.get('/api/feedback', requireAdmin, (req, res) => {
  res.json(db.read('feedback'));
});

app.post('/api/feedback', (req, res) => {
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
  db.write('feedback', db.read('feedback').filter(i => i.id !== req.params.id));
  res.json({ ok: true });
});

/* ── news ── */
app.get('/api/news', (req, res) => {
  res.json(db.read('news'));
});

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
  res.status(201).json(item);
});

app.delete('/api/news/:id', requireAdmin, (req, res) => {
  db.write('news', db.read('news').filter(i => i.id !== req.params.id));
  res.json({ ok: true });
});

/* ── ping (keepalive для Render) ── */
app.get('/ping', (req, res) => res.json({ ok: true, ts: Date.now() }));

/* ── fallback ── */
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`🚀 http://localhost:${PORT}`);

  /* self-ping каждые 10 минут — не даёт Render засыпать */
  const SITE_URL = process.env.SITE_URL;
  if (SITE_URL) {
    setInterval(() => {
      fetch(`${SITE_URL}/ping`)
        .then(() => console.log('🏓 ping ok'))
        .catch(e => console.warn('⚠️ ping fail:', e.message));
    }, 10 * 60 * 1000); // каждые 10 минут
  }
});
