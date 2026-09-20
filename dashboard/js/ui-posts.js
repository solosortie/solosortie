/* solosortie dashboard — Posts */
(function () {
  'use strict';
  const SS = window.SS;
  const { h, icon, clear } = SS;
  SS.routes = SS.routes || {};

  const TABS = [
    ['all', 'All'], ['published', 'Published'], ['draft', 'Drafts'], ['scheduled', 'Scheduled'],
    ['hidden', 'Hidden'], ['unpublished', 'Unpublished'], ['archived', 'Archived'], ['trash', 'Trash']
  ];

  SS.routes.posts = async (view) => {
    const DB = SS.DB;
    let posts = [], trash = [], views = new Map();
    let filter = sessionStorage.getItem('ss:pf') || 'all';
    let q = '';

    async function load() {
      const [a, t, v] = await Promise.all([DB.posts.list(), DB.posts.list({ trash: true }), DB.views.summary(30).catch(() => [])]);
      posts = a; trash = t; views = new Map();
      v.forEach((r) => views.set(r.post_id, (views.get(r.post_id) || 0) + r.count));
      paint();
    }
    const replace = (saved) => { const i = posts.findIndex((p) => p.id === saved.id); if (i > -1) posts[i] = saved; };

    async function change(p, changes, message, kind, reload) {
      try {
        const saved = await DB.posts.save({ ...p, ...changes });
        replace(saved);
        DB.activity.log(kind || 'edit', p.title || p.slug);
        SS.toast(message);
        if (reload) await load(); else paint();
      } catch (e) { SS.fail(e); }
    }

    const publish = (p) => {
      const patch = SS.publishPatch(p);
      return change(p, patch, patch.status === 'scheduled' ? 'Scheduled' : 'Published', patch.status === 'scheduled' ? 'schedule' : 'publish: ' + (p.title || p.slug));
    };
    const unpublish = (p) => change(p, { status: 'unpublished', featured: false }, 'Unpublished', 'unpublish: ' + (p.title || p.slug), true);
    const hide = (p) => change(p, { status: 'hidden', published_at: p.published_at || new Date().toISOString() }, 'Hidden from lists. The link still works.', 'hide: ' + (p.title || p.slug), true);
    const archive = (p) => change(p, { status: 'archived', featured: false, published_at: p.published_at || new Date().toISOString() }, 'Moved to the archive', 'archive: ' + (p.title || p.slug), true);
    const feature = (p) => change(p, { featured: !p.featured }, p.featured ? 'Removed from the top of the home page' : 'Featured on the home page', 'feature', true);
    const pin = (p) => {
      const top = Math.max(-1, ...posts.filter((x) => x.pinned).map((x) => x.sort_order)) + 1;
      return change(p, p.pinned ? { pinned: false, sort_order: 0 } : { pinned: true, sort_order: top }, p.pinned ? 'Unpinned' : 'Pinned to the top of the list', 'pin');
    };

    async function move(p, dir) {
      const pinned = posts.filter((x) => x.pinned).sort((a, b) => a.sort_order - b.sort_order || new Date(b.published_at || 0) - new Date(a.published_at || 0));
      const i = pinned.findIndex((x) => x.id === p.id), j = i + dir;
      if (i < 0 || j < 0 || j >= pinned.length) return;
      [pinned[i], pinned[j]] = [pinned[j], pinned[i]];
      try { for (let k = 0; k < pinned.length; k++) if (pinned[k].sort_order !== k) await DB.posts.save({ ...pinned[k], sort_order: k }); await load(); }
      catch (e) { SS.fail(e); }
    }

    async function duplicate(p) {
      let slug = p.slug + '-copy', n = 2;
      const taken = new Set(posts.concat(trash).map((x) => x.slug));
      while (taken.has(slug)) slug = p.slug + '-copy-' + n++;
      try {
        const saved = await DB.posts.save({ ...p, id: null, title: 'Copy of ' + (p.title || 'Untitled'), slug, status: 'draft', published_at: null, pinned: false, featured: false, sort_order: 0, has_password: false });
        DB.activity.log('duplicate', p.title || p.slug);
        SS.toast('Duplicated as a draft'); SS.go('#/edit/' + saved.id);
      } catch (e) { SS.fail(e); }
    }

    async function toTrash(p) {
      try { await DB.posts.setTrashed(p.id, true); DB.activity.log('trash', p.title || p.slug); SS.toast('Moved to trash'); await load(); } catch (e) { SS.fail(e); }
    }
    async function restore(p) {
      try { await DB.posts.setTrashed(p.id, false); DB.activity.log('restore', p.title || p.slug); SS.toast('Restored'); await load(); }
      catch (e) { SS.fail(e, 'Could not restore. Another post may be using the same address'); }
    }
    async function purge(p) {
      if (!(await SS.confirm({ title: 'Delete forever?', text: `"${p.title || 'Untitled'}" and its history will be removed. This cannot be undone.`, ok: 'Delete forever', danger: true }))) return;
      try { await DB.posts.purge(p.id); DB.activity.log('delete', p.title || p.slug); SS.toast('Deleted'); await load(); } catch (e) { SS.fail(e); }
    }

    function menuFor(p, anchor) {
      const live = SS.isPublic(p);
      const url = SS.siteUrl() && live ? SS.siteUrl('/p/' + p.slug) : null;
      const s = p.status;
      SS.menu(anchor, [
        { label: 'Edit', icon: 'posts', onclick: () => SS.go('#/edit/' + p.id) },
        url ? { label: 'View on site', icon: 'external', onclick: () => window.open(url, '_blank', 'noopener') } : null,
        '-',
        (s === 'draft' || s === 'unpublished' || s === 'scheduled') ? { label: s === 'scheduled' ? 'Publish now' : 'Publish', icon: 'eye', onclick: () => s === 'scheduled' ? change(p, { status: 'published', published_at: new Date().toISOString() }, 'Published', 'publish: ' + p.title, true) : publish(p) } : null,
        (s === 'published' || s === 'archived' || s === 'scheduled') ? { label: 'Unpublish', icon: 'x', onclick: () => unpublish(p) } : null,
        s === 'hidden' ? { label: 'Unhide (list it again)', icon: 'eye', onclick: () => publish(p) } : null,
        s === 'published' ? { label: 'Hide (link only)', icon: 'eye', onclick: () => hide(p) } : null,
        s === 'published' ? { label: 'Archive', icon: 'backup', onclick: () => archive(p) } : null,
        s === 'archived' ? { label: 'Move out of the archive', icon: 'backup', onclick: () => publish(p) } : null,
        '-',
        s === 'published' ? { label: p.featured ? 'Remove from home top' : 'Feature at home top', icon: 'star', onclick: () => feature(p) } : null,
        (s === 'published') ? { label: p.pinned ? 'Unpin' : 'Pin to top of list', icon: 'pin', onclick: () => pin(p) } : null,
        p.pinned ? { label: 'Move up', icon: 'up', onclick: () => move(p, -1) } : null,
        p.pinned ? { label: 'Move down', icon: 'down', onclick: () => move(p, 1) } : null,
        { label: 'Duplicate', icon: 'copy', onclick: () => duplicate(p) },
        '-',
        { label: 'Move to trash', icon: 'trash', danger: true, onclick: () => toTrash(p) }
      ]);
    }

    function quick(p) {
      const s = p.status;
      if (s === 'draft' || s === 'unpublished') return h('button', { class: 'btn btn--small', type: 'button', onclick: () => publish(p) }, 'Publish');
      if (s === 'scheduled') return h('button', { class: 'btn btn--small', type: 'button', onclick: () => change(p, { status: 'published', published_at: new Date().toISOString() }, 'Published', 'publish: ' + p.title, true) }, 'Publish now');
      if (s === 'published') return h('button', { class: 'btn btn--small btn--quiet', type: 'button', onclick: () => unpublish(p) }, 'Unpublish');
      if (s === 'hidden') return h('button', { class: 'btn btn--small btn--quiet', type: 'button', onclick: () => publish(p) }, 'Unhide');
      return null;
    }

    function row(p) {
      const inTrash = !!p.deleted_at;
      const more = h('button', { class: 'iconbtn', type: 'button', 'aria-label': 'More actions for ' + (p.title || 'Untitled') }, icon('more'));
      more.onclick = () => menuFor(p, more);
      const when = p.status === 'scheduled' ? SS.fmtTime(p.published_at) : (p.published_at ? SS.fmtDate(p.published_at) : 'Edited ' + SS.ago(p.updated_at));
      return h('li', { class: 'prow', 'data-id': p.id },
        h('div', { class: 'prow__title' },
          h('a', { href: '#/edit/' + p.id }, p.title || 'Untitled'),
          h('div', { class: 'prow__sub' },
            h('span', { class: 'slug' }, '/p/' + p.slug),
            p.featured ? h('span', { title: 'Featured at the top of the home page' }, icon('star', 15)) : null,
            p.pinned ? h('span', { title: 'Pinned to the top of the list' }, icon('pin', 15)) : null,
            p.has_password ? h('span', { title: 'Password protected' }, icon('lock', 15)) : null)),
        h('div', null, inTrash ? h('span', { class: 'pill' }, h('i', { class: 'glyph glyph--dash' }), 'In trash') : SS.pill(p.status)),
        h('div', { class: 'prow__date' }, when),
        h('div', { class: 'prow__views', title: 'Views in the last 30 days' }, inTrash ? '' : (views.get(p.id) || 0)),
        h('div', { class: 'prow__act' },
          inTrash
            ? [h('button', { class: 'btn btn--small', type: 'button', onclick: () => restore(p) }, 'Restore'),
               h('button', { class: 'btn btn--small btn--danger', type: 'button', onclick: () => purge(p) }, 'Delete forever')]
            : [quick(p), more]));
    }

    const list = h('div');
    const tabs = h('div', { class: 'tabs', role: 'tablist' });
    const search = h('input', { class: 'input', type: 'search', placeholder: 'Search posts', 'aria-label': 'Search posts', oninput: (e) => { q = e.target.value.toLowerCase().trim(); paintList(); } });

    function match(p) { return !q || (p.title + ' ' + p.slug + ' ' + p.subtitle + ' ' + (p.tags || []).join(' ')).toLowerCase().includes(q); }
    function paintTabs() {
      clear(tabs);
      TABS.forEach(([id, label]) => {
        const n = id === 'trash' ? trash.length : id === 'all' ? posts.length : posts.filter((p) => p.status === id).length;
        tabs.append(h('button', { type: 'button', role: 'tab', 'aria-selected': String(filter === id), onclick: () => { filter = id; sessionStorage.setItem('ss:pf', id); paint(); } }, label, h('span', null, n)));
      });
    }
    function paintList() {
      clear(list);
      const src = filter === 'trash' ? trash : filter === 'all' ? posts : posts.filter((p) => p.status === filter);
      const dateOf = (p) => new Date(p.published_at || p.updated_at).getTime();
      const rows = src.filter(match).sort((a, b) => {
        if (filter !== 'trash' && (a.pinned || b.pinned)) return a.pinned !== b.pinned ? (b.pinned ? 1 : -1) : a.sort_order - b.sort_order;
        return dateOf(b) - dateOf(a);
      });
      if (!rows.length) {
        list.append(h('div', { class: 'empty' },
          h('div', { class: 'path' }, h('i', { class: 'ring' }), h('i', { class: 'dots' }), h('i', { class: 'end' })),
          h('p', null, q ? 'No posts match that search.' : filter === 'all' ? 'No posts yet. Write the first one.' : 'Nothing here.'),
          !q && filter === 'all' ? h('a', { class: 'btn btn--primary', href: '#/edit/new' }, icon('plus', 16), 'New post') : null));
        return;
      }
      list.append(h('div', { class: 'pcols' }, h('span', null, 'Title'), h('span', null, 'Status'), h('span', null, 'Date'), h('span', null, '30 days'), h('span')),
        h('ul', { class: 'plist' }, rows.map(row)));
    }
    function paint() { paintTabs(); paintList(); }

    view.append(
      h('div', { class: 'head' }, h('h1', null, 'Posts'), h('span', { class: 'spacer' }),
        h('div', { class: 'search' }, icon('search', 16), search),
        h('a', { class: 'btn btn--primary', href: '#/edit/new' }, icon('plus', 16), 'New post')),
      tabs, list);
    await load();
  };
})();
