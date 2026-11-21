<script lang="ts">
  import { actions } from "astro:actions";

  type LastfmData = NonNullable<
    Awaited<ReturnType<typeof actions.getLastfmData>>["data"]
  >;
  type Track = LastfmData["recenttracks"]["track"][number];

  let data = $state<LastfmData | null>(null);
  let error = $state<string | null>(null);
  let loading = $state(true);

  async function loadData(): Promise<void> {
    loading = true;
    error = null;
    try {
      const result = await actions.getLastfmData({ limit: 60 });
      if (result.error) {
        error = result.error.message || "could not load music data";
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

  function ago(uts: string | undefined): string {
    if (!uts) return "";
    const minutes = Math.floor((Date.now() - Number(uts) * 1000) / 60000);
    if (minutes < 1) return "now";
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h`;
    return `${Math.floor(hours / 24)}d`;
  }

  /** Album art at a Last.fm size: "medium" (64px) for rows, "extralarge" for hovers. */
  function cover(track: Track, size: "medium" | "extralarge"): string | undefined {
    const images = track.image ?? [];
    const best =
      images.find((image) => image.size === size) ??
      images.find((image) => image.size === "large") ??
      images.at(-1);
    const url = best?.["#text"]?.trim();
    return url || undefined;
  }

  const playing = (track: Track): boolean =>
    track["@attr"]?.nowplaying === "true";
</script>

{#if loading}
  <p class="status">
    <span class="ascii-spinner" aria-hidden="true">⠋</span> fetching scrobbles
  </p>
{:else if error}
  <p class="status error">lastfm: {error}</p>
{:else if data}
  <div class="player" data-no-vim>
    <ol class="tracks">
      <li class="head" aria-hidden="true">
        <span>#</span>
        <span></span>
        <span>title</span>
        <span>artist</span>
        <span class="album-col">album</span>
        <span class="when">when</span>
      </li>
      {#each data.recenttracks.track as track, index (`${track.url}-${track.date?.uts ?? "now"}`)}
        <li class:now={playing(track)}>
          <a
            href={track.url}
            target="_blank"
            rel="noopener noreferrer"
            data-no-link-fx
            data-peek-image={cover(track, "extralarge")}
            data-peek-label={track.album["#text"] || track.name}
          >
            <span class="num">{playing(track) ? "▶" : String(index + 1).padStart(2, "0")}</span>
            <span class="art">
              {#if cover(track, "medium")}
                <img
                  src={cover(track, "medium")}
                  alt=""
                  width="18"
                  height="18"
                  loading="lazy"
                  decoding="async"
                />
              {/if}
            </span>
            <span class="title">{track.name}</span>
            <span class="artist">{track.artist.name}</span>
            <span class="album-col">{track.album["#text"]}</span>
            <span class="when">{playing(track) ? "playing" : ago(track.date?.uts)}</span>
          </a>
        </li>
      {/each}
    </ol>
    <p class="hint">
      <span>hover a track for its cover</span>
      <span class="total"
        ><b>{data.stats.totalScrobbles.toLocaleString("en-GB")}</b> scrobbles
        all time</span
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

  .player {
    font-size: 0.8rem;
  }

  .total {
    margin-left: auto;
  }

  .total b {
    color: var(--tc-date);
  }

  .tracks {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .tracks li {
    margin: 0;
  }

  .head,
  .tracks a {
    display: grid;
    grid-template-columns: 3ch 18px minmax(0, 1.3fr) minmax(0, 1fr) minmax(0, 1fr) 7ch;
    align-items: center;
    gap: 0 1.2ch;
    padding: 0.12rem 0.4rem;
  }

  .head {
    background: var(--flexoki-magenta);
    color: var(--background-color);
    font-weight: 700;
  }

  .tracks a {
    color: var(--text-color);
    text-decoration: none;
    text-shadow: none;
  }

  .tracks a:hover,
  .tracks a:focus-visible {
    background: var(--surface-hover);
    color: var(--heading-color);
    outline: none;
  }

  .tracks a > span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .num {
    color: var(--gray-color);
  }

  .art {
    display: block;
    width: 18px;
    height: 18px;
    background: var(--surface-hover);
  }

  .art img {
    display: block;
    width: 18px;
    height: 18px;
    margin: 0;
    object-fit: cover;
  }

  .title {
    color: var(--heading-color);
  }

  .artist {
    color: var(--tc-path);
  }

  .album-col {
    color: var(--gray-color);
  }

  .when {
    color: var(--tc-date);
    text-align: right;
  }

  .head .when,
  .head .album-col {
    color: inherit;
  }

  .now a,
  .now .num,
  .now .when {
    color: var(--tc-live);
  }

  /* A status line under the list: a hint, and the all-time total. */
  .hint {
    display: flex;
    flex-wrap: wrap;
    gap: 0 1ch;
    margin: 0.6rem 0 0;
    color: var(--gray-color);
    font-size: 0.74rem;
  }

  @media (max-width: 640px) {
    .head,
    .tracks a {
      grid-template-columns: 3ch 18px minmax(0, 1fr) minmax(0, 0.8fr) 5ch;
    }

    .album-col {
      display: none;
    }
  }
</style>
