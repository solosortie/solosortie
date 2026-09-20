/* solosortie dashboard — Editor
   A wide, quiet page to write on. Everything about the post lives in a drawer that stays closed until asked for. */
(function () {
  'use strict';
  const SS = window.SS;
  const { h, icon, clear } = SS;
  SS.routes = SS.routes || {};

  const STATUS_OPTIONS = [
    { value: 'draft', label: 'Draft', glyph: 'ring', hint: 'Only you can see it.' },
    { value: 'published', label: 'Published', glyph: 'dot', hint: 'Live and listed on the site.' },
    { value: 'scheduled', label: 'Scheduled', glyph: 'half', hint: 'Goes live by itself at the date you set.' },
    { value: 'hidden', label: 'Hidden', glyph: 'dot-quiet', hint: 'Not listed. Anyone with the link can read it.' },
    { value: 'unpublished', label: 'Unpublished', glyph: 'ring-quiet', hint: 'Taken down. Only you can see it.' },
    { value: 'archived', label: 'Archived', glyph: 'dash', hint: 'Kept on the Archive page only.' }
  ];
  const NATIVE_GROW = !!(window.CSS && CSS.supports && CSS.supports('field-sizing', 'content'));

  SS.routes.edit = async (view, args) => {
    const DB = SS.DB, cfg = SS.state.settings;
    const id = args[0] && args[0] !== 'new' ? args[0] : null;
    const post = id ? await DB.posts.get(id) : SS.newPost();
    if (post.deleted_at) throw new Error('This post is in the trash. Restore it from the Posts screen first.');
    const original = JSON.parse(JSON.stringify(post));

    let dirty = false, seq = 0, saving = false, again = false, slugTouched = !!post.slug;
    let mode = sessionStorage.getItem('ss:edmode') || 'write';
    let panelOpen = localStorage.getItem('ss:edpanel') === '1';
    const bkKey = () => 'ss:bk:' + (post.id || 'new');

    /* ── save state ──────────────────────────────────── */
    const stateEl = h('span', { class: 'edtop__state', role: 'status' });
    const setState = (t) => { stateEl.textContent = t; };
    const backup = SS.debounce(() => { try { localStorage.setItem(bkKey(), JSON.stringify({ at: Date.now(), post: { ...post } })); } catch (e) { /* storage full */ } }, 600);
    const autosave = SS.debounce(() => {
      if (dirty && ['draft', 'unpublished'].includes(post.status) && (post.title.trim() || post.body.trim())) save({ auto: true });
    }, 2500);
    function touch() { seq++; dirty = true; setState('Unsaved changes'); backup(); autosave(); refreshBar(); }
    SS.leaveGuard = async () => (!dirty ? true : SS.confirm({ title: 'Leave without saving?', text: 'You have changes that are not saved online yet. A copy is kept on this device.', ok: 'Leave' }));
    SS.leaveGuard.sync = () => dirty;

    function settle(p) {
      p.title = p.title.trim();
      p.slug = SS.slugify(p.slug || p.title) || 'untitled-' + SS.uid().slice(0, 6);
      p.tags = (p.tags || []).map((t) => String(t).trim()).filter(Boolean);
      if (p.status === 'published' || p.status === 'scheduled') {
        const at = p.published_at ? new Date(p.published_at) : null;
        if (!at) { p.status = 'published'; p.published_at = new Date().toISOString(); }
        else p.status = at.getTime() > Date.now() + 30000 ? 'scheduled' : 'published';
      } else if ((p.status === 'hidden' || p.status === 'archived') && !p.published_at) p.published_at = new Date().toISOString();
      if (p.status !== 'published') p.featured = false;
      return p;
    }

    async function save({ auto = false } = {}) {
      if (saving) { again = true; return false; }
      if (!post.title.trim() && !post.body.trim() && !post.id) { if (!auto) SS.toast('Write something first.', 'error'); return false; }
      saving = true; setState('Saving…');
      const mine = seq, prevStatus = post.id ? original.status : null, wasNew = !post.id;
      try {
        const res = await DB.posts.save(settle({ ...post }));
        Object.assign(post, { id: res.id, slug: res.slug, status: res.status, published_at: res.published_at, featured: res.featured, has_password: res.has_password, updated_at: res.updated_at });
        Object.assign(original, JSON.parse(JSON.stringify(post)));
        if (seq === mine) { dirty = false; backup.cancel(); localStorage.removeItem('ss:bk:new'); localStorage.removeItem(bkKey()); }
        syncControls();
        setState((auto ? 'Autosaved ' : 'Saved ') + new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }));
        if (wasNew) SS.setHash('#/edit/' + res.id);
        if (res.status !== prevStatus && (prevStatus || res.status !== 'draft')) DB.activity.log(res.status === 'published' ? 'publish' : res.status, res.title || res.slug);
        return true;
      } catch (e) {
        setState('Not saved');
        if (e.code === 'slug_taken') { SS.toast('Another post already uses that address. Change it and save again.', 'error'); openPanel(true); slugInput.focus(); }
        else SS.fail(e, 'Could not save');
        return false;
      } finally {
        saving = false;
        if (again) { again = false; if (dirty) save({ auto: true }); }
        refreshBar();
      }
    }

    /* ── the page: title, subtitle, body ─────────────── */
    const grow = (el) => {
      if (NATIVE_GROW || !el.isConnected) return;
      const p = el.parentElement; p.style.minHeight = p.offsetHeight + 'px';
      el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; p.style.minHeight = '';
    };
    const titleIn = h('textarea', { class: 'ed-title', rows: 1, placeholder: 'Title', 'aria-label': 'Title', autocomplete: 'off', spellcheck: 'true', value: post.title });
    const subIn = h('textarea', { class: 'ed-sub', rows: 1, placeholder: 'Subtitle', 'aria-label': 'Subtitle', autocomplete: 'off', spellcheck: 'true', value: post.subtitle });
    const ta = h('textarea', { class: 'ta', placeholder: 'Start writing', spellcheck: 'true', 'aria-label': 'Post body', value: post.body });
    const pvHead = h('div', { class: 'pv-head' });
    const pvBody = h('div', { class: 'prose' });
    const foot = h('div', { class: 'edfoot' });

    const paintPreview = SS.debounce(() => {
      SS.fill(pvHead,
        post.cover_url ? h('img', { src: post.cover_url, alt: '', style: { width: '100%', borderRadius: '6px', marginBottom: '28px', display: 'block' } }) : null,
        post.title ? h('h2', null, post.title) : null, post.subtitle ? h('p', null, post.subtitle) : null);
      pvBody.innerHTML = post.body.trim() ? SS.md(post.body) : '<p class="pv-empty">Nothing to show yet.</p>';
      const w = SS.words(post.body);
      SS.fill(foot, h('span', null, `${w.toLocaleString()} word${w === 1 ? '' : 's'}`), h('span', null, `${post.reading_minutes || SS.readMin(post.body)} min read`));
      readAuto.textContent = 'Automatic: ' + SS.readMin(post.body) + ' min';
    }, 120);

    titleIn.addEventListener('input', () => {
      post.title = titleIn.value.replace(/\n/g, ' ');
      if (!slugTouched) { post.slug = SS.slugify(post.title); slugInput.value = post.slug; }
      grow(titleIn); touch(); paintPreview();
    });
    titleIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); subIn.focus(); } });
    subIn.addEventListener('input', () => { post.subtitle = subIn.value.replace(/\n/g, ' '); grow(subIn); touch(); paintPreview(); });
    subIn.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); ta.focus(); ta.setSelectionRange(0, 0); }
      else if (e.key === 'Backspace' && !subIn.value) { e.preventDefault(); titleIn.focus(); titleIn.setSelectionRange(titleIn.value.length, titleIn.value.length); }
    });
    const sync = () => { post.body = ta.value; grow(ta); touch(); paintPreview(); };
    ta.addEventListener('input', sync);

    /* ── text editing that keeps the browser's undo history ── */
    function apply(start, end, text, selS, selE) {
      ta.focus(); ta.setSelectionRange(start, end);
      let done = false;
      try { done = text === '' ? (start === end || document.execCommand('delete')) : document.execCommand('insertText', false, text); } catch (e) { done = false; }
      if (!done) ta.setRangeText(text, start, end, 'end');
      const s = selS == null ? start + text.length : selS;
      ta.setSelectionRange(s, selE == null ? s : selE);
      sync();
    }
    function wrap(before, after = before, ph = 'text') {
      const v = ta.value, s = ta.selectionStart, e = ta.selectionEnd, sel = v.slice(s, e), b = before.length, a = after.length;
      if (sel && v.slice(s - b, s) === before && v.slice(e, e + a) === after) return apply(s - b, e + a, sel, s - b, s - b + sel.length);   // already wrapped outside: unwrap
      if (sel.length >= b + a && sel.startsWith(before) && sel.endsWith(after)) { const inner = sel.slice(b, sel.length - a); return apply(s, e, inner, s, s + inner.length); }
      const txt = sel || ph;
      apply(s, e, before + txt + after, s + b, s + b + txt.length);
    }
    const LEAD = /^(#{1,6}|>|[-*+]|\d+\.)\s+/;
    function lines(fn) {
      const v = ta.value, s = ta.selectionStart, e = ta.selectionEnd;
      const a = v.lastIndexOf('\n', s - 1) + 1, nl = v.indexOf('\n', e), b = nl === -1 ? v.length : nl;
      const out = fn(v.slice(a, b).split('\n')).join('\n');
      apply(a, b, out, a, a + out.length);
    }
    const prefix = (p, heading) => lines((ls) => {
      const all = ls.every((l) => l.startsWith(p));
      return ls.map((l) => (all ? l.slice(p.length) : p + l.replace(heading ? /^#{1,6}\s+/ : LEAD, '')));
    });
    const numbered = () => lines((ls) => {
      const all = ls.every((l) => /^\d+\.\s/.test(l));
      return ls.map((l, i) => (all ? l.replace(/^\d+\.\s/, '') : (i + 1) + '. ' + l.replace(LEAD, '')));
    });
    /* put a block of text on its own paragraph, whatever surrounds [s, e).
       sel = [from, length] selects part of it afterwards; without it the caret lands after the block. */
    function blockAt(text, s, e, sel) {
      const v = ta.value;
      const before = v.slice(Math.max(0, s - 2), s), after = v.slice(e, e + 2);
      const lead = s === 0 ? '' : before.endsWith('\n\n') ? '' : before.endsWith('\n') ? '\n' : '\n\n';
      const trail = e >= v.length ? '\n\n' : after.startsWith('\n\n') ? '' : after.startsWith('\n') ? '\n' : '\n\n';
      const whole = lead + text + trail;
      if (!sel) return apply(s, e, whole, s + whole.length);
      const at = s + lead.length + sel[0];
      apply(s, e, whole, at, at + sel[1]);
    }
    const block = (text, sel) => blockAt(text, ta.selectionStart, ta.selectionEnd, sel);
    const codeBlock = () => { const sel = ta.value.slice(ta.selectionStart, ta.selectionEnd) || 'code'; block('```\n' + sel + '\n```', [4, sel.length]); };
    const table = () => block('| Column | Column |\n| --- | --- |\n|  |  |', [2, 6]);
    async function link() {
      const s = ta.selectionStart, e = ta.selectionEnd, sel = ta.value.slice(s, e);
      const url = await SS.ask({ title: 'Add a link', label: 'Address', value: /^https?:\/\/\S+$/.test(sel) ? sel : '', placeholder: 'https://', ok: 'Add link' });
      if (!url) return ta.focus();
      const label = /^https?:\/\/\S+$/.test(sel) ? url : (sel || url);
      apply(s, e, `[${label}](${url.trim()})`);
    }
    async function image() {
      const s = ta.selectionStart, e = ta.selectionEnd;
      const m = await SS.pickMedia({ mode: 'insert' });
      if (!m) return ta.focus();
      blockAt(SS.imageMd(m), s, e);
    }
    const divider = () => block('---');

    const tool = (ic, label, fn) => h('button', { class: 'iconbtn', type: 'button', title: label, 'aria-label': label.replace(/ \(.*\)$/, ''), onclick: fn, onmousedown: (e) => e.preventDefault() },
      /^H\d$/.test(ic) ? h('span', { class: 'txt' }, ic) : icon(ic, 18));
    const sep = () => h('span', { class: 'sep', 'aria-hidden': 'true' });
    const tools = h('div', { class: 'tools', role: 'toolbar', 'aria-label': 'Formatting' },
      tool('bold', 'Bold (Ctrl+B)', () => wrap('**')), tool('italic', 'Italic (Ctrl+I)', () => wrap('*')), tool('strike', 'Strikethrough', () => wrap('~~')),
      sep(), tool('H2', 'Heading', () => prefix('## ', true)), tool('H3', 'Subheading', () => prefix('### ', true)),
      sep(), tool('quote', 'Quote', () => prefix('> ')), tool('list', 'Bulleted list', () => prefix('- ')), tool('ol', 'Numbered list', numbered),
      sep(), tool('link', 'Link (Ctrl+K)', link), tool('image', 'Image', image),
      sep(), tool('code', 'Inline code', () => wrap('`')), tool('codeblock', 'Code block', codeBlock), tool('table', 'Table', table), tool('minus', 'Divider', divider));

    ta.addEventListener('keydown', (e) => {
      const mod = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
      if (mod && !e.shiftKey && !e.altKey) {
        if (k === 'b') { e.preventDefault(); return wrap('**'); }
        if (k === 'i') { e.preventDefault(); return wrap('*'); }
        if (k === 'k') { e.preventDefault(); return link(); }
      }
      if (e.isComposing || ta.selectionStart !== ta.selectionEnd) return;
      const v = ta.value, s = ta.selectionStart, a = v.lastIndexOf('\n', s - 1) + 1, line = v.slice(a, s);
      const m = line.match(/^(\s*)([-*+]|\d+\.|>)\s(.*)$/);
      if (e.key === 'Enter' && !mod && !e.shiftKey && m) {                 // keep a list or quote going; an empty item ends it
        e.preventDefault();
        if (!m[3].trim()) return apply(a, s, '');
        const next = /\d/.test(m[2]) ? (parseInt(m[2], 10) + 1) + '.' : m[2];
        return apply(s, s, '\n' + m[1] + next + ' ');
      }
      if (e.key === 'Tab' && !mod && m && m[2] !== '>') {                   // indent or outdent a list item
        e.preventDefault();
        const nl = v.indexOf('\n', s), full = v.slice(a, nl === -1 ? v.length : nl);
        if (e.shiftKey) { if (full.startsWith('  ')) apply(a, a + 2, '', Math.max(a, s - 2)); }
        else apply(a, a, '  ', s + 2);
      }
    });
    const dropImages = async (files) => {
      const s = ta.selectionStart, e = ta.selectionEnd, made = await SS.uploadFiles(files);
      if (made.length) blockAt(made.map((x) => SS.imageMd(x)).join('\n\n'), s, e);
    };
    ta.addEventListener('paste', (e) => {
      const files = Array.from(e.clipboardData ? e.clipboardData.files : []).filter((f) => f.type.startsWith('image/'));
      if (!files.length) return;
      e.preventDefault(); dropImages(files);
    });
    ta.addEventListener('dragover', (e) => { if (e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files')) e.preventDefault(); });
    ta.addEventListener('drop', (e) => {
      const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith('image/'));
      if (!files.length) return;
      e.preventDefault(); dropImages(files);
    });
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save(); }
      else if (e.key === 'Escape' && panelOpen && matchMedia('(max-width: 1180px)').matches && !document.querySelector('.modal, .listbox, .dt, .menu')) openPanel(false);
    };
    document.addEventListener('keydown', onKey);

    /* ── the drawer ──────────────────────────────────── */
    const bind = (el, key, fn) => el.addEventListener('input', () => { post[key] = fn ? fn(el.value) : el.value; touch(); if (key === 'reading_minutes') paintPreview(); });
    const panel = (title, content, open = false) => h('details', { class: 'panel', open }, h('summary', null, title), h('div', { class: 'panel__body' }, content));

    const statusSel = SS.select({ options: STATUS_OPTIONS, value: post.status, label: 'Status', onchange: (v) => {
      post.status = v;
      if (v === 'published' && !post.published_at) { post.published_at = new Date().toISOString(); dateSel.set(post.published_at); }
      if (v === 'scheduled' && (!post.published_at || new Date(post.published_at) <= new Date())) {
        const d = new Date(Date.now() + 864e5); d.setHours(9, 0, 0, 0); post.published_at = d.toISOString(); dateSel.set(post.published_at);
      }
      touch();
    } });
    const dateSel = SS.datetime({ value: post.published_at, label: 'Publish date', onchange: (iso) => { post.published_at = iso; touch(); } });
    const slugInput = h('input', { class: 'input', value: post.slug, 'aria-label': 'Address', autocomplete: 'off', spellcheck: 'false' });
    slugInput.addEventListener('input', () => { slugTouched = true; post.slug = slugInput.value; touch(); });
    slugInput.addEventListener('blur', () => { slugInput.value = post.slug = SS.slugify(slugInput.value) || SS.slugify(post.title); });
    const swFeat = SS.switch(post.featured, (v) => { post.featured = v; touch(); }, 'Feature at the top of the home page');
    const swPin = SS.switch(post.pinned, (v) => { post.pinned = v; touch(); }, 'Pin to the top of lists');
    const swDate = SS.switch(post.show_date, (v) => { post.show_date = v; touch(); }, 'Show the date');

    const coverBox = h('div', { style: { marginBottom: '16px' } });
    const altIn = h('input', { class: 'input', value: post.cover_alt, placeholder: 'What is in the picture', 'aria-label': 'Cover description' }); bind(altIn, 'cover_alt');
    function paintCover() {
      SS.fill(coverBox,
        post.cover_url ? h('img', { class: 'cover-thumb', src: post.cover_url, alt: '' }) : h('div', { class: 'cover-empty' }, 'No cover image'),
        h('div', { class: 'inline' },
          h('button', { class: 'btn btn--small', type: 'button', onclick: async () => {
            const m = await SS.pickMedia({ mode: 'pick', confirm: 'Use as cover' });
            if (m) { post.cover_url = m.url; if (!post.cover_alt && m.alt) { post.cover_alt = m.alt; altIn.value = m.alt; } paintCover(); touch(); paintPreview(); }
          } }, post.cover_url ? 'Change' : 'Choose or upload'),
          post.cover_url ? h('button', { class: 'btn btn--small btn--quiet', type: 'button', onclick: () => { post.cover_url = ''; paintCover(); touch(); paintPreview(); } }, 'Remove') : null));
    }

    const excerpt = h('textarea', { class: 'textarea', rows: 3, value: post.excerpt, 'aria-label': 'Excerpt' }); bind(excerpt, 'excerpt');
    const tags = SS.chips({ value: post.tags || [], onchange: (v) => { post.tags = v; touch(); } });
    const readIn = h('input', { class: 'input', type: 'number', min: 1, max: 240, value: post.reading_minutes || '', placeholder: 'Automatic', 'aria-label': 'Reading time in minutes' });
    bind(readIn, 'reading_minutes', (v) => (v === '' ? null : Math.max(1, Math.round(Number(v)))));
    const readAuto = h('p', { class: 'field__hint' });

    const pwState = h('p', { class: 'field__hint', style: { margin: '0 0 12px' } });
    const pwIn = h('input', { class: 'input', type: 'password', autocomplete: 'new-password', placeholder: 'Password', 'aria-label': 'Post password' });
    const pwSet = h('button', { class: 'btn btn--small', type: 'button', onclick: async () => {
      if (pwIn.value.length < 4) return SS.toast('Use at least 4 characters.', 'error');
      if (!post.id && !(await save())) return;
      try { await DB.posts.setPassword(post.id, pwIn.value); post.has_password = true; original.has_password = true; pwIn.value = ''; paintPw(); DB.activity.log('password', post.title); SS.toast('Password set'); } catch (e) { SS.fail(e); }
    } }, 'Set password');
    const pwOff = h('button', { class: 'btn btn--small btn--quiet', type: 'button', onclick: async () => {
      try { await DB.posts.setPassword(post.id, null); post.has_password = false; original.has_password = false; paintPw(); SS.toast('Password removed'); } catch (e) { SS.fail(e); }
    } }, 'Remove');
    function paintPw() { pwState.textContent = post.has_password ? 'Readers need the password to open this post.' : 'Anyone who can reach this post can read it.'; pwSet.textContent = post.has_password ? 'Change password' : 'Set password'; pwOff.hidden = !post.has_password; }

    const mt = h('input', { class: 'input', value: post.meta_title, placeholder: 'Uses the title', 'aria-label': 'Page title' }); bind(mt, 'meta_title');
    const md = h('textarea', { class: 'textarea', rows: 3, value: post.meta_description, placeholder: 'Uses the excerpt or subtitle', 'aria-label': 'Description' }); bind(md, 'meta_description');
    const ogBox = h('div', { class: 'inline' });
    function paintOg() {
      SS.fill(ogBox, post.og_image_url ? h('img', { src: post.og_image_url, alt: '', style: { width: '72px', height: '48px', objectFit: 'cover', borderRadius: '6px' } }) : null,
        h('button', { class: 'btn btn--small', type: 'button', onclick: async () => { const m = await SS.pickMedia({ mode: 'pick' }); if (m) { post.og_image_url = m.url; paintOg(); touch(); } } }, post.og_image_url ? 'Change' : 'Choose image'),
        post.og_image_url ? h('button', { class: 'btn btn--small btn--quiet', type: 'button', onclick: () => { post.og_image_url = ''; paintOg(); touch(); } }, 'Remove') : null);
    }
    const swNoindex = SS.switch(post.noindex, (v) => { post.noindex = v; touch(); }, 'Keep this post out of search engines');

    const revBox = h('div', { class: 'muted' }, 'Loading…');
    let revLoaded = false;
    async function loadRevs() {
      if (revLoaded) return;
      if (!post.id) return void (revBox.textContent = 'History starts after the first save.');
      revLoaded = true;
      try {
        const revs = await DB.posts.revisions(post.id);
        clear(revBox);
        if (!revs.length) return void (revBox.textContent = 'No earlier versions yet. One is kept every couple of minutes while you write.');
        revBox.append(h('ul', { class: 'revs' }, revs.map((r) => h('li', null,
          h('span', { title: SS.fmtTime(r.created_at) }, SS.fmtTime(r.created_at) + '  ·  ' + SS.words(r.body) + ' words'),
          h('button', { class: 'btn btn--small btn--quiet', type: 'button', onclick: () => {
            post.title = r.title || ''; post.subtitle = r.subtitle || ''; post.body = r.body || '';
            titleIn.value = post.title; subIn.value = post.subtitle; ta.value = post.body; regrow(); touch(); paintPreview();
            SS.toast('Restored the version from ' + SS.fmtTime(r.created_at) + '. Save to keep it.');
          } }, 'Restore')))));
      } catch (e) { revLoaded = false; revBox.textContent = 'Could not load history.'; }
    }

    const dupBtn = h('button', { class: 'btn btn--small', type: 'button', onclick: async () => {
      if (!post.id) return;
      if (dirty && !(await save())) return;
      let slug = post.slug + '-copy', n = 2; const all = new Set((await DB.posts.list()).concat(await DB.posts.list({ trash: true })).map((x) => x.slug));
      while (all.has(slug)) slug = post.slug + '-copy-' + n++;
      try { const c = await DB.posts.save({ ...post, id: null, title: 'Copy of ' + (post.title || 'Untitled'), slug, status: 'draft', published_at: null, pinned: false, featured: false, has_password: false }); DB.activity.log('duplicate', post.title); SS.toast('Duplicated as a draft'); dirty = false; SS.go('#/edit/' + c.id); } catch (e) { SS.fail(e); }
    } }, icon('copy', 15), 'Duplicate');
    const trashBtn = h('button', { class: 'btn btn--small btn--danger', type: 'button', onclick: async () => {
      if (!post.id) { dirty = false; localStorage.removeItem('ss:bk:new'); return SS.go('#/posts'); }
      if (!(await SS.confirm({ title: 'Move to trash?', text: 'You can restore it from the Trash tab.', ok: 'Move to trash', danger: true }))) return;
      try { await DB.posts.setTrashed(post.id, true); DB.activity.log('trash', post.title); dirty = false; localStorage.removeItem(bkKey()); SS.toast('Moved to trash'); SS.go('#/posts'); } catch (e) { SS.fail(e); }
    } }, icon('trash', 15), post.id ? 'Move to trash' : 'Discard');

    const closeBtn = h('button', { class: 'iconbtn', type: 'button', 'aria-label': 'Close settings', onclick: () => openPanel(false) }, icon('x', 18));
    const historyPanel = panel('History', revBox);
    historyPanel.addEventListener('toggle', () => { if (historyPanel.open) loadRevs(); });
    const side = h('aside', { class: 'edpanel', id: 'edpanel', 'aria-label': 'Post settings' },
      h('div', { class: 'edpanel__head' }, h('h2', null, 'Post settings'), closeBtn),
      panel('Publish', [
        SS.field('Status', statusSel), SS.field('Date', dateSel, 'A future date schedules the post.'),
        SS.field('Address', h('div', { class: 'prefix' }, h('span', null, '/p/'), slugInput)),
        h('div', null, h('div', { class: 'switchrow' }, swFeat), h('div', { class: 'switchrow' }, swPin), h('div', { class: 'switchrow' }, swDate))
      ], true),
      panel('Cover image', [coverBox, SS.field('Description', altIn)], !!post.cover_url),
      panel('Details', [SS.field('Excerpt', excerpt, 'Shown under the title when there is no subtitle.'), SS.field('Tags', tags), SS.field('Reading time (minutes)', readIn), readAuto]),
      panel('Password', [pwState, SS.field(null, pwIn), h('div', { class: 'inline' }, pwSet, pwOff)]),
      panel('Search and sharing', [SS.field('Page title', mt), SS.field('Description', md), SS.field('Share image', ogBox), h('div', { class: 'switchrow' }, swNoindex)]),
      historyPanel,
      panel('Manage', h('div', { class: 'inline' }, post.id ? dupBtn : null, trashBtn)));

    /* ── top bar ─────────────────────────────────────── */
    const pillHold = h('span');
    const saveBtn = h('button', { class: 'btn', type: 'button', onclick: () => save() }, 'Save');
    const primary = h('button', { class: 'btn btn--primary', type: 'button', onclick: async () => {
      if (post.status === 'scheduled') { post.status = 'published'; post.published_at = new Date().toISOString(); }
      else Object.assign(post, SS.publishPatch(post));
      if (post.status === 'scheduled') SS.toast('Scheduled for ' + SS.fmtTime(post.published_at));
      syncControls(); touch(); await save();
    } });
    const settingsBtn = h('button', { class: 'btn btn--quiet', type: 'button', 'aria-controls': 'edpanel', onclick: () => openPanel(!panelOpen) }, icon('sliders', 18), h('span', { class: 'lbl-hide' }, 'Settings'));
    function refreshBar() {
      SS.fill(pillHold, SS.pill(post.status));
      const live = ['published', 'hidden', 'archived'].includes(post.status);
      primary.hidden = live; primary.textContent = post.status === 'scheduled' ? 'Publish now' : 'Publish';
      saveBtn.className = 'btn' + (live ? ' btn--primary' : ''); saveBtn.textContent = live ? 'Save changes' : 'Save';
    }
    function syncControls() {
      statusSel.set(post.status); dateSel.set(post.published_at); slugInput.value = post.slug;
      swFeat.querySelector('input').checked = post.featured; swPin.querySelector('input').checked = post.pinned;
      paintPw(); refreshBar();
    }
    const modeSeg = SS.segmented([['write', 'Write'], ['split', 'Split'], ['preview', 'Preview']], mode, (v) => { mode = v; sessionStorage.setItem('ss:edmode', v); body.dataset.mode = v; regrow(); paintPreview.flush(); });
    const viewLink = () => SS.siteUrl() && SS.isPublic(post) && post.id ? h('a', { class: 'btn btn--quiet', href: SS.siteUrl('/p/' + post.slug), target: '_blank', rel: 'noopener', title: 'View on the site', 'aria-label': 'View on the site' }, icon('external', 17)) : null;

    const top = h('header', { class: 'edtop' },
      h('div', { class: 'edtop__l' }, h('a', { class: 'btn btn--quiet', href: '#/posts', title: 'Back to posts' }, icon('back', 17), h('span', { class: 'lbl-hide' }, 'Posts')), pillHold, stateEl),
      h('div', { class: 'edtop__mid' }, modeSeg),
      h('div', { class: 'edtop__r' }, viewLink(), settingsBtn, saveBtn, primary));

    const canvas = h('div', { class: 'edcanvas' },
      h('div', { class: 'edpage' },
        h('div', { class: 'edcols' },
          h('div', { class: 'edcol edcol--w' }, titleIn, subIn, tools, ta),
          h('div', { class: 'edcol edcol--pv' }, pvHead, pvBody)),
        foot));
    const body = h('div', { class: 'edbody', 'data-mode': mode, 'data-panel': panelOpen ? 'open' : 'closed' }, canvas, side);
    const page = h('div', { class: 'ed' }, top, body);

    function openPanel(on) {
      panelOpen = on; body.dataset.panel = on ? 'open' : 'closed';
      settingsBtn.setAttribute('aria-expanded', String(on)); settingsBtn.classList.toggle('is-on', on);
      localStorage.setItem('ss:edpanel', on ? '1' : '0');
      requestAnimationFrame(regrow);
      if (on && matchMedia('(max-width: 1180px)').matches) closeBtn.focus();
    }
    const regrow = () => { grow(titleIn); grow(subIn); grow(ta); };
    const onResize = SS.debounce(regrow, 120);
    window.addEventListener('resize', onResize);

    /* typography follows the Look settings, so writing and reading match the site */
    const px = Math.max(16, Math.min(26, Number(cfg.text_size) || 20));
    page.style.setProperty('--prose-size', px + 'px');
    if (cfg.body_font === 'sans') page.style.setProperty('--prose-font', 'var(--sans)');
    if (cfg.heading_font === 'serif') page.style.setProperty('--prose-head', 'var(--serif)');
    document.documentElement.style.scrollPaddingTop = '150px';
    document.documentElement.style.scrollPaddingBottom = '110px';

    view.append(page);
    const fitBar = () => page.style.setProperty('--topbar', top.offsetHeight + 'px');
    const barWatch = window.ResizeObserver ? new ResizeObserver(fitBar) : null;
    if (barWatch) barWatch.observe(top); fitBar();
    paintCover(); paintOg(); paintPw(); refreshBar(); openPanel(panelOpen); paintPreview.flush(); regrow();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(regrow);
    setState(post.id ? 'Saved ' + SS.ago(post.updated_at) : 'New post');
    if (!post.id) titleIn.focus();

    /* a copy from a crashed or closed tab */
    try {
      const raw = localStorage.getItem(bkKey()), bk = raw && JSON.parse(raw);
      if (bk && bk.post && (bk.post.body !== post.body || bk.post.title !== post.title) && (!post.updated_at || bk.at > new Date(post.updated_at).getTime())) {
        const banner = h('div', { class: 'banner' }, 'A newer, unsaved version from ' + SS.ago(new Date(bk.at).toISOString()) + ' was found on this device.', h('span', { class: 'spacer' }),
          h('button', { class: 'btn btn--small', type: 'button', onclick: () => {
            Object.assign(post, bk.post, { id: post.id, updated_at: post.updated_at });
            titleIn.value = post.title; subIn.value = post.subtitle; ta.value = post.body; slugInput.value = post.slug; tags.set(post.tags || []);
            statusSel.set(post.status); dateSel.set(post.published_at); paintCover(); paintOg(); paintPreview(); regrow(); touch(); banner.remove();
          } }, 'Restore it'),
          h('button', { class: 'btn btn--small btn--quiet', type: 'button', onclick: () => { localStorage.removeItem(bkKey()); banner.remove(); } }, 'Discard'));
        canvas.prepend(banner);
      }
    } catch (e) { /* ignore a corrupt backup */ }

    return () => {
      document.removeEventListener('keydown', onKey); window.removeEventListener('resize', onResize); if (barWatch) barWatch.disconnect();
      autosave.cancel(); paintPreview.cancel(); if (dirty) backup.flush(); else backup.cancel();
      document.documentElement.style.scrollPaddingTop = ''; document.documentElement.style.scrollPaddingBottom = '';
      SS.leaveGuard = null;
    };
  };
})();
