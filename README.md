# Frameboard Studio 2.0

A storyboard web app for creative direction work, with **shared boards**: anyone
with the link can view and edit the same projects. Plain static site
(`index.html`, `styles.css`, `app.js`, `config.js`), no build step, hosted on
GitHub Pages. Shared storage is [Supabase](https://supabase.com) (free tier).

> **No login, no security, on purpose.** Anyone who has the link can edit or
> delete boards. Deleted projects can be restored from **Recently deleted**.

## Features

- Home dashboard with multiple projects
- Shots with reference image, type, angle, movement, duration, location, time, action, notes
- Horizontal 16:9 or vertical 9:16 boards
- Grid, list and shot-list table views; reorder, duplicate, edit, delete
- Brainstorm notes editor with headers, bold, italic, underline, highlight and images
- Print-ready board (client / internal profiles)
- Exports: full project JSON, storyboard JSON, shot list CSV, brainstorm HTML
  (exports embed the images, so they work offline)
- Shared mode: changes sync between browsers every few seconds; images go to Supabase Storage
- Recently deleted + server-side version history
- Local-only mode (IndexedDB) if Supabase isn't configured or can't be reached

## Setup

1. **Supabase**: create a free project. Open **SQL Editor**, paste all of
   `supabase-setup.sql`, and click **Run**. Running it again is safe.
2. **Key**: in Supabase go to **Project Settings → API Keys** and copy the
   **publishable** key (`sb_publishable_…`). Put it, with your project URL, in
   `config.js`. Never use the secret / `service_role` key: `config.js` is public.
3. **GitHub Pages**: repo **Settings → Pages → Build and deployment → Deploy from a
   branch → `main` / `(root)`**. The site appears at
   `https://<user>.github.io/<repo>/` after a minute or two.

With an empty `supabaseKey` the app runs in local-only mode (saved in your browser).

## Moving boards from the old version

If you used the old local-only Frameboard at the same `github.io` address in this
browser, 2.0 offers to copy those boards to the shared board the first time it
loads. Otherwise: **Export all** on the old site, then **Import** on the new one.

## How sync works

- Each project is one row (`projects.record`, JSON). Saves are debounced and
  upserted; the server bumps `rev` on every write.
- Each browser polls for changed `rev`s every 4 seconds and pulls updates.
- Conflicts: **last write wins** per project. If two people edit the same project
  at the same moment, one person's latest change can be overwritten.
- `project_history` keeps up to 25 older versions per project (at most one every
  10 minutes). It's only reachable from the Supabase dashboard, for recovery.
