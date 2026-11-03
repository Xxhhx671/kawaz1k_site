/* ============================================================
   kawaz1k.win — auth, profiles, user search, order, coder app
   Данные хранятся на сервере (REST API).
   SESSION_ID сохраняется в localStorage только как ключ сессии —
   все реальные данные живут в JSON-файлах на сервере.
   ============================================================ */

(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const escH = s => String(s).replace(/[&<>\"']/g,
    c => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]));

  /* ── session ── */
  let SESSION_ID = localStorage.getItem('kawaz_sid') || '';
  let currentUser = null;

  const getSessionId = () => SESSION_ID;

  /* мост для других модулей (чат): ник аккаунта и ключ сессии.
     Геттеры — потому что isAdminNow объявляется ниже (иначе TDZ) */
  window.KawazAuth = {
    nick:       () => (currentUser && currentUser.nick) || '',
    sid:        getSessionId,
    isAdminNow: () => isAdminNow()
  };

  /* ── API helper ── */
  async function api(method, path, body) {
    const opts = { method, headers: { 'Content-Type': 'application/json' } };
    if (SESSION_ID) opts.headers['x-session-id'] = SESSION_ID;
    if (body !== undefined) opts.body = JSON.stringify(body);
    let res;
    try { res = await fetch(path, opts); }
    catch { throw new Error('Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.'); }
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const e = new Error(err.error || ('Ошибка ' + res.status));
      e.status = res.status;
      throw e;
    }
    return res.json();
  }

  const DEFAULT_AVATAR = nick =>
    `data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40'><rect width='40' height='40' rx='20' fill='%23111'/><text x='50%25' y='55%25' dominant-baseline='middle' text-anchor='middle' font-size='18' fill='%2300ff85' font-family='Arial'>${encodeURIComponent((nick || '?')[0].toUpperCase())}</text></svg>`;
  /* картинка профиля: либо data-URL (свой профиль), либо /api/media/... (списки) */
  const safeImg = v => (typeof v === 'string' &&
    (/^data:image\/(png|jpe?g|gif|webp);base64,[A-Za-z0-9+/=]+$/.test(v) || /^\/api\/media\/[^'"()\s]+$/.test(v))) ? v : '';
  const cssUrl = v => { const u = safeImg(v); return u ? `url('${u}')` : ''; };

  /* цвета ника (выбирает администратор) */
  const NICK_COLORS = ['#ffffff', '#ff4d6d', '#ff9f1c', '#ffd60a', '#00ff85', '#00e5ff', '#3a86ff', '#8338ec', '#ff5dcc', '#9aa0a6'];
  const isHex = c => /^#[0-9a-fA-F]{6}$/.test(c || '');
  const paintNick = (el, user) => {
    if (!el) return;
    el.textContent = user.nick;
    const on = isHex(user.nickColor);
    el.classList.toggle('nick-c', on);
    if (on) el.style.setProperty('--nc', user.nickColor); else el.style.removeProperty('--nc');
  };
  const nickHtml = u => `<span class="${isHex(u.nickColor) ? 'nick-c' : ''}"${isHex(u.nickColor) ? ` style="--nc:${u.nickColor}"` : ''}>${escH(u.nick)}</span>`;

  /* сжатие картинок в браузере (сервер принимает ограниченный размер) */
  const fileToDataUrl = f => new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = () => rej(new Error('Не удалось прочитать файл'));
    r.readAsDataURL(f);
  });
  async function compressImage(file, maxSide, quality, maxLen) {
    if (!file.type.startsWith('image/')) throw new Error('Выберите изображение');
    const src = await fileToDataUrl(file);
    if (file.type === 'image/gif') {                      // gif не пережимаем (анимация)
      if (src.length > maxLen) throw new Error('GIF слишком тяжёлый (максимум ~' + (Math.round(maxLen * 0.75 / 1e5) / 10) + ' МБ)');
      return src;
    }
    const img = await new Promise((res, rej) => {
      const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Не удалось открыть картинку')); i.src = src;
    });
    const k = Math.min(1, maxSide / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(img.width * k));
    c.height = Math.max(1, Math.round(img.height * k));
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    let q = quality, out = c.toDataURL('image/jpeg', q);
    while (out.length > maxLen && q > 0.3) { q -= 0.15; out = c.toDataURL('image/jpeg', q); }
    if (out.length > maxLen) throw new Error('Картинка слишком большая');
    return out;
  }

  /* ── toast ── */
  let toastTimer;
  const toast = msg => {
    const el = $('toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.classList.remove('show'); }, 2400);
  };

  /* ── modal helpers ── */
  let lastFocus = null;
  const openModal = id => {
    const m = $(id);
    if (!m) return;
    lastFocus = document.activeElement;
    m.classList.add('open');
    m.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');
    const f = m.querySelector('input:not([type=file]),textarea,button:not(.modal__close)');
    setTimeout(() => f && f.focus({ preventScroll: true }), 350);
  };
  const closeModal = m => {
    if (!m) return;
    m.classList.remove('open');
    m.setAttribute('aria-hidden', 'true');
    if (!document.querySelector('.modal.open')) document.body.classList.remove('modal-open');
    if (lastFocus) { try { lastFocus.focus({ preventScroll: true }); } catch(e){} }
  };
  const closeModalId = id => closeModal($(id));

  /* ── nav UI + личный кабинет ── */
  let cabDirty = false;           // пользователь что-то печатает в форме — не перезатираем
  const isAdminNow = () => !!sessionStorage.getItem('kawaz_invite');

  const fillCabinetForm = () => {
    if (!currentUser) return;
    $('cabNickInput').value = currentUser.nick;
    $('cabBioInput').value  = currentUser.bio || '';
    $('cabBioCount').textContent = ($('cabBioInput').value || '').length;
    cabDirty = false;
  };

  const renderColorCard = () => {
    const card = $('cabColorCard');
    if (!card) return;
    card.hidden = !(currentUser && isAdminNow());
    if (card.hidden) return;
    const cur = (currentUser.nickColor || '').toLowerCase();
    $('cabColorSwatches').innerHTML = NICK_COLORS.map(c =>
      `<button type="button" class="cab-sw${c === cur ? ' is-on' : ''}" style="--sw:${c}" data-color="${c}" aria-label="${c}"></button>`).join('');
    if (isHex(cur)) $('cabColorPicker').value = cur;
  };

  /* ── кабинет: заказы и история баланса ── */
  const ORDER_STATUS = {
    pending:     ['⌛ Ожидает',      'ord--wait'],
    in_progress: ['🔧 В работе',     'ord--work'],
    done:        ['✅ Выполнен',     'ord--done'],
    rejected:    ['↩️ Отклонён',     'ord--rej']
  };
  const ACTION_LABEL = {
    'balance.set':      'Изменение баланса',
    'order.create':     'Новый заказ',
    'order.pending':    'Заказ: ожидает',
    'order.in_progress':'Заказ: в работе',
    'order.done':       'Заказ выполнен',
    'order.rejected':   'Заказ отклонён (возврат)',
    'invite.create':    'Создан инвайт',
    'invite.delete':    'Удалён инвайт',
    'script.add':       'Добавлен скрипт',
    'script.delete':    'Удалён скрипт',
    'user.color':       'Цвет ника',
    'chat.delete':      'Сообщение чата удалено',
    'feedback.delete':  'Жалоба удалена',
    'news.create':      'Опубликована новость',
    'news.delete':      'Новость удалена',
    'coder.delete':     'Заявка кодера удалена',
    'backup.create':    'Создан бэкап',
    'backup.restore':   'Восстановление из бэкапа'
  };
  const ENTR_LABEL = { login: 'Вход', register: 'Регистрация', logout: 'Выход', admin: 'Частный вход' };

  const fmtTs = ts => {
    const d = new Date(ts);
    const day = d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
    return day + ' ' + d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  };

  let cabDataTs = 0;
  const TX_LABEL = {
    order:  'Оплата заказа',
    refund: 'Возврат за отклонённый заказ',
    admin:  'Пополнение администратором',
    manual: 'Корректировка баланса'
  };
  const loadCabData = async (force = false) => {
    if (!currentUser) return;
    const now = Date.now();
    if (!force && now - cabDataTs < 15000) return;      // не долбим сервер при каждой перерисовке
    cabDataTs = now;

    const ordersEl = $('myOrdersList');
    const txEl     = $('txList');

    if (ordersEl) {
      try {
        const orders = await api('GET', '/api/orders/mine');
        ordersEl.innerHTML = orders.length ? orders.map(o => {
          const st = ORDER_STATUS[o.status] || ORDER_STATUS.pending;
          return `
          <div class="cab-item">
            <div class="cab-item__top">
              <span class="cab-item__title">${escH(o.name)}</span>
              <span class="cab-item__amount">${o.budget} ₽</span>
            </div>
            <div class="cab-item__bottom">
              <span class="ord-pill ${st[1]}">${st[0]}</span>
              <span class="cab-item__date">${fmtTs(o.ts)}</span>
            </div>
            ${o.refunded ? '<span class="cab-item__note">Деньги возвращены на баланс</span>' : ''}
          </div>`;
        }).join('') : '<p class="cab-empty">Заказов пока нет — оформи их в разделе «Заказать скрипт».</p>';
      } catch {}
    }

    if (txEl) {
      try {
        const txs = await api('GET', '/api/transactions');
        txEl.innerHTML = txs.length ? txs.map(t => `
          <div class="cab-item">
            <div class="cab-item__top">
              <span class="cab-item__title">${escH(TX_LABEL[t.reason] || 'Операция')}</span>
              <span class="cab-item__amount ${t.amount < 0 ? 'is-neg' : 'is-pos'}">${t.amount > 0 ? '+' : ''}${t.amount} ₽</span>
            </div>
            <div class="cab-item__bottom">
              <span class="cab-item__date">${fmtTs(t.ts)} · остаток ${t.balance} ₽</span>
            </div>
          </div>`).join('') : '<p class="cab-empty">Операций пока не было.</p>';
      } catch {}
    }
  };

  const renderCabinet = () => {
    const u = currentUser;
    if ($('cabGuest')) $('cabGuest').hidden = !!u;
    if ($('cab')) $('cab').hidden = !u;
    if (!u) return;
    $('cabAvatar').src = u.avatar || DEFAULT_AVATAR(u.nick);
    $('cabBanner').style.backgroundImage = cssUrl(u.banner);
    paintNick($('cabNick'), u);
    $('cabBalance').textContent = u.balance || 0;
    $('cabBioView').textContent = u.bio || '';
    $('removeBannerBtn').hidden = !u.banner;
    $('removeAvatarBtn').hidden = !u.avatar;
    if (!cabDirty) fillCabinetForm();
    renderColorCard();

    /* реферальная ссылка и статистика приглашений */
    const refInput = $('refLinkInput');
    if (refInput) {
      const r = u.ref || {};
      refInput.value = r.code ? `${location.origin}/?ref=${r.code}` : '';
      const hint = $('refHint');
      if (hint) {
        hint.textContent = r.code
          ? `Приглашено участников: ${r.invited || 0} · заработано: ${r.earned || 0} ₽ ` +
            `(+${r.bonus || 0} ₽ пригласившему за каждого). Инвайт-код для регистрации всё равно нужен.`
          : 'Ссылка появится, когда профиль подгрузится с сервера.';
      }
    }

    loadCabData();                       // заказы + история баланса (не чаще раза в 15 сек)
  };

  const refreshNav = () => {
    const user = currentUser;
    const navAuth = $('navAuth');
    const navProfile = $('navProfile');

    if (user) {
      if (navAuth) navAuth.hidden = true;
      if (navProfile) {
        navProfile.hidden = false;
        paintNick($('navNick'), user);
        $('navBalanceNum').textContent = user.balance || 0;
        $('navAvatar').src = user.avatar || DEFAULT_AVATAR(user.nick);
      }
      const og = $('orderGate');
      const of = $('orderForm');
      if (og) og.hidden = true;
      if (of) {
        of.hidden = false;
        const obn = $('orderBalanceNum');
        if (obn) obn.textContent = user.balance || 0;
      }
    } else {
      if (navAuth) navAuth.hidden = false;
      if (navProfile) navProfile.hidden = true;
      const og = $('orderGate');
      const of = $('orderForm');
      if (og) og.hidden = false;
      if (of) of.hidden = true;
    }
    renderCabinet();
  };

  /* ── restore session on load ── */
  async function restoreSession() {
    if (!SESSION_ID) return;
    try {
      currentUser = await api('GET', '/api/user/me');
      refreshNav();
    } catch (e) {
      if (e.status === 401) {            // сессия протухла — выходим; при сетевой ошибке сессию не трогаем
        SESSION_ID = '';
        localStorage.removeItem('kawaz_sid');
      }
    }
  }

  /* ── ДРАВЕР (бургер): кабинет, меню, скрипты, кодер ── */
  const burger = $('burger');
  const drawer = $('mobDrawer');
  const drawerBack = $('mobDrawerBack');

  const setMobTab = tab => {
    document.querySelectorAll('.mob-tab').forEach(b =>
      b.classList.toggle('is-active', b.dataset.tab === tab));
    document.querySelectorAll('.mob-tab-panel').forEach(p =>
      p.classList.toggle('is-active', p.dataset.panel === tab));
    if (tab === 'cabinet') renderCabinet();      // подтянуть админ-блок цвета, если вход выполнен
  };

  const isDrawerOpen = () => !!drawer && drawer.classList.contains('open');

  const openDrawer = tab => {
    if (!drawer) return;
    setMobTab(typeof tab === 'string' ? tab : 'cabinet');
    drawer.classList.add('open');
    drawer.setAttribute('aria-hidden', 'false');
    document.body.classList.add('menu-open');
    if (burger) { burger.classList.add('open'); burger.setAttribute('aria-expanded', 'true'); }
  };
  const closeDrawer = () => {
    if (!drawer) return;
    drawer.classList.remove('open');
    drawer.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('menu-open');
    if (burger) { burger.classList.remove('open'); burger.setAttribute('aria-expanded', 'false'); }
  };

  burger && burger.addEventListener('click', () => (isDrawerOpen() ? closeDrawer() : openDrawer()));
  drawerBack && drawerBack.addEventListener('click', closeDrawer);
  $('mobDrawerClose')?.addEventListener('click', closeDrawer);
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && isDrawerOpen()) closeDrawer(); });
  $('navAvatarBtn')?.addEventListener('click', () => openDrawer('cabinet'));
  $('mobComplaintBtn')?.addEventListener('click', () => { closeDrawer(); openModal('modalComplaint'); });

  document.querySelectorAll('.mob-nav__link').forEach(a => a.addEventListener('click', closeDrawer));

  document.querySelectorAll('.mob-tab').forEach(btn => {
    btn.addEventListener('click', () => setMobTab(btn.dataset.tab));
  });

  document.querySelectorAll('.admin-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.atab;
      document.querySelectorAll('.admin-tab').forEach(b => b.classList.remove('is-active'));
      document.querySelectorAll('.admin-panel').forEach(p => p.classList.remove('is-active'));
      btn.classList.add('is-active');
      const panel = document.querySelector(`.admin-panel[data-apanel="${tab}"]`);
      if (panel) { panel.classList.add('is-active'); refreshAdminPanel(tab); }
    });
  });

  /* ── LOGIN ── */
  const clearErr = id => { const el = $(id); if (el) { el.textContent = ''; el.classList.remove('show'); } };

  /* реферальный код из ссылки ?ref=... — запоминаем и подставляем в регистрацию */
  const REF_KEY = 'kawaz_ref';
  try {
    const refParam = new URLSearchParams(location.search).get('ref');
    if (refParam && refParam.trim()) localStorage.setItem(REF_KEY, refParam.trim().slice(0, 20));
  } catch {}

  const openLoginModal = () => { clearErr('loginError'); openModal('modalLogin'); };
  const openRegModal   = () => {
    clearErr('regError');
    if ($('regRef')) $('regRef').value = localStorage.getItem(REF_KEY) || '';
    openModal('modalReg');
  };

  $('openLoginBtn')?.addEventListener('click', openLoginModal);
  $('openRegBtn')?.addEventListener('click', openRegModal);
  $('mobLoginBtn')?.addEventListener('click', () => { closeDrawer(); openLoginModal(); });
  $('mobRegBtn')?.addEventListener('click',   () => { closeDrawer(); openRegModal(); });
  $('orderLoginBtn')?.addEventListener('click', openLoginModal);
  $('toRegBtn')?.addEventListener('click', () => { closeModalId('modalLogin'); openRegModal(); });
  $('toLoginBtn')?.addEventListener('click', () => { closeModalId('modalReg'); openLoginModal(); });

  $('loginForm')?.addEventListener('submit', async e => {
    e.preventDefault();
    const nick = $('loginNick').value.trim();
    const pass = $('loginPass').value;
    const errEl = $('loginError');
    const showErr = msg => { if (errEl) { errEl.textContent = msg; errEl.classList.add('show'); } };
    const btn = e.target.querySelector('[type=submit]');
    clearErr('loginError');
    if (btn) btn.disabled = true;
    try {
      const data = await api('POST', '/api/user/login', { nick, pass });
      SESSION_ID = data.sessionId;
      currentUser = data.user;
      localStorage.setItem('kawaz_sid', SESSION_ID);
      e.target.reset();
      closeModalId('modalLogin');
      cabDirty = false;
      refreshNav();
      toast('Добро пожаловать, ' + data.user.nick + '!');
    } catch(err) {
      showErr(err.message || 'Неверный ник или пароль');
    } finally { if (btn) btn.disabled = false; }
  });

  /* ── REGISTER ── */
  $('regForm')?.addEventListener('submit', async e => {
    e.preventDefault();
    const nick    = $('regNick').value.trim();
    const pass    = $('regPass').value;
    const confirm = $('regPassConfirm').value;
    const invite  = $('regInvite').value.trim();
    const ref     = ($('regRef')?.value || '').trim();
    const errEl   = $('regError');
    const showErr = msg => { if (errEl) { errEl.textContent = msg; errEl.classList.add('show'); } };

    const btn = e.target.querySelector('[type=submit]');
    clearErr('regError');
    if (pass !== confirm) return showErr('Пароли не совпадают');
    if (nick.length < 2) return showErr('Ник слишком короткий');
    if (pass.length < 4) return showErr('Пароль: минимум 4 символа');

    if (btn) btn.disabled = true;
    try {
      const data = await api('POST', '/api/user/register', { nick, pass, invite, ref });
      SESSION_ID = data.sessionId;
      currentUser = data.user;
      localStorage.setItem('kawaz_sid', SESSION_ID);
      localStorage.removeItem(REF_KEY);
      if (/(\?|&)ref=/.test(location.search)) history.replaceState(null, '', location.pathname);
      e.target.reset();
      closeModalId('modalReg');
      refreshNav();
      toast('Аккаунт создан! Добро пожаловать, ' + data.user.nick);
    } catch(err) {
      showErr(err.message || 'Ошибка регистрации');
    } finally { if (btn) btn.disabled = false; }
  });

  /* ── LOGOUT ── */
  const doLogout = async () => {
    try { await api('POST', '/api/user/logout'); } catch {}
    SESSION_ID = '';
    currentUser = null;
    localStorage.removeItem('kawaz_sid');
    cabDirty = false;
    closeDrawer();
    refreshNav();
    toast('Вы вышли из аккаунта');
  };
  $('logoutUserBtn')?.addEventListener('click', doLogout);
  $('mobLogoutBtn')?.addEventListener('click', doLogout);

  /* ── КАБИНЕТ: картинки ── */
  const patchMe = async body => {
    currentUser = await api('PATCH', '/api/user/me', body);
    refreshNav();
    return currentUser;
  };

  $('avatarInput')?.addEventListener('change', async e => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const data = await compressImage(file, 256, 0.86, 600000);
      await patchMe({ avatar: data });
      toast('Аватар обновлён');
    } catch (err) { toast(err.message || 'Ошибка загрузки аватара'); }
  });

  $('bannerInput')?.addEventListener('change', async e => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const data = await compressImage(file, 1100, 0.82, 2000000);
      await patchMe({ banner: data });
      toast(file.type === 'image/gif' ? 'GIF-баннер установлен' : 'Баннер обновлён');
    } catch (err) { toast(err.message || 'Ошибка загрузки баннера'); }
  });

  $('removeBannerBtn')?.addEventListener('click', async () => {
    try { await patchMe({ banner: '' }); toast('Баннер убран'); } catch (err) { toast(err.message || 'Ошибка'); }
  });
  $('removeAvatarBtn')?.addEventListener('click', async () => {
    try { await patchMe({ avatar: '' }); toast('Аватар убран'); } catch (err) { toast(err.message || 'Ошибка'); }
  });

  /* ── КАБИНЕТ: ник, описание, пароль ── */
  $('cabBioInput')?.addEventListener('input', e => {
    cabDirty = true;
    $('cabBioCount').textContent = e.target.value.length;
  });
  $('cabNickInput')?.addEventListener('input', () => { cabDirty = true; });

  $('saveProfileBtn')?.addEventListener('click', async () => {
    if (!currentUser) return;
    const payload = { bio: $('cabBioInput').value || '' };
    const newNick = $('cabNickInput').value.trim();
    if (newNick && newNick !== currentUser.nick) payload.newNick = newNick;
    const btn = $('saveProfileBtn');
    btn.disabled = true;
    try {
      cabDirty = false;
      await patchMe(payload);
      fillCabinetForm();
      toast('Профиль сохранён');
    } catch (err) { cabDirty = true; toast(err.message || 'Ошибка сохранения'); }
    finally { btn.disabled = false; }
  });

  $('savePassBtn')?.addEventListener('click', async () => {
    if (!currentUser) return;
    const oldPass = $('oldPass').value;
    const newPass = $('newPass').value;
    if (!oldPass || !newPass) { toast('Введите старый и новый пароль'); return; }
    if (newPass.length < 4) { toast('Новый пароль: минимум 4 символа'); return; }
    try {
      await api('PATCH', '/api/user/me', { oldPass, newPass });
      toast('Пароль изменён');
      $('oldPass').value = ''; $('newPass').value = '';
    } catch (err) { toast(err.message || 'Ошибка'); }
  });

  /* ── КАБИНЕТ: реферальная ссылка ── */
  $('refCopyBtn')?.addEventListener('click', async () => {
    const input = $('refLinkInput');
    if (!input || !input.value) return;
    try {
      await navigator.clipboard.writeText(input.value);
      toast('Реферальная ссылка скопирована');
    } catch {
      input.select();
      toast('Скопируйте ссылку вручную (Ctrl+C)');
    }
  });

  /* ── КАБИНЕТ: цвет ника (только админ — себе) ── */
  const setMyColor = async color => {
    if (!currentUser) return;
    try {
      await adminApi('PATCH', `/api/admin/users/${encodeURIComponent(currentUser.nick)}/color`, { color });
      currentUser = await api('GET', '/api/user/me');
      refreshNav();
      toast(color ? 'Цвет ника изменён' : 'Цвет ника сброшен');
    } catch (err) { toast(err.message || 'Нужен вход в частный вход'); }
  };
  $('cabColorSwatches')?.addEventListener('click', e => {
    const b = e.target.closest('[data-color]');
    if (b) setMyColor(b.dataset.color);
  });
  $('cabColorApply')?.addEventListener('click', () => setMyColor($('cabColorPicker').value));
  $('cabColorReset')?.addEventListener('click', () => setMyColor(''));

  /* ── ПОИСК ИГРОКОВ (иконка в шапке) ── */
  const sxInput = $('userSearchInput');
  const sxClear = $('userSearchClear');
  const sxBox   = $('userResults');
  let sxTimer = 0, sxSeq = 0;

  const renderUserResults = users => {
    if (!sxBox) return;
    if (!users.length) {
      sxBox.innerHTML = '<div class="sx-empty">Никого не найдено</div>';
      return;
    }
    sxBox.innerHTML = users.map((u, i) => `
      <button type="button" class="sx-card" data-nick="${escH(u.nick)}" style="animation-delay:${Math.min(i, 10) * 0.04}s">
        <div class="sx-card__cover"${u.banner ? ` style="background-image:${cssUrl(u.banner)}"` : ''}></div>
        <img class="sx-card__avatar" src="${escH(safeImg(u.avatar) || DEFAULT_AVATAR(u.nick))}" alt="" loading="lazy">
        <div class="sx-card__body">
          <div class="sx-card__nick">${nickHtml(u)}</div>
          <div class="sx-card__bio">${escH(u.bio || 'Нет описания')}</div>
        </div>
      </button>`).join('');
  };

  const runSearch = async q => {
    const seq = ++sxSeq;
    if (sxBox && !sxBox.children.length) sxBox.innerHTML = '<div class="sx-skel"></div>'.repeat(4);
    try {
      const users = await api('GET', `/api/users${q ? '?q=' + encodeURIComponent(q) : ''}`);
      if (seq === sxSeq) renderUserResults(users);
    } catch (err) {
      if (seq === sxSeq && sxBox) sxBox.innerHTML = `<div class="sx-empty">${escH(err.message || 'Ошибка поиска')}</div>`;
    }
  };

  const openSearch = () => {
    closeDrawer();
    if (sxInput) sxInput.value = '';
    if (sxClear) sxClear.hidden = true;
    if (sxBox) sxBox.innerHTML = '';
    openModal('modalSearch');
    runSearch('');
  };
  $('searchBtn')?.addEventListener('click', openSearch);
  $('mobSearchBtn')?.addEventListener('click', openSearch);

  sxInput?.addEventListener('input', () => {
    const q = sxInput.value.trim();
    if (sxClear) sxClear.hidden = !sxInput.value;
    clearTimeout(sxTimer);
    sxTimer = setTimeout(() => runSearch(q), 220);
  });
  sxClear?.addEventListener('click', () => {
    sxInput.value = ''; sxClear.hidden = true; sxInput.focus(); runSearch('');
  });
  sxBox?.addEventListener('click', e => {
    const card = e.target.closest('.sx-card');
    if (card) openPublicProfile(card.dataset.nick);
  });

  /* ── ПУБЛИЧНЫЙ ПРОФИЛЬ (есть и своя ссылка /u/ник) ── */
  const PROFILE_RE = /^\/u\/(.+)$/;
  let pubCurrentNick = '';

  const openPublicProfile = async (nick, fromRoute = false) => {
    try {
      const u = await api('GET', `/api/users/${encodeURIComponent(nick)}`);
      pubCurrentNick = u.nick;
      paintNick($('pubNick'), u);
      $('pubBio').textContent = u.bio || 'Пока без описания';
      $('pubBio').style.opacity = u.bio ? '1' : '.55';
      $('pubAvatar').src = safeImg(u.avatar) || DEFAULT_AVATAR(u.nick);
      $('pubBanner').style.backgroundImage = cssUrl(u.banner);
      $('pubSince').textContent = u.createdAt
        ? 'На сайте с ' + new Date(u.createdAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })
        : '';

      const s = u.stats || {};
      const cells = [
        s.orders ? `<span class="pub-stat"><b>${escH(String(s.orders))}</b>заказов</span>` : '',
        s.done   ? `<span class="pub-stat"><b>${escH(String(s.done))}</b>выполнено</span>` : '',
        s.refs   ? `<span class="pub-stat"><b>${escH(String(s.refs))}</b>приглашено</span>` : ''
      ].join('');
      $('pubStats').innerHTML = cells || '<span class="pub-stat pub-stat--empty">Профиль без заказов</span>';

      if (!fromRoute) history.replaceState(null, '', '/u/' + encodeURIComponent(u.nick));
      openModal('modalPublicProfile');
    } catch (err) {
      toast(err.message || 'Профиль не найден');
      if (fromRoute && PROFILE_RE.test(location.pathname)) history.replaceState(null, '', '/');
    }
  };

  const closeProfileUrl = () => {
    if (PROFILE_RE.test(location.pathname)) history.replaceState(null, '', '/');
  };

  /* capture=true — срабатываем ДО обработчика закрытия в panel.js, пока модалка ещё открыта */
  document.addEventListener('click', e => {
    if (!e.target.closest('[data-close]')) return;
    if ($('modalPublicProfile')?.classList.contains('open')) closeProfileUrl();
  }, true);
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && $('modalPublicProfile')?.classList.contains('open')) closeProfileUrl();
  }, true);

  window.addEventListener('popstate', () => {
    const m = PROFILE_RE.exec(location.pathname);
    if (m) openPublicProfile(decodeURIComponent(m[1]).slice(0, 24), true);
    else if ($('modalPublicProfile')?.classList.contains('open')) closeModalId('modalPublicProfile');
  });

  $('pubShareBtn')?.addEventListener('click', async () => {
    if (!pubCurrentNick) return;
    const url = location.origin + '/u/' + encodeURIComponent(pubCurrentNick);
    try { await navigator.clipboard.writeText(url); toast('Ссылка на профиль скопирована'); }
    catch { toast(url); }
  });

  /* ── ORDER SCRIPT ── */
  $('orderForm')?.addEventListener('submit', async e => {
    e.preventDefault();
    if (!currentUser) return;
    const name   = $('orderName').value.trim();
    const desc   = $('orderDesc').value.trim();
    const budget = parseInt($('orderBudget').value, 10);

    if (budget < 15 || budget > 50) { toast('Бюджет должен быть от 15 до 50 ₽'); return; }
    if ((currentUser.balance || 0) < budget) { toast('Недостаточно баланса. Пополните через администратора.'); return; }

    try {
      await api('POST', '/api/orders', { name, desc, budget });
      // refresh balance from server
      currentUser = await api('GET', '/api/user/me');
      refreshNav();
      $('orderForm').reset();
      loadCabData(true);
      toast('Заявка на скрипт отправлена! Списано ' + budget + ' ₽');
    } catch(err) { toast(err.message || 'Ошибка'); }
  });

  /* ── CODER APPLICATION ── */
  window.coderNext = step => {
    const cur = document.querySelector(`.coder-form__step[data-step="${step}"]`);
    if (!cur) return;
    const req = cur.querySelectorAll('[required]');
    let ok = true;
    req.forEach(f => { if (!f.value.trim()) { f.classList.add('shake'); setTimeout(() => f.classList.remove('shake'), 500); ok = false; } });
    if (!ok) return;
    cur.hidden = true;
    const next = document.querySelector(`.coder-form__step[data-step="${step+1}"]`);
    if (next) { next.hidden = false; next.style.animation = 'cardPop .35s ease'; }
  };
  window.coderPrev = step => {
    const cur = document.querySelector(`.coder-form__step[data-step="${step}"]`);
    if (cur) cur.hidden = true;
    const prev = document.querySelector(`.coder-form__step[data-step="${step-1}"]`);
    if (prev) { prev.hidden = false; prev.style.animation = 'cardPop .35s ease'; }
  };

  $('cf_photos')?.addEventListener('change', e => {
    const preview = $('cf_photos_preview');
    if (!preview) return;
    preview.innerHTML = '';
    [...e.target.files].forEach(f => {
      const reader = new FileReader();
      reader.onload = ev => {
        const img = document.createElement('img');
        img.src = ev.target.result;
        preview.appendChild(img);
      };
      reader.readAsDataURL(f);
    });
  });

  $('coderForm')?.addEventListener('submit', async e => {
    e.preventDefault();
    const files = $('cf_photos')?.files || [];
    const btn = e.target.querySelector('[type=submit]');
    if (btn) btn.disabled = true;
    try {
      const photos = [];
      for (const f of [...files].slice(0, 5))
        photos.push(await compressImage(f, 900, 0.8, 600000));

      await api('POST', '/api/coder-apps', {
        name:     $('cf_name').value.trim(),
        tg:       $('cf_tg').value.trim(),
        age:      $('cf_age').value,
        help:     $('cf_help').value.trim(),
        years:    $('cf_years').value,
        projects: $('cf_projects').value.trim(),
        explain:  $('cf_explain').value.trim(),
        photos
      });
      $('coderForm').hidden = true;
      $('coderSuccess').hidden = false;
    } catch(err) { toast(err.message || 'Ошибка отправки'); }
    finally { if (btn) btn.disabled = false; }
  });

  $('openCoderBtn')?.addEventListener('click', () => { closeDrawer(); openModal('modalCoder'); });

  /* ── SCRIPTS section ── */
  const renderScripts = async () => {
    const list = $('scriptsList');
    if (!list) return;
    let scripts;
    try { scripts = await api('GET', '/api/scripts'); } catch { return; }   // при ошибке остаётся статичная версия из HTML

    const bindCopy = container => {
      container.querySelectorAll('[data-copy]').forEach(btn => {
        btn.addEventListener('click', async () => {
          const text = btn.dataset.copy;
          try { await navigator.clipboard.writeText(text); } catch {
            const ta = document.createElement('textarea'); ta.value = text;
            document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove();
          }
          btn.classList.add('copied');
          toast('Скопировано');
          setTimeout(() => btn.classList.remove('copied'), 1800);
        });
      });
    };

    list.innerHTML = scripts.map((s, i) => `
      <article class="script reveal in script-card-animated" style="animation-delay:${i*0.1}s">
        <div class="script__top">
          <span class="script__tag">${escH(s.tag || 'СКРИПТ')}</span>
          <span class="script__ver">${escH(s.ver || 'v1.0')}</span>
        </div>
        <h3>${escH(s.name)}</h3>
        <p>${escH(s.desc || '')}</p>
        <div class="script__meta"><span>lua 5.1</span><span>● стабильно</span></div>
        <button class="btn-copy btn-copy--block" data-copy="${escH(s.loadstring)}">
          <span class="btn-copy__idle">Копировать скрипт</span>
          <span class="btn-copy__done">Скопировано</span>
        </button>
      </article>`).join('');
    bindCopy(list);

    const mob = $('mobScriptsList');
    if (mob) {
      mob.innerHTML = scripts.map((s, i) => `
        <div class="mob-script-card" style="animation-delay:${i*0.08}s">
          <div class="mob-script-card__top">
            <span class="script__tag">${escH(s.tag || 'СКРИПТ')}</span>
            <span class="script__ver">${escH(s.ver || 'v1.0')}</span>
          </div>
          <h4>${escH(s.name)}</h4>
          <p>${escH(s.desc || '')}</p>
          <button class="btn-copy btn-copy--block" data-copy="${escH(s.loadstring)}">
            <span class="btn-copy__idle">Копировать</span>
            <span class="btn-copy__done">Скопировано</span>
          </button>
        </div>`).join('');
      bindCopy(mob);
    }
  };

  /* ── ADMIN panel ── */
  const refreshAdminPanel = tab => {
    if (tab === 'scripts')   renderAdminScripts();
    if (tab === 'invites')   renderAdminInvites();
    if (tab === 'users')     renderAdminUsers();
    if (tab === 'orders')    renderAdminOrders();
    if (tab === 'coder-apps') renderAdminCoderApps();
    if (tab === 'chat')      renderAdminChat();
    if (tab === 'journal')   renderAdminJournal();
  };

  // admin invite code comes from panel.js (sessionStorage) — reuse it via header
  const getAdminHeaders = () => {
    const code = sessionStorage.getItem('kawaz_invite') || '';
    return code ? { 'x-invite-code': code } : {};
  };

  const adminApi = async (method, path_, body) => {
    const code = sessionStorage.getItem('kawaz_invite') || '';
    const opts = { method, headers: { 'Content-Type': 'application/json', 'x-invite-code': code } };
    if (body !== undefined) opts.body = JSON.stringify(body);
    const res = await fetch(path_, opts);
    if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || res.statusText); }
    return res.json();
  };

  const renderAdminScripts = async () => {
    const list = $('scriptsAdminList');
    if (!list) return;
    let scripts = [];
    try { scripts = await api('GET', '/api/scripts'); } catch {}
    list.innerHTML = scripts.map(s => `
      <div class="invite-item">
        <span class="invite-code">${escH(s.name)}</span>
        <button class="fb-item__del" data-del-script="${escH(s.id)}">&times;</button>
      </div>`).join('') || '<p class="admin__empty">Скриптов нет</p>';
    list.querySelectorAll('[data-del-script]').forEach(btn => {
      btn.addEventListener('click', async () => {
        try { await adminApi('DELETE', `/api/scripts/${btn.dataset.delScript}`); }
        catch(e) { toast(e.message); return; }
        await renderAdminScripts();
        await renderScripts();
        toast('Скрипт удалён');
      });
    });
  };

  $('addScriptForm')?.addEventListener('submit', async e => {
    e.preventDefault();
    try {
      await adminApi('POST', '/api/scripts', {
        name: $('sfName').value.trim(),
        tag:  $('sfTag').value.trim() || 'СКРИПТ',
        ver:  $('sfVer').value.trim() || 'v1.0',
        desc: $('sfDesc').value.trim(),
        loadstring: $('sfLoadstring').value.trim()
      });
      e.target.reset();
      await renderAdminScripts();
      await renderScripts();
      toast('Скрипт добавлен!');
    } catch(err) { toast(err.message || 'Ошибка'); }
  });

  const renderAdminInvites = async () => {
    const list = $('inviteList');
    if (!list) return;
    let invites = [];
    try { invites = await adminApi('GET', '/api/invites'); } catch {}
    list.innerHTML = invites.map(inv => `
      <div class="invite-item">
        <span class="invite-code">${escH(inv.code)}</span>
        <span class="invite-used">${inv.used ? '✅ использован' : '⌛ не использован'}</span>
        <button class="fb-item__del" data-del-invite="${escH(inv.code)}">&times;</button>
      </div>`).join('') || '<p class="admin__empty">Инвайтов нет</p>';
    list.querySelectorAll('[data-del-invite]').forEach(btn => {
      btn.addEventListener('click', async () => {
        try { await adminApi('DELETE', `/api/invites/${btn.dataset.delInvite}`); } catch {}
        await renderAdminInvites();
      });
    });
  };

  $('genInviteBtn')?.addEventListener('click', async () => {
    try {
      const inv = await adminApi('POST', '/api/invites');
      await renderAdminInvites();
      toast('Инвайт создан: ' + inv.code);
    } catch(err) { toast(err.message || 'Ошибка'); }
  });

  const renderAdminUsers = async (filter = '') => {
    const list = $('userAdminList');
    if (!list) return;
    let users = [];
    try { users = await adminApi('GET', `/api/admin/users${filter ? '?q=' + encodeURIComponent(filter) : ''}`); }
    catch (e) { toast(e.message || 'Ошибка'); }
    list.innerHTML = users.map(u => `
      <div class="user-admin-item">
        <div class="ua-main">
          <img src="${escH(safeImg(u.avatar) || DEFAULT_AVATAR(u.nick))}" alt="">
          <div>
            <div class="user-admin-item__nick">${nickHtml(u)}</div>
            <div class="user-admin-item__balance">${u.balance || 0} ₽</div>
          </div>
        </div>
        <div class="balance-add-form">
          <input class="field" type="number" min="1" max="9999" placeholder="+ ₽" data-add-balance="${escH(u.nick)}" style="width:70px">
          <button class="btn btn--primary btn--sm" data-confirm-add="${escH(u.nick)}">+</button>
        </div>
        <div class="ua-colors" data-nick="${escH(u.nick)}">
          ${NICK_COLORS.map(c => `<button type="button" class="cab-sw${c === (u.nickColor || '').toLowerCase() ? ' is-on' : ''}" style="--sw:${c}" data-set-color="${c}" aria-label="${c}"></button>`).join('')}
          <input class="ua-pick" type="color" value="${isHex(u.nickColor) ? u.nickColor : '#ffffff'}" aria-label="Свой цвет">
          <button type="button" class="cab-chip ua-reset" data-set-color="__custom">Свой</button>
          <button type="button" class="cab-chip ua-reset" data-set-color="">Сброс</button>
        </div>
      </div>`).join('') || '<p class="admin__empty">Пусто</p>';

    list.querySelectorAll('[data-confirm-add]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const nick = btn.dataset.confirmAdd;
        const inp  = btn.closest('.balance-add-form')?.querySelector('input');
        const amount = parseInt(inp?.value, 10);
        if (!amount || amount < 1) return;
        try {
          await adminApi('PATCH', `/api/users/${encodeURIComponent(nick)}/balance`, { amount });
          if (currentUser && currentUser.nick === nick) {
            currentUser = await api('GET', '/api/user/me');
            refreshNav();
            loadCabData(true);
          }
          await renderAdminUsers(filter);
          toast(`+${amount} ₽ для ${nick}`);
        } catch(err) { toast(err.message || 'Ошибка'); }
      });
    });

    list.querySelectorAll('.ua-colors').forEach(box => {
      box.addEventListener('click', async e => {
        const b = e.target.closest('[data-set-color]');
        if (!b) return;
        const nick = box.dataset.nick;
        let color = b.dataset.setColor;
        if (color === '__custom') color = box.querySelector('.ua-pick').value;
        try {
          await adminApi('PATCH', `/api/admin/users/${encodeURIComponent(nick)}/color`, { color });
          if (currentUser && currentUser.nick === nick) {      // «даже себе»
            currentUser = await api('GET', '/api/user/me');
            refreshNav();
          }
          await renderAdminUsers(filter);
          toast(color ? `Цвет ника ${nick} изменён` : `Цвет ника ${nick} сброшен`);
        } catch(err) { toast(err.message || 'Ошибка'); }
      });
    });
  };

  $('adminUserSearchBtn')?.addEventListener('click', () => {
    const q = $('adminUserSearch')?.value || '';
    renderAdminUsers(q);
  });

  const renderAdminOrders = async () => {
    const list = $('orderAdminList');
    if (!list) return;
    let orders = [];
    try { orders = await adminApi('GET', '/api/orders'); } catch {}
    orders = orders.slice().sort((a, b) => (b.ts || 0) - (a.ts || 0));
    list.innerHTML = orders.map(o => {
      const st = ORDER_STATUS[o.status] || ORDER_STATUS.pending;
      const canRevoke = o.status === 'pending' || o.status === 'in_progress';
      const back = o.status === 'done' ? `<button class="btn btn--ghost btn--sm ord-btn" data-ord="${escH(o.id)}" data-to="in_progress">Вернуть в работу</button>` : '';
      return `
      <div class="order-admin-item">
        <div class="order-admin-item__head">
          <span class="order-admin-item__name">${escH(o.nick)} — ${escH(o.name)}</span>
          <span class="order-admin-item__budget">${o.budget} ₽</span>
        </div>
        <p style="color:var(--c-muted);font-size:.82rem">${escH(o.desc)}</p>
        <span class="ord-pill ${st[1]}">${st[0]}</span>
        ${o.refunded ? '<span class="ord-pill ord--rej">↩ возврат выполнен</span>' : ''}
        <div class="ord-actions">
          ${o.status === 'pending' ? `<button class="btn btn--ghost btn--sm ord-btn" data-ord="${escH(o.id)}" data-to="in_progress">В работу</button>` : ''}
          ${canRevoke ? `<button class="btn btn--primary btn--sm ord-btn" data-ord="${escH(o.id)}" data-to="done">Выполнен</button>` : ''}
          ${canRevoke ? `<button class="btn btn--ghost btn--sm ord-btn ord-btn--danger" data-ord="${escH(o.id)}" data-to="rejected">Отклонить (вернуть ${o.budget} ₽)</button>` : ''}
          ${back}
        </div>
      </div>`;
    }).join('') || '<p class="admin__empty">Заказов нет</p>';

    list.querySelectorAll('[data-ord]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const to = btn.dataset.to;
        if (to === 'rejected' && !confirm(`Отклонить заказ и вернуть ${btn.textContent.match(/\d+/)?.[0] || ''} ₽ на баланс автора?`)) return;
        try {
          const res = await adminApi('PATCH', `/api/orders/${btn.dataset.ord}`, { status: to });
          if (to === 'rejected' && res.refunded) toast('Заказ отклонён, деньги возвращены');
          else toast('Статус обновлён');
        } catch (e) { toast(e.message || 'Ошибка'); }
        await renderAdminOrders();
        if (currentUser) loadCabData(true);
      });
    });
  };

  /* ── ADMIN: модерация чата ── */
  const renderAdminChat = async () => {
    /* активные баны/мьюты */
    const mlist = $('muteList');
    if (mlist) {
      let mutes = [];
      try { mutes = await adminApi('GET', '/api/admin/mutes'); } catch {}
      mlist.innerHTML = mutes.map(m => `
        <div class="jr-item">
          <span class="jr-kind ${m.kind === 'ban' ? 'jr-kind--bad' : 'jr-kind--balance'}">${m.kind === 'ban' ? '🔨 бан' : '🔇 мут'}</span>
          <span class="jr-text">${escH(m.nick)}${m.ip ? ` · <i>${escH(m.ip)}</i>` : ''}${m.until ? ` · до ${escH(fmtTs(m.until))}` : ' · навсегда'}${m.by ? ` · дал ${escH(m.by)}` : ''}</span>
          <button class="bk-restore" data-unmute="${escH(m.id)}" type="button">Снять</button>
        </div>`).join('') || '<p class="admin__empty">Ограничений нет</p>';

      mlist.querySelectorAll('[data-unmute]').forEach(btn => {
        btn.addEventListener('click', async () => {
          try { await adminApi('DELETE', `/api/admin/mutes/${btn.dataset.unmute}`); }
          catch (e) { toast(e.message || 'Ошибка'); return; }
          await renderAdminChat();
          toast('Ограничение снято');
        });
      });
    }

    const list = $('chatAdminList');
    if (!list) return;
    let msgs = [];
    try { msgs = await adminApi('GET', '/api/chat'); } catch {}
    msgs = msgs.slice().sort((a, b) => (b.ts || 0) - (a.ts || 0));
    list.innerHTML = msgs.map(m => `
      <div class="chat-mod-item">
        <div class="chat-mod-top">
          <span class="chat-mod-nick">${escH(m.nick)}</span>
          <span class="chat-mod-ts">${fmtTs(m.ts)}</span>
          <button class="fb-item__del" data-del-msg="${escH(m.id)}" aria-label="Удалить">&times;</button>
        </div>
        <div class="chat-mod-text">${escH(m.text)}</div>
      </div>`).join('') || '<p class="admin__empty">Сообщений нет</p>';

    list.querySelectorAll('[data-del-msg]').forEach(btn => {
      btn.addEventListener('click', async () => {
        try { await adminApi('DELETE', `/api/chat/${btn.dataset.delMsg}`); }
        catch (e) { toast(e.message || 'Ошибка'); return; }
        await renderAdminChat();
        toast('Сообщение удалено');
      });
    });
  };

  /* ── ADMIN: журнал действий, входы, бэкапы ── */
  const renderAdminJournal = async () => {
    const modList = $('modlogList'), logList = $('loginsList'), bkList = $('backupList');

    if (modList) {
      let items = [];
      try { items = await adminApi('GET', '/api/admin/modlog'); } catch (e) { toast(e.message || 'Ошибка'); }
      modList.innerHTML = items.map(m => `
        <div class="jr-item">
          <span class="jr-kind jr-kind--${escH(m.action.split('.')[0])}">${escH(ACTION_LABEL[m.action] || m.action)}</span>
          <span class="jr-text">${escH(m.detail)}</span>
          <span class="jr-time">${fmtTs(m.ts)}</span>
        </div>`).join('') || '<p class="admin__empty">Пока пусто</p>';
    }

    if (logList) {
      let items = [];
      try { items = await adminApi('GET', '/api/admin/logins'); } catch {}
      logList.innerHTML = items.map(l => `
        <div class="jr-item">
          <span class="jr-kind ${l.ok ? 'jr-kind--ok' : 'jr-kind--bad'}">${l.ok ? '✅' : '⛔'} ${escH(ENTR_LABEL[l.kind] || l.kind)}</span>
          <span class="jr-text">${escH(l.nick || '—')}${l.note ? ` · ${escH(l.note)}` : ''}${l.ip ? ` · <i>${escH(l.ip)}</i>` : ''}</span>
          <span class="jr-time">${fmtTs(l.ts)}</span>
        </div>`).join('') || '<p class="admin__empty">Пока пусто</p>';
    }

    const hint = $('storageHint');
    if (hint) {
      try {
        const st = await adminApi('GET', '/api/admin/status');
        hint.textContent = `Хранилище: ${st.storage === 'sqlite' ? 'SQLite' : 'JSON'} · юзеров ${st.users} · бэкапов ${st.backups} · аптайм ${Math.round(st.uptimeSec / 60)} мин`;
      } catch { hint.textContent = ''; }
    }

    if (bkList) {
      let items = [];
      try { items = await adminApi('GET', '/api/admin/backups'); } catch {}
      bkList.innerHTML = items.map(b => `
        <div class="bk-item">
          <span class="invite-code">${escH(b.name)}</span>
          <span class="invite-used">${Math.max(1, Math.round(b.size / 1024))} КБ · ${fmtTs(b.ts)}</span>
          <button class="bk-restore" data-dl="${escH(b.name)}">Скачать</button>
          <button class="bk-restore" data-restore="${escH(b.name)}">Восстановить</button>
        </div>`).join('') || '<p class="admin__empty">Бэкапов нет</p>';

      /* скачать файл: заголовок с инвайтом не поставить на ссылку — грузим через fetch */
      bkList.querySelectorAll('[data-dl]').forEach(btn => {
        btn.addEventListener('click', async () => {
          const name = btn.dataset.dl;
          btn.disabled = true;
          try {
            const res = await fetch(`/api/admin/backups/${encodeURIComponent(name)}`, { headers: getAdminHeaders() });
            if (!res.ok) throw new Error('Не удалось скачать');
            const blob = await res.blob();
            const url  = URL.createObjectURL(blob);
            const a    = document.createElement('a');
            a.href = url;
            a.download = name;
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 4000);
            toast('Бэкап сохранён: ' + name);
          } catch (e) { toast(e.message || 'Ошибка скачивания'); }
          btn.disabled = false;
        });
      });

      bkList.querySelectorAll('[data-restore]').forEach(btn => {
        btn.addEventListener('click', async () => {
          const name = btn.dataset.restore;
          if (!confirm(`Восстановить данные из «${name}»? Текущие данные будут заменены.`)) return;
          btn.disabled = true;
          try {
            const res = await adminApi('POST', '/api/admin/backups/restore', { name });
            toast('Восстановлено: ' + res.keys.length + ' набор(ов)');
            setTimeout(() => location.reload(), 900);
          } catch (e) { toast(e.message || 'Ошибка'); btn.disabled = false; }
        });
      });
    }
  };

  $('makeBackupBtn')?.addEventListener('click', async () => {
    try {
      const b = await adminApi('POST', '/api/admin/backups');
      toast('Бэкап создан: ' + b.name);
      await renderAdminJournal();
    } catch (e) { toast(e.message || 'Ошибка'); }
  });

  const renderAdminCoderApps = async () => {
    const list = $('coderAdminList');
    if (!list) return;
    let apps = [];
    try { apps = await adminApi('GET', '/api/coder-apps'); } catch {}
    list.innerHTML = apps.map(a => `
      <div class="coder-app-item">
        <div class="coder-app-item__head">
          <span class="coder-app-item__name">${escH(a.name)}</span>
          <span class="coder-app-item__age">${escH(a.age)} лет</span>
          <button class="fb-item__del" data-del-coder="${escH(a.id)}">&times;</button>
        </div>
        <p style="font-size:.8rem;color:var(--c-muted)"><b>TG:</b> ${escH(a.tg || '—')} | <b>Стаж:</b> ${escH(a.years)} л.</p>
        <p style="font-size:.82rem">${escH(a.help)}</p>
        ${a.explain ? `<p style="font-size:.8rem;color:var(--c-muted)">${escH(a.explain)}</p>` : ''}
        ${a.photos && a.photos.length ? `<div class="coder-app-item__photos">${a.photos.filter(p => String(p).startsWith('data:image/')).map(p=>`<img src="${escH(p)}" alt="work">`).join('')}</div>` : ''}
      </div>`).join('') || '<p class="admin__empty">Заявок нет</p>';
    list.querySelectorAll('[data-del-coder]').forEach(btn => {
      btn.addEventListener('click', async () => {
        try { await adminApi('DELETE', `/api/coder-apps/${btn.dataset.delCoder}`); } catch {}
        await renderAdminCoderApps();
        toast('Заявка удалена');
      });
    });
  };

  /* ── Initial load ── */
  // зашли по ссылке /u/ник — сразу открываем профиль
  (() => {
    const m = PROFILE_RE.exec(location.pathname);
    if (m) setTimeout(() => openPublicProfile(decodeURIComponent(m[1]).slice(0, 24), true), 0);
  })();

  restoreSession().then(renderScripts);

})();
