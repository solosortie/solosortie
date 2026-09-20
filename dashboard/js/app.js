/* solosortie dashboard — shell: sign-in, navigation, routing, idle lock */
(function () {
  'use strict';
  const SS = window.SS;
  const { h, $, clear, icon } = SS;
  const root = document.getElementById('app');
  const CFG = window.SS_CONFIG || {};

  SS.state = { settings: null, user: null };
  SS.routes = SS.routes || {};
  SS.leaveGuard = null;
  SS.siteUrl = (path) => CFG.SITE_URL ? CFG.SITE_URL.replace(/\/$/, '') + (path || '') : null;

  const configured = /^https?:\/\/.+/.test(CFG.SUPABASE_URL || '') && (CFG.SUPABASE_ANON_KEY || '').length > 20;
  if (!configured) {
    root.className = ''; clear(root);
    root.append(h('div', { class: 'gate' }, h('div', { class: 'gate__box' },
      h('img', { class: 'gate__mark', src: 'assets/mark.svg', alt: '' }), h('h1', null, 'Connect your database'),
      h('p', { class: 'gate__msg' }, 'Open js/config.js and paste your Supabase project URL and anon key, then reload.'),
      h('code', { class: 'gate__sql' }, 'window.SS_CONFIG = {\n  SUPABASE_URL: "https://xxxx.supabase.co",\n  SUPABASE_ANON_KEY: "eyJ...",\n  SITE_URL: "https://your-site"\n};'))));
    return;
  }
  let DB;
  try { DB = SS.DB = SS.supabaseDB(); }
  catch (e) { root.className = ''; clear(root); root.append(h('div', { class: 'gate' }, h('div', { class: 'gate__box' }, h('h1', null, 'Could not start'), h('p', { class: 'gate__msg gate__msg--error' }, e.message)))); throw e; }

  const NAV = [
    ['posts', 'Posts', 'posts'], ['media', 'Media', 'media'], ['pages', 'Pages', 'pages'], ['look', 'Look', 'look'],
    ['site', 'Site', 'power'], ['backups', 'Backups', 'backup'], ['security', 'Security', 'shield'], ['activity', 'Activity', 'pulse']
  ];

  /* ── sign in ─────────────────────────────────────────── */
  function gate(children) {
    root.className = ''; clear(root);
    root.append(h('div', { class: 'gate' }, h('div', { class: 'gate__box' },
      h('img', { class: 'gate__mark', src: 'assets/mark.svg', alt: '' }), children)));
  }

  function signIn(message, isError) {
    const err = h('p', { class: 'gate__msg' + (isError ? ' gate__msg--error' : ''), hidden: !message, role: 'alert' }, message || '');
    const email = h('input', { class: 'input', type: 'email', autocomplete: 'username', required: true, value: localStorage.getItem('ss:email') || '' });
    const pw = h('input', { class: 'input', type: 'password', autocomplete: 'current-password', required: true });
    const btn = h('button', { class: 'btn btn--primary', type: 'submit' }, 'Sign in');
    const form = h('form', { onsubmit: async (e) => {
      e.preventDefault(); err.hidden = true; btn.disabled = true;
      try {
        const r = await DB.auth.signIn(email.value.trim(), pw.value);
        localStorage.setItem('ss:email', email.value.trim());
        if (r.mfa) return codeStep(r.mfa);
        await start(true);
      } catch (ex) { err.textContent = ex.message; err.className = 'gate__msg gate__msg--error'; err.hidden = false; btn.disabled = false; pw.select(); }
    } },
      SS.field('Email', email), SS.field('Password', pw), btn);
    gate([h('h1', null, 'Sign in'), err, form]);
    (email.value ? pw : email).focus();
  }

  function codeStep(factorId) {
    const err = h('p', { class: 'gate__msg gate__msg--error', hidden: true, role: 'alert' });
    const code = h('input', { class: 'input', inputmode: 'numeric', autocomplete: 'one-time-code', maxlength: 8, required: true, placeholder: '123456' });
    const btn = h('button', { class: 'btn btn--primary', type: 'submit' }, 'Verify');
    gate([h('h1', null, 'Enter your code'), err,
      h('form', { onsubmit: async (e) => {
        e.preventDefault(); err.hidden = true; btn.disabled = true;
        try { await DB.auth.verifyMfa(factorId, code.value); await start(true); }
        catch (ex) { err.textContent = ex.message; err.hidden = false; btn.disabled = false; code.select(); }
      } }, SS.field('Six-digit code from your authenticator app', code), btn,
        h('button', { class: 'btn btn--quiet', type: 'button', style: { marginTop: '8px' }, onclick: async () => { await DB.auth.signOut(); signIn(); } }, 'Back'))]);
    code.focus();
  }

  function notAdmin(email) {
    const sql = `insert into public.admins (user_id)\nselect id from auth.users where email = '${String(email).replace(/'/g, "''")}';`;
    gate([h('h1', null, 'Almost there'),
      h('p', { class: 'gate__msg' }, 'You are signed in, but this account is not set up as the owner yet. Run this once in the Supabase SQL Editor, then reload:'),
      h('code', { class: 'gate__sql' }, sql),
      h('p', { class: 'gate__note' }, 'If you already ran it and you turned on two-factor sign-in, sign out and sign in again so the code step happens.'),
      h('button', { class: 'btn', type: 'button', style: { marginTop: '16px' }, onclick: async () => { await DB.auth.signOut(); signIn(); } }, 'Sign out')]);
  }

  /* ── shell ───────────────────────────────────────────── */
  const STATE_LABEL = { live: ['dot', 'Site is live'], maintenance: ['half', 'Maintenance'], down: ['ring', 'Site is down'] };
  SS.paintSide = () => {
    const el = $('#state-link'); if (!el) return;
    const [glyph, label] = STATE_LABEL[(SS.state.settings || {}).site_state] || STATE_LABEL.live;
    clear(el).append(h('i', { class: 'glyph glyph--' + glyph }), h('span', { class: 'lbl' }, label)); el.title = label;
  };

  const collapsedKey = 'ss:side';
  function shell() {
    root.className = ''; clear(root);
    const collapsed = localStorage.getItem(collapsedKey) === '1';
    const toggle = h('button', { class: 'linkbtn', id: 'side-toggle', type: 'button', onclick: () => setCollapsed($('.shell').dataset.collapsed !== 'true') }, icon('sidebar', 19));
    const me = h('div', { class: 'side__me' }, h('span', { title: SS.state.user.email }, SS.state.user.email),
      h('button', { class: 'linkbtn', type: 'button', title: 'Sign out', 'aria-label': 'Sign out', onclick: () => lock() }, icon('logout', 18)));
    root.append(h('div', { class: 'shell', 'data-collapsed': String(collapsed) },
      h('aside', { class: 'side' },
        h('div', { class: 'side__head' },
          h('a', { class: 'brand', href: '#/posts', title: SS.state.settings.site_name || 'solosortie' }, h('img', { src: 'assets/mark.svg', alt: '' }), h('b', null, SS.state.settings.site_name || 'solosortie')), toggle),
        h('nav', { class: 'nav', 'aria-label': 'Sections' }, NAV.map(([id, label, ic]) => h('a', { href: '#/' + id, 'data-nav': id, title: label }, icon(ic), h('span', { class: 'lbl' }, label)))),
        h('div', { class: 'side__foot' },
          SS.siteUrl() ? h('a', { class: 'state-link', href: SS.siteUrl(), target: '_blank', rel: 'noopener', title: 'View site' }, icon('external', 18), h('span', { class: 'lbl' }, 'View site')) : null,
          h('a', { class: 'state-link', id: 'state-link', href: '#/site' }), me)),
      h('main', { class: 'main', id: 'view', tabindex: '-1' })));
    setCollapsed(collapsed);
    SS.paintSide();
  }
  function setCollapsed(on) {
    const el = $('.shell'); if (!el) return;
    el.dataset.collapsed = String(on);
    localStorage.setItem(collapsedKey, on ? '1' : '0');
    const t = $('#side-toggle');
    if (t) { t.setAttribute('aria-expanded', String(!on)); const label = on ? 'Expand sidebar' : 'Collapse sidebar'; t.title = label; t.setAttribute('aria-label', label); }
  }

  /* ── router ──────────────────────────────────────────── */
  let lastHash = '', skip = false, cleanup = null, token = 0;
  SS.setHash = (hash) => { history.replaceState(null, '', hash); lastHash = hash; };
  SS.go = (hash) => { location.hash = hash; };

  async function render() {
    const view = $('#view'); if (!view) return;
    const parts = (location.hash.replace(/^#\/?/, '') || 'posts').split('/');
    const name = parts[0], args = parts.slice(1);
    const route = SS.routes[name] || SS.routes.posts;
    const nav = SS.routes[name] ? name : 'posts';
    const mine = ++token;
    view.className = 'main' + (name === 'edit' ? ' main--edit' : '');
    if (cleanup) { try { cleanup(); } catch (e) { console.error(e); } cleanup = null; }
    SS.$$('.nav a').forEach((a) => {
      if (a.dataset.nav === (nav === 'edit' ? 'posts' : nav)) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    clear(view).append(h('p', { class: 'muted' }, 'Loading…'));
    try {
      const wrap = h('div');
      const c = await route(wrap, args);
      if (mine !== token) { if (typeof c === 'function') c(); return; }
      clear(view).append(wrap); cleanup = typeof c === 'function' ? c : null;
      window.scrollTo(0, 0);
    } catch (e) {
      SS.fail(e);
      if (mine === token) clear(view).append(h('div', { class: 'empty' }, h('p', null, 'This page could not load. ' + (e.message || '')), h('a', { class: 'btn', href: '#/posts' }, 'Back to posts')));
    }
  }
  window.addEventListener('hashchange', async () => {
    if (skip) { skip = false; return; }
    if (SS.leaveGuard) {
      const ok = await SS.leaveGuard();
      if (!ok) { skip = true; location.hash = lastHash; return; }
      SS.leaveGuard = null;
    }
    lastHash = location.hash; render();
  });
  window.addEventListener('beforeunload', (e) => { if (SS.leaveGuard && SS.leaveGuard.sync && SS.leaveGuard.sync()) { e.preventDefault(); e.returnValue = ''; } });

  /* ── idle lock ───────────────────────────────────────── */
  let idleT = 0, lastArm = 0;
  SS.armIdle = () => {
    clearTimeout(idleT);
    const mins = Number(localStorage.getItem('ss:idle')) || 0;
    if (!mins || !SS.state.user) return;
    idleT = setTimeout(() => lock('You were signed out after ' + mins + ' minutes of inactivity.'), mins * 60000);
  };
  ['mousemove', 'keydown', 'click', 'touchstart', 'scroll'].forEach((ev) => window.addEventListener(ev, () => {
    const t = Date.now(); if (t - lastArm > 4000) { lastArm = t; SS.armIdle(); }
  }, { passive: true }));

  async function lock(message) {
    if (SS.leaveGuard && SS.leaveGuard.sync && SS.leaveGuard.sync() && !message) {
      if (!(await SS.confirm({ title: 'Sign out?', text: 'You have unsaved changes in this post. They are kept on this device, but not saved online.', ok: 'Sign out' }))) return;
    }
    clearTimeout(idleT);
    try { await DB.auth.signOut(); } catch (e) { /* already gone */ }
    SS.state.user = null; SS.leaveGuard = null; if (cleanup) { cleanup(); cleanup = null; }
    signIn(message);
  }
  DB.auth.onSignOut(() => { if (SS.state.user) { SS.state.user = null; signIn('You were signed out.'); } });

  /* ── boot ────────────────────────────────────────────── */
  async function start(fresh) {
    const session = await DB.auth.session();
    if (!session) return signIn();
    if (!(await DB.auth.isAdmin())) return notAdmin(session.email);
    SS.state.user = session;
    SS.state.settings = await DB.settings.get();
    if (fresh) DB.activity.log('login', (navigator.userAgent || '').slice(0, 120));
    shell(); SS.armIdle();
    lastHash = location.hash || '#/posts';
    if (!location.hash) SS.setHash('#/posts');
    render();
  }

  start(false).catch((e) => { console.error(e); signIn(e.message || 'Could not reach the server.', true); });
})();
