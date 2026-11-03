/* ============================================================
   kawaz1k.win — real-time чат (WebSocket)
   Ник берётся из аккаунта (KawazAuth), иначе — гостевой из localStorage.
   Роль (admin/user/guest), цвет ника, ответы на сообщения,
   служебные события system/notice.
   ============================================================ */

(() => {
  'use strict';

  /* ── ник: сначала аккаунт, иначе гостевой ── */
  const NICK_KEY = 'kawaz1k_nick';
  const genNick  = () => 'kawaz1k_player' + Math.floor(1000 + Math.random() * 9000);
  const getNick  = () => {
    let n = localStorage.getItem(NICK_KEY);
    if (!n) { n = genNick(); localStorage.setItem(NICK_KEY, n); }
    return n;
  };
  const MY_NICK = getNick();
  const senderNick = () => {
    const acc = window.KawazAuth && window.KawazAuth.nick && window.KawazAuth.nick();
    return acc || MY_NICK;
  };

  /* ── DOM ── */
  const chatBtn        = document.getElementById('chatBtn');
  const chatPanel      = document.getElementById('chatPanel');
  const chatMsgs       = document.getElementById('chatMsgs');
  const chatInput      = document.getElementById('chatInput');
  const chatSend       = document.getElementById('chatSend');
  const chatBadge      = document.getElementById('chatBadge');
  const chatNick       = document.getElementById('chatNick');
  const chatOnline     = document.getElementById('chatOnline');
  const replyStrip     = document.getElementById('chatReplyStrip');
  const replyNickEl    = document.getElementById('chatReplyNick');
  const replyTextEl    = document.getElementById('chatReplyText');
  const replyCancel    = document.getElementById('chatReplyCancel');
  if (!chatBtn) return;

  chatNick.textContent = senderNick();

  /* ── состояние ── */
  let isOpen  = false;
  let unread  = 0;
  let replyTo = null;                       // { nick, text } — на что отвечаем
  const rendered = new Set();

  /* ── открыть / закрыть ── */
  const openChat = () => {
    isOpen = true;
    chatPanel.classList.add('chat-open');
    chatBtn.setAttribute('aria-pressed', 'true');
    unread = 0;
    chatBadge.hidden = true;
    setTimeout(() => { scrollBottom(); chatInput.focus(); }, 220);
  };
  const closeChat = () => {
    isOpen = false;
    chatPanel.classList.remove('chat-open');
    chatBtn.setAttribute('aria-pressed', 'false');
    setReply(null);
  };
  chatBtn.addEventListener('click', () => isOpen ? closeChat() : openChat());
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape' || !isOpen) return;
    if (replyTo) { setReply(null); return; }   // сначала отменяем ответ, потом закрываем чат
    closeChat();
  });

  /* ── утилиты ── */
  const scrollBottom = () => { chatMsgs.scrollTop = chatMsgs.scrollHeight; };
  const timeStr = ts => new Date(ts).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' });

  /* ── полоса ответа ── */
  function setReply(item) {
    replyTo = item || null;
    if (!replyStrip) return;
    replyStrip.hidden = !replyTo;
    if (replyTo) {
      replyNickEl.textContent = replyTo.nick;
      replyTextEl.textContent = replyTo.text;
      chatInput.focus();
    } else {
      replyNickEl.textContent = '';
      replyTextEl.textContent = '';
    }
  }
  replyCancel?.addEventListener('click', () => setReply(null));

  /* ── рендер сообщения ── */
  let lastNick = '', lastEl = null, lastTs = 0;

  /* ник в заголовке группы: цвет аккаунта + бейдж роли */
  function paintNickEl(el, msg) {
    el.textContent = msg.nick;
    el.style.color = msg.color || '';
    el.className = 'cmsg-nick' + (msg.role === 'admin' ? ' cmsg-nick--admin' : '');
    if (msg.role === 'admin') {
      const badge = document.createElement('i');
      badge.className = 'cmsg-role';
      badge.textContent = 'админ';
      el.appendChild(badge);
    }
  }

  function renderMsg(msg, prepend = false) {
    if (!msg || !msg.id || rendered.has(msg.id)) return;
    rendered.add(msg.id);

    const empty = chatMsgs.querySelector('.chat-empty');
    if (empty) empty.remove();

    const me = senderNick();
    const own = msg.nick === me;
    const group = !prepend && lastNick === msg.nick && (msg.ts - lastTs) < 60000 && lastEl;
    let groupEl;

    if (group) {
      groupEl = lastEl;
      lastTs  = msg.ts;
    } else {
      groupEl = document.createElement('div');
      groupEl.className = 'cmsg-group' + (own ? ' cmsg-own' : '');
      groupEl.dataset.groupNick = msg.nick;

      const nickEl = document.createElement('div');
      nickEl.className = 'cmsg-nick';
      paintNickEl(nickEl, msg);
      groupEl.appendChild(nickEl);

      if (prepend) chatMsgs.prepend(groupEl);
      else         chatMsgs.appendChild(groupEl);

      if (!prepend) { lastNick = msg.nick; lastEl = groupEl; lastTs = msg.ts; }
    }

    const bubble = document.createElement('div');
    bubble.className = 'cmsg-bubble';
    bubble.dataset.msgId = msg.id;
    if (msg.replyTo) bubble.classList.add('cmsg-bubble--reply');

    /* цитата, на которую отвечаем */
    if (msg.replyTo && msg.replyTo.nick) {
      const q = document.createElement('div');
      q.className = 'cmsg-reply';
      const qn = document.createElement('b');
      qn.textContent = msg.replyTo.nick;
      const qt = document.createElement('span');
      qt.textContent = msg.replyTo.text || '';
      q.append(qn, qt);
      bubble.appendChild(q);
    }

    const textEl = document.createElement('span');
    textEl.className = 'cmsg-text';
    textEl.textContent = msg.text;
    /* подсветка упоминания своего ника */
    if (msg.text && new RegExp('@' + me.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(msg.text)) {
      textEl.classList.add('cmsg-text--mention');
    }
    bubble.appendChild(textEl);

    const tsEl = document.createElement('span');
    tsEl.className = 'cmsg-ts';
    tsEl.textContent = timeStr(msg.ts);
    bubble.appendChild(tsEl);

    /* кнопка «ответить» — по наведению на пузырь */
    const rb = document.createElement('button');
    rb.type = 'button';
    rb.className = 'cmsg-replybtn';
    rb.title = 'Ответить';
    rb.setAttribute('aria-label', 'Ответить');
    rb.textContent = '↩';
    rb.addEventListener('click', e => {
      e.stopPropagation();
      setReply({ nick: msg.nick, text: String(msg.text || '').slice(0, 120) });
    });
    bubble.appendChild(rb);

    groupEl.appendChild(bubble);

    if (!isOpen) {
      unread++;
      chatBadge.hidden = false;
      chatBadge.textContent = unread > 9 ? '9+' : unread;
    }
    if (!prepend) scrollBottom();
  }

  /* служебная строка (system — для всех, notice — только для нас) */
  function renderLine(text, kind = 'system') {
    const el = document.createElement('div');
    el.className = kind === 'notice' ? 'cmsg-line cmsg-line--notice' : 'cmsg-line';
    el.textContent = text;
    chatMsgs.appendChild(el);
    scrollBottom();
  }

  /* удалить сообщение из DOM */
  function deleteMsg(id) {
    const bubble = chatMsgs.querySelector(`[data-msg-id="${id}"]`);
    if (!bubble) return;
    const group = bubble.closest('.cmsg-group');
    bubble.remove();
    // если в группе больше нет пузырей — убрать группу
    if (group && !group.querySelector('.cmsg-bubble')) group.remove();
  }

  /* ── WebSocket ── */
  let ws, reconnectTimer;

  function connect() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    ws = new WebSocket(`${proto}://${location.host}`);

    ws.addEventListener('open', () => {
      console.log('[chat] connected');
      clearTimeout(reconnectTimer);
      chatNick.textContent = senderNick();
    });

    ws.addEventListener('message', e => {
      let data;
      try { data = JSON.parse(e.data); } catch { return; }

      if (data.type === 'history') {
        /* история — рендерим все сразу (уже отсортированы старые→новые) */
        data.messages.forEach(m => renderMsg(m));
        scrollBottom();
      } else if (data.type === 'message') {
        renderMsg(data.message);
      } else if (data.type === 'delete') {
        deleteMsg(data.id);
      } else if (data.type === 'system') {
        renderLine(data.text || '', 'system');
      } else if (data.type === 'notice') {
        renderLine(data.text || '', 'notice');
      } else if (data.type === 'online') {
        chatOnline.textContent = data.count + ' онлайн';
      }
    });

    ws.addEventListener('close', () => {
      console.log('[chat] disconnected, retry in 3s');
      reconnectTimer = setTimeout(connect, 3000);
    });

    ws.addEventListener('error', () => ws.close());
  }

  connect();

  /* ── отправка ── */
  function sendMsg() {
    const text = chatInput.value.trim();
    if (!text || !ws || ws.readyState !== 1) return;
    const payload = { type: 'send', nick: senderNick(), text };
    if (replyTo) payload.replyTo = replyTo;
    ws.send(JSON.stringify(payload));
    chatInput.value = '';
    chatInput.style.height = 'auto';
    chatSend.disabled = true;
    setReply(null);
  }

  chatInput.addEventListener('input', () => {
    chatInput.style.height = 'auto';
    chatInput.style.height = Math.min(chatInput.scrollHeight, 96) + 'px';
    chatSend.disabled = !chatInput.value.trim();
  });
  chatInput.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMsg(); }
  });
  chatSend.addEventListener('click', sendMsg);

  /* ник в шапке чата обновляем, когда вошли/вышли из аккаунта */
  setInterval(() => {
    const n = senderNick();
    if (chatNick.textContent !== n) chatNick.textContent = n;
  }, 3000);

})();
