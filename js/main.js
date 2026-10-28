/* ============================================================
   kawaz1k.win — animations core
   ============================================================ */

(() => {
  'use strict';

  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------------------------------------------------------
     1. Летающие декоративные надписи в фоне
  --------------------------------------------------------- */
  const words = ['KAWAZ', 'ROBLOX', 'SCRIPT', 'WIN'];
  words.forEach((w, i) => {
    const el = document.createElement('div');
    el.className = `floaty floaty--${i + 1}`;
    el.textContent = w;
    el.dataset.depth = (i + 1) * 0.02;
    document.body.appendChild(el);
  });

  /* ---------------------------------------------------------
     2. Частицы на canvas — белые летящие точки
  --------------------------------------------------------- */
  const canvas = document.getElementById('particles');
  const ctx = canvas.getContext('2d');
  let W, H, parts = [];

  const resize = () => {
    W = canvas.width = window.innerWidth;
    H = canvas.height = window.innerHeight;
    const count = Math.min(120, Math.floor((W * H) / 14000));
    parts = Array.from({ length: count }, () => ({
      x: Math.random() * W,
      y: Math.random() * H,
      vx: (Math.random() - 0.5) * 0.55,
      vy: (Math.random() - 0.5) * 0.55,
      r: Math.random() * 2 + 0.5,
      tw: Math.random() * Math.PI * 2
    }));
  };
  resize();
  window.addEventListener('resize', resize);

  const drawParticles = () => {
    ctx.clearRect(0, 0, W, H);
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      p.x += p.vx; p.y += p.vy; p.tw += 0.03;

      if (p.x < 0 || p.x > W) p.vx *= -1;
      if (p.y < 0 || p.y > H) p.vy *= -1;

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,255,255,${0.25 + Math.abs(Math.sin(p.tw)) * 0.55})`;
      ctx.fill();

      // связи между близкими частицами
      for (let j = i + 1; j < parts.length; j++) {
        const q = parts[j];
        const dx = p.x - q.x, dy = p.y - q.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < 13000) {
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(q.x, q.y);
          ctx.strokeStyle = `rgba(255,255,255,${(1 - d2 / 13000) * 0.16})`;
          ctx.lineWidth = 0.7;
          ctx.stroke();
        }
      }
    }
    requestAnimationFrame(drawParticles);
  };
  if (!prefersReduced) drawParticles();

  /* ---------------------------------------------------------
     3. Курсор: точка + кольцо-эхо с инерцией
  --------------------------------------------------------- */
  if (window.matchMedia('(pointer: fine)').matches && !prefersReduced) {
    const dot = document.createElement('div');
    dot.className = 'cursor-dot';
    const ring = document.createElement('div');
    ring.className = 'cursor-ring';
    document.body.append(dot, ring);

    let mx = -100, my = -100, rx = -100, ry = -100;

    window.addEventListener('mousemove', e => {
      mx = e.clientX; my = e.clientY;
      dot.style.left = mx + 'px';
      dot.style.top = my + 'px';
    });

    const loop = () => {
      rx += (mx - rx) * 0.14;
      ry += (my - ry) * 0.14;
      ring.style.left = rx + 'px';
      ring.style.top = ry + 'px';
      requestAnimationFrame(loop);
    };
    loop();

    document.addEventListener('mouseover', e => {
      if (e.target.closest('a, button, summary, .card, .script')) ring.classList.add('hover');
    });
    document.addEventListener('mouseout', e => {
      if (e.target.closest('a, button, summary, .card, .script')) ring.classList.remove('hover');
    });
  }

  /* ---------------------------------------------------------
     4. Навигация: скролл-состояние + бургер
  --------------------------------------------------------- */
  const nav = document.getElementById('nav');
  const burger = document.getElementById('burger');
  const navLinks = document.getElementById('navLinks');

  window.addEventListener('scroll', () => {
    nav.classList.toggle('scrolled', window.scrollY > 40);
  }, { passive: true });

  burger.addEventListener('click', () => {
    const open = burger.classList.toggle('open');
    navLinks.classList.toggle('open', open);
    document.body.classList.toggle('menu-open', open);
  });
  const closeMenu = () => {
    burger.classList.remove('open');
    navLinks.classList.remove('open');
    document.body.classList.remove('menu-open');
  };
  navLinks.addEventListener('click', e => {
    if (e.target.tagName === 'A') closeMenu();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeMenu();
  });
  window.addEventListener('resize', () => {
    if (window.innerWidth > 1060) closeMenu();
  });

  /* ---------------------------------------------------------
     5. Появление блоков при скролле (stagger)
  --------------------------------------------------------- */
  const revealEls = document.querySelectorAll('.reveal');
  const io = new IntersectionObserver(entries => {
    entries.forEach((en, i) => {
      if (en.isIntersecting) {
        setTimeout(() => en.target.classList.add('in'), i * 90);
        io.unobserve(en.target);
      }
    });
  }, { threshold: 0.15 });
  revealEls.forEach(el => io.observe(el));

  // страховка: если IntersectionObserver не сработал — показываем по скроллу
  const revealFallback = () => {
    document.querySelectorAll('.reveal:not(.in)').forEach(el => {
      if (el.getBoundingClientRect().top < window.innerHeight * 0.92) el.classList.add('in');
    });
  };
  window.addEventListener('scroll', revealFallback, { passive: true });
  window.addEventListener('resize', revealFallback);
  setTimeout(revealFallback, 800);

  /* ---------------------------------------------------------
     6. Счётчики статистики
  --------------------------------------------------------- */
  const counters = document.querySelectorAll('.stat__num');
  const fmt = n => n >= 1000 ? Math.floor(n).toLocaleString('ru-RU') : Math.floor(n);

  const animateCounter = el => {
    if (el.dataset.done) return;
    el.dataset.done = '1';
    const target = +el.dataset.count;
    const dur = 1800;
    const start = performance.now();
    const step = () => {
      const p = Math.min((performance.now() - start) / dur, 1);
      const eased = 1 - Math.pow(1 - p, 4);
      el.textContent = fmt(target * eased);
      if (p >= 1) { el.textContent = fmt(target); clearInterval(timer); }
    };
    const timer = setInterval(step, 30);
    step();
  };

  const cIo = new IntersectionObserver(entries => {
    entries.forEach(en => {
      if (en.isIntersecting) { animateCounter(en.target); cIo.unobserve(en.target); }
    });
  }, { threshold: 0.6 });
  counters.forEach(el => cIo.observe(el));
  setTimeout(() => counters.forEach(animateCounter), 2500); // фолбэк

  /* ---------------------------------------------------------
     7. Терминал: печатающийся код + курсор
  --------------------------------------------------------- */
  const codeEl = document.querySelector('.terminal__body code');
  if (codeEl && !prefersReduced) {
    const fullHTML = codeEl.innerHTML;
    // раскладываем по "частям" — сохраняя теги
    const tmp = document.createElement('div');
    tmp.innerHTML = fullHTML;

    const nodes = [];
    const walk = (src, dst) => {
      src.childNodes.forEach(n => {
        if (n.nodeType === 3) {
          [...n.textContent].forEach(ch => {
            const span = document.createElement('span');
            span.textContent = ch;
            dst.push({ node: span, raw: ch });
          });
        } else {
          const clone = n.cloneNode(false);
          dst.push({ node: clone, wrapper: true });
          const kids = [];
          walk(n, kids);
          clone.__kids = kids;
        }
      });
    };
    walk(tmp, nodes);

    codeEl.innerHTML = '';
    let i = 0;
    const tick = () => {
      if (i >= nodes.length) {
        codeEl.classList.add('typed');
        return;
      }
      const item = nodes[i++];
      if (item.wrapper) {
        // вставляем обёртку и сразу раскрываем её содержимое
        codeEl.appendChild(item.node);
        item.node.__kids.forEach(k => {
          if (k.wrapper) {
            const nested = k.node;
            item.node.appendChild(nested);
            nested.__kids.forEach(g => item.node.appendChild(g.node));
          } else {
            item.node.appendChild(k.node);
          }
        });
        tick();
        return;
      }
      if (item.raw === '\n') {
        codeEl.appendChild(document.createTextNode('\n'));
        setTimeout(tick, 40);
      } else {
        codeEl.appendChild(item.node);
        setTimeout(tick, 12 + Math.random() * 26);
      }
    };

    const term = document.querySelector('.terminal') || codeEl;
    let started = false;
    const startTyping = () => {
      if (started) return;
      started = true;
      setTimeout(tick, 700);
    };
    const tIo = new IntersectionObserver(en => {
      if (en[0].isIntersecting) { startTyping(); tIo.disconnect(); }
    }, { threshold: 0.25 });
    tIo.observe(term);
    setTimeout(startTyping, 1500); // фолбэк, если вкладка не видима
  } else if (codeEl) {
    codeEl.classList.add('typed');
  }

  /* ---------------------------------------------------------
     8. Копирование кода
  --------------------------------------------------------- */
  const toast = document.getElementById('toast');
  let toastTimer;
  const showToast = () => {
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 2200);
  };

  document.querySelectorAll('[data-copy]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const text = btn.dataset.copy;
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        const ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
      }
      btn.classList.add('copied');
      showToast();
      setTimeout(() => btn.classList.remove('copied'), 1800);
    });
  });

  /* ---------------------------------------------------------
     9. 3D-наклон терминала за мышью
  --------------------------------------------------------- */
  const visual = document.querySelector('.hero__visual');
  const terminal = document.querySelector('.terminal');
  if (visual && terminal && !prefersReduced) {
    visual.addEventListener('mousemove', e => {
      const r = visual.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width - 0.5;
      const py = (e.clientY - r.top) / r.height - 0.5;
      terminal.style.animation = 'none';
      terminal.style.transform =
        `rotateY(${px * 18}deg) rotateX(${-py * 14}deg) translateZ(30px) scale(1.03)`;
    });
    visual.addEventListener('mouseleave', () => {
      terminal.style.transform = '';
      terminal.style.animation = '';
    });
  }

  /* ---------------------------------------------------------
     10. Светящееся пятно за курсором внутри карточек
  --------------------------------------------------------- */
  document.querySelectorAll('.card').forEach(card => {
    card.addEventListener('mousemove', e => {
      const r = card.getBoundingClientRect();
      card.style.setProperty('--mx', (e.clientX - r.left) + 'px');
      card.style.setProperty('--my', (e.clientY - r.top) + 'px');
    });
  });

  /* ---------------------------------------------------------
     11. Параллакс: фон + летающие надписи при скролле и мыши
  --------------------------------------------------------- */
  const floaties = document.querySelectorAll('.floaty');
  const grid = document.querySelector('.grid-bg');
  let scrollY = window.scrollY;
  let pointerX = 0, pointerY = 0;

  window.addEventListener('scroll', () => { scrollY = window.scrollY; }, { passive: true });
  window.addEventListener('mousemove', e => {
    pointerX = e.clientX / window.innerWidth - 0.5;
    pointerY = e.clientY / window.innerHeight - 0.5;
  }, { passive: true });

  if (!prefersReduced) {
    const parallax = () => {
      floaties.forEach(f => {
        const d = parseFloat(f.dataset.depth) || 0.02;
        f.style.translate =
          `${pointerX * d * 2600}px ${pointerY * d * 1800 - scrollY * d * 6}px`;
      });
      if (grid) grid.style.translate = `${pointerX * -24}px ${pointerY * -24}px`;
      requestAnimationFrame(parallax);
    };
    parallax();
  }

  /* ---------------------------------------------------------
     12. Магнитные кнопки
  --------------------------------------------------------- */
  if (!prefersReduced && window.matchMedia('(pointer: fine)').matches) {
    document.querySelectorAll('.btn, .btn-copy').forEach(btn => {
      btn.addEventListener('mousemove', e => {
        const r = btn.getBoundingClientRect();
        const x = e.clientX - r.left - r.width / 2;
        const y = e.clientY - r.top - r.height / 2;
        btn.style.transform = `translate(${x * 0.22}px, ${y * 0.3}px) scale(1.05)`;
      });
      btn.addEventListener('mouseleave', () => { btn.style.transform = ''; });
    });
  }

  /* ---------------------------------------------------------
     13. Клик — вспышка частиц
  --------------------------------------------------------- */
  window.addEventListener('click', e => {
    if (prefersReduced) return;
    for (let i = 0; i < 16; i++) {
      const s = document.createElement('span');
      s.style.cssText = `
        position:fixed; left:${e.clientX}px; top:${e.clientY}px;
        width:${3 + Math.random() * 5}px; height:${3 + Math.random() * 5}px;
        background:#fff; border-radius:50%; pointer-events:none; z-index:9999;
        transform:translate(-50%,-50%);`;
      document.body.appendChild(s);
      const ang = Math.random() * Math.PI * 2;
      const dist = 50 + Math.random() * 90;
      s.animate([
        { transform: 'translate(-50%,-50%) scale(1)', opacity: 1 },
        {
          transform: `translate(${Math.cos(ang) * dist - 50}%, ${Math.sin(ang) * dist - 50}%) scale(0)`,
          opacity: 0
        }
      ], { duration: 600 + Math.random() * 400, easing: 'cubic-bezier(.2,.8,.3,1)' })
        .onfinish = () => s.remove();
    }
  });

  /* ---------------------------------------------------------
     14. Случайный "глитч" заголовка
  --------------------------------------------------------- */
  const title = document.querySelector('.hero__title');
  if (title && !prefersReduced) {
    setInterval(() => {
      if (Math.random() > 0.55) {
        title.style.animation = 'none';
        title.offsetHeight; // reflow
        title.style.textShadow = '4px 0 #fff, -4px 0 #555';
        setTimeout(() => { title.style.textShadow = ''; }, 130);
      }
    }, 3400);
  }
})();
