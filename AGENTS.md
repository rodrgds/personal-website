# AGENTS.md - Rodrigo Dias Personal Website (kraktoos)

## Project Overview

Astro 7 + Svelte 5 personal website with SSR. Production uses the standalone Node
adapter; Vercel builds select the Vercel adapter with `VERCEL=1`. Package manager:
**bun**. Node 22.

## Project state and memory

- The **Personal Website** Vikunja project is the authority for private/internal active work, priorities and execution state. Use Executor to create or update tasks. GitHub Issues remain only for public reports and contributor-facing discussion.
- Hindsight bank `rodrigo` is the authority for durable cross-agent site context, content decisions, constraints and project history. Recall with `project:personal-website` before substantial work. Retain only verified durable facts with `project:personal-website` and `source:<agent>`; never retain secrets, raw logs, temporary task state, completed-work reports or unverified claims.
- Code, content collections, build/deploy commands, public docs and hard engineering constraints remain versioned here. Do not create mutable context/ADR folders, local issue stores, task boards or agent-memory files.
- Verify recalled content facts against the source repositories and current collections before publishing them.

## Development Environment

```bash
direnv allow                    # Enter automatically when cd'ing into the repo
setup                           # Reconcile dependencies from the frozen lockfile
devenv shell -- setup           # Same operation without entering a shell
devenv shell -- verify          # Run a command directly from outside direnv
devenv shell -- dev-browser     # Stable local URL for browser QA
```

The shell pins official platform-specific Bun 1.3.3 builds, Node 22, and Typst.
Bun's cache, Typst packages, and `node_modules` persist beneath `/workspace`,
including across Hermes/NAS reboots. Frozen installs stage beside the checkout
and use Bun's `copyfile` backend because nested staging is detected as part of the
parent package and the Synology filesystem rejects the default hardlink path.
Dotenv files are parsed as data and are never sourced, evaluated, or copied into
the Nix store.

Available commands are `install`, `setup`, `dev`, `dev-browser`, `check`,
`typecheck`, `format`, `format-check`, `lint`, `build`, `verify`, and
`verify-full`. `install` and `setup` reconcile `node_modules` from `bun.lock`.
`dev-browser` serves `http://127.0.0.1:4321`, which is the stable
browser-automation endpoint. `verify` matches the universally available CI
gate; `verify-full` additionally runs the secret-dependent production build.

There is no test framework or code linter configured. Here, `lint` means the
existing formatting and Astro diagnostics; do not claim or add a fake test suite.
The production build prerenders CV PDFs and therefore genuinely requires Typst.

## Default task workflow

- Start with `git status --short --branch`. Existing changes are user-owned;
  inspect around them and stage only the files that belong to the current task.
- Turn multi-part requests into a short surface checklist before editing. Track
  each requested route, component, content source, and verification result; do
  not report the whole request complete because one slice passed.
- Reuse the closest existing component, content entry, and layout before adding
  a parallel pattern. This matters especially for CV cards, galleries, tabs,
  generated avatars, and collapsible sections.
- For implementation requests, continue through the relevant static checks and
  browser QA. Commit, push, release, or deploy only when requested, but finish
  the full requested delivery flow instead of pausing after a local step.

## UI direction and browser QA

The whole site is a terminal (Nov 2026): JetBrains Mono everywhere, Flexoki
base colours with ANSI-style accents, scanlines from `body::after`, a prompt
bar header (`rgo.pt:~/page$`) and a status-line footer. Build new surfaces
from `TermWindow.astro` (a title bar that reads like a command; `mark` sets
its square's colour) instead of cards. Headings read like Markdown (`#`,
`##`); the handwritten font is retired and its variables now resolve to
mono. Keep it useful: real content, real photos, no decoration for its own
sake. The reading width is `46rem`; header and footer span `--wide-width`.

Say each thing once. A window's or modal's title bar is its command, so the
body never repeats it as a `$ command` line; totals and sync notes go in a
status line at the bottom, if anywhere. Choices are terminal buttons (like
the CV filters), not native `<select>`s. Show only counts that are true: a
partial feed is not a total.

Orange (`--accent`) is the main colour: links, names, directories and the
headings' `#`. Colour secondary roles with the `--tc-*` tokens at the top of
`global.css`: running things and prompts green, dates yellow, tags purple,
paused yellow. Flexoki blue, cyan and magenta mark categories and window
squares, never the main text. Page changes use the view transition in `global.css` (old page
drops out, new one prints top to bottom); the header keeps its own group.

Start UI work with `dev-browser` and inspect the real rendered surface early.
Before calling a UI change complete, cover the relevant subset of:

- desktop and 390px/360px mobile widths;
- light and dark themes;
- visible alignment and control hitboxes, using computed bounding boxes when
  screenshots are ambiguous;
- document overflow plus any intended internal scroller;
- browser console errors and warnings;
- direct URL entry, reload, and hash deep links as well as SPA navigation;
- persistence and behavior after navigating away and back.

For multi-route requests, test every changed route rather than sampling one
shared component. When publishing UI work, repeat the important smoke checks on
`https://rgo.pt/` after the deploy succeeds.

## CV and content workflow

The collections in `src/content/` are canonical. The CV timeline, the entry
pages, the home's now.log and the generated CV files derive from those
collections, so content changes must be checked across their consumers. `/cv`
is the project portfolio; the former `/projects` page redirects there.

- Verify dates, technology claims, links, and project status from the actual
  source repo, its history, and its docs; do not infer them from memory or a
  repository name.
- Reuse real logos and a small set of representative screenshots from the
  source repo when available. Store CV media under `src/assets/cv/<slug>/` and
  use the existing `CVImage`, `CVImageGallery`, and entry visual components.
- Match the established project-entry structure. Do not publish a repository
  link for a private project.
- `/cv` is one view: `CVProcessTable.astro`, an `htop`-style process list
  with lifetime bars on one year axis (R running, S paused). Type filters
  live in the hash (`/cv#projects`). Hovering a row peeks its cover image.
- Every entry has its own prerendered page, `src/pages/cv/[slug].astro`
  (`/cv/<entry id>`, so ids must be unique across the CV collections), laid
  out as a man page: `OPENPOST(1)` header and footer lines, NAME, SYNOPSIS
  (the facts as `--flags`, optional ones in brackets), HIGHLIGHTS, the MDX as
  DESCRIPTION (its `##` headings become sections), KEYWORDS and SEE ALSO as
  `name(section)` references with peeks. Sections: projects 1, work 8,
  awards 6, study and courses 7. A sticky `less` prompt counts lines and
  takes `q` (back to /cv), `n` (older) and `p` (newer); `n` right after `g`
  stays the vim layer's.
- Rows and lists show compact names: `short` (role, institution, title or
  name) and `orgShort` (company or issuer) in frontmatter, and a one-line
  `tagline` for projects. Full names stay on entry pages and in peeks. Add
  them whenever a name would crowd a row.
- A peek's cover is the first image the entry's MDX renders
  (`src/cv/covers.ts`); a project's `cover` field overrides it.
- After CV/content edits, check `/cv`, the affected entry pages, the home's
  now.log and affected PDF endpoints. The timeline must not overflow the
  document on phones; rows stack name over bar.
- Preserve old shared URLs: `?view=icons` and `?view=list` show the timeline,
  old list hashes (`#project-openpost`) redirect to the entry page, and old
  section hashes (`#projects`) filter the timeline.

## Home page and the terminal layer

`/` is `src/components/features/home/TerminalHome.astro`: a short boot (once
per session: systemd-style life log, live uptime, an ASCII portrait drawn from
`src/assets/home/portrait.webp`, a typed login), then windows for whoami (with
the interests and their modals), `life.exe`, now.log, writing, thoughts,
whereami, uses, favorites and activity. Data comes from `getHomeData()` in
`src/lib/home/data.ts`, so it stays in sync with `/cv`, `/uses` and `/faves`.
The home is also the now page: `/now` redirects to `/#now`.

- The boot plays in a 3D scene (three.js, loaded with a dynamic import only
  when the boot runs). `src/lib/home/boot-room.ts` builds the scene: the PC is
  `src/assets/models/pc.glb` ("Personal Computer" by Juan Foo, CC-BY-4.0, see
  `CREDITS.md`; the attribution lives in the tty's `credits` command, kept out
  of the page so it does not crowd the UI),
  meshopt-compressed and placed so its screen lands at `SCREEN_*`. Its own
  keyboard and glass are hidden; the scene adds a keyboard with moving keys,
  mouse, a desk lamp and desk props, from primitives and canvas textures (the
  lint bans `THREE.Shape` by name). There is no room: walls, a window and
  shelves never looked detailed enough. A real wooden desk (`buildDesk()`,
  top, apron, four legs) stands on an endless plank floor (`buildFloor()`,
  at `FLOOR_Y` from `boot-person.ts`, where his shoes and the chair base
  rest) that runs off into fog of the `VOID` colour, with a dark dome behind
  it fogged the same way, so nothing ends in a horizon. Inception's laptop
  level uses the same desk and floor at its own scale. `src/lib/home/boot-stage.ts` runs the
  camera: walk up, power on, the real boot DOM on the monitor through
  CSS3DRenderer, keys pressing as the login is typed, then the monitor shows
  the real page (a same-origin iframe of the current URL at window size) and
  the camera flies in until it is exactly 1:1 while the room fades; the real
  page underneath then takes over without a seam. That iframe is why
  `X-Frame-Options` is `SAMEORIGIN`, not `DENY`. Without WebGL it falls back
  to the flat boot. Stage styles must be `:global(.boot-stage)` because JS
  builds it outside the component.
- The boot scene follows the compact 80s all-in-ones (rounded case, black
  tube surround, a wedge keyboard sloping up to the back, a one-button mouse)
  and is shot like a print: grain, a warm vignette and a polaroid border with
  a caption and an orange film date stamp (`.boot-film`, `.boot-polaroid` in
  `global.css`). The border opens out during the fly-in so the hand-off stays
  1:1.
- The boot and inception share Rodrigo’s seated model in
  `src/lib/home/boot-person.ts`. Keep body-reference photos private.
  Each arm is one skinned mesh (`person-arm.ts`: sleeve, forearm, twist
  bone, a palm and three-bone fingers) driven by two-bone IK, with finger IK
  landing each fingertip on its key. The resting pose and the key-to-finger
  map read the keyboard's world positions from constants at the top of
  `boot-person.ts`; update them if the keyboard moves. The nearer hand
  reaches for the power button and the hands touch-type the login. Motion is
  time-based (`ease(rate, dt)`), not per-frame, so slow GPUs look the same.
  His materials are transparent from the start: switching `transparent`
  mid-flight rebuilds shaders and stalls the fly-in. No camera move onto the
  keyboard.
- `life.exe` rotates the curated `LIFE` photos in `data.ts`. Use travel and
  public events. The Porto drawing belongs in the location peek. Frames change
  with `pixelSlide()`.
- Personal photos live in `src/assets/home/` (reel photos in `life/`). Use
  metadata-free renditions. Keep private gatherings, family photos and body
  references out of the reel.
- `src/lib/terminal/` runs on every page from `BaseHead`: vim keys (`j k d u
  gg G H L`, `g` + `h c n u f e s`, `f`/`F` link hints), the tty (`:` or `` ` ``,
  data from the prerendered `/api/tty.json`), and peek cards. Mark anything
  with its own keyboard handling `data-no-vim`.
- Peek: `data-peek-image`, `data-peek-scene="porto"` or `data-peek-title` (with
  `-meta`, `-body`, `-rating`) show a hover window. Use it for screenshots and
  favourites instead of inline galleries. Abbreviations (`fde`, `eng.`) use
  `data-peek-tip="what it stands for"` on an `<abbr>`: a one-line tooltip,
  nothing more. External links in text preview through the same window
  (`link-peek.ts` fetches `/api/link-preview` and calls `peekAt()`); there is
  no separate preview card.
- Interface sounds go through `src/lib/sound.ts` (cuelume, `mech` theme,
  volume 0.6, on by default, the footer toggle mutes). A sound answers
  something the visitor did and names its kind: `select` for a choice in a
  group (mark the button `data-cuelume-select`), `toggle` for a state,
  `open`/`close` for dialogs, the tty, hints and disclosures, `navigate` for
  page changes and stepping (with `direction`), `type` for keys, `success`
  for copies, `error` for failures and `ready` for a finished `ask`. Never
  on hover, scrolling, vim motions, timers or anything that streams.
- While data loads, keep its window's shape: the activity graph shows a
  blank year and /activity keeps its last height, both with a progress
  cursor. Rows that should still preview their external link carry
  `data-link-peek` (the home's uses tree).
- Links in text hover like a terminal selection: the link colour becomes the
  background (`global.css`). No animated underlines or blur fades. Rows,
  cards and controls opt out with `data-no-link-fx` and style their own.
- The `new` badge is automatic: `<NewBadge date={...} />` or `isRecent()` from
  `src/lib/recent.ts`. Never hand-write "new".
- Project `status: "paused"` keeps a project on the CV but out of "now".
- `src/data/socials.ts` is the one list of accounts (label, handle,
  `primary`). Primary accounts show in the header and whoami; the rest are
  only in the tty (`socials`). There is no "+N more" menu.
- The home's `whereami` window (`src/components/features/now/NowWhere.astro`)
  is an ASCII globe drawn on a canvas (`src/lib/now/ascii-globe.ts`, ideas
  after asciicn's ascii-globe, our own code): real land from a 1-degree mask
  (`src/lib/now/land.ts`, generated by `tools/world-land.py` from Natural
  Earth), drawn like asciicn's: one ink, the ` .:-=+*#%@` ramp, a faint
  stippled sea and the graticule as tone, so the characters carry the
  shading. Pins for Porto and the visitor (one lookup in
  `src/lib/now/where.ts`) are the only labels; no caption under it. Drag to
  turn. It only animates while on screen,
  holds still under reduced motion and stops on unmount; keep any canvas or
  WebGL loop that way.
- WebGL teardown (boot, inception): dispose geometries, materials, textures
  (`disposeScene()` in `boot-room.ts`) and render targets, call
  `renderer.dispose()` then `forceContextLoss()`, remove every DOM listener
  that closes over the scene, and detach the canvas. three.js shares some
  textures across renderers, and their GPU copies keep the old canvas and its
  DOM alive; a listener left in that DOM kept a whole scene per `inception`
  run in memory.
- Activity metrics come from Directus (`activity_days`), filled by
  `bun run personal-data sync --source <name>` on the VPS (systemd timers in
  `~/.config/home/modules/hosting/sites/personal.nix`; Directus only answers
  the API from the VPS). `tv` is WeTrakr: every film and episode on the
  public profile by its latest play date, needing only the app key
  `WETRAKR_CLIENT_ID` (days with more than 24 plays are backfills and are
  dropped; the total is the profile's own count). `posts` is OpenPost: one
  per published publication by `actual_run_at`, read with
  `OPENPOST_API_TOKEN` (a never-expiring CLI token). The movies modal reads
  recent films and episodes live through the `getWatchHistory` action.
- now.log lists everything running (current work, study and active projects,
  newest first) with its type, short name, context and age; projects peek
  their cover. It is not a list of every project: that is `/cv`. `/edu` is
  not a CV entry and joins now.log through `EXTRA_NOW` in `data.ts`.
- The tty's `ask` command posts to `/api/ask`, which answers about Rodrigo from
  `src/lib/ask/context.ts` (built from the collections) via OpenRouter
  `openrouter/free`. The key is `OPENROUTER_API_KEY`, read at runtime through
  `astro:env/server` so it is never inlined into a build; production gets it
  from the sops secret `website_openrouter_api_key` in
  `~/.config/home/modules/hosting/sites/personal.nix`. Keep the per-IP limits.
  Answers stream in as light Markdown (bold, inline code, lists, fenced code)
  and render through `src/lib/terminal/markdown.ts`, which builds DOM nodes
  (never HTML strings) and colours code with a small regex highlighter; piped
  answers stay plain text.
- The tty is a small bash. `src/lib/terminal/tty.ts` is only the view; the
  shell lives in `src/lib/terminal/shell/` (lexer with quotes and `|`, `;`,
  `&&`, `||`; a read-only virtual filesystem built from `/api/tty.json` with
  `~/writing/*.md`, `~/projects`, `~/socials`, `~/faves` and `/usr/bin`; the
  interpreter; the programs). Any line whose first word is not a program goes
  to `ask` as a question (a lone near-miss like `lss` gets "did you mean");
  `ask` also takes piped input. Register new programs in `shell/registry.ts`.
- `inception` in the tty (`src/lib/home/inception.ts`) pulls this page back
  onto the desk's monitor, then zooms out forever with the page staying at
  the centre. Levels alternate desk and laptop (`inception-laptop.ts`, a
  16:10 display filling its lid); level 1 is the desk whose monitor shows the
  page, live in the iframe during the pull-back, then a snapshot of the page
  (`modern-screenshot`, taken as inception starts). Each frame renders the
  three levels under the one on screen into textures, deepest first, each
  from its own shot (desk shots at 16:10, whose centre 4:3 crop is the
  photo). The camera loops from "picture fills the photo" to the shot, one
  level out per loop at one zoom speed. Never swap what a screen shows while
  it is visible: that read as the site vanishing. Keep `NoToneMapping` there:
  three.js tone-maps and fogs differently for the window and for textures,
  which showed as a darker seam every loop.
  The photo is held at 4:3 (the glass's shape) with `camera.setViewOffset`
  inside the polaroid border, which is what makes the loop seamless. Esc or
  the top-left `kick` button ends it; it refuses under reduced motion.
- Tty completion lives in `src/lib/terminal/complete.ts`; add argument options
  there when you add a command.
- ASCII effects (ideas after asciicn.sumak.dev, our own code) live in
  `src/lib/terminal/ascii.ts` and are opt-in by attribute through
  `effects.ts`: `.ascii-spinner` for loading states, `data-scramble` (decode on
  view) or `data-scramble-hover`, and `img[data-ascii-reveal]` (photo resolves
  out of glyphs). Use `blockBar()` for progress and shade glyphs (`░▒▓█`) for
  heatmaps. Every effect must settle instantly under reduced motion.
- thoughts.log shows the latest five Bluesky posts. Rodrigo writes once and
  OpenPost crossposts everywhere; Bluesky is just the easiest feed to read,
  so the window links out to X, LinkedIn and Bluesky instead of shuffling or
  counting. Pictures show as a tiny thumbnail (and `×N`) and peek on hover
  with `data-peek-images`.
- `/edu` is a standalone app (`public/edu/`) restyled with the same mono face
  and CRT palette; keep its variables in step with `global.css`.
- Structured links (rows, cards) carry `data-no-link-fx` so the global link
  hover and link previews leave them alone.
- Check the boot, `life.exe`, peeks, `f` hints and the tty in both themes, at
  390px, with reduced motion and after SPA navigation.

## Slide decks (`/slides`)

Decks are `src/content/slides/<slug>.mdx`; long decks import one MDX file per
part from `src/content/slides/<slug>/`. Author with the components exported by
`src/components/features/slides/index.ts`. The canvas, ink, speaker view
(`?speaker`) and script view (`?script`) live in `.../slides/runtime/`.

- Keep slides plain and typographic: a title and large text. No kicker labels
  above titles, footers, boxed or tinted cards, left borders or pills.
- Type must read on a phone: keep slide text at the CSS sizes and cut words
  instead of shrinking. Titles fit on one line. Prefer `<Flow>`, lists and
  `<MemoryStack>` over Mermaid flowcharts; keep `<Diagram>` for short sequence
  diagrams.
- After editing slides, check every slide at its last step for overflow,
  clipped code and wrapped titles, then look at rendered screenshots.
- `<Notes>` holds the full spoken script. Mark each click with `**[→]**`; the
  count must equal the slide's steps, because the speaker view highlights
  the next marker.
- Drawings stay in the viewer's browser (`localStorage`); nothing is saved
  server-side.

## Push-to-deploy maintenance

Pushes to `main` are deployed by `.github/workflows/ci.yml`. The workflow path-filters application and CI changes, warms/restores the Nix/Devenv environment, caches Bun dependencies, runs the portable formatting/typecheck gate, and then signs a request to `https://webhooks.rgo.pt/hooks/deploy-personal-website`. Production is a VPS source build rather than a Docker image: the NixOS deploy service fetches the verified revision, runs the secret-dependent Astro build with declarative Typst, atomically updates the served site, and verifies the public URL. The server-side source of truth is `~/.config/home/modules/hosting/sites/personal.nix` and `~/.config/home/modules/hosting/deployments/default.nix`.

When adding build inputs, update the workflow `app` path filter and cache keys so changes cannot skip verification or reuse stale dependencies. Preserve the shared Nix-store, Devenv/Cachix, `.devenv` evaluation, Bun download/`node_modules`, and Typst package caches; never put production secrets in GitHub caches or the Nix store. Validate workflow edits with `actionlint`, and treat the deploy as complete only after the workflow hook succeeds and `https://rgo.pt/` serves the new revision.

Dependency notes: CI and the VPS build run the devenv Node 22, which lags
nixpkgs (22.22 in Nov 2026), and Astro refuses to start on a Node below its
engines range. Check `engines.node` of astro and its integrations before an
update (Astro 7.4.1, MDX 8.1.0 and the Svelte integration 9.1.0 are the last
on >=22.22.0). TypeScript stays on 6.x until `@astrojs/check` supports 7.
Markdown plugins go through `processor: unified({...})` from
`@astrojs/markdown-remark` (a direct dependency; MDX 8 needs it at ^7.3),
not the deprecated `markdown.rehypePlugins`. Read new server secrets at
runtime through `astro:env/server` (declared in `astro.config.mjs`), not
`import.meta.env`, which inlines them into the build.

If islands stop reacting in dev (state changes but the UI does not), Vite
probably re-optimised deps mid-session and loaded two Svelte copies: stop the
dev server, delete `node_modules/.vite` and restart. Add client deps reached
only through dynamic imports to `vite.optimizeDeps.include` in
`astro.config.mjs`.

The dev watcher must not follow `.devenv/`: it links into the Nix store
(170k+ files) and crawling it ran the dev server out of heap within minutes.
`vite.server.watch.ignored` in `astro.config.mjs` excludes it with build
output and tool caches; keep new symlinked tool folders out the same way.

The image-optimization tail of local and VPS builds can be quiet for several
minutes. If the process is alive and has no error, keep it attached rather than
restarting it or treating silence as a failure.

## Formatting and linting

- **oxlint** is the linter (`bun run lint`). It loads the vendored generic
  anti-slop plugin from `tools/oxlint/anti-slop/`; its rules reject untyped
  boundaries, unsafe dictionaries, and unjustified type assertions. Justify a
  deliberate assertion with a `SAFETY:` comment directly above it instead of
  suppressing rules.
- **oxfmt** formats JS/TS/JSON (config in `.oxfmtrc.json`).
- **Prettier** remains only for `.astro` files, which oxfmt cannot parse
  (plugin: `prettier-plugin-astro`, config in `.prettierrc`). `.svelte` and
  `.mdx` files are not formatted by any tool; keep their style consistent by
  hand.

```bash
bun run format        # oxfmt --write + prettier --write on .astro
verify                # oxlint + format-check + astro check
```

## Writing and product copy

- Avoid stock metaphors, similes, idioms, and figures of speech.
- Prefer short, familiar words when they keep the exact meaning. Cut every word
  or section that adds no meaning.
- Prefer active voice when it makes the actor and action clearer.
- Replace jargon, foreign phrases, and needless scientific or academic terms
  with everyday English.
- Break any of these rules when accuracy, natural phrasing, tone, legal meaning,
  accessibility, or readability requires it.
- Apply this standard in context. It is not a blind word-replacement rule. Keep
  code, commands, API fields, proper nouns, citations, quotes, legal wording, and
  exact technical terms intact unless they are themselves copy being improved.
- Finish every copy change with a line-by-line prose review.

## Architecture

```
src/
  actions/                  # Service-specific Astro actions and shared cache
  assets/cv/                # Canonical CV/project screenshots and media
  assets/home/              # Personal photos for the home (from Immich)
  components/
    common/                 # Global head, header, footer, and shared primitives
    features/cv/            # CV timeline, list cards, navigation, and galleries
    features/favorites/     # Favorites page and interactions
    features/home/          # Terminal home and its widgets
    features/now/           # the whereami globe window used on the home
    tools/csfloat-monitor/  # CSFloat tool (has its own sub-structure)
    ui/                     # Reusable form and control elements
  content/                  # Astro content collections
  cv/                       # Normalization, timeline layout, Typst/PDF generation
  layouts/                  # Shared document layouts
  lib/directus.ts           # Directus SDK client
  lib/home/                 # Home data loader, life.exe, Porto map renderer
  lib/terminal/             # Vim keys, link hints, tty and peek (every page)
  pages/                    # Astro pages (.astro, .mdx) + API routes
  config.ts                 # Site-level constants (SITE_TITLE, SITE_DESCRIPTION)
  env.d.ts                  # TypeScript env declarations
```

## Code Style Guidelines

### TypeScript

- Strict mode enabled (`astro/tsconfigs/strict` + `strictNullChecks`)
- `allowJs: true` for mixed JS/TS files
- Use `interface` for object shapes, `type` for unions/aliases
- Prefer explicit return types on exported functions

### Svelte Components

**Svelte 5 runes** are used in newer components (`$state`, `$effect`):

```ts
let routines = $state<Routine[]>([]);
let loading = $state(true);
```

**Older components** still use Svelte 4 patterns (`export let`, `$:`, `on:click`):

```ts
export let variant: "primary" | "secondary" = "primary";
export { clazz as class };
```

When modifying existing components, **follow their existing pattern**. For new components, prefer Svelte 5 runes.

### Imports

- Use relative imports within `src/` (no path aliases configured)
- Group imports: external libraries first, then internal modules, then Svelte components
- Import types with `import type` when only used for type annotations

### Naming Conventions

- Components: PascalCase (`Button.svelte`, `SearchableSelect.svelte`)
- Files: kebab-case (`hevy-routines.svelte`, `lastfm-scrobbles.svelte`)
- Directories: kebab-case (`csfloat-monitor/`, `features/home/`)
- Variables/functions: camelCase
- Interfaces: PascalCase
- Constants: UPPER_SNAKE_CASE (e.g., `HARD_MIN_INTERVAL`, `SITE_TITLE`)

### Error Handling

- Server actions use Astro's `ActionError` with `code` and `message`
- Always check `response.ok` after fetch calls and throw `ActionError`
- Catch and re-throw with descriptive messages; preserve `instanceof Error` info
- Client components handle errors via reactive `$state` (e.g., `let error = $state<string | null>(null)`)

### CSS

- Use `<style>` blocks scoped to Svelte components
- CSS variables for theming: `--link-color`, `--border-color`, `--text-color`, `--heading-color`, `--background-color`, `--gray-color`
- Dark mode via `@media (prefers-color-scheme: dark)` and `:global(.dark)` class
- Responsive breakpoints: 600px, 768px, 1024px

### Astro Server Actions

- Define actions in `src/actions/index.ts` using `defineAction` with Zod validation
- Use in-memory `SimpleCache` with appropriate TTL per data source
- Access env vars via `import.meta.env.*`
- Actions are called from Svelte components via `import { actions } from "astro:actions"`

### MCP Tools (Svelte)

When writing Svelte code:

1. Use `list-sections` FIRST to find relevant docs
2. Use `get-documentation` to fetch ALL relevant sections
3. Use `svelte-autofixer` on ALL Svelte code before sending to user — keep calling until clean
4. Offer a `playground-link` after completing standalone components (never if writing to project files)

If those MCP helpers are not exposed in the current session, say so once and
continue from the repository's established Svelte pattern plus `verify`; do not
spend the turn repeatedly searching for unavailable helper names.

### View Transitions (SPA Navigation)

The site uses Astro's `<ClientRouter />` for View Transitions (SPA-like navigation). This means:

- **Never capture DOM element references at script load time** — the element may be swapped out during a View Transition, leaving you with a stale reference to a detached node. Always re-query (`document.getElementById`, `querySelector`, etc.) inside the event handler or function that uses it.
- **`window`/`document` event listeners persist across navigations** — this is fine for listeners, but any closures that captured DOM elements will be broken after a transition swaps content.
- **`<script>` blocks in Astro components only run once** on initial page load. They do NOT re-execute when navigating via View Transitions.
- **Svelte components hydrate fresh on each navigation** — client-side Svelte components (`client:load`, `client:visible`, etc.) are re-created when navigating to a page that includes them, so their internal state is fine. The issue is only with `<script>` blocks in `.astro` files that capture DOM references.

**Rule of thumb:** If a `<script>` in an `.astro` component needs to interact with a DOM element, query it inside the function/handler that uses it, not at the top level of the script.

### Global scripts and production hydration

`src/components/common/BaseHead.astro` owns global theme, sound
and navigation lifecycle behavior. Keep global DOM transforms narrow: exclude
structured widgets instead of replacing their contents, and test them after
both initial load and `astro:after-swap`.

Do not place a `client:*` Astro/Svelte island inside content passed to another
hydrated island such as an expandable CV card. In production, Astro can emit
the nested island bootstrap inside an inert
`<template data-astro-template="...">`, breaking all hydration on a direct
load even when dev navigation works. Prefer server-rendered child markup with a
page-level delegated handler, or move the interactive island outside the
parent's slotted template. Reproduce hydration bugs against a production build
with direct `/cv` and `/cv#...` loads.
