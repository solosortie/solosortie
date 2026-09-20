/* solosortie dashboard — Media library, uploader and picker */
(function () {
  'use strict';
  const SS = window.SS;
  const { h, icon, clear } = SS;
  SS.routes = SS.routes || {};

  /* Resize, upload and register images. Returns the created media rows. */
  SS.uploadFiles = async (files) => {
    const out = [];
    const list = Array.from(files).filter((f) => f.type.startsWith('image/'));
    if (!list.length) { SS.toast('Choose image files (JPEG, PNG, WebP, GIF, SVG or AVIF).', 'error'); return out; }
    let i = 0;
    for (const f of list) {
      i++;
      const note = SS.toast(list.length > 1 ? `Uploading ${i} of ${list.length}…` : 'Uploading…');
      try {
        const prepared = await SS.processImage(f);
        out.push(await SS.DB.media.upload(prepared));
      } catch (e) { SS.fail(e, f.name); }
      finally { note.remove(); }
    }
    if (out.length) SS.DB.activity.log('upload', out.length + (out.length === 1 ? ' image' : ' images'));
    return out;
  };

  const usage = (item, posts, settings) => {
    const uses = [];
    posts.forEach((p) => {
      if (p.cover_url === item.url) uses.push('Cover of “' + (p.title || 'Untitled') + '”');
      else if (p.og_image_url === item.url) uses.push('Share image of “' + (p.title || 'Untitled') + '”');
      else if ((p.body || '').includes(item.url)) uses.push('In “' + (p.title || 'Untitled') + '”');
    });
    [['logo_url', 'Site logo'], ['favicon_url', 'Favicon'], ['og_image', 'Default share image']].forEach(([k, label]) => { if (settings[k] === item.url) uses.push(label); });
    ['about_md', 'footer_md', 'notfound_md'].forEach((k) => { if ((settings[k] || '').includes(item.url)) uses.push('In the ' + k.replace('_md', '') + ' page'); });
    return uses;
  };

  function grid(items, onPick, selectedId, onOpen) {
    if (!items.length) return h('div', { class: 'empty' }, h('p', null, 'No images yet.'));
    return h('div', { class: 'mgrid' }, items.map((m) => h('button', {
      class: 'mcard', type: 'button', title: m.name, 'aria-pressed': selectedId ? String(m.id === selectedId) : null,
      onclick: () => onPick(m), ondblclick: onOpen ? () => onOpen(m) : null
    },
      h('img', { class: 'mcard__img', src: m.url, alt: m.alt || '', loading: 'lazy' }),
      h('span', { class: 'mcard__name' }, m.name || 'image'),
      h('span', { class: 'mcard__meta' }, [m.width && m.height ? m.width + '×' + m.height : '', SS.bytes(m.bytes)].filter(Boolean).join('  '))))
    );
  }

  /* Choose an image from the library or upload one.
     mode "insert": also asks for a description and an optional caption → resolves { ...media, alt, caption }.
     mode "pick":   just the image → resolves the media row. Resolves null if closed. */
  SS.pickMedia = ({ mode = 'pick', confirm = mode === 'insert' ? 'Insert image' : 'Use this image' } = {}) => new Promise((resolve) => {
    let items = [], sel = null, m;
    const holder = h('div', { class: 'picker__grid' });
    const side = h('div', { class: 'picker__side' });
    const file = h('input', { type: 'file', accept: 'image/*', multiple: true, hidden: true, onchange: async () => {
      const made = await SS.uploadFiles(file.files); file.value = '';
      if (!made.length) return;
      items = await SS.DB.media.list(); sel = items.find((x) => x.id === made[0].id) || made[0]; paint();
    } });

    function done(alt, caption) {
      if (!sel) return;
      const a = (alt || '').trim();
      if (mode === 'insert' && a && a !== (sel.alt || '')) SS.DB.media.update(sel.id, { alt: a }).catch(() => {});
      m.close({ ...sel, alt: mode === 'insert' ? a : sel.alt, caption: (caption || '').trim() });
    }

    function paintSide() {
      SS.clear(side);
      if (!sel) return void side.append(h('p', { class: 'picker__hint' }, 'Choose an image, or upload a new one.'));
      const alt = h('input', { class: 'input', value: sel.alt || '', placeholder: 'What is in the picture', 'aria-label': 'Description' });
      const cap = h('input', { class: 'input', placeholder: 'Shown under the image (optional)', 'aria-label': 'Caption' });
      const go = () => done(alt.value, cap.value);
      [alt, cap].forEach((i) => i.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); go(); } }));
      SS.fill(side, h('img', { class: 'picker__prev', src: sel.url, alt: '' }),
        h('p', { class: 'picker__meta' }, [sel.name, sel.width && sel.height ? sel.width + '×' + sel.height : '', SS.bytes(sel.bytes)].filter(Boolean).join('  ·  ')),
        mode === 'insert' ? SS.field('Description', alt, 'For people who cannot see the image. Leave empty for a purely decorative one.') : null,
        mode === 'insert' ? SS.field('Caption', cap) : null,
        h('button', { class: 'btn btn--primary btn--block', type: 'button', onclick: go }, confirm));
    }
    function paint() {
      SS.clear(holder).append(grid(items, (item) => { sel = item; paint(); }, sel && sel.id, (item) => { sel = item; if (mode === 'pick') done(); else paintSide(); }));
      paintSide();
    }

    m = SS.modal({
      title: mode === 'insert' ? 'Insert an image' : 'Choose an image', wide: true, onClose: (v) => resolve(v && v.id ? v : null),
      body: h('div', { class: 'picker' },
        h('div', { class: 'picker__main' },
          h('div', { class: 'inline', style: { marginBottom: '14px' } }, h('button', { class: 'btn', type: 'button', onclick: () => file.click() }, icon('upload', 16), 'Upload new'), file),
          holder),
        side)
    });
    paintSide();
    SS.DB.media.list().then((list) => { items = list; paint(); }).catch((e) => SS.fail(e));
  });

  SS.routes.media = async (view) => {
    const DB = SS.DB;
    let items = [], posts = [];
    const holder = h('div');
    const file = h('input', { type: 'file', accept: 'image/*', multiple: true, hidden: true, onchange: () => add(file.files) });

    async function load() {
      [items, posts] = await Promise.all([DB.media.list(), DB.posts.list()]);
      paint();
    }
    async function add(files) { const made = await SS.uploadFiles(files); if (made.length) { SS.toast(made.length === 1 ? 'Uploaded' : made.length + ' images uploaded'); await load(); } }
    function paint() { clear(holder).append(grid(items, open)); }

    function open(item) {
      const uses = usage(item, posts, SS.state.settings);
      const alt = h('input', { class: 'input', value: item.alt || '', placeholder: 'Describe the image for people who cannot see it' });
      const name = h('input', { class: 'input', value: item.name || '' });
      const m = SS.modal({
        title: item.name || 'Image', wide: true,
        body: h('div', { class: 'mdetail' },
          h('img', { src: item.url, alt: item.alt || '' }),
          h('div', null,
            SS.field('Name', name), SS.field('Description (alt text)', alt, 'Shown to screen readers and if the image fails to load.'),
            h('div', { class: 'inline', style: { marginBottom: '14px' } },
              h('button', { class: 'btn btn--small', type: 'button', onclick: () => SS.copy(item.url) }, icon('copy', 15), 'Copy address'),
              h('button', { class: 'btn btn--small', type: 'button', onclick: () => SS.copy(`![${alt.value || ''}](${item.url})`) }, icon('copy', 15), 'Copy for a post')),
            h('p', { class: 'field__hint' }, [item.width && item.height ? item.width + '×' + item.height : '', SS.bytes(item.bytes), SS.fmtDate(item.created_at)].filter(Boolean).join('  ·  ')),
            h('div', { class: 'field', style: { marginTop: '14px' } }, h('span', { class: 'field__label' }, uses.length ? 'Used in' : 'Not used anywhere yet'),
              uses.length ? h('ul', { class: 'used' }, uses.map((u) => h('li', null, u))) : null),
            h('div', { class: 'modal__actions', style: { justifyContent: 'space-between' } },
              h('button', { class: 'btn btn--danger', type: 'button', onclick: async () => {
                const ok = await SS.confirm({ title: 'Delete this image?', danger: true, ok: 'Delete',
                  text: uses.length ? `It is used in ${uses.length} place${uses.length > 1 ? 's' : ''}. Those will show a broken image.` : 'This removes the file.' });
                if (!ok) return;
                try { await DB.media.remove(item); DB.activity.log('delete image', item.name); m.close(); SS.toast('Deleted'); await load(); } catch (e) { SS.fail(e); }
              } }, 'Delete'),
              h('button', { class: 'btn btn--primary', type: 'button', onclick: async () => {
                try { await DB.media.update(item.id, { alt: alt.value.trim(), name: name.value.trim() || item.name }); m.close(); SS.toast('Saved'); await load(); } catch (e) { SS.fail(e); }
              } }, 'Save'))))
      });
    }

    const drop = h('div', { class: 'drop', tabindex: '0', role: 'button', onclick: () => file.click(),
      onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); file.click(); } } },
      icon('upload', 20), h('div', null, 'Drop images here, or click to choose'));
    ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('is-over'); }));
    ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('is-over'); }));
    drop.addEventListener('drop', (e) => add(e.dataTransfer.files));

    view.append(h('div', { class: 'head' }, h('h1', null, 'Media'), h('p', { class: 'head__note' }, 'Large photos are resized and converted to WebP before they are uploaded.')), drop, file, holder);
    await load();
  };
})();
