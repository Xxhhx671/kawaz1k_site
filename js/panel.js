/* ============================================================
   kawaz1k.win — панель: жалобы, новости, частный вход
   Данные хранятся в PostgreSQL через REST API.
   ============================================================ */

(() => {
  'use strict';

  const INVITE_KEY = 'kawaz_invite';
  const t = k => (window.KawazI18n ? window.KawazI18n.t(k) : k);
  const lang = () => (window.KawazI18n ? window.KawazI18n.lang : 'ru');

  /* ---------- инвайт-код в памяти сессии ---------- */
  let inviteCode = sessionStorage.getItem(INVITE_KEY) || '';
  const isAdmin = () => !!inviteCode;

  /* ---------- API helper ---------- */
  async function api(method, path, body) {
    const opts = {
      method,
      headers: { 'Content-Type': 'application/json' }
    };
    if (inviteCode) opts.headers['x-invite-code'] = inviteCode;
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(path, opts);
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  }

  /* ---------- тост ---------- */
  let toastTimer;
  const toast = msg => {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      el.classList.remove('show');
      el.textContent = t('toast');
    }, 2400);
  };

  /* ---------- модалки ---------- */
  let lastFocus = null;
  const openModal = id => {
    const m = typeof id === 'string' ? document.getElementById(id) : id;
    if (!m) return;
    lastFocus = document.activeElement;
    m.classList.add('open');
    m.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');
    const focusable = m.querySelector('textarea, input, button:not(.modal__close)');
    setTimeout(() => focusable && focusable.focus({ preventScroll: true }), 350);
  };
  const closeModal = m => {
    m.classList.remove('open');
    m.setAttribute('aria-hidden', 'true');
    if (!document.querySelector('.modal.open')) document.body.classList.remove('modal-open');
    if (lastFocus) { try { lastFocus.focus({ preventScroll: true }); } catch (e) {} }
  };

  document.addEventListener('click', e => {
    const opener = e.target.closest('[data-open]');
    if (opener) { openModal(opener.dataset.open); return; }
    const closer = e.target.closest('[data-close]');
    if (closer) { const m = closer.closest('.modal'); if (m) closeModal(m); }
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') document.querySelectorAll('.modal.open').forEach(closeModal);
  });

  /* ---------- жалобы / идеи ---------- */
  const fbText = document.getElementById('fbText');
  const fbError = document.getElementById('fbError');
  const fbChips = document.getElementById('fbChips');
  let fbType = 'problem';

  fbChips?.addEventListener('click', e => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    fbChips.querySelectorAll('.chip').forEach(c => c.classList.remove('is-active'));
    chip.classList.add('is-active');
    fbType = chip.dataset.type;
  });

  document.getElementById('fbSend')?.addEventListener('click', async () => {
    const text = (fbText.value || '').trim();
    if (!text) {
      fbError.classList.add('show', 'shake');
      fbText.classList.add('shake');
      setTimeout(() => { fbError.classList.remove('shake'); fbText.classList.remove('shake'); }, 500);
      fbText.focus();
      return;
    }
    try {
      await api('POST', '/api/feedback', { type: fbType, text });
      fbText.value = '';
      fbError.classList.remove('show');
      closeModal(document.getElementById('modalComplaint'));
      toast(t('fb.thanks'));
      if (isAdmin()) { await renderFb(); updateStat(); }
    } catch (e) {
      toast('Ошибка отправки');
    }
  });

  /* ---------- список жалоб (админ) ---------- */
  const fbList = document.getElementById('fbList');
  const typeLabel = type =>
    type === 'improve' ? t('fb.improve') : type === 'add' ? t('fb.add') : t('fb.problem');
  const fmtDate = ts =>
    new Date(ts).toLocaleDateString(lang() === 'ru' ? 'ru-RU' : 'en-US',
      { day: '2-digit', month: 'short', year: 'numeric' });

  const escapeHtml = s => String(s).replace(/[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  let fbCache = [];

  async function renderFb() {
    if (!fbList) return;
    try {
      fbCache = await api('GET', '/api/feedback');
    } catch (e) {
      fbCache = [];
    }
    if (!fbCache.length) {
      fbList.innerHTML = `<p class="admin__empty">${escapeHtml(t('private.empty'))}</p>`;
      return;
    }
    fbList.innerHTML = fbCache.map(it => `
      <article class="fb-item fb-item--${escapeHtml(it.type)}">
        <div class="fb-item__top">
          <span class="fb-item__type">${escapeHtml(typeLabel(it.type))}</span>
          <span class="fb-item__date">${escapeHtml(fmtDate(it.created_at))}</span>
          <button class="fb-item__del" data-del-fb="${it.id}" aria-label="Delete">&times;</button>
        </div>
        <p class="fb-item__text">${escapeHtml(it.text)}</p>
      </article>`).join('');
  }

  fbList?.addEventListener('click', async e => {
    const btn = e.target.closest('[data-del-fb]');
    if (!btn) return;
    try {
      await api('DELETE', `/api/feedback/${btn.dataset.delFb}`);
      await renderFb();
      updateStat();
    } catch (e) {
      toast('Ошибка удаления');
    }
  });

  /* ---------- новости ---------- */
  const newsList = document.getElementById('newsList');
  let newsCache = [];

  async function renderNews() {
    if (!newsList) return;
    try {
      newsCache = await api('GET', '/api/news');
    } catch (e) {
      newsCache = [];
    }
    if (!newsCache.length) {
      newsList.innerHTML = `<p class="news-hint">${escapeHtml(t('news.empty'))}</p>`;
      return;
    }
    newsList.innerHTML = newsCache.map(it => `
      <article class="news-item">
        <div class="news-item__head">
          <span class="news-item__date">${escapeHtml(fmtDate(it.created_at))}</span>
          ${isAdmin() ? `<button class="news-item__del" data-del-news="${it.id}" aria-label="${escapeHtml(t('news.delete'))}">&times;</button>` : ''}
        </div>
        <h4 class="news-item__title">${escapeHtml(it.title)}</h4>
        ${it.description ? `<p class="news-item__desc">${escapeHtml(it.description)}</p>` : ''}
        <ul class="news-item__meta">
          ${it.added ? `<li><span class="nm-key">+</span> <b>${escapeHtml(t('news.added'))}:</b> ${escapeHtml(it.added)}</li>` : ''}
          ${it.improved ? `<li><span class="nm-key">&uarr;</span> <b>${escapeHtml(t('news.improved'))}:</b> ${escapeHtml(it.improved)}</li>` : ''}
        </ul>
      </article>`).join('');
  }

  newsList?.addEventListener('click', async e => {
    const btn = e.target.closest('[data-del-news]');
    if (!btn) return;
    try {
      await api('DELETE', `/api/news/${btn.dataset.delNews}`);
      await renderNews();
      updateStat();
    } catch (e) {
      toast('Ошибка удаления');
    }
  });

  /* ---------- публикация новости (админ) ---------- */
  document.getElementById('newsForm')?.addEventListener('submit', async e => {
    e.preventDefault();
    const title = document.getElementById('nfTitle').value.trim();
    if (!title) return;
    try {
      await api('POST', '/api/news', {
        title,
        desc: document.getElementById('nfDesc').value.trim(),
        added: document.getElementById('nfAdded').value.trim(),
        improved: document.getElementById('nfImproved').value.trim()
      });
      e.target.reset();
      await renderNews();
      updateStat();
      toast(t('fb.thanks'));
    } catch (e) {
      toast('Ошибка публикации');
    }
  });

  /* ---------- частный вход ---------- */
  const gate = document.getElementById('gate');
  const admin = document.getElementById('admin');
  const gateMsg = document.getElementById('gateMsg');
  const inviteInput = document.getElementById('inviteInput');

  const showAdmin = async () => {
    gate.hidden = true;
    admin.hidden = false;
    await renderFb();
    await renderNews();
    updateStat();
  };
  const showGate = () => {
    admin.hidden = true;
    gate.hidden = false;
    gateMsg.textContent = '';
    gateMsg.className = 'gate__msg';
  };

  const updateStat = () => {
    const el = document.getElementById('adminStat');
    if (!el) return;
    el.textContent = t('private.stat')
      .replace('{n}', fbCache.length)
      .replace('{m}', newsCache.length);
  };

  document.getElementById('gateForm')?.addEventListener('submit', async e => {
    e.preventDefault();
    const code = (inviteInput.value || '').trim();
    try {
      await api('POST', '/api/auth', { code });
      inviteCode = code;
      sessionStorage.setItem(INVITE_KEY, code);
      gateMsg.textContent = t('private.ok');
      gateMsg.className = 'gate__msg ok';
      gate.classList.add('shake-ok');
      setTimeout(async () => { gate.classList.remove('shake-ok'); await showAdmin(); }, 750);
    } catch {
      inviteCode = '';
      sessionStorage.removeItem(INVITE_KEY);
      gateMsg.textContent = t('private.wrong');
      gateMsg.className = 'gate__msg err';
      gate.classList.add('shake');
      inviteInput.value = '';
      inviteInput.focus();
      setTimeout(() => gate.classList.remove('shake'), 550);
    }
  });

  document.getElementById('logoutBtn')?.addEventListener('click', () => {
    inviteCode = '';
    sessionStorage.removeItem(INVITE_KEY);
    showGate();
    renderNews();
  });

  /* ---------- перерисовка при смене языка ---------- */
  if (window.KawazI18n) {
    window.KawazI18n.onChange(() => {
      renderNews();
      if (isAdmin()) renderFb();
      updateStat();
      if (gateMsg.textContent) {
        if (gateMsg.classList.contains('err')) gateMsg.textContent = t('private.wrong');
        if (gateMsg.classList.contains('ok')) gateMsg.textContent = t('private.ok');
      }
    });
  }

  /* ---------- старт ---------- */
  renderNews();
  if (inviteCode) showAdmin(); else showGate();
})();
