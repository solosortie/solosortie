/* solosortie dashboard — data layer (Supabase)
   Every screen talks to this interface only. */
(function () {
  'use strict';
  const SS = window.SS;

  SS.supabaseDB = function () {
    const cfg = window.SS_CONFIG;
    if (!window.supabase || !window.supabase.createClient) throw new Error('The Supabase library did not load (js/lib/supabase.js).');
    const sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
    });

    const mapErr = (e) => {
      const msg = (e && e.message) || String(e);
      if ((e && e.code === '23505') || /duplicate key/i.test(msg)) return SS.err('slug_taken', 'That address is already used by another post.');
      if ((e && e.code === '42501') || /permission denied|row-level security|not allowed/i.test(msg)) return SS.err('denied', 'Not allowed. Sign in again, and check that this account is the admin.');
      return SS.err((e && e.code) || 'error', msg);
    };
    const ok = ({ data, error }) => { if (error) throw mapErr(error); return data; };

    const COLS = ['id', ...SS.POST_FIELDS, 'has_password', 'created_at', 'updated_at', 'deleted_at'].join(',');
    const rowOf = (p) => { const r = {}; SS.POST_FIELDS.forEach((k) => { r[k] = p[k]; }); return r; };

    const auth = {
      async session() {
        const { data } = await sb.auth.getSession();
        return data.session ? { id: data.session.user.id, email: data.session.user.email } : null;
      },
      async signIn(email, password) {
        const { error } = await sb.auth.signInWithPassword({ email, password });
        if (error) throw SS.err('auth', error.message);
        const { data: aal } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
        if (aal && aal.nextLevel === 'aal2' && aal.currentLevel !== 'aal2') {
          const { data: f } = await sb.auth.mfa.listFactors();
          return { mfa: f.totp[0].id };
        }
        return { ok: true };
      },
      async verifyMfa(factorId, code) {
        const { data: ch, error: e1 } = await sb.auth.mfa.challenge({ factorId });
        if (e1) throw SS.err('auth', e1.message);
        const { error } = await sb.auth.mfa.verify({ factorId, challengeId: ch.id, code: String(code).trim() });
        if (error) { console.error(error); throw SS.err('auth', 'That code did not work. Check the time on your device and try the next code.'); }
      },
      async isAdmin() { const { data } = await sb.rpc('is_admin'); return data === true; },
      async signOut(everywhere) { await sb.auth.signOut({ scope: everywhere ? 'global' : 'local' }); },
      async updatePassword(password) {
        const { error } = await sb.auth.updateUser({ password });
        if (error) throw SS.err('auth', error.message);
      },
      onSignOut(cb) { sb.auth.onAuthStateChange((event) => { if (event === 'SIGNED_OUT') cb(); }); },
      mfa: {
        async factors() { const { data } = await sb.auth.mfa.listFactors(); return (data && data.totp) || []; },
        async enroll() {
          const { data: all } = await sb.auth.mfa.listFactors();
          for (const f of (all && all.all) || []) if (f.status === 'unverified') await sb.auth.mfa.unenroll({ factorId: f.id });
          const { data, error } = await sb.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'solosortie ' + Date.now().toString(36) });
          if (error) throw SS.err('auth', error.message);
          return { id: data.id, qr: data.totp.qr_code, secret: data.totp.secret };
        },
        async confirm(id, code) {
          const { data: ch, error: e1 } = await sb.auth.mfa.challenge({ factorId: id });
          if (e1) throw SS.err('auth', e1.message);
          const { error } = await sb.auth.mfa.verify({ factorId: id, challengeId: ch.id, code: String(code).trim() });
          if (error) { console.error(error); throw SS.err('auth', 'That code did not work. Try the next one.'); }
        },
        async remove(id) { const { error } = await sb.auth.mfa.unenroll({ factorId: id }); if (error) throw SS.err('auth', error.message); }
      }
    };

    const posts = {
      async list({ trash = false } = {}) {
        let q = sb.from('posts').select(COLS);
        q = trash ? q.not('deleted_at', 'is', null) : q.is('deleted_at', null);
        return ok(await q.order('created_at', { ascending: false }).limit(2000));
      },
      async get(id) { return ok(await sb.from('posts').select(COLS).eq('id', id).single()); },
      async save(post) {
        const row = rowOf(post);
        const s = post.id
          ? ok(await sb.from('posts').update(row).eq('id', post.id).select(COLS).single())
          : ok(await sb.from('posts').insert(row).select(COLS).single());
        if (row.featured) await posts.setFeatured(s.id);
        return s;
      },
      async setTrashed(id, trashed) {
        return ok(await sb.from('posts').update({ deleted_at: trashed ? new Date().toISOString() : null, featured: false, pinned: false }).eq('id', id).select(COLS).single());
      },
      async purge(id) { ok(await sb.from('posts').delete().eq('id', id)); },
      async setPassword(id, password) { ok(await sb.rpc('set_post_password', { p_id: id, p_password: password || null })); },
      async setFeatured(id) { ok(await sb.rpc('set_featured', { p_id: id })); },
      async revisions(id) { return ok(await sb.from('revisions').select('id,title,subtitle,body,created_at').eq('post_id', id).order('created_at', { ascending: false })); },
      async upsertMany(rows) {
        const clean = rows.map((r) => ({ id: r.id, ...rowOf(r), created_at: r.created_at || new Date().toISOString(), deleted_at: r.deleted_at || null }));
        let firstFeatured = null;
        clean.forEach((r) => { if (r.featured) { if (firstFeatured) r.featured = false; else firstFeatured = r.id; } });
        for (let i = 0; i < clean.length; i += 40) ok(await sb.from('posts').upsert(clean.slice(i, i + 40), { onConflict: 'id' }));
        if (firstFeatured) await posts.setFeatured(firstFeatured);
      }
    };

    const settings = {
      async get() {
        const rows = ok(await sb.from('settings').select('key,value'));
        const o = { ...SS.DEFAULT_SETTINGS };
        rows.forEach((r) => { if (r.value !== null) o[r.key] = r.value; });
        return o;
      },
      async set(patch) {
        const now = new Date().toISOString();
        ok(await sb.from('settings').upsert(Object.entries(patch).map(([key, value]) => ({ key, value, updated_at: now })), { onConflict: 'key' }));
      }
    };

    const media = {
      async list() { return ok(await sb.from('media').select('*').order('created_at', { ascending: false }).limit(1000)); },
      async upload({ blob, name, mime, width, height }, alt = '') {
        const d = new Date();
        const ext = ((name.match(/\.([a-z0-9]+)$/i) || [])[1] || 'bin').toLowerCase();
        const safe = SS.slugify(name.replace(/\.[^.]+$/, '')) || 'image';
        const path = `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${SS.uid().slice(0, 8)}-${safe}.${ext}`;
        const { error } = await sb.storage.from('media').upload(path, blob, { contentType: mime, cacheControl: '31536000', upsert: false });
        if (error) throw mapErr(error);
        const url = sb.storage.from('media').getPublicUrl(path).data.publicUrl;
        return ok(await sb.from('media').insert({ path, url, name, alt, width: width || null, height: height || null, bytes: blob.size, mime }).select('*').single());
      },
      async update(id, patch) { return ok(await sb.from('media').update(patch).eq('id', id).select('*').single()); },
      async remove(item) {
        const { error } = await sb.storage.from('media').remove([item.path]);
        if (error) throw mapErr(error);
        ok(await sb.from('media').delete().eq('id', item.id));
      }
    };

    const snapshots = {
      async list() { return ok(await sb.from('snapshots').select('id,label,created_at,counts:data->counts').order('created_at', { ascending: false }).limit(100)); },
      async get(id) { const r = ok(await sb.from('snapshots').select('data').eq('id', id).single()); return r.data; },
      async create(label, data) { return ok(await sb.from('snapshots').insert({ label, data }).select('id,label,created_at').single()); },
      async remove(id) { ok(await sb.from('snapshots').delete().eq('id', id)); }
    };

    const activity = {
      async list(limit = 100) { return ok(await sb.from('activity').select('*').order('at', { ascending: false }).limit(limit)); },
      async log(kind, detail = '') { try { await sb.from('activity').insert({ kind, detail }); } catch (e) { /* the log never blocks the action */ } }
    };

    const views = {
      async summary(days = 30) {
        const since = new Date(Date.now() - days * 864e5).toISOString().slice(0, 10);
        return ok(await sb.from('post_views').select('post_id,day,count').gte('day', since));
      }
    };

    return { mode: 'supabase', auth, posts, settings, media, snapshots, activity, views };
  };
})();
