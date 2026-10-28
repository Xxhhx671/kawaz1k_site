/* ============================================================
   kawaz1k.win — i18n (RU / EN)
   Переключение языка: всё в data-i18n ключах, выбор
   сохраняется в localStorage.
   ============================================================ */

(() => {
  'use strict';

  const I18N = {
    ru: {
      'nav.features': 'Возможности',
      'nav.howto': 'Инструкция',
      'nav.faq': 'FAQ',
      'nav.copy': 'Копировать скрипт',

      'hero.title': 'Мощный скрипт<br>для <span class="gradient-text">Roblox</span>',
      'hero.sub': 'kawaz1k.win — это скорость, стабильность и полный контроль. Один скрипт работает в любой игре — просто скопируй его и играй.',
      'hero.cta_primary': 'Запустить скрипт',
      'hero.cta_ghost': 'Как это работает',
      'hero.stat_uptime': '% аптайма',

      'terminal.title': 'kawaz1k — консоль',
      'copy.loadstring': 'Копировать loadstring',
      'copy.script': 'Копировать скрипт',
      'copy.done': 'Скопировано ✓',
      'toast': 'Скопировано в буфер обмена ✓',

      'nav.complaint': 'Жалоба',
      'news.aria': 'Новости',
      'news.title': 'Новости и обновления',
      'news.empty': 'Пока нет обновлений',
      'news.added': 'Добавлено',
      'news.improved': 'Улучшено',
      'news.delete': 'Удалить',
      'news.forAdmin': 'Новости публикуются только через частный вход',

      'fb.eyebrow': '// обратная связь',
      'fb.title': 'Жалоба или идея',
      'fb.problem': 'Проблема',
      'fb.improve': 'Улучшение',
      'fb.add': 'Что добавить',
      'fb.placeholder': 'Опиши проблему или напиши, что можно добавить / улучшить...',
      'fb.submit': 'Отправить',
      'fb.note': 'Заявку увидит только администрация',
      'fb.empty': 'Сначала напиши текст',
      'fb.thanks': 'Отправлено ✓',

      'private.eyebrow': '// частный вход',
      'private.title': 'Частный <span class="gradient-text">вход</span>',
      'private.sub': 'Панель администрации: просмотр жалоб и идей, публикация новостей.',
      'private.placeholder': 'invite-code',
      'private.enter': 'Войти',
      'private.wrong': 'Неверный инвайт-код',
      'private.ok': 'Доступ разрешён ✓',
      'private.logout': 'Выйти',
      'private.feedback': 'Жалобы и идеи',
      'private.empty': 'Пока пусто — ждём первых заявок',
      'private.addNews': 'Добавить новость',
      'private.f_title': 'Заголовок',
      'private.f_desc': 'Описание',
      'private.f_added': 'Что добавлено',
      'private.f_improved': 'Что улучшено',
      'private.publish': 'Опубликовать',
      'private.stat': 'Заявок: {n} · Новостей: {m}',
      'private.hint': 'Доступ только по инвайт-коду',

      'features.eyebrow': '// возможности',
      'features.title': 'Всё, что нужно <span class="gradient-text">про-игроку</span>',
      'features.sub': 'Мы собрали то, что другие раздают по частям — в одном месте и без багов.',
      'f1.t': 'Мгновенный запуск',
      'f1.p': 'Загрузка меньше секунды. Никаких ожиданий, рекламы на 30 секунд и лишних кликов.',
      'f2.t': 'Анти-детект',
      'f2.p': 'Обход защиты и регулярные обновления под патчи Roblox. Твой аккаунт под защитой.',
      'f5.t': 'Авто-обновление',
      'f5.p': 'Скрипт сам подтягивает свежие версии. Тебе не нужно искать новые линки после каждого патча.',
      'f6.t': 'Поддержка 24/7',
      'f6.p': 'Живой Discord-чат и техподдержка. Отвечаем в среднем за 4 минуты.',

      'scripts.eyebrow': '// один скрипт на всё',
      'scripts.title': 'Универсальный скрипт <span class="gradient-text">на любую игру</span>',
      'scripts.sub': 'Один loadstring работает в любой игре Roblox — ничего переключать и выбирать не нужно.',
      'common.stable': '● стабильно',
      'u1.tag': 'УНИВЕРСАЛ',
      'u1.p': 'ESP игроков, speed, fly, noclip, anti-AFK и инфинит-джамп — в любой игре, без исключений.',

      'howto.eyebrow': '// инструкция',
      'howto.title': 'Как <span class="gradient-text">запустить</span>',
      'st1.t': 'Скачай executor',
      'st1.p': 'Скачай любой executor: Delta, Xeno или Solara. Это отдельная программа-загрузчик.',
      'st2.t': 'Запусти Roblox с executor',
      'st2.p': 'Открой Roblox через executor (для дельты — отдельное приложение для ПК: zip-file или exe).',
      'st3.t': 'Вставь скрипт и играй',
      'st3.p': 'Нажми «Копировать скрипт», вставь его в executor, выполни — и играй.',

      'cta.title': 'Готов получить преимущество?',
      'cta.sub': 'Присоединяйся к сообществу игроков, которые уже используют kawaz1k.win',
      'cta.btn1': 'Копировать скрипт',
      'cta.btn2': 'Частые вопросы',

      'faq.eyebrow': '// вопросы',
      'faq.title': 'Частые <span class="gradient-text">вопросы</span>',
      'faq.q1': 'Это бесплатно?',
      'faq.a1': 'Да, базовый набор полностью бесплатный. Pro-функции доступны по желанию, но основной скрипт работает без оплаты.',
      'faq.q2': 'Безопасно ли это для аккаунта?',
      'faq.a2': 'Скрипт использует обходные механизмы и регулярно обновляется. Однако использование сторонних инструментов нарушает правила Roblox — действуй на свой риск.',
      'faq.q3': 'Какие executor поддерживаются?',
      'faq.a3': 'Совместим со всеми популярными Lua-экзекуторами: Delta, Xeno, Solara, Wave, Swift и аналогами с поддержкой loadstring.',
      'faq.q4': 'Что делать, если скрипт не работает?',
      'faq.a4': 'Обнови страницу до свежей версии, перезапусти игру через executor и проверь Discord — там мы публикуем статус.',
      'faq.q5': 'Есть ли версия для телефона?',
      'faq.a5': 'Версия для Android в бете. iOS-версия пока недоступна из-за ограничений системы.',

      'footer.tagline': 'Мощный универсальный скрипт для Roblox. Быстро. Стабильно. Бесплатно.',
      'footer.col_site': 'Сайт',
      'footer.col_social': 'Сообщество',
      'footer.col_legal': 'Правовое',
      'footer.terms': 'Пользовательское соглашение',
      'footer.privacy': 'Политика конфиденциальности',
      'footer.disclaimer_link': 'Отказ от ответственности',
      'footer.rights': '© 2026 kawaz1k.win — все права защищены',
      'footer.status': 'Все системы работают',
      'footer.note': 'Сайт не связан с Roblox Corporation. Использование сторонних скриптов может нарушать правила игры — весь материал представлен в ознакомительных целях.'
    },

    en: {
      'nav.features': 'Features',
      'nav.howto': 'Guide',
      'nav.faq': 'FAQ',
      'nav.copy': 'Copy script',

      'hero.title': 'The most powerful<br><span class="gradient-text">Roblox</span> script',
      'hero.sub': 'kawaz1k.win is speed, stability and total control. One script works in any game — just copy it and play.',
      'hero.cta_primary': 'Run the script',
      'hero.cta_ghost': 'How it works',
      'hero.stat_uptime': '% uptime',

      'terminal.title': 'kawaz1k — console',
      'copy.loadstring': 'Copy loadstring',
      'copy.script': 'Copy script',
      'copy.done': 'Copied ✓',
      'toast': 'Copied to clipboard ✓',

      'nav.complaint': 'Report',
      'news.aria': 'News',
      'news.title': 'News & updates',
      'news.empty': 'No updates yet',
      'news.added': 'Added',
      'news.improved': 'Improved',
      'news.delete': 'Delete',
      'news.forAdmin': 'News are published only through private access',

      'fb.eyebrow': '// feedback',
      'fb.title': 'Complaint or idea',
      'fb.problem': 'Problem',
      'fb.improve': 'Improvement',
      'fb.add': 'What to add',
      'fb.placeholder': 'Describe the problem or tell us what to add / improve...',
      'fb.submit': 'Send',
      'fb.note': 'Only the administration will see it',
      'fb.empty': 'Please write something first',
      'fb.thanks': 'Sent ✓',

      'private.eyebrow': '// private access',
      'private.title': 'Private <span class="gradient-text">access</span>',
      'private.sub': 'Administration panel: view complaints and ideas, publish news.',
      'private.placeholder': 'invite-code',
      'private.enter': 'Log in',
      'private.wrong': 'Wrong invite code',
      'private.ok': 'Access granted ✓',
      'private.logout': 'Log out',
      'private.feedback': 'Complaints & ideas',
      'private.empty': 'Nothing here yet — waiting for the first submissions',
      'private.addNews': 'Add news',
      'private.f_title': 'Title',
      'private.f_desc': 'Description',
      'private.f_added': 'What was added',
      'private.f_improved': 'What was improved',
      'private.publish': 'Publish',
      'private.stat': 'Submissions: {n} · News: {m}',
      'private.hint': 'Access by invite code only',

      'features.eyebrow': '// features',
      'features.title': 'Everything a <span class="gradient-text">pro player</span> needs',
      'features.sub': 'We packed what others give out in pieces — all in one place, bug free.',
      'f1.t': 'Instant launch',
      'f1.p': 'Loads in under a second. No waiting, no 30-second ads, no extra clicks.',
      'f2.t': 'Anti-detect',
      'f2.p': 'Bypasses protection and regular updates for every Roblox patch. Your account stays safe.',
      'f5.t': 'Auto-update',
      'f5.p': 'The script pulls fresh versions by itself. No hunting for new links after every patch.',
      'f6.t': '24/7 support',
      'f6.p': 'Live Discord chat and tech support. We reply in about 4 minutes on average.',

      'scripts.eyebrow': '// one script for everything',
      'scripts.title': 'One universal <span class="gradient-text">script for any game</span>',
      'scripts.sub': 'A single loadstring works in any Roblox game — nothing to switch or pick.',
      'common.stable': '● stable',
      'u1.tag': 'UNIVERSAL',
      'u1.p': 'Player ESP, speed, fly, noclip, anti-AFK and infinite jump — in any game, no exceptions.',

      'howto.eyebrow': '// instructions',
      'howto.title': 'How to <span class="gradient-text">launch</span>',
      'st1.t': 'Download an executor',
      'st1.p': 'Download any executor: Delta, Xeno or Solara. It is a separate loader app.',
      'st2.t': 'Launch Roblox with the executor',
      'st2.p': 'Open Roblox through the executor (for Delta — a separate PC app: zip-file or exe).',
      'st3.t': 'Paste the script and play',
      'st3.p': 'Hit "Copy script", paste it into the executor, execute — and play.',

      'cta.title': 'Ready to get the edge?',
      'cta.sub': 'Join the community of players who already run kawaz1k.win',
      'cta.btn1': 'Copy script',
      'cta.btn2': 'FAQ',

      'faq.eyebrow': '// questions',
      'faq.title': 'Frequently asked <span class="gradient-text">questions</span>',
      'faq.q1': 'Is it free?',
      'faq.a1': 'Yes, the core set is completely free. Pro features are optional, but the main script works without payment.',
      'faq.q2': 'Is it safe for my account?',
      'faq.a2': 'The script uses bypasses and is updated regularly. Still, third-party tools violate Roblox rules — use at your own risk.',
      'faq.q3': 'Which executors are supported?',
      'faq.a3': 'Works with all popular Lua executors: Delta, Xeno, Solara, Wave, Swift and other loadstring-capable tools.',
      'faq.q4': 'What if the script does not work?',
      'faq.a4': 'Refresh the page, restart the game through the executor and check Discord — we post live status there.',
      'faq.q5': 'Is there a mobile version?',
      'faq.a5': 'The Android version is in beta. iOS is not available yet due to platform restrictions.',

      'footer.tagline': 'Powerful universal script for Roblox. Fast. Stable. Free.',
      'footer.col_site': 'Site',
      'footer.col_social': 'Community',
      'footer.col_legal': 'Legal',
      'footer.terms': 'Terms of Service',
      'footer.privacy': 'Privacy Policy',
      'footer.disclaimer_link': 'Disclaimer',
      'footer.rights': '© 2026 kawaz1k.win — all rights reserved',
      'footer.status': 'All systems operational',
      'footer.note': 'This site is not affiliated with Roblox Corporation. Using third-party scripts may violate the game rules — all material is provided for informational purposes only.'
    }
  };

  const META = {
    ru: {
      title: 'kawaz1k.win — мощный скрипт для Roblox',
      description: 'kawaz1k.win — быстрый, стабильный и бесплатный универсальный скрипт для Roblox. Один скрипт на любую игру.'
    },
    en: {
      title: 'kawaz1k.win — powerful Roblox script',
      description: 'kawaz1k.win — a fast, stable and free universal script for Roblox. One script for any game.'
    }
  };

  const STORE_KEY = 'kawaz-lang';
  let current = 'ru';
  const listeners = [];

  const apply = lang => {
    if (!I18N[lang]) lang = 'ru';
    current = lang;

    const dict = I18N[lang];
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const val = dict[el.dataset.i18n];
      if (val != null) el.innerHTML = val;
    });
    document.querySelectorAll('[data-i18n-ph]').forEach(el => {
      const val = dict[el.dataset.i18nPh];
      if (val != null) el.setAttribute('placeholder', val);
    });
    document.querySelectorAll('[data-i18n-aria]').forEach(el => {
      const val = dict[el.dataset.i18nAria];
      if (val != null) el.setAttribute('aria-label', val);
    });

    document.documentElement.lang = lang;
    document.title = META[lang].title;
    const meta = document.querySelector('meta[name="description"]');
    if (meta) meta.setAttribute('content', META[lang].description);

    document.querySelectorAll('.lang__btn').forEach(b => {
      b.classList.toggle('is-active', b.dataset.lang === lang);
    });

    try { localStorage.setItem(STORE_KEY, lang); } catch (e) {}

    listeners.forEach(fn => { try { fn(lang); } catch (e) {} });
  };

  const init = () => {
    let saved = null;
    try { saved = localStorage.getItem(STORE_KEY); } catch (e) {}
    const browser = (navigator.language || 'ru').toLowerCase().startsWith('ru') ? 'ru' : 'en';
    apply(saved || browser);

    document.getElementById('lang')?.addEventListener('click', e => {
      const btn = e.target.closest('.lang__btn');
      if (btn && btn.dataset.lang !== current) apply(btn.dataset.lang);
    });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.KawazI18n = {
    apply,
    t: k => (I18N[current] && I18N[current][k] != null ? I18N[current][k] : k),
    onChange: fn => listeners.push(fn),
    get lang() { return current; }
  };
})();
