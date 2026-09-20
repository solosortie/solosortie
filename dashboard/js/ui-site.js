/* solosortie dashboard: Site: live / maintenance / down, identity, search engines */
(function () {
  'use strict';
  const SS = window.SS;
  const { h, icon, clear } = SS;
  SS.routes = SS.routes || {};

  /* Save settings, keep the in-memory copy and the sidebar in step, log it. */
  SS.saveSettings = async (patch, note) => {
    await SS.DB.settings.set(patch);
    Object.assign(SS.state.settings, patch);
    SS.paintSide();
    SS.DB.activity.log('settings', note || Object.keys(patch).join(', '));
    SS.toast('Saved');
  };

  SS.routes.site = async (view) => {
    const s = SS.state.settings;
    let state = s.site_state || 'live';
    const OPTS = [
      ['live', 'dot', 'Live', 'Everyone can read the site.'],
      ['maintenance', 'half', 'Maintenance', 'Visitors see only your message. Posts are not served.'],
      ['down', 'ring', 'Down', 'Visitors see a blank page. Nothing is served at all.']
    ];
    const board = h('div', { class: 'stateboard' });
    const msg = h('textarea', { class: 'textarea', rows: 4, placeholder: 'Leave empty for a blank page. Markdown works.', value: s.down_message || '' });
    const msgField = SS.field('Message for visitors', msg);
    const applyBtn = h('button', { class: 'btn btn--primary', type: 'button' }, 'Apply');
    const current = h('p', { class: 'field__hint' });

    function paintBoard() {
      clear(board);
      OPTS.forEach(([v, glyph, label, text]) => board.append(h('button', { class: 'state-opt', type: 'button', 'aria-pressed': String(state === v), onclick: () => { state = v; paintBoard(); } },
        h('b', null, h('i', { class: 'glyph glyph--' + glyph }), label), h('span', null, text))));
      msgField.hidden = state !== 'maintenance';
      const now = s.site_state || 'live';
      current.textContent = 'Right now: ' + OPTS.find((o) => o[0] === now)[2].toLowerCase() + '.';
      applyBtn.disabled = state === now && (state !== 'maintenance' || msg.value === (s.down_message || ''));
    }
    msg.addEventListener('input', paintBoard);

    applyBtn.onclick = async () => {
      if (state === 'down' && !(await SS.confirm({ title: 'Put the site down?', text: 'Visitors will see a blank page until you bring it back. Your dashboard keeps working.', ok: 'Put it down' }))) return;
      try {
        await SS.saveSettings({ site_state: state, down_message: msg.value }, 'site ' + state);
        paintBoard();
        SS.toast(state === 'live' ? 'The site is live' : state === 'down' ? 'The site is down' : 'Maintenance is on');
      } catch (e) { SS.fail(e); }
    };

    /* identity */
    const name = h('input', { class: 'input', value: s.site_name || '' });
    const desc = h('textarea', { class: 'textarea', rows: 3, value: s.meta_description || '', placeholder: 'Used by search engines and link previews. Optional.' });
    const ogBox = h('div', { class: 'inline' });
    let og = s.og_image || '';
    function paintOg() {
      SS.fill(ogBox, og ? h('img', { src: og, alt: '', style: { width: '96px', height: '64px', objectFit: 'cover', borderRadius: '6px' } }) : null,
        h('button', { class: 'btn btn--small', type: 'button', onclick: async () => { const m = await SS.pickMedia(); if (m) { og = m.url; paintOg(); } } }, og ? 'Change' : 'Choose image'),
        og ? h('button', { class: 'btn btn--small btn--quiet', type: 'button', onclick: () => { og = ''; paintOg(); } }, 'Remove') : null);
    }
    let robots = s.robots_index !== false;

    view.append(
      h('div', { class: 'head' }, h('h1', null, 'Site'), h('p', { class: 'head__note' }, 'Take the whole site offline, or bring it back, in one click.')),
      h('section', { class: 'section' }, h('h2', null, 'Status'), board, msgField, h('div', { class: 'inline' }, applyBtn, current)),
      h('hr', { class: 'hr' }),
      h('section', { class: 'section' }, h('h2', null, 'Identity'), h('p', null, 'The name appears at the top of every page and in browser tabs.'),
        SS.field('Site name', name), SS.field('Description', desc), SS.field('Default share image', ogBox, 'Shown when a link to the site is shared and the post has no image of its own.'),
        h('div', { class: 'switchrow' }, SS.switch(robots, (v) => { robots = v; }, 'Let search engines list this site')),
        h('div', { class: 'inline', style: { marginTop: '14px' } }, h('button', { class: 'btn btn--primary', type: 'button', onclick: async () => {
          try { await SS.saveSettings({ site_name: name.value.trim() || 'solosortie', meta_description: desc.value.trim(), og_image: og, robots_index: robots }, 'identity'); const b = SS.$('.brand b'); if (b) b.textContent = SS.state.settings.site_name; } catch (e) { SS.fail(e); }
        } }, 'Save'))));
    paintBoard(); paintOg();
  };
})();
