-- solosortie · database
--
-- Run once: Supabase → SQL Editor → New query → paste this whole file → Run.
-- It is safe to run again later (it never drops your posts).
--
-- How the safety works
--   • Nobody can read or write the tables directly except the one admin account (row-level security).
--   • The public site only talks to four functions: list_posts, get_post, unlock_post, track_view,
--     plus a read-only settings table. Drafts, hidden posts and password hashes never leave the database.
--   • When the site is "put down", those functions return nothing, so the content is unreachable
--     even for someone calling the API by hand.

create extension if not exists pgcrypto with schema extensions;

-- ─────────────────────────────────────────────────────────────
-- Admin
-- ─────────────────────────────────────────────────────────────
create table if not exists public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade
);
alter table public.admins enable row level security;
revoke all on public.admins from anon, authenticated;

-- True only for the admin account. If that account has 2FA switched on,
-- a password-only session is not enough: the session must have passed the 2FA step.
create or replace function public.is_admin()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (select 1 from public.admins where user_id = auth.uid())
     and (
       coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
       or not exists (select 1 from auth.mfa_factors where user_id = auth.uid() and status = 'verified')
     );
$$;
grant execute on function public.is_admin() to anon, authenticated;

-- ─────────────────────────────────────────────────────────────
-- Posts
-- ─────────────────────────────────────────────────────────────
create table if not exists public.posts (
  id               uuid primary key default gen_random_uuid(),
  title            text        not null default '',
  subtitle         text        not null default '',
  slug             text        not null,
  body             text        not null default '',
  excerpt          text        not null default '',
  cover_url        text        not null default '',
  cover_alt        text        not null default '',
  tags             text[]      not null default '{}',
  -- draft: private · published: listed · scheduled: goes live at published_at
  -- hidden: reachable by link, never listed · unpublished: pulled back, private
  -- archived: reachable, listed only on the Archive page
  status           text        not null default 'draft'
                   check (status in ('draft','published','scheduled','hidden','unpublished','archived')),
  published_at     timestamptz,
  pinned           boolean     not null default false,
  featured         boolean     not null default false,
  sort_order       integer     not null default 0,
  reading_minutes  integer,
  show_date        boolean     not null default true,
  meta_title       text        not null default '',
  meta_description text        not null default '',
  og_image_url     text        not null default '',
  noindex          boolean     not null default false,
  password_hash    text,
  has_password     boolean generated always as (password_hash is not null) stored,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz
);
create unique index if not exists posts_slug_live on public.posts (slug) where deleted_at is null;
create index if not exists posts_status_date on public.posts (status, published_at desc);

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;
drop trigger if exists posts_touch on public.posts;
create trigger posts_touch before update on public.posts
  for each row execute function public.touch_updated_at();

-- ─────────────────────────────────────────────────────────────
-- Revisions (at most one every two minutes per post, newest 40 kept)
-- ─────────────────────────────────────────────────────────────
create table if not exists public.revisions (
  id         bigint generated always as identity primary key,
  post_id    uuid not null references public.posts (id) on delete cascade,
  title      text,
  subtitle   text,
  body       text,
  created_at timestamptz not null default now()
);
create index if not exists revisions_post on public.revisions (post_id, created_at desc);

create or replace function public.snapshot_revision()
returns trigger language plpgsql security definer
set search_path = public as $$
begin
  if old.body is distinct from new.body
     or old.title is distinct from new.title
     or old.subtitle is distinct from new.subtitle then
    if not exists (select 1 from public.revisions r
                   where r.post_id = old.id and r.created_at > now() - interval '2 minutes') then
      insert into public.revisions (post_id, title, subtitle, body)
      values (old.id, old.title, old.subtitle, old.body);
      delete from public.revisions
       where post_id = old.id
         and id not in (select id from public.revisions where post_id = old.id
                        order by created_at desc, id desc limit 40);
    end if;
  end if;
  return new;
end $$;
drop trigger if exists posts_revision on public.posts;
create trigger posts_revision before update on public.posts
  for each row execute function public.snapshot_revision();

-- ─────────────────────────────────────────────────────────────
-- Settings (public: it only holds look-and-feel and site state)
-- ─────────────────────────────────────────────────────────────
create table if not exists public.settings (
  key        text primary key,
  value      jsonb not null default 'null'::jsonb,
  updated_at timestamptz not null default now()
);

insert into public.settings (key, value) values
  ('site_state',        '"live"'),
  ('site_name',         '"solosortie"'),
  ('nav',               '[{"label":"Home","href":"/","visible":true},{"label":"Archive","href":"/archive","visible":true},{"label":"About","href":"/about","visible":true}]'),
  ('accent',            '"#b0336f"'),
  ('theme',             '"light"'),
  ('body_font',         '"serif"'),
  ('heading_font',      '"sans"'),
  ('text_size',         '20'),
  ('home_hero',         'true'),
  ('home_layout',       '"list"'),
  ('posts_per_page',    '10'),
  ('show_dates',        'true'),
  ('show_reading_time', 'true'),
  ('robots_index',      'true')
on conflict (key) do nothing;

create or replace function public.site_is_live()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select coalesce((select value #>> '{}' from public.settings where key = 'site_state'), 'live') = 'live';
$$;

-- ─────────────────────────────────────────────────────────────
-- Media, views, activity, snapshots
-- ─────────────────────────────────────────────────────────────
create table if not exists public.media (
  id         uuid primary key default gen_random_uuid(),
  path       text not null unique,
  url        text not null,
  name       text not null default '',
  alt        text not null default '',
  width      integer,
  height     integer,
  bytes      integer,
  mime       text,
  created_at timestamptz not null default now()
);

create table if not exists public.post_views (
  post_id uuid not null references public.posts (id) on delete cascade,
  day     date not null default current_date,
  count   integer not null default 0,
  primary key (post_id, day)
);

create table if not exists public.activity (
  id     bigint generated always as identity primary key,
  at     timestamptz not null default now(),
  kind   text not null,
  detail text not null default ''
);
create index if not exists activity_at on public.activity (at desc);

create table if not exists public.snapshots (
  id         uuid primary key default gen_random_uuid(),
  label      text not null default '',
  data       jsonb not null,
  created_at timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────
-- Row-level security: admin only, except public settings
-- ─────────────────────────────────────────────────────────────
alter table public.posts       enable row level security;
alter table public.revisions   enable row level security;
alter table public.settings    enable row level security;
alter table public.media       enable row level security;
alter table public.post_views  enable row level security;
alter table public.activity    enable row level security;
alter table public.snapshots   enable row level security;

revoke all on public.posts, public.revisions, public.media, public.post_views,
              public.activity, public.snapshots from anon;

do $$
declare t text;
begin
  foreach t in array array['posts','revisions','media','post_views','activity','snapshots'] loop
    execute format('drop policy if exists admin_all on public.%I', t);
    execute format('create policy admin_all on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())', t);
  end loop;
end $$;

drop policy if exists settings_read on public.settings;
create policy settings_read on public.settings for select using (true);
drop policy if exists settings_write on public.settings;
create policy settings_write on public.settings for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
grant select on public.settings to anon, authenticated;

-- ─────────────────────────────────────────────────────────────
-- What the public site may call
-- ─────────────────────────────────────────────────────────────
create or replace function public.word_count(t text)
returns integer language sql immutable as $$
  select coalesce(array_length(regexp_split_to_array(nullif(btrim(t), ''), '\s+'), 1), 0);
$$;

-- Everything that appears in lists. Never includes body, drafts, hidden posts or trash.
create or replace function public.list_posts()
returns table (
  id uuid, title text, subtitle text, slug text, excerpt text, cover_url text, cover_alt text,
  tags text[], status text, published_at timestamptz, pinned boolean, featured boolean,
  sort_order integer, show_date boolean, has_password boolean, minutes integer
)
language sql stable security definer
set search_path = public
as $$
  select p.id, p.title, p.subtitle, p.slug, p.excerpt, p.cover_url, p.cover_alt, p.tags,
         case when p.status = 'scheduled' then 'published' else p.status end,
         p.published_at, p.pinned, p.featured, p.sort_order, p.show_date, p.has_password,
         coalesce(p.reading_minutes, greatest(1, ceil(public.word_count(p.body) / 220.0)::integer))
    from public.posts p
   where p.deleted_at is null
     and public.site_is_live()
     and (p.status in ('published', 'archived')
          or (p.status = 'scheduled' and p.published_at <= now()))
   order by p.pinned desc, p.sort_order asc, p.published_at desc nulls last;
$$;

-- One post by slug. Hidden posts are reachable here; the body of a password-protected post is not returned.
create or replace function public.get_post(p_slug text)
returns table (
  id uuid, title text, subtitle text, slug text, excerpt text, cover_url text, cover_alt text,
  tags text[], status text, published_at timestamptz, pinned boolean, featured boolean,
  sort_order integer, show_date boolean, has_password boolean, minutes integer,
  body text, meta_title text, meta_description text, og_image_url text, noindex boolean
)
language sql stable security definer
set search_path = public
as $$
  select p.id, p.title, p.subtitle, p.slug, p.excerpt, p.cover_url, p.cover_alt, p.tags,
         case when p.status = 'scheduled' then 'published' else p.status end,
         p.published_at, p.pinned, p.featured, p.sort_order, p.show_date, p.has_password,
         coalesce(p.reading_minutes, greatest(1, ceil(public.word_count(p.body) / 220.0)::integer)),
         case when p.password_hash is null then p.body else null end,
         p.meta_title, p.meta_description, p.og_image_url, p.noindex
    from public.posts p
   where p.slug = p_slug
     and p.deleted_at is null
     and public.site_is_live()
     and (p.status in ('published', 'archived', 'hidden')
          or (p.status = 'scheduled' and p.published_at <= now()))
   limit 1;
$$;

-- Returns the body of a protected post if the password is right, otherwise null (after a short wait).
create or replace function public.unlock_post(p_slug text, p_password text)
returns text
language plpgsql volatile security definer
set search_path = public, extensions
as $$
declare r record;
begin
  select p.body, p.password_hash into r
    from public.posts p
   where p.slug = p_slug
     and p.deleted_at is null
     and p.password_hash is not null
     and public.site_is_live()
     and (p.status in ('published', 'archived', 'hidden')
          or (p.status = 'scheduled' and p.published_at <= now()));
  if found and r.password_hash = crypt(coalesce(p_password, ''), r.password_hash) then
    return r.body;
  end if;
  perform pg_sleep(0.5);
  return null;
end $$;

-- Cookie-free view counter: one number per post per day.
create or replace function public.track_view(p_slug text)
returns void
language sql volatile security definer
set search_path = public
as $$
  insert into public.post_views (post_id, day, count)
  select p.id, current_date, 1
    from public.posts p
   where p.slug = p_slug
     and p.deleted_at is null
     and public.site_is_live()
     and (p.status in ('published', 'archived', 'hidden')
          or (p.status = 'scheduled' and p.published_at <= now()))
  on conflict (post_id, day) do update set count = public.post_views.count + 1;
$$;

grant execute on function public.list_posts(), public.get_post(text),
                          public.unlock_post(text, text), public.track_view(text)
  to anon, authenticated;

-- ─────────────────────────────────────────────────────────────
-- Admin-only helpers
-- ─────────────────────────────────────────────────────────────
create or replace function public.set_post_password(p_id uuid, p_password text)
returns void
language plpgsql volatile security definer
set search_path = public, extensions
as $$
begin
  if not public.is_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  update public.posts
     set password_hash = case when coalesce(p_password, '') = '' then null
                              else crypt(p_password, gen_salt('bf')) end
   where id = p_id;
end $$;

-- One post at a time can sit in the hero slot. Pass null to clear it.
create or replace function public.set_featured(p_id uuid)
returns void
language plpgsql volatile security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  update public.posts set featured = false where featured and id is distinct from p_id;
  if p_id is not null then
    update public.posts set featured = true where id = p_id;
  end if;
end $$;

-- ─────────────────────────────────────────────────────────────
-- Image storage
-- ─────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', true, 10485760,
        array['image/jpeg','image/png','image/webp','image/gif','image/avif','image/svg+xml'])
on conflict (id) do update
  set public = true,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists media_admin_all on storage.objects;
create policy media_admin_all on storage.objects for all to authenticated
  using (bucket_id = 'media' and public.is_admin())
  with check (bucket_id = 'media' and public.is_admin());

-- ─────────────────────────────────────────────────────────────
-- LAST STEP: make yourself the admin.
-- 1. Supabase → Authentication → Users → Add user (your email + a long password, "Auto confirm" on).
-- 2. Supabase → Authentication → Sign In / Providers → turn OFF "Allow new users to sign up".
-- 3. Put your email below, uncomment, and run just this line:
--
-- insert into public.admins (user_id) select id from auth.users where email = 'you@example.com';
-- ─────────────────────────────────────────────────────────────
