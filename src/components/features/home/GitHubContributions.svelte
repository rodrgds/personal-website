<script lang="ts">
  import { actions } from "astro:actions";
  import { onMount } from "svelte";

  type ActivitySource =
    | "github"
    | "hevy"
    | "leetcode"
    | "steps"
    | "sleep"
    | "music"
    | "tv"
    | "posts";
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
    "tv",
    "posts",
  ];
  const levels: ActivityLevel[] = [0, 1, 2, 3, 4];
  const levelGlyphs = ["·", "░", "▒", "▓", "█"];
  const levelAlpha = [0.6, 0.45, 0.65, 0.85, 1];
  const ROWS = 7;
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
  const sourceLabels = {
    github: "GitHub",
    hevy: "Hevy",
    leetcode: "LeetCode",
    steps: "Phone",
    sleep: "Health Connect",
    music: "Last.fm",
    tv: "WeTrakr",
    posts: "OpenPost",
  } satisfies Record<ActivitySource, string>;
  const selectLabels = {
    github: "Code",
    hevy: "Workouts",
    leetcode: "Problems",
    steps: "Steps",
    sleep: "Sleep",
    music: "Music",
    tv: "TV",
    posts: "Posts",
  } satisfies Record<ActivitySource, string>;
  const sourceUnits = {
    github: "contributions",
    hevy: "minutes",
    leetcode: "submissions",
    steps: "steps",
    sleep: "minutes",
    music: "scrobbles",
    tv: "films and episodes",
    posts: "posts",
  } satisfies Record<ActivitySource, string>;
  const sourceLinks = {
    github: `https://github.com/${username}`,
    hevy: null,
    leetcode: `https://leetcode.com/u/${username}`,
    steps: null,
    sleep: null,
    music: "https://url.rgo.pt/music",
    tv: "https://url.rgo.pt/movies",
    posts: null,
  } as const satisfies Record<ActivitySource, string | null>;

  let activeSource = $state<ActivitySource>("github");
  // Raw: the payload holds ~2000 days that are only ever read, never mutated.
  let activity = $state.raw<Record<ActivitySource, ActivityData | null>>({
    github: null,
    hevy: null,
    leetcode: null,
    steps: null,
    sleep: null,
    music: null,
    tv: null,
    posts: null,
  });
  let loading = $state(true);
  let loadingSource = $state<ActivitySource | null>(null);
  let error = $state<string | null>(null);
  let scrollEl = $state<HTMLDivElement>();
  let canvasEl = $state<HTMLCanvasElement>();
  let graphEl = $state<HTMLDivElement>();
  let pitch = $state(13);
  let themeTick = $state(0);
  let hover = $state<{
    col: number;
    row: number;
    text: string;
    x: number;
    y: number;
  } | null>(null);

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

  /**
   * An empty year of days up to this week, oldest first like the data: the
   * shape the graph keeps while a source loads, so nothing below it moves.
   */
  function emptyYear(): ActivityWeek[] {
    const today = new Date();
    const pad = (value: number): string => String(value).padStart(2, "0");
    const weeks: ActivityWeek[] = [];
    for (let week = 52; week >= 0; week--) {
      const days: ActivityDay[] = [];
      for (let weekday = 0; weekday < 7; weekday++) {
        const date = new Date(today);
        date.setDate(today.getDate() - today.getDay() - week * 7 + weekday);
        days.push({
          date: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
          count: 0,
          level: 0,
        });
      }
      weeks.push({ days });
    }
    return weeks;
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

      activity = { ...activity, [source]: result.data };
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
    if (source === "tv")
      return `${total.toLocaleString()} films and episodes`;
    if (source === "posts") return `${total.toLocaleString()} posts`;
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

  function readColor(name: string, fallback: string): string {
    const value = getComputedStyle(document.documentElement)
      .getPropertyValue(name)
      .trim();
    return value || fallback;
  }

  function drawHeatmap(
    canvas: HTMLCanvasElement,
    weeks: ActivityWeek[],
    step: number,
  ): void {
    const gap = step >= 13 ? 3 : 2;
    const size = step - gap;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cssWidth = Math.max(1, weeks.length * step - gap);
    const cssHeight = ROWS * step - gap;
    canvas.width = Math.round(cssWidth * dpr);
    canvas.height = Math.round(cssHeight * dpr);
    canvas.style.width = `${cssWidth}px`;
    canvas.style.height = `${cssHeight}px`;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssWidth, cssHeight);

    const green = readColor("--flexoki-green", "#66800b");
    const gray = readColor("--gray-color", "#878580");
    const family = readColor("--font-family", "monospace");
    const fontSize = size + 1;
    ctx.font = `${fontSize}px ${family}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    // Shade glyphs are taller than wide; squash them into square cells.
    const glyphWidth = ctx.measureText("█").width || fontSize * 0.6;
    const scaleX = size / glyphWidth;
    const scaleY = 0.85;

    weeks.forEach((week, col) => {
      week.days.forEach((day, row) => {
        ctx.save();
        ctx.translate(col * step + size / 2, row * step + size / 2);
        ctx.scale(scaleX, scaleY);
        ctx.globalAlpha = levelAlpha[day.level];
        ctx.fillStyle = day.level === 0 ? gray : green;
        ctx.fillText(levelGlyphs[day.level], 0, 0);
        ctx.restore();
      });
    });
  }

  function onPointer(event: PointerEvent): void {
    const canvas = canvasEl;
    const graph = graphEl;
    if (!canvas || !graph || pending) return;
    const rect = canvas.getBoundingClientRect();
    const col = Math.floor((event.clientX - rect.left) / pitch);
    const row = Math.floor((event.clientY - rect.top) / pitch);
    const day = visibleWeeks[col]?.days[row];
    if (!day || row < 0 || col < 0) {
      hover = null;
      return;
    }
    if (hover && hover.col === col && hover.row === row) return;
    const graphRect = graph.getBoundingClientRect();
    hover = {
      col,
      row,
      text: formatDay(day, activeSource),
      x: rect.left - graphRect.left + col * pitch + (pitch - 3) / 2,
      y: rect.top - graphRect.top + row * pitch,
    };
  }

  onMount(() => {
    const interval = window.setInterval(
      () => void loadSource(activeSource, true),
      1000 * 60 * 60,
    );

    const bumpTheme = () => {
      themeTick += 1;
    };
    const observer = new MutationObserver(bumpTheme);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    media.addEventListener("change", bumpTheme);
    // The mono face may finish loading after the first draw.
    void document.fonts?.ready.then(bumpTheme);

    return () => {
      window.clearInterval(interval);
      observer.disconnect();
      media.removeEventListener("change", bumpTheme);
    };
  });

  // Cell pitch follows the scroller width: tighter cells on narrow screens.
  $effect(() => {
    const scroller = scrollEl;
    if (!scroller) return;
    const measure = () => {
      pitch = scroller.clientWidth < 600 ? 11 : 13;
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(scroller);
    return () => observer.disconnect();
  });

  $effect(() => {
    void themeTick;
    if (canvasEl) drawHeatmap(canvasEl, shownWeeks, pitch);
  });

  // New data or source: show the most recent week (the first column).
  $effect(() => {
    void shownWeeks;
    if (scrollEl) scrollEl.scrollLeft = 0;
    hover = null;
  });

  $effect(() => {
    void loadSource(activeSource);
  });

  let visibleWeeks = $derived(
    filterFutureDays(activity[activeSource]?.contributions ?? []).reverse(),
  );
  let visibleActivity = $derived(activity[activeSource]);
  // Loading, failed or empty: the graph keeps its size with blank days.
  let pending = $derived(loading || error !== null || !visibleActivity);
  const blankYear = filterFutureDays(emptyYear()).reverse();
  let shownWeeks = $derived(pending ? blankYear : visibleWeeks);
  let monthLabels = $derived(getMonthLabels(shownWeeks));
  let yearLabels = $derived(getYearLabels(shownWeeks));
</script>

<div class="activity-graph" bind:this={graphEl}>
  <div class="activity-header">
    <div class="activity-summary">
      <div class="sources" role="group" aria-label="Activity">
        {#each activitySources as source (source)}
          <button
            type="button"
            data-cuelume-select
            aria-pressed={activeSource === source}
            onclick={() => (activeSource = source)}
            >{selectLabels[source].toLowerCase()}</button
          >
        {/each}
      </div>
      {#if error}
        <span class="activity-count" role="alert"
          ><span class="error-mark">error:</span>
          {sourceLabels[activeSource].toLowerCase()} activity did not load.
          <button
            onclick={() => loadSource(activeSource, true)}
            class="retry-btn"
            data-cuelume-tap>[retry]</button
          ></span
        >
      {:else if pending}
        <span class="activity-count pending" aria-live="polite"
          ><span class="ascii-spinner" aria-hidden="true">⠋</span> reading {sourceLabels[
            activeSource
          ].toLowerCase()}</span
        >
      {:else if visibleActivity}
        <span class="activity-count"
          >{formatTotal(activeSource, visibleActivity.total)} since {visibleActivity.startYear}</span
        >
      {/if}
    </div>
    <div class="header-right">
      <div class="legend" aria-label="Activity intensity: less to more">
        <span class="legend-label">less</span>
        {#each levels as level (level)}
          <span class="legend-day" data-level={level} aria-hidden="true"
          ></span>
        {/each}
        <span class="legend-label">more</span>
      </div>
      <a
        href={`/activity?activity=${activeSource}`}
        class="explorer-link"
        title="Explore the whole history">[explore]</a
      >
      {#if sourceLinks[activeSource]}
        <a
          href={sourceLinks[activeSource]}
          target="_blank"
          rel="noopener noreferrer"
          class="source-link">[{sourceLabels[activeSource].toLowerCase()}]</a
        >
      {/if}
    </div>
  </div>

    <div class="activity-scroll-container" bind:this={scrollEl}>
      <div class="activity-wrapper" style="--pitch: {pitch}px">
        <div class="day-labels" aria-hidden="true">
          <span></span><span>Mon</span><span></span><span>Wed</span><span
          ></span><span>Fri</span><span></span>
        </div>
        <canvas
          bind:this={canvasEl}
          class="activity-canvas"
          class:pending
          role="img"
          aria-label={`${sourceLabels[activeSource]} activity calendar: ${visibleActivity ? formatTotal(activeSource, visibleActivity.total) : "no data"}`}
          onpointermove={onPointer}
          onpointerdown={onPointer}
          onpointerleave={() => (hover = null)}
        ></canvas>
        {#if hover}
          <div
            class="cell-outline"
            style="left: {hover.col * pitch}px; top: {hover.row *
              pitch}px; width: {pitch - (pitch >= 13 ? 3 : 2)}px; height: {pitch -
              (pitch >= 13 ? 3 : 2)}px"
            aria-hidden="true"
          ></div>
        {/if}
        <div class="month-labels">
          {#each monthLabels as label (`${label.month}-${label.index}`)}
            <span
              class="month-label"
              style="left: calc(var(--pitch) * {label.index})"
              >{label.month}</span
            >
          {/each}
        </div>
        <div class="year-labels">
          {#each yearLabels as label (label.year)}
            <span
              class="year-label"
              style="left: calc(var(--pitch) * {label.startWeek})"
              >{label.year}</span
            >
          {/each}
        </div>
      </div>
    </div>
  {#if hover}
    <div
      class="tip"
      style="left: {Math.min(
        Math.max(hover.x, 110),
        Math.max(110, (graphEl?.clientWidth ?? 0) - 110),
      )}px; top: {hover.y}px"
      role="status"
    >
      {hover.text}
    </div>
  {/if}
</div>

<style>
  .activity-graph {
    position: relative;
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

  /* Sources as terminal buttons, like the CV filters; the one shown is filled. */
  .sources {
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem;
    align-items: center;
  }

  .sources button {
    padding: 0.05rem 0.45rem;
    border: 1px solid var(--border-color);
    border-radius: 0;
    background: transparent;
    color: var(--text-color);
    font: inherit;
    font-size: 0.78rem;
    cursor: pointer;
  }

  .sources button:hover {
    border-color: var(--tc-live);
    color: var(--tc-live);
  }

  .sources button[aria-pressed="true"] {
    border-color: var(--tc-live);
    background: var(--tc-live);
    color: var(--background-color);
  }

  .sources button:focus-visible,
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
    border-radius: 0;
  }

  .legend-label {
    margin: 0 0.25rem;
  }

  /* Plain terminal links; the global hover inverts them. */
  .source-link,
  .explorer-link {
    color: var(--link-color);
    font-size: 0.75rem;
    text-decoration: none;
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

  /* Legend glyphs mirror the canvas: shade glyphs squashed into square cells. */
  .legend-day {
    display: grid;
    place-items: center;
    overflow: hidden;
    font-family: var(--font-family);
    font-size: 11px;
    line-height: 1;
  }

  .legend-day::before {
    display: block;
    content: "·";
    color: var(--gray-color);
    opacity: 0.6;
    transform: scale(1.7, 0.85);
  }

  .legend-day[data-level="1"]::before {
    content: "░";
    color: var(--flexoki-green);
    opacity: 0.45;
  }

  .legend-day[data-level="2"]::before {
    content: "▒";
    color: var(--flexoki-green);
    opacity: 0.65;
  }

  .legend-day[data-level="3"]::before {
    content: "▓";
    color: var(--flexoki-green);
    opacity: 0.85;
  }

  .legend-day[data-level="4"]::before {
    content: "█";
    color: var(--flexoki-green);
    opacity: 1;
  }

  .activity-canvas {
    display: block;
    cursor: crosshair;
    touch-action: pan-x pan-y;
  }

  /* Blank days while a source loads: the same size, gently breathing. */
  .activity-canvas.pending {
    cursor: progress;
    animation: graph-pending 1.6s steps(6) infinite alternate;
  }

  @keyframes graph-pending {
    from {
      opacity: 0.35;
    }

    to {
      opacity: 0.8;
    }
  }

  .activity-count.pending {
    color: var(--gray-color);
    cursor: progress;
  }

  @media (prefers-reduced-motion: reduce) {
    .activity-canvas.pending {
      animation: none;
      opacity: 0.5;
    }
  }

  .cell-outline {
    position: absolute;
    z-index: 1;
    outline: 2px solid var(--link-color);
    outline-offset: 1px;
    pointer-events: none;
  }

  .tip {
    position: absolute;
    z-index: 5;
    padding: 0.2rem 0.45rem;
    border: 1px solid var(--border-color);
    background: var(--background-color);
    color: var(--text-color);
    font-size: 0.7rem;
    white-space: nowrap;
    pointer-events: none;
    transform: translate(-50%, calc(-100% - 6px));
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

  .error-mark {
    color: var(--error);
  }

  .retry-btn {
    padding: 0;
    border: 0;
    background: none;
    color: var(--link-color);
    font: inherit;
    cursor: pointer;
  }

  .retry-btn:hover {
    background: var(--link-color);
    color: var(--background-color);
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
  }
</style>
