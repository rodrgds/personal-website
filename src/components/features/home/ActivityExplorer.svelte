<script lang="ts">
  import { actions } from "astro:actions";
  import { onMount } from "svelte";

  import {
    DEFAULT_GRAIN,
    GRAIN_OPTIONS,
    RANGE_OPTIONS,
    aggregateActivity,
    canMoveBackward,
    chooseChartKind,
    flattenActivityWeeks,
    formatPeriodLabel,
    getPeriod,
    isLatestPeriod,
    previousComparablePeriod,
    selectDays,
    shiftAnchor,
    todayInTimeZone,
    type ActivityBucket,
    type ActivityDay,
    type ActivityWeek,
    type TimeGrain,
    type TimeRange,
  } from "./activity-periods";

  type ActivitySource =
    | "github"
    | "hevy"
    | "leetcode"
    | "steps"
    | "sleep"
    | "music";

  interface ActivityData {
    contributions: ActivityWeek[];
    total: number;
    startYear: number;
  }

  interface PlotPoint {
    bucket: ActivityBucket;
    x: number;
    y: number;
    xPercent: number;
    yPercent: number;
  }

  const username = "rodrgds";
  const today = todayInTimeZone();
  const activitySources: ActivitySource[] = [
    "github",
    "hevy",
    "leetcode",
    "steps",
    "sleep",
    "music",
  ];
  const colorScale = [
    "var(--activity-level-0)",
    "var(--activity-level-1)",
    "var(--activity-level-2)",
    "var(--activity-level-3)",
    "var(--activity-level-4)",
  ];
  const sourceLabels = {
    github: "GitHub",
    hevy: "Hevy",
    leetcode: "LeetCode",
    steps: "Phone",
    sleep: "Health Connect",
    music: "Last.fm",
  } satisfies Record<ActivitySource, string>;
  const selectLabels = {
    github: "Code",
    hevy: "Workouts",
    leetcode: "Problems",
    steps: "Steps",
    sleep: "Sleep",
    music: "Music",
  } satisfies Record<ActivitySource, string>;
  const sourceUnits = {
    github: "contributions",
    hevy: "minutes",
    leetcode: "submissions",
    steps: "steps",
    sleep: "minutes",
    music: "scrobbles",
  } satisfies Record<ActivitySource, string>;
  const sourceLinks = {
    github: `https://github.com/${username}`,
    hevy: null,
    leetcode: `https://leetcode.com/u/${username}`,
    steps: null,
    sleep: null,
    music: "https://url.rgo.pt/music",
  } as const satisfies Record<ActivitySource, string | null>;
  const rangeNouns = {
    week: "week",
    month: "month",
    quarter: "quarter",
    year: "year",
  } satisfies Record<Exclude<TimeRange, "all">, string>;

  let activeSource = $state<ActivitySource>("github");
  let activeRange = $state<TimeRange>("year");
  let activeGrain = $state<TimeGrain>("month");
  let anchorDate = $state(today);
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

  function isActivitySource(value: string | null): value is ActivitySource {
    // SAFETY: activitySources enumerates the ActivitySource union exactly.
    return value !== null && activitySources.includes(value as ActivitySource);
  }

  function isTimeRange(value: string | null): value is TimeRange {
    return (
      value !== null && RANGE_OPTIONS.some((option) => option.value === value)
    );
  }

  function isTimeGrain(value: string | null): value is TimeGrain {
    return (
      value !== null &&
      ["day", "week", "month", "quarter", "year"].includes(value)
    );
  }

  function isDate(value: string | null): value is string {
    return (
      value !== null &&
      /^\d{4}-\d{2}-\d{2}$/.test(value) &&
      !Number.isNaN(Date.parse(`${value}T00:00:00Z`))
    );
  }

  function updateUrl(): void {
    if (!("window" in globalThis)) return;
    const url = new URL(window.location.href);
    url.searchParams.set("activity", activeSource);
    url.searchParams.set("range", activeRange);
    url.searchParams.set("group", activeGrain);
    if (
      activeRange === "all" ||
      isLatestPeriod(activeRange, anchorDate, today)
    ) {
      url.searchParams.delete("period");
    } else {
      url.searchParams.set("period", anchorDate);
    }
    window.history.replaceState(window.history.state, "", url);
  }

  function updateUrlAfterStateChange(): void {
    queueMicrotask(updateUrl);
  }

  function changeSource(event: Event): void {
    if (!(event.currentTarget instanceof HTMLSelectElement)) return;
    const value = event.currentTarget.value;
    if (!isActivitySource(value)) return;
    activeSource = value;
    anchorDate = today;
    updateUrlAfterStateChange();
  }

  function changeRange(event: Event): void {
    if (!(event.currentTarget instanceof HTMLSelectElement)) return;
    const value = event.currentTarget.value;
    if (!isTimeRange(value)) return;
    activeRange = value;
    activeGrain = DEFAULT_GRAIN[value];
    anchorDate = today;
    updateUrlAfterStateChange();
  }

  function changeGrain(event: Event): void {
    if (!(event.currentTarget instanceof HTMLSelectElement)) return;
    const value = event.currentTarget.value;
    if (!isTimeGrain(value)) return;
    activeGrain = value;
    updateUrlAfterStateChange();
  }

  function movePeriod(direction: -1 | 1): void {
    if (activeRange === "all") return;
    anchorDate = shiftAnchor(activeRange, anchorDate, direction);
    updateUrlAfterStateChange();
  }

  function goToLatest(): void {
    anchorDate = today;
    updateUrlAfterStateChange();
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

  function formatNumber(value: number): string {
    return value.toLocaleString(undefined, { maximumFractionDigits: 0 });
  }

  function formatCompactNumber(value: number): string {
    return new Intl.NumberFormat(undefined, {
      notation: value >= 10_000 ? "compact" : "standard",
      maximumFractionDigits: 1,
    }).format(value);
  }

  function formatDuration(value: number): string {
    const rounded = Math.max(0, Math.round(value));
    const hours = Math.floor(rounded / 60);
    const minutes = rounded % 60;
    if (hours === 0) return `${minutes}m`;
    if (minutes === 0) return `${formatNumber(hours)}h`;
    return `${formatNumber(hours)}h ${minutes}m`;
  }

  function formatCompactDuration(value: number): string {
    if (value < 60) return `${Math.round(value)}m`;
    return `${(value / 60).toLocaleString(undefined, {
      maximumFractionDigits: 1,
    })}h`;
  }

  function formatValue(source: ActivitySource, value: number): string {
    if (source === "sleep") return formatDuration(value);
    return `${formatNumber(value)} ${sourceUnits[source]}`;
  }

  function formatCompactValue(source: ActivitySource, value: number): string {
    if (source === "sleep") return formatCompactDuration(value);
    return formatCompactNumber(value);
  }

  function formatPeriodTotal(source: ActivitySource, value: number): string {
    if (source === "hevy") return `${formatNumber(value)} minutes trained`;
    if (source === "leetcode") return `${formatNumber(value)} submissions`;
    if (source === "steps") return `${formatNumber(value)} steps`;
    if (source === "sleep") return `${formatDuration(value)} slept`;
    if (source === "music") return `${formatNumber(value)} scrobbles`;
    return `${formatNumber(value)} contributions`;
  }

  function formatLifetime(
    source: ActivitySource,
    value: number,
    startYear: number,
  ): string {
    if (source === "hevy")
      return `${formatNumber(value)} minutes trained since ${startYear}`;
    if (source === "leetcode")
      return `${formatNumber(value)} problems solved since ${startYear}`;
    if (source === "steps")
      return `${formatNumber(value)} steps stored since ${startYear}`;
    if (source === "sleep")
      return `${formatDuration(value)} slept since ${startYear}`;
    if (source === "music")
      return `${formatNumber(value)} scrobbles since ${startYear}`;
    return `${formatNumber(value)} contributions since ${startYear}`;
  }

  function formatComparison(
    current: number,
    previous: number,
    range: TimeRange,
  ): string {
    if (range === "all") return "";
    const noun = rangeNouns[range];
    if (current === 0 && previous === 0)
      return `No change from the previous ${noun}`;
    if (previous === 0) return `New activity vs the previous ${noun}`;
    const percentage = Math.round(((current - previous) / previous) * 100);
    if (percentage === 0) return `Level with the previous ${noun}`;
    return `${Math.abs(percentage)}% ${percentage > 0 ? "more" : "less"} than the previous ${noun}`;
  }

  function relativeLevel(value: number, maximum: number): number {
    if (value <= 0 || maximum <= 0) return 0;
    return Math.min(4, Math.max(1, Math.ceil((value / maximum) * 4)));
  }

  function barHeight(value: number, maximum: number): number {
    if (value <= 0 || maximum <= 0) return 0;
    return Math.max(3, (value / maximum) * 100);
  }

  function plotPoints(buckets: ActivityBucket[], maximum: number): PlotPoint[] {
    return buckets.map((bucket, index) => {
      const progress =
        buckets.length === 1 ? 0.5 : index / (buckets.length - 1);
      const x = 40 + progress * 920;
      const y = maximum > 0 ? 210 - (bucket.value / maximum) * 170 : 210;
      return {
        bucket,
        x,
        y,
        xPercent: x / 10,
        yPercent: (y / 240) * 100,
      };
    });
  }

  function pointLabel(bucket: ActivityBucket): string {
    return `${formatValue(activeSource, bucket.value)}, ${bucket.label}`;
  }

  onMount(() => {
    const params = new URL(window.location.href).searchParams;
    const requestedSource = params.get("activity");
    const requestedRange = params.get("range");
    const requestedGrain = params.get("group");
    const requestedPeriod = params.get("period");

    if (isActivitySource(requestedSource)) activeSource = requestedSource;
    if (isTimeRange(requestedRange)) activeRange = requestedRange;
    const allowedGrains = GRAIN_OPTIONS[activeRange].map(
      (option) => option.value,
    );
    activeGrain =
      isTimeGrain(requestedGrain) && allowedGrains.includes(requestedGrain)
        ? requestedGrain
        : DEFAULT_GRAIN[activeRange];
    if (isDate(requestedPeriod)) anchorDate = requestedPeriod;
    if (requestedSource !== null && !isActivitySource(requestedSource)) {
      queueMicrotask(updateUrl);
    }

    const interval = window.setInterval(
      () => void loadSource(activeSource, true),
      1000 * 60 * 60,
    );
    return () => window.clearInterval(interval);
  });

  $effect(() => {
    void loadSource(activeSource);
  });

  let visibleActivity = $derived(activity[activeSource]);
  let allDays = $derived.by(() =>
    visibleActivity
      ? flattenActivityWeeks(
          visibleActivity.contributions,
          visibleActivity.startYear,
          today,
        )
      : [],
  );
  let earliestDate = $derived(
    allDays.find((day) => day.count > 0)?.date ??
      `${visibleActivity?.startYear ?? new Date().getUTCFullYear()}-01-01`,
  );
  let selectedPeriod = $derived(
    getPeriod(activeRange, anchorDate, earliestDate, today),
  );
  let periodDays = $derived(selectDays(allDays, selectedPeriod));
  let buckets = $derived(
    aggregateActivity(periodDays, activeGrain, activeRange),
  );
  let previousPeriod = $derived(
    previousComparablePeriod(activeRange, selectedPeriod, earliestDate),
  );
  let previousDays = $derived(
    previousPeriod ? selectDays(allDays, previousPeriod) : [],
  );
  let periodTotal = $derived(
    periodDays.reduce((total, day) => total + day.count, 0),
  );
  let previousTotal = $derived(
    previousDays.reduce((total, day) => total + day.count, 0),
  );
  let activeDays = $derived(periodDays.filter((day) => day.count > 0).length);
  let maximumBucketValue = $derived(
    Math.max(0, ...buckets.map((bucket) => bucket.value)),
  );
  let bestBucket = $derived(
    buckets.reduce<ActivityBucket | null>(
      (best, bucket) => (!best || bucket.value > best.value ? bucket : best),
      null,
    ),
  );
  let currentChart = $derived(
    chooseChartKind(activeRange, activeGrain, buckets.length),
  );
  let points = $derived(plotPoints(buckets, maximumBucketValue));
  let linePath = $derived(
    points
      .map((point, index) => `${index === 0 ? "M" : "L"}${point.x},${point.y}`)
      .join(" "),
  );
  let areaPath = $derived(
    points.length > 0
      ? `M${points[0].x},210 ${points.map((point) => `L${point.x},${point.y}`).join(" ")} L${points.at(-1)?.x ?? 960},210 Z`
      : "",
  );
  let calendarOffset = $derived(
    periodDays[0]
      ? (new Date(`${periodDays[0].date}T00:00:00Z`).getUTCDay() + 6) % 7
      : 0,
  );
  let periodLabel = $derived(formatPeriodLabel(activeRange, selectedPeriod));
  let latestPeriod = $derived(isLatestPeriod(activeRange, anchorDate, today));
  let canGoBack = $derived(
    canMoveBackward(activeRange, anchorDate, earliestDate),
  );
  let comparison = $derived(
    previousPeriod
      ? formatComparison(periodTotal, previousTotal, activeRange)
      : "",
  );
  let grainLabel = $derived(
    GRAIN_OPTIONS[activeRange].find((option) => option.value === activeGrain)
      ?.label ?? "Daily",
  );
</script>

<div class="activity-explorer">
  <div class="explorer-toolbar">
    <div class="controls" aria-label="Activity view controls">
      <label class="control control-source">
        <span>Activity</span>
        <select value={activeSource} onchange={changeSource}>
          {#each activitySources as source (source)}
            <option value={source}>{selectLabels[source]}</option>
          {/each}
        </select>
      </label>

      <label class="control">
        <span>Range</span>
        <select value={activeRange} onchange={changeRange}>
          {#each RANGE_OPTIONS as option (option.value)}
            <option value={option.value}>{option.label}</option>
          {/each}
        </select>
      </label>

      <label class="control">
        <span>Group</span>
        <select
          value={activeGrain}
          onchange={changeGrain}
          disabled={GRAIN_OPTIONS[activeRange].length === 1}
        >
          {#each GRAIN_OPTIONS[activeRange] as option (option.value)}
            <option value={option.value}>{option.label}</option>
          {/each}
        </select>
      </label>
    </div>

    {#if sourceLinks[activeSource]}
      <a
        href={sourceLinks[activeSource]}
        target="_blank"
        rel="noopener noreferrer"
        class="source-link"
      >
        View on {sourceLabels[activeSource]} <span aria-hidden="true">↗</span>
      </a>
    {/if}
  </div>

  <div class="period-navigation" aria-label="Selected activity period">
    {#if activeRange !== "all"}
      <button
        type="button"
        class="period-button"
        onclick={() => movePeriod(-1)}
        disabled={!canGoBack}
        aria-label={`Previous ${activeRange}`}
      >
        <span aria-hidden="true">←</span>
      </button>
    {/if}

    <div class="period-heading">
      <strong>{periodLabel}</strong>
      {#if !latestPeriod}
        <button type="button" class="latest-button" onclick={goToLatest}
          >Latest</button
        >
      {/if}
    </div>

    {#if activeRange !== "all"}
      <button
        type="button"
        class="period-button"
        onclick={() => movePeriod(1)}
        disabled={latestPeriod}
        aria-label={`Next ${activeRange}`}
      >
        <span aria-hidden="true">→</span>
      </button>
    {/if}
  </div>

  {#if loading}
    <div
      class="loading-state"
      aria-live="polite"
      aria-label={`Loading ${sourceLabels[activeSource]} activity`}
    >
      <div class="skeleton-summary"></div>
      <div class="skeleton-chart">
        {#each [32, 58, 41, 76, 52, 88, 63, 45, 70, 54, 81, 68] as height, index (index)}
          <span style={`height: ${height}%`}></span>
        {/each}
      </div>
    </div>
  {:else if error}
    <div class="error-state" role="alert">
      <p>{error}</p>
      <button type="button" onclick={() => loadSource(activeSource, true)}
        >Try again</button
      >
    </div>
  {:else if visibleActivity}
    <div class="period-summary" aria-live="polite">
      <p class="period-total">{formatPeriodTotal(activeSource, periodTotal)}</p>
      <ul>
        <li>
          {activeDays.toLocaleString()} active {activeDays === 1
            ? "day"
            : "days"}
        </li>
        {#if comparison}
          <li>{comparison}</li>
        {/if}
        {#if bestBucket && bestBucket.value > 0 && buckets.length > 1}
          <li>
            Best {activeGrain}: {bestBucket.shortLabel} · {formatCompactValue(
              activeSource,
              bestBucket.value,
            )}
          </li>
        {/if}
      </ul>
    </div>

    {#if periodTotal === 0}
      <div class="empty-state" role="status">
        No recorded {selectLabels[activeSource].toLowerCase()} activity in this period.
      </div>
    {:else if currentChart === "calendar"}
      <div class="chart-scroll calendar-scroll">
        <div
          class="calendar-chart"
          role="group"
          aria-label={`${periodLabel}, daily ${selectLabels[activeSource]} activity`}
        >
          <div class="calendar-weekdays" aria-hidden="true">
            {#each ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as weekday (weekday)}
              <span>{weekday}</span>
            {/each}
          </div>
          <div class="calendar-grid">
            {#each Array(calendarOffset) as _, index (`blank-${index}`)}
              <span class="calendar-blank" aria-hidden="true"></span>
            {/each}
            {#each periodDays as day (day.date)}
              <span
                class="calendar-day"
                role="img"
                tabindex="0"
                title={`${formatValue(activeSource, day.count)} on ${day.date}`}
                aria-label={`${formatValue(activeSource, day.count)} on ${day.date}`}
                style={`--day-color: ${colorScale[relativeLevel(day.count, maximumBucketValue)]}`}
              >
                <span class="calendar-date">{Number(day.date.slice(-2))}</span>
                {#if day.count > 0}
                  <span class="calendar-value"
                    >{formatCompactValue(activeSource, day.count)}</span
                  >
                {/if}
              </span>
            {/each}
          </div>
          <div
            class="calendar-legend"
            aria-label="Relative activity intensity, lower to higher"
          >
            <span>Lower</span>
            {#each colorScale as color, index (index)}
              <span
                class="legend-swatch"
                style={`background: ${color}`}
                aria-hidden="true"
              ></span>
            {/each}
            <span>Higher</span>
          </div>
        </div>
      </div>
    {:else if currentChart === "trend"}
      <div class="chart-scroll">
        <div
          class="trend-chart"
          style={`--bucket-count: ${buckets.length}`}
          role="group"
          aria-label={`${periodLabel}, ${grainLabel.toLowerCase()} ${selectLabels[activeSource]} trend`}
        >
          <span class="guide guide-high" aria-hidden="true"></span>
          <span class="guide guide-mid" aria-hidden="true"></span>
          <span class="guide guide-low" aria-hidden="true"></span>
          <svg
            viewBox="0 0 1000 240"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <path class="trend-area" d={areaPath}></path>
            <path class="trend-line" d={linePath}></path>
          </svg>
          <div class="trend-points">
            {#each points as point (point.bucket.key)}
              <span
                class="trend-point"
                role="img"
                tabindex="0"
                title={pointLabel(point.bucket)}
                aria-label={pointLabel(point.bucket)}
                style={`left: ${point.xPercent}%; top: ${point.yPercent}%`}
              >
                <span
                  >{formatCompactValue(activeSource, point.bucket.value)}</span
                >
              </span>
            {/each}
          </div>
          <div class="trend-labels" aria-hidden="true">
            {#each buckets as bucket (bucket.key)}
              <span>{bucket.shortLabel}</span>
            {/each}
          </div>
        </div>
      </div>
    {:else if currentChart === "history"}
      <div
        class="history-chart"
        role="group"
        aria-label={`Yearly ${selectLabels[activeSource]} history`}
      >
        {#each buckets as bucket (bucket.key)}
          <span
            class="history-row"
            role="img"
            tabindex="0"
            title={pointLabel(bucket)}
            aria-label={pointLabel(bucket)}
          >
            <span class="history-label">{bucket.shortLabel}</span>
            <span class="history-track" aria-hidden="true">
              <span
                style={`width: ${barHeight(bucket.value, maximumBucketValue)}%`}
              ></span>
            </span>
            <span class="history-value"
              >{formatCompactValue(activeSource, bucket.value)}</span
            >
          </span>
        {/each}
      </div>
    {:else}
      <div class="chart-scroll">
        <div
          class="column-chart"
          style={`--bucket-count: ${buckets.length}`}
          role="group"
          aria-label={`${periodLabel}, ${grainLabel.toLowerCase()} ${selectLabels[activeSource]} totals`}
        >
          {#each buckets as bucket (bucket.key)}
            <span
              class="column-item"
              role="img"
              tabindex="0"
              title={pointLabel(bucket)}
              aria-label={pointLabel(bucket)}
            >
              <span class="column-value"
                >{formatCompactValue(activeSource, bucket.value)}</span
              >
              <span class="column-track" aria-hidden="true">
                <span
                  class="column-fill"
                  style={`height: ${barHeight(bucket.value, maximumBucketValue)}%`}
                ></span>
              </span>
              <span class="column-label">{bucket.shortLabel}</span>
            </span>
          {/each}
        </div>
      </div>
    {/if}

    <div class="activity-footer">
      <span>{grainLabel} totals · Europe/Lisbon calendar</span>
      <span
        >{formatLifetime(
          activeSource,
          visibleActivity.total,
          visibleActivity.startYear,
        )}</span
      >
    </div>
  {/if}
</div>

<style>
  :global(:root) {
    --activity-level-0: var(--bg-secondary);
    --activity-level-1: color-mix(
      in srgb,
      var(--link-color) 20%,
      var(--background-color)
    );
    --activity-level-2: color-mix(
      in srgb,
      var(--link-color) 42%,
      var(--background-color)
    );
    --activity-level-3: color-mix(
      in srgb,
      var(--link-color) 68%,
      var(--background-color)
    );
    --activity-level-4: var(--link-color);
  }

  .activity-explorer {
    container-type: inline-size;
    margin: 1.5rem 0;
    font-variant-numeric: tabular-nums;
  }

  .explorer-toolbar {
    display: flex;
    align-items: end;
    justify-content: space-between;
    gap: 1rem;
  }

  .controls {
    display: flex;
    flex: 1;
    align-items: end;
    gap: 0.75rem;
  }

  .control {
    display: grid;
    min-width: 7.5rem;
    gap: 0.25rem;
  }

  .control-source {
    min-width: 8.5rem;
  }

  .control > span {
    color: var(--gray-color);
    font-family: var(--font-family-mono);
    font-size: 0.72rem;
    line-height: 1.2;
  }

  select {
    width: 100%;
    min-height: 2.75rem;
    padding: 0.45rem 1.8rem 0.45rem 0.65rem;
    border: 1px solid var(--border-color);
    border-radius: 0.35rem;
    background: var(--background-color);
    color: var(--text-color);
    font: inherit;
    font-size: 0.9rem;
    cursor: pointer;
  }

  select:hover:not(:disabled) {
    border-color: var(--link-color);
  }

  select:disabled {
    cursor: default;
    opacity: 0.65;
  }

  .source-link {
    display: inline-flex;
    min-height: 2.75rem;
    align-items: center;
    gap: 0.3rem;
    color: var(--link-color);
    font-size: 0.8rem;
    white-space: nowrap;
  }

  .period-navigation {
    display: grid;
    grid-template-columns: 2.75rem minmax(0, 1fr) 2.75rem;
    align-items: center;
    gap: 0.5rem;
    margin-top: 1.5rem;
  }

  .period-navigation:has(.period-heading:first-child) {
    grid-template-columns: 1fr;
  }

  .period-button,
  .latest-button,
  .error-state button {
    min-height: 2.75rem;
    border: 1px solid var(--border-color);
    border-radius: 0.35rem;
    background: transparent;
    color: var(--text-color);
    cursor: pointer;
  }

  .period-button {
    width: 2.75rem;
    padding: 0;
    font-family: var(--font-family-mono);
    font-size: 1rem;
  }

  .period-button:hover:not(:disabled),
  .latest-button:hover,
  .error-state button:hover {
    border-color: var(--link-color);
    color: var(--link-color);
  }

  .period-button:disabled {
    cursor: default;
    opacity: 0.3;
  }

  .period-heading {
    display: flex;
    min-width: 0;
    align-items: center;
    justify-content: center;
    gap: 0.65rem;
    text-align: center;
  }

  .period-heading strong {
    overflow: hidden;
    font-size: 1.05rem;
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .latest-button {
    min-height: 2rem;
    padding: 0.2rem 0.55rem;
    color: var(--link-color);
    font-size: 0.75rem;
  }

  .period-summary {
    margin: 1.25rem 0 1rem;
  }

  .period-total {
    margin: 0;
    color: var(--heading-color);
    font-size: 1.25rem;
    font-weight: 600;
    line-height: 1.25;
  }

  .period-summary ul {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem 0.65rem;
    margin: 0.45rem 0 0;
    padding: 0;
    color: var(--gray-color);
    font-size: 0.82rem;
    line-height: 1.4;
    list-style: none;
  }

  .period-summary li + li::before {
    margin-right: 0.65rem;
    content: "·";
  }

  .chart-scroll {
    max-width: 100%;
    overflow-x: auto;
    overflow-y: hidden;
    padding: 0.35rem 0 0.6rem;
    scrollbar-color: var(--border-color) transparent;
    scrollbar-width: thin;
  }

  .calendar-chart {
    width: min(100%, 31rem);
    min-width: 22rem;
    margin-inline: auto;
  }

  .calendar-weekdays,
  .calendar-grid {
    display: grid;
    grid-template-columns: repeat(7, minmax(2.75rem, 1fr));
    gap: 0.35rem;
  }

  .calendar-weekdays {
    margin-bottom: 0.35rem;
    color: var(--gray-color);
    font-family: var(--font-family-mono);
    font-size: 0.66rem;
    text-align: center;
  }

  .calendar-day,
  .calendar-blank {
    aspect-ratio: 1;
    min-width: 2.75rem;
  }

  .calendar-day {
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    padding: 0.35rem;
    border: 1px solid
      color-mix(in srgb, var(--day-color) 75%, var(--border-color));
    border-radius: 0.35rem;
    background: var(--day-color);
    color: var(--heading-color);
    cursor: default;
    line-height: 1;
    transition:
      border-color 0.16s ease,
      transform 0.16s ease;
  }

  .calendar-date {
    font-family: var(--font-family-mono);
    font-size: 0.68rem;
  }

  .calendar-value {
    overflow: hidden;
    font-size: 0.72rem;
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .calendar-legend {
    display: flex;
    align-items: center;
    justify-content: end;
    gap: 0.25rem;
    margin-top: 0.65rem;
    color: var(--gray-color);
    font-family: var(--font-family-mono);
    font-size: 0.64rem;
  }

  .legend-swatch {
    width: 0.65rem;
    height: 0.65rem;
    border-radius: 0.15rem;
  }

  .column-chart {
    display: grid;
    grid-template-columns: repeat(var(--bucket-count), minmax(2.75rem, 1fr));
    min-width: max(100%, calc(var(--bucket-count) * 3.25rem));
    height: 15rem;
    gap: 0.5rem;
    padding-top: 1rem;
  }

  .column-item {
    display: grid;
    grid-template-rows: 1.25rem minmax(0, 1fr) 1.5rem;
    min-width: 2.75rem;
    color: var(--gray-color);
    cursor: default;
    text-align: center;
  }

  .column-value,
  .column-label {
    overflow: hidden;
    font-family: var(--font-family-mono);
    font-size: 0.65rem;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .column-track {
    display: flex;
    align-items: end;
    justify-content: center;
    border-bottom: 1px solid var(--border-color);
  }

  .column-fill {
    width: min(70%, 2rem);
    min-height: 1px;
    border-radius: 0.25rem 0.25rem 0 0;
    background: var(--link-color);
    transition: height 0.35s cubic-bezier(0.22, 1, 0.36, 1);
  }

  .trend-chart {
    position: relative;
    min-width: max(100%, calc(var(--bucket-count) * 2.9rem));
    height: 16rem;
    padding-bottom: 2rem;
  }

  .trend-chart svg {
    position: absolute;
    inset: 0 0 2rem;
    width: 100%;
    height: calc(100% - 2rem);
    overflow: visible;
  }

  .trend-area {
    fill: color-mix(in srgb, var(--link-color) 14%, transparent);
  }

  .trend-line {
    fill: none;
    stroke: var(--link-color);
    stroke-linecap: round;
    stroke-linejoin: round;
    stroke-width: 5;
    vector-effect: non-scaling-stroke;
  }

  .guide {
    position: absolute;
    right: 0;
    left: 0;
    height: 1px;
    background: var(--border-color);
    pointer-events: none;
  }

  .guide-high {
    top: 18%;
  }

  .guide-mid {
    top: 48%;
  }

  .guide-low {
    top: 78%;
  }

  .trend-points {
    position: absolute;
    inset: 0 0 2rem;
  }

  .trend-point {
    position: absolute;
    display: grid;
    width: 2.75rem;
    height: 2.75rem;
    place-items: center;
    border-radius: 50%;
    color: transparent;
    cursor: default;
    transform: translate(-50%, -50%);
  }

  .trend-point::before {
    width: 0.6rem;
    height: 0.6rem;
    border: 2px solid var(--background-color);
    border-radius: 50%;
    background: var(--link-color);
    content: "";
    box-shadow: 0 0 0 1px var(--link-color);
  }

  .trend-point > span {
    position: absolute;
    bottom: calc(100% - 0.2rem);
    left: 50%;
    z-index: 2;
    display: none;
    padding: 0.2rem 0.35rem;
    border-radius: 0.25rem;
    background: var(--heading-color);
    color: var(--background-color);
    font-family: var(--font-family-mono);
    font-size: 0.65rem;
    white-space: nowrap;
    transform: translateX(-50%);
  }

  .trend-point:hover > span,
  .trend-point:focus-visible > span {
    display: block;
  }

  .trend-labels {
    position: absolute;
    right: 0;
    bottom: 0;
    left: 0;
    display: grid;
    grid-template-columns: repeat(var(--bucket-count), minmax(0, 1fr));
    gap: 0.25rem;
    color: var(--gray-color);
    font-family: var(--font-family-mono);
    font-size: 0.62rem;
    text-align: center;
  }

  .trend-labels span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .history-chart {
    display: grid;
    gap: 0.35rem;
    padding: 0.6rem 0;
  }

  .history-row {
    display: grid;
    grid-template-columns: 4rem minmax(4rem, 1fr) minmax(4.5rem, auto);
    min-height: 2.75rem;
    align-items: center;
    gap: 0.75rem;
    color: var(--text-color);
    cursor: default;
  }

  .history-label,
  .history-value {
    font-family: var(--font-family-mono);
    font-size: 0.75rem;
  }

  .history-value {
    text-align: right;
  }

  .history-track {
    height: 0.55rem;
    overflow: hidden;
    border-radius: 0.25rem;
    background: var(--bg-secondary);
  }

  .history-track > span {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: var(--link-color);
    transition: width 0.35s cubic-bezier(0.22, 1, 0.36, 1);
  }

  .activity-footer {
    display: flex;
    justify-content: space-between;
    gap: 0.75rem;
    margin-top: 0.75rem;
    padding-top: 0.65rem;
    border-top: 1px solid var(--border-color);
    color: var(--gray-color);
    font-size: 0.72rem;
    line-height: 1.4;
  }

  .empty-state,
  .error-state {
    display: grid;
    min-height: 10rem;
    place-items: center;
    padding: 1rem;
    border-block: 1px solid var(--border-color);
    color: var(--gray-color);
    font-size: 0.9rem;
    text-align: center;
  }

  .error-state {
    align-content: center;
    gap: 0.75rem;
  }

  .error-state p {
    margin: 0;
  }

  .error-state button {
    padding: 0.45rem 0.75rem;
  }

  .loading-state {
    padding: 1.25rem 0 0.75rem;
  }

  .skeleton-summary {
    width: 11rem;
    height: 1.5rem;
    margin-bottom: 1rem;
    border-radius: 0.25rem;
    background: var(--bg-secondary);
  }

  .skeleton-chart {
    display: flex;
    height: 12rem;
    align-items: end;
    gap: 0.5rem;
    border-bottom: 1px solid var(--border-color);
  }

  .skeleton-chart span {
    flex: 1;
    border-radius: 0.25rem 0.25rem 0 0;
    background: var(--bg-secondary);
    animation: skeleton-pulse 1.4s ease-in-out infinite alternate;
  }

  .calendar-day:focus-visible,
  .column-item:focus-visible,
  .trend-point:focus-visible,
  .history-row:focus-visible {
    outline: 2px solid var(--link-color);
    outline-offset: 2px;
  }

  @media (hover: hover) and (pointer: fine) {
    .calendar-day:hover {
      border-color: var(--link-color);
      transform: translateY(-2px);
    }

    .column-item:hover,
    .history-row:hover {
      color: var(--heading-color);
    }
  }

  @container (max-width: 34rem) {
    .explorer-toolbar {
      display: grid;
    }

    .controls {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    }

    .control {
      min-width: 0;
    }

    .control-source {
      grid-column: 1 / -1;
    }

    .source-link {
      width: fit-content;
    }

    .period-navigation {
      margin-top: 1.25rem;
    }

    .period-summary ul {
      display: grid;
      gap: 0.2rem;
    }

    .period-summary li + li::before {
      margin-right: 0.4rem;
    }

    .chart-scroll {
      width: calc(100% + var(--page-padding) + var(--page-padding));
      max-width: none;
      margin-inline: calc(var(--page-padding) * -1);
      padding-inline: var(--page-padding);
    }

    .activity-footer {
      display: grid;
      gap: 0.25rem;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .calendar-day,
    .column-fill,
    .history-track > span {
      transition: none;
    }

    .skeleton-chart span {
      animation: none;
    }
  }

  @keyframes skeleton-pulse {
    from {
      opacity: 0.45;
    }
    to {
      opacity: 1;
    }
  }
</style>
