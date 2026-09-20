/* solosortie: public site
   Reads from Supabase through read-only functions (list_posts, get_post, unlock_post, track_view)
   and one public settings table. Nothing here can write. */
(function () {
  'use strict';

  var CFG = window.SS_CONFIG || {};
  var CONFIGURED = /^https?:\/\/.+/.test(CFG.SUPABASE_URL || '') && (CFG.SUPABASE_ANON_KEY || '').length > 20;
  var FILE = location.protocol === 'file:';
  // plain static servers and double-clicked files can't rewrite /p/slug, so they use post.html?s=slug
  var STATIC = FILE || /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
  var PAGE = document.body.getAttribute('data-page') || 'home';
  var $ = function (s, r) { return (r || document).querySelector(s); };

  var DEFAULTS = {
    site_name: 'solosortie',
    site_state: 'live',
    down_message: '',
    nav: [
      { label: 'Home', href: '/', visible: true },
      { label: 'Archive', href: '/archive', visible: true },
      { label: 'About', href: '/about', visible: true }
    ],
    accent: '#b0336f', theme: 'light', body_font: 'serif', heading_font: 'sans', text_size: 20,
    home_hero: true, home_layout: 'list', posts_per_page: 10,
    show_dates: true, show_reading_time: true,
    about_md: '', footer_md: '', notfound_md: '',
    logo_url: '', favicon_url: '', og_image: '', meta_description: '', robots_index: true
  };

  /* ── helpers ─────────────────────────────────────────── */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function fmtDate(iso) {
    if (!iso) return '';
    var d = new Date(iso), o = { month: 'short', day: 'numeric' };
    if (d.getFullYear() !== new Date().getFullYear()) o.year = 'numeric';
    return d.toLocaleDateString('en-US', o);
  }
  var ROUTES = { home: ['/', 'index.html'], archive: ['/archive', 'archive.html'], about: ['/about', 'about.html'] };
  function pageUrl(name, q) { return (STATIC ? ROUTES[name][1] : ROUTES[name][0]) + (q || ''); }
  function postUrl(slug) { return STATIC ? 'post.html?s=' + encodeURIComponent(slug) : '/p/' + encodeURIComponent(slug); }
  function navHref(h) {
    if (!STATIC) return h;
    return { '/': 'index.html', '/archive': 'archive.html', '/about': 'about.html' }[h] || h;
  }
  function slugFromUrl() {
    var m = location.pathname.match(/^\/p\/([^/]+)/);
    if (m) return decodeURIComponent(m[1]);
    return new URLSearchParams(location.search).get('s');
  }

  function sanitize(html) {
    var t = document.createElement('template');
    t.innerHTML = html;
    t.content.querySelectorAll('script,style,object,embed,link,meta,base,form').forEach(function (n) { n.remove(); });
    t.content.querySelectorAll('*').forEach(function (n) {
      Array.prototype.slice.call(n.attributes).forEach(function (a) {
        var name = a.name.toLowerCase(), v = a.value.replace(/\s/g, '').toLowerCase();
        if (name.indexOf('on') === 0) n.removeAttribute(a.name);
        else if (/^(href|src|xlink:href|action|formaction)$/.test(name) && /^(javascript|vbscript|data:text\/html)/.test(v)) n.removeAttribute(a.name);
      });
    });
    t.content.querySelectorAll('a[href^="http"]').forEach(function (a) { a.rel = 'noopener noreferrer'; });
    t.content.querySelectorAll('img').forEach(function (i) { i.loading = 'lazy'; i.decoding = 'async'; });
    // ![alt](url "caption") becomes a figure with a caption
    t.content.querySelectorAll('img[title]').forEach(function (img) {
      var cap = img.getAttribute('title').trim(); img.removeAttribute('title');
      if (!cap) return;
      var fig = document.createElement('figure'), fc = document.createElement('figcaption');
      fc.textContent = cap;
      var p = img.parentElement;
      var alone = p && p.tagName === 'P' && Array.prototype.every.call(p.childNodes, function (n) { return n === img || (n.nodeType === 3 && !n.textContent.trim()); });
      (alone ? p : img).replaceWith(fig);
      fig.appendChild(img); fig.appendChild(fc);
    });
    return t.innerHTML;
  }
  function mdHtml(src) {
    if (!src) return '';
    try { return sanitize(window.marked.parse(String(src), { gfm: true })); }
    catch (e) { return '<p>' + esc(src) + '</p>'; }
  }

  var LOCK = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-label="Password protected"><rect x="3.2" y="7" width="9.6" height="6.6" rx="1.6"/><path d="M5.4 7V5.2a2.6 2.6 0 0 1 5.2 0V7"/></svg>';

  function metaHtml(p, s) {
    var parts = [];
    if (s.show_dates !== false && p.show_date !== false && p.published_at)
      parts.push('<time datetime="' + esc(p.published_at) + '">' + fmtDate(p.published_at) + '</time>');
    if (s.show_reading_time !== false && p.minutes) parts.push('<span>' + p.minutes + ' min read</span>');
    if (!parts.length && !p.has_password) return '';
    return '<div class="meta">' + (p.has_password ? LOCK : '') + parts.join('<i></i>') + '</div>';
  }

  /* ── data ────────────────────────────────────────────── */
  function liveApi() {
    var base = CFG.SUPABASE_URL.replace(/\/$/, '') + '/rest/v1';
    var headers = { apikey: CFG.SUPABASE_ANON_KEY, Authorization: 'Bearer ' + CFG.SUPABASE_ANON_KEY, 'Content-Type': 'application/json' };
    function rpc(name, args) {
      return fetch(base + '/rpc/' + name, { method: 'POST', headers: headers, body: JSON.stringify(args || {}) })
        .then(function (r) { if (!r.ok) throw new Error(name + ' failed (' + r.status + ')'); return r.json(); });
    }
    return {
      settings: function () {
        return fetch(base + '/settings?select=key,value', { headers: headers })
          .then(function (r) { if (!r.ok) throw new Error('settings failed (' + r.status + ')'); return r.json(); })
          .then(function (rows) { var o = {}; rows.forEach(function (x) { o[x.key] = x.value; }); return o; });
      },
      list: function () { return rpc('list_posts'); },
      post: function (slug) { return rpc('get_post', { p_slug: slug }).then(function (r) { return r[0] || null; }); },
      unlock: function (slug, pw) { return rpc('unlock_post', { p_slug: slug, p_password: pw }); },
      track: function (slug) { rpc('track_view', { p_slug: slug }).catch(function () {}); }
    };
  }
  var api = CONFIGURED ? liveApi() : null;

  /* ── document head ───────────────────────────────────── */
  function metaTag(attr, key, val) {
    var m = document.head.querySelector('meta[' + attr + '="' + key + '"]');
    if (!val) { if (m) m.remove(); return; }
    if (!m) { m = document.createElement('meta'); m.setAttribute(attr, key); document.head.appendChild(m); }
    m.setAttribute('content', val);
  }
  function setHead(s, o) {
    o = o || {};
    var title = o.title ? o.title + ' · ' + s.site_name : s.site_name;
    document.title = title;
    var desc = o.description || s.meta_description || '';
    var img = o.image || s.og_image || '';
    metaTag('name', 'description', desc);
    metaTag('property', 'og:title', o.title || s.site_name);
    metaTag('property', 'og:description', desc);
    metaTag('property', 'og:image', img);
    metaTag('property', 'og:type', o.title ? 'article' : 'website');
    metaTag('name', 'twitter:card', img ? 'summary_large_image' : 'summary');
    metaTag('name', 'robots', (s.robots_index === false || o.noindex) ? 'noindex, nofollow' : '');
    if (s.favicon_url) {
      var l = document.head.querySelector('link[rel="icon"]');
      if (l) { l.href = s.favicon_url; l.removeAttribute('type'); }
    }
  }

  /* ── chrome ──────────────────────────────────────────── */
  var PATH_END = '<div class="path path--walk"><i class="dots"></i><i class="end"></i></div>';
  var PATH_BLANK = '<div class="blank"><div class="path"><i class="ring"></i><i class="dots"></i></div></div>';

  function chrome(s) {
    var logo = s.logo_url || (FILE ? 'assets/mark.svg' : '/assets/mark.svg');
    $('#masthead').innerHTML =
      '<a class="masthead__mark" href="' + pageUrl('home') + '" aria-label="' + esc(s.site_name) + '"><img src="' + esc(logo) + '" alt=""></a>' +
      '<a class="masthead__name" href="' + pageUrl('home') + '">' + esc(s.site_name) + '</a>';

    var items = (Array.isArray(s.nav) ? s.nav : DEFAULTS.nav).filter(function (n) { return n && n.visible !== false && n.label; });
    var active = { '/': 'home', '/archive': 'archive', '/about': 'about' };
    $('#nav').innerHTML = items.length < 2 ? '' : items.map(function (n) {
      var cur = active[n.href] === PAGE ? ' aria-current="page"' : '';
      return '<a href="' + esc(navHref(n.href)) + '"' + cur + '>' + esc(n.label) + '</a>';
    }).join('');
    if (items.length < 2) $('#nav').hidden = true;

    $('#foot').innerHTML = (s.footer_md ? '<div class="foot__text">' + mdHtml(s.footer_md) + '</div>' : '') + PATH_END;
  }

  function closed(s, maintenance) {
    var b = document.body;
    b.classList.add('is-down', 'ready');
    metaTag('name', 'robots', 'noindex, nofollow');
    document.title = s.site_name;
    if (maintenance && s.down_message) {
      var n = document.createElement('div');
      n.className = 'notice';
      n.innerHTML = '<div class="notice__text">' + mdHtml(s.down_message) + '</div>';
      b.appendChild(n);
    }
  }

  /* ── pages ───────────────────────────────────────────── */
  function itemHtml(p, s) {
    var sub = p.subtitle || p.excerpt;
    var thumb = p.cover_url ? '<a class="item__thumb" href="' + postUrl(p.slug) + '" tabindex="-1" aria-hidden="true"><img src="' + esc(p.cover_url) + '" alt="" loading="lazy"></a>' : '';
    return '<article class="item' + (p.cover_url ? '' : ' item--plain') + '"><div class="item__body">' +
      '<h2 class="item__title"><a href="' + postUrl(p.slug) + '">' + esc(p.title || 'Untitled') + '</a></h2>' +
      (sub ? '<p class="item__sub">' + esc(sub) + '</p>' : '') + metaHtml(p, s) + '</div>' + thumb + '</article>';
  }

  function home(s) {
    return api.list().then(function (all) {
      var pool = all.filter(function (p) { return p.status !== 'archived'; });
      var main = $('#main');
      if (!pool.length) { main.innerHTML = PATH_BLANK; return; }

      var hero = null;
      if (s.home_hero !== false) hero = pool.filter(function (p) { return p.featured; })[0] || pool[0];
      var rest = hero ? pool.filter(function (p) { return p.id !== hero.id; }) : pool;
      var per = Math.max(1, Number(s.posts_per_page) || 10);
      var shown = per;

      var html = '';
      if (hero) {
        var link = postUrl(hero.slug), sub = hero.subtitle || hero.excerpt;
        html += '<section class="hero' + (hero.cover_url ? '' : ' hero--plain') + '">' +
          (hero.cover_url ? '<a class="hero__img" href="' + link + '" tabindex="-1" aria-hidden="true"><img src="' + esc(hero.cover_url) + '" alt="' + esc(hero.cover_alt) + '"></a>' : '') +
          '<div class="hero__body"><h1 class="hero__title"><a href="' + link + '">' + esc(hero.title || 'Untitled') + '</a></h1>' +
          (sub ? '<p class="hero__sub">' + esc(sub) + '</p>' : '') + metaHtml(hero, s) + '</div></section>';
      }
      html += '<div class="path' + (s.home_layout === 'grid' ? ' path--wide' : '') + '"><i class="ring"></i><i class="dots"></i></div>' +
        '<div class="list' + (s.home_layout === 'grid' ? ' list--grid' : '') + '" id="list"></div><div class="more" id="more"></div>';
      main.innerHTML = html;

      function paint() {
        var slice = rest.slice(0, shown);
        $('#list').innerHTML = slice.map(function (p) { return itemHtml(p, s); }).join('<div class="path"><i class="dots"></i></div>');
        var more = $('#more');
        more.innerHTML = rest.length > shown ? '<button type="button">Older posts</button>' : '';
        if (rest.length > shown) more.firstChild.addEventListener('click', function () { shown += per; paint(); });
      }
      paint();
    });
  }

  function archive(s) {
    var tag = new URLSearchParams(location.search).get('tag');
    return api.list().then(function (all) {
      var posts = all.filter(function (p) { return !tag || (p.tags || []).indexOf(tag) > -1; })
        .sort(function (a, b) { return new Date(b.published_at) - new Date(a.published_at); });
      var main = $('#main');
      if (!posts.length) { main.innerHTML = PATH_BLANK; return; }
      var html = '<section class="archive">';
      if (tag) html += '<div class="archive__tag"><span>' + esc(tag) + '</span><a href="' + pageUrl('archive') + '">Show all</a></div>';
      var year = null;
      posts.forEach(function (p) {
        var y = p.published_at ? new Date(p.published_at).getFullYear() : '';
        if (y !== year) { html += '<h2 class="archive__year">' + y + '</h2>'; year = y; }
        html += '<a class="row" href="' + postUrl(p.slug) + '"><span class="row__title">' + esc(p.title || 'Untitled') + '</span><span class="row__lead"></span>' +
          (p.show_date !== false && s.show_dates !== false && p.published_at ? '<span class="row__date">' + fmtDate(p.published_at).replace(/,? \d{4}$/, '') + '</span>' : '') + '</a>';
      });
      main.innerHTML = html + '</section>';
    });
  }

  function textPage(md) {
    var main = $('#main');
    main.innerHTML = md ? '<div class="page"><div class="prose">' + mdHtml(md) + '</div></div>' : PATH_BLANK;
    return Promise.resolve();
  }

  function notFound(s) {
    setHead(s, { title: '', noindex: true });
    document.title = s.site_name;
    return textPage(s.notfound_md);
  }

  function post(s) {
    var slug = slugFromUrl();
    var q = slug ? api.post(slug) : Promise.resolve(null);
    return q.then(function (p) {
      if (!p) return notFound(s);
      var locked = !!p.has_password && !p.body;
      setHead(s, {
        title: p.meta_title || p.title,
        description: locked ? '' : (p.meta_description || p.excerpt || p.subtitle),
        image: locked ? '' : (p.og_image_url || p.cover_url),
        noindex: p.noindex
      });
      $('#main').innerHTML = '<article>' +
        '<header class="art-head"><h1 class="art-head__title">' + esc(p.title || 'Untitled') + '</h1>' +
        (p.subtitle ? '<p class="art-head__sub">' + esc(p.subtitle) + '</p>' : '') + metaHtml(p, s) + '</header>' +
        (p.cover_url ? '<figure class="art-cover"><img src="' + esc(p.cover_url) + '" alt="' + esc(p.cover_alt) + '"></figure>' : '') +
        '<div class="prose" id="prose"' + (locked ? ' hidden' : '') + '></div><div id="after"></div></article>';

      function open(body) {
        var pr = $('#prose'); pr.innerHTML = mdHtml(body); pr.hidden = false;
        var tags = (p.tags || []).filter(Boolean);
        $('#after').innerHTML = tags.length ? '<nav class="tags" aria-label="Tags">' + tags.map(function (t) {
          return '<a href="' + pageUrl('archive', '?tag=' + encodeURIComponent(t)) + '">' + esc(t) + '</a>';
        }).join('') + '</nav>' : '';
      }
      if (!locked) { open(p.body || ''); track(slug); return; }

      $('#after').innerHTML = '<form class="lock" autocomplete="off"><input type="password" name="pw" placeholder="Password" aria-label="Password" required>' +
        '<button type="submit">Open</button><p class="lock__err" role="alert" hidden>That is not the password.</p></form>';
      var form = $('.lock');
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var pw = form.pw.value, err = $('.lock__err');
        err.hidden = true;
        api.unlock(slug, pw).then(function (body) {
          if (body == null) { err.hidden = false; form.pw.select(); return; }
          open(body); track(slug);
        }).catch(function () { err.textContent = 'Could not check the password. Try again.'; err.hidden = false; });
      });
    });
  }
  function track(slug) {
    try { if (sessionStorage.getItem('ss:v:' + slug)) return; sessionStorage.setItem('ss:v:' + slug, '1'); } catch (e) {}
    api.track(slug);
  }

  /* ── boot ────────────────────────────────────────────── */
  function walk() {
    var els = document.querySelectorAll('.path--walk');
    if (!('IntersectionObserver' in window)) { els.forEach(function (e) { e.classList.add('is-walked'); }); return; }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add('is-walked'); io.unobserve(en.target); } });
    }, { threshold: 0.6 });
    els.forEach(function (e) { io.observe(e); });
  }

  function boot() {
    var s = Object.assign({}, DEFAULTS);
    if (!CONFIGURED) {
      console.error('[solosortie] Add SUPABASE_URL and SUPABASE_ANON_KEY to js/config.js');
      window.SSLook.apply(s); chrome(s); $('#main').innerHTML = PATH_BLANK; document.body.classList.add('ready');
      return;
    }
    api.settings().catch(function (e) { console.warn('[solosortie] settings:', e.message); return {}; }).then(function (remote) {
      Object.keys(remote).forEach(function (k) { if (remote[k] !== null && remote[k] !== undefined) s[k] = remote[k]; });
      window.SSLook.apply(s); window.SSLook.save(s);

      if (s.site_state === 'down') return closed(s, false);
      if (s.site_state === 'maintenance') return closed(s, true);

      var run;
      try { chrome(s); } catch (e) { console.error('[solosortie]', e); }
      if (PAGE === 'home') { setHead(s); run = home(s); }
      else if (PAGE === 'archive') { setHead(s, { title: 'Archive' }); run = archive(s); }
      else if (PAGE === 'about') { setHead(s, { title: 'About' }); run = textPage(s.about_md); }
      else if (PAGE === 'post') run = post(s);
      else run = notFound(s);

      return Promise.resolve(run).catch(function (e) { console.error('[solosortie]', e); $('#main').innerHTML = PATH_BLANK; })
        .then(function () { document.body.classList.add('ready'); walk(); });
    });
  }
  boot();
})();
