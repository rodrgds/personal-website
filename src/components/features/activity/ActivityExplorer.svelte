<script lang="ts">
  import { actions } from "astro:actions";
  import { onMount, untrack } from "svelte";

  import ActivityCalendar from "./ActivityCalendar.svelte";
  import ActivityColumns from "./ActivityColumns.svelte";
  import ActivityRows from "./ActivityRows.svelte";
  import {
    METRICS,
    METRIC_ORDER,
    formatAmount,
    formatLifetime,
    formatValue,
    isActivitySource,
    type ActivitySource,
  } from "./metrics";
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
    type ActivityWeek,
    type TimeGrain,
    type TimeRange,
  } from "./periods";

  interface ActivityData {
    contributions: ActivityWeek[];
    total: number;
    startYear: number;
  }

  const today = todayInTimeZone();
  const GRAINS: TimeGrain[] = ["day", "week", "month", "quarter", "year"];

  let source = $state<ActivitySource>("github");
  let range = $state<TimeRange>("year");
  let grain = $state<TimeGrain>("month");
  let anchor = $state(today);
  // Raw: each feed holds a few thousand days that are only ever read.
  let store = $state.raw(new Map<ActivitySource, ActivityData>());
  let loading = $state(true);
  let error = $state<string | null>(null);

  function isTimeRange(value: string | null): value is TimeRange {
    return RANGE_OPTIONS.some((option) => option.value === value);
  }

  function isTimeGrain(value: string | null): value is TimeGrain {
    return GRAINS.some((option) => option === value);
  }

  function isDate(value: string | null): value is string {
    return (
      value !== null &&
      /^\d{4}-\d{2}-\d{2}$/.test(value) &&
      !Number.isNaN(Date.parse(`${value}T00:00:00Z`))
    );
  }

  // The view lives in the URL, so it survives a reload and can be shared.
  function writeUrl(): void {
    const url = new URL(window.location.href);
    url.searchParams.set("activity", source);
    url.searchParams.set("range", range);
    url.searchParams.set("group", grain);
    if (range === "all" || isLatestPeriod(range, anchor, today)) {
      url.searchParams.delete("period");
    } else {
      url.searchParams.set("period", anchor);
    }
    window.history.replaceState(window.history.state, "", url);
  }

  function pickSource(next: ActivitySource): void {
    source = next;
    anchor = today;
    writeUrl();
  }

  function pickRange(next: TimeRange): void {
    range = next;
    grain = DEFAULT_GRAIN[next];
    anchor = today;
    writeUrl();
  }

  function pickGrain(next: TimeGrain): void {
    grain = next;
    writeUrl();
  }

  function move(direction: -1 | 1): void {
    if (range === "all") return;
    anchor = shiftAnchor(range, anchor, direction);
    writeUrl();
  }

  function latest(): void {
    anchor = today;
    writeUrl();
  }

  /** A row or column opens as its own period, one step finer. */
  function open(bucket: ActivityBucket): void {
    if (grain === "day") return;
    range = grain;
    grain = DEFAULT_GRAIN[grain];
    anchor = bucket.start > today ? today : bucket.start;
    writeUrl();
  }

  async function load(next: ActivitySource, force = false): Promise<void> {
    if (store.has(next) && !force) {
      if (source === next) loading = false;
      return;
    }
    if (source === next) {
      loading = !store.has(next);
      error = null;
    }
    try {
      const result = await actions.getActivityData({
        source: next,
        forceRefresh: force,
      });
      if (result.error) throw new Error(result.error.message);
      store = new Map(store).set(next, result.data);
    } catch (caught) {
      console.error(`activity: could not load ${next}`, caught);
      if (source === next) {
        error = caught instanceof Error ? caught.message : "request failed";
      }
    } finally {
      if (source === next) loading = false;
    }
  }

  onMount(() => {
    const params = new URL(window.location.href).searchParams;
    const requestedSource = params.get("activity");
    const requestedRange = params.get("range");
    const requestedGrain = params.get("group");
    const requestedPeriod = params.get("period");

    if (isActivitySource(requestedSource)) source = requestedSource;
    if (isTimeRange(requestedRange)) range = requestedRange;
    const allowed = GRAIN_OPTIONS[range].map((option) => option.value);
    grain =
      isTimeGrain(requestedGrain) && allowed.includes(requestedGrain)
        ? requestedGrain
        : DEFAULT_GRAIN[range];
    if (isDate(requestedPeriod) && requestedPeriod <= today) {
      anchor = requestedPeriod;
    }

    const refresh = window.setInterval(
      () => void load(source, true),
      60 * 60 * 1000,
    );
    return () => window.clearInterval(refresh);
  });

  $effect(() => {
    const next = source;
    untrack(() => void load(next));
  });

  let metric = $derived(METRICS[source]);
  let data = $derived(store.get(source));
  let allDays = $derived(
    data ? flattenActivityWeeks(data.contributions, data.startYear, today) : [],
  );
  let earliest = $derived(
    allDays.find((day) => day.count > 0)?.date ??
      `${data?.startYear ?? today.slice(0, 4)}-01-01`,
  );
  let period = $derived(
    getPeriod(range, anchor < earliest ? earliest : anchor, earliest, today),
  );
  let periodDays = $derived(selectDays(allDays, period));
  let buckets = $derived(aggregateActivity(periodDays, grain, range));
  let chart = $derived(chooseChartKind(range, grain, buckets.length));
  let total = $derived(periodDays.reduce((sum, day) => sum + day.count, 0));
  let activeDays = $derived(periodDays.filter((day) => day.count > 0).length);
  let previous = $derived(
    previousComparablePeriod(range, period, earliest),
  );
  let previousTotal = $derived(
    previous
      ? selectDays(allDays, previous).reduce((sum, day) => sum + day.count, 0)
      : 0,
  );
  // Rows and the calendar print every value; only the columns need the best named.
  let best = $derived(
    chart === "columns"
      ? buckets.reduce<ActivityBucket | null>(
          (top, bucket) =>
            bucket.value > 0 && (!top || bucket.value > top.value)
              ? bucket
              : top,
          null,
        )
      : null,
  );
  let atLatest = $derived(isLatestPeriod(range, anchor, today));
  let canGoBack = $derived(canMoveBackward(range, anchor, earliest));
  let periodLabel = $derived(formatPeriodLabel(range, period));
  // A period still running is compared with the same number of days before it.
  let change = $derived.by((): string | null => {
    if (!previous || range === "all") return null;
    if (previousTotal === 0) return total > 0 ? "new" : null;
    const percent = Math.round(((total - previousTotal) / previousTotal) * 100);
    if (percent === 0) return "level";
    return `${percent > 0 ? "▲" : "▼"} ${Math.abs(percent)}%`;
  });
  let command = $derived(
    `activity ${metric.label} --${range} --by ${grain}`,
  );
</script>

<section
  class="win"
  aria-labelledby="activity-title"
  style={`--metric: ${metric.colour}`}
>
  <h2 class="win-title" id="activity-title">{command}</h2>

  <div class="opts">
    <div class="opt" role="group" aria-label="metric">
      <span class="opt-name">metric</span>
      <span class="opt-buttons">
      {#each METRIC_ORDER as key (key)}
        <button
          type="button"
          style={`--kind: ${METRICS[key].colour}`}
          aria-pressed={source === key}
          onclick={() => pickSource(key)}>{METRICS[key].label}</button
        >
      {/each}
      </span>
    </div>
    <div class="opt" role="group" aria-label="range">
      <span class="opt-name">range</span>
      <span class="opt-buttons">
      {#each RANGE_OPTIONS as option (option.value)}
        <button
          type="button"
          aria-pressed={range === option.value}
          onclick={() => pickRange(option.value)}>{option.label}</button
        >
      {/each}
      </span>
    </div>
    <div class="opt" role="group" aria-label="group by">
      <span class="opt-name">by</span>
      <span class="opt-buttons">
      {#each GRAIN_OPTIONS[range] as option (option.value)}
        <button
          type="button"
          aria-pressed={grain === option.value}
          onclick={() => pickGrain(option.value)}>{option.label}</button
        >
      {/each}
      </span>
    </div>
  </div>

  <div class="period">
    {#if range !== "all"}
      <button
        type="button"
        class="step"
        disabled={!canGoBack}
        aria-label={`previous ${range}`}
        onclick={() => move(-1)}>‹</button
      >
    {/if}
    <span class="period-label" aria-live="polite">{periodLabel}</span>
    {#if range !== "all"}
      <button
        type="button"
        class="step"
        disabled={atLatest}
        aria-label={`next ${range}`}
        onclick={() => move(1)}>›</button
      >
    {/if}
    {#if !atLatest}
      <button type="button" class="latest" onclick={latest}>latest</button>
    {/if}
  </div>

  <div class="body">
    {#if loading}
      <p class="note" role="status">
        <span class="ascii-spinner" aria-hidden="true">⠋</span>
        reading {metric.service}
      </p>
    {:else if error}
      <div class="note" role="alert">
        <span class="err">error:</span>
        {error}
        <button type="button" class="latest" onclick={() => load(source, true)}
          >retry</button
        >
      </div>
    {:else if data && total === 0}
      <p class="note">no {metric.label} logged in {periodLabel}</p>
    {:else if data && chart === "calendar"}
      <ActivityCalendar {period} days={periodDays} {source} {today} />
    {:else if data && chart === "columns"}
      <ActivityColumns
        {buckets}
        {source}
        {today}
        onOpen={grain === "day" ? null : open}
      />
    {:else if data}
      <ActivityRows
        {buckets}
        {source}
        {grain}
        {today}
        onOpen={grain === "day" ? null : open}
      />
    {/if}
  </div>

  {#if data && !loading && !error}
    <div class="status">
      <p>
        <span><b>logged:</b> {formatValue(source, total)}</span>
        <span
          ><b>active:</b>
          {activeDays}/{periodDays.length} days</span
        >
        {#if activeDays > 0}
          <span
            ><b>per active day:</b>
            {formatAmount(source, total / activeDays)}</span
          >
        {/if}
        {#if best}
          <span
            ><b>best {grain}:</b>
            {best.shortLabel}, {formatAmount(source, best.value)}</span
          >
        {/if}
        {#if change}
          <span
            ><b>vs prev {range}:</b>
            {change}{atLatest ? ", same days" : ""}</span
          >
        {/if}
      </p>
      <p>
        <span
          ><b>lifetime:</b>
          {formatLifetime(source, data.total)} since {data.startYear}</span
        >
        <span
          ><b>source:</b>
          {#if metric.href}
            <a href={metric.href} target="_blank" rel="noopener noreferrer"
              >{metric.service}</a
            >
          {:else}
            {metric.service}
          {/if}</span
        >
      </p>
    </div>
  {/if}
</section>

<style>
  .win {
    min-width: 0;
    margin: 0 0 1.2rem;
    border: 1px solid var(--border-color);
    background: var(--term-panel);
    font-size: 0.8rem;
    font-variant-numeric: tabular-nums;
  }

  .win-title {
    display: flex;
    gap: 0.6rem;
    align-items: center;
    margin: 0;
    padding: 0.35rem 0.75rem;
    border-bottom: 1px solid var(--border-color);
    color: var(--gray-color);
    font-size: 0.76rem;
    font-weight: 400;
    letter-spacing: 0;
    overflow-wrap: anywhere;
  }

  .win-title::before {
    color: var(--metric);
    content: "■";
    font-size: 0.6rem;
  }

  /* Choices are terminal buttons, like the CV filters. */
  .opts {
    display: grid;
    gap: 0.35rem;
    padding: 0.6rem 0.9rem;
    border-bottom: 1px solid var(--border-color);
  }

  .opt {
    display: grid;
    grid-template-columns: 7ch minmax(0, 1fr);
    gap: 1ch;
    align-items: baseline;
  }

  .opt-name {
    color: var(--tc-tag);
  }

  .opt-buttons {
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem;
  }

  button {
    font: inherit;
  }

  .opt button,
  .step,
  .latest {
    padding: 0.05rem 0.45rem;
    border: 1px solid var(--border-color);
    border-radius: 0;
    background: transparent;
    color: var(--kind, var(--text-color));
    cursor: pointer;
  }

  .opt button:hover,
  .step:hover:not(:disabled),
  .latest:hover {
    border-color: var(--kind, var(--heading-color));
  }

  .opt button[aria-pressed="true"] {
    border-color: var(--kind, var(--heading-color));
    background: var(--kind, var(--heading-color));
    color: var(--background-color);
  }

  .opt button:focus-visible,
  .step:focus-visible,
  .latest:focus-visible {
    outline: 1px solid var(--accent);
    outline-offset: 2px;
  }

  .period {
    display: flex;
    gap: 0.6ch;
    align-items: center;
    padding: 0.45rem 0.9rem;
    border-bottom: 1px solid var(--border-color);
  }

  .step {
    min-width: 3ch;
  }

  .step:disabled {
    color: var(--gray-color);
    cursor: default;
    opacity: 0.5;
  }

  .period-label {
    min-width: 0;
    color: var(--tc-date);
    font-weight: 700;
  }

  .latest {
    margin-left: auto;
    color: var(--link-color);
  }

  .note {
    margin: 0;
    padding: 1.2rem 0.9rem;
    color: var(--gray-color);
  }

  .note .latest {
    margin-left: 1ch;
  }

  .err {
    color: var(--flexoki-red);
  }

  /* Totals and the data's origin sit in a status line, like htop's header. */
  .status {
    display: grid;
    gap: 0.15rem;
    padding: 0.5rem 0.9rem;
    border-top: 1px solid var(--border-color);
  }

  .status p {
    display: flex;
    flex-wrap: wrap;
    gap: 0 2.2ch;
    margin: 0;
    color: var(--text-color);
  }

  .status b {
    color: var(--flexoki-cyan);
    font-weight: 400;
  }

  @media (max-width: 480px) {
    .opts,
    .period,
    .status,
    .note {
      padding-inline: 0.6rem;
    }

    .opt {
      grid-template-columns: 6ch minmax(0, 1fr);
    }
  }
</style>
