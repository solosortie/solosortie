/* solosortie dashboard — Pages: about, footer, not-found text, navigation */
(function () {
  'use strict';
  const SS = window.SS;
  const { h, icon, clear } = SS;
  SS.routes = SS.routes || {};

  /* A small Markdown box with an image button and a preview toggle. */
  function mdField(value, onchange, placeholder) {
    let mode = 'write';
    const ta = h('textarea', { class: 'textarea', rows: 14, value, placeholder, style: { font: '400 18px/1.65 var(--serif)', minHeight: '280px' } });
    const pv = h('div', { class: 'prose', hidden: true, style: { minHeight: '280px', padding: '4px 2px' } });
    ta.addEventListener('input', () => onchange(ta.value));
    const seg = SS.segmented([['write', 'Write'], ['preview', 'Preview']], 'write', (m) => { mode = m; ta.hidden = m !== 'write'; pv.hidden = m !== 'preview'; if (m === 'preview') pv.innerHTML = SS.md(ta.value) || '<p class="muted">Nothing here yet.</p>'; });
    const img = h('button', { class: 'btn btn--small', type: 'button', onclick: async () => {
      const m = await SS.pickMedia(); if (!m) return;
      const s = ta.selectionStart; ta.setRangeText(`\n\n![${m.alt || ''}](${m.url})\n\n`, s, ta.selectionEnd, 'end'); onchange(ta.value); ta.focus();
    } }, icon('media', 15), 'Add image');
    return h('div', null, h('div', { class: 'inline', style: { marginBottom: '10px' } }, seg, img), ta, pv);
  }

  const TEXT_TABS = {
    about: ['About', 'about_md', 'The About page. Leave it empty and the page stays blank.'],
    footer: ['Footer', 'footer_md', 'A few words at the bottom of every page. Leave it empty for none.'],
    notfound: ['Not found', 'notfound_md', 'Shown when a page or post does not exist. Leave it empty for a blank page.']
  };

  SS.routes.pages = async (view) => {
    const s = SS.state.settings;
    let tab = sessionStorage.getItem('ss:pgtab') || 'about';
    const body = h('div');
    const tabs = h('div', { class: 'tabs', role: 'tablist' });
    const draft = {
      about_md: s.about_md || '', footer_md: s.footer_md || '', notfound_md: s.notfound_md || '',
      nav: JSON.parse(JSON.stringify(Array.isArray(s.nav) ? s.nav : SS.DEFAULT_SETTINGS.nav))
    };

    function paintTabs() {
      clear(tabs);
      [...Object.entries(TEXT_TABS).map(([id, t]) => [id, t[0]]), ['nav', 'Navigation']].forEach(([id, label]) =>
        tabs.append(h('button', { type: 'button', role: 'tab', 'aria-selected': String(tab === id), onclick: () => { tab = id; sessionStorage.setItem('ss:pgtab', id); paintTabs(); paintBody(); } }, label)));
    }

    function navEditor() {
      const list = h('ul', { class: 'navlist' });
      const paint = () => {
        clear(list);
        draft.nav.forEach((n, i) => {
          const label = h('input', { class: 'input', value: n.label, placeholder: 'Label', 'aria-label': 'Label', oninput: (e) => { n.label = e.target.value; } });
          const href = h('input', { class: 'input', value: n.href, placeholder: '/archive', 'aria-label': 'Address', oninput: (e) => { n.href = e.target.value.trim(); } });
          const swap = (d) => () => { const j = i + d; if (j < 0 || j >= draft.nav.length) return; [draft.nav[i], draft.nav[j]] = [draft.nav[j], draft.nav[i]]; paint(); };
          list.append(h('li', null, label, href, SS.switch(n.visible !== false, (x) => { n.visible = x; }, 'Show'),
            h('div', { class: 'btnrow' },
              h('button', { class: 'iconbtn', type: 'button', title: 'Move up', 'aria-label': 'Move up', disabled: i === 0, onclick: swap(-1) }, icon('up', 16)),
              h('button', { class: 'iconbtn', type: 'button', title: 'Move down', 'aria-label': 'Move down', disabled: i === draft.nav.length - 1, onclick: swap(1) }, icon('down', 16)),
              h('button', { class: 'iconbtn', type: 'button', title: 'Remove', 'aria-label': 'Remove', onclick: () => { draft.nav.splice(i, 1); paint(); } }, icon('trash', 16)))));
        });
        if (!draft.nav.length) list.append(h('li', { class: 'muted' }, 'No links. The menu bar will be hidden.'));
      };
      paint();
      return h('div', null,
        h('p', { class: 'field__hint', style: { marginBottom: '12px' } }, 'Links start with / for pages on this site (/, /archive, /about) or with https:// for anywhere else. The bar is hidden when fewer than two links are shown.'),
        list,
        h('div', { class: 'inline' },
          h('button', { class: 'btn btn--small', type: 'button', onclick: () => { draft.nav.push({ label: '', href: '/', visible: true }); paint(); } }, icon('plus', 15), 'Add link'),
          h('button', { class: 'btn btn--small btn--quiet', type: 'button', onclick: () => { draft.nav = JSON.parse(JSON.stringify(SS.DEFAULT_SETTINGS.nav)); paint(); } }, 'Reset to default')));
    }

    function paintBody() {
      clear(body);
      if (tab === 'nav') {
        body.append(navEditor(), h('div', { style: { marginTop: '22px' } }, h('button', { class: 'btn btn--primary', type: 'button', onclick: async () => {
          const clean = draft.nav.filter((n) => n.label.trim() && n.href.trim()).map((n) => ({ label: n.label.trim(), href: n.href.trim(), visible: n.visible !== false }));
          try { await SS.saveSettings({ nav: clean }, 'navigation'); draft.nav = JSON.parse(JSON.stringify(clean)); paintBody(); } catch (e) { SS.fail(e); }
        } }, 'Save navigation')));
        return;
      }
      const [label, key, hint] = TEXT_TABS[tab];
      body.append(h('p', { class: 'field__hint', style: { marginBottom: '14px' } }, hint),
        mdField(draft[key], (val) => { draft[key] = val; }, 'Write in Markdown…'),
        h('div', { style: { marginTop: '18px' } }, h('button', { class: 'btn btn--primary', type: 'button', onclick: async () => {
          try { await SS.saveSettings({ [key]: draft[key] }, label.toLowerCase() + ' text'); } catch (e) { SS.fail(e); }
        } }, 'Save ' + label.toLowerCase())));
    }

    view.append(h('div', { class: 'head' }, h('h1', null, 'Pages')), tabs, h('div', { class: 'section', style: { paddingTop: '22px' } }, body));
    paintTabs(); paintBody();
  };
})();
