<script lang="ts">
  import { actions } from "astro:actions";
  import { onMount } from "svelte";

  type ActivitySource =
    | "github"
    | "hevy"
    | "leetcode"
    | "steps"
    | "sleep"
    | "music";
  type ActivityLevel = 0 | 1 | 2 | 3 | 4;

  interface ActivityDay {
    date: string;
    count: number;
    level: ActivityLevel;
  }

  interface ActivityWeek {
    days: ActivityDay[];
  }

  interface ActivityData {
    contributions: ActivityWeek[];
    total: number;
    startYear: number;
  }

  const username = "rodrgds";
  const activitySources: ActivitySource[] = [
    "github",
    "hevy",
    "leetcode",
    "steps",
    "sleep",
    "music",
  ];
  const colorScale = [
    "var(--contrib-level-0)",
    "var(--contrib-level-1)",
    "var(--contrib-level-2)",
    "var(--contrib-level-3)",
    "var(--contrib-level-4)",
  ];
  const monthNames = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const sourceLabels: Record<ActivitySource, string> = {
    github: "GitHub",
    hevy: "Hevy",
    leetcode: "LeetCode",
    steps: "Phone",
    sleep: "Health Connect",
    music: "Last.fm",
  };
  const selectLabels: Record<ActivitySource, string> = {
    github: "Code",
    hevy: "Workouts",
    leetcode: "Problems",
    steps: "Steps",
    sleep: "Sleep",
    music: "Music",
  };
  const comingSoonSources = ["Posts", "TV"];
  const sourceUnits: Record<ActivitySource, string> = {
    github: "contributions",
    hevy: "minutes",
    leetcode: "submissions",
    steps: "steps",
    sleep: "minutes",
    music: "scrobbles",
  };
  const sourceLinks: Record<ActivitySource, string | null> = {
    github: `https://github.com/${username}`,
    hevy: null,
    leetcode: `https://leetcode.com/u/${username}`,
    steps: null,
    sleep: null,
    music: "https://url.rgo.pt/music",
  };

  let activeSource = $state<ActivitySource>("github");
  let activity = $state<Record<ActivitySource, ActivityData | null>>({
    github: null,
    hevy: null,
    leetcode: null,
    steps: null,
    sleep: null,
    music: null,
  });
  let loading = $state(true);
  let loadingSource = $state<ActivitySource | null>(null);
  let error = $state<string | null>(null);

  function getMonthLabels(
    weeks: ActivityWeek[],
  ): { month: string; index: number }[] {
    const labels: { month: string; index: number }[] = [];
    let lastMonth = -1;
    const now = new Date();
    const isEarlyInMonth = now.getDate() <= 14;

    weeks.forEach((week, index) => {
      const firstDay = week.days[0];
      if (!firstDay) return;

      const date = new Date(`${firstDay.date}T00:00:00`);
      const month = date.getMonth();
      if (month !== lastMonth) {
        if (
          isEarlyInMonth &&
          month === now.getMonth() &&
          date.getFullYear() === now.getFullYear()
        ) {
          return;
        }
        labels.push({ month: monthNames[month], index });
        lastMonth = month;
      }
    });

    return labels;
  }

  function getYearLabels(
    weeks: ActivityWeek[],
  ): { year: string; startWeek: number }[] {
    const labels: { year: string; startWeek: number }[] = [];
    let lastYear = -1;
    const now = new Date();
    const isEarlyInYear = now.getMonth() === 0 && now.getDate() <= 14;

    weeks.forEach((week, index) => {
      const firstDay = week.days[0];
      if (!firstDay) return;

      const year = new Date(`${firstDay.date}T00:00:00`).getFullYear();
      if (year === lastYear || (isEarlyInYear && year === now.getFullYear())) {
        return;
      }

      labels.push({ year: String(year), startWeek: index });
      lastYear = year;
    });

    return labels;
  }

  function filterFutureDays(weeks: ActivityWeek[]): ActivityWeek[] {
    const now = Date.now();
    return weeks
      .map((week) => ({
        days: week.days.filter(
          (day) => new Date(`${day.date}T00:00:00`).getTime() <= now,
        ),
      }))
      .filter((week) => week.days.length > 0);
  }

  async function loadSource(
    source: ActivitySource,
    force = false,
  ): Promise<void> {
    if (activity[source] && !force) {
      if (activeSource === source) loading = false;
      return;
    }

    loadingSource = source;
    loading = true;
    error = null;

    try {
      const result = await actions.getActivityData({
        source,
        forceRefresh: force,
      });

      if (result.error || !result.data) {
        throw new Error(
          result.error?.message ||
            `Failed to load ${sourceLabels[source]} activity`,
        );
      }

      activity[source] = result.data;
    } catch (caught) {
      console.error(`Error fetching ${sourceLabels[source]} activity:`, caught);
      if (activeSource === source) {
        error =
          caught instanceof Error
            ? caught.message
            : `Failed to load ${sourceLabels[source]} activity`;
      }
    } finally {
      if (activeSource === source && loadingSource === source) {
        loading = false;
        loadingSource = null;
      }
    }
  }

  function formatTotal(source: ActivitySource, total: number): string {
    if (source === "hevy") return `${total.toLocaleString()} minutes trained`;
    if (source === "leetcode")
      return `${total.toLocaleString()} problems solved`;
    if (source === "steps") return `${total.toLocaleString()} steps`;
    if (source === "sleep") return `${formatDuration(total)} slept`;
    if (source === "music") return `${total.toLocaleString()} scrobbles`;
    return `${total.toLocaleString()} contributions`;
  }

  function formatDuration(totalMinutes: number): string {
    const rounded = Math.max(0, Math.round(totalMinutes));
    const hours = Math.floor(rounded / 60);
    const minutes = rounded % 60;
    if (hours === 0) return `${minutes}m`;
    if (minutes === 0) return `${hours.toLocaleString()}h`;
    return `${hours.toLocaleString()}h ${minutes}m`;
  }

  function formatDay(day: ActivityDay, source: ActivitySource): string {
    if (source === "sleep")
      return `${formatDuration(day.count)} slept on ${day.date}`;
    return `${day.count.toLocaleString()} ${sourceUnits[source]} on ${day.date}`;
  }

  onMount(() => {
    const interval = window.setInterval(
      () => void loadSource(activeSource, true),
      1000 * 60 * 60,
    );
    return () => window.clearInterval(interval);
  });

  $effect(() => {
    void loadSource(activeSource);
  });

  let visibleWeeks = $derived(
    filterFutureDays(activity[activeSource]?.contributions ?? []).reverse(),
  );
  let visibleActivity = $derived(activity[activeSource]);
  let monthLabels = $derived(getMonthLabels(visibleWeeks));
  let yearLabels = $derived(getYearLabels(visibleWeeks));
</script>

<div class="activity-graph">
  <div class="activity-header">
    <div class="activity-summary">
      <label for="activity-source">Activity</label>
      <select id="activity-source" bind:value={activeSource}>
        {#each activitySources as source (source)}
          <option value={source}>{selectLabels[source]}</option>
        {/each}
        <optgroup label="Coming soon">
          {#each comingSoonSources as label (label)}
            <option disabled>{label}</option>
          {/each}
        </optgroup>
      </select>
      {#if visibleActivity}
        <span class="activity-count"
          >{formatTotal(activeSource, visibleActivity.total)} since {visibleActivity.startYear}</span
        >
      {/if}
    </div>
    <div class="header-right">
      <div class="legend" aria-label="Activity intensity: less to more">
        <span class="legend-label">Less</span>
        {#each colorScale as color, index (index)}
          <span
            class="legend-day"
            style="background-color: {color}"
            aria-hidden="true"
          ></span>
        {/each}
        <span class="legend-label">More</span>
      </div>
      <a
        href={`/activity?activity=${activeSource}`}
        class="explorer-link"
        aria-label="Explore activity history"
        title="Explore activity history"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm7.4-2.1 1.2 1-.1 1.1-1.5 2.6-1 .5-1.5-.6c-.5.4-1 .7-1.6.9l-.3 1.6-.9.6h-3l-.9-.6-.3-1.6c-.6-.2-1.1-.5-1.6-.9l-1.5.6-1-.5-1.5-2.6-.1-1.1 1.2-1a8 8 0 0 1 0-1.8l-1.2-1 .1-1.1L5.4 6l1-.5 1.5.6c.5-.4 1-.7 1.6-.9l.3-1.6.9-.6h3l.9.6.3 1.6c.6.2 1.1.5 1.6.9l1.5-.6 1 .5 1.5 2.6.1 1.1-1.2 1a8 8 0 0 1 0 1.8Z"
          ></path>
        </svg>
      </a>
      {#if sourceLinks[activeSource]}
        <a
          href={sourceLinks[activeSource]}
          target="_blank"
          rel="noopener noreferrer"
          class="source-link"
        >
          View on {sourceLabels[activeSource]} →
        </a>
      {/if}
    </div>
  </div>

  {#if loading}
    <div class="loading" aria-live="polite">
      <div class="spinner"></div>
      Loading {sourceLabels[activeSource]} activity...
    </div>
  {:else if error}
    <div class="error" role="alert">
      <p>{error}</p>
      <button onclick={() => loadSource(activeSource, true)} class="retry-btn"
        >Retry</button
      >
    </div>
  {:else}
    <div class="activity-scroll-container">
      <div class="activity-wrapper">
        <div class="day-labels" aria-hidden="true">
          <span></span><span>Mon</span><span></span><span>Wed</span><span
          ></span><span>Fri</span><span></span>
        </div>
        <div
          class="activity-grid"
          aria-label={`${sourceLabels[activeSource]} activity calendar`}
        >
          {#each visibleWeeks as week, index (week.days[0]?.date ?? index)}
            <div class="week">
              {#each week.days as day (day.date)}
                <div
                  class="day"
                  class:day-empty={day.level === 0}
                  style="background-color: {colorScale[day.level]}"
                  title={formatDay(day, activeSource)}
                  role="img"
                  aria-label={formatDay(day, activeSource)}
                ></div>
              {/each}
            </div>
          {/each}
        </div>
        <div class="month-labels">
          {#each monthLabels as label (`${label.month}-${label.index}`)}
            <span
              class="month-label"
              style="left: calc(var(--contrib-cell-size) * {label.index})"
              >{label.month}</span
            >
          {/each}
        </div>
        <div class="year-labels">
          {#each yearLabels as label (label.year)}
            <span
              class="year-label"
              style="left: calc(var(--contrib-cell-size) * {label.startWeek})"
              >{label.year}</span
            >
          {/each}
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  :global(:root) {
    --contrib-level-0: #f2f0e5;
    --contrib-level-1: #92bfdb;
    --contrib-level-2: #4385be;
    --contrib-level-3: #3171b2;
    --contrib-level-4: #205ea6;
    --contrib-cell-size: 13px;
  }

  @media (prefers-color-scheme: dark) {
    :global(:root:not([data-theme="light"])) {
      --contrib-level-0: #1c1b1a;
      --contrib-level-1: #71320d;
      --contrib-level-2: #9d4310;
      --contrib-level-3: #cb6120;
      --contrib-level-4: #da702c;
    }
  }

  :global(:root[data-theme="dark"]) {
    --contrib-level-0: #1c1b1a;
    --contrib-level-1: #71320d;
    --contrib-level-2: #9d4310;
    --contrib-level-3: #cb6120;
    --contrib-level-4: #da702c;
  }

  .activity-graph {
    margin: 1.5rem 0;
  }

  .activity-header {
    position: relative;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    margin-bottom: 0.75rem;
  }

  .activity-summary,
  .header-right {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.65rem;
  }

  .activity-summary label {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
  }

  select {
    min-height: 2.25rem;
    padding: 0.2rem 1.4rem 0.2rem 0.4rem;
    border: 1px solid var(--border-color);
    border-radius: 0.28rem;
    background: var(--background-color);
    color: var(--text-color);
    font: inherit;
    font-size: 0.8rem;
    cursor: pointer;
  }

  select:hover {
    border-color: var(--link-color);
  }

  select:focus-visible,
  .source-link:focus-visible,
  .explorer-link:focus-visible,
  .retry-btn:focus-visible {
    outline: 2px solid var(--link-color);
    outline-offset: 2px;
  }

  .activity-count {
    color: var(--text-color);
    font-size: 0.875rem;
  }

  .legend {
    display: flex;
    align-items: center;
    gap: 3px;
    color: var(--gray-color);
    font-size: 0.65rem;
  }

  .legend-day {
    width: 10px;
    height: 10px;
    border-radius: 2px;
  }

  .legend-label {
    margin: 0 0.25rem;
  }

  .source-link {
    position: relative;
    color: var(--link-color);
    font-size: 0.75rem;
    text-decoration: none;
  }

  .source-link::before {
    position: absolute;
    right: 0;
    bottom: 0;
    left: 0;
    width: 0;
    height: 1px;
    background: currentColor;
    content: "";
    transition: width 0.25s ease;
  }

  .source-link:hover::before,
  .source-link:focus-visible::before {
    width: 100%;
  }

  .explorer-link {
    display: grid;
    width: 2.25rem;
    height: 2.25rem;
    place-items: center;
    border: 1px solid transparent;
    border-radius: 0.28rem;
    color: var(--gray-color);
  }

  .explorer-link:hover {
    border-color: var(--border-color);
    color: var(--link-color);
  }

  .explorer-link svg {
    width: 1rem;
    height: 1rem;
    fill: none;
    stroke: currentColor;
    stroke-linecap: round;
    stroke-linejoin: round;
    stroke-width: 1.5;
  }

  .activity-scroll-container {
    margin: 0 -0.5rem;
    padding: 0 0.5rem 0.5rem;
    overflow-x: auto;
    overflow-y: hidden;
    scrollbar-color: var(--border-color) transparent;
    scrollbar-width: thin;
  }

  .activity-wrapper {
    position: relative;
    display: flex;
    min-width: max-content;
    flex-direction: column;
  }

  .day-labels {
    position: absolute;
    left: -2.5rem;
    display: flex;
    flex-direction: column;
    gap: 3px;
    padding-top: 2px;
    color: var(--gray-color);
    font-size: 0.65rem;
  }

  .day-labels span {
    height: 10px;
    line-height: 10px;
  }

  .activity-grid {
    display: flex;
    width: fit-content;
    flex-direction: row;
    gap: 3px;
  }

  .week {
    display: flex;
    flex-shrink: 0;
    flex-direction: column;
    gap: 3px;
  }

  .day {
    width: 10px;
    height: 10px;
    border-radius: 2px;
    cursor: pointer;
    transition:
      transform 0.1s,
      outline 0.1s;
  }

  .day:hover {
    position: relative;
    z-index: 1;
    outline: 2px solid var(--link-color);
    outline-offset: 1px;
    transform: scale(1.2);
  }

  .month-labels,
  .year-labels {
    position: relative;
    width: fit-content;
    color: var(--gray-color);
    font-size: 0.65rem;
  }

  .month-labels {
    height: 1rem;
    margin-top: 0.25rem;
  }

  .year-labels {
    height: 1.25rem;
    margin-top: 0.1rem;
    padding-top: 0.25rem;
    border-top: 1px solid var(--border-color);
  }

  .month-label,
  .year-label {
    position: absolute;
    white-space: nowrap;
  }

  .year-label {
    font-weight: 500;
  }

  .loading,
  .error {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    padding: 1rem;
    color: var(--gray-color);
    font-size: 0.875rem;
  }

  .error {
    flex-direction: column;
    gap: 0.5rem;
  }

  .error p {
    margin: 0;
  }

  .spinner {
    width: 16px;
    height: 16px;
    border: 2px solid var(--border-color);
    border-top-color: var(--link-color);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  .retry-btn {
    padding: 0.4rem 0.8rem;
    border: none;
    border-radius: 0.25rem;
    background: var(--link-color);
    color: var(--background-color);
    font: inherit;
    font-size: 0.75rem;
    cursor: pointer;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  @media (max-width: 768px) {
    .activity-header {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: start;
    }

    .activity-summary {
      min-width: 0;
    }

    .activity-summary select {
      max-width: 100%;
    }

    .header-right {
      flex-wrap: nowrap;
      gap: 0.35rem;
    }

    .legend {
      display: none;
    }

    .day-labels {
      display: none;
    }

    .activity-scroll-container {
      margin-right: -1rem;
      margin-left: -1rem;
      padding-right: 1rem;
      padding-left: 1rem;
    }

    .activity-grid {
      gap: 2px;
    }

    .week {
      gap: 2px;
    }

    .day {
      width: 9px;
      height: 9px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .day,
    .source-link::before {
      transition: none;
    }

    .spinner {
      animation: none;
    }
  }
</style>
