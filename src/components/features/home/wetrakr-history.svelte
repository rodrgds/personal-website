<script lang="ts">
  import { actions } from "astro:actions";

  type History = NonNullable<
    Awaited<ReturnType<typeof actions.getWatchHistory>>["data"]
  >;
  type Item = History["items"][number];

  let data = $state<History | null>(null);
  let error = $state<string | null>(null);
  let loading = $state(true);
  let show = $state<"all" | "film" | "episodes">("all");

  const shown = $derived(
    (data?.items ?? []).filter((item) => show === "all" || item.kind === show),
  );

  async function loadData(): Promise<void> {
    loading = true;
    error = null;
    try {
      const result = await actions.getWatchHistory({});
      if (result.error) {
        error = result.error.message || "could not load the watch history";
        return;
      }
      data = result.data;
    } catch (cause) {
      error = cause instanceof Error ? cause.message : "unexpected error";
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    void loadData();
  });

  function ago(iso: string): string {
    const minutes = Math.floor((Date.now() - Date.parse(iso)) / 60000);
    if (minutes < 60) return `${Math.max(1, minutes)}m`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    if (days < 60) return `${days}d`;
    return `${Math.floor(days / 30)}mo`;
  }

  /** "film 2026", "s01e03" or a run, "s01e01-e05". */
  function label(item: Item): string {
    if (item.kind === "film") return `film ${item.detail}`.trim();
    return item.detail;
  }
</script>

{#if loading}
  <p class="status">
    <span class="ascii-spinner" aria-hidden="true">⠋</span> fetching history
  </p>
{:else if error}
  <p class="status">
    <span class="error">wetrakr:</span>
    {error}. it is all on
    <a href="https://url.rgo.pt/movies" target="_blank" rel="noopener noreferrer"
      >wetrakr</a
    >.
    <button type="button" class="retry" data-cuelume-tap onclick={loadData}
      >[retry]</button
    >
  </p>
{:else if data}
  <div class="history" data-no-vim>
    <div class="filters" role="group" aria-label="Show">
      {#each [["all", "all"], ["film", "films"], ["episodes", "episodes"]] as const as [value, text] (value)}
        <button
          type="button"
          data-cuelume-select
          aria-pressed={show === value}
          onclick={() => (show = value)}>{text}</button
        >
      {/each}
    </div>
    <ol class="rows">
      <li class="head" aria-hidden="true">
        <span>#</span>
        <span></span>
        <span>title</span>
        <span class="what">what</span>
        <span class="rated">rated</span>
        <span class="when">when</span>
      </li>
      {#each shown as item, index (item.key)}
        <li>
          <span
            class="row"
            data-peek-image={item.poster ?? undefined}
            data-peek-label={item.title.toLowerCase()}
          >
            <span class="num">{String(index + 1).padStart(2, "0")}</span>
            <span class="art">
              {#if item.thumb}
                <img
                  src={item.thumb}
                  alt=""
                  width="12"
                  height="18"
                  loading="lazy"
                  decoding="async"
                />
              {/if}
            </span>
            <span class="title">{item.title}</span>
            <span class="what" class:film={item.kind === "film"}
              >{label(item)}</span
            >
            <span class="rated"
              >{item.rating ? `★ ${item.rating}/10` : ""}</span
            >
            <span class="when">{ago(item.watchedAt)}</span>
          </span>
        </li>
      {:else}
        <li class="empty">nothing here yet</li>
      {/each}
    </ol>
    <p class="hint">
      <span>hover a title for its poster</span>
      <span class="total"
        ><b>{data.films.toLocaleString("en-GB")}</b> films,
        <b>{data.episodes.toLocaleString("en-GB")}</b> episodes,
        <b>{data.hours.toLocaleString("en-GB")}h</b> all time</span
      >
    </p>
  </div>
{/if}

<style>
  .status {
    margin: 0;
    color: var(--gray-color);
  }

  .error {
    color: var(--flexoki-red);
  }

  .retry {
    padding: 0;
    border: 0;
    background: none;
    color: var(--link-color);
    font: inherit;
    cursor: pointer;
  }

  .retry:hover,
  .retry:focus-visible {
    background: var(--link-color);
    color: var(--background-color);
  }

  .history {
    font-size: 0.8rem;
  }

  .filters {
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem;
    margin-bottom: 0.6rem;
  }

  .filters button {
    padding: 0 0.45rem;
    border: 1px solid var(--border-color);
    background: transparent;
    color: var(--text-color);
    font: inherit;
    line-height: 1.6;
    cursor: pointer;
  }

  .filters button:hover,
  .filters button:focus-visible {
    border-color: var(--flexoki-red);
    outline: none;
  }

  .filters button[aria-pressed="true"] {
    border-color: var(--flexoki-red);
    background: var(--flexoki-red);
    color: var(--background-color);
  }

  .rows {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .rows li {
    margin: 0;
  }

  .head,
  .row {
    display: grid;
    grid-template-columns: 3ch 12px minmax(0, 1.4fr) minmax(0, 1fr) 7ch 4ch;
    align-items: center;
    gap: 0 1.2ch;
    padding: 0.12rem 0.4rem;
  }

  .head {
    background: var(--flexoki-red);
    color: var(--background-color);
    font-weight: 700;
  }

  .row:hover {
    background: var(--surface-hover);
    color: var(--heading-color);
  }

  .row > span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .num {
    color: var(--gray-color);
  }

  .art {
    display: block;
    width: 12px;
    height: 18px;
    background: var(--surface-hover);
  }

  .art img {
    display: block;
    width: 12px;
    height: 18px;
    margin: 0;
    object-fit: cover;
  }

  .title {
    color: var(--heading-color);
  }

  .what {
    color: var(--tc-path);
  }

  .what.film {
    color: var(--tc-tag);
  }

  .rated {
    color: var(--tc-date);
  }

  .when {
    color: var(--tc-date);
    text-align: right;
  }

  .head .what,
  .head .rated,
  .head .when {
    color: inherit;
  }

  .empty {
    padding: 0.4rem;
    color: var(--gray-color);
  }

  /* A status line under the list: a hint, and the all-time totals. */
  .hint {
    display: flex;
    flex-wrap: wrap;
    gap: 0 1ch;
    margin: 0.6rem 0 0;
    color: var(--gray-color);
    font-size: 0.74rem;
  }

  .total {
    margin-left: auto;
  }

  .total b {
    color: var(--tc-date);
  }

  @media (max-width: 640px) {
    .head,
    .row {
      grid-template-columns: 3ch 12px minmax(0, 1fr) minmax(0, 0.9fr) 4ch;
    }

    .rated {
      display: none;
    }
  }
</style>
