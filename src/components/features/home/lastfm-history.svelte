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
    <!-- Data Source Indicator -->
    <div class="data-source">
      <img src="/logos/lastfm.png" alt="Last.fm" class="source-logo" />
      <span class="source-text"
        >Data automatically tracked from my Last.fm account</span
      >
    </div>

    <div class="tracks-grid">
      <!-- Total Scrobbles Card -->
      {#if data.stats}
        <div class="track-card stats-card">
          <div class="stats-content">
            <div class="stat-label">Total Scrobbles</div>
            <div class="stat-value">
              {formatNumber(data.stats.totalScrobbles)}
            </div>
          </div>
        </div>
      {/if}

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

      <!-- And more card -->
      <a
        href="https://url.rgo.pt/music"
        target="_blank"
        rel="noopener noreferrer"
        class="more-card"
      >
        <div class="more-card-content">
          <div class="more-icon">🎵</div>
          <div class="more-text">
            <div class="more-title">And more...</div>
            <div class="more-subtitle">View full history</div>
          </div>
        </div>
      </a>
    </div>
  </div>
{/if}

<style>
  .lastfm-container {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .data-source {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem 1rem;
    background: rgba(0, 0, 0, 0.02);
    border-radius: 0.5rem;
    border: 1px solid var(--border-color, #e5e5e5);
    font-size: 0.875rem;
    color: var(--text-muted);
  }

  .source-logo {
    width: 24px;
    height: 24px;
    object-fit: contain;
  }

  .source-text {
    flex: 1;
  }

  .tracks-grid {
    column-count: 4;
    column-gap: 1rem;
  }

  @media (max-width: 1200px) {
    .tracks-grid {
      column-count: 3;
    }
  }

  @media (max-width: 900px) {
    .tracks-grid {
      column-count: 2;
    }
  }

  @media (max-width: 600px) {
    .tracks-grid {
      column-count: 1;
    }
  }

  .track-card {
    background: var(--bg-secondary);
    border-radius: 8px;
    border: 1px solid var(--border-color);
    overflow: hidden;
    transition: all 0.2s;
    break-inside: avoid;
    margin-bottom: 1rem;
  }

  .track-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  }

  .track-card.now-playing {
    border-color: var(--link-color);
    background: color-mix(in srgb, var(--link-color) 5%, var(--bg-secondary));
  }

  .track-card.stats-card {
    background: linear-gradient(
      135deg,
      var(--link-color) 0%,
      color-mix(in srgb, var(--link-color) 80%, transparent) 100%
    );
    border-color: var(--link-color);
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 180px;
  }

  .stats-content {
    text-align: center;
    color: white;
    padding: 2rem;
  }

  .stats-content .stat-label {
    font-size: 0.875rem;
    opacity: 0.95;
    margin-bottom: 0.5rem;
    text-transform: uppercase;
    letter-spacing: 1px;
    font-weight: 600;
  }

  .stats-content .stat-value {
    font-size: 2.5rem;
    font-weight: 700;
    line-height: 1;
  }

  .more-card {
    background: var(--bg-secondary);
    border-radius: 8px;
    border: 2px dashed var(--border-color);
    overflow: hidden;
    transition: all 0.2s;
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 250px;
    text-decoration: none;
    color: var(--text-color);
    break-inside: avoid;
    margin-bottom: 1rem;
  }

  .more-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
    border-color: var(--link-color);
  }

  .more-card:hover::before {
    width: 0;
  }

  .more-card-content {
    text-align: center;
    padding: 2rem;
  }

  .more-icon {
    font-size: 3rem;
    margin-bottom: 1rem;
  }

  .more-title {
    font-size: 1.25rem;
    font-weight: 600;
    margin-bottom: 0.5rem;
  }

  .more-subtitle {
    font-size: 0.875rem;
    color: var(--link-color);
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

  @media (prefers-color-scheme: dark) {
    .data-source {
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

    .more-card {
      background: rgba(255, 255, 255, 0.03);
      border-color: rgba(255, 255, 255, 0.1);
    }

    .more-card:hover {
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
    }

    .track-image {
      background: rgba(255, 255, 255, 0.02);
    }
  }
</style>
