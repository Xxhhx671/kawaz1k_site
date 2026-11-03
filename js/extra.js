/* ============================================================
   kawaz1k.win — extra: mobile drawer open animation, scripts re-init
   ============================================================ */
(() => {
  'use strict';

  // Reset coder modal on open
  document.addEventListener('click', e => {
    if (e.target.closest('[data-open="modalCoder"]') || e.target.id === 'openCoderBtn') {
      setTimeout(() => {
        const form = document.getElementById('coderForm');
        const success = document.getElementById('coderSuccess');
        if (form) {
          form.hidden = false;
          form.reset();
          // reset photos preview
          const prev = document.getElementById('cf_photos_preview');
          if (prev) prev.innerHTML = '';
        }
        if (success) success.hidden = true;
        // show step 1, hide rest
        document.querySelectorAll('.coder-form__step').forEach((s, i) => { s.hidden = i !== 0; });
      }, 50);
    }
  });
})();
