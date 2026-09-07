# Deploying Blue Ocean to Vercel

The `web/` folder is a Vite wrapper that boots `blueocean-core.jsx` as a normal website. It has
been built and verified — `npm run build` succeeds and produces a working `dist/`.

## What was wrong

Two things, only the first of which was known:

1. **`web/` was never committed to `main`.** The `package.json` at your repo root is your test
   tooling (esbuild/Playwright), not a Vite app. Vercel had nothing to build.
2. **The core file uses Tailwind.** ~1,100 `className` attributes across `blueocean-core.jsx`.
   The artifact platform supplies Tailwind for free; a plain Vite build does not. Even if problem
   1 had been fixed, the site would have deployed as an unstyled wall of text. This wrapper
   includes Tailwind v4 with an explicit `@source` pointing at the core file.

## Install

Unzip so that `web/` sits **next to** `blueocean-core.jsx` at the repo root:

```
Blue-Ocean/
├── blueocean-core.jsx
├── package.json          <- your existing test tooling, leave it
└── web/                  <- this
    ├── index.html
    ├── package.json
    ├── package-lock.json
    ├── vite.config.js
    ├── .gitignore
    └── src/
        ├── main.jsx
        ├── install-storage.js
        ├── storage-shim.js
        └── index.css
```

Then:

```bash
git add web/
git commit -m "Add Vite web wrapper for Vercel deployment"
git push origin main
```

Confirm on github.com that `web/` now appears on `main` before touching Vercel. If it doesn't,
check `.gitignore` at the repo root for a line that swallows it.

## Test locally first (optional, ~1 minute)

```bash
cd web
npm install
npm run dev
```

Open the printed localhost URL. If the game renders and looks right locally, Vercel will work.
If it renders but looks unstyled, Tailwind isn't finding the core file — tell me.

## Vercel settings

Import the repo, then set:

| Setting | Value |
|---|---|
| Root Directory | `web` |
| Framework Preset | Vite |
| Build Command | `npm run build` (default) |
| Output Directory | `dist` (default) |
| Install Command | `npm install` (default) |
| **Include source files outside of the Root Directory** | **ON** |

That last one is not optional. `blueocean-core.jsx` lives one level above `web/`, and Vercel
excludes everything outside the Root Directory unless you enable it. Without it the build fails
with an unresolved import of `@core`.

## How saves work here

The artifact platform provides `window.storage`. A browser does not, so `src/storage-shim.js`
supplies the same async contract backed by `localStorage`.

Consequences worth knowing before your friend plays:

- Progress is **per-browser**. Their runs live on their machine; you will never see them.
- Clearing browser data wipes their meta-progression.
- Private/incognito windows may block storage. The shim falls back to in-memory so the game still
  boots, and logs a console warning — but progress won't survive a refresh.
- `shared: true` storage is namespaced but not actually shared. There's no backend. Anything
  built on shared storage later (a leaderboard) will need one.

## If the build fails

Send me the Vercel log. The two likely errors:

- **`Failed to resolve import "@core"`** — the "include source files outside the Root Directory"
  setting didn't take.
- **`Cannot find module` on a package** — a dependency the core needs that isn't in
  `web/package.json`. The core imports only React, so this shouldn't happen, but a future change
  could introduce one.
