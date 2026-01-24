<script lang="ts">
  import { actions } from "astro:actions";

  let data = $state<any>(null);
  let error = $state<string | null>(null);
  let loading = $state(true);

  async function loadData() {
    loading = true;
    error = null;

    try {
      const result = await actions.getLastfmData({ limit: 20 });

      if (result.error) {
        error = result.error.message || "Failed to load music data";
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
    loadData();
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

  function formatNumber(num: number): string {
    return num.toLocaleString("en-US");
  }

  function getAlbumImage(track: any): string | null {
    if (!track.image || track.image.length === 0) return null;

    // Last.fm returns images in multiple sizes, get the largest available
    const largeImage = track.image.find(
      (img: any) => img.size === "large" || img.size === "extralarge",
    );
    const mediumImage = track.image.find((img: any) => img.size === "medium");
    const anyImage = track.image[track.image.length - 1];

    const imageUrl =
      largeImage?.["#text"] || mediumImage?.["#text"] || anyImage?.["#text"];
    return imageUrl && imageUrl.trim() ? imageUrl : null;
  }
</script>

{#if loading}
  <p class="loading">Loading music data...</p>
{:else if error}
  <p class="error">Failed to load music data: {error}</p>
{:else if data}
  <div class="lastfm-container">
    <!-- Stats Header -->
    {#if data.stats}
      <div class="stats-header">
        <div class="stat-card">
          <div class="stat-label">Total Scrobbles</div>
          <div class="stat-value">
            {formatNumber(data.stats.totalScrobbles)}
          </div>
        </div>
      </div>
    {/if}

    <div class="tracks-grid">
      {#each data.recenttracks.track as track}
        {@const isNowPlaying = track["@attr"]?.nowplaying === "true"}
        {@const albumImage = getAlbumImage(track)}
        <div class="track-card" class:now-playing={isNowPlaying}>
          {#if albumImage}
            <div class="track-image">
              <img src={albumImage} alt={track.album["#text"] || track.name} />
              {#if isNowPlaying}
                <div class="now-playing-badge">
                  <span class="pulse-dot"></span>
                  Playing
                </div>
              {/if}
            </div>
          {/if}
          <div class="track-content">
            <div class="track-header">
              <div class="track-info">
                <div class="track-name">{track.name}</div>
                <div class="track-artist">{track.artist.name}</div>
                {#if track.album["#text"]}
                  <div class="track-album">{track.album["#text"]}</div>
                {/if}
              </div>
            </div>
            <div class="track-time">
              {isNowPlaying ? "Now playing" : formatDate(track.date?.uts || "")}
            </div>
          </div>
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

  .stats-header {
    display: flex;
    gap: 1rem;
    margin-bottom: 1rem;
    flex-wrap: wrap;
  }

  .stat-card {
    flex: 0 0 auto;
    min-width: 150px;
    background: rgba(0, 0, 0, 0.02);
    border: 1px solid var(--border-color, #e5e5e5);
    padding: 1rem 1.25rem;
    border-radius: 0.5rem;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
  }

  .stat-label {
    font-size: 0.75rem;
    opacity: 0.7;
    margin-bottom: 0.25rem;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    font-weight: 600;
  }

  .stat-value {
    font-size: 2rem;
    font-weight: 700;
    line-height: 1;
    color: var(--link-color);
  }

  .profile-link {
    text-align: right;
    font-size: 0.875rem;
    margin-bottom: 0.5rem;
  }

  .tracks-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 1rem;
  }

  .track-card {
    background: var(--bg-secondary);
    border-radius: 8px;
    border: 1px solid var(--border-color);
    overflow: hidden;
    transition: all 0.2s;
  }

  .track-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  }

  .track-card.now-playing {
    border-color: var(--link-color);
    background: color-mix(in srgb, var(--link-color) 5%, var(--bg-secondary));
  }

  .track-image {
    position: relative;
    width: 100%;
    padding-bottom: 100%;
    background: rgba(0, 0, 0, 0.05);
  }

  .track-image img {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .now-playing-badge {
    position: absolute;
    top: 0.5rem;
    right: 0.5rem;
    background: var(--link-color);
    color: white;
    padding: 0.25rem 0.5rem;
    border-radius: 1rem;
    font-size: 0.75rem;
    font-weight: 600;
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }

  .pulse-dot {
    width: 6px;
    height: 6px;
    background: white;
    border-radius: 50%;
    animation: pulse 2s ease-in-out infinite;
  }

  @keyframes pulse {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.3;
    }
  }

  .track-content {
    padding: 0.75rem;
  }

  .track-header {
    margin-bottom: 0.5rem;
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

  .track-album {
    margin-top: 0.25rem;
    font-size: 0.8125rem;
    color: var(--text-muted);
    font-style: italic;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .track-time {
    font-size: 0.75rem;
    color: var(--text-muted);
  }

  .track-card.now-playing .track-time {
    color: var(--link-color);
    font-weight: 600;
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

  @media (max-width: 768px) {
    .tracks-grid {
      grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
      gap: 0.75rem;
    }

    .stat-card {
      min-width: unset;
      width: 100%;
    }
  }

  @media (prefers-color-scheme: dark) {
    .stat-card {
      background: rgba(255, 255, 255, 0.03);
      border-color: rgba(255, 255, 255, 0.1);
    }

    .track-card {
      background: rgba(255, 255, 255, 0.03);
      border-color: rgba(255, 255, 255, 0.1);
    }

    .track-card:hover {
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
    }

    .track-image {
      background: rgba(255, 255, 255, 0.02);
    }
  }
</style>
