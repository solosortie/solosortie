/* solosortie dashboard: Backups: export, import, snapshots and rollback */
(function () {
  'use strict';
  const SS = window.SS;
  const { h, icon, clear } = SS;
  SS.routes = SS.routes || {};

  async function collect() {
    const DB = SS.DB;
    const [posts, trash, settings, media] = await Promise.all([DB.posts.list(), DB.posts.list({ trash: true }), DB.settings.get(), DB.media.list()]);
    const all = posts.concat(trash);
    return { app: 'solosortie', version: 1, taken: new Date().toISOString(), counts: { posts: all.length, media: media.length }, posts: all, settings, media };
  }

  async function snapshot(label) {
    const data = await collect();
    const made = await SS.DB.snapshots.create(label, data);
    SS.DB.activity.log('snapshot', label);
    return made;
  }

  async function restore(snap) {
    const DB = SS.DB;
    await snapshot('Before restoring “' + (snap.label || SS.fmtDate(snap.created_at)) + '”');
    const data = await DB.snapshots.get(snap.id);
    const wanted = new Set(data.posts.map((p) => p.id));
    // posts written after the snapshot go to the trash first, so their addresses are free again
    for (const p of await DB.posts.list()) if (!wanted.has(p.id) && !p.deleted_at) await DB.posts.setTrashed(p.id, true);
    await DB.posts.upsertMany(data.posts);
    const { site_state, down_message, ...rest } = data.settings || {};
    await DB.settings.set(rest);
    Object.assign(SS.state.settings, await DB.settings.get());
    DB.activity.log('restore snapshot', snap.label || snap.created_at);
  }

  const stamp = () => new Date().toISOString().slice(0, 10);

  SS.routes.backups = async (view) => {
    const DB = SS.DB;
    const snapBox = h('div');

    async function paintSnaps() {
      const list = await DB.snapshots.list();
      clear(snapBox);
      if (!list.length) return void snapBox.append(h('p', { class: 'muted' }, 'No snapshots yet.'));
      snapBox.append(h('ul', { class: 'list-plain' }, list.map((s) => h('li', null,
        h('div', { class: 'grow' }, h('b', null, s.label || 'Snapshot'), h('small', null, SS.fmtTime(s.created_at) + (s.counts ? '  ·  ' + s.counts.posts + ' posts' : ''))),
        h('button', { class: 'btn btn--small', type: 'button', onclick: async () => {
          if (!(await SS.confirm({ title: 'Roll back to this snapshot?', ok: 'Roll back', text: 'Posts and settings return to how they were then. Posts written since go to the trash. A snapshot of the current state is taken first, and the site stays as live or down as it is now.' }))) return;
          try { await restore(s); SS.toast('Rolled back'); await paintSnaps(); } catch (e) { SS.fail(e, 'Could not roll back'); }
        } }, icon('restore', 15), 'Roll back'),
        h('button', { class: 'btn btn--small btn--quiet', type: 'button', onclick: async () => {
          try { const d = await DB.snapshots.get(s.id); SS.download(`solosortie-snapshot-${s.created_at.slice(0, 10)}.json`, JSON.stringify(d, null, 2), 'application/json'); } catch (e) { SS.fail(e); }
        } }, 'Download'),
        h('button', { class: 'iconbtn', type: 'button', title: 'Delete snapshot', 'aria-label': 'Delete snapshot', onclick: async () => {
          if (!(await SS.confirm({ title: 'Delete this snapshot?', ok: 'Delete', danger: true }))) return;
          try { await DB.snapshots.remove(s.id); await paintSnaps(); } catch (e) { SS.fail(e); }
        } }, icon('trash', 16)))))
      );
    }

    async function importJson(file) {
      let data;
      try { data = JSON.parse(await SS.readFile(file)); } catch (e) { return SS.toast('That file is not valid JSON.', 'error'); }
      if (!data || !Array.isArray(data.posts)) return SS.toast('That does not look like a solosortie export.', 'error');
      const choice = await new Promise((res) => {
        let withS = false, m;
        m = SS.modal({
          title: 'Import ' + data.posts.length + ' posts?', onClose: (v) => res(v || null),
          body: h('div', null,
            h('p', { class: 'modal__text' }, 'Posts with the same identity are updated and the rest are added. A snapshot is taken first.'),
            data.settings ? h('div', { class: 'switchrow' }, SS.switch(false, (x) => { withS = x; }, 'Also import the site settings')) : null,
            data.settings ? h('p', { class: 'field__hint' }, 'The site keeps its current live or down state either way.') : null,
            h('div', { class: 'modal__actions' },
              h('button', { class: 'btn', type: 'button', onclick: () => m.close(undefined) }, 'Cancel'),
              h('button', { class: 'btn btn--primary', type: 'button', onclick: () => m.close({ settings: withS }) }, 'Import')))
        });
      });
      if (!choice) return;
      const withSettings = choice.settings && data.settings;
      try {
        await snapshot('Before import');
        await DB.posts.upsertMany(data.posts);
        if (withSettings) { const { site_state, down_message, ...rest } = data.settings; await DB.settings.set(rest); Object.assign(SS.state.settings, await DB.settings.get()); }
        DB.activity.log('import', data.posts.length + ' posts');
        SS.toast('Imported ' + data.posts.length + ' posts'); await paintSnaps();
      } catch (e) { SS.fail(e, 'Import stopped'); }
    }

    async function importMarkdown(files) {
      try {
        const existing = new Set((await DB.posts.list()).concat(await DB.posts.list({ trash: true })).map((p) => p.slug));
        let n = 0;
        for (const f of files) {
          const p = SS.fromMarkdown(await SS.readFile(f), f.name);
          let slug = p.slug || 'untitled', k = 2; while (existing.has(slug)) slug = p.slug + '-' + k++;
          p.slug = slug; existing.add(slug);
          await DB.posts.save(p); n++;
        }
        DB.activity.log('import', n + ' markdown files'); SS.toast(n + (n === 1 ? ' draft' : ' drafts') + ' added. Review them in Posts.');
      } catch (e) { SS.fail(e, 'Import stopped'); }
    }

    const jsonIn = h('input', { type: 'file', accept: 'application/json,.json', hidden: true, onchange: () => { if (jsonIn.files[0]) importJson(jsonIn.files[0]); jsonIn.value = ''; } });
    const mdIn = h('input', { type: 'file', accept: '.md,text/markdown', multiple: true, hidden: true, onchange: () => { if (mdIn.files.length) importMarkdown(Array.from(mdIn.files)); mdIn.value = ''; } });

    view.append(
      h('div', { class: 'head' }, h('h1', null, 'Backups'), h('p', { class: 'head__note' }, 'Your writing lives in your own database. These keep a copy you can hold.')),
      h('section', { class: 'section' }, h('h2', null, 'Snapshots'), h('p', null, 'A snapshot is a full copy of every post and setting, kept online. Roll back to any of them.'),
        h('div', { class: 'inline', style: { marginBottom: '16px' } }, h('button', { class: 'btn btn--primary', type: 'button', onclick: async () => {
          const label = await SS.ask({ title: 'Take a snapshot', label: 'Name it so you can find it later', value: 'Snapshot ' + stamp(), ok: 'Take snapshot' });
          if (label == null) return;
          try { await snapshot(label.trim() || 'Snapshot'); SS.toast('Snapshot saved'); await paintSnaps(); } catch (e) { SS.fail(e); }
        } }, icon('plus', 16), 'Take a snapshot')), snapBox),
      h('hr', { class: 'hr' }),
      h('section', { class: 'section' }, h('h2', null, 'Export'), h('p', null, 'Files download to this device.'),
        h('div', { class: 'inline' },
          h('button', { class: 'btn', type: 'button', onclick: async () => { try { const d = await collect(); SS.download(`solosortie-${stamp()}.json`, JSON.stringify(d, null, 2), 'application/json'); DB.activity.log('export', 'json'); } catch (e) { SS.fail(e); } } }, icon('upload', 16), 'Everything (JSON)'),
          h('button', { class: 'btn', type: 'button', onclick: async () => {
            try {
              const d = await collect();
              const used = new Set();
              const files = d.posts.filter((p) => !p.deleted_at).map((p) => { let n = (p.slug || 'untitled'), i = 2; while (used.has(n)) n = p.slug + '-' + i++; used.add(n); return { name: `posts/${n}.md`, data: SS.toMarkdown(p) }; });
              files.push({ name: 'settings.json', data: JSON.stringify(d.settings, null, 2) });
              SS.download(`solosortie-posts-${stamp()}.zip`, SS.zip(files), 'application/zip'); DB.activity.log('export', 'markdown');
            } catch (e) { SS.fail(e); }
          } }, icon('upload', 16), 'Posts as Markdown (.zip)'))),
      h('hr', { class: 'hr' }),
      h('section', { class: 'section' }, h('h2', null, 'Import'), h('p', null, 'Bring writing in from an export, or from Markdown files. Markdown files arrive as drafts.'),
        h('div', { class: 'inline' },
          h('button', { class: 'btn', type: 'button', onclick: () => jsonIn.click() }, 'From an export (JSON)'),
          h('button', { class: 'btn', type: 'button', onclick: () => mdIn.click() }, 'From Markdown files'), jsonIn, mdIn)));
    await paintSnaps();
  };
})();
