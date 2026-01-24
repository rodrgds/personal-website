<script lang="ts">
  import { actions } from "astro:actions";

  let data = $state<any>(null);
  let error = $state<string | null>(null);
  let loading = $state(true);

  async function loadScrobbles() {
    loading = true;
    error = null;

    try {
      const result = await actions.getLastfmScrobbles({ limit: 20 });

      if (result.error) {
        error = result.error.message || "Failed to load scrobbles";
        return;
      }

      if (result.data) {
        data = result.data;
      }
    } catch (e) {
      error = e instanceof Error ? e.message : "An unexpected error occurred";
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    loadScrobbles();
  });

  function formatDate(timestamp: string) {
    const date = new Date(parseInt(timestamp) * 1000);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (minutes < 1) return "just now";
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }
</script>

{#if loading}
  <p class="loading">Loading scrobbles...</p>
{:else if error}
  <p class="error">Failed to load scrobbles: {error}</p>
{:else if data}
  <div class="lastfm-container">
    <div class="profile-link">
      <a
        href="https://url.rgo.pt/music"
        target="_blank"
        rel="noopener noreferrer"
      >
        View full profile →
      </a>
    </div>

    <div class="tracks-list">
      {#each data.track as track}
        {@const isNowPlaying = track["@attr"]?.nowplaying === "true"}
        <div class="track-item" class:now-playing={isNowPlaying}>
          <div class="track-header">
            <div class="track-info">
              <div class="track-name">{track.name}</div>
              <div class="track-artist">{track.artist.name}</div>
            </div>
            <div class="track-time">
              {isNowPlaying ? "Now playing" : formatDate(track.date?.uts || "")}
            </div>
          </div>
          {#if track.album["#text"]}
            <div class="track-album">{track.album["#text"]}</div>
          {/if}
        </div>
      {/each}
    </div>
  </div>
{/if}

<style>
  .lastfm-container {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .profile-link {
    text-align: right;
    font-size: 0.875rem;
  }

  .tracks-list {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .track-item {
    padding: 0.75rem;
    background: var(--bg-secondary);
    border-radius: 8px;
    border: 1px solid var(--border-color);
  }

  .track-item.now-playing {
    border-color: var(--accent);
    background: color-mix(in srgb, var(--accent) 5%, var(--bg-secondary));
  }

  .track-header {
    display: flex;
    justify-content: space-between;
    align-items: start;
    gap: 1rem;
  }

  .track-info {
    flex: 1;
    min-width: 0;
  }

  .track-name {
    font-weight: 600;
    margin-bottom: 0.25rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .track-artist {
    color: var(--text-muted);
    font-size: 0.875rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .track-time {
    font-size: 0.75rem;
    color: var(--text-muted);
    white-space: nowrap;
  }

  .track-item.now-playing .track-time {
    color: var(--accent);
    font-weight: 600;
  }

  .track-album {
    margin-top: 0.5rem;
    font-size: 0.875rem;
    color: var(--text-muted);
    font-style: italic;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .error {
    color: var(--error);
    padding: 1rem;
    text-align: center;
  }

  .loading {
    padding: 1rem;
    text-align: center;
    color: var(--text-muted);
  }
</style>
