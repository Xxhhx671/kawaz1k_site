/* ============================================================
   kawaz1k.win — real-time чат (WebSocket)
   Ник: kawaz1k_playerXXXX — хранится в localStorage
   ============================================================ */

(() => {
  'use strict';

  /* ── ник ── */
  const NICK_KEY = 'kawaz1k_nick';
  const genNick  = () => 'kawaz1k_player' + Math.floor(1000 + Math.random() * 9000);
  const getNick  = () => {
    let n = localStorage.getItem(NICK_KEY);
    if (!n) { n = genNick(); localStorage.setItem(NICK_KEY, n); }
    return n;
  };
  const MY_NICK = getNick();

  /* ── DOM ── */
  const chatBtn    = document.getElementById('chatBtn');
  const chatPanel  = document.getElementById('chatPanel');
  const chatMsgs   = document.getElementById('chatMsgs');
  const chatInput  = document.getElementById('chatInput');
  const chatSend   = document.getElementById('chatSend');
  const chatBadge  = document.getElementById('chatBadge');
  const chatNick   = document.getElementById('chatNick');
  const chatOnline = document.getElementById('chatOnline');
  if (!chatBtn) return;

  chatNick.textContent = MY_NICK;

  /* ── состояние ── */
  let isOpen  = false;
  let unread  = 0;
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
  };
  chatBtn.addEventListener('click', () => isOpen ? closeChat() : openChat());
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && isOpen) closeChat(); });

  /* ── утилиты ── */
  const scrollBottom = () => { chatMsgs.scrollTop = chatMsgs.scrollHeight; };
  const timeStr = ts => new Date(ts).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' });

  /* ── рендер сообщения ── */
  let lastNick = '', lastEl = null, lastTs = 0;

  function renderMsg(msg, prepend = false) {
    if (rendered.has(msg.id)) return;
    rendered.add(msg.id);

    const empty = chatMsgs.querySelector('.chat-empty');
    if (empty) empty.remove();

    const own = msg.nick === MY_NICK;
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
      nickEl.textContent = msg.nick;
      groupEl.appendChild(nickEl);

      if (prepend) chatMsgs.prepend(groupEl);
      else         chatMsgs.appendChild(groupEl);

      if (!prepend) { lastNick = msg.nick; lastEl = groupEl; lastTs = msg.ts; }
    }

    const bubble = document.createElement('div');
    bubble.className = 'cmsg-bubble';
    bubble.dataset.msgId = msg.id;

    const textEl = document.createElement('span');
    textEl.className = 'cmsg-text';
    textEl.textContent = msg.text;

    const tsEl = document.createElement('span');
    tsEl.className = 'cmsg-ts';
    tsEl.textContent = timeStr(msg.ts);

    bubble.appendChild(textEl);
    bubble.appendChild(tsEl);
    groupEl.appendChild(bubble);

    if (!isOpen) {
      unread++;
      chatBadge.hidden = false;
      chatBadge.textContent = unread > 9 ? '9+' : unread;
    }
    if (!prepend) scrollBottom();
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
    ws.send(JSON.stringify({ type: 'send', nick: MY_NICK, text }));
    chatInput.value = '';
    chatInput.style.height = 'auto';
    chatSend.disabled = true;
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

})();
