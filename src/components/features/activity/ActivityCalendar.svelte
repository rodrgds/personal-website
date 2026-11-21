<script lang="ts">
  import { formatCompact, formatValue, type ActivitySource } from "./metrics";
  import { addDays, type ActivityDay, type ActivityPeriod } from "./periods";

  interface Props {
    /** The selected month, clipped to the data's first day and today. */
    period: ActivityPeriod;
    days: ActivityDay[];
    source: ActivitySource;
    today: string;
  }

  interface Cell {
    date: string;
    day: number;
    count: number | null;
    level: number;
    future: boolean;
  }

  let { period, days, source, today }: Props = $props();

  const WEEKDAYS = ["mo", "tu", "we", "th", "fr", "sa", "su"];
  const LEVELS = [0, 1, 2, 3, 4];

  let counts = $derived(new Map(days.map((day) => [day.date, day.count])));
  let maximum = $derived(Math.max(0, ...days.map((day) => day.count)));

  // The whole month, so the grid reads like `cal`; days outside the data stay blank.
  let cells = $derived.by((): Cell[] => {
    const first = `${period.start.slice(0, 8)}01`;
    const result: Cell[] = [];
    for (let date = first; date.slice(0, 7) === first.slice(0, 7); ) {
      const count = counts.get(date) ?? null;
      result.push({
        date,
        day: Number(date.slice(8)),
        count,
        level:
          count && maximum > 0
            ? Math.min(4, Math.max(1, Math.ceil((count / maximum) * 4)))
            : 0,
        future: date > today,
      });
      date = addDays(date, 1);
    }
    return result;
  });
  let offset = $derived(
    (new Date(`${period.start.slice(0, 8)}01T00:00:00Z`).getUTCDay() + 6) % 7,
  );

  function describe(cell: Cell): string {
    if (cell.future) return `${cell.date}: not yet`;
    if (cell.count === null) return `${cell.date}: no data`;
    return `${cell.date}: ${formatValue(source, cell.count)}`;
  }
</script>

<div class="cal">
  <ol class="grid" aria-label="days of the month">
    {#each WEEKDAYS as weekday (weekday)}
      <li class="weekday" aria-hidden="true">{weekday}</li>
    {/each}
    {#each Array.from({ length: offset }, (_, index) => index) as index (index)}
      <li class="blank" aria-hidden="true"></li>
    {/each}
    {#each cells as cell (cell.date)}
      <li
        class="day"
        class:future={cell.future}
        class:missing={cell.count === null && !cell.future}
        class:today={cell.date === today}
        data-level={cell.level}
        title={describe(cell)}
        aria-label={describe(cell)}
      >
        <span class="date">{cell.day}</span>
        {#if cell.count}
          <span class="value">{formatCompact(source, cell.count)}</span>
        {/if}
      </li>
    {/each}
  </ol>
  <p class="legend" aria-hidden="true">
    less
    {#each LEVELS as level (level)}
      <span class="swatch" data-level={level}></span>
    {/each}
    more
  </p>
</div>

<style>
  .cal {
    padding: 0.7rem 0.9rem 0.5rem;
    font-variant-numeric: tabular-nums;
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(7, minmax(0, 1fr));
    gap: 2px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  li {
    margin: 0;
  }

  .weekday {
    padding: 0 0.3rem 0.2rem;
    color: var(--gray-color);
  }

  [data-level="0"] {
    --cell: transparent;
  }

  [data-level="1"] {
    --cell: color-mix(in srgb, var(--metric) 22%, transparent);
  }

  [data-level="2"] {
    --cell: color-mix(in srgb, var(--metric) 45%, transparent);
  }

  [data-level="3"] {
    --cell: color-mix(in srgb, var(--metric) 70%, transparent);
  }

  [data-level="4"] {
    --cell: var(--metric);
  }

  .day {
    display: flex;
    min-height: 2.6rem;
    flex-direction: column;
    justify-content: space-between;
    padding: 0.15rem 0.3rem;
    border: 1px solid var(--border-color);
    background: var(--cell);
    color: var(--text-color);
  }

  .date {
    color: var(--gray-color);
    font-size: 0.7rem;
  }

  .value {
    align-self: flex-end;
    font-weight: 700;
  }

  .day[data-level="3"],
  .day[data-level="4"] {
    color: var(--background-color);
  }

  .day[data-level="3"] .date,
  .day[data-level="4"] .date {
    color: inherit;
    opacity: 0.75;
  }

  .missing,
  .future {
    border-style: dashed;
  }

  .future .date {
    opacity: 0.5;
  }

  .today {
    outline: 1px solid var(--accent);
    outline-offset: 1px;
  }

  .legend {
    display: flex;
    gap: 3px;
    align-items: center;
    justify-content: flex-end;
    margin: 0.5rem 0 0;
    color: var(--gray-color);
    font-size: 0.7rem;
  }

  .swatch {
    width: 0.7rem;
    height: 0.7rem;
    border: 1px solid var(--border-color);
    background: var(--cell);
  }

  .swatch:first-of-type {
    margin-left: 0.4ch;
  }

  .swatch:last-of-type {
    margin-right: 0.4ch;
  }

  @media (max-width: 480px) {
    .cal {
      padding-inline: 0.6rem;
    }

    .day {
      min-height: 2.3rem;
      padding: 0.1rem 0.2rem;
    }

    .value {
      font-size: 0.68rem;
    }
  }
</style>
