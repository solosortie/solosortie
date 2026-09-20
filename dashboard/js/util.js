/* solosortie dashboard — shared helpers (DOM, dialogs, images, zip, markdown) */
(function () {
  'use strict';
  const SS = (window.SS = window.SS || {});

  /* ── DOM ─────────────────────────────────────────────── */
  SS.h = (tag, attrs, ...kids) => {
    const el = document.createElement(tag);
    let value;
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k === 'html') el.innerHTML = v;
      else if (k === 'value') value = v;
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (typeof v === 'boolean' && k in el) el[k] = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const c of kids.flat(Infinity)) if (c != null && c !== false) el.append(c.nodeType ? c : String(c));
    if (value !== undefined) el.value = value;
    return el;
  };
  const h = SS.h;
  SS.$ = (s, r) => (r || document).querySelector(s);
  SS.$$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  SS.clear = (el) => { el.replaceChildren(); return el; };
  /* empty an element and fill it, skipping null/false children (native append would print "null") */
  SS.fill = (el, ...kids) => { SS.clear(el); kids.flat(Infinity).forEach((c) => { if (c != null && c !== false) el.append(c); }); return el; };
  SS.esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const ICONS = {
    posts: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    media: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="m21 16-5-5-9 9"/>',
    power: '<path d="M12 3v8"/><path d="M6.3 6.6a8 8 0 1 0 11.4 0"/>',
    look: '<circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4"/>',
    pages: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21.5z"/><path d="M4 21.5V5.5M8 7h8"/>',
    backup: '<path d="M4 8h16v12H4zM3 4h18v4H3zM10 12.5h4"/>',
    shield: '<path d="M12 21s7-3.6 7-9.4V5.6L12 3 5 5.6v6C5 17.4 12 21 12 21z"/>',
    pulse: '<path d="M3 12h4l2.5 7L14 5l2.5 7H21"/>',
    more: '<circle cx="5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/>',
    up: '<path d="m6 14 6-6 6 6"/>',
    down: '<path d="m6 10 6 6 6-6"/>',
    trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
    pin: '<path d="M9 3h6l-1 6 3 3v2H7v-2l3-3zM12 14v7"/>',
    eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
    link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    upload: '<path d="M12 16V4M7 9l5-5 5 5M4 20h16"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>',
    lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
    star: '<path d="m12 3.5 2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.8 6.8 19.6l1-5.8L3.5 9.7l5.9-.8z"/>',
    back: '<path d="M15 6l-6 6 6 6"/>',
    external: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
    bold: '<path d="M7 5h6a3.5 3.5 0 0 1 0 7H7zM7 12h7a3.5 3.5 0 0 1 0 7H7z"/>',
    italic: '<path d="M10 5h8M6 19h8M14 5l-4 14"/>',
    quote: '<path d="M6 17v-4a4 4 0 0 1 4-4M14 17v-4a4 4 0 0 1 4-4M6 13h4v4H6zM14 13h4v4h-4z"/>',
    list: '<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r=".8"/><circle cx="4.5" cy="12" r=".8"/><circle cx="4.5" cy="18" r=".8"/>',
    code: '<path d="m8 7-5 5 5 5M16 7l5 5-5 5"/>',
    minus: '<path d="M5 12h14"/>',
    restore: '<path d="M4 12a8 8 0 1 0 2.5-5.8L4 8.5M4 4v4.5h4.5"/>',
    logout: '<path d="M9 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h3M15 8l4 4-4 4M19 12H9"/>',
    sidebar: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/>',
    strike: '<path d="M4 12h16M8 7.5C8.6 5.9 10.1 5 12 5c2.4 0 4 1.2 4 3M8 16c0 1.9 1.7 3 4 3 2.5 0 4.2-1.2 4.2-3.2"/>',
    ol: '<path d="M10 6h10M10 12h10M10 18h10M4 5l1.5-1v4M3.6 13.6c.3-.7 1-1 1.6-.7.7.3.7 1.2.1 1.8L3.5 17H6M3.8 20h1.6c.8 0 1.2.5 1.2 1s-.4 1-1.2 1c.8 0 1.3.5 1.3 1.1S5.9 24 5.2 24H3.7"/>',
    table: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18M3 15h18M9 5v14"/>',
    codeblock: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="m9.5 9-3 3 3 3M14.5 9l3 3-3 3"/>',
    sliders: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
    chevron: '<path d="m7 10 5 5 5-5"/>',
    calendar: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M8 3v4M16 3v4"/>',
    left: '<path d="m14 6-6 6 6 6"/>',
    right: '<path d="m10 6 6 6-6 6"/>',
    undo: '<path d="M9 8 4 13l5 5M4 13h10a6 6 0 0 1 0 12"/>',
    image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="m21 16-5-5-9 9"/>'
  };
  SS.icon = (name, size = 18) =>
    h('span', { class: 'ico', 'aria-hidden': 'true', html: `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ''}</svg>` });

  /* ── text, dates, numbers ────────────────────────────── */
  SS.slugify = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
  SS.words = (s) => { const t = String(s || '').trim(); return t ? t.split(/\s+/).length : 0; };
  SS.readMin = (s) => Math.max(1, Math.ceil(SS.words(s) / 220));
  SS.fmtDate = (iso) => iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
  SS.fmtTime = (iso) => iso ? new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';
  SS.ago = (iso) => {
    const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return Math.floor(s / 60) + ' min ago';
    if (s < 86400) return Math.floor(s / 3600) + ' h ago';
    if (s < 86400 * 14) return Math.floor(s / 86400) + ' d ago';
    return SS.fmtDate(iso);
  };
  SS.bytes = (n) => n == null ? '' : n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(0) + ' KB' : (n / 1048576).toFixed(1) + ' MB';
  const pad = (n) => String(n).padStart(2, '0');
  SS.toLocalInput = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };
  SS.fromLocalInput = (v) => v ? new Date(v).toISOString() : null;
  SS.debounce = (fn, ms) => { let t; const d = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; d.flush = (...a) => { clearTimeout(t); fn(...a); }; d.cancel = () => clearTimeout(t); return d; };
  SS.uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Math.random().toString(36).slice(2) + Date.now().toString(36));
  SS.err = (code, message) => { const e = new Error(message); e.code = code; return e; };

  /* ── markdown ────────────────────────────────────────── */
  SS.sanitize = (html) => {
    const t = document.createElement('template');
    t.innerHTML = html;
    t.content.querySelectorAll('script,style,object,embed,link,meta,base,form').forEach((n) => n.remove());
    t.content.querySelectorAll('*').forEach((n) => {
      for (const a of Array.from(n.attributes)) {
        const name = a.name.toLowerCase(), v = a.value.replace(/\s/g, '').toLowerCase();
        if (name.startsWith('on')) n.removeAttribute(a.name);
        else if (/^(href|src|xlink:href|action|formaction)$/.test(name) && /^(javascript|vbscript|data:text\/html)/.test(v)) n.removeAttribute(a.name);
      }
    });
    t.content.querySelectorAll('img[title]').forEach((img) => {
      const cap = img.getAttribute('title').trim(); img.removeAttribute('title');
      if (!cap) return;
      const fig = document.createElement('figure'), fc = document.createElement('figcaption');
      fc.textContent = cap;
      const p = img.parentElement;
      const alone = p && p.tagName === 'P' && Array.from(p.childNodes).every((n) => n === img || (n.nodeType === 3 && !n.textContent.trim()));
      (alone ? p : img).replaceWith(fig);
      fig.append(img, fc);
    });
    return t.innerHTML;
  };
  SS.md = (src) => {
    if (!src) return '';
    try { return SS.sanitize(window.marked.parse(String(src), { gfm: true })); } catch (e) { return '<p>' + SS.esc(src) + '</p>'; }
  };

  /* ── toasts, dialogs, menus ──────────────────────────── */
  let toasts;
  SS.toast = (msg, kind = 'ok') => {
    if (!toasts) toasts = document.body.appendChild(h('div', { class: 'toasts', role: 'status', 'aria-live': 'polite' }));
    const t = h('div', { class: 'toast toast--' + kind }, msg);
    while (toasts.children.length >= 3) toasts.firstChild.remove();
    toasts.append(t);
    setTimeout(() => t.remove(), kind === 'error' ? 6500 : 3200);
    return t;
  };
  SS.fail = (e, prefix) => { console.error(e); SS.toast((prefix ? prefix + ': ' : '') + (e && e.message ? e.message : e), 'error'); };

  SS.modal = ({ title, body, wide, onClose }) => {
    const prev = document.activeElement;
    const box = h('div', { class: 'modal__box' + (wide ? ' modal__box--wide' : ''), role: 'dialog', 'aria-modal': 'true', 'aria-label': title || 'Dialog' },
      title ? h('h2', { class: 'modal__title' }, title) : null, body);
    const back = h('div', { class: 'modal' }, box);
    const close = (result) => { document.removeEventListener('keydown', key, true); back.remove(); if (prev && prev.focus) prev.focus(); if (onClose) onClose(result); };
    const key = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(undefined); } };
    back.addEventListener('mousedown', (e) => { if (e.target === back) close(undefined); });
    document.addEventListener('keydown', key, true);
    document.body.append(back);
    const first = box.querySelector('input,textarea,select,button.btn--primary,button');
    if (first) first.focus();
    return { close, box };
  };

  SS.confirm = ({ title, text, ok = 'Confirm', danger = false }) => new Promise((res) => {
    let m;
    const done = (v) => { m.close(v); };
    m = SS.modal({
      title,
      onClose: (v) => res(v === true),
      body: h('div', null,
        text ? h('p', { class: 'modal__text' }, text) : null,
        h('div', { class: 'modal__actions' },
          h('button', { class: 'btn', type: 'button', onclick: () => done(false) }, 'Cancel'),
          h('button', { class: 'btn ' + (danger ? 'btn--danger-solid' : 'btn--primary'), type: 'button', onclick: () => done(true) }, ok)))
    });
  });

  SS.ask = ({ title, label, value = '', ok = 'Save', type = 'text', placeholder = '', textarea = false }) => new Promise((res) => {
    let m;
    const input = textarea
      ? h('textarea', { class: 'input', rows: 4, placeholder, value })
      : h('input', { class: 'input', type, placeholder, value, autocomplete: 'off' });
    const submit = () => m.close(input.value);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !textarea) { e.preventDefault(); submit(); } });
    m = SS.modal({
      title,
      onClose: (v) => res(typeof v === 'string' ? v : null),
      body: h('div', null,
        label ? h('label', { class: 'field__label' }, label) : null, input,
        h('div', { class: 'modal__actions' },
          h('button', { class: 'btn', type: 'button', onclick: () => m.close(undefined) }, 'Cancel'),
          h('button', { class: 'btn btn--primary', type: 'button', onclick: submit }, ok)))
    });
    input.focus(); if (input.select) input.select();
  });

  SS.menu = (anchor, items) => {
    document.querySelectorAll('.menu').forEach((m) => m.remove());
    const menu = h('div', { class: 'menu', role: 'menu' });
    const close = () => { menu.remove(); document.removeEventListener('mousedown', outside, true); document.removeEventListener('keydown', esc, true); };
    const outside = (e) => { if (!menu.contains(e.target)) close(); };
    const esc = (e) => { if (e.key === 'Escape') close(); };
    items.filter(Boolean).forEach((it) => {
      if (it === '-') return menu.append(h('div', { class: 'menu__sep' }));
      menu.append(h('button', {
        class: 'menu__item' + (it.danger ? ' menu__item--danger' : ''), type: 'button', role: 'menuitem', disabled: !!it.disabled,
        onclick: () => { close(); it.onclick && it.onclick(); }
      }, it.icon ? SS.icon(it.icon, 16) : h('span', { class: 'ico' }), it.label));
    });
    document.body.append(menu);
    const r = anchor.getBoundingClientRect();
    const mw = menu.offsetWidth, mh = menu.offsetHeight;
    let left = Math.min(window.innerWidth - mw - 8, Math.max(8, r.right - mw));
    let top = r.bottom + 6;
    if (top + mh > window.innerHeight - 8) top = Math.max(8, r.top - mh - 6);
    menu.style.left = left + 'px'; menu.style.top = top + 'px';
    setTimeout(() => { document.addEventListener('mousedown', outside, true); document.addEventListener('keydown', esc, true); }, 0);
    return close;
  };

  /* small building blocks */
  SS.field = (label, control, hint) => h('div', { class: 'field' },
    label ? h('label', { class: 'field__label' }, label) : null, control, hint ? h('p', { class: 'field__hint' }, hint) : null);
  SS.switch = (checked, onchange, label) => {
    const input = h('input', { type: 'checkbox', checked: !!checked, onchange: (e) => onchange(e.target.checked) });
    return h('label', { class: 'switch' }, input, h('span', { class: 'switch__track' }), label ? h('span', { class: 'switch__label' }, label) : null);
  };
  SS.segmented = (options, value, onchange) => {
    const wrap = h('div', { class: 'seg', role: 'radiogroup' });
    const paint = (v) => SS.$$('button', wrap).forEach((b) => b.setAttribute('aria-checked', String(b.dataset.v === v)));
    options.forEach(([v, label]) => wrap.append(h('button', { type: 'button', role: 'radio', 'data-v': v, onclick: () => { paint(v); onchange(v); } }, label)));
    paint(value);
    return wrap;
  };
  /* status glyph: hollow = not public, filled = public. The whole dashboard reads by it. */
  SS.STATUS = {
    draft: { label: 'Draft', glyph: 'ring' },
    scheduled: { label: 'Scheduled', glyph: 'half' },
    published: { label: 'Published', glyph: 'dot' },
    hidden: { label: 'Hidden', glyph: 'dot-quiet' },
    unpublished: { label: 'Unpublished', glyph: 'ring-quiet' },
    archived: { label: 'Archived', glyph: 'dash' }
  };
  SS.pill = (status) => { const s = SS.STATUS[status] || SS.STATUS.draft; return h('span', { class: 'pill' }, h('i', { class: 'glyph glyph--' + s.glyph }), s.label); };

  /* ── files ───────────────────────────────────────────── */
  SS.download = (name, data, mime = 'application/octet-stream') => {
    const blob = data instanceof Blob ? data : new Blob([data], { type: mime });
    const a = h('a', { href: URL.createObjectURL(blob), download: name });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  };
  SS.copy = async (text) => {
    try { await navigator.clipboard.writeText(text); SS.toast('Copied'); }
    catch (e) { const t = h('textarea', { value: text, style: { position: 'fixed', opacity: '0' } }); document.body.append(t); t.select(); document.execCommand('copy'); t.remove(); SS.toast('Copied'); }
  };
  SS.readFile = (file, as = 'text') => new Promise((res, rej) => {
    const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error);
    as === 'dataurl' ? r.readAsDataURL(file) : r.readAsText(file);
  });

  const measure = (file) => new Promise((res) => {
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => { res({ width: img.naturalWidth || 0, height: img.naturalHeight || 0 }); URL.revokeObjectURL(url); };
    img.onerror = () => { res({ width: 0, height: 0 }); URL.revokeObjectURL(url); };
    img.src = url;
  });
  /* Resize big photos and re-encode as WebP before upload; svg and gif pass through untouched. */
  SS.processImage = async (file, max = 2400) => {
    if (!file.type.startsWith('image/')) throw new Error(file.name + ' is not an image');
    if (file.type === 'image/svg+xml' || file.type === 'image/gif') return { blob: file, mime: file.type, name: file.name, ...(await measure(file)) };
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
    if (scale === 1 && file.size < 700 * 1024) return { blob: file, mime: file.type, name: file.name, width: bmp.width, height: bmp.height };
    const w = Math.round(bmp.width * scale), hgt = Math.round(bmp.height * scale);
    const c = h('canvas', { width: w, height: hgt });
    c.getContext('2d').drawImage(bmp, 0, 0, w, hgt);
    let blob = await new Promise((r) => c.toBlob(r, 'image/webp', 0.86));
    let ext = 'webp';
    if (!blob || blob.type !== 'image/webp') { blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.88)); ext = 'jpg'; }
    if (blob.size >= file.size && scale === 1) return { blob: file, mime: file.type, name: file.name, width: bmp.width, height: bmp.height };
    return { blob, mime: blob.type, name: file.name.replace(/\.[^.]+$/, '') + '.' + ext, width: w, height: hgt };
  };

  /* Minimal ZIP writer (stored, no compression) — enough for a folder of markdown files. */
  SS.zip = (files) => {
    const enc = new TextEncoder();
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; table[n] = c >>> 0; }
    const crc32 = (u8) => { let c = 0xffffffff; for (let i = 0; i < u8.length; i++) c = table[(c ^ u8[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
    const d = new Date();
    const dosTime = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
    const dosDate = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    const parts = [], central = [];
    let offset = 0;
    for (const f of files) {
      const name = enc.encode(f.name), data = typeof f.data === 'string' ? enc.encode(f.data) : f.data, crc = crc32(data);
      const lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true);
      lh.setUint16(10, dosTime, true); lh.setUint16(12, dosDate, true); lh.setUint32(14, crc, true);
      lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true); lh.setUint16(26, name.length, true); lh.setUint16(28, 0, true);
      parts.push(new Uint8Array(lh.buffer), name, data);
      const ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(10, 0, true);
      ch.setUint16(12, dosTime, true); ch.setUint16(14, dosDate, true); ch.setUint32(16, crc, true);
      ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true); ch.setUint16(28, name.length, true);
      ch.setUint16(30, 0, true); ch.setUint16(32, 0, true); ch.setUint16(34, 0, true); ch.setUint16(36, 0, true); ch.setUint32(38, 0, true); ch.setUint32(42, offset, true);
      central.push(new Uint8Array(ch.buffer), name);
      offset += 30 + name.length + data.length;
    }
    const cdSize = central.reduce((n, p) => n + p.length, 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
    end.setUint32(12, cdSize, true); end.setUint32(16, offset, true);
    return new Blob([...parts, ...central, new Uint8Array(end.buffer)], { type: 'application/zip' });
  };

  /* Markdown for an image. Brackets and quotes in the text, and spaces or brackets in the address, would break it. */
  SS.imageMd = ({ url, alt = '', caption = '' }) => {
    const a = String(alt).replace(/[\[\]\n]/g, ' ').replace(/\s+/g, ' ').trim();
    const c = String(caption).replace(/"/g, '\u201d').replace(/\s+/g, ' ').trim();
    const u = String(url).replace(/ /g, '%20').replace(/\(/g, '%28').replace(/\)/g, '%29');
    return `![${a}](${u}${c ? ` "${c}"` : ''})`;
  };

  /* ── settings ────────────────────────────────────────── */
  SS.DEFAULT_SETTINGS = {
    site_state: 'live', down_message: '', site_name: 'solosortie', meta_description: '', og_image: '', robots_index: true,
    nav: [{ label: 'Home', href: '/', visible: true }, { label: 'Archive', href: '/archive', visible: true }, { label: 'About', href: '/about', visible: true }],
    accent: '#b0336f', theme: 'light', body_font: 'serif', heading_font: 'sans', text_size: 20,
    home_hero: true, home_layout: 'list', posts_per_page: 10, show_dates: true, show_reading_time: true,
    logo_url: '', favicon_url: '', about_md: '', footer_md: '', notfound_md: ''
  };

  /* ── posts ───────────────────────────────────────────── */
  SS.POST_FIELDS = ['title', 'subtitle', 'slug', 'body', 'excerpt', 'cover_url', 'cover_alt', 'tags', 'status', 'published_at', 'pinned', 'featured',
    'sort_order', 'reading_minutes', 'show_date', 'meta_title', 'meta_description', 'og_image_url', 'noindex'];
  SS.newPost = () => ({
    id: null, title: '', subtitle: '', slug: '', body: '', excerpt: '', cover_url: '', cover_alt: '', tags: [], status: 'draft', published_at: null,
    pinned: false, featured: false, sort_order: 0, reading_minutes: null, show_date: true, meta_title: '', meta_description: '', og_image_url: '',
    noindex: false, has_password: false
  });
  /* what "publish" means for a post that may already carry a date */
  SS.publishPatch = (p) => {
    const at = p.published_at ? new Date(p.published_at) : null;
    if (at && at.getTime() > Date.now() + 30000) return { status: 'scheduled' };
    return { status: 'published', published_at: p.published_at || new Date().toISOString() };
  };
  SS.isPublic = (p) => ['published', 'archived', 'hidden'].includes(p.status) || (p.status === 'scheduled' && p.published_at && new Date(p.published_at) <= new Date());

  SS.toMarkdown = (p) => {
    const q = (s) => JSON.stringify(String(s == null ? '' : s));
    const lines = ['---', 'title: ' + q(p.title), 'subtitle: ' + q(p.subtitle), 'slug: ' + q(p.slug), 'status: ' + p.status,
      'date: ' + (p.published_at || ''), 'tags: [' + (p.tags || []).map(q).join(', ') + ']', 'cover: ' + q(p.cover_url), 'excerpt: ' + q(p.excerpt), '---', ''];
    return lines.join('\n') + '\n' + (p.body || '') + '\n';
  };
  SS.fromMarkdown = (text, filename) => {
    const post = SS.newPost();
    let body = text.replace(/\r\n/g, '\n');
    const m = body.match(/^---\n([\s\S]*?)\n---\n?/);
    const meta = {};
    if (m) {
      body = body.slice(m[0].length);
      m[1].split('\n').forEach((line) => {
        const i = line.indexOf(':'); if (i < 1) return;
        const k = line.slice(0, i).trim(); let v = line.slice(i + 1).trim();
        try { if (/^["\[]/.test(v)) v = JSON.parse(v); } catch (e) { v = v.replace(/^\[|\]$/g, '').split(',').map((s) => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean); }
        meta[k] = v;
      });
    }
    const base = (filename || '').replace(/\.md$/i, '');
    post.title = meta.title || (body.match(/^#\s+(.+)$/m) || [])[1] || base || 'Untitled';
    post.subtitle = meta.subtitle || '';
    post.slug = SS.slugify(meta.slug || post.title || base);
    post.body = body.trim();
    post.excerpt = meta.excerpt || '';
    post.cover_url = meta.cover || '';
    post.tags = Array.isArray(meta.tags) ? meta.tags : [];
    post.status = 'draft';
    const when = meta.date ? new Date(meta.date) : null;
    post.published_at = when && !isNaN(when) ? when.toISOString() : null;
    return post;
  };
})();
