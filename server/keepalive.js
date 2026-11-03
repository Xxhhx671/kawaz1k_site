/* ============================================================
   keepalive.js — сервер сам пингует свой публичный адрес,
   чтобы Render (free) не усыплял его после 15 минут тишины.

   Адрес берётся автоматически:
     1) SITE_URL (если задан в Environment)
     2) RENDER_EXTERNAL_URL (Render выставляет сам)
     3) FALLBACK_URL ниже (твой адрес, если первых двух нет)
   Пинг каждые 4 минуты на /ping.
   ============================================================ */
const FALLBACK_URL = 'https://kawaz1k-site-1.onrender.com';
const EVERY_MS = Number(process.env.KEEPALIVE_MS) || 4 * 60 * 1000;

module.exports = function startKeepAlive() {
  const base = (process.env.SITE_URL || process.env.RENDER_EXTERNAL_URL || FALLBACK_URL).trim().replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(base)) {
    console.warn('⚠️ keepalive: нет SITE_URL / RENDER_EXTERNAL_URL — самопинг выключен');
    return;
  }

  const ping = async () => {
    try {
      const res = await fetch(base + '/ping', { signal: AbortSignal.timeout(20000), cache: 'no-store' });
      console.log(`🏓 keepalive ${res.status} ${new Date().toISOString()}`);
    } catch (e) {
      console.warn('⚠️ keepalive fail:', e.message);
    }
  };

  console.log(`🏓 keepalive включён: ${base}/ping каждые ${Math.round(EVERY_MS / 1000)} с`);
  setTimeout(ping, 20000);          // первый пинг через 20 сек после старта
  setInterval(ping, EVERY_MS);
};
