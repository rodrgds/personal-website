# AGENTS.md - Rodrigo Dias Personal Website (kraktoos)

## Project Overview

Astro 6 + Svelte 5 personal website with SSR (Vercel adapter). Package manager: **bun**. Node 22.

## Development Environment

```bash
direnv allow                    # Enter automatically when cd'ing into the repo
setup                           # Reconcile dependencies from the frozen lockfile
devenv shell -- setup           # Same operation without entering a shell
devenv shell -- verify          # Run a command directly from outside direnv
```

The shell pins official Bun 1.3.3 `linux-x64-baseline`, Node 22, and Typst. Bun's
cache, Typst packages, and `node_modules` persist beneath `/workspace`, including
across Hermes/NAS reboots. Frozen installs stage beside the checkout and use Bun's `copyfile` backend because
nested staging is detected as part of the parent package and the Synology filesystem
rejects the default hardlink path. Dotenv files are parsed as data and are never sourced,
evaluated, or copied into the Nix store.

Available commands are `install`, `setup`, `dev`, `check`, `typecheck`,
`format-check`, `lint`, `build`, `verify`, and `verify-full`. `install` and
`setup` reconcile `node_modules` from `bun.lock`. `verify` matches the universally
available CI gate; `verify-full` additionally runs the secret-dependent production
build.

There is no test framework or code linter configured. Here, `lint` means the
existing formatting and Astro diagnostics; do not claim or add a fake test suite.
The production build prerenders CV PDFs and therefore genuinely requires Typst.

## Push-to-deploy maintenance

Pushes to `main` are deployed by `.github/workflows/ci.yml`. The workflow path-filters application and CI changes, warms/restores the Nix/Devenv environment, caches Bun dependencies, runs the portable formatting/typecheck gate, and then signs a request to `https://webhooks.rgo.pt/hooks/deploy-personal-website`. Production is a VPS source build rather than a Docker image: the NixOS deploy service fetches the verified revision, runs the secret-dependent Astro build with declarative Typst, atomically updates the served site, and verifies the public URL. The server-side source of truth is `~/.config/home/modules/hosting/sites/personal.nix` and `~/.config/home/modules/hosting/deployments/default.nix`.

When adding build inputs, update the workflow `app` path filter and cache keys so changes cannot skip verification or reuse stale dependencies. Preserve the shared Nix-store, Devenv/Cachix, `.devenv` evaluation, Bun download/`node_modules`, and Typst package caches; never put production secrets in GitHub caches or the Nix store. Validate workflow edits with `actionlint`, and treat the deploy as complete only after the workflow hook succeeds and `https://rgo.pt/` serves the new revision.

## Formatting

```bash
bunx prettier --write .
format-check
```

Prettier config is in `package.json`. `.prettierignore` excludes `**/*.mdx`.
Use `verify` for the normal local/CI gate. Run `verify-full` only when build
environment variables and Typst's package cache are available.

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
  actions/index.ts          # Astro server actions (API handlers with caching)
  components/
    common/                 # Reusable UI (Button, Checkbox, Tabs)
    ui/                     # Form elements (Input, Label, Select, SearchableSelect, Modal)
    features/home/          # Feature-specific Svelte components
    favorites-page.svelte   # Favorites page component
    tools/csfloat-monitor/  # CSFloat tool (has its own sub-structure)
  content/                  # Astro content collections
  data/                     # Static JSON data files
  lib/directus.ts           # Directus SDK client
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

### View Transitions (SPA Navigation)

The site uses Astro's `<ClientRouter />` for View Transitions (SPA-like navigation). This means:

- **Never capture DOM element references at script load time** — the element may be swapped out during a View Transition, leaving you with a stale reference to a detached node. Always re-query (`document.getElementById`, `querySelector`, etc.) inside the event handler or function that uses it.
- **`window`/`document` event listeners persist across navigations** — this is fine for listeners, but any closures that captured DOM elements will be broken after a transition swaps content.
- **`<script>` blocks in Astro components only run once** on initial page load. They do NOT re-execute when navigating via View Transitions.
- **Svelte components hydrate fresh on each navigation** — client-side Svelte components (`client:load`, `client:visible`, etc.) are re-created when navigating to a page that includes them, so their internal state is fine. The issue is only with `<script>` blocks in `.astro` files that capture DOM references.

**Rule of thumb:** If a `<script>` in an `.astro` component needs to interact with a DOM element, query it inside the function/handler that uses it, not at the top level of the script.
