# solosortie

A quiet personal publication and the dashboard that runs it. Two static sites, one free database, no build step.

```
solosortie/
├─ site/            the public site        → Cloudflare Pages project #1
├─ dashboard/       the creator dashboard  → Cloudflare Pages project #2
├─ supabase/
│  └─ schema.sql    run once in Supabase
└─ configure.mjs    writes your Supabase details into both config files
```

Plain HTML, CSS and JavaScript. The only libraries are `marked` (Markdown) and, in the dashboard, `supabase-js`. Both are vendored in `js/lib/`, so nothing loads from a third-party CDN.

## Set up

### 1. Supabase (free tier)

1. Create a project at supabase.com.
2. **SQL Editor → New query**, paste all of `supabase/schema.sql`, **Run**. (Safe to run again.)
3. **Authentication → Users → Add user.** Your email and a long password, "Auto confirm" on.
4. **Authentication → Sign In / Providers → turn off "Allow new users to sign up".**
5. In the SQL Editor, make that user the owner (use your real email):
   ```sql
   insert into public.admins (user_id) select id from auth.users where email = 'you@example.com';
   ```
6. **Project Settings → API:** copy the *Project URL* and the *anon public* key.

### 2. Connect both sites

```
node configure.mjs https://YOUR-PROJECT.supabase.co YOUR-ANON-KEY https://your-site-domain
```

That fills `site/js/config.js` and `dashboard/js/config.js`. Or edit those two files by hand. Until they are filled in, the dashboard shows a "Connect your database" screen and the public site stays blank.

The anon key is meant to be public. What protects your data is the database rules in `schema.sql`.

### 3. Cloudflare Pages: two projects

Connect a Git repo containing this folder, then create **two** Pages projects from it:

| Project | Root directory | Build command | Output directory |
|---|---|---|---|
| public site | `site` | *(none)* | `/` |
| dashboard | `dashboard` | *(none)* | `/` |

Or without Git: `npx wrangler pages deploy site --project-name solosortie` and `npx wrangler pages deploy dashboard --project-name solosortie-dashboard`.

Give each its own domain, for example `solosortie.com` and `write.solosortie.com`. The `_redirects` and `_headers` files are picked up automatically; `_redirects` is what makes `/p/your-post` work.

### 4. Sign in

Open the dashboard, sign in, then **Security → Set up two-factor**. Once 2FA is on, the database itself refuses a password-only session.

To run locally, serve each folder with any static server, e.g. `cd dashboard && python3 -m http.server 8000`. On localhost the public site links posts as `post.html?s=slug`; on Cloudflare it uses `/p/slug`.

## What the dashboard controls

| Area | What you can do |
|---|---|
| **Posts** | Write in Markdown on a wide page with live preview (Write, Split or Preview) and autosave; six states (draft, published, scheduled, hidden, unpublished, archived); trash and restore; pin, reorder pinned, feature at the top of the home page; duplicate; version history; password-protect a post; tags, cover, reading time, per-post search and share settings. All of that lives in a settings drawer that stays closed while you write |
| **Formatting** | Bold, italic, strikethrough, headings, quote, bulleted and numbered lists, link, image, inline code, code block, table, divider. Lists continue on Enter, Tab indents, undo keeps working, and pasting or dropping an image uploads it |
| **Media** | Upload (drag, paste, or drop into a post), auto-resize to WebP, description and caption when inserting, see where each image is used, delete |
| **Pages** | About, footer and 404 text; navigation links (rename, reorder, hide, add) |
| **Look** | Accent colour, light / dark / match device, reading and title fonts, text size, list or grid home, hero on or off, posts per page, dates and reading time on or off, logo, favicon. Live preview |
| **Site** | **Live, Maintenance (your message) or Down (blank page)**; site name, description, share image, search-engine visibility |
| **Backups** | Snapshots you can roll back to, export everything as JSON or Markdown (.zip), import from an export or from `.md` files |
| **Security** | Change password, two-factor, auto sign-out after inactivity, sign out of every device |
| **Activity** | Private view counts (no cookies, no third parties) and a log of sign-ins and changes |

The sidebar collapses to an icon rail with the button at its top.

**Hidden vs unpublished.** *Hidden* posts are live at their link but never listed. *Unpublished* posts are private. *Archived* posts stay reachable and appear on the Archive page only.

## How it stays safe

- The tables can be read and written only by the one admin account. The public site can call four database functions (`list_posts`, `get_post`, `unlock_post`, `track_view`) and read a settings table. Drafts, hidden posts and password hashes never leave the database.
- **Down really means down.** When the site is down or in maintenance, those functions return nothing, so the writing cannot be fetched even by calling the API by hand.
- Protected posts are checked in the database with bcrypt. The body is never sent until the password matches, and wrong guesses wait half a second.
- Post text is sanitised before it is shown (scripts and event handlers removed), and both sites ship a strict Content-Security-Policy in `_headers`.

## Good to know

- **Free-tier pause.** Supabase pauses free projects after about a week with no activity. Opening the dashboard now and then avoids it; if it happens, restore the project from the Supabase dashboard.
- **Link previews.** Pages are drawn in the browser, so social sites that do not run JavaScript will not see per-post titles and images. Search engines that do run it will.
- **Custom Supabase domain.** The CSP allows `*.supabase.co`. If you use your own domain for Supabase, add it to `connect-src` in both `_headers` files.

## Third-party

`marked` (MIT), `supabase-js` (MIT), Literata and Source Sans 3 (SIL Open Font License 1.1). See `THIRD-PARTY.md` in each folder.
