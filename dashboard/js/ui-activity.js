/* solosortie dashboard — Activity: private view counts and the action log */
(function () {
  'use strict';
  const SS = window.SS;
  const { h } = SS;
  SS.routes = SS.routes || {};

  SS.routes.activity = async (view) => {
    const DB = SS.DB;
    const [rows, posts, log] = await Promise.all([DB.views.summary(30).catch(() => []), DB.posts.list(), DB.activity.list(80).catch(() => [])]);
    const byDay = new Map(), byPost = new Map();
    rows.forEach((r) => { byDay.set(r.day, (byDay.get(r.day) || 0) + r.count); byPost.set(r.post_id, (byPost.get(r.post_id) || 0) + r.count); });
    const days = [];
    for (let i = 29; i >= 0; i--) { const d = new Date(Date.now() - i * 864e5).toISOString().slice(0, 10); days.push([d, byDay.get(d) || 0]); }
    const total = days.reduce((n, d) => n + d[1], 0), max = Math.max(1, ...days.map((d) => d[1]));
    const top = posts.map((p) => [p, byPost.get(p.id) || 0]).filter((x) => x[1] > 0).sort((a, b) => b[1] - a[1]).slice(0, 8);

    view.append(
      h('div', { class: 'head' }, h('h1', null, 'Activity'), h('p', { class: 'head__note' }, 'Views are counted in your own database, one number per post per day. No cookies, no third parties.')),
      h('section', { class: 'section' },
        h('div', { class: 'stat' }, h('b', null, total.toLocaleString()), h('span', null, 'views in the last 30 days')),
        h('div', { class: 'bars', role: 'img', 'aria-label': 'Views per day for the last 30 days' }, days.map(([d, n]) => h('i', { style: { height: Math.max(2, Math.round(n / max * 100)) + '%' }, title: `${SS.fmtDate(d)}: ${n}` }))),
        h('div', { class: 'bars-axis' }, h('span', null, SS.fmtDate(days[0][0])), h('span', null, 'today'))),
      h('section', { class: 'section', style: { marginTop: '34px' } }, h('h2', null, 'Most read'),
        top.length ? h('table', { class: 'table' }, h('thead', null, h('tr', null, h('th', null, 'Post'), h('th', { style: { textAlign: 'right' } }, 'Views'))),
          h('tbody', null, top.map(([p, n]) => h('tr', null, h('td', null, h('a', { href: '#/edit/' + p.id }, p.title || 'Untitled')), h('td', { style: { textAlign: 'right' } }, n)))))
          : h('p', { class: 'muted' }, 'Nothing yet.')),
      h('hr', { class: 'hr' }),
      h('section', { class: 'section section--wide' }, h('h2', null, 'Log'), h('p', null, 'Sign-ins and changes made from this dashboard.'),
        log.length ? h('table', { class: 'table' }, h('thead', null, h('tr', null, h('th', null, 'When'), h('th', null, 'What'), h('th', null, 'Detail'))),
          h('tbody', null, log.map((e) => h('tr', null, h('td', { style: { whiteSpace: 'nowrap' } }, SS.fmtTime(e.at)), h('td', null, e.kind), h('td', { class: 'muted' }, e.detail)))))
          : h('p', { class: 'muted' }, 'Nothing logged yet.')));
  };
})();
