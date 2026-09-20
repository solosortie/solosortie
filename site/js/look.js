/* Applies the saved look before first paint, so a dark or re-coloured site never flashes light.
   Loaded synchronously in <head>. app.js calls SSLook.apply() again with fresh settings. */
(function () {
  var KEY = 'ss:look';
  var HEX = /^#[0-9a-f]{6}$/i;
  function apply(s) {
    var r = document.documentElement;
    var theme = ['light', 'dark', 'auto'].indexOf(s.theme) > -1 ? s.theme : 'light';
    r.setAttribute('data-theme', theme);
    r.setAttribute('data-body-font', s.body_font === 'sans' ? 'sans' : 'serif');
    r.setAttribute('data-head-font', s.heading_font === 'serif' ? 'serif' : 'sans');
    if (s.accent && HEX.test(s.accent)) r.style.setProperty('--accent', s.accent); else r.style.removeProperty('--accent');
    var size = Math.min(26, Math.max(16, Number(s.text_size) || 20));
    r.style.setProperty('--size', size + 'px');
  }
  function save(s) {
    try {
      localStorage.setItem(KEY, JSON.stringify({
        theme: s.theme, body_font: s.body_font, heading_font: s.heading_font, accent: s.accent, text_size: s.text_size
      }));
    } catch (e) {}
  }
  window.SSLook = { apply: apply, save: save };
  try { var c = JSON.parse(localStorage.getItem(KEY) || 'null'); if (c) apply(c); } catch (e) {}
})();
