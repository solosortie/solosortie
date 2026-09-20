/* solosortie dashboard — Look: colour, type, theme, home layout, logo */
(function () {
  'use strict';
  const SS = window.SS;
  const { h, icon, clear } = SS;
  SS.routes = SS.routes || {};

  const KEYS = ['accent', 'theme', 'body_font', 'heading_font', 'text_size', 'home_hero', 'home_layout', 'posts_per_page', 'show_dates', 'show_reading_time', 'logo_url', 'favicon_url'];
  const HEX = /^#[0-9a-f]{6}$/i;

  SS.routes.look = async (view) => {
    const s = SS.state.settings;
    const v = {}; KEYS.forEach((k) => { v[k] = s[k] !== undefined ? s[k] : SS.DEFAULT_SETTINGS[k]; });

    /* live preview */
    const pv = h('div', { class: 'pvbox' },
      h('h4', null, 'A title, as readers see it'),
      h('p', { class: 'pv-sub' }, 'A subtitle sits beneath it, in the reading font.'),
      h('div', { class: 'pv-meta' }, 'Sep 15  ·  6 min read'),
      h('div', { class: 'pv-path' }, h('i'), h('i'), h('i')));
    function paintPreview() {
      const dark = v.theme === 'dark' || (v.theme === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
      pv.style.setProperty('--pv-paper', dark ? '#111716' : '#f6f7f5');
      pv.style.setProperty('--pv-ink', dark ? '#e3e9e7' : '#232d2c');
      pv.style.setProperty('--pv-accent', HEX.test(v.accent) ? (dark ? 'color-mix(in srgb, ' + v.accent + ' 72%, white)' : v.accent) : '#b0336f');
      pv.style.setProperty('--pv-head', v.heading_font === 'serif' ? 'var(--serif)' : 'var(--sans)');
      pv.style.setProperty('--pv-body', v.body_font === 'sans' ? 'var(--sans)' : 'var(--serif)');
      pv.style.setProperty('--pv-size', Math.round(v.text_size * 0.8) + 'px');
    }

    const set = (k) => (val) => { v[k] = val; paintPreview(); };
    const SWATCHES = ['#b0336f', '#2f6d5d', '#3a5f8f', '#a5562a', '#6d4c9f', '#8a6d1c', '#232d2c'];
    const swatchBox = h('div', { class: 'swatches' });
    const hexIn = h('input', { class: 'input input--code', value: v.accent, maxlength: 7, 'aria-label': 'Accent as hex', style: { maxWidth: '130px' } });
    const custom = h('input', { type: 'color', value: HEX.test(v.accent) ? v.accent : '#b0336f', 'aria-label': 'Pick any colour', class: 'swatch-custom' });
    function setAccent(c) { v.accent = c.toLowerCase(); hexIn.value = v.accent; custom.value = v.accent; paintSwatches(); paintPreview(); }
    function paintSwatches() {
      SS.fill(swatchBox, SWATCHES.map((c) => h('button', { class: 'swatch', type: 'button', title: c, 'aria-label': 'Use ' + c, 'aria-pressed': String(v.accent.toLowerCase() === c), style: { background: c }, onclick: () => setAccent(c) })),
        h('label', { class: 'swatch swatch--add', title: 'Pick any colour' }, icon('plus', 16), custom));
    }
    custom.addEventListener('input', () => setAccent(custom.value));
    hexIn.addEventListener('input', () => { if (HEX.test(hexIn.value)) setAccent(hexIn.value); });
    paintSwatches();

    const sizeOut = h('span', { class: 'muted' }, v.text_size + ' px');
    const size = h('input', { type: 'range', min: 17, max: 24, step: 1, value: v.text_size, style: { width: '220px' }, 'aria-label': 'Article text size', oninput: (e) => { v.text_size = Number(e.target.value); sizeOut.textContent = v.text_size + ' px'; paintPreview(); } });
    const perPage = h('input', { class: 'input', type: 'number', min: 1, max: 50, value: v.posts_per_page, style: { maxWidth: '110px' }, oninput: (e) => { v.posts_per_page = Math.max(1, Math.min(50, Number(e.target.value) || 10)); } });

    /* logo and favicon */
    function assetField(label, key, hint) {
      const box = h('div', { class: 'inline' });
      const paint = () => {
        SS.fill(box, v[key] ? h('img', { src: v[key], alt: '', style: { width: '48px', height: '48px', objectFit: 'cover', borderRadius: '10px', border: '1px solid var(--line)' } }) : h('span', { class: 'muted' }, 'Default mark'),
          h('button', { class: 'btn btn--small', type: 'button', onclick: async () => { const m = await SS.pickMedia(); if (m) { v[key] = m.url; paint(); } } }, v[key] ? 'Change' : 'Choose image'),
          v[key] ? h('button', { class: 'btn btn--small btn--quiet', type: 'button', onclick: () => { v[key] = ''; paint(); } }, 'Use default') : null);
      };
      paint();
      return SS.field(label, box, hint);
    }

    const save = h('button', { class: 'btn btn--primary', type: 'button', onclick: async () => {
      try { await SS.saveSettings(Object.fromEntries(KEYS.map((k) => [k, v[k]])), 'look'); } catch (e) { SS.fail(e); }
    } }, 'Save look');

    view.append(
      h('div', { class: 'head' }, h('h1', null, 'Look'), h('p', { class: 'head__note' }, 'Changes reach the public site as soon as you save.')),
      h('div', { class: 'lookgrid' },
        h('div', null,
          h('section', { class: 'section', style: { marginBottom: '28px' } }, h('h2', null, 'Colour and type'),
            SS.field('Accent', h('div', null, swatchBox, hexIn), 'Used for one thing only: the small dot at the end of each path.'),
            SS.field('Theme', SS.segmented([['light', 'Light'], ['dark', 'Dark'], ['auto', 'Match device']], v.theme, set('theme'))),
            SS.field('Reading font', SS.segmented([['serif', 'Serif'], ['sans', 'Sans']], v.body_font, set('body_font'))),
            SS.field('Title font', SS.segmented([['sans', 'Sans'], ['serif', 'Serif']], v.heading_font, set('heading_font'))),
            SS.field('Article text size', h('div', { class: 'inline' }, size, sizeOut))),
          h('section', { class: 'section', style: { marginBottom: '28px' } }, h('h2', null, 'Home page'),
            SS.field('Layout', SS.segmented([['list', 'List'], ['grid', 'Grid']], v.home_layout, set('home_layout'))),
            SS.field('Posts shown before "Older posts"', perPage),
            h('div', { class: 'switchrow' }, SS.switch(v.home_hero, (x) => { v.home_hero = x; }, 'Show the big post at the top')),
            h('div', { class: 'switchrow' }, SS.switch(v.show_dates, (x) => { v.show_dates = x; }, 'Show dates')),
            h('div', { class: 'switchrow' }, SS.switch(v.show_reading_time, (x) => { v.show_reading_time = x; }, 'Show reading time'))),
          h('section', { class: 'section', style: { marginBottom: '28px' } }, h('h2', null, 'Marks'),
            assetField('Logo', 'logo_url', 'Shown top left. Square images work best.'), assetField('Favicon', 'favicon_url', 'The small icon in the browser tab.')),
          save),
        h('div', null, pv)));
    paintPreview();
  };
})();
