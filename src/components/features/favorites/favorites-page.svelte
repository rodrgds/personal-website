<script lang="ts">
  import { onMount } from "svelte";
  import { episodeLines } from "../../../lib/favorites/episodes";
  import { cue } from "../../../lib/sound";

  import type {
    FavoriteItem,
    FavoriteSection,
  } from "../../../lib/favorites/types";

  interface Props {
    sections: FavoriteSection[];
  }

  type MatchMode = "all" | "any";
  type SortKey = "rating" | "title" | "year";

  interface Segment {
    text: string;
    kind: "cmd" | "flag" | "string" | "pipe";
  }

  interface SortOption {
    key: SortKey;
    label: string;
  }

  const SORTS: SortOption[] = [
    { key: "rating", label: "rating" },
    { key: "title", label: "a-z" },
    { key: "year", label: "year" },
  ];

  let { sections }: Props = $props();

  // Plain Sets swapped for new ones on every change: reliable reactivity in
  // dev and production alike (SvelteSet stopped updating in Vite dev).
  let activeTags = $state.raw(new Set<string>());
  let collapsed = $state.raw(new Set<string>());

  function toggled(set: Set<string>, value: string): Set<string> {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    return next;
  }
  let openItem = $state<string | null>(null);
  let match = $state<MatchMode>("all");
  let sortKey = $state<SortKey>("rating");
  let query = $state("");
  let touch = $state(false);
  let tagsOpen = $state(false);

  const allTags = $derived(
    [
      ...new Set(
        sections.flatMap((section) =>
          section.items.flatMap((item) => item.categories),
        ),
      ),
    ].sort((a, b) => a.localeCompare(b)),
  );

  const totalCount = $derived(
    sections.reduce((sum, section) => sum + section.items.length, 0),
  );

  const visible = $derived(
    sections
      .map((section) => ({
        ...section,
        total: section.items.length,
        items: section.items.filter(matches).sort(compare),
      }))
      .filter((section) => section.items.length > 0),
  );

  const shownCount = $derived(
    visible.reduce((sum, section) => sum + section.items.length, 0),
  );

  const filtered = $derived(activeTags.size > 0 || query.trim() !== "");

  const command = $derived.by((): Segment[] => {
    const segments: Segment[] = [];
    const tags = [...activeTags];
    const needle = query.trim();
    const stages: Segment[][] = [];
    if (tags.length > 0 && match === "any") {
      stages.push([
        { text: "grep", kind: "cmd" },
        { text: "-E", kind: "flag" },
        { text: `"${tags.join("|")}"`, kind: "string" },
      ]);
    } else {
      for (const tag of tags) {
        stages.push([
          { text: "grep", kind: "cmd" },
          { text: "-w", kind: "flag" },
          { text: `"${tag}"`, kind: "string" },
        ]);
      }
    }
    if (needle) {
      stages.push([
        { text: "grep", kind: "cmd" },
        { text: "-i", kind: "flag" },
        { text: `"${needle}"`, kind: "string" },
      ]);
    }
    const first = stages[0];
    if (first) first.push({ text: "faves", kind: "string" });
    else stages.unshift([{ text: "cat", kind: "cmd" }, { text: "faves", kind: "string" }]);
    stages.push([
      { text: "sort", kind: "cmd" },
      { text: "-k", kind: "flag" },
      { text: sortKey === "title" ? "title" : sortKey, kind: "string" },
    ]);
    stages.forEach((stage, index) => {
      if (index > 0) segments.push({ text: "|", kind: "pipe" });
      segments.push(...stage);
    });
    return segments;
  });

  function matches(item: FavoriteItem): boolean {
    const tags = [...activeTags];
    if (tags.length > 0) {
      const ok =
        match === "all"
          ? tags.every((tag) => item.categories.includes(tag))
          : tags.some((tag) => item.categories.includes(tag));
      if (!ok) return false;
    }
    const needle = query.trim().toLowerCase();
    if (!needle) return true;
    return [item.title, item.author, item.year, item.comment, ...item.categories]
      .filter((part): part is string => Boolean(part))
      .some((part) => part.toLowerCase().includes(needle));
  }

  function compare(a: FavoriteItem, b: FavoriteItem): number {
    if (sortKey === "title") return a.title.localeCompare(b.title);
    if (sortKey === "year") {
      const diff = Number(b.year ?? 0) - Number(a.year ?? 0);
      if (diff !== 0) return diff;
    } else {
      const diff = b.rating - a.rating;
      if (diff !== 0) return diff;
    }
    return a.title.localeCompare(b.title);
  }

  function syncUrl(): void {
    const url = new URL(window.location.href);
    if (activeTags.size > 0) {
      url.searchParams.set("tags", [...activeTags].join(","));
    } else {
      url.searchParams.delete("tags");
    }
    window.history.replaceState(window.history.state, "", url);
  }

  function toggleTag(tag: string): void {
    cue("toggle", { direction: activeTags.has(tag) ? "back" : "forward" });
    activeTags = toggled(activeTags, tag);
    openItem = null;
    syncUrl();
  }

  function clearAll(): void {
    cue("close", { emphasis: "subtle" });
    activeTags = new Set();
    query = "";
    openItem = null;
    syncUrl();
  }

  function toggleSection(id: string): void {
    cue(collapsed.has(id) ? "open" : "close", { emphasis: "subtle" });
    collapsed = toggled(collapsed, id);
  }

  function toggleOpen(id: string): void {
    cue(openItem === id ? "close" : "open", { emphasis: "subtle" });
    openItem = openItem === id ? null : id;
  }

  function openRandom(): void {
    const linked = sections
      .flatMap((section) => section.items)
      .filter((item) => item.url);
    const pick = linked[Math.floor(Math.random() * linked.length)];
    if (!pick?.url) return;
    cue("tap");
    window.open(pick.url, "_blank", "noopener,noreferrer");
  }

  function hasDetail(item: FavoriteItem): boolean {
    return Boolean(item.comment) || (item.favoriteEpisodes?.length ?? 0) > 0;
  }

  function meta(item: FavoriteItem): string {
    return [item.author, item.year].filter(Boolean).join(", ");
  }

  function host(url: string): string {
    try {
      return new URL(url).hostname.replace(/^www\./, "");
    } catch {
      return url;
    }
  }

  /** A site's favicon through DuckDuckGo's icon service (no tracking cookies). */
  function siteIcon(url: string | undefined): string | undefined {
    if (!url) return undefined;
    try {
      return `https://icons.duckduckgo.com/ip3/${new URL(url).hostname}.ico`;
    } catch {
      return undefined;
    }
  }

  function thumb(item: FavoriteItem): string | undefined {
    return item.image ?? siteIcon(item.url);
  }

  function hideBroken(event: Event): void {
    if (event.currentTarget instanceof HTMLElement) {
      event.currentTarget.style.visibility = "hidden";
    }
  }

  onMount(() => {
    const tags = new URLSearchParams(window.location.search).get("tags");
    if (tags) {
      activeTags = new Set(tags.split(",").filter(Boolean));
    }
    const hover = window.matchMedia("(hover: none)");
    const sync = (): void => {
      touch = hover.matches;
    };
    sync();
    hover.addEventListener("change", sync);
    return () => hover.removeEventListener("change", sync);
  });
</script>

{#snippet label(item: FavoriteItem)}
  <span class="rating" role="img" aria-label={`${item.rating} out of 5`}>
    <span class="rating-on">{"★".repeat(item.rating)}</span><span
      class="rating-off">{"☆".repeat(5 - item.rating)}</span
    >
  </span>
  <span class="thumb">
    {#if thumb(item)}
      <img
        src={thumb(item)}
        alt=""
        width="16"
        height="16"
        loading="lazy"
        decoding="async"
        referrerpolicy="no-referrer"
        onerror={hideBroken}
      />
    {/if}
  </span>
  <span class="name">
    <span class="title">{item.title}</span>
    {#if meta(item)}<span class="meta">{meta(item)}</span>{/if}
  </span>
{/snippet}

<div class="favorites-container">
  <header class="intro">
    <h1 class="handwritten-heading handwritten-heading--page">faves</h1>
    <p>
      Movies, shows, podcasts, books, blogs and videos I come back to. Hover a
      row to read why, or tap it on a phone.
    </p>
  </header>

  <section class="win bar" data-no-vim aria-label="Filters">
    <h2 class="win-title">
      <span class="win-cmd">grep faves</span>
      <span class="win-count" aria-live="polite">
        {shownCount}{filtered ? ` of ${totalCount}` : ""} items
      </span>
    </h2>
    <div class="win-body">
      <p class="prompt">
        <span class="ps">$</span>
        {#each command as segment, index (index)}
          <span class={segment.kind}>{segment.text}</span>{" "}
        {/each}<span class="cursor" aria-hidden="true"></span>
      </p>

      <div class="field">
        <span class="key">tags</span>
        <button
          type="button"
          class="chip chip-act tags-more"
          aria-expanded={tagsOpen}
          onclick={() => {
            cue(tagsOpen ? "close" : "open", { emphasis: "subtle" });
            tagsOpen = !tagsOpen;
          }}
          >{tagsOpen ? "less" : `all ${allTags.length}`}</button
        >
        <div class="chips chips-tags" class:chips-open={tagsOpen}>
          {#each allTags as tag (tag)}
            <button
              type="button"
              class="chip chip-tag"
              class:on={activeTags.has(tag)}
              aria-pressed={activeTags.has(tag)}
              onclick={() => toggleTag(tag)}>{tag}</button
            >
          {/each}
        </div>
      </div>

      <div class="field">
        <span class="key">match</span>
        <div class="chips chips-fit">
          {#each ["all", "any"] as const as mode (mode)}
            <button
              type="button"
              class="chip"
              class:on={match === mode}
              data-cuelume-select
              aria-pressed={match === mode}
              onclick={() => (match = mode)}>{mode}</button
            >
          {/each}
        </div>
        <span class="key key-gap">sort</span>
        <div class="chips chips-fit">
          {#each SORTS as option (option.key)}
            <button
              type="button"
              class="chip"
              class:on={sortKey === option.key}
              data-cuelume-select
              aria-pressed={sortKey === option.key}
              onclick={() => (sortKey = option.key)}>{option.label}</button
            >
          {/each}
        </div>
      </div>

      <div class="field">
        <label class="key" for="faves-query">grep -i</label>
        <input
          id="faves-query"
          data-cuelume-type
          class="query"
          type="text"
          bind:value={query}
          placeholder="title, author, note"
          autocomplete="off"
          autocapitalize="off"
          spellcheck="false"
          enterkeyhint="search"
        />
        <div class="chips chips-end">
          <button type="button" class="chip chip-act" onclick={openRandom}
            >random</button
          >
          <button
            type="button"
            class="chip chip-act"
            disabled={!filtered}
            onclick={clearAll}>clear</button
          >
        </div>
      </div>
    </div>
  </section>

  <div class="shelves">
  {#each visible as section (section.id)}
    {@const folded = collapsed.has(section.id)}
    <section class="win" id={section.id} aria-labelledby={`t-${section.id}`}>
      <h2 class="win-title" id={`t-${section.id}`}>
        <button
          type="button"
          class="win-toggle"
          aria-expanded={!folded}
          aria-controls={`rows-${section.id}`}
          onclick={() => toggleSection(section.id)}
        >
          <span class="win-cmd"
            >ls -l ~/faves/<span class="path">{section.id}</span></span
          >
          <span class="win-count"
            >{section.items.length}{section.items.length !== section.total
              ? ` of ${section.total}`
              : ""}</span
          >
          <span class="win-fold" aria-hidden="true">{folded ? "[+]" : "[-]"}</span>
        </button>
      </h2>
      {#if !folded}
        <ul class="rows" id={`rows-${section.id}`}>
          {#each section.items as item (item.id)}
            {@const detail = hasDetail(item)}
            {@const isOpen = openItem === item.id}
            <li class:is-open={isOpen}>
              <div
                class="row"
                data-peek-title={item.title}
                data-peek-meta={meta(item) || undefined}
                data-peek-body={item.comment}
                data-peek-episodes={episodeLines(item.favoriteEpisodes)}
                data-peek-rating={item.rating}
                data-peek-image={item.image ?? item.preview}
                data-peek-label={`${section.id}/`}
              >
                {#if touch && detail}
                  <button
                    type="button"
                    class="row-main"
                    aria-expanded={isOpen}
                    aria-controls={`d-${item.id}`}
                    onclick={() => toggleOpen(item.id)}
                  >
                    {@render label(item)}
                  </button>
                {:else if item.url}
                  <a
                    class="row-main"
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    data-no-link-fx
                  >
                    {@render label(item)}
                  </a>
                {:else}
                  <div class="row-main">{@render label(item)}</div>
                {/if}

                {#if detail}
                  <button
                    type="button"
                    class="row-mark"
                    aria-expanded={isOpen}
                    aria-controls={`d-${item.id}`}
                    aria-label={`Note on ${item.title}`}
                    onclick={() => toggleOpen(item.id)}>#</button
                  >
                {:else}
                  <span class="row-mark" aria-hidden="true"></span>
                {/if}

                <span class="row-tags">
                  {#each item.categories.slice(0, 3) as tag (tag)}
                    <button
                      type="button"
                      class="row-tag"
                      class:on={activeTags.has(tag)}
                      onclick={() => toggleTag(tag)}>{tag}</button
                    >
                  {/each}
                </span>
              </div>

              {#if isOpen && detail}
                <div class="detail" id={`d-${item.id}`}>
                  {#if item.comment}
                    <p class="note"># {item.comment}</p>
                  {/if}
                  {#if item.favoriteEpisodes?.length}
                    <p class="note"># favorite episodes</p>
                    <ul class="eps">
                      {#each item.favoriteEpisodes as episode (episode.number ?? episode.title)}
                        <li>
                          {#if episode.number}<span class="ep-no"
                              >{episode.number}</span
                            >{/if}
                          {#if episode.guest}<span class="meta"
                              >{episode.guest}</span
                            >{/if}
                          {episode.title}
                        </li>
                      {/each}
                    </ul>
                  {/if}
                  <p class="detail-tags">
                    {#each item.categories as tag (tag)}
                      <button
                        type="button"
                        class="row-tag"
                        class:on={activeTags.has(tag)}
                        onclick={() => toggleTag(tag)}>{tag}</button
                      >
                    {/each}
                  </p>
                  {#if item.url}
                    <a
                      class="visit"
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      data-no-link-fx>open {host(item.url)} ↗</a
                    >
                  {/if}
                </div>
              {/if}
            </li>
          {/each}
        </ul>
      {/if}
    </section>
  {/each}
  </div>

  {#if visible.length === 0}
    <section class="win">
      <h2 class="win-title"><span class="win-cmd">grep faves</span></h2>
      <div class="win-body empty">
        <p>no matches.</p>
        <button type="button" class="chip chip-act" onclick={clearAll}
          >clear</button
        >
      </div>
    </section>
  {/if}

  <p class="footnote">
    <img src="/logos/tmdb.svg" alt="TMDB" width="40" height="16" />
    <span
      >This product uses the TMDB API but is not endorsed or certified by TMDB.</span
    >
  </p>
</div>

<style>
  .favorites-container {
    --rate-col: 5.4ch;
    --pad: 0.9rem;

    min-width: 0;
    font-size: 0.84rem;
  }

  .intro {
    margin: 0 0 1.2rem;
  }

  .intro h1 {
    margin: 0 0 0.4rem;
  }

  .intro p {
    margin: 0;
    color: var(--gray-color);
  }

  /* Terminal windows */
  /* Sections flow into two or three columns, each kept whole. */
  .shelves {
    column-gap: 1.2rem;
    columns: 3 22rem;
  }

  .shelves > .win {
    break-inside: avoid;
  }

  /* Columns are narrow: tags move into the opened detail. */
  .shelves .row {
    grid-template-columns: minmax(0, max-content) 2.4ch;
  }

  .shelves .row-tags {
    display: none;
  }

  .shelves .detail-tags {
    display: flex;
  }

  .win {
    min-width: 0;
    margin: 0 0 1.2rem;
    border: 1px solid var(--border-color);
    background: var(--term-panel);
    scroll-margin-top: 1rem;
  }

  .win-title {
    display: flex;
    gap: 0.6rem;
    align-items: center;
    margin: 0;
    padding: 0.35rem var(--pad);
    border-bottom: 1px solid var(--border-color);
    color: var(--gray-color);
    font-size: 0.76rem;
    font-weight: 400;
    letter-spacing: 0;
  }

  .win-title::before {
    color: var(--accent);
    content: "■";
    font-size: 0.6rem;
  }

  .win-toggle {
    display: flex;
    flex: 1;
    gap: 0.6rem;
    align-items: center;
    min-width: 0;
    margin: 0;
    padding: 0.35rem var(--pad) 0.35rem 0;
    border: 0;
    background: none;
    color: inherit;
    font: inherit;
    text-align: left;
  }

  .win-title:has(.win-toggle) {
    padding: 0 0 0 var(--pad);
  }

  .win-toggle:hover .win-fold,
  .win-toggle:focus-visible .win-fold {
    color: var(--heading-color);
  }

  .win-cmd {
    min-width: 0;
    overflow-wrap: anywhere;
  }

  .win-cmd .path {
    color: var(--tc-path);
  }

  .win-count {
    margin-left: auto;
    white-space: nowrap;
  }

  .win-fold {
    color: var(--gray-color);
  }

  .win-body {
    padding: 0.8rem var(--pad);
  }

  /* Filter bar */
  .prompt {
    margin: 0 0 0.7rem;
    color: var(--heading-color);
    line-height: 1.6;
    overflow-wrap: anywhere;
  }

  .prompt .ps {
    margin-right: 0.5ch;
    color: var(--tc-host);
  }

  .prompt .cmd {
    color: var(--tc-path);
  }

  .prompt .flag {
    color: var(--gray-color);
  }

  .prompt .string {
    color: var(--tc-string);
  }

  .prompt .pipe {
    color: var(--gray-color);
  }

  .cursor {
    display: inline-block;
    width: 0.6em;
    height: 1em;
    margin-left: 0.1ch;
    background: var(--accent);
    vertical-align: text-bottom;
  }

  .field {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem 0.6rem;
    align-items: baseline;
    margin: 0 0 0.45rem;
  }

  .field:last-child {
    margin-bottom: 0;
  }

  .key {
    flex: none;
    width: 7ch;
    color: var(--gray-color);
  }

  .key-gap {
    width: auto;
    margin-left: 0.8rem;
  }

  .chips {
    display: flex;
    flex: 1 1 0;
    flex-wrap: wrap;
    gap: 0.15rem 0.5rem;
    min-width: 0;
  }

  .field > .chips:not(:last-child) {
    flex: 0 1 auto;
  }

  .chips-fit {
    flex: 0 1 auto;
  }

  /* Two lines of tags until you ask for all of them. */
  .tags-more {
    display: inline-block;
  }

  .chips-tags {
    max-height: 3rem;
    overflow: hidden;
  }

  .chips-tags.chips-open {
    max-height: none;
  }

  .chips-end {
    flex: 0 0 auto;
    margin-left: auto;
  }

  .chip {
    padding: 0.15rem 0.2rem;
    border: 0;
    background: none;
    color: var(--heading-color);
    font: inherit;
    line-height: 1.3;
  }

  .chip::before {
    content: "[";
    color: var(--gray-color);
  }

  .chip::after {
    content: "]";
    color: var(--gray-color);
  }

  .chip-tag {
    color: var(--tc-tag);
  }

  .chip.on {
    background: var(--heading-color);
    color: var(--background-color);
  }

  .chip.on::before,
  .chip.on::after {
    color: inherit;
  }

  .chip:hover:not(.on):not(:disabled) {
    background: var(--tc-selection);
  }

  .chip:disabled {
    color: var(--gray-color);
    cursor: default;
    opacity: 0.5;
  }

  .chip-act {
    color: var(--link-color);
  }

  .query {
    flex: 1 1 12rem;
    min-width: 0;
    padding: 0.15rem 0;
    border: 0;
    border-bottom: 1px dashed var(--border-color);
    border-radius: 0;
    background: transparent;
    color: var(--heading-color);
    font: inherit;
    outline: none;
  }

  .query::placeholder {
    color: var(--gray-color);
    opacity: 0.7;
  }

  .query:focus {
    border-bottom-color: var(--accent);
  }

  .empty {
    display: flex;
    gap: 1rem;
    align-items: baseline;
    color: var(--gray-color);
  }

  .empty p {
    margin: 0;
  }

  /* Rows */
  .rows {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .rows > li {
    margin: 0;
    padding: 0;
  }

  .row {
    display: grid;
    grid-template-columns: minmax(0, max-content) 2.4ch minmax(0, 1fr);
    gap: 0 0.6rem;
    align-items: start;
    padding: 0 var(--pad);
  }

  .row:hover,
  li.is-open > .row {
    background: var(--tc-selection);
  }

  .row-main {
    display: grid;
    grid-template-columns: var(--rate-col) 16px minmax(0, 1fr);
    gap: 0 0.75rem;
    align-items: start;
    min-width: 0;
    margin: 0;
    padding: 0.28rem 0;
    border: 0;
    background: none;
    color: var(--tc-path);
    font: inherit;
    line-height: 1.45;
    text-align: left;
    text-decoration: none;
  }

  @media (hover: hover) {
    .row-main:hover .title {
      text-decoration: underline;
      text-underline-offset: 0.18em;
    }
  }

  .row-main:focus-visible,
  .row-mark:focus-visible,
  .row-tag:focus-visible,
  .chip:focus-visible,
  .win-toggle:focus-visible,
  .visit:focus-visible {
    outline: 1px solid var(--accent);
    outline-offset: 1px;
  }

  .rating {
    color: var(--gray-color);
    letter-spacing: 0;
    white-space: nowrap;
  }

  .rating-on {
    color: var(--tc-date);
  }

  .rating-off {
    opacity: 0.55;
  }

  .thumb {
    display: block;
    width: 16px;
    height: 16px;
    margin-top: 0.14rem;
    box-shadow: inset 0 0 0 1px var(--border-color);
  }

  .thumb img {
    display: block;
    width: 16px;
    height: 16px;
    margin: 0;
    object-fit: cover;
  }

  .name {
    min-width: 0;
    overflow-wrap: anywhere;
  }

  .title {
    color: var(--tc-path);
  }

  .meta {
    margin-left: 0.5ch;
    color: var(--gray-color);
  }

  .row-mark {
    align-self: start;
    padding: 0.28rem 0 0;
    border: 0;
    background: none;
    color: var(--gray-color);
    font: inherit;
    line-height: 1.45;
    text-align: center;
  }

  button.row-mark {
    color: var(--heading-color);
  }

  button.row-mark:hover,
  li.is-open button.row-mark {
    color: var(--accent);
  }

  .row-tags {
    display: flex;
    gap: 0 1ch;
    justify-content: flex-end;
    min-width: 0;
    padding: 0.28rem 0;
    overflow: hidden;
    white-space: nowrap;
  }

  .row-tag {
    margin: 0;
    padding: 0;
    border: 0;
    background: none;
    color: var(--gray-color);
    font: inherit;
    line-height: 1.45;
  }

  .row-tag:hover {
    color: var(--tc-tag);
  }

  .row-tag.on {
    color: var(--tc-tag);
    text-decoration: underline;
    text-underline-offset: 0.18em;
  }

  /* Opened note, aligned under the title column */
  .detail {
    padding: 0.1rem var(--pad) 0.7rem
      calc(var(--pad) + var(--rate-col) + 16px + 1.5rem);
    background: var(--tc-selection);
  }

  .detail p {
    margin: 0 0 0.35rem;
  }

  .note {
    color: var(--gray-color);
    overflow-wrap: anywhere;
  }

  .eps {
    margin: 0 0 0.35rem;
    padding: 0;
    color: var(--heading-color);
    list-style: none;
  }

  .eps li {
    margin: 0;
    padding-left: 2ch;
    text-indent: -2ch;
  }

  .eps li::before {
    content: "- ";
    color: var(--gray-color);
  }

  .ep-no {
    margin-right: 1ch;
    color: var(--tc-date);
  }

  .detail-tags {
    display: none;
    flex-wrap: wrap;
    gap: 0 1ch;
  }

  .visit {
    display: inline-block;
    padding: 0.2rem 0;
    color: var(--link-color);
    text-decoration: none;
  }

  .visit:hover {
    text-decoration: underline;
    text-underline-offset: 0.18em;
  }

  .footnote {
    display: flex;
    gap: 0.6rem;
    align-items: center;
    margin: 0 0 1rem;
    color: var(--gray-color);
    font-size: 0.72rem;
    line-height: 1.5;
  }

  .footnote img {
    flex: none;
    width: 40px;
    height: auto;
    margin: 0;
    opacity: 0.7;
  }

  .footnote span::before {
    content: "# ";
  }

  @media (max-width: 860px) {
    .row {
      grid-template-columns: minmax(0, max-content) 2.4ch;
    }

    .row-tags {
      display: none;
    }

    .detail-tags {
      display: flex;
    }
  }

  @media (max-width: 640px) {
    .favorites-container {
      --pad: 0.7rem;
      --rate-col: 5.4ch;

      font-size: 0.8rem;
    }

    .row-main {
      gap: 0 0.55rem;
      padding: 0.45rem 0;
      min-height: 2.2rem;
    }

    .thumb {
      margin-top: 0.2rem;
    }

    .row-mark {
      min-height: 2.2rem;
    }

    .detail {
      padding-left: var(--pad);
    }

    .win-toggle {
      min-height: 2.2rem;
    }

    .chip {
      padding: 0.35rem 0.25rem;
    }

    .row-tag {
      padding: 0.3rem 0;
    }

    .visit {
      padding: 0.45rem 0;
    }

    .field {
      row-gap: 0;
    }

    .key {
      width: auto;
      min-width: 7ch;
    }

    .key-gap {
      min-width: 0;
      margin-left: 0.6rem;
    }

    .chips-tags {
      flex-basis: 100%;
      max-height: 5.6rem;
      overflow: hidden;
    }

    .chips-tags.chips-open {
      max-height: none;
    }

    .tags-more {
      display: inline-block;
    }

    .chips-end {
      margin-left: 0;
    }

    .query {
      flex-basis: 100%;
      padding: 0.45rem 0;
      font-size: 1rem;
    }

  }
</style>
