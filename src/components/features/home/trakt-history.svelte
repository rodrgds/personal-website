<script lang="ts">
  import { actions } from "astro:actions";

  let data = $state<any>(null);
  let error = $state<string | null>(null);
  let loading = $state(true);

  async function loadData() {
    loading = true;
    error = null;

    try {
      const result = await actions.getTraktData({ limit: 100 });

      if (result.error) {
        error = result.error.message || "Failed to load watch history";
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

  function formatDate(dateStr: string) {
    const date = new Date(dateStr);
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

  function getTitle(item: any) {
    if (item.type === "movie") {
      return item.movie.title;
    } else if (item.type === "episode") {
      return item.show.title;
    }
    return "Unknown";
  }

  function getYear(item: any) {
    if (item.type === "movie") {
      return item.movie.year;
    } else if (item.type === "episode") {
      return item.show.year;
    }
    return "";
  }

  function getEpisodeInfo(item: any) {
    if (item.type === "episode") {
      const s = item.episode.season.toString().padStart(2, "0");
      const e = item.episode.number.toString().padStart(2, "0");
      return `S${s}E${e} - ${item.episode.title}`;
    }
    return null;
  }

  // Group consecutive episodes from the same season
  function groupHistory(history: any[]) {
    if (!history || history.length === 0) return [];

    const grouped: any[] = [];
    let i = 0;

    while (i < history.length) {
      const item = history[i];

      // Movies are never grouped
      if (item.type === "movie") {
        grouped.push({ ...item, episodeCount: 1 });
        i++;
        continue;
      }

      // For episodes, check if the next items are from the same season
      if (item.type === "episode") {
        const showId = item.show.ids.trakt;
        const seasonNumber = item.episode.season;
        let episodeCount = 1;
        let j = i + 1;
        let firstWatchedAt = item.watched_at;
        let lastWatchedAt = item.watched_at;

        // Count consecutive episodes from the same season
        while (
          j < history.length &&
          history[j].type === "episode" &&
          history[j].show.ids.trakt === showId &&
          history[j].episode.season === seasonNumber
        ) {
          lastWatchedAt = history[j].watched_at;
          episodeCount++;
          j++;
        }

        // Add the first episode with the count and date range
        grouped.push({
          ...item,
          episodeCount,
          firstWatchedAt,
          lastWatchedAt,
        });
        i = j;
      } else {
        grouped.push({ ...item, episodeCount: 1 });
        i++;
      }
    }

    return grouped;
  }

  // Get grouped history
  let groupedHistory = $derived(data ? groupHistory(data.history) : []);
</script>

{#if loading}
  <p class="loading">Loading watch history...</p>
{:else if error}
  <p class="error">Failed to load watch history: {error}</p>
{:else if data}
  <div class="trakt-container">
    <!-- Data Source Indicator -->
    <div class="data-source">
      <img src="/logos/trakt.png" alt="Trakt" class="source-logo" />
      <span class="source-text"
        >Data automatically tracked from my Trakt.tv account</span
      >
    </div>

    <!-- Stats Header -->
    {#if data.stats}
      <div class="stats-header">
        <div class="stat-card">
          <div class="stat-label">Movies Watched</div>
          <div class="stat-value">
            {formatNumber(data.stats.movies.watched)}
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Episodes Watched</div>
          <div class="stat-value">
            {formatNumber(data.stats.episodes.watched)}
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-label">TV Shows</div>
          <div class="stat-value">{formatNumber(data.stats.shows.watched)}</div>
        </div>
      </div>
    {/if}

    <div class="history-grid">
      {#each groupedHistory as item}
        {@const posterUrl = item.posterPath}
        <div class="history-card" data-type={item.type}>
          {#if posterUrl}
            <div class="poster-container">
              <img src={posterUrl} alt={getTitle(item)} class="poster-image" />
              <div class="type-badge">
                {item.type === "movie" ? "🎬 Movie" : "📺 TV"}
              </div>
            </div>
          {/if}
          <div class="card-content">
            <div class="item-header">
              <div class="item-info">
                <div class="item-title">
                  {getTitle(item)}
                  {#if getYear(item)}
                    <span class="item-year">({getYear(item)})</span>
                  {/if}
                </div>
                {#if item.type === "episode"}
                  <div class="episode-info">
                    {#if item.episodeCount === 1}
                      {getEpisodeInfo(item)}
                    {:else}
                      <span class="season-info">
                        Season {item.episode.season}
                      </span>
                      <span class="episode-count">
                        {item.episodeCount}
                        {item.episodeCount === 1 ? "episode" : "episodes"}
                      </span>
                    {/if}
                  </div>
                {/if}
              </div>
            </div>
            <div class="item-time">
              {#if item.episodeCount > 1 && item.firstWatchedAt && item.lastWatchedAt}
                {formatDate(item.lastWatchedAt)} - {formatDate(
                  item.firstWatchedAt,
                )}
              {:else}
                {formatDate(item.watched_at)}
              {/if}
            </div>
          </div>
        </div>
      {/each}

      <!-- And more card -->
      <a
        href="https://url.rgo.pt/movies"
        target="_blank"
        rel="noopener noreferrer"
        class="more-card"
      >
        <div class="more-card-content">
          <div class="more-icon">📺</div>
          <div class="more-text">
            <div class="more-title">And more...</div>
            <div class="more-subtitle">View full history</div>
          </div>
        </div>
      </a>
    </div>

    <div class="tmdb-credit">
      <img src="/images/tmdb-logo.svg" alt="TMDB" class="tmdb-logo" />
      This product uses the TMDB API but is not endorsed or certified by TMDB.
    </div>
  </div>
{/if}

<style>
  .trakt-container {
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

  .stats-header {
    display: flex;
    gap: 1rem;
    margin-bottom: 1rem;
    flex-wrap: wrap;
  }

  .stat-card {
    flex: 1;
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

  .history-grid {
    column-count: 4;
    column-gap: 1rem;
  }

  @media (max-width: 1200px) {
    .history-grid {
      column-count: 3;
    }
  }

  @media (max-width: 900px) {
    .history-grid {
      column-count: 2;
    }
  }

  @media (max-width: 600px) {
    .history-grid {
      column-count: 1;
    }
  }

  .history-card {
    background: var(--bg-secondary);
    border-radius: 8px;
    border: 1px solid var(--border-color);
    overflow: hidden;
    transition: all 0.2s;
    break-inside: avoid;
    margin-bottom: 1rem;
  }

  .history-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
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
    min-height: 300px;
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

  .poster-container {
    position: relative;
    width: 100%;
    padding-bottom: 150%; /* 2:3 aspect ratio for movie posters */
    background: rgba(0, 0, 0, 0.05);
  }

  .poster-image {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .type-badge {
    position: absolute;
    top: 0.5rem;
    left: 0.5rem;
    background: rgba(0, 0, 0, 0.8);
    color: white;
    padding: 0.25rem 0.5rem;
    border-radius: 0.25rem;
    font-size: 0.75rem;
    font-weight: 600;
    backdrop-filter: blur(4px);
  }

  .card-content {
    padding: 0.75rem;
  }

  .item-header {
    margin-bottom: 0.5rem;
  }

  .item-info {
    flex: 1;
    min-width: 0;
  }

  .item-title {
    font-weight: 600;
    margin-bottom: 0.25rem;
    overflow: hidden;
    text-overflow: ellipsis;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    line-height: 1.3;
  }

  .item-year {
    color: var(--text-muted);
    font-weight: normal;
    font-size: 0.875rem;
  }

  .episode-info {
    color: var(--text-muted);
    font-size: 0.8125rem;
    margin-top: 0.25rem;
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
  }

  .season-info {
    font-weight: 600;
    color: var(--text-color);
    font-size: 0.8125rem;
  }

  .episode-count {
    color: var(--link-color);
    font-weight: 500;
    font-size: 0.75rem;
  }

  .item-time {
    font-size: 0.75rem;
    color: var(--text-muted);
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

  .tmdb-credit {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    justify-content: center;
    margin-top: 2rem;
    padding-top: 1rem;
    border-top: 1px solid var(--border-color, #e5e5e5);
    font-size: 0.75rem;
    opacity: 0.6;
  }

  .tmdb-logo {
    height: 12px;
    width: auto;
  }

  @media (max-width: 768px) {
    .stats-header {
      flex-direction: column;
    }

    .stat-card {
      min-width: unset;
    }
  }

  @media (prefers-color-scheme: dark) {
    .stat-card {
      background: rgba(255, 255, 255, 0.03);
      border-color: rgba(255, 255, 255, 0.1);
    }

    .data-source {
      background: rgba(255, 255, 255, 0.03);
      border-color: rgba(255, 255, 255, 0.1);
    }

    .history-card {
      background: rgba(255, 255, 255, 0.03);
      border-color: rgba(255, 255, 255, 0.1);
    }

    .history-card:hover {
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
    }

    .more-card {
      background: rgba(255, 255, 255, 0.03);
      border-color: rgba(255, 255, 255, 0.1);
    }

    .more-card:hover {
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
    }

    .poster-container {
      background: rgba(255, 255, 255, 0.02);
    }
  }
</style>
