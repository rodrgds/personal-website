<script lang="ts">
  import {
    formatAmount,
    formatCompact,
    formatValue,
    type ActivitySource,
  } from "./metrics";
  import type { ActivityBucket } from "./periods";

  interface Props {
    buckets: ActivityBucket[];
    source: ActivitySource;
    today: string;
    onOpen: ((bucket: ActivityBucket) => void) | null;
  }

  let { buckets, source, today, onOpen }: Props = $props();

  let pointed = $state<string | null>(null);
  let maximum = $derived(Math.max(0, ...buckets.map((bucket) => bucket.value)));
  // The readout names the column under the pointer, or the latest one.
  let shown = $derived(
    buckets.find((bucket) => bucket.key === pointed) ?? buckets.at(-1),
  );

  function height(value: number): number {
    if (value <= 0 || maximum <= 0) return 0;
    return Math.max(2, (value / maximum) * 100);
  }

  /** Years label the axis where they start; a stub first year stays blank. */
  let yearMarks = $derived.by(() => {
    const starts = buckets.flatMap((bucket, index) =>
      index === 0 ||
      buckets[index - 1].start.slice(0, 4) !== bucket.start.slice(0, 4)
        ? [index]
        : [],
    );
    if (starts.length > 1 && starts[1] - starts[0] < 5) starts.shift();
    return new Set(starts);
  });

  function describe(bucket: ActivityBucket): string {
    const running = bucket.start <= today && today <= bucket.end;
    return `${bucket.label}: ${formatValue(source, bucket.value)}, ${bucket.activeDays} of ${bucket.days} days active${running ? ", so far" : ""}`;
  }
</script>

<div class="columns">
  <p class="readout" aria-live="polite">
    {#if shown}
      <span class="when">{shown.label}</span>
      <span>{formatValue(source, shown.value)}</span>
      <span class="days">{shown.activeDays}/{shown.days} days</span>
    {/if}
  </p>
  <div class="plot">
    <span class="peak" aria-hidden="true">{formatCompact(source, maximum)}</span>
    <ol style={`--count: ${buckets.length}`}>
      {#each buckets as bucket, index (bucket.key)}
        {@const mark = yearMarks.has(index) ? bucket.start.slice(0, 4) : null}
        <li class:marked={mark !== null}>
          <button
            type="button"
            class="col"
            class:best={bucket.value === maximum && maximum > 0}
            disabled={!onOpen}
            aria-label={describe(bucket)}
            title={`${bucket.label}: ${formatAmount(source, bucket.value)}`}
            onpointerenter={() => (pointed = bucket.key)}
            onpointerleave={() => (pointed = null)}
            onfocus={() => (pointed = bucket.key)}
            onblur={() => (pointed = null)}
            onclick={() => onOpen?.(bucket)}
          >
            <span class="fill" style={`height: ${height(bucket.value)}%`}
            ></span>
          </button>
          {#if mark}
            <span class="year" aria-hidden="true">{mark}</span>
          {/if}
        </li>
      {/each}
    </ol>
  </div>
</div>

<style>
  .columns {
    padding: 0.6rem 0.9rem 0.4rem;
    font-variant-numeric: tabular-nums;
  }

  .readout {
    display: flex;
    flex-wrap: wrap;
    gap: 0 2ch;
    min-height: 1.5em;
    margin: 0 0 0.5rem;
  }

  .when {
    color: var(--tc-date);
  }

  .days {
    color: var(--gray-color);
  }

  .plot {
    position: relative;
    padding-top: 1.1rem;
  }

  .peak {
    position: absolute;
    top: 0;
    left: 0;
    color: var(--gray-color);
    font-size: 0.7rem;
  }

  ol {
    display: grid;
    height: 9rem;
    grid-template-columns: repeat(var(--count), minmax(0, 1fr));
    gap: 1px;
    align-items: stretch;
    margin: 0 0 1.3rem;
    padding: 0;
    border-top: 1px dashed var(--border-color);
    border-bottom: 1px solid var(--border-color);
    list-style: none;
  }

  li {
    position: relative;
    min-width: 0;
    margin: 0;
  }

  /* A tick where each year starts. */
  li.marked::before {
    position: absolute;
    bottom: -0.35rem;
    left: 0;
    height: 0.3rem;
    border-left: 1px solid var(--border-color);
    content: "";
  }

  .col {
    display: flex;
    width: 100%;
    height: 100%;
    align-items: flex-end;
    padding: 0;
    border: 0;
    background: transparent;
    cursor: pointer;
  }

  .col:disabled {
    cursor: default;
  }

  .col:hover,
  .col:focus-visible {
    background: var(--tc-selection);
  }

  .col:focus-visible {
    outline: 1px solid var(--accent);
    outline-offset: 0;
  }

  /* Stacked blocks, like a column of █ in a terminal. */
  .fill {
    width: 100%;
    background: repeating-linear-gradient(
      to top,
      var(--metric) 0 5px,
      transparent 5px 6px
    );
  }

  .col:hover .fill,
  .col:focus-visible .fill,
  .best .fill {
    background: var(--metric);
  }

  .year {
    position: absolute;
    top: calc(100% + 0.35rem);
    left: 0;
    color: var(--gray-color);
    font-size: 0.7rem;
    white-space: nowrap;
  }

  @media (max-width: 480px) {
    .columns {
      padding-inline: 0.6rem;
    }
  }
</style>
